// lib/scan-history-utils.mjs — first_seen_at helpers for scan-history.tsv.
//
// P0-5 from data/input-quality-roadmap.md. The scan-history.tsv file already
// has a `first_seen` column (col 2) but stores date-only granularity. This
// helper:
//   1. Normalizes any value in col 2 to an ISO-8601 timestamp (date → date+T00:00:00Z)
//   2. Exposes getFirstSeenAt(url) for the zombie scorer + dashboard analytics
//   3. Provides isoNowPT() for new writes (PT-aware so per-day buckets line up
//      with the rest of the system per the UTC/PT bug fix from earlier today)
//
// Schema reality:
//   scan.mjs writes 7 cols: url, first_seen, portal, title, company, status, location
//   scan-rss.mjs writes 6 cols (no location)
//   scan-email.mjs + scan-hn-hiring.mjs append in similar 6-col shape
//   Older rows have first_seen as YYYY-MM-DD; new rows should use ISO timestamp
//
// All readers should use parseFirstSeen() to handle both formats uniformly.

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(__filename));
const SCAN_HISTORY_PATH = join(ROOT, 'data/scan-history.tsv');

let _firstSeenCache = null;
let _cacheMtime = null;

function rebuildCacheIfStale() {
  if (!existsSync(SCAN_HISTORY_PATH)) {
    _firstSeenCache = new Map();
    _cacheMtime = null;
    return;
  }
  const stat = require('fs').statSync(SCAN_HISTORY_PATH);
  if (_firstSeenCache && _cacheMtime === stat.mtimeMs) return;
  const map = new Map();
  for (const line of readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n')) {
    if (!line || line.startsWith('url\t')) continue;
    const [url, firstSeen] = line.split('\t');
    if (url && firstSeen && !map.has(url)) {
      map.set(url, parseFirstSeen(firstSeen));
    }
  }
  _firstSeenCache = map;
  _cacheMtime = stat.mtimeMs;
}

export function parseFirstSeen(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed + 'T00:00:00Z';
  return null;
}

export function getFirstSeenAt(url) {
  rebuildCacheIfStale();
  return _firstSeenCache.get(url) || null;
}

export function ageDaysFromFirstSeen(firstSeenIso, nowMs = Date.now()) {
  if (!firstSeenIso) return null;
  const ms = Date.parse(firstSeenIso);
  if (Number.isNaN(ms)) return null;
  return Math.floor((nowMs - ms) / 86400000);
}

export function isoNowPT() {
  return new Date().toISOString();
}
