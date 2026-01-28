// index.js
import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

dotenv.config();
const app = express();
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

  res.send('Spotify connected. You can close this tab.');
});

// --- Get Devices ---
app.get('/devices', async (req, res) => {
  if (!spotifyToken) return res.status(401).send('No Spotify token. Please /login first.');

  const r = await fetch('https://api.spotify.com/v1/me/player/devices', {
    headers: { 'Authorization': `Bearer ${spotifyToken}` }
  });

  res.json(await r.json());
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

// --- Player CRUD ---
app.post('/players', (req, res) => {
  const { name, spotifyTrackId, startMs } = req.body;
  const id = uuid();

  db.prepare(`
    INSERT INTO players (id, name, spotify_track_id, start_ms, active)
    VALUES (?, ?, ?, ?, 1)
  `).run(id, name, spotifyTrackId, startMs);

  res.json({ id });
});

app.get('/players', (req, res) => {
  const players = db.prepare(`SELECT * FROM players`).all();
  res.json(players);
});

// --- Lineup ---
app.post('/lineup', (req, res) => {
  const { order } = req.body;
  db.prepare(`DELETE FROM lineup`).run();

  order.forEach((pid, i) => {
    db.prepare(`INSERT INTO lineup (position, player_id) VALUES (?,?)`).run(i, pid);
  });

  res.send('Lineup set');
});

app.post('/lineup/next', async (req, res) => {
  const deviceId = req.query.deviceId;
  const row = db.prepare(`SELECT * FROM lineup ORDER BY position ASC LIMIT 1`).get();
  if (!row) return res.send('No lineup');

  const player = db.prepare(`SELECT * FROM players WHERE id=?`).get(row.player_id);

  // Play player's song
  await fetch(`http://127.0.0.1:3000/play?deviceId=${deviceId}&trackId=${player.spotify_track_id}&startMs=${player.start_ms}`, { method: 'GET' });

  // Rotate lineup
  db.prepare(`DELETE FROM lineup WHERE player_id=?`).run(row.player_id);
  db.prepare(`INSERT INTO lineup (position, player_id) VALUES (?,?)`).run(999, row.player_id);

  res.send(`Played ${player.name}`);
});

// --- Start Server ---
app.listen(3000, () => console.log('Walk-up app running on http://127.0.0.1:3000'));
