#!/usr/bin/env node
/**
 * scripts/cdp-auth-probe.mjs
 *
 * Periodic health probe for the CDP-attached Chrome that powers the daily
 * Phase B' enrichment cadence. Writes data/cdp-auth-state.json so the
 * morning heartbeat email can render a banner without doing the slow
 * Playwright handshake itself.
 *
 * Two-stage probe:
 *   1. CDP up? — fetch http://127.0.0.1:9222/json/version (2s timeout)
 *   2. LinkedIn signed in? — Playwright navigates to /feed/, checks URL
 *      didn't redirect to /login or /authwall
 *
 * Output schema:
 *   {
 *     "checked_at": "2026-05-19T17:55:00Z",
 *     "cdp_up": true|false,
 *     "cdp_browser": "Chrome/148.0.7778.168" | null,
 *     "linkedin_signed_in": true|false|null,  // null if CDP down
 *     "linkedin_url_landed": "https://www.linkedin.com/feed/" | "...authwall...",
 *     "duration_ms": 4321,
 *     "error": null | "string"
 *   }
 *
 * Scheduled by com.mitchell.career-ops.cdp-auth-probe.plist every 30 min.
 * Heartbeat email reads the state to render the auth-break banner.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_PATH = join(ROOT, 'data/cdp-auth-state.json');
const LOG_DIR = join(ROOT, 'data/logs');
const TODAY = new Date().toISOString().slice(0, 10);

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

const PORT = 9222;
const CDP_TIMEOUT_MS = 2000;
const LINKEDIN_TIMEOUT_MS = 20000;

async function probeCdp() {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), CDP_TIMEOUT_MS);
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: ac.signal });
    if (!r.ok) return { up: false, browser: null };
    const j = await r.json();
    return { up: true, browser: j.Browser || 'unknown' };
  } catch {
    return { up: false, browser: null };
  } finally {
    clearTimeout(timer);
  }
}

async function probeLinkedinAuth() {
  let playwright;
  try { playwright = await import('playwright'); }
  catch { return { signed_in: null, url: null, error: 'playwright not installed' }; }

  try {
    const browser = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
    const ctx = browser.contexts()[0];
    if (!ctx) { await browser.close().catch(() => {}); return { signed_in: null, url: null, error: 'no contexts on CDP' }; }
    const page = await ctx.newPage();
    try {
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: LINKEDIN_TIMEOUT_MS });
      const landedUrl = page.url();
      const signed_in = !/\/(login|authwall|checkpoint|signup)/.test(landedUrl);
      return { signed_in, url: landedUrl, error: null };
    } finally {
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  } catch (e) {
    return { signed_in: false, url: null, error: e.message.slice(0, 200) };
  }
}

async function main() {
  const t0 = Date.now();
  const cdp = await probeCdp();

  let li = { signed_in: null, url: null, error: null };
  if (cdp.up) li = await probeLinkedinAuth();

  const state = {
    checked_at: new Date().toISOString(),
    cdp_up: cdp.up,
    cdp_browser: cdp.browser,
    linkedin_signed_in: li.signed_in,
    linkedin_url_landed: li.url,
    duration_ms: Date.now() - t0,
    error: li.error,
  };

  writeFileSync(OUT_PATH, JSON.stringify(state, null, 2));
  // One-line summary to stdout for launchd log
  const summary = cdp.up
    ? (li.signed_in ? 'OK' : `AUTH BROKEN (${li.url || li.error})`)
    : 'CDP DOWN';
  console.log(`[${state.checked_at}] cdp-auth-probe: ${summary} (${state.duration_ms}ms)`);
  // Exit 0 always — the state file IS the alarm; non-zero exit would tell
  // launchd this is broken which it isn't, only the auth is.
}

main().catch(e => {
  // Even on fatal error, write a state file so heartbeat can render a "probe failed" banner
  try {
    writeFileSync(OUT_PATH, JSON.stringify({
      checked_at: new Date().toISOString(),
      cdp_up: false,
      cdp_browser: null,
      linkedin_signed_in: null,
      linkedin_url_landed: null,
      duration_ms: 0,
      error: `probe script crashed: ${e.message}`,
    }, null, 2));
  } catch { /* */ }
  console.error('FATAL:', e.message);
  process.exit(1);
});
