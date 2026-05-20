// lib/healthchecks-ping.mjs — Healthchecks.io dead-man's switch helper.
//
// P0-1 from data/input-quality-roadmap.md. Wraps scheduled jobs so silent
// skips (e.g., Tahoe launchd KeepAlive bug) get surfaced within <35 min
// instead of 18 hours. Ping URLs are stored in ~/.career-ops-secrets under
// HEALTHCHECKS_<JOB>_PING; the helper is a no-op if the URL is unset, so
// scripts don't break for users without a Healthchecks account.
//
// Usage:
//   import { hc } from '../lib/healthchecks-ping.mjs';
//   const ping = hc('PORTAL_SCAN');  // reads HEALTHCHECKS_PORTAL_SCAN_PING
//   await ping.start();
//   try { ... } catch (e) { await ping.fail(e); throw; }
//   await ping.success();

import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const SECRETS_PATH = join(homedir(), '.career-ops-secrets');

function loadPingUrl(jobKey) {
  if (!existsSync(SECRETS_PATH)) return null;
  const want = `HEALTHCHECKS_${jobKey}_PING`;
  for (const line of readFileSync(SECRETS_PATH, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && m[1] === want) return m[2].trim();
  }
  return null;
}

async function safePing(url, suffix = '', body = '') {
  if (!url) return;
  try {
    await fetch(url + suffix, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
  } catch {}
}

export function hc(jobKey) {
  const url = loadPingUrl(jobKey);
  return {
    enabled: !!url,
    start: () => safePing(url, '/start'),
    success: (note = '') => safePing(url, '', note ? String(note).slice(0, 9000) : ''),
    fail: (err = '') => safePing(url, '/fail', err instanceof Error ? err.stack || err.message : String(err).slice(0, 9000)),
  };
}
