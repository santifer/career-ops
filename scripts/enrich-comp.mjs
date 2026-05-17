#!/usr/bin/env node
// scripts/enrich-comp.mjs — backfill comp data for rows missing/stale comp.
//
// Usage:
//   node scripts/enrich-comp.mjs                   # backfill Apply-Now + recent Evaluated only
//   node scripts/enrich-comp.mjs --all             # backfill every Evaluated row
//   node scripts/enrich-comp.mjs --row=2168        # backfill a single row by num
//   node scripts/enrich-comp.mjs --dry-run         # report what would run, no API calls
//   node scripts/enrich-comp.mjs --force           # bypass 30-day cache, re-research
//   node scripts/enrich-comp.mjs --max=10          # stop after N rows (cost cap)
//
// Reads applications.md, identifies rows where Comp parses as empty/undisclosed,
// calls researchComp() for each, writes cache, prints a summary.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env'), override: true });

const { researchComp, lookupCompCache } = await import(join(ROOT, 'lib/comp-researcher.mjs'));

const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const getOpt = (prefix) => {
  const a = args.find(x => x.startsWith(prefix));
  return a ? a.slice(prefix.length) : null;
};
const DRY_RUN = hasFlag('--dry-run');
const FORCE   = hasFlag('--force');
const ALL     = hasFlag('--all');
const ROW     = getOpt('--row=');
const MAX     = parseInt(getOpt('--max=') || '999', 10);

console.log('═══ comp enrichment runner ═══');
console.log(`  Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'} · ${ALL ? 'all rows' : 'Apply-Now + recent Evaluated'} · max=${MAX}`);

// Parse applications.md tracker
const trackerPath = join(ROOT, 'data', 'applications.md');
if (!existsSync(trackerPath)) {
  console.error('FATAL: data/applications.md not found');
  process.exit(1);
}
const trackerLines = readFileSync(trackerPath, 'utf-8').split('\n');
const rows = [];
for (const line of trackerLines) {
  if (!line.startsWith('|')) continue;
  if (/^\|\s*#\s*\|/.test(line)) continue;       // header
  if (/^\|\s*-{3,}/.test(line)) continue;        // separator
  const cells = line.split('|').slice(1, -1).map(c => c.trim());
  if (cells.length < 8) continue;
  const [num, date, company, role, score, status, pdf, report, notes] = cells;
  if (!num || !/^\d+$/.test(num)) continue;
  rows.push({ num, date, company, role, score, status, report, notes: notes || '' });
}
console.log(`  Loaded ${rows.length} rows from tracker`);

// Pick the report file for each row + read its current comp parse result.
const REPORTS_DIR = join(ROOT, 'reports');
const reportFiles = existsSync(REPORTS_DIR) ? readdirSync(REPORTS_DIR).filter(f => f.endsWith('.md')) : [];
const reportByNum = new Map();
for (const f of reportFiles) {
  const m = f.match(/^(\d+)-/);
  if (m) reportByNum.set(m[1], f);
}

function _parseScoreFloat(s) {
  const m = String(s || '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function _hasRealComp(report) {
  if (!report) return false;
  const fp = join(REPORTS_DIR, report);
  if (!existsSync(fp)) return false;
  const text = readFileSync(fp, 'utf-8');
  // Quick scan: any $XXX-style number anywhere → has comp.
  // BUT discount "Comp not disclosed" / "Undisclosed" lines.
  if (/comp\s*(?:signal\s*)?[:\|]\s*(?:not\s+disclosed|undisclosed|none|n\/?a)/i.test(text)) return false;
  return /\$\s*\d{2,4}\s*K/i.test(text) || /\$\s*\d{2,3}[,.]?\d{3}/.test(text);
}

// Filter rows that need comp research
const candidates = [];
for (const r of rows) {
  if (ROW && r.num !== ROW) continue;
  if (!ROW && !ALL) {
    // Default: Apply-Now (score ≥ 4.0) + Evaluated only
    const score = _parseScoreFloat(r.score);
    if (score < 4.0) continue;
    if (!/^(Evaluated|Responded|Interview)$/i.test(r.status.replace(/\*/g, '').trim())) continue;
  }
  const report = reportByNum.get(r.num);
  if (!_hasRealComp(report)) {
    candidates.push({ ...r, report });
  }
}
console.log(`  Candidates needing comp research: ${candidates.length}`);
if (!candidates.length) {
  console.log('  Nothing to do — all selected rows have parseable comp.');
  process.exit(0);
}

// Cap at MAX
const work = candidates.slice(0, MAX);
console.log(`  Working set: ${work.length} (capped by --max=${MAX})\n`);

// Process
let succeeded = 0;
let highConf = 0;
let mediumConf = 0;
let lowConf = 0;
let noResult = 0;
const startedAt = Date.now();
const summary = [];

for (let i = 0; i < work.length; i++) {
  const r = work[i];
  const tag = `[${i + 1}/${work.length}] #${r.num} ${r.company} — ${r.role.slice(0, 50)}`;
  if (DRY_RUN) {
    console.log(`${tag} (dry-run)`);
    summary.push({ ...r, source: 'dry-run' });
    continue;
  }

  // Already cached? Skip unless --force.
  if (!FORCE) {
    const cached = lookupCompCache(r.company, r.role);
    if (cached && cached.band) {
      console.log(`${tag} → ${cached.band} (${cached.source}, cached ${cached._cacheAgeDays}d)`);
      succeeded++;
      if (cached.confidence === 'high') highConf++;
      else if (cached.confidence === 'medium') mediumConf++;
      else lowConf++;
      summary.push({ ...r, ...cached, fromCache: true });
      continue;
    }
  }

  // Extract JD URL from the report header if present.
  let jdUrl = null;
  if (r.report) {
    const fp = join(REPORTS_DIR, r.report);
    if (existsSync(fp)) {
      const text = readFileSync(fp, 'utf-8').slice(0, 3000);
      const m = text.match(/\*\*URL:\*\*\s*(\S+)/);
      if (m) jdUrl = m[1];
    }
  }

  try {
    const result = await researchComp({
      company: r.company,
      role: r.role,
      jdUrl,
      force: FORCE,
    });
    if (result.band) {
      console.log(`${tag} → ${result.band} (${result.source}, ${result.confidence})`);
      succeeded++;
      if (result.confidence === 'high') highConf++;
      else if (result.confidence === 'medium') mediumConf++;
      else lowConf++;
    } else {
      console.log(`${tag} → no result (attempted: ${result.sourcesAttempted?.join(', ')})`);
      noResult++;
    }
    summary.push({ ...r, ...result });
  } catch (e) {
    console.log(`${tag} → ERROR: ${e.message}`);
    noResult++;
    summary.push({ ...r, error: String(e.message) });
  }
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log('\n═══ summary ═══');
console.log(`  Processed: ${work.length} rows in ${elapsed}s`);
console.log(`  ✓ Succeeded:        ${succeeded}`);
console.log(`    high confidence:  ${highConf}`);
console.log(`    medium confidence: ${mediumConf}`);
console.log(`    low confidence:   ${lowConf}`);
console.log(`  ✗ No result:        ${noResult}`);
console.log(`  Cache: data/comp-cache/{company-slug}/{role-slug}.json (30-day TTL)`);
