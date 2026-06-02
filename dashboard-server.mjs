#!/usr/bin/env node
/**
 * dashboard-server.mjs — Zero-model-token localhost apply-queue dashboard.
 *
 * Binds to 127.0.0.1 only. Serves the SPA + a JSON REST API over
 * data/apply-queue.json. Never posts to any ATS. No outbound network calls.
 *
 * Usage:
 *   node dashboard-server.mjs              # port 7777
 *   node dashboard-server.mjs --port 8080  # custom port
 *
 * Open: http://127.0.0.1:7777
 */

import http from 'http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, execFileSync } from 'child_process';

import {
  loadQueue, saveQueue, computeLane, computeStats,
  setStatus, updateById, ACTIVE_STATUSES,
} from './queue-store.mjs';

const ROOT     = dirname(fileURLToPath(import.meta.url));
const WEB_DIR  = join(ROOT, 'dashboard', 'web');
const APPS_FILE = join(ROOT, 'data', 'applications.md');
const ADDITIONS_DIR = join(ROOT, 'batch', 'tracker-additions');

// ── CLI args ─────────────────────────────────────────────────────────────────

const portArg = process.argv.indexOf('--port');
const PORT    = portArg !== -1 ? parseInt(process.argv[portArg + 1], 10) : 7777;
const HOST    = '127.0.0.1'; // localhost only — never expose externally

// ── MIME types ───────────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico':  'image/x-icon',
};

// ── Tracker number helper ────────────────────────────────────────────────────

function nextTrackerNum() {
  if (!existsSync(APPS_FILE)) return 1;
  const text = readFileSync(APPS_FILE, 'utf-8');
  let max = 0;
  for (const m of text.matchAll(/^\|\s*(\d+)\s*\|/gm)) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max + 1;
}

// ── Tracker TSV write-back ───────────────────────────────────────────────────

const DECISION_STATUS = {
  submitted: 'Applied',
  skipped:   'SKIP',
  reviewed:  'Discarded',
};

function writeTrackerTsv(role, decision) {
  mkdirSync(ADDITIONS_DIR, { recursive: true });

  const num    = nextTrackerNum();
  const date   = new Date().toISOString().slice(0, 10);
  const status = DECISION_STATUS[decision] ?? 'Discarded';
  const score  = role.score != null ? `${role.score.toFixed(1)}/5` : 'N/A';
  const pdf    = role.cv_pdf ? '✅' : '❌';
  const report = `[job](${role.url})`;
  const notes  = role.reason ? role.reason.slice(0, 120) : '';

  const tsv = [num, date, role.company, role.title, status, score, pdf, report, notes]
    .join('\t');

  const filename = `${num}-${role.id.replace(/:/g, '-').slice(0, 40)}.tsv`;
  writeFileSync(join(ADDITIONS_DIR, filename), tsv + '\n', 'utf-8');

  // Run merge-tracker to keep applications.md in sync
  try {
    execFileSync(process.execPath, ['merge-tracker.mjs'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
    });
  } catch (err) {
    // Non-fatal: the TSV file is written; user can run merge-tracker manually
    console.warn('WARN: merge-tracker.mjs exited with error:', err.message?.slice(0, 200));
  }
}

// ── API handlers ─────────────────────────────────────────────────────────────

function apiGetQueue(res) {
  const queue = loadQueue();
  const stats = computeStats(queue);

  const enriched = queue.roles
    .filter(r => ACTIVE_STATUSES.has(r.status))
    .map(r => ({ ...r, lane: computeLane(r) }));

  respond(res, 200, { settings: queue.settings, stats, roles: enriched });
}

function apiSetThreshold(req, res) {
  readBody(req, (body) => {
    const { value } = safeJson(body) || {};
    const threshold = parseFloat(value);
    if (isNaN(threshold) || threshold < 0 || threshold > 5) {
      return respond(res, 400, { error: 'threshold must be 0–5' });
    }

    const queue = loadQueue();
    queue.settings.score_threshold = threshold;

    // Flip all ready-lane scored roles at or above the threshold to prepare-queued
    let flipped = 0;
    for (const role of queue.roles) {
      if (role.status !== 'scored') continue;
      if (computeLane(role) !== 'ready') continue;
      if (role.score != null && role.score >= threshold) {
        role.status = 'prepare-queued';
        flipped++;
      }
    }

    saveQueue(queue);
    respond(res, 200, { threshold, flipped });
  });
}

function apiRoleFill(req, res, id) {
  const queue = loadQueue();
  const role = queue.roles.find(r => r.id === id);
  if (!role) return respond(res, 404, { error: 'role not found' });

  const ats = role.ats;

  // Agent-driven path for custom/Workday forms
  if (ats === 'custom') {
    return respond(res, 200, {
      method: 'agent',
      message: `This role uses a custom ATS. Run: /career-ops apply\nThen open: ${role.url}`,
    });
  }

  // Deterministic fill via form-fill.mjs for GH/Lever/Ashby
  const child = spawn(
    process.execPath,
    ['form-fill.mjs', id],
    {
      cwd:      ROOT,
      detached: true,
      stdio:    ['ignore', 'ignore', 'ignore'],
    }
  );
  child.unref();

  respond(res, 200, {
    method:  'form-fill',
    message: `Playwright fill launched for ${role.company} – ${role.title}. The browser will open shortly.`,
  });
}

function apiRoleDecision(req, res, id) {
  readBody(req, (body) => {
    const { decision } = safeJson(body) || {};
    if (!['submitted', 'skipped', 'reviewed'].includes(decision)) {
      return respond(res, 400, { error: 'decision must be submitted | skipped | reviewed' });
    }

    const queue = loadQueue();
    const role = queue.roles.find(r => r.id === id);
    if (!role) return respond(res, 404, { error: 'role not found' });

    setStatus(queue, id, decision);
    saveQueue(queue);

    // Write tracker TSV + merge into applications.md
    try {
      writeTrackerTsv(role, decision);
    } catch (err) {
      console.warn('WARN: tracker write-back failed:', err.message);
    }

    respond(res, 200, { id, decision, status: decision });
  });
}

// ── HTTP plumbing ─────────────────────────────────────────────────────────────

function respond(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function readBody(req, cb) {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => cb(Buffer.concat(chunks).toString('utf-8')));
}

function safeJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function serveStatic(res, filePath) {
  if (!existsSync(filePath)) {
    res.writeHead(404); res.end('Not found');
    return;
  }
  const ext  = extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  res.end(readFileSync(filePath));
}

// ── Request router ────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // CORS — localhost only; this extra header prevents other pages from reading
  // the API if a browser happens to have a tab open with cross-origin XHR.
  res.setHeader('Access-Control-Allow-Origin', `http://${HOST}:${PORT}`);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url    = new URL(req.url, `http://${HOST}:${PORT}`);
  const path   = url.pathname;
  const method = req.method;

  // API routes
  if (path === '/api/queue' && method === 'GET')  return apiGetQueue(res);
  if (path === '/api/threshold' && method === 'POST') return apiSetThreshold(req, res);

  const fillMatch = path.match(/^\/api\/role\/([^/]+)\/fill$/);
  if (fillMatch && method === 'POST') return apiRoleFill(req, res, decodeURIComponent(fillMatch[1]));

  const decisionMatch = path.match(/^\/api\/role\/([^/]+)\/decision$/);
  if (decisionMatch && method === 'POST') return apiRoleDecision(req, res, decodeURIComponent(decisionMatch[1]));

  // Static SPA files
  if (path === '/' || path === '/index.html') {
    return serveStatic(res, join(WEB_DIR, 'index.html'));
  }
  if (path.startsWith('/dashboard/web/')) {
    const rel = path.slice('/dashboard/web/'.length);
    return serveStatic(res, join(WEB_DIR, rel));
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, HOST, () => {
  console.log(`career-ops apply queue dashboard`);
  console.log(`→  http://${HOST}:${PORT}`);
  console.log(`Serving data/apply-queue.json  (localhost only)`);
  console.log(`Press Ctrl+C to stop.\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try --port ${PORT + 1}`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});
