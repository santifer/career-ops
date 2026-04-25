#!/usr/bin/env node
/**
 * Career Ops — local web UI
 * Run: node webapp.mjs  (or: npm run ui)
 * Open: http://localhost:3737
 *
 * Routes:
 *   GET /                     → public/index.html
 *   GET /api/applications     → parsed data/applications.md as JSON
 *   GET /api/report?path=...  → report file contents (restricted to output/ and data/)
 *   GET /output/*             → static files under output/ directory only
 *   GET /public/*             → static assets under public/
 */
import http from 'http';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE      = __dirname;
const PORT      = 3737;

/** Allowed directories for /api/report path parameter. */
const REPORT_ROOTS = [
  path.join(BASE, 'output'),
  path.join(BASE, 'data'),
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.pdf':  'application/pdf',
  '.json': 'application/json',
  '.md':   'text/plain; charset=utf-8',
  '.woff2':'font/woff2',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve `rel` relative to `base`, returning the absolute path only if the
 * result stays inside `base`. Returns null on path-traversal attempts.
 * @param {string} base - Absolute base directory.
 * @param {string} rel  - Relative (or absolute) path to resolve.
 * @returns {string|null}
 */
function safeJoin(base, rel) {
  const resolved = path.normalize(path.join(base, rel));
  return resolved.startsWith(base + path.sep) || resolved === base
    ? resolved
    : null;
}

/**
 * Check whether `filePath` is confined to one of the allowed root directories.
 * @param {string} filePath - Absolute resolved path.
 * @param {string[]} roots  - Allowed root directories.
 * @returns {boolean}
 */
function isUnderRoots(filePath, roots) {
  return roots.some(r => filePath.startsWith(r + path.sep) || filePath === r);
}

/**
 * Send an HTTP response, serialising objects as JSON automatically.
 * @param {http.ServerResponse} res
 * @param {number} status  - HTTP status code.
 * @param {string} type    - Content-Type header value.
 * @param {string|Buffer|object} body
 */
function send(res, status, type, body) {
  const isJson = typeof body === 'object' && body !== null && !Buffer.isBuffer(body);
  const content = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(content);
}

/**
 * Stream a file to the response, inferring Content-Type from the extension.
 * @param {http.ServerResponse} res
 * @param {string} filePath - Absolute path to the file.
 */
function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const ct  = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': ct });
  fs.createReadStream(filePath).pipe(res);
}

// ── Parsers ───────────────────────────────────────────────────────────────────

/**
 * Parse data/applications.md into an array of application objects.
 * Derives numeric score (`scoreNum`), `hasPdf`, and `reportPath` fields.
 * Returns an empty array if the file does not exist.
 * @returns {object[]}
 */
function parseApplications() {
  const file = path.join(BASE, 'data', 'applications.md');
  if (!fs.existsSync(file)) return [];

  const lines   = fs.readFileSync(file, 'utf8').split('\n');
  const apps    = [];
  let   headers = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;

    const cells = line.slice(1, line.endsWith('|') ? -1 : undefined)
      .split('|').map(c => c.trim());

    if (!headers) {
      headers = cells.map(h =>
        h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      );
      continue;
    }
    if (cells.every(c => /^[-:| ]+$/.test(c))) continue;  // separator row

    const app = {};
    headers.forEach((h, i) => { app[h] = cells[i] ?? ''; });

    // Derived fields
    const scoreMatch = app.score?.match(/([\d.]+)/);
    app.scoreNum  = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
    app.hasPdf    = app.pdf?.includes('✅');

    const reportMatch = app.report?.match(/\(([^)]+)\)/);
    app.reportPath = reportMatch ? reportMatch[1] : '';

    apps.push(app);
  }
  return apps;
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url      = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // ── API: applications list ──
  if (pathname === '/api/applications') {
    return send(res, 200, 'application/json', parseApplications());
  }

  // ── API: report content ──
  if (pathname === '/api/report') {
    const p = url.searchParams.get('path');

    // Reject missing, empty, or path-traversal attempts
    if (!p || /\.\./.test(p)) {
      return send(res, 400, 'text/plain', 'Bad request');
    }

    const full = safeJoin(BASE, p);

    // Constrain to allowed subtrees (output/ and data/ only)
    if (!full || !isUnderRoots(full, REPORT_ROOTS)) {
      return send(res, 403, 'text/plain', 'Forbidden');
    }

    try {
      const content = await fs.promises.readFile(full, 'utf8');
      return send(res, 200, 'text/plain; charset=utf-8', content);
    } catch {
      return send(res, 404, 'text/plain', 'Not found');
    }
  }

  // ── Static: output directory (PDFs, reports) ──
  if (pathname.startsWith('/output/')) {
    // Reject any URL containing '..' segments before resolving
    if (/\.\./.test(pathname)) {
      return send(res, 400, 'text/plain', 'Bad request');
    }
    // Strip leading '/output/' and resolve strictly within BASE/output
    const rel      = pathname.slice('/output/'.length);
    const filePath = safeJoin(path.join(BASE, 'output'), rel);

    if (!filePath || !isUnderRoots(filePath, [path.join(BASE, 'output')])) {
      return send(res, 403, 'text/plain', 'Forbidden');
    }
    if (!fs.existsSync(filePath)) {
      return send(res, 404, 'text/plain', 'Not found');
    }
    return sendFile(res, filePath);
  }

  // ── Static: public assets ──
  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(BASE, 'public', 'index.html');
  } else {
    filePath = safeJoin(path.join(BASE, 'public'), pathname);
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return send(res, 404, 'text/plain', 'Not found');
  }

  sendFile(res, filePath);
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  Career Ops UI → ${url}\n`);
  const cmd = process.platform === 'win32' ? `start ${url}`
            : process.platform === 'darwin' ? `open ${url}`
            : `xdg-open ${url}`;
  exec(cmd);
});
