#!/usr/bin/env node
/**
 * auth/server.mjs — careerops auth proxy + overlay injector
 *
 * Sits in front of ttyd. Replaces ttyd's browser Basic-Auth popup with a
 * designed login page, then transparently proxies the authenticated session
 * (HTTP + WebSocket) to ttyd on a private loopback port.
 *
 * Also:
 *   - Serves /_careerops/overlay.{js,css} (the logout link + URL-paste modal).
 *   - Injects <script src="/_careerops/overlay.js" defer> into ttyd's HTML
 *     responses so the overlay appears on the terminal page.
 *   - Exposes /api/scrape (calls the Scrapling sidecar, writes jds/) and
 *     /api/queue-url (writes to data/pipeline.md without scraping).
 *
 * Environment:
 *   CAREEROPS_WEB_USER      Required. Username for the login page.
 *   CAREEROPS_WEB_PASS      Required. Password for the login page.
 *   COOKIE_SECRET           Required. HMAC secret signing session cookies.
 *   AUTH_PROXY_PORT         Optional. Default 7681 (NPM forwards to this).
 *   TTYD_TARGET             Optional. Default http://127.0.0.1:7682
 *   SCRAPER_URL             Optional. Default http://careerops-scraper:8000
 *   WORKSPACE               Optional. Default /workspace
 *   COOKIE_TTL_DAYS         Optional. Default 30.
 */

import express from 'express';
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import { createHmac, createHash, timingSafeEqual } from 'crypto';
import { readFileSync, existsSync, appendFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const USER         = required('CAREEROPS_WEB_USER');
const PASS         = required('CAREEROPS_WEB_PASS');
const SECRET       = required('COOKIE_SECRET');
const PORT         = Number(process.env.AUTH_PROXY_PORT || 7681);
const TTYD_TARGET  = process.env.TTYD_TARGET  || 'http://127.0.0.1:7682';
const SCRAPER_URL  = process.env.SCRAPER_URL  || 'http://careerops-scraper:8000';
const WORKSPACE    = process.env.WORKSPACE    || '/workspace';
const TTL_DAYS     = Number(process.env.COOKIE_TTL_DAYS || 30);
const TTL_MS       = TTL_DAYS * 24 * 60 * 60 * 1000;
const COOKIE_NAME  = 'careerops_session';

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`FATAL: ${name} is required but unset.`);
    process.exit(1);
  }
  return v;
}

// Pre-hash configured creds so comparisons are timing-safe + length-fixed.
const USER_HASH = sha256(USER);
const PASS_HASH = sha256(PASS);

function sha256(s)  { return createHash('sha256').update(String(s)).digest(); }
function hmac(s)    { return createHmac('sha256', SECRET).update(String(s)).digest('base64url'); }
function constTimeEqHash(a, b) { return a.length === b.length && timingSafeEqual(a, b); }

function signSession(expiresAtMs) {
  const payload = expiresAtMs.toString(36);
  return `${payload}.${hmac(payload)}`;
}
function verifySession(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const i = token.indexOf('.');
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = hmac(payload);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const expiresAt = parseInt(payload, 36);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  return { expiresAt };
}
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    if (k) out[k] = v;
  }
  return out;
}
function isAuthed(req) {
  return verifySession(parseCookies(req.headers.cookie)[COOKIE_NAME]);
}

// ── App ─────────────────────────────────────────────────────────────
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '8kb' }));

// Cache the login HTML at boot — it's static.
const LOGIN_HTML = readFileSync(path.join(__dirname, 'login.html'), 'utf8');
const OVERLAY_JS  = readFileSync(path.join(__dirname, 'overlay', 'overlay.js'), 'utf8');
const OVERLAY_CSS = readFileSync(path.join(__dirname, 'overlay', 'overlay.css'), 'utf8');

const CSP_LOGIN =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; " +
  "img-src 'self' data:; " +
  "connect-src 'self'; " +
  "frame-ancestors 'none'";

app.get('/login', (req, res) => {
  if (isAuthed(req)) return res.redirect('/');
  res.type('html').set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': CSP_LOGIN,
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  }).send(LOGIN_HTML);
});

app.post('/api/login', (req, res) => {
  const { user, pass } = req.body || {};
  if (typeof user !== 'string' || typeof pass !== 'string') {
    return res.status(400).json({ error: 'bad_request' });
  }
  const ok =
    constTimeEqHash(sha256(user), USER_HASH) &&
    constTimeEqHash(sha256(pass), PASS_HASH);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

  const expiresAt = Date.now() + TTL_MS;
  const token = signSession(expiresAt);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: TTL_MS,
  });
  res.json({ ok: true, expiresAt });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});
// Old GET-based logout link still works for backward-compat
app.get('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.redirect('/login');
});

// ── Overlay static assets (must come before the auth gate so the cached
//    overlay JS can be loaded even if the session has just expired — the
//    user lands on /login and the page is harmless without a live ttyd).
//    But they ARE auth-gated below anyway — better defence in depth.
function serveOverlay(req, res, body, type) {
  res.type(type)
     .set('Cache-Control', 'public, max-age=300')
     .send(body);
}

// ── Auth gate. After this point only authenticated traffic continues. ─
app.use((req, res, next) => {
  if (isAuthed(req)) return next();
  if (req.method === 'GET' && (req.headers.accept || '').includes('text/html')) {
    return res.redirect('/login');
  }
  return res.status(401).json({ error: 'unauthorized' });
});

// Overlay assets — authenticated users only
app.get('/_careerops/overlay.js',  (req, res) => serveOverlay(req, res, OVERLAY_JS,  'application/javascript; charset=utf-8'));
app.get('/_careerops/overlay.css', (req, res) => serveOverlay(req, res, OVERLAY_CSS, 'text/css; charset=utf-8'));

// ── POST /api/queue-url — append a URL to data/pipeline.md ──────────
app.post('/api/queue-url', (req, res) => {
  const { url } = req.body || {};
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'invalid_url' });
  }
  try {
    const pipelinePath = path.join(WORKSPACE, 'data', 'pipeline.md');
    ensurePipelineFile(pipelinePath);
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const line = `- [ ] ${url}  | (queued ${ts} via web GUI)\n`;
    appendFileSync(pipelinePath, line, { encoding: 'utf8' });
    res.json({ ok: true, queued: pipelinePath, url });
  } catch (err) {
    console.error('[queue-url] error:', err);
    res.status(500).json({ error: 'write_failed', detail: String(err.message || err) });
  }
});

// ── POST /api/scrape — call the Scrapling sidecar + persist ────────
app.post('/api/scrape', async (req, res) => {
  const { url } = req.body || {};
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'invalid_url' });
  }

  // Call sidecar
  let scrape;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    const resp = await fetch(`${SCRAPER_URL}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await resp.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { detail: text.slice(0, 300) }; }
    if (!resp.ok) {
      return res.status(502).json({
        error: 'scraper_failed',
        detail: body.detail || `sidecar returned ${resp.status}`,
        url,
      });
    }
    scrape = body;
  } catch (err) {
    console.error('[scrape] sidecar error:', err.message);
    const offline = /ENOTFOUND|ECONNREFUSED|fetch failed|abort/i.test(err.message || '');
    return res.status(offline ? 503 : 502).json({
      error: offline ? 'scraper_offline' : 'scraper_error',
      detail: err.message,
    });
  }

  // Persist JD markdown to jds/NNN-{slug}.md and append URL to pipeline.md
  try {
    const jdsDir = path.join(WORKSPACE, 'jds');
    const dataDir = path.join(WORKSPACE, 'data');
    mkdirSync(jdsDir,  { recursive: true });
    mkdirSync(dataDir, { recursive: true });

    const num  = nextJdNumber(jdsDir);
    const slug = makeSlug(scrape.company, scrape.title, url);
    const jdFilename = `${String(num).padStart(3, '0')}-${slug}.md`;
    const jdPath = path.join(jdsDir, jdFilename);
    writeFileSync(jdPath, scrape.jd_markdown, { encoding: 'utf8', mode: 0o644 });

    // Append the URL to data/pipeline.md (career-ops convention)
    const pipelinePath = path.join(dataDir, 'pipeline.md');
    ensurePipelineFile(pipelinePath);
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const line = `- [ ] ${url}  | ${scrape.company || '(company?)'} — ${scrape.title || '(role?)'}  | local:jds/${jdFilename}  (scraped ${ts}, fetcher=${scrape.fetcher})\n`;
    appendFileSync(pipelinePath, line, { encoding: 'utf8' });

    res.json({
      ok: true,
      path: `jds/${jdFilename}`,
      queued: pipelinePath.replace(WORKSPACE + '/', ''),
      title: scrape.title,
      company: scrape.company,
      location: scrape.location,
      chars: scrape.chars,
      fetcher: scrape.fetcher,
    });
  } catch (err) {
    console.error('[scrape] persist error:', err);
    res.status(500).json({ error: 'write_failed', detail: String(err.message || err) });
  }
});

// ── Proxy authed traffic to ttyd ─────────────────────────────────────
// Inject the overlay <script> into HTML responses (the ttyd index).
const ttydProxy = createProxyMiddleware({
  target: TTYD_TARGET,
  ws: true,
  changeOrigin: true,
  xfwd: true,
  selfHandleResponse: true,
  logLevel: 'warn',
  on: {
    proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
      const ct = (proxyRes.headers['content-type'] || '').toLowerCase();
      if (!ct.includes('text/html')) return responseBuffer; // pass-through binary/JS/CSS
      const html = responseBuffer.toString('utf8');
      const tag = '<script src="/_careerops/overlay.js" defer></script>';
      if (html.includes(tag)) return html; // idempotent
      if (html.includes('</body>')) return html.replace('</body>', `${tag}\n</body>`);
      return html + tag; // best-effort
    }),
  },
});
app.use('/', ttydProxy);

// ── HTTP server + WebSocket upgrade gating ─────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `[careerops-auth] listening on 0.0.0.0:${PORT} ` +
    `→ ttyd ${TTYD_TARGET}  ·  scraper ${SCRAPER_URL}  ·  workspace ${WORKSPACE}  ·  cookie ttl=${TTL_DAYS}d`
  );
});

server.on('upgrade', (req, socket, head) => {
  if (!isAuthed(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nWWW-Authenticate: Bearer realm="careerops"\r\n\r\n');
    socket.destroy();
    return;
  }
  ttydProxy.upgrade(req, socket, head);
});

// ── Helpers ────────────────────────────────────────────────────────
function ensurePipelineFile(p) {
  if (!existsSync(p)) {
    writeFileSync(p,
      '# Pipeline — URL Inbox\n\n' +
      'URLs queued for evaluation. Each line is one offer the scanner discovered.\n' +
      'Lines may be raw URLs or `URL  -- notes`.\n\n' +
      '## Pendientes\n\n',
      { encoding: 'utf8' }
    );
  }
}

function nextJdNumber(jdsDir) {
  let max = 0;
  try {
    for (const f of readdirSync(jdsDir)) {
      const m = f.match(/^(\d{1,4})-/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  } catch { /* dir missing — caller will mkdir */ }
  return max + 1;
}

function makeSlug(company, title, url) {
  const pick = (s) => (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const c = pick(company);
  const t = pick(title);
  if (c && t) return `${c}-${t}`.slice(0, 60);
  if (c)      return c;
  if (t)      return t;
  // Last-resort: derive from URL path
  try {
    const u = new URL(url);
    return pick(u.host + u.pathname).slice(0, 50) || 'untitled';
  } catch {
    return 'untitled';
  }
}

// ── Graceful shutdown ──────────────────────────────────────────────
let shuttingDown = false;
function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[careerops-auth] ${sig} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
