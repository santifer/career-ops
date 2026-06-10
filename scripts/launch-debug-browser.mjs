#!/usr/bin/env node
/**
 * launch-debug-browser.mjs — Launch Edge/Chrome with remote debugging enabled
 *
 * Runs the browser with --remote-debugging-port so Playwright can attach via
 * connectOverCDP while all installed extensions (including SpeedyApply) remain active.
 *
 * Run this in Terminal A before starting auto-submit in Terminal B.
 * Ctrl+C in this terminal closes the browser cleanly.
 *
 * Usage: node scripts/launch-debug-browser.mjs [--port <n>]
 * Default port: 9222
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserConfig, BrowserConfigError } from './load-browser-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? (process.argv[i + 1] ?? null) : null;
}

/**
 * Build the browser command-line arguments for remote debugging.
 * Exported for testing.
 */
export function buildBrowserArgs(port, profilePath) {
  return [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profilePath}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
}

const PORT = parseInt(argVal('--port') ?? '9222', 10);
const IS_CLI = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

async function main() {
  let browserCfg;
  try {
    browserCfg = await loadBrowserConfig();
  } catch (e) {
    if (e instanceof BrowserConfigError) {
      console.error(`[launch-debug-browser] FATAL: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }

  const exePath     = browserCfg.chromium?.executable_path;
  const profilePath = browserCfg.chromium?.profile_path;

  if (!exePath) {
    console.error('[launch-debug-browser] FATAL: chromium.executable_path not set in config/browser.yml');
    console.error('  Run: node scripts/detect-chromium.mjs   to find the path, then update browser.yml');
    process.exit(1);
  }

  if (!profilePath) {
    console.error('[launch-debug-browser] FATAL: chromium.profile_path not set in config/browser.yml');
    console.error('  Run: node scripts/detect-chromium.mjs   to find the profile path, then update browser.yml');
    process.exit(1);
  }

  const args = buildBrowserArgs(PORT, profilePath);

  console.log('[launch-debug-browser] Starting browser...');
  console.log(`  Executable: ${exePath}`);
  console.log(`  Profile:    ${profilePath}`);
  console.log(`  Debug port: ${PORT}`);
  console.log('');

  const child = spawn(exePath, args, { stdio: 'ignore', detached: false });

  child.on('error', (e) => {
    if (e.code === 'ENOENT') {
      console.error(`[launch-debug-browser] FATAL: executable not found: ${exePath}`);
      console.error('  Update chromium.executable_path in config/browser.yml');
    } else if (e.code === 'EADDRINUSE') {
      console.error(`[launch-debug-browser] Port ${PORT} already in use.`);
      console.error('  Is the browser already running with --remote-debugging-port? Close it first.');
    } else {
      console.error(`[launch-debug-browser] ERROR: ${e.message}`);
    }
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.log(`[launch-debug-browser] Browser exited (code ${code}).`);
    } else {
      console.log('[launch-debug-browser] Browser closed.');
    }
    process.exit(0);
  });

  console.log(`Debug browser running at http://localhost:${PORT}`);
  console.log('SpeedyApply and all installed extensions are active.');
  console.log('Keep this terminal open. Press Ctrl+C to quit the browser.\n');

  process.on('SIGINT', () => {
    console.log('\n[launch-debug-browser] Shutting down...');
    child.kill('SIGTERM');
    setTimeout(() => { child.kill('SIGKILL'); process.exit(0); }, 2000).unref();
  });
}

if (IS_CLI) {
  main().catch((e) => {
    console.error('[launch-debug-browser] FATAL:', e.message);
    process.exit(1);
  });
}
