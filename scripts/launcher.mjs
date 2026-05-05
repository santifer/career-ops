#!/usr/bin/env node
/**
 * career-ops launcher — wraps the dashboard server with a few niceties:
 *
 *   - Auto-detects free port if 4747 is busy
 *   - Opens the default browser to the dashboard
 *   - Initializes a project directory in ~/CareerOps if cwd has no project
 *   - Forwards SIGINT/SIGTERM to the spawned server
 *
 * This is the entrypoint baked into career-ops.exe (Node SEA).
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, platform } from 'node:os';
import net from 'node:net';

const HERE = (() => {
  try { return dirname(fileURLToPath(import.meta.url)); }
  catch { return process.cwd(); }
})();

// ─── Find a project root ────────────────────────────────────────────────────
// 1. cwd if it has dashboard-web/server.mjs (running from clone)
// 2. dirname(executable) for the bundled SEA case
// 3. ~/CareerOps for a fresh install — initialized on first run
function findProjectRoot() {
  const candidates = [
    process.cwd(),
    HERE,
    resolve(HERE, '..'),
    join(homedir(), 'CareerOps'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'dashboard-web', 'server.mjs'))) {
      return dir;
    }
  }
  return null;
}

async function initFreshProject() {
  const dest = join(homedir(), 'CareerOps');
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  console.log(`\n📁 Initializing fresh project at: ${dest}`);
  console.log(`   This is your data home — cv.md, config/, data/, reports/.\n`);
  const readme = join(dest, 'README.txt');
  if (!existsSync(readme)) {
    const fs = await import('node:fs/promises');
    await fs.writeFile(readme,
      'Career-Ops user data directory.\n\n' +
      'For a full install, clone:\n' +
      '  git clone https://github.com/santifer/career-ops.git\n' +
      'Or run:\n' +
      '  bash install.sh\n', 'utf8');
  }
  return dest;
}

// ─── Pick a free port ───────────────────────────────────────────────────────
async function findFreePort(preferred = 4747, host = '127.0.0.1') {
  const tryPort = (p) => new Promise(res => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', () => res(false));
    srv.listen(p, host, () => srv.close(() => res(true)));
  });
  if (await tryPort(preferred)) return preferred;
  // Fall back: start at preferred+1 and walk up to preferred+50
  for (let p = preferred + 1; p <= preferred + 50; p++) {
    if (await tryPort(p)) return p;
  }
  // Last resort: ephemeral
  return 0;
}

// ─── Open browser cross-platform ───────────────────────────────────────────
function openBrowser(url) {
  const cmd = platform() === 'darwin' ? 'open'
    : platform() === 'win32' ? 'cmd'
    : 'xdg-open';
  const args = platform() === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  } catch { /* user can paste the URL */ }
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  let root = findProjectRoot();
  if (!root) {
    console.log('\n⚠ No Career-Ops project found in cwd or near the executable.');
    console.log('   Either:');
    console.log('     • cd into your career-ops checkout, then run again, or');
    console.log('     • git clone https://github.com/santifer/career-ops.git\n');
    process.exit(2);
  }

  const host = process.env.HOST || '127.0.0.1';
  const preferredPort = Number(process.env.PORT || 4747);
  const port = await findFreePort(preferredPort, host);
  if (!port) {
    console.error(`✗ Could not find a free port near ${preferredPort}`);
    process.exit(3);
  }
  if (port !== preferredPort) {
    console.log(`ℹ Port ${preferredPort} busy — using ${port} instead`);
  }

  const url = `http://${host}:${port}`;
  console.log('\n   ╔═══════════════════════════════════════════╗');
  console.log('   ║   JobSeeker · Career-Ops is starting…     ║');
  console.log('   ╚═══════════════════════════════════════════╝\n');
  console.log(`   Project root: ${root}`);
  console.log(`   Dashboard:    ${url}`);
  console.log(`   Stop:         Ctrl+C\n`);

  // Detect whether we're running as a SEA-wrapped EXE. If so, spawning
  // process.execPath would recurse back into the launcher. Instead, set
  // env vars and dynamic-import the server directly.
  // Node sets process.argv[0] to the executable path; for SEA that's the
  // EXE, not "node". Easiest reliable signal: see if the main script of
  // process.execPath is bash/node (loosely: contains "node" in name).
  const runningAsSea = !/(^|[\\/])node(\.exe)?$/i.test(process.execPath);

  process.env.PORT = String(port);
  process.env.HOST = host;
  process.chdir(root);

  if (runningAsSea) {
    // Open browser shortly after the import completes; the server boots
    // synchronously enough that ~600ms is plenty.
    setTimeout(() => openBrowser(url), 600);
    const serverUrl = `file://${join(root, 'dashboard-web', 'server.mjs').replace(/\\/g, '/')}`;
    await import(serverUrl);
    return;
  }

  // Dev mode: bare-node invocation — spawn the server in a child so we can
  // forward signals cleanly. (Useful when running `node scripts/launcher.mjs`
  // directly during development of the launcher itself.)
  const serverPath = join(root, 'dashboard-web', 'server.mjs');
  const child = spawn(process.execPath, [serverPath], {
    cwd: root,
    env: { ...process.env },
    stdio: 'inherit',
  });
  setTimeout(() => openBrowser(url), 700);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => child.kill(sig));
  }
  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch(err => {
  console.error('Launcher error:', err.message);
  process.exit(1);
});
