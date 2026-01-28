import { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { api } from './api';

export default function App() {
  // Players state
  const [allPlayers, setAllPlayers] = useState([]);
  const [name, setName] = useState('');
  const [trackId, setTrackId] = useState('');
  const [startMs, setStartMs] = useState(0);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editTrackId, setEditTrackId] = useState('');
  const [editStartMs, setEditStartMs] = useState(0);

  // Lineup state
  const [activeLineup, setActiveLineup] = useState([]);
  const [bench, setBench] = useState([]);

  // Game state
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [error, setError] = useState(null);
  const [currentBatter, setCurrentBatter] = useState(null);
  const [currentBatterIndex, setCurrentBatterIndex] = useState(0);
  const [trackNames, setTrackNames] = useState({});

  // Load players and devices on mount
  useEffect(() => {
    loadPlayers();
    loadDevices();
  }, []);

  const loadPlayers = async () => {
    try {
      const res = await api.get('/players');
      const players = res.data;
      setAllPlayers(players);
      
      // Load track names for all players
      const names = {};
      for (const player of players) {
        try {
          const trackRes = await api.get(`/track/${player.spotify_track_id}`);
          console.log(`Track info for ${player.name}:`, trackRes.data);
          const { name, artist } = trackRes.data;
          names[player.spotify_track_id] = artist ? `${name} - ${artist}` : name || 'Unknown Track';
        } catch (err) {
          console.error(`Error loading track name for ${player.spotify_track_id}:`, err.response?.data || err.message);
          names[player.spotify_track_id] = 'Unknown Track';
        }
      }
      setTrackNames(names);
      
      // Initialize lineup with all players if not set, or add new players to bench
      if (activeLineup.length === 0) {
        setActiveLineup(players);
        setBench([]);
      } else {
        // Add any new players to the bench
        const newPlayers = players.filter(p => !activeLineup.find(ap => ap.id === p.id) && !bench.find(bp => bp.id === p.id));
        if (newPlayers.length > 0) {
          setBench([...bench, ...newPlayers]);
        }
      }
    } catch (err) {
      console.error('Error loading players:', err);
    }
  };

  const loadDevices = async () => {
    try {
      const res = await api.get('/devices');
      if (res.data.devices && res.data.devices.length) {
        setDevices(res.data.devices);
        setDeviceId(res.data.devices[0].id);
        setError(null);
      } else {
        setError('No Spotify devices found. Open Spotify first.');
      }
    } catch (err) {
      setError('Please login to Spotify first.');
    }
  };

  const extractTrackId = (input) => {
    // Check if it's a Spotify link or URI
    const match = input.match(/(?:spotify\.com\/track\/|spotify:track:)([a-zA-Z0-9]+)/);
    if (match) {
      return match[1];
    }
    // If not a link, return the input as-is (assume it's already a track ID)
    return input;
  };

  const addPlayer = async () => {
    if (!name.trim() || !trackId.trim()) {
      return alert('Please enter both name and Spotify Track ID');
    }
    setAddingPlayer(true);
    try {
      const extractedId = extractTrackId(trackId.trim());
      await api.post('/players', {
        name: name.trim(),
        spotifyTrackId: extractedId,
        startMs: Number(startMs)
      });
      setName('');
      setTrackId('');
      setStartMs(0);
      await loadPlayers();
    } catch (err) {
      alert('Failed to add player');
    } finally {
      setAddingPlayer(false);
    }
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;

    const sourceId = result.source.droppableId;
    const destId = result.destination.droppableId;

    // Dragging within the same list
    if (sourceId === destId) {
      const list = sourceId === 'active' ? [...activeLineup] : [...bench];
      const [moved] = list.splice(result.source.index, 1);
      list.splice(result.destination.index, 0, moved);
      
      if (sourceId === 'active') setActiveLineup(list);
      else setBench(list);
    } else {
      // Dragging between different lists
      const sourceList = sourceId === 'active' ? [...activeLineup] : [...bench];
      const destList = destId === 'active' ? [...activeLineup] : [...bench];
      
      const [moved] = sourceList.splice(result.source.index, 1);
      destList.splice(result.destination.index, 0, moved);
      
      if (sourceId === 'active') setActiveLineup(sourceList);
      else setBench(sourceList);
      
      if (destId === 'active') setActiveLineup(destList);
      else setBench(destList);
    }
  };

  const saveLineup = async () => {
    try {
      await api.post('/lineup', {
        order: activeLineup.map(p => p.id)
      });
    } catch (err) {
      alert('Failed to save lineup');
    }
  };

  const deletePlayer = async (playerId) => {
    if (!confirm('Are you sure you want to delete this player?')) return;
    
    try {
      await api.delete(`/players/${playerId}`);
      
      // Remove from local state
      setActiveLineup(activeLineup.filter(p => p.id !== playerId));
      setBench(bench.filter(p => p.id !== playerId));
      setAllPlayers(allPlayers.filter(p => p.id !== playerId));
    } catch (err) {
      alert('Failed to delete player');
    }
  };

  const startEditPlayer = (player) => {
    setEditingPlayerId(player.id);
    setEditName(player.name);
    setEditTrackId(player.spotify_track_id);
    setEditStartMs(player.start_ms);
  };

  const cancelEdit = () => {
    setEditingPlayerId(null);
    setEditName('');
    setEditTrackId('');
    setEditStartMs(0);
  };

  const saveEdit = async (playerId) => {
    try {
      const extractedId = extractTrackId(editTrackId.trim());
      await api.put(`/players/${playerId}`, {
        name: editName.trim(),
        spotifyTrackId: extractedId,
        startMs: Number(editStartMs)
      });

      // Update local state
      const updatedPlayer = {
        id: playerId,
        name: editName.trim(),
        spotify_track_id: extractedId,
        start_ms: Number(editStartMs),
        active: 1
      };

      setActiveLineup(activeLineup.map(p => p.id === playerId ? updatedPlayer : p));
      setBench(bench.map(p => p.id === playerId ? updatedPlayer : p));
      setAllPlayers(allPlayers.map(p => p.id === playerId ? updatedPlayer : p));

      // Reload track name if changed
      if (extractedId !== editTrackId) {
        try {
          const trackRes = await api.get(`/track/${extractedId}`);
          const { name, artist } = trackRes.data;
          setTrackNames({
            ...trackNames,
            [extractedId]: artist ? `${name} - ${artist}` : name || 'Unknown Track'
          });
        } catch (err) {
          console.error('Error loading updated track name:', err);
        }
      }

      cancelEdit();
    } catch (err) {
      alert('Failed to update player');
    }
  };

  const nextBatter = async () => {
    if (!deviceId) {
      return alert('No Spotify device selected');
    }
    
    if (activeLineup.length === 0) return;
    
    // Auto-save lineup before playing
    await saveLineup();
    
    try {
      // Get current batter and play directly
      const batter = activeLineup[currentBatterIndex];
      setCurrentBatter(batter.id);
      
      // Play the track directly instead of using /lineup/next
      await api.get(`/play?deviceId=${deviceId}&trackId=${batter.spotify_track_id}&startMs=${batter.start_ms}`);
      
      // Move to next batter in lineup (wrap around to start)
      setCurrentBatterIndex((currentBatterIndex + 1) % activeLineup.length);
    } catch (err) {
      console.error('Error playing next:', err);
      alert('Failed to play next batter');
    }
  };

  const pausePlayback = async () => {
    if (!deviceId) {
      return alert('No Spotify device selected');
    }
    
    try {
      await api.post('/pause', { deviceId });
    } catch (err) {
      console.error('Error pausing:', err);
      alert('Failed to pause playback - make sure you\'re logged into Spotify');
    }
  };

  const resumePlayback = async () => {
    if (!deviceId) {
      return alert('No Spotify device selected');
    }
    
    try {
      await api.post('/play', { deviceId });
    } catch (err) {
      console.error('Error resuming:', err);
      alert('Failed to resume playback - make sure you\'re logged into Spotify');
    }
  };

  const playSpecificBatter = async (playerIndex) => {
    if (!deviceId) {
      return alert('No Spotify device selected');
    }
    
    if (playerIndex < 0 || playerIndex >= activeLineup.length) {
      return;
    }
    
    try {
      const selectedPlayer = activeLineup[playerIndex];
      setCurrentBatter(selectedPlayer.id);
      
      // Update the index so NEXT BATTER continues from this player
      setCurrentBatterIndex((playerIndex + 1) % activeLineup.length);
      
      // Play the track without changing lineup order
      await api.get(`/play?deviceId=${deviceId}&trackId=${selectedPlayer.spotify_track_id}&startMs=${selectedPlayer.start_ms}`);
    } catch (err) {
      console.error('Error playing specific batter:', err);
      alert('Failed to play batter');
    }
  };

  const handleSpotifyLogin = () => {
    const popup = window.open(
      'http://127.0.0.1:3000/login',
      'spotify-login',
      'width=500,height=700,left=100,top=100'
    );

    // Listen for messages from the popup
    const messageHandler = (event) => {
      if (event.data === 'spotify-login-success') {
        // Try to close popup from parent side
        try {
          if (popup && !popup.closed) {
            popup.close();
          }
        } catch (e) {
          console.log('Could not close popup from parent');
        }
        loadDevices(); // Reload devices after successful login
        window.removeEventListener('message', messageHandler);
      }
    };

    window.addEventListener('message', messageHandler);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b-4 border-blue-500 p-4 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Walk-Up Song Manager</h1>
        <button
          onClick={handleSpotifyLogin}
          className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-bold"
        >
          Login to Spotify
        </button>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-4">
        
        {/* Game Control Section */}
        <div className="bg-gray-800 rounded p-4 border-l-4 border-green-500">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold mb-1">Game Control</h2>
              {currentBatter ? (
                <div className="text-lg font-bold text-green-400">
                  Now Playing: {activeLineup.find(p => p.id === currentBatter)?.name}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <label>Device:</label>
                  <select 
                    value={deviceId || ''} 
                    onChange={(e) => setDeviceId(e.target.value)}
                    className="px-2 py-1 rounded bg-gray-700 border border-gray-600"
                  >
                    {devices.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={pausePlayback}
                disabled={!deviceId}
                className={`px-6 py-3 rounded font-bold ${
                  deviceId
                    ? 'bg-yellow-600 hover:bg-yellow-700'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                Pause
              </button>
              <button
                onClick={resumePlayback}
                disabled={!deviceId}
                className={`px-6 py-3 rounded font-bold ${
                  deviceId
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                Play
              </button>
              <button
                onClick={nextBatter}
                disabled={!deviceId || activeLineup.length === 0}
                className={`px-8 py-3 rounded font-bold text-xl ${
                  deviceId && activeLineup.length > 0
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                NEXT BATTER
              </button>
            </div>
          </div>
        </div>

        {/* Lineup Builder */}
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid md:grid-cols-2 gap-4">
            
            {/* Active Lineup */}
            <Droppable droppableId="active">
              {(provided, snapshot) => (
                <div 
                  ref={provided.innerRef} 
                  {...provided.droppableProps}
                  className={`rounded p-4 ${
                    snapshot.isDraggingOver ? 'bg-blue-900' : 'bg-gray-800'
                  }`}
                >
                  <h2 className="text-xl font-bold mb-3 border-b border-gray-700 pb-2">
                    Active Lineup ({activeLineup.length})
                  </h2>
                  
                  <div className="space-y-2 min-h-[300px]">
                    {activeLineup.map((p, i) => (
                      <Draggable key={p.id} draggableId={p.id} index={i}>
                        {(prov, snap) => (
                          <div 
                            ref={prov.innerRef} 
                            {...prov.draggableProps} 
                            {...prov.dragHandleProps}
                            className={`rounded p-3 cursor-move border-l-4 ${
                              p.id === currentBatter
                                ? 'bg-green-800 border-green-500'
                                : snap.isDragging 
                                ? 'bg-gray-600 border-blue-400' 
                                : 'bg-gray-700 border-gray-600 hover:bg-gray-650'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="font-bold text-lg w-6">
                                {i + 1}.
                              </div>
                              {editingPlayerId === p.id ? (
                                <div className="flex-1 flex gap-2 items-center">
                                  <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="px-2 py-1 rounded bg-gray-600 border border-gray-500 text-white text-sm flex-1"
                                    placeholder="Name"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <input
                                    type="text"
                                    value={editTrackId}
                                    onChange={(e) => setEditTrackId(e.target.value)}
                                    className="px-2 py-1 rounded bg-gray-600 border border-gray-500 text-white text-sm flex-1"
                                    placeholder="Track ID"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <input
                                    type="number"
                                    value={editStartMs}
                                    onChange={(e) => setEditStartMs(e.target.value)}
                                    className="px-2 py-1 rounded bg-gray-600 border border-gray-500 text-white text-sm w-20"
                                    placeholder="Start"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      saveEdit(p.id);
                                    }}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      cancelEdit();
                                    }}
                                    className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex-1">
                                    <div className="font-bold mb-1">{p.name}</div>
                                    <div className="text-xs text-gray-400">
                                      <div>{trackNames[p.spotify_track_id] || 'Loading...'}</div>
                                      <div>Start: {p.start_ms}ms</div>
                                    </div>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      playSpecificBatter(i);
                                    }}
                                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-bold"
                                    title="Play Now"
                                  >
                                    Play Now
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditPlayer(p);
                                    }}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                                    title="Edit"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deletePlayer(p.id);
                                    }}
                                    className="text-red-500 hover:text-red-400 text-2xl px-2"
                                    title="Delete"
                                  >
                                    ×
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {activeLineup.length === 0 && (
                      <div className="text-center text-gray-500 py-8 text-sm">
                        Add players below
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Droppable>

            {/* Bench */}
            <Droppable droppableId="bench">
              {(provided, snapshot) => (
                <div 
                  ref={provided.innerRef} 
                  {...provided.droppableProps}
                  className={`rounded p-4 ${
                    snapshot.isDraggingOver ? 'bg-gray-700' : 'bg-gray-800'
                  }`}
                >
                  <h2 className="text-xl font-bold mb-3 border-b border-gray-700 pb-2">
                    Bench ({bench.length})
                  </h2>
                  
                  <div className="space-y-2 min-h-[300px]">
                    {bench.map((p, i) => (
                      <Draggable key={p.id} draggableId={p.id} index={i}>
                        {(prov, snap) => (
                          <div 
                            ref={prov.innerRef} 
                            {...prov.draggableProps} 
                            {...prov.dragHandleProps}
                            className={`rounded p-3 cursor-move border-l-4 ${
                              snap.isDragging 
                                ? 'bg-gray-600 border-gray-400' 
                                : 'bg-gray-700 border-gray-600 hover:bg-gray-650'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {editingPlayerId === p.id ? (
                                <div className="flex-1 flex gap-2 items-center">
                                  <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="px-2 py-1 rounded bg-gray-600 border border-gray-500 text-white text-sm flex-1"
                                    placeholder="Name"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <input
                                    type="text"
                                    value={editTrackId}
                                    onChange={(e) => setEditTrackId(e.target.value)}
                                    className="px-2 py-1 rounded bg-gray-600 border border-gray-500 text-white text-sm flex-1"
                                    placeholder="Track ID"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <input
                                    type="number"
                                    value={editStartMs}
                                    onChange={(e) => setEditStartMs(e.target.value)}
                                    className="px-2 py-1 rounded bg-gray-600 border border-gray-500 text-white text-sm w-20"
                                    placeholder="Start"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      saveEdit(p.id);
                                    }}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      cancelEdit();
                                    }}
                                    className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex-1">
                                    <div className="font-bold mb-1">{p.name}</div>
                                    <div className="text-xs text-gray-400">
                                      <div>{trackNames[p.spotify_track_id] || 'Loading...'}</div>
                                      <div>Start: {p.start_ms}ms</div>
                                    </div>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditPlayer(p);
                                    }}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                                    title="Edit"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deletePlayer(p.id);
                                    }}
                                    className="text-red-500 hover:text-red-400 text-2xl px-2"
                                    title="Delete"
                                  >
                                    ×
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {bench.length === 0 && (
                      <div className="text-center text-gray-500 py-8 text-sm">
                        Drag players here
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Droppable>
          </div>
        </DragDropContext>

        {/* Add Player Section */}
        <div className="bg-gray-800 rounded p-4">
          <h2 className="text-xl font-bold mb-3">Add New Player</h2>
          
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Player Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 px-3 py-2 rounded bg-gray-700 border border-gray-600 text-white placeholder-gray-500"
            />
            <input
              type="text"
              placeholder="Spotify Track ID or paste link"
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              className="flex-1 px-3 py-2 rounded bg-gray-700 border border-gray-600 text-white placeholder-gray-500"
            />
            <input
              type="number"
              placeholder="Start (ms)"
              value={startMs}
              onChange={(e) => setStartMs(e.target.value)}
              className="w-28 px-3 py-2 rounded bg-gray-700 border border-gray-600 text-white placeholder-gray-500"
            />
            <button
              onClick={addPlayer}
              disabled={addingPlayer}
              className={`px-4 py-2 rounded font-bold ${
                addingPlayer 
                  ? 'bg-gray-700 text-gray-500' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {addingPlayer ? '...' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
