#!/usr/bin/env node
/**
 * scripts/dedup-triage-advance.mjs
 *
 * One-time cleanup for the duplicate-bloat bug Mitchell hit 2026-05-19:
 * batch/triage-advance.tsv had URLs appearing up to 5× because triage.mjs
 * was appending without checking if the URL was already queued.
 *
 * This script:
 *   1. Archives the current file to batch/triage-advance-pre-dedup-{date}.tsv
 *   2. Deduplicates by URL, keeping the HIGHEST-scoring row per unique URL
 *   3. Rewrites batch/triage-advance.tsv
 *   4. Prints before/after counts + the savings
 *
 * Reversible: the archive file is preserved on disk. To revert:
 *   mv batch/triage-advance-pre-dedup-{date}.tsv batch/triage-advance.tsv
 *
 * --dry-run prints what would change without writing anything.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ADVANCE_FILE = join(ROOT, 'batch/triage-advance.tsv');

const DRY_RUN = process.argv.includes('--dry-run');

if (!existsSync(ADVANCE_FILE)) {
  console.error('No batch/triage-advance.tsv — nothing to dedup.');
  process.exit(0);
}

const raw = readFileSync(ADVANCE_FILE, 'utf8');
const lines = raw.split('\n');

const header = lines[0] && lines[0].startsWith('url\t') ? lines[0] : 'url\ttier\tscore\tarchetype\treason';
const dataLines = lines.slice(lines[0] && lines[0].startsWith('url\t') ? 1 : 0).filter(l => l.trim());

const byUrl = new Map();
const duplicateUrls = new Map(); // url → count
for (const line of dataLines) {
  const cols = line.split('\t');
  const url = (cols[0] || '').trim();
  const score = parseFloat(cols[2]) || 0;
  if (!url) continue;
  duplicateUrls.set(url, (duplicateUrls.get(url) || 0) + 1);
  const prior = byUrl.get(url);
  if (!prior || score > prior.score) {
    byUrl.set(url, { line, score });
  }
}

const dedupedLines = [...byUrl.values()].map(v => v.line);
const removed = dataLines.length - dedupedLines.length;

console.log('═══ triage-advance.tsv dedup pass ═══');
console.log('');
console.log(`  Before:  ${dataLines.length} data rows (${duplicateUrls.size} unique URLs)`);
console.log(`  After:   ${dedupedLines.length} data rows (${dedupedLines.length} unique URLs)`);
console.log(`  Removed: ${removed} duplicate rows`);
console.log('');

if (removed > 0) {
  const dupes = [...duplicateUrls.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
  console.log(`  Top duplicates:`);
  for (const [url, n] of dupes.slice(0, 10)) {
    console.log(`    ${n}× ${url.slice(0, 80)}`);
  }
  console.log('');
}

if (DRY_RUN) {
  console.log('(dry-run) no changes written. Run without --dry-run to apply.');
  process.exit(0);
}

if (removed === 0) {
  console.log('No duplicates found — nothing to write.');
  process.exit(0);
}

// Archive pre-dedup state (date-stamped so multiple runs don't clobber each other).
const today = new Date().toISOString().slice(0, 10);
let archivePath = join(ROOT, `batch/triage-advance-pre-dedup-${today}.tsv`);
let archiveAttempt = 1;
while (existsSync(archivePath)) {
  archivePath = join(ROOT, `batch/triage-advance-pre-dedup-${today}-${++archiveAttempt}.tsv`);
}
copyFileSync(ADVANCE_FILE, archivePath);
console.log(`  ✓ Archived pre-dedup state → ${archivePath.replace(ROOT + '/', '')}`);

// Write deduped file.
const out = [header, ...dedupedLines].join('\n') + '\n';
writeFileSync(ADVANCE_FILE, out);
console.log(`  ✓ Wrote deduped triage-advance.tsv (${dedupedLines.length} rows)`);
console.log('');
console.log(`  Reversible: mv ${archivePath.replace(ROOT + '/', '')} batch/triage-advance.tsv`);
