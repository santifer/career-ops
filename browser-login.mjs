#!/usr/bin/env node

/**
 * browser-login.mjs — Interactive browser session on CT 203
 *
 * Launches Playwright Chromium with remote debugging so you can
 * log into sites (LinkedIn, etc.) from your MacBook via SSH tunnel.
 *
 * Usage:
 *   1. On CT 203:  node browser-login.mjs [--port=9222] [--url=https://linkedin.com/login]
 *   2. On MacBook:  ssh -L 9222:localhost:9222 root@10.1.30.50
 *   3. Open Chrome on MacBook → navigate to http://localhost:9222
 *      (or chrome://inspect → Configure → localhost:9222 → Inspect)
 *   4. Log into LinkedIn in the remote browser
 *   5. Press Enter in the terminal to save session and exit
 *
 * Saves browser state (cookies, localStorage) to auth/browser-state.json.
 * apply-auto.mjs loads this state for authenticated sessions.
 *
 * Supports --profile=<name> for multiple saved sessions:
 *   node browser-login.mjs --profile=linkedin
 *   → saves to auth/linkedin-state.json
 */

import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse args
const args = process.argv.slice(2);
const flags = {};
const positional = [];

for (const arg of args) {
  if (arg.startsWith('--')) {
    const [key, val] = arg.slice(2).split('=');
    flags[key] = val ?? true;
  } else {
    positional.push(arg);
  }
}

const port = parseInt(flags.port || '9222', 10);
const profileName = flags.profile || 'browser';
const startUrl = flags.url || positional[0] || 'https://www.linkedin.com/login';
const authDir = resolve(__dirname, 'auth');
const statePath = resolve(authDir, `${profileName}-state.json`);
const userDataDir = resolve(authDir, `${profileName}-profile`);

// Ensure auth directory exists
mkdirSync(authDir, { recursive: true });

async function main() {
  console.log('🌐 browser-login.mjs — Interactive browser session');
  console.log('');
  console.log(`  Profile:    ${profileName}`);
  console.log(`  State file: ${statePath}`);
  console.log(`  Debug port: ${port}`);
  console.log(`  Start URL:  ${startUrl}`);
  console.log('');

  // Launch with persistent context (preserves cookies across sessions)
  // AND remote debugging so MacBook can connect
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--remote-debugging-port=${port}`,
      '--remote-debugging-address=0.0.0.0',
    ],
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ignoreHTTPSErrors: true,
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('✅ Browser launched with remote debugging.');
  console.log('');
  console.log('📋 Connect from your MacBook:');
  console.log('');
  console.log(`   1. SSH tunnel:  ssh -L ${port}:localhost:${port} root@10.1.30.50`);
  console.log(`   2. Open in Chrome:  http://localhost:${port}`);
  console.log('      → Click the page URL to interact with the remote browser');
  console.log('');
  console.log('   Log into LinkedIn (or any site you need), then come back here.');
  console.log('');

  // Wait for user to press Enter
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => {
    rl.question('⏎  Press Enter when done to save session and exit... ', () => {
      rl.close();
      resolve();
    });
  });

  // Save storage state (cookies + localStorage)
  await context.storageState({ path: statePath });
  console.log('');
  console.log(`💾 Session saved to ${statePath}`);

  // Show what cookies we captured
  const cookies = await context.cookies();
  const linkedinCookies = cookies.filter(c => c.domain.includes('linkedin'));
  console.log(`   ${cookies.length} total cookies, ${linkedinCookies.length} LinkedIn cookies`);

  if (linkedinCookies.length > 0) {
    console.log('   ✅ LinkedIn session captured — apply-auto.mjs can now use authenticated LinkedIn');
  } else {
    console.log('   ⚠️ No LinkedIn cookies found. Did you log in?');
  }

  await context.close();
  console.log('');
  console.log('Done. The persistent browser profile is at:');
  console.log(`   ${userDataDir}`);
  console.log('');
  console.log('To re-use this session in apply-auto.mjs:');
  console.log(`   node apply-auto.mjs <url> <pdf> --auth=${statePath}`);
}

main().catch(err => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
