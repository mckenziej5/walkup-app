import { useEffect, useState } from "react";
import { api } from "../api";

export default function Players() {
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState("");
  const [trackId, setTrackId] = useState("");
  const [startMs, setStartMs] = useState(0);
  const [loading, setLoading] = useState(false);

  // Load all players
  const loadPlayers = async () => {
    try {
      const res = await api.get("/players");
      setPlayers(res.data);
    } catch (err) {
      console.error("Error loading players:", err);
      alert("Failed to load players");
    }
  };

  useEffect(() => {
    loadPlayers();
  }, []);

  // Add a new player
  const addPlayer = async () => {
    if (!name.trim() || !trackId.trim()) {
      return alert("Please enter both name and Spotify Track ID");
    }
    setLoading(true);
    try {
      await api.post("/players", {
        name: name.trim(),
        spotifyTrackId: trackId.trim(),
        startMs: Number(startMs)
      });

      // Clear form
      setName("");
      setTrackId("");
      setStartMs(0);

      // Reload list
      loadPlayers();
    } catch (err) {
      console.error("Error adding player:", err);
      alert("Failed to add player");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 min-h-screen bg-gray-900 text-white">
      <h1 className="text-3xl font-bold mb-6">Players</h1>

      {/* Add Player Form */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <input
          type="text"
          placeholder="Player Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="p-2 rounded text-black"
        />
        <input
          type="text"
          placeholder="Spotify Track ID"
          value={trackId}
          onChange={(e) => setTrackId(e.target.value)}
          className="p-2 rounded text-black"
        />
        <input
          type="number"
          placeholder="Start Time (ms)"
          value={startMs}
          onChange={(e) => setStartMs(e.target.value)}
          className="p-2 rounded text-black w-24"
        />
        <button
          onClick={addPlayer}
          disabled={loading}
          className={`px-4 rounded ${
            loading ? "bg-gray-600" : "bg-blue-500 hover:bg-blue-600"
          }`}
        >
          {loading ? "Adding..." : "Add Player"}
        </button>
      </div>

      {/* Players List */}
      <ul>
        {players.map((p) => (
          <li
            key={p.id}
            className="mb-2 p-2 bg-gray-800 rounded flex justify-between items-center"
          >
            <div>
              <strong>{p.name}</strong> — Track: {p.spotify_track_id} — Start: {p.start_ms}ms
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
