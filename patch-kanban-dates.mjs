#!/usr/bin/env node
/**
 * patch-kanban-dates.mjs
 * TD-06 fix: replace dynamic createdAt / lastRefreshed expressions
 * in job-pulse-kanban.html with hardcoded ISO strings.
 *
 * Dynamic expressions reset to "just added" on every page load,
 * so the stale-card gate (>18h) never fires — every card always
 * looks fresh. This one-time patch anchors dates to actual injection
 * dates derived from the refresh-log comments in the file.
 *
 * Run: node patch-kanban-dates.mjs
 * Safe to re-run: idempotent (won't double-patch already-fixed lines)
 */

import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, 'dashboard', 'job-pulse-kanban.html');
const BAK = SRC + '.bak-td06-' + new Date().toISOString().replace(/[:.]/g, '-');

// Backup first
copyFileSync(SRC, BAK);
console.log('Backup:', BAK);

let html = readFileSync(SRC, 'utf8');

// ── Injection date anchors (UTC) ─────────────────────────────────────────────
// Groups derived from refresh-log comments in the HTML.
// r-series (demo seed cards)   → April 2026 verified dates
// live-1..8   → 2026-05-06T06:00:00.000Z  (first 6am scan)
// live-9,11   → 2026-05-07T06:00:00.000Z
// live-13,14  → 2026-05-08T06:00:00.000Z
// live-15..23 → 2026-05-11T01:00:00.000Z  (1AM scan)
// live-24..34 → 2026-05-13T01:00:00.000Z  (1AM scan, today)

// Build a card → date map. We use the card id (e.g. 'live-1') as the anchor.
// We'll do a two-pass: first replace per-card createdAt, then catch any missed
// generic `new Date().toISOString()` inside live-N card blocks.

const CARD_DATES = {
  // r-series seed cards (all "Verified live April 2026")
  'r1':  { created: '2026-04-30T06:00:00.000Z', refreshed: '2026-04-30T06:30:00.000Z' },
  'r2':  { created: '2026-04-30T06:00:00.000Z', refreshed: '2026-04-30T06:30:00.000Z' },
  'r3':  { created: '2026-04-30T06:00:00.000Z', refreshed: '2026-04-30T06:30:00.000Z' },
  'r4':  { created: '2026-04-30T06:00:00.000Z', refreshed: '2026-04-30T06:30:00.000Z' },
  'r5':  { created: '2026-04-30T06:00:00.000Z', refreshed: '2026-04-30T06:30:00.000Z' },
  'r6':  { created: '2026-04-30T06:00:00.000Z', refreshed: '2026-04-30T06:30:00.000Z' },
  'r7':  { created: '2026-04-30T06:00:00.000Z', refreshed: '2026-04-30T06:30:00.000Z' },
  'r8':  { created: '2026-04-30T06:00:00.000Z', refreshed: '2026-04-30T06:30:00.000Z' },
  'r9':  { created: '2026-04-30T06:00:00.000Z', refreshed: '2026-04-30T06:30:00.000Z' },
  'r10': { created: '2026-04-30T06:00:00.000Z', refreshed: '2026-04-30T06:30:00.000Z' },
  'r11': { created: '2026-04-27T06:00:00.000Z', refreshed: '2026-04-27T06:30:00.000Z' }, // >72h demo — purposely older
  'r12': { created: '2026-04-27T06:00:00.000Z', refreshed: '2026-04-27T06:30:00.000Z' }, // >72h demo
  'r13': { created: '2026-04-30T06:00:00.000Z', refreshed: '2026-04-30T06:30:00.000Z' },
  'r14': { created: '2026-04-30T06:00:00.000Z', refreshed: '2026-04-30T06:30:00.000Z' },
  'r15': { created: '2026-04-30T06:00:00.000Z', refreshed: '2026-04-30T06:30:00.000Z' },
  'r16': { created: '2026-04-30T06:00:00.000Z', refreshed: '2026-04-30T06:30:00.000Z' },
  'r17': { created: '2026-04-30T06:00:00.000Z', refreshed: '2026-04-30T06:30:00.000Z' },
  'r18': { created: '2026-04-30T06:00:00.000Z', refreshed: '2026-04-30T06:30:00.000Z' },
  'r19': { created: '2026-04-30T06:00:00.000Z', refreshed: '2026-04-30T06:30:00.000Z' },
  'r20': { created: '2026-04-30T06:00:00.000Z', refreshed: '2026-04-30T06:30:00.000Z' },
  // live cards group 1: 2026-05-06
  'live-1':  { created: '2026-05-06T06:00:00.000Z', refreshed: '2026-05-06T06:30:00.000Z' },
  'live-2':  { created: '2026-05-06T06:00:00.000Z', refreshed: '2026-05-06T06:30:00.000Z' },
  'live-3':  { created: '2026-05-06T06:00:00.000Z', refreshed: '2026-05-06T06:30:00.000Z' },
  'live-4':  { created: '2026-05-06T06:00:00.000Z', refreshed: '2026-05-06T06:30:00.000Z' },
  'live-5':  { created: '2026-05-06T06:00:00.000Z', refreshed: '2026-05-06T06:30:00.000Z' },
  'live-6':  { created: '2026-05-06T06:00:00.000Z', refreshed: '2026-05-06T06:30:00.000Z' },
  'live-7':  { created: '2026-05-06T06:00:00.000Z', refreshed: '2026-05-06T06:30:00.000Z' },
  'live-8':  { created: '2026-05-06T06:00:00.000Z', refreshed: '2026-05-06T06:30:00.000Z' },
  // live cards group 2: 2026-05-07
  'live-9':  { created: '2026-05-07T06:00:00.000Z', refreshed: '2026-05-07T06:30:00.000Z' },
  'live-11': { created: '2026-05-07T06:00:00.000Z', refreshed: '2026-05-07T06:30:00.000Z' },
  // live cards group 3: 2026-05-08
  'live-13': { created: '2026-05-08T06:00:00.000Z', refreshed: '2026-05-08T06:30:00.000Z' },
  'live-14': { created: '2026-05-08T06:00:00.000Z', refreshed: '2026-05-08T06:30:00.000Z' },
  // live cards group 4: 2026-05-11
  'live-15': { created: '2026-05-11T01:00:00.000Z', refreshed: '2026-05-11T01:30:00.000Z' },
  'live-16': { created: '2026-05-11T01:00:00.000Z', refreshed: '2026-05-11T01:30:00.000Z' },
  'live-17': { created: '2026-05-11T01:00:00.000Z', refreshed: '2026-05-11T01:30:00.000Z' },
  'live-18': { created: '2026-05-11T01:00:00.000Z', refreshed: '2026-05-11T01:30:00.000Z' },
  'live-20': { created: '2026-05-11T01:00:00.000Z', refreshed: '2026-05-11T01:30:00.000Z' },
  'live-21': { created: '2026-05-11T01:00:00.000Z', refreshed: '2026-05-11T01:30:00.000Z' },
  'live-22': { created: '2026-05-11T01:00:00.000Z', refreshed: '2026-05-11T01:30:00.000Z' },
  'live-23': { created: '2026-05-11T01:00:00.000Z', refreshed: '2026-05-11T01:30:00.000Z' },
  // live cards group 5: 2026-05-13
  'live-24': { created: '2026-05-13T01:00:00.000Z', refreshed: '2026-05-13T01:30:00.000Z' },
  'live-25': { created: '2026-05-13T01:00:00.000Z', refreshed: '2026-05-13T01:30:00.000Z' },
  'live-26': { created: '2026-05-13T01:00:00.000Z', refreshed: '2026-05-13T01:30:00.000Z' },
  'live-27': { created: '2026-05-13T01:00:00.000Z', refreshed: '2026-05-13T01:30:00.000Z' },
  'live-28': { created: '2026-05-13T01:00:00.000Z', refreshed: '2026-05-13T01:30:00.000Z' },
  'live-29': { created: '2026-05-13T01:00:00.000Z', refreshed: '2026-05-13T01:30:00.000Z' },
  'live-30': { created: '2026-05-13T01:00:00.000Z', refreshed: '2026-05-13T01:30:00.000Z' },
  'live-31': { created: '2026-05-13T01:00:00.000Z', refreshed: '2026-05-13T01:30:00.000Z' },
  'live-32': { created: '2026-05-13T01:00:00.000Z', refreshed: '2026-05-13T01:30:00.000Z' },
  'live-33': { created: '2026-05-13T01:00:00.000Z', refreshed: '2026-05-13T01:30:00.000Z' },
  'live-34': { created: '2026-05-13T01:00:00.000Z', refreshed: '2026-05-13T01:30:00.000Z' },
};

// Process card-by-card: for each card block, replace the dynamic date expressions
// immediately following the id field with hardcoded ISO strings.
let patchCount = 0;

for (const [id, dates] of Object.entries(CARD_DATES)) {
  // Match the card object block (from the id field to the closing brace of the card)
  // We look for the createdAt and lastRefreshed lines within a window after the id.
  // Strategy: find "id:'CARDID'" and then replace the next createdAt / lastRefreshed
  // dynamic expressions within the next 1500 chars.

  const idPattern = new RegExp(
    `(id:'${id.replace('-', '\\-')}'[\\s\\S]{1,1500}?)(createdAt:\\s*)new Date\\([^)]*\\)\\.toISOString\\(\\)`,
    'm'
  );
  const refreshPattern = new RegExp(
    `(id:'${id.replace('-', '\\-')}'[\\s\\S]{1,1500}?)(lastRefreshed:\\s*)new Date\\([^)]*\\)\\.toISOString\\(\\)`,
    'm'
  );

  const beforeCreated = html;
  html = html.replace(idPattern, `$1$2'${dates.created}'`);
  if (html !== beforeCreated) {
    patchCount++;
    console.log(`  ✓ ${id} createdAt → ${dates.created}`);
  }

  const beforeRefreshed = html;
  html = html.replace(refreshPattern, `$1$2'${dates.refreshed}'`);
  if (html !== beforeRefreshed) {
    patchCount++;
    console.log(`  ✓ ${id} lastRefreshed → ${dates.refreshed}`);
  }
}

// Verify: count remaining dynamic date expressions
const remaining = (html.match(/new Date\([^)]*\)\.toISOString\(\)/g) || []).length;
console.log(`\nPatched ${patchCount} expressions.`);
console.log(`Remaining dynamic date expressions: ${remaining}`);

if (remaining > 0) {
  // List them for inspection
  const lines = html.split('\n');
  lines.forEach((line, i) => {
    if (/new Date\([^)]*\)\.toISOString\(\)/.test(line)) {
      console.log(`  Line ${i+1}: ${line.trim().slice(0, 100)}`);
    }
  });
}

writeFileSync(SRC, html, 'utf8');
console.log('\nWrote patched file:', SRC);
