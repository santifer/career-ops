#!/usr/bin/env node
/**
 * scripts/rebuild-apply-now-queue.mjs — keep apply-now-queue.json in sync
 * with applications.md without overwriting Mitchell's curated factor data.
 *
 * Why: data/apply-now-queue.json is the input to refresh-master's tier
 * classifier (lib/refresh-priority.mjs::classifyAllRows). New rows that
 * land in applications.md and pass the apply-now filter (score ≥4.0 AND
 * status in Evaluated|Responded) need to enter the queue so refresh-master
 * actually enriches them. Without this, the Health column will drift back
 * to "—" the next time Mitchell adds a 4+ row that isn't in the curated
 * queue.
 *
 * What it preserves:
 *   - All existing ranked[] entries (composite, factors, equity_stage,
 *     tactical_lead, notes_summary). Mitchell-curated wisdom, never
 *     overwritten.
 *   - All metadata fields (methodology, delta_from_prior_run, etc.).
 *
 * What it updates:
 *   - status field on rows whose status changed in applications.md
 *     (e.g. Evaluated → Discarded). Adds a `_dropped: true` marker if
 *     the row is no longer in the apply-now filter, so the classifier
 *     can demote it to Tier D without breaking ranks for other rows.
 *   - generated_at + reference_date.
 *
 * What it adds:
 *   - One new ranked[] entry per applications.md apply-now row not in
 *     the queue. New entries get rank=N+1..N+M appended (no resort of
 *     existing rows), default factors{tier:'C'}, and tactical_lead/
 *     notes_summary derived from applications.md.
 *
 * Usage:
 *   node scripts/rebuild-apply-now-queue.mjs               # write + log diff
 *   node scripts/rebuild-apply-now-queue.mjs --dry-run     # log only, no write
 *
 * Exit codes:
 *   0 — success (writes or dry-runs cleanly)
 *   2 — runtime error
 *
 * Designed to be invoked by refresh-master.mjs BEFORE classifyAllRows()
 * runs, OR on a daily launchd schedule paired with the dashboard build.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const QUEUE_PATH = join(ROOT, 'data', 'apply-now-queue.json');
const APPS_PATH = join(ROOT, 'data', 'applications.md');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (!existsSync(QUEUE_PATH)) {
    console.error(`ERROR: ${QUEUE_PATH} not found`);
    process.exit(2);
  }
  if (!existsSync(APPS_PATH)) {
    console.error(`ERROR: ${APPS_PATH} not found`);
    process.exit(2);
  }

  const queue = JSON.parse(readFileSync(QUEUE_PATH, 'utf-8'));
  const ranked = Array.isArray(queue.ranked) ? queue.ranked : [];
  const { parseApplicationsFile } = await import('../lib/parse-applications.mjs');
  const apps = parseApplicationsFile(APPS_PATH);
  const applyNow = apps.filter(r => r.score >= 4.0 && /^(evaluated|responded)$/i.test(r.status));

  // Index existing queue rows by num (string)
  const queueByNum = new Map(ranked.map(r => [String(r.num), r]));
  const appsByNum = new Map(apps.map(a => [String(a.num), a]));

  const today = new Date().toISOString().slice(0, 10);
  const stats = {
    queueRowsBefore: ranked.length,
    addedFromApps: 0,
    statusUpdates: 0,
    droppedFromApplyNow: 0,
    inSyncRows: 0,
  };
  const log = [];

  // Pass 1: update status on existing queue rows from applications.md
  for (const qrow of ranked) {
    const app = appsByNum.get(String(qrow.num));
    if (!app) {
      // Row exists in queue but not in applications.md — leave alone, but flag.
      log.push(`  ⚠ queue rank ${qrow.rank} (#${qrow.num} ${qrow.company} — ${qrow.role.slice(0, 40)}) not found in applications.md`);
      continue;
    }
    const prevStatus = qrow.status;
    if (prevStatus !== app.status) {
      qrow.status = app.status;
      stats.statusUpdates++;
      log.push(`  ↻ rank ${qrow.rank} (#${qrow.num} ${qrow.company}): ${prevStatus} → ${app.status}`);
    }
    // Mark as dropped if no longer in apply-now filter
    const stillEligible = app.score >= 4.0 && /^(evaluated|responded)$/i.test(app.status);
    if (!stillEligible && !qrow._dropped) {
      qrow._dropped = true;
      qrow._dropped_at = today;
      qrow._dropped_reason = `status=${app.status}, score=${app.score}`;
      stats.droppedFromApplyNow++;
      log.push(`  ↓ rank ${qrow.rank} (#${qrow.num} ${qrow.company}): dropped from apply-now filter (${qrow._dropped_reason})`);
    }
    if (stillEligible && qrow._dropped) {
      // Row recovered (e.g. status flipped back from Discarded to Evaluated)
      delete qrow._dropped;
      delete qrow._dropped_at;
      delete qrow._dropped_reason;
      log.push(`  ↑ rank ${qrow.rank} (#${qrow.num} ${qrow.company}): recovered into apply-now filter`);
    }
    if (prevStatus === app.status && stillEligible) stats.inSyncRows++;
  }

  // Pass 2: add applications.md apply-now rows not in queue
  const maxExistingRank = ranked.reduce((m, r) => Math.max(m, Number(r.rank) || 0), 0);
  let nextRank = maxExistingRank + 1;
  for (const arow of applyNow) {
    if (queueByNum.has(String(arow.num))) continue;
    const synthComposite = Math.round(arow.score * 17); // 4.0 → 68, 4.7 → 80
    const tierBucket = arow.score >= 4.5 ? 'A2' : arow.score >= 4.2 ? 'B' : 'C';
    const newRow = {
      rank: nextRank++,
      composite: synthComposite,
      num: String(arow.num),
      company: arow.company,
      role: arow.role,
      eval_score: arow.score,
      eval_date: arow.date,
      status: arow.status,
      report: arow.reportPath ? `[${String(arow.num)}](${arow.reportPath})` : '',
      factors: {
        base_fit: 15,
        equity_upside: 0,
        equity_stage: 'unknown — set after manual review',
        freshness: 20,
        eval_age_days: Math.max(0, Math.round((Date.now() - Date.parse(arow.date)) / 86400000)),
        tier_match: 10,
        tier: tierBucket,
      },
      too_late_flag: false,
      tactical_lead: 'AUTO-ADDED by rebuild-apply-now-queue.mjs — manual curation pending (factors{} are defaults).',
      notes_summary: (arow.notes || '').slice(0, 280),
      _auto_added: true,
      _auto_added_at: today,
    };
    ranked.push(newRow);
    stats.addedFromApps++;
    log.push(`  + rank ${newRow.rank} (#${arow.num} ${arow.company} — ${arow.role.slice(0, 40)}): score=${arow.score} status=${arow.status}`);
  }

  // Update queue metadata
  queue.ranked = ranked;
  queue.total_rows = ranked.length;
  queue.generated_at = new Date().toISOString();
  queue.reference_date = today;
  queue.last_rebuilt_by = 'scripts/rebuild-apply-now-queue.mjs';
  queue.last_rebuilt_stats = stats;

  console.log(`[rebuild-apply-now-queue] ${DRY_RUN ? 'DRY-RUN — no write' : 'writing ' + QUEUE_PATH}`);
  console.log(`  apply-now-queue.json: ${stats.queueRowsBefore} → ${ranked.length} rows`);
  console.log(`  added from apps:      ${stats.addedFromApps}`);
  console.log(`  status updates:       ${stats.statusUpdates}`);
  console.log(`  dropped from filter:  ${stats.droppedFromApplyNow}`);
  console.log(`  in-sync rows:         ${stats.inSyncRows}`);
  if (log.length) {
    console.log('\nChanges:');
    for (const l of log) console.log(l);
  }

  if (!DRY_RUN) {
    writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
    console.log(`\n✓ wrote ${QUEUE_PATH}`);
  } else {
    console.log('\n(dry-run — no file written)');
  }
}

main().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(2);
});
