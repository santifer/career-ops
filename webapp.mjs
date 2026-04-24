#!/usr/bin/env node
/**
 * Career Ops — local web UI
 * Run: node webapp.mjs
 * Open: http://localhost:3737
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = __dirname;
const PORT = 3737;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.pdf':  'application/pdf',
  '.json': 'application/json',
  '.md':   'text/plain; charset=utf-8',
  '.woff2':'font/woff2',
};

// ── Parsers ──────────────────────────────────────────────────────────────────

function parseApplications() {
  const file = path.join(BASE, 'data', 'applications.md');
  if (!fs.existsSync(file)) return [];

  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const apps = [];
  let headers = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;

    // Split cells, strip outer pipes
    const cells = line.slice(1, line.endsWith('|') ? -1 : undefined)
      .split('|').map(c => c.trim());

    if (!headers) {
      headers = cells.map(h =>
        h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      );
      continue;
    }
    // Separator row
    if (cells.every(c => /^[-:| ]+$/.test(c))) continue;

    const app = {};
    headers.forEach((h, i) => { app[h] = cells[i] ?? ''; });

    // Derived fields
    const scoreMatch = app.score?.match(/([\d.]+)/);
    app.scoreNum = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
    app.hasPdf   = app.pdf?.includes('✅');

    const reportMatch = app.report?.match(/\(([^)]+)\)/);
    app.reportPath = reportMatch ? reportMatch[1] : '';

    apps.push(app);
  }
  return apps;
}

function safeJoin(base, rel) {
  const resolved = path.normalize(path.join(base, rel));
  return resolved.startsWith(base) ? resolved : null;
}

// ── HTTP server ───────────────────────────────────────────────────────────────

function send(res, status, type, body) {
  const isJson = typeof body === 'object' && body !== null && !Buffer.isBuffer(body);
  const content = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(content);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const ct  = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': ct });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // ── API ──
  if (pathname === '/api/applications') {
    return send(res, 200, 'application/json', parseApplications());
  }

  if (pathname === '/api/report') {
    const p = url.searchParams.get('path');
    if (!p || p.includes('..')) return send(res, 400, 'text/plain', 'Bad request');
    const full = safeJoin(BASE, p);
    if (!full || !fs.existsSync(full)) return send(res, 404, 'text/plain', 'Not found');
    return send(res, 200, 'text/plain; charset=utf-8', fs.readFileSync(full, 'utf8'));
  }

  // ── Static files ──
  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(BASE, 'public', 'index.html');
  } else if (pathname.startsWith('/output/')) {
    filePath = safeJoin(BASE, pathname);
  } else {
    filePath = safeJoin(BASE, path.join('public', pathname));
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return send(res, 404, 'text/plain', 'Not found');
  }

  sendFile(res, filePath);
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  Career Ops UI → ${url}\n`);
  // Open browser (Windows / Mac / Linux)
  const cmd = process.platform === 'win32' ? `start ${url}`
            : process.platform === 'darwin' ? `open ${url}`
            : `xdg-open ${url}`;
  exec(cmd);
});
