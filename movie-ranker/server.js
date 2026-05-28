import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { readMovies, writeRankings } from './sheets.js';
import { generateRoundPairs, getRankings } from './swiss.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const STATE_FILE = path.join(__dirname, 'state.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function load() {
  if (!fs.existsSync(STATE_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return null; }
}

function save(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

function updateBuchholz(movies) {
  const scoreMap = Object.fromEntries(movies.map(m => [m.id, m.score]));
  for (const m of movies) {
    m.buchholz = m.opponents.reduce((sum, id) => sum + (scoreMap[id] ?? 0), 0);
  }
}

app.get('/api/status', (req, res) => {
  const s = load();
  if (!s) return res.json({ initialized: false });
  const pending = s.currentPairs.filter(p => !p.completed).length;
  res.json({
    initialized: true,
    round: s.currentRound,
    totalMovies: s.movies.length,
    pairsInRound: s.currentPairs.length,
    pairsCompleted: s.currentPairs.length - pending,
    pairsRemaining: pending,
    totalComparisons: s.totalComparisons,
  });
});

app.post('/api/init', async (req, res) => {
  if (load()) return res.json({ alreadyInitialized: true });
  try {
    const movies = await readMovies();
    const { pairs, byeId } = generateRoundPairs(movies);
    if (byeId) {
      const m = movies.find(x => x.id === byeId);
      if (m) { m.score++; m.wins++; }
    }
    save({ movies, currentRound: 1, currentPairs: pairs, totalComparisons: 0 });
    res.json({ success: true, totalMovies: movies.length, pairs: pairs.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/match', (req, res) => {
  const s = load();
  if (!s) return res.status(400).json({ error: 'Not initialized' });

  const idx = s.currentPairs.findIndex(p => !p.completed);
  if (idx === -1) return res.json({ roundComplete: true, round: s.currentRound });

  const pair = s.currentPairs[idx];
  const ma = s.movies.find(m => m.id === pair.a);
  const mb = s.movies.find(m => m.id === pair.b);
  const pending = s.currentPairs.filter(p => !p.completed).length;

  res.json({
    pairIdx: idx,
    movieA: { id: ma.id, name: ma.name, year: ma.year, language: ma.language, score: ma.score, wins: ma.wins, losses: ma.losses },
    movieB: { id: mb.id, name: mb.name, year: mb.year, language: mb.language, score: mb.score, wins: mb.wins, losses: mb.losses },
    round: s.currentRound,
    pairsRemaining: pending,
    pairsInRound: s.currentPairs.length,
    totalComparisons: s.totalComparisons,
  });
});

app.post('/api/match', (req, res) => {
  const { pairIdx, winnerId } = req.body;
  const s = load();
  if (!s) return res.status(400).json({ error: 'Not initialized' });

  const pair = s.currentPairs[pairIdx];
  if (!pair) return res.status(400).json({ error: 'Invalid pairIdx' });
  if (pair.completed) return res.status(400).json({ error: 'Already completed' });

  const ma = s.movies.find(m => m.id === pair.a);
  const mb = s.movies.find(m => m.id === pair.b);

  if (winnerId && winnerId !== 'skip') {
    const winner = winnerId === pair.a ? ma : mb;
    const loser = winnerId === pair.a ? mb : ma;
    if (!winner || !loser) return res.status(400).json({ error: 'Invalid winnerId' });
    winner.score++;
    winner.wins++;
    loser.losses++;
    if (!winner.opponents.includes(loser.id)) winner.opponents.push(loser.id);
    if (!loser.opponents.includes(winner.id)) loser.opponents.push(winner.id);
    pair.result = winnerId;
    s.totalComparisons++;
  } else {
    // Skip: mark as played so they won't be re-paired
    if (!ma.opponents.includes(mb.id)) ma.opponents.push(mb.id);
    if (!mb.opponents.includes(ma.id)) mb.opponents.push(ma.id);
    pair.result = 'skip';
  }
  pair.completed = true;

  updateBuchholz(s.movies);

  const roundComplete = s.currentPairs.every(p => p.completed);
  if (roundComplete) {
    s.currentRound++;
    const { pairs, byeId } = generateRoundPairs(s.movies);
    if (byeId) {
      const m = s.movies.find(x => x.id === byeId);
      if (m) { m.score++; m.wins++; }
    }
    s.currentPairs = pairs;
  }

  save(s);

  res.json({
    success: true,
    roundComplete,
    newRound: s.currentRound,
    pairsRemaining: s.currentPairs.filter(p => !p.completed).length,
    totalComparisons: s.totalComparisons,
  });
});

app.get('/api/standings', (req, res) => {
  const s = load();
  if (!s) return res.status(400).json({ error: 'Not initialized' });
  res.json(getRankings(s.movies));
});

app.post('/api/sync', async (req, res) => {
  const s = load();
  if (!s) return res.status(400).json({ error: 'Not initialized' });
  try {
    const rankings = getRankings(s.movies);
    await writeRankings(rankings);
    res.json({ success: true, count: rankings.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/reset', (req, res) => {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Movie Ranker running at http://localhost:${PORT}`);
});
