/**
 * Career Ops Web Dashboard — Express API Server
 *
 * Reads career-ops data files and exposes a JSON API for the frontend.
 * Set CAREER_OPS_PATH env var to point to your career-ops directory.
 * Defaults to the parent directory of this webapp/ folder.
 *
 * Usage:
 *   cd webapp && npm install && npm start
 *   CAREER_OPS_PATH=/path/to/career-ops npm start
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const CAREER_OPS_PATH = process.env.CAREER_OPS_PATH
  ? path.resolve(process.env.CAREER_OPS_PATH)
  : path.resolve(__dirname, '..');

// ─── Canonical status map ────────────────────────────────────────────────────

/**
 * Maps lower-cased raw status values to their canonical display form.
 * SKIP must remain ALL-CAPS; all other statuses are Title-cased.
 * Any unrecognised value falls back to title-casing the raw input.
 */
const STATUS_MAP = {
  evaluated:  'Evaluated',
  applied:    'Applied',
  responded:  'Responded',
  interview:  'Interview',
  offer:      'Offer',
  rejected:   'Rejected',
  discarded:  'Discarded',
  skip:       'SKIP',
};

function normalizeStatus(raw) {
  if (!raw) return 'Unknown';
  const key = raw.trim().toLowerCase();
  return STATUS_MAP[key]
    ?? (raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase());
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

/**
 * Parse the markdown table in applications.md into structured objects.
 * Handles both pure-pipe format and mixed pipe+tab formats used by career-ops.
 *
 * Table format:
 *   | # | Date | Company | Role | Score | Status | PDF | Report | Notes |
 *
 * Status values are normalised to title-case so that both "applied" and
 * "Applied" map to the same canonical label used by the UI.
 */
function parseApplicationsMd(content) {
  const lines = content.split('\n');
  const apps = [];

  for (const raw of lines) {
    const line = raw.trim();

    // Skip empty, headers, separator rows, section titles
    if (!line || !line.startsWith('|')) continue;
    if (/^\|\s*[-:]+/.test(line)) continue;          // |---|---| separator
    if (/^\|\s*#\s*\|/i.test(line)) continue;        // | # | Date | header

    // Split on pipes, strip leading/trailing pipe, trim each cell
    let parts;
    if (line.includes('\t')) {
      // Mixed format: starts with "| " then tab-separated inside
      const inner = line.replace(/^\|/, '').replace(/\|$/, '');
      parts = inner.split('\t').map((p) => p.replace(/^\||\|$/g, '').trim());
    } else {
      parts = line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((p) => p.trim());
    }

    if (parts.length < 7) continue;

    const [num, date, company, role, scoreRaw, statusRaw, pdf, report, ...rest] = parts;
    const notes = rest.join('|').trim();

    // Normalise status using canonical map (preserves SKIP, etc.)
    const status = normalizeStatus(statusRaw);

    // Parse score
    const scoreMatch = scoreRaw.match(/(\d+\.?\d*)\/5/);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;

    // Parse report link: [001](reports/001-company-date.md)
    const reportMatch = report ? report.match(/\[(\d+)\]\(([^)]+)\)/) : null;

    apps.push({
      number: parseInt(num, 10) || apps.length + 1,
      date: date || '',
      company: company || '',
      role: role || '',
      scoreRaw: scoreRaw || '',
      score,
      status,
      hasPDF: pdf ? pdf.includes('✅') : false,
      reportNumber: reportMatch ? reportMatch[1] : null,
      reportPath: reportMatch ? reportMatch[2] : null,
      notes,
    });
  }

  return apps;
}

/**
 * Compute aggregate metrics from parsed applications.
 * Statuses are expected to be title-cased by parseApplicationsMd().
 */
function computeMetrics(apps) {
  const byStatus = {};
  let totalScore = 0;
  let scoredCount = 0;
  let topScore = 0;
  let withPDF = 0;

  for (const a of apps) {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    if (a.score > 0) {
      totalScore += a.score;
      scoredCount++;
      if (a.score > topScore) topScore = a.score;
    }
    if (a.hasPDF) withPDF++;
  }

  // "Applied" denominator = every post-submit status, including Rejected
  // (Rejected means the company responded, so it counts toward the funnel)
  const applied = apps.filter((a) =>
    ['Applied', 'Responded', 'Interview', 'Offer', 'Rejected'].includes(a.status)
  ).length;
  const responded  = byStatus['Responded']  || 0;
  const interviews = byStatus['Interview']  || 0;
  const offers     = byStatus['Offer']      || 0;

  // Score buckets
  const buckets = [
    { label: '4.5 – 5.0', min: 4.5, max: 5.01, count: 0 },
    { label: '4.0 – 4.4', min: 4.0, max: 4.5,  count: 0 },
    { label: '3.5 – 3.9', min: 3.5, max: 4.0,  count: 0 },
    { label: '3.0 – 3.4', min: 3.0, max: 3.5,  count: 0 },
    { label: '< 3.0',     min: 0,   max: 3.0,  count: 0 },
  ];
  for (const a of apps) {
    if (a.score <= 0) continue;
    for (const b of buckets) {
      if (a.score >= b.min && a.score < b.max) { b.count++; break; }
    }
  }

  return {
    total: apps.length,
    byStatus,
    applied,
    responded,
    interviews,
    offers,
    avgScore:      scoredCount > 0 ? Math.round((totalScore / scoredCount) * 10) / 10 : 0,
    topScore:      Math.round(topScore * 10) / 10,
    withPDF,
    actionable:    apps.filter((a) => a.score >= 4.0).length,
    responseRate:  applied > 0 ? Math.round((responded  / applied) * 100) : 0,
    interviewRate: applied > 0 ? Math.round((interviews / applied) * 100) : 0,
    offerRate:     applied > 0 ? Math.round((offers     / applied) * 100) : 0,
    scoreBuckets:  buckets.map(({ label, count }) => ({ label, count })),
  };
}

// ─── Demo data (used when no actual data files are found) ────────────────────

const DEMO_APPLICATIONS = [
  { number:1,  date:'2026-04-01', company:'Anthropic',    role:'Senior AI Engineer',       scoreRaw:'4.8/5', score:4.8, status:'Interview', hasPDF:true,  reportNumber:'001', reportPath:'reports/001-anthropic-2026-04-01.md', notes:'Dream role' },
  { number:2,  date:'2026-04-02', company:'OpenAI',       role:'Staff ML Engineer',         scoreRaw:'4.5/5', score:4.5, status:'Applied',   hasPDF:true,  reportNumber:'002', reportPath:'reports/002-openai-2026-04-02.md',   notes:'' },
  { number:3,  date:'2026-04-03', company:'Cohere',       role:'LLM Platform Engineer',     scoreRaw:'4.2/5', score:4.2, status:'Applied',   hasPDF:true,  reportNumber:'003', reportPath:null, notes:'Good comp' },
  { number:4,  date:'2026-04-04', company:'Mistral AI',   role:'AI Infrastructure Lead',    scoreRaw:'3.9/5', score:3.9, status:'Evaluated', hasPDF:false, reportNumber:'004', reportPath:null, notes:'' },
  { number:5,  date:'2026-04-05', company:'Acme Corp',    role:'Data Scientist',            scoreRaw:'3.2/5', score:3.2, status:'Rejected',  hasPDF:false, reportNumber:'005', reportPath:null, notes:'Too junior' },
  { number:6,  date:'2026-04-06', company:'TechVenture',  role:'Head of AI',                scoreRaw:'4.6/5', score:4.6, status:'Responded', hasPDF:true,  reportNumber:'006', reportPath:null, notes:'Inbound from recruiter' },
  { number:7,  date:'2026-04-07', company:'Scale AI',     role:'ML Engineer II',            scoreRaw:'2.8/5', score:2.8, status:'Discarded', hasPDF:false, reportNumber:'007', reportPath:null, notes:'Comp below min' },
  { number:8,  date:'2026-04-08', company:'Perplexity',   role:'Applied AI Researcher',     scoreRaw:'4.7/5', score:4.7, status:'Applied',   hasPDF:true,  reportNumber:'008', reportPath:null, notes:'' },
  { number:9,  date:'2026-04-09', company:'Runway ML',    role:'AI Platform Architect',     scoreRaw:'4.1/5', score:4.1, status:'Evaluated', hasPDF:false, reportNumber:'009', reportPath:null, notes:'' },
  { number:10, date:'2026-04-10', company:'Inflection AI',role:'Senior Researcher',         scoreRaw:'4.9/5', score:4.9, status:'Offer',     hasPDF:true,  reportNumber:'010', reportPath:null, notes:'🔥 Strong match' },
];

// ─── Data loaders ─────────────────────────────────────────────────────────────

/**
 * Load and parse applications.md.
 * Returns { apps, demo } where demo=true only when no tracker file was found.
 * An existing file with zero parsed rows (e.g. fresh / header-only) is treated
 * as live with an empty list, not as demo mode.
 */
function loadApplications() {
  const candidates = [
    path.join(CAREER_OPS_PATH, 'data', 'applications.md'),
    path.join(CAREER_OPS_PATH, 'applications.md'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      // File found — parse it even if it yields zero rows (live/empty state)
      const content = fs.readFileSync(p, 'utf-8');
      const apps = parseApplicationsMd(content);
      return { apps, demo: false };
    }
  }

  // No tracker file at all — show demo data
  return { apps: DEMO_APPLICATIONS, demo: true };
}

/**
 * Load pending (unchecked) URLs from data/pipeline.md.
 * Only lines that are unchecked task items ("- [ ] ...") are considered
 * pending; already-processed entries ("- [x] ...") and the Procesadas /
 * Completed sections are ignored.
 */
function loadPipeline() {
  const pipelinePath = path.join(CAREER_OPS_PATH, 'data', 'pipeline.md');
  if (!fs.existsSync(pipelinePath)) return { urls: [], raw: '', demo: true };

  const raw = fs.readFileSync(pipelinePath, 'utf-8');

  // Match only unchecked checklist lines: "- [ ] <url>"
  const urlRegex = /https?:\/\/[^\s\)\]"']+/g;
  const urls = [];

  for (const line of raw.split('\n')) {
    // Only unchecked items: "- [ ]" (not "- [x]" / "- [X]")
    if (!/^\s*-\s+\[ \]/.test(line)) continue;
    const found = line.match(urlRegex);
    if (found) urls.push(...found);
  }

  return { urls: [...new Set(urls)], raw, demo: false };
}

// ─── Allowed directories (for file-serving allowlists) ───────────────────────

const REPORTS_DIR = path.resolve(CAREER_OPS_PATH, 'reports');
const OUTPUT_DIR  = path.resolve(CAREER_OPS_PATH, 'output');

// ─── Static files ─────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ───────────────────────────────────────────────────────────────

app.get('/api/status', (_req, res) => {
  const { demo } = loadApplications();
  res.json({ ok: true, careerOpsPath: CAREER_OPS_PATH, demo, version: '1.0.0' });
});

app.get('/api/applications', (_req, res) => {
  try {
    const { apps, demo } = loadApplications();
    res.json({ applications: apps, demo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/metrics', (_req, res) => {
  try {
    // Reuse the same load so both endpoints that fire in parallel on page load
    // share a single synchronous parse per request cycle.
    const { apps, demo } = loadApplications();
    res.json({ metrics: computeMetrics(apps), demo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pipeline', (_req, res) => {
  try {
    res.json(loadPipeline());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/report', (req, res) => {
  try {
    // Validate that path is a plain string (not array / object from qs parsing)
    const reportPath = req.query.path;
    if (!reportPath || typeof reportPath !== 'string') {
      return res.status(400).json({ error: 'path query param required (string)' });
    }

    // Allowlist: must resolve inside CAREER_OPS_PATH/reports/ and be a .md file
    const fullPath = path.resolve(CAREER_OPS_PATH, reportPath);
    const reportsPrefix = REPORTS_DIR + path.sep;

    if (!fullPath.startsWith(reportsPrefix) && fullPath !== REPORTS_DIR) {
      return res.status(403).json({ error: 'Access denied: must be inside reports/' });
    }
    if (path.extname(fullPath).toLowerCase() !== '.md') {
      return res.status(400).json({ error: 'Only .md report files may be served' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Serve a PDF from output/.
 * Allowlisted to CAREER_OPS_PATH/output/ and .pdf extension only.
 */
app.get('/api/pdf', (req, res) => {
  try {
    const pdfPath = req.query.path;
    if (!pdfPath || typeof pdfPath !== 'string') {
      return res.status(400).json({ error: 'path query param required (string)' });
    }

    const fullPath    = path.resolve(CAREER_OPS_PATH, pdfPath);
    const outputPrefix = OUTPUT_DIR + path.sep;

    if (!fullPath.startsWith(outputPrefix) && fullPath !== OUTPUT_DIR) {
      return res.status(403).json({ error: 'Access denied: must be inside output/' });
    }
    if (path.extname(fullPath).toLowerCase() !== '.pdf') {
      return res.status(400).json({ error: 'Only .pdf files may be served' });
    }
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Extract the PDF path from a report markdown file.
 * Looks for a line matching: **PDF:** output/xxx.pdf
 * or the link form: **PDF:** [text](output/xxx.pdf)
 */
app.get('/api/pdf-path', (req, res) => {
  try {
    const reportPath = req.query.report;
    if (!reportPath || typeof reportPath !== 'string') {
      return res.status(400).json({ error: 'report query param required (string)' });
    }

    const fullPath     = path.resolve(CAREER_OPS_PATH, reportPath);
    const reportsPrefix = REPORTS_DIR + path.sep;

    if (!fullPath.startsWith(reportsPrefix) && fullPath !== REPORTS_DIR) {
      return res.status(403).json({ error: 'Access denied: must be inside reports/' });
    }
    if (path.extname(fullPath).toLowerCase() !== '.md') {
      return res.status(400).json({ error: 'Only .md report files supported' });
    }
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    // Match **PDF:** [label](output/file.pdf)  OR  **PDF:** output/file.pdf
    const match = content.match(
      /\*\*PDF:\*\*\s*(?:\[[^\]]*\]\(([^)]+\.pdf)\)|([^\s\n(]+\.pdf))/i,
    );
    const pdfPath = match ? (match[1] || match[2]) : null;
    res.json({ pdfPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  Career Ops Dashboard');
  console.log('  ─────────────────────────────────────────');
  console.log(`  URL:           http://localhost:${PORT}`);
  console.log(`  Data source:   ${CAREER_OPS_PATH}`);
  const { demo } = loadApplications();
  if (demo) {
    console.log('  Mode:          demo (no applications.md found)');
    console.log('  Tip:           set CAREER_OPS_PATH env var to point to your career-ops directory');
  } else {
    console.log('  Mode:          live');
  }
  console.log('  ─────────────────────────────────────────');
  console.log('');
});
