import express from 'express';
import fs from 'fs';
import path from 'path';
import { exec, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const ROOT_DIR = path.join(__dirname, '..');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Whitelist of allowed scripts for security
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

// Helper to find reports in any case or directory
function findReport(reportPath) {
    const fullPath = path.join(ROOT_DIR, reportPath);
    if (fs.existsSync(fullPath)) return fullPath;
    
    // Fallback: check data/ folder if reportPath is just a filename
    const dataPath = path.join(ROOT_DIR, 'data', reportPath);
    if (fs.existsSync(dataPath)) return dataPath;

    // Fallback: search recursively in reports/
    const reportsDir = path.join(ROOT_DIR, 'reports');
    if (fs.existsSync(reportsDir)) {
        const basename = path.basename(reportPath);
        const files = fs.readdirSync(reportsDir, { recursive: true });
        const match = files.find(f => f.endsWith(basename));
        if (match) return path.join(reportsDir, match);
    }
    
    return null;
}

// Parse applications.md table
app.get('/api/applications', (req, res) => {
  const filePath = path.join(ROOT_DIR, 'data', 'applications.md');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'applications.md not found' });
  }

  const content = fs.readFileSync(filePath, 'utf8');
  // Handle different table styles (with or without leading/trailing pipes)
  const lines = content.split('\n')
    .map(l => l.trim())
    .filter(line => line.startsWith('|') && !line.includes('---') && line.split('|').length > 4);
  
  if (lines.length < 2) return res.json([]);

  const headers = lines[0].split('|').map(h => h.trim().toLowerCase()).filter(Boolean);
  const data = lines.slice(1).map(line => {
    const values = line.split('|').map(v => v.trim()).filter((v, i) => i > 0 && i <= headers.length);
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] || '';
    });
    return obj;
  });

  res.json(data);
});

// Fetch report content
app.get('/api/reports/detail', (req, res) => {
  const reportPath = req.query.path;
  if (!reportPath) return res.status(400).send('No path provided');
  
  const absolutePath = findReport(reportPath);
  if (!absolutePath) {
    return res.status(404).send('Report not found: ' + reportPath);
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  res.send(content);
});

// SSE endpoint for streaming command output
app.get('/api/stream-command', (req, res) => {
  const { cmd, args } = req.query;
  const fullCmd = `${cmd}${args ? ' ' + args : ''}`;

  const isAllowed = ALLOWED_SCRIPTS.some(allowed => fullCmd.startsWith(allowed));
  if (!isAllowed) {
    return res.status(403).json({ error: 'Command not allowed' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Parse command correctly handling quotes in args
  const command = fullCmd.split(' ')[0];
  const commandArgs = fullCmd.substring(command.length).trim();

  // Use shell: true to handle complex quoting in args (like JD text)
  const child = spawn(fullCmd, { cwd: ROOT_DIR, shell: true });

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify({ output: data })}\n\n`);
  };

  child.stdout.on('data', (data) => sendEvent(data.toString()));
  child.stderr.on('data', (data) => sendEvent(data.toString()));

  child.on('close', (code) => {
    res.write(`data: ${JSON.stringify({ done: true, code })}\n\n`);
    res.end();
  });

  req.on('close', () => {
    child.kill();
  });
});

app.listen(PORT, () => {
  console.log(`Career-Ops Dashboard running at http://localhost:${PORT}`);
});
