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
      if (m) { m.score++; m.wins++; m.streak = 1; }
    }
    save({ movies, currentRound: 1, currentPairs: pairs, totalComparisons: 0, history: [] });
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
    movieA: { id: ma.id, name: ma.name, year: ma.year, language: ma.language, score: ma.score, wins: ma.wins, losses: ma.losses, streak: ma.streak ?? 0 },
    movieB: { id: mb.id, name: mb.name, year: mb.year, language: mb.language, score: mb.score, wins: mb.wins, losses: mb.losses, streak: mb.streak ?? 0 },
    round: s.currentRound,
    pairsRemaining: pending,
    pairsInRound: s.currentPairs.length,
    totalComparisons: s.totalComparisons,
    undoable: (s.history ?? []).length > 0,
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
  const isSkip = !winnerId || winnerId === 'skip';
  const lastPairInRound = s.currentPairs.filter(p => !p.completed).length === 1;

  // Snapshot for undo (captured before applying changes)
  const historyEntry = {
    pairIdx,
    wasSkip: isSkip,
    roundBeforePick: s.currentRound,
    pairsBeforePick: lastPairInRound ? JSON.parse(JSON.stringify(s.currentPairs)) : null,
    aId: ma.id, aScore: ma.score, aWins: ma.wins, aLosses: ma.losses,
    aOpponents: [...ma.opponents], aStreak: ma.streak ?? 0,
    bId: mb.id, bScore: mb.score, bWins: mb.wins, bLosses: mb.losses,
    bOpponents: [...mb.opponents], bStreak: mb.streak ?? 0,
    byeId: null, byeScore: null, byeWins: null, byeStreak: null,
  };

  if (!isSkip) {
    const winner = winnerId === pair.a ? ma : mb;
    const loser = winnerId === pair.a ? mb : ma;
    if (!winner || !loser) return res.status(400).json({ error: 'Invalid winnerId' });
    winner.score++;
    winner.wins++;
    winner.streak = (winner.streak ?? 0) + 1;
    loser.losses++;
    loser.streak = 0;
    if (!winner.opponents.includes(loser.id)) winner.opponents.push(loser.id);
    if (!loser.opponents.includes(winner.id)) loser.opponents.push(winner.id);
    pair.result = winnerId;
    s.totalComparisons++;
  } else {
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
      if (m) {
        // Snapshot bye movie before giving it a free win
        historyEntry.byeId = byeId;
        historyEntry.byeScore = m.score;
        historyEntry.byeWins = m.wins;
        historyEntry.byeStreak = m.streak ?? 0;
        m.score++;
        m.wins++;
        m.streak = (m.streak ?? 0) + 1;
      }
    }
    s.currentPairs = pairs;
  }

  s.history = s.history ?? [];
  s.history.push(historyEntry);
  if (s.history.length > 50) s.history.shift(); // cap at 50

  save(s);

  res.json({
    success: true,
    roundComplete,
    newRound: s.currentRound,
    pairsRemaining: s.currentPairs.filter(p => !p.completed).length,
    totalComparisons: s.totalComparisons,
    undoable: s.history.length > 0,
  });
});

app.post('/api/undo', (req, res) => {
  const s = load();
  if (!s) return res.status(400).json({ error: 'Not initialized' });

  s.history = s.history ?? [];
  const entry = s.history.pop();
  if (!entry) return res.status(400).json({ error: 'Nothing to undo' });

  // Restore bye movie if a round boundary was crossed
  if (entry.byeId) {
    const byeMovie = s.movies.find(m => m.id === entry.byeId);
    if (byeMovie) {
      byeMovie.score = entry.byeScore;
      byeMovie.wins = entry.byeWins;
      byeMovie.streak = entry.byeStreak ?? 0;
    }
  }

  // Restore movie A
  const ma = s.movies.find(m => m.id === entry.aId);
  if (ma) {
    ma.score = entry.aScore; ma.wins = entry.aWins; ma.losses = entry.aLosses;
    ma.opponents = entry.aOpponents; ma.streak = entry.aStreak;
  }

  // Restore movie B
  const mb = s.movies.find(m => m.id === entry.bId);
  if (mb) {
    mb.score = entry.bScore; mb.wins = entry.bWins; mb.losses = entry.bLosses;
    mb.opponents = entry.bOpponents; mb.streak = entry.bStreak;
  }

  // Restore pairs — if round advanced, roll back to pre-advance state
  if (entry.pairsBeforePick) {
    s.currentPairs = entry.pairsBeforePick; // already has last pair as incomplete
    s.currentRound = entry.roundBeforePick;
  } else {
    s.currentPairs[entry.pairIdx].completed = false;
    s.currentPairs[entry.pairIdx].result = null;
  }

  if (!entry.wasSkip) s.totalComparisons = Math.max(0, s.totalComparisons - 1);

  updateBuchholz(s.movies);
  save(s);

  res.json({ success: true, undoable: s.history.length > 0 });
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
