#!/usr/bin/env node
// One-shot revert: undo the 27 false-positive Discards from the 2026-05-19 liveness-sweep
// (HTTP 429 mis-classified as expired). Restores status Discarded → Evaluated and strips
// the "⚠️ LINK EXPIRED ... (HTTP 429). Original notes: " prefix from the notes column.
// Skips rows #2183 + #2201 (real Ashby API expirations — those stay Discarded).

import { readFileSync, writeFileSync } from 'fs';

const PATH = 'data/applications.md';
const ROW_NUMS = new Set([
  2037, 2046, 2060, 2061, 2065, 2066, 2067, 2069, 2071, 2072, 2074, 2093,
  2188, 2190, 2191, 2193, 2195, 2196, 2198, 2199, 2210, 2211, 2212, 2213, 2215,
  2219, 2223,
]);
const PREFIX_RE = /^⚠️ LINK EXPIRED on \d{4}-\d{2}-\d{2} \(HTTP 429\)\. Original notes: /;

const text = readFileSync(PATH, 'utf-8');
const lines = text.split('\n');

let reverted = 0;
const skipped = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const m = line.match(/^\| (\d+) \|/);
  if (!m) continue;
  const num = parseInt(m[1], 10);
  if (!ROW_NUMS.has(num)) continue;

  const cols = line.split('|');
  if (cols.length < 11) { skipped.push(`#${num}: unexpected column count`); continue; }

  // applications.md columns: '', ' num ', ' date ', ' company ', ' role ', ' score ',
  // ' status ', ' pdf ', ' report ', ' notes ', ''
  const status = cols[6].trim();
  const notes = cols[9].trim();

  if (status !== 'Discarded') { skipped.push(`#${num}: status is ${status}, not Discarded`); continue; }
  if (!PREFIX_RE.test(notes)) { skipped.push(`#${num}: notes don't match HTTP 429 pattern`); continue; }

  cols[6] = ' Evaluated ';
  cols[9] = ' ' + notes.replace(PREFIX_RE, '') + ' ';
  lines[i] = cols.join('|');
  reverted++;
}

writeFileSync(PATH, lines.join('\n'));

console.log(`Reverted ${reverted} rows.`);
if (skipped.length) {
  console.log('Skipped:');
  for (const s of skipped) console.log('  - ' + s);
}
