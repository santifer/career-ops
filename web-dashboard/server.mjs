import express from 'express';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

app.get('/api/reports/detail', async (req, res) => {
  const reportPath = req.query.path;
  if (typeof reportPath !== 'string') return res.status(400).send('Invalid path');

  const absolutePath = path.resolve(ROOT_DIR, reportPath);
  const reportsDir = path.resolve(ROOT_DIR, 'reports');
  const dataDir = path.resolve(ROOT_DIR, 'data');

  if (!absolutePath.startsWith(reportsDir) && !absolutePath.startsWith(dataDir)) {
    return res.status(403).send('Forbidden: Access outside allowed directories');
  }

  if (path.extname(absolutePath) !== '.md') {
    return res.status(403).send('Forbidden: Only Markdown files are allowed');
  }

  if (!fs.existsSync(absolutePath)) return res.status(404).send('Report not found');

  try {
    const content = await fs.promises.readFile(absolutePath, 'utf8');
    res.send(content);
  } catch (err) {
    res.status(500).send('Error reading report');
  }
});

// ROBUST TERMINAL BRIDGE
app.post('/api/terminal-send', (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).send('No command');

  // Clean the command for AppleScript
  const cleanCmd = command.replace(/"/g, '\\"');

  const script = `
    tell application "System Events"
        set isRunning to (name of processes) contains "iTerm"
    end tell
    if isRunning then
        tell application "iTerm"
            activate
            tell current session of current window
                write text "${cleanCmd}"
            end tell
        end tell
    else
        tell application "Terminal"
            activate
            do script "${cleanCmd}" in front window
        end tell
    end if
  `;

  exec(`osascript -e '${script}'`, (err) => {
    if (err) {
        console.error('AppleScript Error:', err);
        return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log(`Career-Ops Dashboard running at http://localhost:${PORT}`);
});
