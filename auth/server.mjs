#!/usr/bin/env node
/**
 * auth/server.mjs — careerops auth proxy
 *
 * Sits in front of ttyd. Replaces ttyd's browser-default Basic-Auth popup
 * with a designed login page, then transparently proxies the authenticated
 * session (HTTP + WebSocket) to ttyd on a private port.
 *
 * Environment:
 *   CAREEROPS_WEB_USER      Required. Username for the login page.
 *   CAREEROPS_WEB_PASS      Required. Password for the login page.
 *   COOKIE_SECRET           Required. HMAC secret signing session cookies.
 *                           Generate with `openssl rand -hex 32`.
 *   AUTH_PROXY_PORT         Optional. Default 7681 (the port NPM forwards to).
 *   TTYD_TARGET             Optional. Default http://127.0.0.1:7682
 *   COOKIE_TTL_DAYS         Optional. Default 30.
 *
 * Routes:
 *   GET  /login            -> serves login.html (redirects to / if authed)
 *   POST /api/login        -> validates creds, sets signed cookie, JSON ok
 *   POST /api/logout       -> clears cookie, redirects to /login
 *   *                      -> proxied to ttyd if authed, else /login
 */

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createHmac, createHash, timingSafeEqual } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const USER        = required('CAREEROPS_WEB_USER');
const PASS        = required('CAREEROPS_WEB_PASS');
const SECRET      = required('COOKIE_SECRET');
const PORT        = Number(process.env.AUTH_PROXY_PORT || 7681);
const TTYD_TARGET = process.env.TTYD_TARGET || 'http://127.0.0.1:7682';
const TTL_DAYS    = Number(process.env.COOKIE_TTL_DAYS || 30);
const TTL_MS      = TTL_DAYS * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'careerops_session';

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`FATAL: ${name} is required but unset.`);
    process.exit(1);
  }
  return v;
}

// Pre-hash the configured creds so the comparison is timing-safe and length-fixed.
const USER_HASH = sha256(USER);
const PASS_HASH = sha256(PASS);

function sha256(s)  { return createHash('sha256').update(String(s)).digest(); }
function hmac(s)    { return createHmac('sha256', SECRET).update(String(s)).digest('base64url'); }
function constTimeEqHash(a, b) { return a.length === b.length && timingSafeEqual(a, b); }

// Session token: <expiresAt_base36>.<HMAC>
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
app.set('trust proxy', true); // NPM is in front
app.use(express.json({ limit: '4kb' }));

// Cache the login HTML at boot — it's static.
const LOGIN_HTML = readFileSync(path.join(__dirname, 'login.html'), 'utf8');

app.get('/login', (req, res) => {
  if (isAuthed(req)) return res.redirect('/');
  res.type('html').set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy':
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src https://fonts.gstatic.com; " +
      "img-src 'self' data:; " +
      "connect-src 'self'; " +
      "frame-ancestors 'none'",
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
  if (!ok) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  const expiresAt = Date.now() + TTL_MS;
  const token = signSession(expiresAt);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,         // NPM enforces HTTPS in front
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_MS,
  });
  res.json({ ok: true, expiresAt });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.redirect('/login');
});

// Express's res.cookie helper is part of express; res.cookie isn't built-in to
// the bare node response. Add a shim if needed.
app.use((req, res, next) => {
  if (typeof res.cookie !== 'function') {
    res.cookie = (name, value, opts = {}) => {
      const parts = [`${name}=${encodeURIComponent(value)}`];
      if (opts.maxAge) parts.push(`Max-Age=${Math.floor(opts.maxAge / 1000)}`);
      if (opts.path) parts.push(`Path=${opts.path}`);
      if (opts.httpOnly) parts.push('HttpOnly');
      if (opts.secure) parts.push('Secure');
      if (opts.sameSite) parts.push(`SameSite=${opts.sameSite[0].toUpperCase() + opts.sameSite.slice(1)}`);
      res.setHeader('Set-Cookie', parts.join('; '));
    };
  }
  next();
});

// Auth gate. After this point, only authenticated traffic continues.
app.use((req, res, next) => {
  if (isAuthed(req)) return next();
  // Browser-initiated GETs go to the login page; everything else gets a 401.
  if (req.method === 'GET' && (req.headers.accept || '').includes('text/html')) {
    return res.redirect('/login');
  }
  return res.status(401).json({ error: 'unauthorized' });
});

// Proxy authed traffic to ttyd. The middleware also handles WS upgrades when
// `ws: true` and is wired to the http.Server below.
const ttydProxy = createProxyMiddleware({
  target: TTYD_TARGET,
  ws: true,
  changeOrigin: true,
  xfwd: true,
  logLevel: 'warn',
});
app.use('/', ttydProxy);

// ── HTTP server + WebSocket upgrade gating ─────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `[careerops-auth] listening on 0.0.0.0:${PORT} -> ${TTYD_TARGET} ` +
    `(cookie ttl=${TTL_DAYS}d)`
  );
});

server.on('upgrade', (req, socket, head) => {
  if (!isAuthed(req)) {
    socket.write(
      'HTTP/1.1 401 Unauthorized\r\n' +
      'Connection: close\r\n' +
      'WWW-Authenticate: Bearer realm="careerops"\r\n\r\n'
    );
    socket.destroy();
    return;
  }
  ttydProxy.upgrade(req, socket, head);
});

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
