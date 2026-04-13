#!/usr/bin/env node

/**
 * portal-auth.mjs — Persistent browser session manager via agent-browser
 *
 * Usage:
 *   node portal-auth.mjs login <portal>      # Login (visible browser)
 *   node portal-auth.mjs logout <portal>   # Clear session
 *   node portal-auth.mjs status [portal]   # Check validity
 *   node portal-auth.mjs list              # Show all sessions
 *   node portal-auth.mjs login-all         # Login to all portals
 *
 * Portals: linkedin, naukri, indeed, instahyre, wellfound
 *
 * For aggressive portals (LinkedIn), use agent-browser-stealth fork:
 *   npm install -g agent-browser-stealth  # provides `abs` CLI
 *   Then set BROWSER_CLI=abs in environment.
 *
 * See also: scan-auth.mjs — full authenticated scanner with keyword search,
 *           pagination, dedup, and title filtering for job portals.
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

const BASE_DIR = '.sessions';
const HOME = process.env.HOME || '';

const PORTALS = {
  linkedin: {
    name: 'LinkedIn',
    loginUrl: 'https://www.linkedin.com/',
    checkUrl: 'https://www.linkedin.com/feed/',
    isLoggedIn(url, pageText) {
      if (url.includes('/login') || url.includes('/checkpoint/')) return false;
      if (url.includes('/feed/') || url.includes('/mynetwork/') ||
          url.includes('/jobs/') || url.includes('/messaging/')) return true;
      const text = pageText || '';
      if (url === 'https://www.linkedin.com/' || url === 'https://www.linkedin.com') {
        if (text.includes('Sign in to LinkedIn') || text.includes('Email or Phone')) return false;
        return text.includes('Messaging') || text.includes('My Network') ||
               text.includes('Sign out') || text.includes('Profile');
      }
      return text.includes('Sign out') || text.includes('My Network') || text.includes('Messaging');
    },
    isLoginPage(url, pageText) {
      if (url.includes('/login') || url.includes('/checkpoint/')) return true;
      return (pageText || '').includes('Sign in to LinkedIn') || (pageText || '').includes('Email or Phone');
    },
  },
  naukri: {
    name: 'Naukri.com',
    loginUrl: 'https://www.naukri.com/',
    checkUrl: 'https://www.naukri.com/nlogin/login',
    isLoggedIn(url) { return !url.includes('login') && !url.includes('nlogin'); },
    isLoginPage(url, pageText) {
      if (url.includes('login') || url.includes('nlogin')) return true;
      return (pageText || '').includes('Login') && (pageText || '').includes('Password');
    },
  },
  indeed: {
    name: 'Indeed',
    loginUrl: 'https://www.indeed.com/',
    checkUrl: 'https://www.indeed.com/account/move',
    isLoggedIn(url) { return !url.includes('/login') && !url.includes('/auth'); },
    isLoginPage(url, pageText) {
      if (url.includes('/login') || url.includes('/auth')) return true;
      return (pageText || '').includes('Sign in') && (pageText || '').includes('password');
    },
  },
  instahyre: {
    name: 'Instahyre',
    loginUrl: 'https://www.instahyre.com/accounts/login/',
    checkUrl: 'https://www.instahyre.com/dashboard/',
    isLoggedIn(url) { return !url.includes('/login') && !url.includes('/signin'); },
    isLoginPage(url, pageText) {
      if (url.includes('/login') || url.includes('/signin')) return true;
      return (pageText || '').includes('Login') && (pageText || '').includes('Password');
    },
  },
  wellfound: {
    name: 'Wellfound',
    loginUrl: 'https://wellfound.com/login',
    checkUrl: 'https://wellfound.com/role',
    isLoggedIn(url) { return !url.includes('/login') && !url.includes('/signin'); },
    isLoginPage(url, pageText) {
      if (url.includes('/login') || url.includes('/signin')) return true;
      return (pageText || '').includes('Sign in') && (pageText || '').includes('Email');
    },
  },
};

const BROWSER_CLI = process.env.BROWSER_CLI || 'agent-browser';

function ab(args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(BROWSER_CLI, args, { timeout, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => {
      if (code === 0) {
        try { resolve(JSON.parse(stdout)); }
        catch { resolve({ success: true, data: stdout }); }
      } else {
        reject(new Error(stderr || `${BROWSER_CLI} exited ${code}`));
      }
    });
    proc.on('error', reject);
  });
}

async function pageState() {
  const [urlResult, textResult] = await Promise.all([
    ab(['get', 'url', '--json']),
    ab(['eval', "document.body ? document.body.innerText : ''", '--json']),
  ]);
  return {
    url: urlResult.success ? (urlResult.data?.url || urlResult.data || '') : '',
    text: textResult.success ? (textResult.data?.result || '') : '',
  };
}

function statePath(portal) {
  return join(BASE_DIR, portal, 'source-state.json');
}

function sessionFile(portal) {
  return join(HOME, '.agent-browser', 'sessions', `${portal}-default.json`);
}

function loadState(portal) {
  const path = statePath(portal);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

function saveState(portal) {
  if (!existsSync(join(BASE_DIR, portal))) mkdirSync(join(BASE_DIR, portal), { recursive: true });
  writeFileSync(statePath(portal), JSON.stringify({
    version: 1,
    created_at: new Date().toISOString(),
    session_name: portal,
  }, null, 2));
}

function sessionExists(portal) {
  return existsSync(sessionFile(portal));
}

function screenshot(portal, name) {
  return ab(['screenshot', join(BASE_DIR, portal, name), '--json']);
}

async function doLogin(portal) {
  const p = PORTALS[portal];
  if (!existsSync(join(BASE_DIR, portal))) mkdirSync(join(BASE_DIR, portal), { recursive: true });

  console.log(`\n🌐 Login to ${p.name}`);
  console.log(`   Session: --session-name ${portal}`);
  console.log(`   URL: ${p.loginUrl}`);
  console.log(`\n⏳ Browser opening... log in manually.\n`);

  try {
    await ab(['open', p.loginUrl, '--session-name', portal, '--headed', '--timeout', '30000', '--json']);

    const maxWait = 300000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, 2000));
      const { url, text } = await pageState();

      if (p.isLoggedIn(url, text) && !p.isLoginPage(url, text)) {
        console.log(`\n✅ Login detected: ${url}`);

        await ab(['open', p.checkUrl, '--session-name', portal, '--timeout', '20000', '--json']);
        await new Promise(r => setTimeout(r, 1500));

        const { url: finalUrl, text: finalText } = await pageState();

        if (p.isLoggedIn(finalUrl, finalText) && !p.isLoginPage(finalUrl, finalText)) {
          console.log(`✅ Session validated at ${finalUrl}`);
          saveState(portal);
          await screenshot(portal, 'login-success.png');
          console.log(`   Screenshot: .sessions/${portal}/login-success.png`);
        } else {
          console.log(`⚠️  Session check failed — URL: ${finalUrl}`);
          await screenshot(portal, 'login-check-failed.png');
        }
        return;
      }
    }

    console.log(`\n⏱️  Timed out.`);
    const { url } = await pageState();
    console.log(`   Current URL: ${url}`);
    await screenshot(portal, 'login-timeout.png');
  } finally {
    await ab(['close', '--json']);
  }
}

async function validateSession(portal) {
  const p = PORTALS[portal];

  if (!sessionExists(portal)) {
    console.log(`❌ No session for ${p.name}`);
    return { valid: false };
  }

  try {
    await ab(['open', p.checkUrl, '--session-name', portal, '--timeout', '15000', '--json']);
    await new Promise(r => setTimeout(r, 2000));

    const { url, text } = await pageState();
    const state = loadState(portal);
    await screenshot(portal, 'check.png');

    if (p.isLoggedIn(url, text) && !p.isLoginPage(url, text)) {
      console.log(`✅ ${p.name}: session active`);
      console.log(`   URL: ${url}`);
      console.log(`   Last login: ${state?.created_at || 'unknown'}`);
      return { valid: true, url };
    } else {
      console.log(`❌ ${p.name}: session invalid`);
      console.log(`   URL: ${url}`);
      return { valid: false, reason: 'expired', url };
    }
  } finally {
    await ab(['close', '--json']);
  }
}

async function doLogout(portal) {
  const p = PORTALS[portal];
  const dir = join(BASE_DIR, portal);

  // Delete career-ops metadata
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });

  // Delete agent-browser native session
  const sf = sessionFile(portal);
  if (existsSync(sf)) {
    try { unlinkSync(sf); } catch { /* ignore */ }
  }

  console.log(`✅ ${p.name}: session cleared`);
}

async function listSessions() {
  if (!existsSync(BASE_DIR)) {
    console.log('No sessions. Run `node portal-auth.mjs login <portal>` to create one.');
    console.log(`Portals: ${Object.keys(PORTALS).join(', ')}`);
    return;
  }

  const portals = readdirSync(BASE_DIR).filter(f => existsSync(statePath(f)));
  if (portals.length === 0) {
    console.log('No active sessions.');
    return;
  }

  console.log('\nSessions\n========');
  for (const portal of portals.sort()) {
    const p = PORTALS[portal] || { name: portal };
    const state = loadState(portal);
    console.log(`\n${p.name} (${portal}) — ${sessionExists(portal) ? '✅ active' : '❌ session missing'}`);
    console.log(`  Last login: ${state?.created_at || 'unknown'}`);
  }
}

async function main() {
  const [cmd, portal] = process.argv.slice(2);

  if (!cmd || cmd === 'help') {
    console.log(`
portal-auth.mjs — Persistent session manager (agent-browser)

Usage:
  node portal-auth.mjs login <portal>     Login (visible browser)
  node portal-auth.mjs logout <portal>  Clear session
  node portal-auth.mjs status [portal]  Check validity
  node portal-auth.mjs list             Show sessions
  node portal-auth.mjs login-all        Login to all portals

Portals: ${Object.keys(PORTALS).join(', ')}
Sessions: ~/.agent-browser/sessions/{portal}-default.json
`);
    return;
  }

  if (cmd === 'login') {
    if (!portal || !PORTALS[portal]) {
      console.error(`Usage: node portal-auth.mjs login <portal>`);
      console.log(`Portals: ${Object.keys(PORTALS).join(', ')}`);
      process.exit(1);
    }
    await doLogin(portal);

  } else if (cmd === 'logout') {
    if (!portal) { console.error('Usage: node portal-auth.mjs logout <portal>'); process.exit(1); }
    await doLogout(portal);

  } else if (cmd === 'status') {
    if (portal) {
      if (!PORTALS[portal]) { console.log(`Unknown: ${portal}`); return; }
      await validateSession(portal);
    } else {
      const dirs = existsSync(BASE_DIR) ? readdirSync(BASE_DIR).filter(f => PORTALS[f]) : [];
      for (const p of dirs) {
        await validateSession(p);
        console.log('');
      }
    }

  } else if (cmd === 'list') {
    await listSessions();

  } else if (cmd === 'login-all') {
    for (const p of Object.keys(PORTALS)) {
      if (sessionExists(p)) { console.log(`\nSkipping ${p} — session exists`); continue; }
      console.log(`\n${'='.repeat(50)}\nLogging in: ${p}\n${'='.repeat(50)}`);
      await doLogin(p);
    }

  } else {
    console.log(`Unknown command: ${cmd}`);
  }
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
