#!/usr/bin/env node
/**
 * dashboard-launch.mjs — One-command dashboard launcher.
 *
 * Starts dashboard-server.mjs on 127.0.0.1 and opens the browser to the
 * dashboard once the server is ready. Runs as a foreground process (Ctrl+C
 * to stop the server).
 *
 * Usage:
 *   node dashboard-launch.mjs
 *   node dashboard-launch.mjs --port 8080
 *
 * Package.json alias: npm run launch  (add "launch": "node dashboard-launch.mjs")
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const ROOT = dirname(fileURLToPath(import.meta.url));

const portArg = process.argv.indexOf('--port');
const PORT    = portArg !== -1 ? parseInt(process.argv[portArg + 1], 10) : 7777;
const HOST    = '127.0.0.1';
const URL     = `http://${HOST}:${PORT}`;

// ── Start server ──────────────────────────────────────────────────────────────

const server = spawn(process.execPath, [join(ROOT, 'dashboard-server.mjs'), '--port', String(PORT)], {
  cwd:   ROOT,
  stdio: 'inherit', // forward server output to the terminal
});

server.on('error', (err) => {
  console.error('Failed to start dashboard-server.mjs:', err.message);
  process.exit(1);
});

server.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Dashboard server exited with code ${code}`);
  }
  process.exit(code ?? 0);
});

// Propagate Ctrl+C to the server child
process.on('SIGINT',  () => { server.kill('SIGINT');  });
process.on('SIGTERM', () => { server.kill('SIGTERM'); });

// ── Open browser once server is ready ─────────────────────────────────────────

const POLL_INTERVAL_MS = 200;
const POLL_TIMEOUT_MS  = 10_000;

async function waitForServer() {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ready = await ping();
    if (ready) return true;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

function ping() {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port: PORT, path: '/api/queue', timeout: 500 }, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd  = platform === 'darwin'  ? 'open'
             : platform === 'win32'   ? 'start'
             : 'xdg-open';
  const child = spawn(cmd, [url], { detached: true, stdio: 'ignore' });
  child.unref();
}

waitForServer().then((ready) => {
  if (ready) {
    console.log(`\nOpening browser → ${URL}\n`);
    openBrowser(URL);
  } else {
    console.warn(`Server did not respond within ${POLL_TIMEOUT_MS / 1000}s — open manually: ${URL}`);
  }
});
