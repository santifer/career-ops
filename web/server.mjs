import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.CAREER_OPS_ROOT || path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3007;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const STATUS_FALLBACK = [
  { id: 'evaluated', label: 'Evaluated', group: 'evaluated', description: 'Offer evaluated with report, pending decision' },
  { id: 'applied', label: 'Applied', group: 'applied', description: 'Application submitted' },
  { id: 'responded', label: 'Responded', group: 'responded', description: 'Company has responded' },
  { id: 'interview', label: 'Interview', group: 'interview', description: 'Active interview process' },
  { id: 'offer', label: 'Offer', group: 'offer', description: 'Offer received' },
  { id: 'rejected', label: 'Rejected', group: 'rejected', description: 'Rejected by company' },
  { id: 'discarded', label: 'Discarded', group: 'discarded', description: 'Discarded by candidate or offer closed' },
  { id: 'skip', label: 'SKIP', group: 'skip', description: "Doesn't fit, don't apply" },
];

const MODE_DEFS = {
  evaluate: {
    title: 'Auto-Pipeline',
    cta: 'Evaluate Job',
    description: 'Run the full evaluation pipeline from a job URL or pasted JD text.',
    inputLabel: 'Job URL or description',
    placeholder: 'https://careers.example.com/job/12345 or paste the full JD text here',
    multiline: true,
    requiresInput: true,
    label: ({ input }) => (isProbablyUrl(input) ? `Evaluate: ${input}` : 'Evaluate Job Description'),
    buildPrompt: ({ input }) => input,
  },
  pdf: {
    title: 'Generate PDF',
    cta: 'Generate PDF',
    description: 'Run the ATS PDF mode with a job URL or pasted JD text.',
    inputLabel: 'Job URL or description',
    placeholder: 'Paste the job URL or the JD you want to target with a tailored PDF',
    multiline: true,
    requiresInput: true,
    label: ({ input }) => (isProbablyUrl(input) ? `Generate PDF: ${input}` : 'Generate Targeted PDF'),
    buildPrompt: ({ input }) => `/career-ops pdf\n\n${input}`,
  },
  ofertas: {
    title: 'Compare Offers',
    cta: 'Compare Offers',
    description: 'Compare multiple job offers or evaluated reports side by side.',
    inputLabel: 'Offers to compare',
    placeholder: 'Paste two or more offers, URLs, or report references to compare',
    multiline: true,
    requiresInput: true,
    label: () => 'Compare Offers',
    buildPrompt: ({ input }) => `/career-ops ofertas\n\n${input}`,
  },
  deep: {
    title: 'Deep Research',
    cta: 'Generate Research Brief',
    description: 'Produce the deep research prompt for a company and role.',
    inputLabel: 'Company and role context',
    placeholder: 'Company, role, JD link, and any interview context you want included',
    multiline: true,
    requiresInput: true,
    label: () => 'Deep Research',
    buildPrompt: ({ input }) => `/career-ops deep\n\n${input}`,
  },
  contacto: {
    title: 'LinkedIn Outreach',
    cta: 'Draft Outreach',
    description: 'Generate the LinkedIn power move outreach message.',
    inputLabel: 'Company and target role context',
    placeholder: 'Company, role, hiring team context, report #, or notes for the outreach draft',
    multiline: true,
    requiresInput: true,
    label: () => 'LinkedIn Outreach',
    buildPrompt: ({ input }) => `/career-ops contacto\n\n${input}`,
  },
  apply: {
    title: 'Apply Assistant',
    cta: 'Draft Answers',
    description: 'Generate tailored application answers from pasted form questions or context.',
    inputLabel: 'Application form context',
    placeholder: 'Paste the company, role, URL, and visible form questions or prompts',
    multiline: true,
    requiresInput: true,
    label: () => 'Application Assistant',
    buildPrompt: ({ input }) => `/career-ops apply\n\n${input}`,
  },
  training: {
    title: 'Training Evaluation',
    cta: 'Evaluate Training',
    description: 'Assess a course or certification against your job-search goals.',
    inputLabel: 'Course or certification details',
    placeholder: 'Paste the training name, URL, syllabus, pricing, and why you are considering it',
    multiline: true,
    requiresInput: true,
    label: () => 'Training Evaluation',
    buildPrompt: ({ input }) => `/career-ops training\n\n${input}`,
  },
  project: {
    title: 'Project Evaluation',
    cta: 'Evaluate Project',
    description: 'Score a portfolio project idea and produce an interview-pack direction.',
    inputLabel: 'Project idea',
    placeholder: 'Describe the project, target roles, and any constraints or goals',
    multiline: true,
    requiresInput: true,
    label: () => 'Project Evaluation',
    buildPrompt: ({ input }) => `/career-ops project\n\n${input}`,
  },
  tracker: {
    title: 'Tracker Review',
    cta: 'Run Tracker Review',
    description: 'Have Claude summarize your tracker state or answer tracker questions.',
    inputLabel: 'Optional tracker question',
    placeholder: 'Optional: "What should I prioritize next?" or leave blank for a general review',
    multiline: true,
    requiresInput: false,
    label: () => 'Tracker Review',
    buildPrompt: ({ input }) => (input ? `/career-ops tracker\n\n${input}` : '/career-ops tracker'),
  },
  scan: {
    title: 'Scan Portals',
    cta: 'Scan Now',
    description: 'Run the configured portal scanner.',
    requiresInput: false,
    label: () => 'Portal Scan',
    buildPrompt: () => '/career-ops scan',
  },
  pipeline: {
    title: 'Process Pipeline',
    cta: 'Process Pipeline',
    description: 'Process every pending URL in data/pipeline.md.',
    requiresInput: false,
    label: () => 'Process Pipeline',
    buildPrompt: () => '/career-ops pipeline',
  },
  batch: {
    title: 'Batch Evaluate',
    cta: 'Run Batch',
    description: 'Run batch processing against the current batch inputs, optionally with extra instructions.',
    inputLabel: 'Optional batch instructions',
    placeholder: 'Optional: dry-run notes, retry guidance, or a short instruction for the batch run',
    multiline: true,
    requiresInput: false,
    label: () => 'Batch Evaluate',
    buildPrompt: ({ input }) => (input ? `/career-ops batch\n\n${input}` : '/career-ops batch'),
  },
};

// --- Job Manager (runs claude commands, tracks active jobs) ---
const jobs = new Map();
let jobCounter = 0;

function runClaudeJob(prompt, label) {
  const id = ++jobCounter;
  const job = { id, label, prompt, status: 'running', output: '', startedAt: Date.now(), pid: null };
  jobs.set(id, job);

  const proc = spawn('claude', ['-p', '--model', 'sonnet', '--dangerously-skip-permissions', prompt], {
    cwd: ROOT,
    env: { ...process.env, HOME: process.env.HOME },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  job.pid = proc.pid;

  proc.stdout.on('data', chunk => {
    job.output += chunk.toString();
  });

  proc.stderr.on('data', chunk => {
    job.output += chunk.toString();
  });

  proc.on('close', code => {
    job.status = code === 0 ? 'completed' : 'failed';
    job.exitCode = code;
    job.finishedAt = Date.now();
  });

  proc.on('error', err => {
    job.status = 'failed';
    job.output += `\nError: ${err.message}`;
    job.finishedAt = Date.now();
  });

  return job;
}

function isProbablyUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function normalizeModeInput(body = {}) {
  if (typeof body.input === 'string') return body.input.trim();
  if (typeof body.url === 'string') return body.url.trim();
  if (typeof body.text === 'string') return body.text.trim();
  return '';
}

function toPublicMode(mode, def) {
  return {
    mode,
    title: def.title,
    cta: def.cta,
    description: def.description,
    inputLabel: def.inputLabel || '',
    placeholder: def.placeholder || '',
    multiline: Boolean(def.multiline),
    requiresInput: Boolean(def.requiresInput),
  };
}

function startModeJob(mode, body = {}) {
  const def = MODE_DEFS[mode];
  if (!def) {
    const err = new Error('Unknown mode');
    err.statusCode = 404;
    throw err;
  }

  const input = normalizeModeInput(body);
  if (def.requiresInput && !input) {
    const err = new Error('Input required');
    err.statusCode = 400;
    throw err;
  }

  const prompt = def.buildPrompt({ input, body });
  if (!prompt || typeof prompt !== 'string') {
    const err = new Error('Unable to build prompt');
    err.statusCode = 400;
    throw err;
  }

  return runClaudeJob(prompt.trim(), def.label({ input, body }));
}

function sendModeJob(res, mode, body = {}) {
  try {
    const job = startModeJob(mode, body);
    res.json({ jobId: job.id, status: job.status, mode });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to start job' });
  }
}

// --- Data Parsers ---

function stripAnsi(text = '') {
  return String(text)
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\r/g, '');
}

function humanizeSlug(slug = '') {
  return String(slug)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function extractMarkdownTitle(content, fallback = '') {
  const clean = stripAnsi(content);
  const heading = clean.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : fallback;
}

function extractMarkdownSummary(content) {
  const clean = stripAnsi(content);
  const blocks = clean
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    if (/^#{1,6}\s/.test(block)) continue;
    if (/^```/.test(block)) continue;
    if (/^[*-]\s/.test(block)) continue;
    if (/^\d+\.\s/.test(block)) continue;
    if (/^\|/.test(block)) continue;
    const singleLine = block.replace(/\n+/g, ' ').trim();
    if (singleLine.length >= 40) return singleLine;
  }

  const line = clean.split('\n').map(item => item.trim()).find(item => item && !item.startsWith('#'));
  return line || '';
}

function extractMarkdownSections(content, limit = 4) {
  const clean = stripAnsi(content);
  return [...clean.matchAll(/^##+\s+(.+)$/gm)]
    .map(match => match[1].trim())
    .filter(Boolean)
    .slice(0, limit);
}

function looksLikeMarkdown(content) {
  const clean = stripAnsi(content).trim();
  if (!clean) return false;
  return [
    /^#{1,6}\s/m,
    /^\s*[-*]\s/m,
    /^\s*\d+\.\s/m,
    /^\|.+\|/m,
    /```/,
    /\*\*[^*]+\*\*/,
  ].some(pattern => pattern.test(clean));
}

function buildReportMeta(filename, apps = []) {
  const filePath = path.join(ROOT, 'reports', filename);
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');
  const fileMatch = filename.match(/^(\d+)-(.*)-(\d{4}-\d{2}-\d{2})\.md$/);
  const app = apps.find(item => path.basename(item.reportPath || '') === filename)
    || apps.find(item => fileMatch && item.number === parseInt(fileMatch[1], 10));

  const fallbackTitle = app
    ? `${app.company}${app.role ? ` · ${app.role}` : ''}`
    : humanizeSlug(fileMatch?.[2] || filename.replace(/\.md$/, ''));

  return {
    filename,
    number: fileMatch ? parseInt(fileMatch[1], 10) : app?.number || null,
    date: fileMatch?.[3] || app?.date || '',
    company: app?.company || '',
    role: app?.role || '',
    score: app?.score || '',
    scoreNum: app?.scoreNum || 0,
    status: app?.status || '',
    hasPDF: Boolean(app?.hasPDF),
    title: extractMarkdownTitle(content, fallbackTitle),
    excerpt: extractMarkdownSummary(content),
    sections: extractMarkdownSections(content),
    markdown: content,
  };
}

function parseApplications() {
  const file = path.join(ROOT, 'data', 'applications.md');
  if (!fs.existsSync(file)) return [];

  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  const apps = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || trimmed.startsWith('| #') || trimmed.startsWith('|--') || trimmed.startsWith('|---')) continue;

    const cols = trimmed.split('|').map(col => col.trim()).filter(Boolean);
    if (cols.length < 9) continue;

    const num = parseInt(cols[0], 10);
    if (Number.isNaN(num)) continue;

    const reportMatch = cols[7].match(/\[.*?\]\((.*?)\)/);
    const reportPath = reportMatch ? reportMatch[1] : null;

    apps.push({
      number: num,
      date: cols[1],
      company: cols[2],
      role: cols[3],
      score: cols[4],
      scoreNum: parseFloat(cols[4]) || 0,
      status: cols[5],
      hasPDF: cols[6].includes('✅'),
      hasReport: Boolean(reportPath),
      reportPath,
      notes: cols[8] || '',
    });
  }

  return apps;
}

function parsePipeline() {
  const file = path.join(ROOT, 'data', 'pipeline.md');
  if (!fs.existsSync(file)) return { pending: [], errors: [], processed: [] };

  const content = fs.readFileSync(file, 'utf-8');
  const pending = [];
  const errors = [];
  const processed = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- [ ]')) {
      const rest = trimmed.slice(5).trim();
      const parts = rest.split('|').map(part => part.trim());
      pending.push({ url: parts[0], company: parts[1] || '', role: parts[2] || '' });
      continue;
    }

    if (trimmed.startsWith('- [!]')) {
      const rest = trimmed.slice(5).trim();
      errors.push({ text: rest });
      continue;
    }

    if (trimmed.startsWith('- [x]')) {
      const rest = trimmed.slice(5).trim();
      const parts = rest.split('|').map(part => part.trim());
      processed.push({
        number: parts[0]?.replace('#', ''),
        url: parts[1] || '',
        company: parts[2] || '',
        role: parts[3] || '',
        score: parts[4] || '',
        pdf: parts[5] || '',
      });
    }
  }

  return { pending, errors, processed };
}

function parseScanHistory() {
  const file = path.join(ROOT, 'data', 'scan-history.tsv');
  if (!fs.existsSync(file)) return [];

  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  if (lines.length < 2) return [];

  return lines.slice(1).map(line => {
    const cols = line.split('\t');
    return {
      url: cols[0] || '',
      date: cols[1] || '',
      queryName: cols[2] || '',
      title: cols[3] || '',
      company: cols[4] || '',
      status: cols[5] || '',
    };
  });
}

function stripQuotes(value) {
  return value.replace(/^["']|["']$/g, '').trim();
}

function extractYamlScalar(content, key) {
  const pattern = new RegExp(`^\\s*${key}:\\s*"?(.+?)"?\\s*$`, 'm');
  const match = content.match(pattern);
  return match ? stripQuotes(match[1]) : '';
}

function extractYamlList(content, section, key) {
  const lines = content.split('\n');
  const items = [];
  let inSection = false;
  let inKey = false;

  for (const rawLine of lines) {
    if (/^[A-Za-z_][\w-]*:\s*$/.test(rawLine)) {
      inSection = rawLine.startsWith(`${section}:`);
      inKey = false;
      continue;
    }

    if (!inSection) continue;

    const keyMatch = rawLine.match(/^  ([A-Za-z_][\w-]*):\s*$/);
    if (keyMatch) {
      inKey = keyMatch[1] === key;
      continue;
    }

    if (inKey) {
      const itemMatch = rawLine.match(/^    -\s+"?(.+?)"?\s*$/);
      if (itemMatch) {
        items.push(stripQuotes(itemMatch[1]));
        continue;
      }
      if (!rawLine.startsWith('    ')) break;
    }
  }

  return items;
}

function loadProfile() {
  const file = path.join(ROOT, 'config', 'profile.yml');
  if (!fs.existsSync(file)) return null;

  const content = fs.readFileSync(file, 'utf-8');
  return {
    candidate: {
      full_name: extractYamlScalar(content, 'full_name'),
      email: extractYamlScalar(content, 'email'),
      phone: extractYamlScalar(content, 'phone'),
      location: extractYamlScalar(content, 'location'),
      linkedin: extractYamlScalar(content, 'linkedin'),
      portfolio_url: extractYamlScalar(content, 'portfolio_url'),
      github: extractYamlScalar(content, 'github'),
    },
    target_roles: {
      primary: extractYamlList(content, 'target_roles', 'primary'),
    },
    narrative: {
      headline: extractYamlScalar(content, 'headline'),
      exit_story: extractYamlScalar(content, 'exit_story'),
    },
    compensation: {
      target_range: extractYamlScalar(content, 'target_range'),
      currency: extractYamlScalar(content, 'currency'),
      minimum: extractYamlScalar(content, 'minimum'),
      location_flexibility: extractYamlScalar(content, 'location_flexibility'),
    },
    location: {
      country: extractYamlScalar(content, 'country'),
      city: extractYamlScalar(content, 'city'),
      timezone: extractYamlScalar(content, 'timezone'),
      visa_status: extractYamlScalar(content, 'visa_status'),
    },
  };
}

function loadStates() {
  const file = path.join(ROOT, 'templates', 'states.yml');
  if (!fs.existsSync(file)) return STATUS_FALLBACK;

  const content = fs.readFileSync(file, 'utf-8');
  const states = [];
  let current = null;

  for (const line of content.split('\n')) {
    const idMatch = line.match(/^\s+-\s+id:\s+(\w+)/);
    if (idMatch) {
      current = { id: idMatch[1] };
      states.push(current);
      continue;
    }

    if (!current) continue;

    const labelMatch = line.match(/^\s+label:\s+(.+)/);
    if (labelMatch) current.label = labelMatch[1].trim();

    const aliasMatch = line.match(/^\s+aliases:\s+\[(.*)\]/);
    if (aliasMatch) {
      current.aliases = aliasMatch[1]
        .split(',')
        .map(alias => alias.trim())
        .filter(Boolean);
    }

    const descriptionMatch = line.match(/^\s+description:\s+(.+)/);
    if (descriptionMatch) current.description = descriptionMatch[1].trim();

    const groupMatch = line.match(/^\s+dashboard_group:\s+(.+)/);
    if (groupMatch) current.group = groupMatch[1].trim();
  }

  return states.length ? states : STATUS_FALLBACK;
}

function getMetrics(apps) {
  const byStatus = {};
  let totalScore = 0;
  let scoredCount = 0;
  let topScore = 0;
  let withPDF = 0;
  let withReport = 0;

  for (const app of apps) {
    byStatus[app.status] = (byStatus[app.status] || 0) + 1;
    if (app.scoreNum > 0) {
      totalScore += app.scoreNum;
      scoredCount += 1;
      if (app.scoreNum > topScore) topScore = app.scoreNum;
    }
    if (app.hasPDF) withPDF += 1;
    if (app.hasReport) withReport += 1;
  }

  return {
    total: apps.length,
    byStatus,
    avgScore: scoredCount > 0 ? (totalScore / scoredCount).toFixed(1) : '0',
    topScore: topScore.toFixed(1),
    withPDF,
    withReport,
    actionable: ['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer']
      .reduce((sum, status) => sum + (byStatus[status] || 0), 0),
  };
}

function getPdfFiles() {
  const outputDir = path.join(ROOT, 'output');
  if (!fs.existsSync(outputDir)) return [];
  return fs.readdirSync(outputDir).filter(file => file.endsWith('.pdf')).sort().reverse();
}

function safeLocalPath(localRef) {
  const relative = localRef.replace(/^local:/, '').replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, relative);
  if (!filePath.startsWith(ROOT)) return null;
  return filePath;
}

function stripHtml(html) {
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
  text = text.replace(/<\/?(h[1-6]|p|div|li|br|tr)[^>]*>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '\n• ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  text = text.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  text = text.replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n(\s*\n)+/g, '\n\n');
  return text.trim();
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function urlToSlug(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').split('.')[0];
    const pathPart = parsed.pathname.replace(/\//g, '-').replace(/^-|-$/g, '').slice(0, 40);
    return slugify(`${host}-${pathPart}`) || slugify(host);
  } catch {
    return 'unknown';
  }
}

const jdCache = new Map();

// --- API Routes ---

app.get('/api/modes', (req, res) => {
  res.json(Object.entries(MODE_DEFS).map(([mode, def]) => toPublicMode(mode, def)));
});

app.get('/api/applications', (req, res) => {
  const apps = parseApplications();
  res.json({ applications: apps, metrics: getMetrics(apps) });
});

app.get('/api/pipeline', (req, res) => {
  res.json(parsePipeline());
});

app.get('/api/scan-history', (req, res) => {
  res.json(parseScanHistory());
});

app.get('/api/profile', (req, res) => {
  res.json(loadProfile() || {});
});

app.get('/api/states', (req, res) => {
  res.json(loadStates());
});

app.get('/api/reports', (req, res) => {
  const reportsDir = path.join(ROOT, 'reports');
  if (!fs.existsSync(reportsDir)) return res.json([]);
  const apps = parseApplications();
  const reports = fs.readdirSync(reportsDir)
    .filter(file => file.endsWith('.md'))
    .sort()
    .reverse()
    .map(file => buildReportMeta(file, apps))
    .filter(Boolean)
    .map(({ markdown, ...meta }) => meta);
  res.json(reports);
});

app.get('/api/reports/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename.endsWith('.md')) return res.status(400).json({ error: 'Invalid filename' });

  const filePath = path.join(ROOT, 'reports', filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Report not found' });

  const content = fs.readFileSync(filePath, 'utf-8');
  const meta = buildReportMeta(filename, parseApplications());
  res.json({
    filename,
    markdown: content,
    html: marked(content),
    meta: meta ? { ...meta, markdown: undefined } : null,
  });
});

app.get('/api/pdfs', (req, res) => {
  res.json(getPdfFiles());
});

app.get('/api/pdfs/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename.endsWith('.pdf')) return res.status(400).json({ error: 'Invalid filename' });

  const filePath = path.join(ROOT, 'output', filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'PDF not found' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

app.get('/api/health', (req, res) => {
  const checks = {
    cv: fs.existsSync(path.join(ROOT, 'cv.md')),
    profile: fs.existsSync(path.join(ROOT, 'config', 'profile.yml')),
    portals: fs.existsSync(path.join(ROOT, 'portals.yml')),
    applications: fs.existsSync(path.join(ROOT, 'data', 'applications.md')),
    pipeline: fs.existsSync(path.join(ROOT, 'data', 'pipeline.md')),
  };

  res.json({ status: 'ok', checks });
});

app.post('/api/modes/:mode/run', (req, res) => {
  sendModeJob(res, req.params.mode, req.body);
});

// --- Legacy Action Endpoints ---

app.post('/api/evaluate', (req, res) => {
  sendModeJob(res, 'evaluate', req.body);
});

app.post('/api/scan', (req, res) => {
  sendModeJob(res, 'scan', req.body);
});

app.post('/api/process-pipeline', (req, res) => {
  sendModeJob(res, 'pipeline', req.body);
});

app.post('/api/batch', (req, res) => {
  sendModeJob(res, 'batch', req.body);
});

app.post('/api/pdf', (req, res) => {
  sendModeJob(res, 'pdf', req.body);
});

app.post('/api/tracker', (req, res) => {
  sendModeJob(res, 'tracker', req.body);
});

app.post('/api/apply', (req, res) => {
  sendModeJob(res, 'apply', req.body);
});

app.post('/api/contacto', (req, res) => {
  sendModeJob(res, 'contacto', req.body);
});

app.post('/api/deep', (req, res) => {
  sendModeJob(res, 'deep', req.body);
});

app.post('/api/training', (req, res) => {
  sendModeJob(res, 'training', req.body);
});

app.post('/api/project', (req, res) => {
  sendModeJob(res, 'project', req.body);
});

app.post('/api/ofertas', (req, res) => {
  sendModeJob(res, 'ofertas', req.body);
});

app.get('/api/jobs', (req, res) => {
  const list = [...jobs.values()].map(job => ({
    id: job.id,
    label: job.label,
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  })).reverse();

  res.json(list);
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(parseInt(req.params.id, 10));
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const output = stripAnsi(job.output || '');

  res.json({
    id: job.id,
    label: job.label,
    status: job.status,
    output,
    summary: extractMarkdownSummary(output),
    html: looksLikeMarkdown(output) ? marked(output) : '',
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    exitCode: job.exitCode,
  });
});

app.patch('/api/applications/:number', (req, res) => {
  const num = parseInt(req.params.number, 10);
  const { status } = req.body;
  if (!status || typeof status !== 'string') return res.status(400).json({ error: 'Status required' });

  const validStatuses = new Set(loadStates().map(state => state.label));
  if (!validStatuses.has(status)) return res.status(400).json({ error: 'Invalid status' });

  const file = path.join(ROOT, 'data', 'applications.md');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'No applications file' });

  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  let found = false;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx].trim();
    if (!line.startsWith('|')) continue;

    const cols = line.split('|').map(col => col.trim()).filter(Boolean);
    if (cols.length < 9) continue;

    if (parseInt(cols[0], 10) === num) {
      cols[5] = status;
      lines[idx] = `| ${cols.join(' | ')} |`;
      found = true;
      break;
    }
  }

  if (!found) return res.status(404).json({ error: 'Application not found' });

  fs.writeFileSync(file, lines.join('\n'), 'utf-8');
  res.json({ ok: true });
});

// --- CV Management ---

app.get('/api/cv', (req, res) => {
  const file = path.join(ROOT, 'cv.md');
  if (!fs.existsSync(file)) return res.json({ exists: false, content: '' });
  res.json({ exists: true, content: fs.readFileSync(file, 'utf-8') });
});

app.put('/api/cv', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: 'Content required' });
  fs.writeFileSync(path.join(ROOT, 'cv.md'), content, 'utf-8');
  res.json({ ok: true });
});

// --- Profile Management ---

app.get('/api/profile/raw', (req, res) => {
  const file = path.join(ROOT, 'config', 'profile.yml');
  if (!fs.existsSync(file)) return res.json({ exists: false, content: '' });
  res.json({ exists: true, content: fs.readFileSync(file, 'utf-8') });
});

app.put('/api/profile/raw', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: 'Content required' });
  fs.writeFileSync(path.join(ROOT, 'config', 'profile.yml'), content, 'utf-8');
  res.json({ ok: true });
});

// --- Portals Management ---

app.get('/api/portals/raw', (req, res) => {
  const file = path.join(ROOT, 'portals.yml');
  if (!fs.existsSync(file)) return res.json({ exists: false, content: '' });
  res.json({ exists: true, content: fs.readFileSync(file, 'utf-8') });
});

app.put('/api/portals/raw', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: 'Content required' });
  fs.writeFileSync(path.join(ROOT, 'portals.yml'), content, 'utf-8');
  res.json({ ok: true });
});

// --- JD Scraper & Cache ---

app.get('/api/jd', async (req, res) => {
  const input = req.query.url;
  if (!input || typeof input !== 'string') return res.status(400).json({ error: 'url query param required' });

  if (input.startsWith('local:')) {
    const filePath = safeLocalPath(input);
    if (!filePath) return res.status(400).json({ error: 'Invalid local path' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Local JD not found' });

    const text = fs.readFileSync(filePath, 'utf-8');
    return res.json({
      url: input,
      title: path.basename(filePath),
      text: text.slice(0, 30000),
      fetchedAt: new Date().toISOString(),
      source: 'local',
    });
  }

  try {
    new URL(input);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (jdCache.has(input)) return res.json(jdCache.get(input));

  const jdsDir = path.join(ROOT, 'jds');
  const slug = urlToSlug(input);
  const cacheFile = path.join(jdsDir, `${slug}.json`);

  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      jdCache.set(input, cached);
      return res.json(cached);
    } catch {
      // Re-fetch if cache is corrupt.
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(input, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!resp.ok) return res.status(502).json({ error: `Upstream returned ${resp.status}` });

    const html = await resp.text();
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/si);
    const pageTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    const result = {
      url: input,
      title: pageTitle,
      text: stripHtml(html).slice(0, 30000),
      fetchedAt: new Date().toISOString(),
      source: 'remote',
    };

    if (!fs.existsSync(jdsDir)) fs.mkdirSync(jdsDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2), 'utf-8');
    jdCache.set(input, result);

    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Failed to fetch: ${err.message}` });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Career-Ops Web → http://localhost:${PORT}`);
});
