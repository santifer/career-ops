#!/usr/bin/env node
/**
 * export-tracker.mjs — Export applications.md to CSV and/or JSON.
 *
 * Reads the application tracker (data/applications.md or applications.md) and
 * writes machine-readable copies next to it, for spreadsheets / external
 * analytics. The source markdown is never modified.
 *
 * Run:
 *   node export-tracker.mjs            # writes both .csv and .json
 *   node export-tracker.mjs --csv      # CSV only
 *   node export-tracker.mjs --json     # JSON only
 *   node export-tracker.mjs --dry-run  # print a summary, write nothing
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseAppLine } from './lib/tracker-core.mjs';
import { toCsv, toJson } from './lib/export-core.mjs';

const CAREER_OPS = new URL('.', import.meta.url).pathname;
// Support both layouts: data/applications.md (boilerplate) and applications.md (original)
const APPS_FILE = existsSync(join(CAREER_OPS, 'data/applications.md'))
  ? join(CAREER_OPS, 'data/applications.md')
  : join(CAREER_OPS, 'applications.md');

const DRY_RUN = process.argv.includes('--dry-run');
const wantCsv = process.argv.includes('--csv') || (!process.argv.includes('--json'));
const wantJson = process.argv.includes('--json') || (!process.argv.includes('--csv'));

if (!existsSync(APPS_FILE)) {
  console.log('No applications.md found. Nothing to export.');
  process.exit(0);
}

const content = readFileSync(APPS_FILE, 'utf-8');
const rows = [];
for (const line of content.split('\n')) {
  if (!line.startsWith('|')) continue;
  const app = parseAppLine(line);
  if (app && app.num > 0) rows.push(app);
}

console.log(`📊 ${rows.length} entries parsed from ${APPS_FILE.replace(CAREER_OPS, '')}`);

if (rows.length === 0) {
  console.log('Nothing to export.');
  process.exit(0);
}

const base = APPS_FILE.replace(/\.md$/, '');
const targets = [];
if (wantCsv) targets.push([base + '.csv', toCsv(rows)]);
if (wantJson) targets.push([base + '.json', toJson(rows)]);

if (DRY_RUN) {
  for (const [path] of targets) console.log(`(dry-run) would write ${path.replace(CAREER_OPS, '')}`);
  process.exit(0);
}

for (const [path, data] of targets) {
  writeFileSync(path, data);
  console.log(`✅ Wrote ${path.replace(CAREER_OPS, '')}`);
}
