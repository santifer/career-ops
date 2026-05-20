#!/usr/bin/env node
// scripts/migrate-scan-history-firstseen.mjs — one-shot migration for P0-5.
//
// Upgrades col 2 (first_seen) of data/scan-history.tsv from YYYY-MM-DD
// (date-granularity) to YYYY-MM-DDT00:00:00Z (ISO timestamp). Backfills using
// the existing date — best approximation since we have no minute-level
// timestamps for historical rows.
//
// Idempotent: rows already in ISO format are left untouched. Re-running is safe.
//
// Backup: writes data/scan-history.tsv.<timestamp>.bak before any change.
// Verify before commit:
//   wc -l data/scan-history.tsv
//   awk -F'\t' '{print NF}' data/scan-history.tsv | sort -u  (should still be 6 or 7)
//
// Usage:
//   node scripts/migrate-scan-history-firstseen.mjs            # apply
//   node scripts/migrate-scan-history-firstseen.mjs --dry-run  # preview only

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(__filename));
const PATH = join(ROOT, 'data/scan-history.tsv');

if (!existsSync(PATH)) {
  console.error(`Missing ${PATH}`);
  process.exit(1);
}

const text = readFileSync(PATH, 'utf-8');
const lines = text.split('\n');
let upgraded = 0;
let alreadyIso = 0;
let unparseable = 0;

const out = lines.map(line => {
  if (!line) return line;
  if (line.startsWith('url\t')) return line;
  const cols = line.split('\t');
  if (cols.length < 2) return line;
  const v = cols[1].trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) { alreadyIso++; return line; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    cols[1] = v + 'T00:00:00Z';
    upgraded++;
    return cols.join('\t');
  }
  unparseable++;
  return line;
});

console.log(`Scanned ${lines.length} lines: ${upgraded} upgraded, ${alreadyIso} already ISO, ${unparseable} unparseable.`);

if (DRY_RUN) {
  console.log('--- DRY RUN — no changes written ---');
  process.exit(0);
}

if (upgraded === 0) {
  console.log('Nothing to migrate.');
  process.exit(0);
}

const backupPath = `${PATH}.${Date.now()}.bak`;
copyFileSync(PATH, backupPath);
console.log(`Backed up original to ${backupPath}`);

writeFileSync(PATH, out.join('\n'));
console.log(`Wrote ${out.length} lines to ${PATH}`);
