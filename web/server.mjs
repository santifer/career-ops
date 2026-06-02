// career-ops dashboard server
// Zero new deps: uses Node built-in http + already-installed js-yaml.
// Run: npm run web  (default port 5757, override with PORT env)

import { createServer } from 'node:http';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 5757;

const PORTALS_PATH = join(ROOT, 'portals.yml');
const PIPELINE_PATH = join(ROOT, 'data', 'pipeline.md');
const SCAN_HISTORY_PATH = join(ROOT, 'data', 'scan-history.tsv');
const APPLICATIONS_PATH = join(ROOT, 'data', 'applications.md');
const APP_CONTENT_DIR = join(ROOT, 'data', 'applications-content');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function sendJson(res, status, obj) { send(res, status, obj); }
function sendErr(res, status, msg) { sendJson(res, status, { error: msg }); }

async function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolveBody({});
      try { resolveBody(JSON.parse(raw)); } catch (e) { rejectBody(e); }
    });
    req.on('error', rejectBody);
  });
}

// ---------------------------------------------------------------- Scan history
async function getScanHistory() {
  const raw = await readFile(SCAN_HISTORY_PATH, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const [headerLine, ...dataLines] = lines;
  const headers = headerLine.split('\t');
  const rows = dataLines.map(line => {
    const cells = line.split('\t');
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
  // Aggregate stats
  const byStatus = {};
  const byCompany = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    byCompany[r.company] = (byCompany[r.company] || 0) + 1;
  }
  return { headers, rows, byStatus, byCompany, total: rows.length };
}

// ------------------------------------------------------------------- Pipeline
async function getPipeline() {
  const raw = await readFile(PIPELINE_PATH, 'utf8');
  const parseLine = (line) => {
    // Procesadas with #NNN + score: - [x] #NNN | url | company | title | score | pdf
    const proc = line.match(/^-\s*\[x\]\s*#(\d+)\s*\|\s*(\S+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.+)$/);
    if (proc) {
      return {
        done: true, num: proc[1], url: proc[2].trim(),
        company: proc[3].trim(), title: proc[4].trim(),
        score: proc[5].trim(), pdf: proc[6].trim(),
      };
    }
    // Pendientes/legacy/mismatchs: - [ ] url | company | title  or  - [~] url | company | title
    const pen = line.match(/^-\s*\[([ x~])\]\s*(\S+)\s*\|\s*([^|]+?)\s*\|\s*(.+)$/);
    if (pen) {
      return {
        done: pen[1] === 'x', pruned: pen[1] === '~',
        url: pen[2].trim(), company: pen[3].trim(), title: pen[4].trim(),
      };
    }
    return null;
  };
  const sections = { pendientes: [], procesadas: [], mismatchs: [] };
  let current = null;
  for (const line of raw.split(/\r?\n/)) {
    if (/^##\s+Pendientes/i.test(line)) { current = 'pendientes'; continue; }
    if (/^##\s+Procesadas/i.test(line)) { current = 'procesadas'; continue; }
    if (/^##\s+Mismatch/i.test(line)) { current = 'mismatchs'; continue; }
    if (!current) continue;
    const item = parseLine(line);
    if (item) sections[current].push(item);
  }
  return sections;
}

// ------------------------------------------------------------------- Reports
async function getReportsIndex() {
  const { readdir } = await import('node:fs/promises');
  const dir = join(ROOT, 'reports');
  try {
    const files = await readdir(dir);
    const index = {};
    for (const f of files) {
      const m = f.match(/^(\d{3})-/);
      if (m && f.endsWith('.md')) index[m[1]] = f;
    }
    return index;
  } catch {
    return {};
  }
}

// --------------------------------------------------------------- Applications
async function getApplications() {
  const raw = await readFile(APPLICATIONS_PATH, 'utf8');
  const rows = [];
  let inTable = false;
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('| # ') && line.includes('Company')) { inTable = true; continue; }
    if (inTable && line.startsWith('|---')) continue;
    if (inTable && !line.startsWith('|')) { inTable = false; continue; }
    if (!inTable) continue;
    // Split safely on '|' but keep cell content intact
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 5) continue;
    // Observed layout: # | Date | Company | Role | Score | Status | PDF | Report | Notes
    const [num, date, company, role, score, status, pdf, report, ...rest] = cells;
    const notes = rest.join(' | ');
    rows.push({ num, date, company, role, score, status, pdf, report, notes });
  }
  // Stats
  const byStatus = {};
  for (const r of rows) { byStatus[r.status] = (byStatus[r.status] || 0) + 1; }
  return { rows, byStatus, total: rows.length };
}

// ------------------------------------------------------------------- Portals
async function getPortals() {
  const raw = await readFile(PORTALS_PATH, 'utf8');
  const parsed = yaml.load(raw);
  return {
    location_filter: parsed.location_filter ?? null,
    freshness_filter: parsed.freshness_filter ?? null,
    remote_filter: parsed.remote_filter ?? null,
    title_filter: parsed.title_filter ?? null,
    tracked_companies: parsed.tracked_companies ?? [],
    search_queries: parsed.search_queries ?? [],
  };
}

// Format a single company entry as YAML text matching the file's existing style.
function formatCompanyBlock(company) {
  const out = [];
  out.push(`  - name: ${company.name}`);
  if (company.careers_url) out.push(`    careers_url: ${company.careers_url}`);
  if (company.api) out.push(`    api: ${company.api}`);
  if (company.api_provider) out.push(`    api_provider: ${company.api_provider}`);
  if (company.scan_method) out.push(`    scan_method: ${company.scan_method}`);
  if (company.scan_query) {
    const q = String(company.scan_query);
    const quoted = q.includes("'") ? `"${q.replace(/"/g, '\\"')}"` : `'${q}'`;
    out.push(`    scan_query: ${quoted}`);
  }
  if (company.notes) {
    const n = String(company.notes);
    const quoted = n.includes('"') ? `'${n.replace(/'/g, "''")}'` : `"${n}"`;
    out.push(`    notes: ${quoted}`);
  }
  out.push(`    enabled: ${company.enabled !== false}`);
  return out.join('\n');
}

// Locate the start/end line indices of the block for a given company name.
// Returns { startIdx, endIdx } inclusive, or null if not found.
function findCompanyBlock(lines, name) {
  const startRe = new RegExp(`^\\s*-\\s+name:\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
  let trackedAt = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^tracked_companies:\s*$/.test(lines[i])) { trackedAt = i; break; }
  }
  if (trackedAt === -1) return null;
  for (let i = trackedAt + 1; i < lines.length; i++) {
    if (startRe.test(lines[i])) {
      // End is the line BEFORE the next "  - name:" or the next top-level key
      let end = lines.length - 1;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s*-\s+name:\s/.test(lines[j])) { end = j - 1; break; }
        if (/^[a-z_]+:\s*$/.test(lines[j])) { end = j - 1; break; }
      }
      return { startIdx: i, endIdx: end };
    }
  }
  return null;
}

function detectEol(raw) { return raw.includes('\r\n') ? '\r\n' : '\n'; }
function detectTrailingEol(raw) { return /\r?\n$/.test(raw); }

async function writePortals(lines, eol) {
  const raw = await readFile(PORTALS_PATH, 'utf8');
  const trailing = detectTrailingEol(raw);
  await writeFile(PORTALS_PATH, lines.join(eol) + (trailing ? eol : ''), 'utf8');
}

async function addCompany(company) {
  if (!company?.name) throw new Error('name required');
  const raw = await readFile(PORTALS_PATH, 'utf8');
  const eol = detectEol(raw);
  const lines = raw.split(/\r?\n/);
  // Reject duplicate
  if (findCompanyBlock(lines, company.name)) {
    throw new Error(`Company "${company.name}" already exists`);
  }
  // Find end of tracked_companies section: last "  - name:" block or last indented line before top-level key
  let trackedAt = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^tracked_companies:\s*$/.test(lines[i])) { trackedAt = i; break; }
  }
  if (trackedAt === -1) throw new Error('tracked_companies section not found');
  let insertAt = lines.length;
  for (let i = trackedAt + 1; i < lines.length; i++) {
    if (/^[a-z_]+:\s*$/.test(lines[i])) { insertAt = i; break; }
  }
  // Trim trailing blank lines inside the section
  while (insertAt > trackedAt + 1 && lines[insertAt - 1].trim() === '') insertAt--;
  const block = formatCompanyBlock(company);
  lines.splice(insertAt, 0, '', block);
  await writePortals(lines, eol);
  return { ok: true };
}

async function updateCompany(name, company) {
  const raw = await readFile(PORTALS_PATH, 'utf8');
  const eol = detectEol(raw);
  const lines = raw.split(/\r?\n/);
  const found = findCompanyBlock(lines, name);
  if (!found) throw new Error(`Company "${name}" not found`);
  const newBlock = formatCompanyBlock({ ...company, name: company.name || name });
  lines.splice(found.startIdx, found.endIdx - found.startIdx + 1, ...newBlock.split('\n'));
  await writePortals(lines, eol);
  return { ok: true };
}

async function deleteCompany(name) {
  const raw = await readFile(PORTALS_PATH, 'utf8');
  const eol = detectEol(raw);
  const lines = raw.split(/\r?\n/);
  const found = findCompanyBlock(lines, name);
  if (!found) throw new Error(`Company "${name}" not found`);
  let start = found.startIdx;
  if (start > 0 && lines[start - 1].trim() === '') start--;
  lines.splice(start, found.endIdx - start + 1);
  await writePortals(lines, eol);
  return { ok: true };
}

async function toggleCompany(name) {
  const portals = await getPortals();
  const company = portals.tracked_companies.find(c => c.name === name);
  if (!company) throw new Error(`Company "${name}" not found`);
  const next = { ...company, enabled: !(company.enabled !== false) };
  return updateCompany(name, next);
}

// ------------------------------------------------------------------- Scan
let scanRunning = false;

async function runScanStreamed(req, res) {
  if (scanRunning) return sendErr(res, 409, 'Scan déjà en cours');

  // Read optional JSON body { companies: ["Cohere", "Pennylane"] } before opening SSE.
  let companies = [];
  if (req.method === 'POST') {
    try {
      const body = await readBody(req);
      if (Array.isArray(body?.companies)) {
        companies = body.companies
          .map(c => (typeof c === 'string' ? c.trim() : ''))
          .filter(Boolean);
      }
    } catch {
      return sendErr(res, 400, 'Body JSON invalide');
    }
  }

  scanRunning = true;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const sse = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const extraArgs = companies.flatMap(c => ['--company', c]);
  const cmdline = ['scan.mjs', ...extraArgs].map(a => /\s/.test(a) ? JSON.stringify(a) : a).join(' ');
  sse('log', `$ node ${cmdline}`);
  sse('log', companies.length
    ? `→ sélection: ${companies.join(', ')} (${companies.length} source${companies.length > 1 ? 's' : ''})`
    : `→ aucune sélection reçue — scan complet`);
  const child = spawn(process.execPath, ['scan.mjs', ...extraArgs], {
    cwd: ROOT,
    env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '--use-system-ca' },
  });

  const emitChunk = (prefix) => (chunk) => {
    const text = chunk.toString('utf8');
    for (const line of text.split(/\r?\n/)) {
      if (line.length === 0 && text.length > 1) continue;
      sse('log', prefix + line);
    }
  };
  child.stdout.on('data', emitChunk(''));
  child.stderr.on('data', emitChunk('[err] '));

  child.on('error', (err) => {
    sse('log', `[fatal] ${err.message}`);
    sse('done', { code: -1, error: err.message });
    scanRunning = false;
    res.end();
  });
  child.on('close', (code) => {
    sse('done', { code });
    scanRunning = false;
    res.end();
  });
  req.on('close', () => {
    // Client disconnected before scan finished — kill child to avoid orphan
    if (!child.killed) child.kill();
  });
}

// ------------------------------------------------------- Application content
// List the written applications (one JSON per candidate in data/applications-content/).
async function getApplicationsContent() {
  const { readdir } = await import('node:fs/promises');
  let files = [];
  try { files = (await readdir(APP_CONTENT_DIR)).filter(f => f.endsWith('.json')); }
  catch { return { items: [] }; }
  const items = [];
  for (const f of files.sort()) {
    try {
      const raw = await readFile(join(APP_CONTENT_DIR, f), 'utf8');
      const c = JSON.parse(raw);
      const num = (c.report || '').match(/^(\d{3})/)?.[1] || null;
      items.push({ id: c.id || f.replace(/\.json$/, ''), company: c.company || '', role: c.role || '', lang: c.lang || 'en', paper: c.paper || 'letter', report: c.report || null, num });
    } catch { /* skip malformed */ }
  }
  return { items };
}

// Generate PDFs for one application via batch/gen-applications.mjs.
// Body: { id, pages: 0|1|2, cover: bool }. pages 0 = cover only.
let genRunning = false;
async function generatePdf(req, res) {
  if (genRunning) return sendErr(res, 409, 'Génération déjà en cours');
  let body;
  try { body = await readBody(req); } catch { return sendErr(res, 400, 'Body JSON invalide'); }
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!id || !/^[a-z0-9_-]+$/i.test(id)) return sendErr(res, 400, 'id invalide');
  const pages = [0, 1, 2].includes(body?.pages) ? body.pages : 2;
  const cover = !!body?.cover;
  if (pages === 0 && !cover) return sendErr(res, 400, 'Rien à générer (ni CV ni cover)');

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const args = ['batch/gen-applications.mjs', '--id', id, '--date', date, '--time', time];
  if (pages === 0) args.push('--cover-only');
  else { args.push('--pages', String(pages)); if (cover) args.push('--cover'); }

  genRunning = true;
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '--use-system-ca' },
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d.toString('utf8'); });
  child.stderr.on('data', d => { stderr += d.toString('utf8'); });
  child.on('error', (err) => { genRunning = false; sendErr(res, 500, err.message); });
  child.on('close', (code) => {
    genRunning = false;
    const m = stdout.match(/__RESULT__ (.+)$/m);
    let results = [];
    try { if (m) results = JSON.parse(m[1]); } catch {}
    const locked = results.some(r => r.locked);
    if (code !== 0 && !results.length) {
      return sendErr(res, 500, (stderr || stdout || `exit ${code}`).slice(-400));
    }
    sendJson(res, 200, { ok: results.every(r => r.ok), locked, results, log: stdout });
  });
}

// Open a generated file in the OS default app (Windows: start). Body: { file }.
async function openFile(req, res) {
  let body;
  try { body = await readBody(req); } catch { return sendErr(res, 400, 'Body JSON invalide'); }
  const file = typeof body?.file === 'string' ? body.file : '';
  // Only allow opening files inside output/, no traversal.
  if (!/^[a-z0-9._-]+\.pdf$/i.test(file)) return sendErr(res, 400, 'Nom de fichier invalide');
  const full = join(ROOT, 'output', file);
  if (!full.startsWith(join(ROOT, 'output'))) return sendErr(res, 403, 'Forbidden');
  if (!existsSync(full)) return sendErr(res, 404, 'Fichier introuvable');
  // Windows: `start` is a cmd builtin; use cmd /c start "" "<path>".
  const child = spawn('cmd', ['/c', 'start', '', full], { detached: true, stdio: 'ignore' });
  child.unref();
  sendJson(res, 200, { ok: true, opened: file, path: full });
}

// ----------------------------------------------------------------- Static
async function serveStatic(req, res, urlPath) {
  // Serve /reports/*, /jds/* and /output/* from project ROOT (read-only) with path safety
  for (const sub of ['/reports/', '/jds/', '/output/']) {
    if (urlPath.startsWith(sub)) {
      const safe = urlPath.slice(sub.length);
      if (!/^[a-z0-9._\-]+$/i.test(safe)) return send(res, 400, 'Bad name', 'text/plain');
      const filePath = join(ROOT, sub.slice(1, -1), safe);
      if (!filePath.startsWith(join(ROOT, sub.slice(1, -1)))) return send(res, 403, 'Forbidden', 'text/plain');
      try {
        const buf = await readFile(filePath);
        // Markdown rendered as text/plain so browser displays inline
        const mime = filePath.endsWith('.md') ? 'text/plain; charset=utf-8' : (MIME[extname(filePath)] || 'application/octet-stream');
        return send(res, 200, buf, mime);
      } catch {
        return send(res, 404, 'Not found', 'text/plain');
      }
    }
  }
  let p = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = join(__dirname, 'public', p);
  if (!filePath.startsWith(join(__dirname, 'public'))) return send(res, 403, 'Forbidden', 'text/plain');
  try {
    await stat(filePath);
    const buf = await readFile(filePath);
    send(res, 200, buf, MIME[extname(filePath)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found', 'text/plain');
  }
}

// --------------------------------------------------------------------- Router
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;

    if (req.method === 'POST' && path === '/api/scan') return runScanStreamed(req, res);
    if (req.method === 'GET' && path === '/api/scan/status') return sendJson(res, 200, { running: scanRunning });
    if (req.method === 'GET' && path === '/api/scan-history') return sendJson(res, 200, await getScanHistory());
    if (req.method === 'GET' && path === '/api/pipeline') return sendJson(res, 200, await getPipeline());
    if (req.method === 'GET' && path === '/api/applications') return sendJson(res, 200, await getApplications());
    if (req.method === 'GET' && path === '/api/portals') return sendJson(res, 200, await getPortals());
    if (req.method === 'GET' && path === '/api/reports') return sendJson(res, 200, await getReportsIndex());
    if (req.method === 'GET' && path === '/api/applications-content') return sendJson(res, 200, await getApplicationsContent());
    if (req.method === 'POST' && path === '/api/generate-pdf') return generatePdf(req, res);
    if (req.method === 'POST' && path === '/api/open-file') return openFile(req, res);

    if (req.method === 'POST' && path === '/api/portals/companies') {
      const body = await readBody(req);
      return sendJson(res, 200, await addCompany(body));
    }
    const m = path.match(/^\/api\/portals\/companies\/([^/]+)(\/toggle)?$/);
    if (m) {
      const name = decodeURIComponent(m[1]);
      if (req.method === 'PATCH' && m[2] === '/toggle') {
        return sendJson(res, 200, await toggleCompany(name));
      }
      if (req.method === 'PUT') {
        const body = await readBody(req);
        return sendJson(res, 200, await updateCompany(name, body));
      }
      if (req.method === 'DELETE') {
        return sendJson(res, 200, await deleteCompany(name));
      }
    }

    if (req.method === 'GET') return serveStatic(req, res, path);
    sendErr(res, 405, 'Method not allowed');
  } catch (err) {
    console.error(err);
    sendErr(res, 500, err.message || String(err));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`career-ops dashboard ready → http://127.0.0.1:${PORT}/`);
});
