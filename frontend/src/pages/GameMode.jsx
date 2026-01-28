import { useEffect, useState } from 'react';
import { api } from '../api';

export default function GameMode() {
  const [deviceId, setDeviceId] = useState(null);
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState(null);

  const loadDevices = async () => {
    try {
      const res = await api.get('/devices');
      if (res.data.devices && res.data.devices.length) {
        setDevices(res.data.devices);
        setDeviceId(res.data.devices[0].id);
        setError(null);
      } else {
        setError('No active Spotify devices found. Open Spotify on a device first.');
      }
    } catch (err) {
      console.error('Error loading devices:', err);
      setError('Failed to load devices. Make sure you logged in to Spotify first.');
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const next = async () => {
    if (!deviceId) return alert('No Spotify device found');
    try {
      await api.post(`/lineup/next?deviceId=${deviceId}`);
    } catch (err) {
      console.error('Error playing next:', err);
      alert('Failed to play next batter');
    }
  };

  return (
    <div className="h-screen bg-black text-white flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold mb-8">Walk-Up Control</h1>

      {error && (
        <div className="mb-4 p-4 bg-red-600 rounded text-center max-w-md">
          <p>{error}</p>
          <a 
            href="http://127.0.0.1:3000/login" 
            target="_blank"
            className="underline mt-2 inline-block"
          >
            Click here to login to Spotify
          </a>
          <button 
            onClick={loadDevices}
            className="ml-4 px-4 py-2 bg-blue-500 rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      )}

      {devices.length > 0 && (
        <div className="mb-4">
          <label className="mr-2">Device:</label>
          <select 
            value={deviceId || ''} 
            onChange={(e) => setDeviceId(e.target.value)}
            className="p-2 rounded text-black"
          >
            {devices.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      )}

      <button
        onClick={next}
        disabled={!deviceId}
        className={`text-4xl font-bold px-20 py-12 rounded-2xl shadow-2xl ${
          deviceId 
            ? 'bg-green-500 hover:bg-green-600 text-black' 
            : 'bg-gray-600 text-gray-400 cursor-not-allowed'
        }`}
      >
        NEXT BATTER
      </button>
    </div>
  );
}
