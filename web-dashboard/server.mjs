import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { readFileSync, existsSync, readdirSync, watch } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import { parse as yamlishParse } from './yaml-lite.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = process.env.PORT || 3737;

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(join(__dirname, 'public')));
app.use(express.json());

function readFileSafe(path) {
  try { return existsSync(path) ? readFileSync(path, 'utf-8') : null; }
  catch { return null; }
}

function parseApplications() {
  const content = readFileSafe(join(ROOT, 'data/applications.md'));
  if (!content) return [];
  const lines = content.split('\n').filter(l => l.startsWith('|') && !l.startsWith('| #') && !l.startsWith('|--'));
  return lines.map(line => {
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 8) return null;
    const report = cols[7];
    // Extract report filename to get job URL
    const reportMatch = report.match(/\(reports\/(.+?)\)/);
    let jobUrl = '';
    if (reportMatch) {
      const reportContent = readFileSafe(join(ROOT, 'reports', reportMatch[1]));
      const urlMatch = reportContent?.match(/\*\*URL:\*\*\s*(.+)/);
      if (urlMatch) jobUrl = urlMatch[1].trim();
    }
    return {
      num: cols[0], date: cols[1], company: cols[2], role: cols[3],
      score: cols[4], status: cols[5], pdf: cols[6], report,
      notes: cols[8] || '', jobUrl
    };
  }).filter(Boolean);
}

function parsePipeline() {
  const content = readFileSafe(join(ROOT, 'data/pipeline.md'));
  if (!content) return { pending: [], processed: [] };
  const pending = [], processed = [];
  let section = 'pending';
  for (const line of content.split('\n')) {
    if (line.includes('Procesadas')) { section = 'processed'; continue; }
    const match = line.match(/^- \[([ x])\] (.+)/);
    if (!match) continue;
    const parts = match[2].split('|').map(s => s.trim());
    const entry = { url: parts[0], company: parts[1] || '', title: parts[2] || '', done: match[1] === 'x' };
    (section === 'pending' ? pending : processed).push(entry);
  }
  return { pending, processed };
}

function parseScanHistory() {
  const content = readFileSafe(join(ROOT, 'data/scan-history.tsv'));
  if (!content) return [];
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const [url, first_seen, portal, title, company, status] = line.split('\t');
    return { url, first_seen, portal, title, company, status };
  });
}

function parseProfile() {
  const content = readFileSafe(join(ROOT, 'config/profile.yml'));
  if (!content) return null;
  return yamlishParse(content);
}

function listReports() {
  const dir = join(ROOT, 'reports');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse().map(f => {
    const content = readFileSafe(join(dir, f));
    const scoreMatch = content?.match(/\*\*Score:\*\*\s*([\d.]+\/5)/);
    const urlMatch = content?.match(/\*\*URL:\*\*\s*(.+)/);
    const legitimacyMatch = content?.match(/\*\*Legitimacy:\*\*\s*(.+)/);
    return {
      filename: f,
      score: scoreMatch?.[1] || '',
      url: urlMatch?.[1]?.trim() || '',
      legitimacy: legitimacyMatch?.[1]?.trim() || '',
      preview: content?.substring(0, 500) || ''
    };
  });
}

function getReport(filename) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '');
  return readFileSafe(join(ROOT, 'reports', safe));
}

function runScript(script) {
  try {
    return execSync(`node ${script}`, { cwd: ROOT, timeout: 30000 }).toString();
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}

function getMetrics(apps) {
  const total = apps.length;
  const byStatus = {};
  let scoreSum = 0, scoreCount = 0, topScore = 0, pdfCount = 0;
  for (const app of apps) {
    byStatus[app.status] = (byStatus[app.status] || 0) + 1;
    const s = parseFloat(app.score);
    if (!isNaN(s)) { scoreSum += s; scoreCount++; topScore = Math.max(topScore, s); }
    if (app.pdf?.includes('✅')) pdfCount++;
  }
  return {
    total, byStatus,
    avgScore: scoreCount ? (scoreSum / scoreCount).toFixed(1) : '0.0',
    topScore: topScore.toFixed(1),
    pdfCount,
    actionable: apps.filter(a => !['SKIP', 'Rejected', 'Discarded'].includes(a.status)).length
  };
}

// API Routes
app.get('/api/dashboard', (req, res) => {
  const apps = parseApplications();
  const pipeline = parsePipeline();
  const scanHistory = parseScanHistory();
  const profile = parseProfile();
  const reports = listReports();
  const metrics = getMetrics(apps);
  res.json({ apps, pipeline, scanHistory, profile, reports, metrics });
});

app.get('/api/applications', (req, res) => res.json(parseApplications()));
app.get('/api/pipeline', (req, res) => res.json(parsePipeline()));
app.get('/api/scan-history', (req, res) => res.json(parseScanHistory()));
app.get('/api/profile', (req, res) => res.json(parseProfile()));
app.get('/api/reports', (req, res) => res.json(listReports()));
app.get('/api/reports/:filename', (req, res) => {
  const content = getReport(req.params.filename);
  content ? res.json({ content }) : res.status(404).json({ error: 'Not found' });
});

app.get('/api/patterns', (req, res) => {
  try { res.json(JSON.parse(runScript('analyze-patterns.mjs'))); }
  catch { res.json({ error: 'No data yet' }); }
});

app.get('/api/followups', (req, res) => {
  try { res.json(JSON.parse(runScript('followup-cadence.mjs'))); }
  catch { res.json({ error: 'No data yet' }); }
});

app.get('/api/cv', (req, res) => {
  const content = readFileSafe(join(ROOT, 'cv.md'));
  res.json({ content: content || '' });
});

// Interactive conversation sessions with claude
const sessions = new Map();
let sessionCounter = 0;

// Build prompts by reading mode files directly — claude -p doesn't process slash commands
function buildModePrompt(mode) {
  const shared = readFileSafe(join(ROOT, 'modes/_shared.md')) || '';
  const profile = readFileSafe(join(ROOT, 'modes/_profile.md')) || '';
  const modeFile = readFileSafe(join(ROOT, `modes/${mode}.md`));

  // Modes that need _shared.md + mode file
  const needsShared = ['oferta', 'ofertas', 'pdf', 'contacto', 'apply', 'pipeline', 'scan', 'batch', 'auto-pipeline'];

  let context = '';
  if (needsShared.includes(mode) && modeFile) {
    context = `${shared}\n\n${profile}\n\n${modeFile}`;
  } else if (modeFile) {
    context = `${profile}\n\n${modeFile}`;
  }
  return context;
}

const COMMANDS = {
  'scan':         { mode: 'scan', needsInput: false },
  'pipeline':     { mode: 'pipeline', needsInput: false },
  'tracker':      { mode: 'tracker', needsInput: false },
  'patterns':     { mode: 'patterns', needsInput: false },
  'followup':     { mode: 'followup', needsInput: false },
  'evaluate':     { mode: 'auto-pipeline', needsInput: true, inputLabel: 'Paste JD text or URL' },
  'oferta':       { mode: 'oferta', needsInput: true, inputLabel: 'Paste JD text or URL' },
  'ofertas':      { mode: 'ofertas', needsInput: true, inputLabel: 'Report numbers or company names to compare' },
  'pdf':          { mode: 'pdf', needsInput: true, inputLabel: 'Paste JD text or URL for CV tailoring' },
  'contacto':     { mode: 'contacto', needsInput: true, inputLabel: 'Company name or job URL' },
  'deep':         { mode: 'deep', needsInput: true, inputLabel: 'Company name to research' },
  'training':     { mode: 'training', needsInput: true, inputLabel: 'Course or certification name + URL' },
  'project':      { mode: 'project', needsInput: true, inputLabel: 'Project idea description' },
  'apply':        { mode: 'apply', needsInput: true, inputLabel: 'Application URL or company + role' },
  'batch':        { mode: 'batch', needsInput: false },
  'interview-prep': { mode: 'interview-prep', needsInput: true, inputLabel: 'Company name + role for interview prep' },
};

app.get('/api/commands', (req, res) => {
  const cmds = Object.entries(COMMANDS).map(([id, c]) => ({
    id, mode: c.mode, needsInput: c.needsInput, inputLabel: c.inputLabel || ''
  }));
  res.json(cmds);
});

// Run claude -p with JSON output, return { result, session_id }
function runClaude(prompt, resumeId) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'json', '--permission-mode', 'bypassPermissions'];
    if (resumeId) args.push('--resume', resumeId);

    const proc = spawn('claude', args, {
      cwd: ROOT,
      env: { ...process.env, TERM: 'dumb' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '', stderr = '';
    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.stdout.on('data', c => { stdout += c.toString(); });
    proc.stderr.on('data', c => { stderr += c.toString(); });

    proc.on('close', code => {
      try {
        const parsed = JSON.parse(stdout);
        resolve({ result: parsed.result || '', sessionId: parsed.session_id || null, code });
      } catch {
        // Fallback if JSON parsing fails — treat stdout as plain text
        resolve({ result: stdout || stderr || '(no output)', sessionId: null, code });
      }
    });

    proc.on('error', err => reject(err));

    // Store proc ref on the promise for stop functionality
    resolve.proc = proc;
  });
}

// Start a new conversation session
app.post('/api/session/start', async (req, res) => {
  const { command, input } = req.body;
  const cmd = COMMANDS[command];
  if (!cmd) return res.status(400).json({ error: 'Unknown command' });
  if (cmd.needsInput && !input) return res.status(400).json({ error: 'Input required' });

  const sessionId = ++sessionCounter;
  const modeContext = buildModePrompt(cmd.mode);
  const userMessage = input || `Run the ${command} mode.`;

  const session = {
    id: sessionId,
    command,
    mode: cmd.mode,
    status: 'running',
    messages: [{ role: 'user', text: userMessage, ts: Date.now() }],
    claudeSessionId: null,
    proc: null,
    systemPrompt: modeContext
  };
  sessions.set(sessionId, session);
  res.json({ sessionId, command });

  // Run claude in background with mode context as system prompt
  try {
    const args = ['-p', '--output-format', 'json', '--permission-mode', 'bypassPermissions'];
    if (modeContext) {
      args.push('--system-prompt', modeContext);
    }
    const proc = spawn('claude', args, {
      cwd: ROOT,
      env: { ...process.env, TERM: 'dumb' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    session.proc = proc;

    proc.stdin.write(userMessage);
    proc.stdin.end();

    let stdout = '';
    proc.stdout.on('data', c => { stdout += c.toString(); });
    proc.stderr.on('data', () => {});

    proc.on('close', code => {
      let result = stdout, claudeSid = null;
      try {
        const parsed = JSON.parse(stdout);
        result = parsed.result || '';
        claudeSid = parsed.session_id || null;
      } catch {}

      session.claudeSessionId = claudeSid;
      session.status = 'waiting';
      session.messages.push({ role: 'assistant', text: result, ts: Date.now() });
      session.proc = null;
      broadcast({ type: 'session-response', sessionId, text: result, status: 'waiting' });
    });

    proc.on('error', err => {
      session.status = 'error';
      session.proc = null;
      broadcast({ type: 'session-error', sessionId, error: err.message });
    });
  } catch (err) {
    session.status = 'error';
    broadcast({ type: 'session-error', sessionId, error: err.message });
  }
});

// Send a follow-up reply in an existing session
app.post('/api/session/:id/reply', (req, res) => {
  const session = sessions.get(Number(req.params.id));
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  session.messages.push({ role: 'user', text: message, ts: Date.now() });
  session.status = 'running';
  broadcast({ type: 'session-thinking', sessionId: session.id });

  // Use --resume with the claude session ID for conversation continuity
  const args = ['-p', '--output-format', 'json', '--permission-mode', 'bypassPermissions'];
  if (session.claudeSessionId) {
    args.push('--resume', session.claudeSessionId);
  }

  const proc = spawn('claude', args, {
    cwd: ROOT,
    env: { ...process.env, TERM: 'dumb' },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  session.proc = proc;

  // If we have a claude session to resume, just send the reply.
  // Otherwise, rebuild the full conversation.
  let input;
  if (session.claudeSessionId) {
    input = message;
  } else {
    input = session.messages.map(m =>
      m.role === 'user' ? `Human: ${m.text}` : `Assistant: ${m.text}`
    ).join('\n\n');
  }

  proc.stdin.write(input);
  proc.stdin.end();

  let stdout = '';
  proc.stdout.on('data', c => { stdout += c.toString(); });
  proc.stderr.on('data', () => {});

  proc.on('close', code => {
    let result = stdout, claudeSid = session.claudeSessionId;
    try {
      const parsed = JSON.parse(stdout);
      result = parsed.result || '';
      claudeSid = parsed.session_id || claudeSid;
    } catch {}

    session.claudeSessionId = claudeSid;
    session.status = 'waiting';
    session.messages.push({ role: 'assistant', text: result, ts: Date.now() });
    session.proc = null;
    broadcast({ type: 'session-response', sessionId: session.id, text: result, status: 'waiting' });
  });

  proc.on('error', err => {
    session.status = 'error';
    session.proc = null;
    broadcast({ type: 'session-error', sessionId: session.id, error: err.message });
  });

  res.json({ ok: true });
});

// Get session state
app.get('/api/session/:id', (req, res) => {
  const session = sessions.get(Number(req.params.id));
  if (!session) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: session.id, command: session.command, status: session.status,
    messages: session.messages
  });
});

// Stop a session
app.post('/api/session/:id/stop', (req, res) => {
  const session = sessions.get(Number(req.params.id));
  if (!session) return res.status(404).json({ error: 'Not found' });
  if (session.proc) session.proc.kill('SIGTERM');
  session.status = 'stopped';
  session.proc = null;
  broadcast({ type: 'session-response', sessionId: session.id, text: '(stopped by user)', status: 'stopped' });
  res.json({ ok: true });
});

// WebSocket for live updates
const watchPaths = ['data/applications.md', 'data/pipeline.md', 'data/scan-history.tsv'].map(p => join(ROOT, p));

function broadcast(msg) {
  const payload = JSON.stringify(msg);
  wss.clients.forEach(client => { if (client.readyState === 1) client.send(payload); });
}

for (const p of watchPaths) {
  if (existsSync(p)) {
    watch(p, { persistent: false }, () => broadcast({ type: 'refresh' }));
  }
}

server.listen(PORT, () => {
  console.log(`\n  career-ops dashboard → http://localhost:${PORT}\n`);
});
