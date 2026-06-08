#!/usr/bin/env node
/**
 * workday-login.mjs — Pre-authenticate a Workday tenant and save the session.
 *
 * Run ONCE per Workday tenant. Opens a real browser window so you can sign in
 * manually. After sign-in, saves cookies + localStorage to
 * data/workday-sessions/{tenant}.json. auto-submit.mjs then reuses this session
 * and skips the auth wall entirely.
 *
 * Usage:
 *   node workday-login.mjs --url "https://gevernova.wd5.myworkdayjobs.com/..."
 *   node workday-login.mjs --tenant gevernova          # opens tenant home page
 *   node workday-login.mjs --list                      # show saved sessions
 *   node workday-login.mjs --clear gevernova           # delete saved session
 *   node workday-login.mjs --clear-all                 # delete all sessions
 *
 * Sessions are stored per Workday tenant (hostname prefix, e.g. "gevernova",
 * "humana", "globalhr"). A single sign-in covers ALL jobs on that tenant.
 * Sessions typically last 7-30 days depending on the tenant.
 */

import { chromium }                  from 'playwright';
import { readFileSync, writeFileSync,
         renameSync, existsSync,
         mkdirSync, readdirSync,
         unlinkSync }                from 'fs';
import { join, dirname }             from 'path';
import { fileURLToPath }             from 'url';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR  = join(__dirname, 'data', 'workday-sessions');
const SESSION_TTL_DAYS = 21; // sessions older than this are flagged stale

if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });

// ── CLI parsing ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const hasFlag = flag => args.includes(flag);

function extractTenant(url) {
  try {
    const host = new URL(url).hostname; // e.g. gevernova.wd5.myworkdayjobs.com
    return host.split('.')[0];          // e.g. gevernova
  } catch { return null; }
}

function sessionPath(tenant) {
  return join(SESSIONS_DIR, `${tenant}.json`);
}

function listSessions() {
  if (!existsSync(SESSIONS_DIR)) { console.log('No sessions saved yet.'); return; }
  const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) { console.log('No sessions saved yet.'); return; }
  const now = Date.now();
  console.log(`\nSaved Workday sessions (${files.length}):\n`);
  for (const f of files) {
    const tenant = f.replace('.json', '');
    const p = join(SESSIONS_DIR, f);
    try {
      const data = JSON.parse(readFileSync(p, 'utf8'));
      const savedAt = new Date(data._saved_at);
      const ageDays = (now - savedAt.getTime()) / 86400000;
      const stale   = ageDays > SESSION_TTL_DAYS;
      const status  = stale ? '⚠️  STALE' : '✅ FRESH';
      console.log(`  ${status}  ${tenant.padEnd(20)} saved ${savedAt.toLocaleDateString()} (${ageDays.toFixed(1)} days ago)`);
    } catch {
      console.log(`  ❓  ${tenant.padEnd(20)} (could not read)`);
    }
  }
  console.log('');
}

// ── --list ────────────────────────────────────────────────────────────────────
if (hasFlag('--list')) { listSessions(); process.exit(0); }

// ── --clear ───────────────────────────────────────────────────────────────────
const clearTenant = getArg('--clear');
if (clearTenant) {
  const p = sessionPath(clearTenant);
  if (existsSync(p)) { unlinkSync(p); console.log(`Cleared session for: ${clearTenant}`); }
  else { console.log(`No session found for: ${clearTenant}`); }
  process.exit(0);
}
if (hasFlag('--clear-all')) {
  const files = existsSync(SESSIONS_DIR) ? readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json')) : [];
  files.forEach(f => unlinkSync(join(SESSIONS_DIR, f)));
  console.log(`Cleared ${files.length} session(s).`);
  process.exit(0);
}

// ── --url / --tenant ──────────────────────────────────────────────────────────
const urlArg    = getArg('--url');
const tenantArg = getArg('--tenant');

let startUrl, tenant;
if (urlArg) {
  tenant   = extractTenant(urlArg);
  startUrl = urlArg;
} else if (tenantArg) {
  tenant   = tenantArg;
  // Try wd1 and wd5 — Workday uses different data centers per tenant.
  // Prefer --url with a full job link to avoid 406 on bare tenant home pages.
  startUrl = `https://${tenant}.wd1.myworkdayjobs.com`;
  console.warn(`⚠️  Note: using wd1 subdomain. If you see HTTP 406, use --url with a full job URL instead.`);
} else {
  console.error('Usage: node workday-login.mjs --url <url>  OR  --tenant <slug>  OR  --list');
  process.exit(1);
}

if (!tenant) {
  console.error(`Could not extract tenant from URL: ${urlArg}`);
  process.exit(1);
}

// ── Check for existing session ────────────────────────────────────────────────
const existing = sessionPath(tenant);
if (existsSync(existing)) {
  try {
    const data = JSON.parse(readFileSync(existing, 'utf8'));
    const ageDays = (Date.now() - new Date(data._saved_at).getTime()) / 86400000;
    if (ageDays < SESSION_TTL_DAYS) {
      console.log(`\n✅ Session for "${tenant}" already saved (${ageDays.toFixed(1)} days old, good for ${(SESSION_TTL_DAYS - ageDays).toFixed(0)} more days).`);
      console.log(`   Run with --clear ${tenant} first if you want to refresh it.\n`);
      process.exit(0);
    }
    console.log(`\n⚠️  Existing session for "${tenant}" is stale (${ageDays.toFixed(1)} days). Re-authenticating...\n`);
  } catch {}
}

// ── Launch headed browser and wait for manual sign-in ────────────────────────
console.log(`\n🔐 Opening Workday login for tenant: ${tenant}`);
console.log(`   URL: ${startUrl}`);
console.log('\n👉 Instructions:');
console.log('   1. Sign in manually in the browser window that opens');
console.log('   2. Once signed in (you see the job page or home page), come back here');
console.log('   3. Press ENTER to save your session\n');

const browser = await chromium.launch({
  headless: false,
  args: ['--start-maximized'],
});
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  viewport: null, // use actual window size
});
const page = await context.newPage();

await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});

// Wait for user to sign in manually
await new Promise(resolve => {
  process.stdin.setRawMode?.(false);
  process.stdout.write('Waiting for you to sign in... Press ENTER when done: ');
  process.stdin.once('data', resolve);
  process.stdin.resume();
});

// Save storage state
console.log('\n💾 Saving session...');
const state     = await context.storageState();
state._saved_at = new Date().toISOString();
state._tenant   = tenant;
state._url      = startUrl;

const tmp = existing + '.tmp';
writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
renameSync(tmp, existing);

await browser.close();

console.log(`\n✅ Session saved for "${tenant}" → data/workday-sessions/${tenant}.json`);
console.log(`   Valid for ~${SESSION_TTL_DAYS} days. auto-submit.mjs will use it automatically.\n`);

// Show all sessions
listSessions();
process.exit(0);
