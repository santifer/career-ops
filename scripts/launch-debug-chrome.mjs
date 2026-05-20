#!/usr/bin/env node
/**
 * scripts/launch-debug-chrome.mjs
 *
 * Start a persistent Chrome instance with --remote-debugging-port=9222
 * that career-ops Playwright agents connect to over CDP.
 *
 * Why a dedicated profile (NOT the user's normal Chrome):
 *   - Chrome only allows one instance per --user-data-dir
 *   - If we tried to attach to the user's main Chrome, it would either
 *     refuse to launch with debugging on (when already running) or
 *     interrupt the user when they next opened a new tab
 *   - A dedicated profile means no collision, no interruption, and
 *     fully autonomous overnight refresh-master runs
 *
 * Profile location:
 *   ~/Library/Application Support/career-ops-chrome-debug/
 *
 * First-time setup: run this script with --setup to launch Chrome
 * visibly (no --headless) so you can sign into LinkedIn once. After
 * that, subsequent launches can run in the background.
 *
 * Modes:
 *   --setup     Headed; brings Chrome to front so Mitchell can log in.
 *               Use this the FIRST time only.
 *   --check     Probe the debug port; print status + exit 0/1.
 *   --kill      Kill the running debug Chrome (cleans up the lock file too).
 *   (default)   Headless start. Used by the launchd plist.
 */

import { spawn, exec } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROFILE_DIR = join(homedir(), 'Library/Application Support/career-ops-chrome-debug');
const PORT = 9222;
const PID_FILE = join(PROFILE_DIR, '.career-ops-pid');

const argv = process.argv.slice(2);
const SETUP = argv.includes('--setup');
const CHECK = argv.includes('--check');
const KILL = argv.includes('--kill');

const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

function findChrome() {
  for (const p of CHROME_PATHS) if (existsSync(p)) return p;
  throw new Error('Could not find Google Chrome under /Applications. Install Chrome first.');
}

async function probePort() {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 1500);
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: ac.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const j = await r.json();
    return j;
  } catch {
    return null;
  }
}

async function findExistingPid() {
  return new Promise(resolve => {
    exec(`lsof -t -i:${PORT}`, (err, stdout) => {
      if (err || !stdout.trim()) return resolve(null);
      const pid = parseInt(stdout.trim().split('\n')[0], 10);
      resolve(Number.isFinite(pid) ? pid : null);
    });
  });
}

async function main() {
  if (CHECK) {
    const info = await probePort();
    if (info) {
      console.log(`CDP UP at http://127.0.0.1:${PORT}  (${info.Browser})`);
      process.exit(0);
    }
    console.log(`CDP DOWN — no listener at http://127.0.0.1:${PORT}`);
    process.exit(1);
  }

  if (KILL) {
    const pid = await findExistingPid();
    if (!pid) {
      console.log('No debug Chrome running on port', PORT);
      process.exit(0);
    }
    console.log('Killing debug Chrome pid', pid);
    process.kill(pid, 'SIGTERM');
    // Clean up SingletonLock if present — Chrome leaves it behind on crash
    const lock = join(PROFILE_DIR, 'SingletonLock');
    if (existsSync(lock)) {
      try { rmSync(lock); console.log('Cleared stale SingletonLock'); } catch { /* */ }
    }
    process.exit(0);
  }

  // Default + --setup: launch if not already running
  const existing = await probePort();
  if (existing) {
    console.log(`Debug Chrome already running. ${existing.Browser} at port ${PORT}.`);
    process.exit(0);
  }

  if (!existsSync(PROFILE_DIR)) {
    mkdirSync(PROFILE_DIR, { recursive: true });
    console.log('Created fresh profile dir:', PROFILE_DIR);
  }

  // Clean up stale SingletonLock if Chrome was hard-killed previously
  const lock = join(PROFILE_DIR, 'SingletonLock');
  if (existsSync(lock)) {
    try { rmSync(lock); } catch { /* */ }
  }

  const chrome = findChrome();
  const args = [
    `--user-data-dir=${PROFILE_DIR}`,
    `--remote-debugging-port=${PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=ChromeWhatsNewUI',
    // Keep extensions etc minimal — this profile is for headless scrape only
    '--disable-component-extensions-with-background-pages',
  ];
  if (!SETUP) {
    // Headless mode for autonomous launchd runs.  We use the newer
    // --headless=new because the legacy headless mode has stale auth
    // quirks with LinkedIn anti-bot detection.
    args.push('--headless=new');
    args.push('--window-position=99999,99999');
  } else {
    args.push('--new-window');
    args.push('https://www.linkedin.com/login');
  }

  console.log('Launching debug Chrome:');
  console.log('  binary :', chrome);
  console.log('  profile:', PROFILE_DIR);
  console.log('  port   :', PORT);
  console.log('  mode   :', SETUP ? 'HEADED (sign into LinkedIn now)' : 'headless');

  const child = spawn(chrome, args, {
    detached: true,
    stdio: SETUP ? 'inherit' : 'ignore',
  });
  child.unref();

  // Wait up to 10s for the CDP port to come up
  let attempt = 0;
  while (attempt < 20) {
    await new Promise(r => setTimeout(r, 500));
    const info = await probePort();
    if (info) {
      console.log(`OK: ${info.Browser} listening on http://127.0.0.1:${PORT}`);
      try { (await import('node:fs')).writeFileSync(PID_FILE, String(child.pid)); } catch { /* */ }
      if (SETUP) {
        console.log('');
        console.log('A Chrome window has opened pointing at LinkedIn login.');
        console.log('Sign in normally — keep the window/tab open or just minimize it.');
        console.log('Subsequent runs will inherit this auth.');
        console.log('');
        console.log('When done, this script returns; Chrome keeps running in the background.');
      }
      process.exit(0);
    }
    attempt++;
  }
  console.error(`TIMED OUT waiting for CDP port ${PORT} after 10s`);
  process.exit(1);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
