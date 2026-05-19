#!/usr/bin/env node
/**
 * scripts/scrape-contact-photo.mjs — relationship-intelligence photo scraper.
 *
 * Scrapes LinkedIn profile photo (or X profile photo on LI 404) for one or
 * many contacts, downloads to data/contact-photos/{id}.jpg (gitignored —
 * personal). The renderer falls back to initials when photo_path is null.
 *
 * Three modes:
 *
 *   --contact <id>        scrape one
 *   --batch <preset>      'top-100' | 'top-500' | 'in-outreach' | 'all'
 *   --all                 every contact in _CONTACTS_DATA missing a photo
 *
 *   --setup-auth          run once to authenticate Playwright vs LinkedIn —
 *                         opens a non-headless Chromium for Mitchell to log
 *                         in; saves storage state to
 *                         data/linkedin-storage-state.json (gitignored).
 *                         Required before --contact/--batch/--all can scrape.
 *
 *   --queue-only          don't scrape; just write URLs to
 *                         data/contact-photo-queue.jsonl for Claude orchestrators
 *                         to consume via Chrome MCP.
 *
 * Anti-rate-limit: throttle to ~30 scrapes/min by default. Override with
 * --rate-per-min N.
 *
 * NEVER fabricates placeholder images. If LinkedIn 404s, tries X (if x_handle
 * known); else leaves photo_path null so the renderer's initials fallback
 * fires.
 *
 * Failed scrapes log to data/contact-photos-failed.md with reason.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreContact } from '../lib/contact-priority-scorer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PHOTOS_DIR = join(ROOT, 'data/contact-photos');
const FAILED_LOG = join(ROOT, 'data/contact-photos-failed.md');
const STORAGE_STATE_PATH = join(ROOT, 'data/linkedin-storage-state.json');
const QUEUE_PATH = join(ROOT, 'data/contact-photo-queue.jsonl');
const DASHBOARD_HTML = join(ROOT, 'dashboard/index.html');

const argv = process.argv.slice(2);
function flag(name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] || true) : fallback;
}
function has(name) { return argv.includes(name); }

const CONTACT_ID  = flag('--contact');
const BATCH       = flag('--batch');
const ALL         = has('--all');
const SETUP_AUTH  = has('--setup-auth');
const QUEUE_ONLY  = has('--queue-only');
const RATE_PER_MIN = Number(flag('--rate-per-min', 30));
const VERBOSE     = has('--verbose') || has('-v');
const DRY_RUN     = has('--dry-run');

function log(...args) { console.error('[scrape-photo]', ...args); }
function vlog(...args) { if (VERBOSE) console.error('[scrape-photo]', ...args); }

function ensureDirs() {
  if (!existsSync(PHOTOS_DIR)) mkdirSync(PHOTOS_DIR, { recursive: true });
}

function extractGlobal(html, varName) {
  const re = new RegExp(`var\\s+${varName}\\s*=\\s*(\\[[\\s\\S]*?\\]|\\{[\\s\\S]*?\\});`, 'm');
  const m = html.match(re);
  if (!m) return null;
  try { return JSON.parse(m[1].replace(/<\\\//g, '</')); } catch { return null; }
}

function loadContacts() {
  if (!existsSync(DASHBOARD_HTML)) {
    log('dashboard/index.html missing — run `node scripts/build-dashboard.mjs` first');
    process.exit(1);
  }
  const html = readFileSync(DASHBOARD_HTML, 'utf8');
  const contacts = extractGlobal(html, '_CONTACTS_DATA') || [];
  if (contacts.length === 0) {
    log('no _CONTACTS_DATA found in dashboard/index.html');
    process.exit(1);
  }
  return contacts;
}

function selectContacts(contacts) {
  if (CONTACT_ID) return contacts.filter(c => c.id === CONTACT_ID);
  if (ALL) return contacts.filter(c => !c.photo_path && c.linkedin_url);

  if (BATCH === 'in-outreach') return contacts.filter(c => c.in_outreach && !c.photo_path && c.linkedin_url);

  if (BATCH === 'top-100' || BATCH === 'top-500') {
    // Use the contact-priority-scorer to rank
    try {
      const policyPath = join(ROOT, 'config/contact-priority-weights.yml');
      if (!existsSync(policyPath)) {
        log('config/contact-priority-weights.yml missing — falling back to in_outreach-first');
        return contacts.filter(c => !c.photo_path && c.linkedin_url).slice(0, BATCH === 'top-500' ? 500 : 100);
      }
      const { parseSimpleYaml } = (() => {
        // Minimal inline parser identical to the one in lib/contact-priority-scorer.mjs
        // to avoid circular import (we already imported scoreContact)
        return { parseSimpleYaml: null };
      })();
      // Just call scoreContact with default weights from the policy file
      const yamlText = readFileSync(policyPath, 'utf8');
      const weights = _parseYamlWeights(yamlText);
      const targetCompanies = _parseYamlTargetCompanies(yamlText);
      const tierMult = _parseYamlTierMultiplier(yamlText);
      const scored = contacts
        .filter(c => c.linkedin_url && !c.photo_path)
        .map(c => ({ contact: c, ...scoreContact(c, weights, { targetCompanies, tierBoostMultiplier: tierMult }) }))
        .sort((a, b) => b.score - a.score);
      const limit = BATCH === 'top-500' ? 500 : 100;
      return scored.slice(0, limit).map(s => s.contact);
    } catch (e) {
      log('priority scoring failed (' + e.message + ') — falling back to in_outreach-first');
      return contacts.filter(c => !c.photo_path && c.linkedin_url).slice(0, BATCH === 'top-500' ? 500 : 100);
    }
  }

  log('No --contact / --batch / --all specified.');
  process.exit(1);
}

function _parseYamlWeights(text) {
  // Crude parse — find `weights:` block and extract key: value pairs at indent 2
  const lines = text.split('\n');
  let inWeights = false;
  const out = {};
  for (const line of lines) {
    if (/^weights:\s*$/.test(line)) { inWeights = true; continue; }
    if (inWeights) {
      const m = line.match(/^\s\s([a-z0-9_]+):\s*(\S+)/);
      if (m) {
        const num = parseFloat(m[2]);
        if (!isNaN(num)) out[m[1]] = num;
      } else if (line.trim() && !line.startsWith(' ')) {
        break;
      }
    }
  }
  return out;
}

function _parseYamlTargetCompanies(text) {
  const lines = text.split('\n');
  let inBlock = false;
  const out = [];
  for (const line of lines) {
    if (/^\s\stier_boost:/.test(line) || /^tier_boost:\s*$/.test(line)) continue;
    if (/^\s\s\s\stier_boost:|^tier_boost:|^  target_companies:/.test(line)) continue;
    if (/^\s\s\stier_boost:|^  target_companies:/.test(line)) { inBlock = true; continue; }
    if (/^\s\s\starget_companies:|^  target_companies:/.test(line)) { inBlock = true; continue; }
    if (inBlock && /^\s+-\s/.test(line)) {
      out.push(line.replace(/^\s+-\s+/, '').trim());
    } else if (inBlock && line.trim() && !line.startsWith(' ')) {
      break;
    }
  }
  return out;
}

function _parseYamlTierMultiplier(text) {
  const m = text.match(/^\s\smultiplier:\s*([0-9.]+)/m);
  return m ? parseFloat(m[1]) : 1.5;
}

async function setupAuth() {
  log('Opening Chromium (NOT headless) for manual LinkedIn login…');
  log('Log into https://www.linkedin.com in the browser; the script will detect login and save state.');
  let chromium;
  try {
    chromium = (await import('playwright')).chromium;
  } catch {
    log('playwright not installed — run `npm install playwright` first');
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('https://www.linkedin.com/login');
  // Wait until URL leaves /login (indicates logged-in feed redirect)
  await page.waitForURL(url => !String(url).includes('/login'), { timeout: 5 * 60_000 });
  await ctx.storageState({ path: STORAGE_STATE_PATH });
  log(`storage state saved to ${STORAGE_STATE_PATH}`);
  await browser.close();
}

async function loadPlaywright() {
  try {
    return (await import('playwright')).chromium;
  } catch {
    return null;
  }
}

async function scrapeOne(contact, browser) {
  if (!contact.linkedin_url) return { ok: false, reason: 'no_linkedin_url' };
  const outPath = join(PHOTOS_DIR, `${contact.id}.jpg`);
  if (existsSync(outPath)) return { ok: true, reason: 'cached', path: outPath };

  if (DRY_RUN) {
    return { ok: false, reason: 'dry_run_skip', would_scrape: contact.linkedin_url };
  }

  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    storageState: existsSync(STORAGE_STATE_PATH) ? STORAGE_STATE_PATH : undefined,
  });
  const page = await ctx.newPage();

  let imgUrl = null;
  try {
    await page.goto(contact.linkedin_url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1500);
    // LinkedIn profile photos use various selectors. Try in priority order.
    imgUrl = await page.evaluate(() => {
      const sels = [
        'img.profile-photo-edit__preview',
        'img.pv-top-card-profile-picture__image',
        'img.pv-top-card__photo',
        'button.pv-top-card-profile-picture img',
        'img.profile-photo',
        'img[class*="profile-picture"]',
      ];
      for (const s of sels) {
        const el = document.querySelector(s);
        if (el && el.src && el.src.startsWith('https://')) return el.src;
      }
      // Fallback: og:image meta
      const og = document.querySelector('meta[property="og:image"]');
      if (og && og.content && og.content.startsWith('https://')) return og.content;
      return null;
    });
  } catch (e) {
    vlog(`navigation/extract error for ${contact.id}: ${e.message.slice(0, 120)}`);
  }

  // X fallback if LinkedIn didn't yield a photo
  if (!imgUrl && contact.x_handle) {
    try {
      const xUrl = `https://x.com/${contact.x_handle.replace(/^@/, '')}`;
      await page.goto(xUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.waitForTimeout(1500);
      imgUrl = await page.evaluate(() => {
        const el = document.querySelector('img[src*="profile_images"]');
        return (el && el.src) || null;
      });
    } catch (e) {
      vlog(`X fallback error for ${contact.id}: ${e.message.slice(0, 120)}`);
    }
  }

  await ctx.close();

  if (!imgUrl) return { ok: false, reason: 'no_photo_found', linkedin_url: contact.linkedin_url };

  // Download the image with explicit timeout (no surprise hangs).
  try {
    const resp = await fetch(imgUrl, { signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) return { ok: false, reason: `http_${resp.status}`, imgUrl };
    const buf = Buffer.from(await resp.arrayBuffer());
    writeFileSync(outPath, buf);
    return { ok: true, reason: 'scraped', path: outPath, bytes: buf.length };
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return { ok: false, reason: 'download_timeout', imgUrl };
    }
    return { ok: false, reason: `download_error: ${e.message.slice(0, 80)}`, imgUrl };
  }
}

function appendFailedLog(contact, reason) {
  const ts = new Date().toISOString();
  const line = `- ${ts}  ${contact.id}  ${contact.name}  ${contact.linkedin_url || '(no LI)'}  → ${reason}\n`;
  appendFileSync(FAILED_LOG, line);
}

function queueWriteOne(contact) {
  const rec = {
    id: contact.id,
    name: contact.name,
    linkedin_url: contact.linkedin_url || '',
    x_handle: contact.x_handle || '',
    queued_at: new Date().toISOString(),
  };
  appendFileSync(QUEUE_PATH, JSON.stringify(rec) + '\n');
}

async function main() {
  ensureDirs();

  if (SETUP_AUTH) {
    await setupAuth();
    return;
  }

  const contacts = loadContacts();
  const targets = selectContacts(contacts);
  if (targets.length === 0) {
    log('no contacts match selection criteria');
    return;
  }
  log(`selected ${targets.length} contact(s) to scrape`);

  if (QUEUE_ONLY) {
    for (const c of targets) queueWriteOne(c);
    log(`queued ${targets.length} contacts to ${QUEUE_PATH}`);
    return;
  }

  const chromium = await loadPlaywright();
  if (!chromium) {
    log('playwright not installed — falling back to --queue-only mode');
    for (const c of targets) queueWriteOne(c);
    log(`queued ${targets.length} contacts to ${QUEUE_PATH}`);
    return;
  }

  if (!existsSync(STORAGE_STATE_PATH)) {
    log('⚠ no LinkedIn storage state at ' + STORAGE_STATE_PATH);
    log('  → run `node scripts/scrape-contact-photo.mjs --setup-auth` once first.');
    log('  → for now, falling back to queue-only mode.');
    for (const c of targets) queueWriteOne(c);
    log(`queued ${targets.length} contacts to ${QUEUE_PATH}`);
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const minMsBetween = Math.max(50, Math.floor(60_000 / RATE_PER_MIN));
  let okCount = 0;
  let failCount = 0;
  let i = 0;
  for (const c of targets) {
    i++;
    const t0 = Date.now();
    const r = await scrapeOne(c, browser);
    const took = Date.now() - t0;
    if (r.ok) {
      okCount++;
      log(`${i}/${targets.length}  ✓ ${c.name.padEnd(28)} ${c.id} (${r.reason}, ${took}ms)`);
    } else {
      failCount++;
      log(`${i}/${targets.length}  ✗ ${c.name.padEnd(28)} ${c.id} (${r.reason}, ${took}ms)`);
      appendFailedLog(c, r.reason);
    }
    // Throttle
    if (i < targets.length) {
      const wait = Math.max(0, minMsBetween - took);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
    }
  }
  await browser.close();
  log(`done: ${okCount} ok, ${failCount} failed, ${targets.length} total`);
}

main().catch(e => {
  console.error('FATAL:', e.message, e.stack);
  process.exit(1);
});
