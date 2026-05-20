#!/usr/bin/env node
/**
 * scripts/agents/dupe-apply.mjs
 *
 * Reads data/dupe-audit-YYYY-MM-DD-plan.json (most recent) and applies:
 *
 *   1) Tracker mutations: for each loser row, set status → Discarded and
 *      prepend note "DUPE of #<winner_num>". Row is kept (NOT deleted) so
 *      the report link + history remain auditable. The dashboard's
 *      apply-now filter drops Discarded rows automatically.
 *
 *   2) Pipeline canonicalization: rewrite data/pipeline.md so each
 *      canonical URL appears once (canonical = first occurrence). All
 *      surrounding markdown / list context preserved on the kept line.
 *
 * apply-now-queue.json: already clean (audit confirmed 0 dupes). No-op here.
 *
 * Usage:
 *   node scripts/agents/dupe-apply.mjs --dry-run    (preview)
 *   node scripts/agents/dupe-apply.mjs              (apply)
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DRY = process.argv.includes('--dry-run');

// Pick most recent dupe-audit-*-plan.json
function loadPlan() {
  const files = readdirSync(join(ROOT, 'data'))
    .filter(f => /^dupe-audit-\d{4}-\d{2}-\d{2}-plan\.json$/.test(f))
    .sort();
  if (!files.length) throw new Error('No dupe-audit-*-plan.json found. Run scripts/agents/dupe-audit.mjs first.');
  const p = join(ROOT, 'data', files.at(-1));
  console.log(`[dupe-apply] Plan: ${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

// ── Tracker mutation ────────────────────────────────────────────────────
function applyTracker(plan) {
  const path = join(ROOT, 'data/applications.md');
  const txt = readFileSync(path, 'utf8');

  // Build a num → { winner_num, role } map for losers
  const loserMap = new Map();
  for (const cl of plan.strict_clusters) {
    for (const loserNum of cl.loser_nums) {
      loserMap.set(loserNum, { winner_num: cl.winner_num, role: cl.role });
    }
  }

  if (loserMap.size === 0) {
    console.log('[dupe-apply] No tracker mutations needed.');
    return { changed: 0, txt };
  }

  const lines = txt.split('\n');
  let changed = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith('|')) continue;
    if (l.includes('---')) continue;
    const cells = l.split('|');
    if (cells.length < 9) continue;
    const numCell = cells[1].trim();
    if (!loserMap.has(numCell)) continue;
    const { winner_num } = loserMap.get(numCell);

    // cells layout: ['', ' num ', ' date ', ' company ', ' role ', ' score ', ' status ', ' pdf ', ' report ', ' notes... ', '']
    const oldStatus = cells[6].trim();
    cells[6] = ' Discarded ';
    const oldNote = (cells[9] || '').trim();
    const noteParts = [`DUPE of #${winner_num}`];
    if (oldNote && !/DUPE of #/.test(oldNote)) noteParts.push(oldNote);
    cells[9] = ' ' + noteParts.join(' · ') + ' ';

    lines[i] = cells.join('|');
    changed++;
    console.log(`[dupe-apply] tracker #${numCell}: status ${oldStatus} → Discarded; note: DUPE of #${winner_num}`);
  }

  const newTxt = lines.join('\n');
  if (!DRY) writeFileSync(path, newTxt);
  return { changed, txt: newTxt };
}

// ── Pipeline canonicalization ───────────────────────────────────────────
function canonUrl(u) {
  try {
    const url = new URL(u);
    const sp = url.searchParams;
    for (const k of [...sp.keys()]) {
      if (/^utm_/.test(k) || /^gh_/.test(k) || /^lever_/.test(k)
          || k === 'ref' || k === 'source' || k === 'src'
          || k === 'mkt_tok' || k === '_hsenc' || k === '_hsmi'
          || k === 'trk' || k === 'trkCampaign' || k === 'refId') {
        sp.delete(k);
      }
    }
    url.hash = '';
    let s = url.toString();
    s = s.replace(/\?$/, '');
    return s.replace(/\/$/, '');
  } catch { return u; }
}

function applyPipeline() {
  const path = join(ROOT, 'data/pipeline.md');
  const txt = readFileSync(path, 'utf8');
  const lines = txt.split('\n');

  const seen = new Set();
  const kept = [];
  let removed = 0;
  for (const line of lines) {
    const urlMatch = line.match(/https?:\/\/[^\s)\]"']+/);
    if (!urlMatch) { kept.push(line); continue; }
    const canon = canonUrl(urlMatch[0]);
    if (seen.has(canon)) { removed++; continue; }
    seen.add(canon);
    kept.push(line);
  }

  const newTxt = kept.join('\n');
  if (!DRY) writeFileSync(path, newTxt);
  return { removed, before: lines.length, after: kept.length };
}

// ── Main ────────────────────────────────────────────────────────────────
const plan = loadPlan();
console.log(`[dupe-apply] DRY_RUN=${DRY}`);
console.log('');

console.log('=== Tracker ===');
const tres = applyTracker(plan);
console.log(`[dupe-apply] tracker rows mutated: ${tres.changed}`);
console.log('');

console.log('=== Pipeline ===');
const pres = applyPipeline();
console.log(`[dupe-apply] pipeline lines: ${pres.before} → ${pres.after} (-${pres.removed})`);
console.log('');

if (DRY) console.log('Dry run — no files written. Re-run without --dry-run to apply.');
else console.log('Applied. Run `node scripts/agents/dupe-audit.mjs` again to confirm no remaining clusters.');
