import express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Whitelist of allowed commands for UI buttons
const ALLOWED_SCRIPTS = [
  'node scan.mjs',
  'node verify-pipeline.mjs',
  'node followup-cadence.mjs',
  'node analyze-patterns.mjs',
  'node pipeline.mjs',
  'node generate-pdf.mjs',
  'node gemini-eval.mjs',
  'batch/batch-runner.sh'
];

// Helper to find reports
function findReport(reportPath) {
    if (!reportPath) return null;
    const fullPath = path.join(ROOT_DIR, reportPath);
    if (fs.existsSync(fullPath)) return fullPath;
    const dataPath = path.join(ROOT_DIR, 'data', reportPath);
    if (fs.existsSync(dataPath)) return dataPath;
    return null;
}

app.get('/api/applications', (req, res) => {
  const filePath = path.join(ROOT_DIR, 'data', 'applications.md');
  if (!fs.existsSync(filePath)) return res.json([]);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').map(l => l.trim()).filter(line => line.startsWith('|') && !line.includes('---'));
  if (lines.length < 2) return res.json([]);
  const headers = lines[0].split('|').map(h => h.trim().toLowerCase()).filter(Boolean);
  const data = lines.slice(1).map(line => {
    const values = line.split('|').map(v => v.trim()).filter((v, i) => i > 0 && i <= headers.length);
    const obj = {};
    headers.forEach((header, index) => { obj[header] = values[index] || ''; });
    return obj;
  });
  res.json(data);
});

app.get('/api/reports/detail', (req, res) => {
  const absolutePath = findReport(req.query.path);
  if (!absolutePath) return res.status(404).send('Report not found');
  res.send(fs.readFileSync(absolutePath, 'utf8'));
});

// SSE endpoint for streaming command output
app.get('/api/stream-command', (req, res) => {
  const { cmd, args } = req.query;
  const fullCmd = `${cmd}${args ? ' ' + args : ''}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Spawn with the current user's environment to ensure GEMINI_API_KEY is found
  const child = spawn(fullCmd, { 
    cwd: ROOT_DIR, 
    shell: true,
    env: process.env // INHERIT FULL TERMINAL ENVIRONMENT
  });

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify({ output: data })}\n\n`);
  };

  child.stdout.on('data', (data) => sendEvent(data.toString()));
  child.stderr.on('data', (data) => sendEvent(data.toString()));
  child.on('close', (code) => {
    res.write(`data: ${JSON.stringify({ done: true, code })}\n\n`);
    res.end();
  });
  req.on('close', () => child.kill());
});

app.listen(PORT, () => {
  console.log(`Career-Ops Command Center running at http://localhost:${PORT}`);
});
