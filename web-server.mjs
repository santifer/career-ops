import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ── SSE: Real-time file change notifications ────────────────────────
const sseClients = new Set();

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write('data: connected\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function broadcastUpdate(source) {
  const payload = JSON.stringify({ type: 'data-changed', source, timestamp: Date.now() });
  for (const client of sseClients) {
    client.write(`data: ${payload}\n\n`);
  }
}

// Watch the data directory for changes
const dataDir = path.join(__dirname, 'data');
let debounceTimer = null;
fs.watch(dataDir, { recursive: false }, (eventType, filename) => {
  if (!filename) return;
  // Debounce: scan.mjs writes multiple files in quick succession
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log(`[watch] ${filename} changed → notifying ${sseClients.size} client(s)`);
    broadcastUpdate(filename);
  }, 500);
});

// ── Helpers ─────────────────────────────────────────────────────────

function parseMarkdownTable(content) {
  const lines = content.split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 3) return [];
  
  const headers = lines[0].split('|').map(h => h.trim()).filter(Boolean);
  const data = lines.slice(2).map(line => {
    const values = line.split('|').map(v => v.trim()).filter((_, i) => i > 0 && i <= headers.length);
    const row = {};
    headers.forEach((h, i) => {
      row[h.toLowerCase()] = values[i];
    });
    return row;
  });
  return data;
}

function parsePendingList(content) {
  const pendingList = [];
  // Match ALL checkbox items in the file, not just under Pendientes header
  const items = content.split('\n').filter(l => l.trim().startsWith('- [ ]'));
  items.forEach(item => {
    const parts = item.replace('- [ ]', '').split('|').map(p => p.trim());
    if (parts.length >= 2) {
      pendingList.push({
        url: parts[0],
        company: parts[1],
        role: parts[2] || 'Unknown'
      });
    }
  });
  return pendingList;
}

// ── API Endpoints ───────────────────────────────────────────────────

app.get('/api/profile', (req, res) => {
  try {
    const filePath = path.join(__dirname, 'config/profile.yml');
    if (!fs.existsSync(filePath)) return res.json({});
    const profile = yaml.load(fs.readFileSync(filePath, 'utf8'));
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

app.get('/api/applications', (req, res) => {
  try {
    const filePath = path.join(__dirname, 'data/applications.md');
    if (!fs.existsSync(filePath)) return res.json([]);
    const content = fs.readFileSync(filePath, 'utf8');
    res.json(parseMarkdownTable(content));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load applications' });
  }
});

app.get('/api/pipeline', (req, res) => {
  try {
    const filePath = path.join(__dirname, 'data/pipeline.md');
    if (!fs.existsSync(filePath)) return res.json({ table: [], pending: [] });
    const content = fs.readFileSync(filePath, 'utf8');
    const tableData = parseMarkdownTable(content);
    const pending = parsePendingList(content);
    res.json({ table: tableData, pending });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load pipeline' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
  console.log(`Watching ${dataDir} for changes...`);
});
