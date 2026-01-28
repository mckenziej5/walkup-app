// index.js
import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import cors from 'cors';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.SPOTIFY_REDIRECT_URI;

let spotifyToken = null; // in-memory token

// --- SQLite Setup ---
const db = new Database('walkup.db');

db.prepare(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT,
    spotify_track_id TEXT,
    start_ms INTEGER,
    active INTEGER
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS lineup (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position INTEGER,
    player_id TEXT
  )
`).run();

// --- Spotify OAuth ---
app.get('/login', (req, res) => {
  const scopes = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing'
  ].join(' ');

  const url = 'https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
      response_type: 'code',
      client_id,
      scope: scopes,
      redirect_uri
    });

  res.redirect(url);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri
    })
  });

  const data = await tokenRes.json();
  spotifyToken = data.access_token;

  res.send(`
    <html>
      <body>
        <p>Spotify connected! You can close this window.</p>
        <script>
          // Send message to parent
          if (window.opener) {
            window.opener.postMessage('spotify-login-success', '*');
          }
          
          // Try to close repeatedly
          function attemptClose() {
            try {
              window.close();
            } catch (e) {
              console.log('Cannot close window');
            }
          }
          
          // Try immediately and every 100ms for 3 seconds
          attemptClose();
          let attempts = 0;
          const interval = setInterval(() => {
            attemptClose();
            attempts++;
            if (attempts > 30) clearInterval(interval);
          }, 100);
        </script>
      </body>
    </html>
  `);
});

// --- Get Devices ---
app.get('/devices', async (req, res) => {
  if (!spotifyToken) return res.status(401).send('No Spotify token. Please /login first.');

  const r = await fetch('https://api.spotify.com/v1/me/player/devices', {
    headers: { 'Authorization': `Bearer ${spotifyToken}` }
  });

  res.json(await r.json());
});

// --- Get Track Info ---
app.get('/track/:trackId', async (req, res) => {
  if (!spotifyToken) return res.status(401).send('No Spotify token. Please /login first.');

  const { trackId } = req.params;
  
  try {
    const r = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { 'Authorization': `Bearer ${spotifyToken}` }
    });

    if (!r.ok) {
      console.error(`Spotify API error for track ${trackId}: ${r.status}`);
      return res.status(r.status).json({ name: 'Unknown Track', artist: '' });
    }

    const data = await r.json();
    res.json({ name: data.name, artist: data.artists[0]?.name });
  } catch (err) {
    console.error('Error fetching track info:', err);
    res.status(500).json({ name: 'Unknown Track', artist: '' });
  }
});

// --- Play Track ---
app.get('/play', async (req, res) => {
  const { deviceId, trackId, startMs } = req.query;
  if (!spotifyToken) return res.status(401).send('No Spotify token. Please /login first.');

  try {
    // Transfer playback to device
    await fetch(`https://api.spotify.com/v1/me/player`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${spotifyToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ device_ids: [deviceId], play: false })
    });

    // Start playback
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${spotifyToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uris: [`spotify:track:${trackId}`] })
    });

    // Seek if timestamp provided
    if (startMs) {
      await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${startMs}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${spotifyToken}` }
      });
    }

    res.send('Playing');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error playing track');
  }
});

// --- Pause Playback ---
app.post('/pause', async (req, res) => {
  const { deviceId } = req.body;
  if (!spotifyToken) return res.status(401).send('No Spotify token. Please /login first.');

  try {
    const response = await fetch(`https://api.spotify.com/v1/me/player/pause${deviceId ? `?device_id=${deviceId}` : ''}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${spotifyToken}` }
    });

    res.send('Paused');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error pausing playback');
  }
});

// --- Resume Playback ---
app.post('/play', async (req, res) => {
  const { deviceId } = req.body;
  if (!spotifyToken) return res.status(401).send('No Spotify token. Please /login first.');

  try {
    const response = await fetch(`https://api.spotify.com/v1/me/player/play${deviceId ? `?device_id=${deviceId}` : ''}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${spotifyToken}` }
    });

    res.send('Resumed');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error resuming playback');
  }
});

// --- Player CRUD ---
app.post('/players', (req, res) => {
  try {
    console.log('Received player data:', req.body);
    const { name, spotifyTrackId, startMs } = req.body;
    const id = uuid();

    db.prepare(`
      INSERT INTO players (id, name, spotify_track_id, start_ms, active)
      VALUES (?, ?, ?, ?, 1)
    `).run(id, name, spotifyTrackId, startMs);

    console.log('Player added successfully:', id);
    res.json({ id });
  } catch (err) {
    console.error('Error adding player:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/players', (req, res) => {
  try {
    const players = db.prepare(`SELECT * FROM players`).all();
    res.json(players);
  } catch (err) {
    console.error('Error getting players:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/players/:id', (req, res) => {
  try {
    const { id } = req.params;
    console.log('Deleting player:', id);
    
    // Remove from lineup first
    db.prepare(`DELETE FROM lineup WHERE player_id = ?`).run(id);
    
    // Remove player
    db.prepare(`DELETE FROM players WHERE id = ?`).run(id);
    
    console.log('Player deleted successfully');
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting player:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/players/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, spotifyTrackId, startMs } = req.body;
    console.log('Updating player:', id, req.body);

    db.prepare(`
      UPDATE players 
      SET name = ?, spotify_track_id = ?, start_ms = ?
      WHERE id = ?
    `).run(name, spotifyTrackId, startMs, id);

    console.log('Player updated successfully');
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating player:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Lineup ---
app.post('/lineup', (req, res) => {
  try {
    const { order } = req.body;
    console.log('Setting lineup:', order);
    db.prepare(`DELETE FROM lineup`).run();

    order.forEach((pid, i) => {
      db.prepare(`INSERT INTO lineup (position, player_id) VALUES (?,?)`).run(i, pid);
    });

    console.log('Lineup saved successfully');
    res.send('Lineup set');
  } catch (err) {
    console.error('Error setting lineup:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/lineup/next', async (req, res) => {
  try {
    const deviceId = req.query.deviceId;
    console.log('Next batter requested, deviceId:', deviceId);
    
    const row = db.prepare(`SELECT * FROM lineup ORDER BY position ASC LIMIT 1`).get();
    if (!row) {
      console.log('No lineup found');
      return res.status(400).send('No lineup set. Please set up a lineup first.');
    }

    console.log('Next player in lineup:', row);
    const player = db.prepare(`SELECT * FROM players WHERE id=?`).get(row.player_id);
    console.log('Player details:', player);

    if (!player) {
      console.log('Player not found for id:', row.player_id);
      return res.status(404).send('Player not found');
    }

    // Play player's song
    console.log(`Playing track ${player.spotify_track_id} at ${player.start_ms}ms on device ${deviceId}`);
    const playResponse = await fetch(`http://127.0.0.1:3000/play?deviceId=${deviceId}&trackId=${player.spotify_track_id}&startMs=${player.start_ms}`, { method: 'GET' });
    console.log('Play response status:', playResponse.status);

    // Rotate lineup
    db.prepare(`DELETE FROM lineup WHERE player_id=?`).run(row.player_id);
    db.prepare(`INSERT INTO lineup (position, player_id) VALUES (?,?)`).run(999, row.player_id);

    console.log(`Successfully played ${player.name}`);
    res.send(`Played ${player.name}`);
  } catch (err) {
    console.error('Error in /lineup/next:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Start Server ---
app.listen(3000, () => console.log('Walk-up app running on http://127.0.0.1:3000'));
