#!/usr/bin/env node
/**
 * scripts/agents/pipeline-health-check.mjs
 *
 * Periodically asserts that:
 *   1. Sidebar badge numbers MATCH the underlying files (pipeline.md +
 *      triage-advance.tsv). Drift = bug.
 *   2. Triage-advance.tsv doesn't contain "stuck" URLs (in the queue >2h
 *      without being processed). Stuck URLs are usually dead postings that
 *      should be in the expired archive.
 *   3. The dashboard-server is reachable (200 on /api/stats).
 *   4. No more than one Process All / Run Batch orchestrator is alive at once.
 *
 * Outputs data/pipeline-health.json (machine-readable) — read by the
 * dashboard's "System healthy" chip + the /api/pipeline/health-status endpoint.
 *
 * Exit 0 if healthy. Exit 1 if drift detected (launchd doesn't care; the JSON
 * IS the signal). The script never raises an alarm itself — it just records
 * truth. The dashboard surfaces what it finds.
 *
 * Designed to run every 5 min via launchd
 * (com.mitchell.career-ops.pipeline-health.plist).
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installRunRecord } from '../../lib/job-runs-ledger.mjs';

const __jobRun = installRunRecord('pipeline-health');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const HEALTH_FILE = join(ROOT, 'data', 'pipeline-health.json');

const STUCK_THRESHOLD_HOURS = parseFloat(process.env.PIPELINE_HEALTH_STUCK_THRESHOLD_HOURS || '2');
const DASHBOARD_URL = process.env.DASHBOARD_HEALTH_URL || 'http://localhost:3097';

function countPipelinePending() {
  const fp = join(ROOT, 'data/pipeline.md');
  if (!existsSync(fp)) return 0;
  return readFileSync(fp, 'utf-8').split('\n').filter(l => l.startsWith('- [ ]')).length;
}

function countTriageAdvanceRows() {
  const fp = join(ROOT, 'batch/triage-advance.tsv');
  if (!existsSync(fp)) return 0;
  return readFileSync(fp, 'utf-8').split('\n').filter(l => l.trim() && !l.startsWith('url\t')).length;
}

function getTriageAdvanceMtime() {
  const fp = join(ROOT, 'batch/triage-advance.tsv');
  if (!existsSync(fp)) return null;
  try { return statSync(fp).mtime.toISOString(); } catch { return null; }
}

async function checkApiBadge() {
  // Use Node's native fetch (v18+); fall back to undefined if HTTP fails.
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${DASHBOARD_URL}/api/pipeline/preview`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return {
      ok: true,
      pending_pipeline: data.pending_pipeline,
      queued_for_batch: data.queued_for_batch,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function findOrchestratorPids() {
  try {
    const out = execSync('ps -ef | grep -E "process-all-pipeline|batch-runner-batches" | grep -v grep', {
      encoding: 'utf-8',
    });
    const pids = out.trim().split('\n').filter(Boolean).map(l => parseInt(l.split(/\s+/)[1], 10)).filter(Number.isFinite);
    return pids;
  } catch { return []; }
}

async function main() {
  const checks = {};

  // 1. File-level counts
  const filePending = countPipelinePending();
  const fileQueued = countTriageAdvanceRows();
  checks.file_counts = {
    pending_pipeline: filePending,
    queued_for_batch: fileQueued,
    total: filePending + fileQueued,
  };

  // 2. API-level counts
  const api = await checkApiBadge();
  checks.api = api;
  if (api.ok) {
    const driftPending = api.pending_pipeline !== filePending;
    const driftQueued  = api.queued_for_batch !== fileQueued;
    checks.drift = {
      pending_pipeline: driftPending ? { file: filePending, api: api.pending_pipeline } : null,
      queued_for_batch: driftQueued  ? { file: fileQueued,  api: api.queued_for_batch  } : null,
      drift_detected: driftPending || driftQueued,
    };
  } else {
    checks.drift = { drift_detected: null, api_unreachable: true };
  }

  // 3. Stuck-URL detection — entries in triage-advance.tsv that have been
  //    there >STUCK_THRESHOLD_HOURS but never get cleared (likely expired).
  //    We use file mtime as a coarse proxy: if the file hasn't been modified
  //    in >2h AND it has rows, those rows are stuck.
  const mtime = getTriageAdvanceMtime();
  let stuckHours = null;
  if (mtime) {
    stuckHours = (Date.now() - new Date(mtime).getTime()) / (1000 * 60 * 60);
  }
  checks.triage_queue = {
    mtime,
    age_hours: stuckHours,
    stuck: (fileQueued > 0 && stuckHours != null && stuckHours > STUCK_THRESHOLD_HOURS),
    threshold_hours: STUCK_THRESHOLD_HOURS,
  };

  // 4. Orchestrator process check — flag if more than 1 alive (race condition)
  const pids = findOrchestratorPids();
  checks.orchestrator_pids = pids;
  checks.orchestrator_warning = pids.length > 1 ? `${pids.length} orchestrator processes alive (expected 0 or 1)` : null;

  // 5. Roll up to a single "healthy" flag
  const healthy =
    !checks.drift?.drift_detected &&
    !checks.triage_queue.stuck &&
    !checks.orchestrator_warning &&
    api.ok;

  const result = {
    checked_at: new Date().toISOString(),
    healthy,
    checks,
    summary: healthy
      ? 'all checks pass'
      : [
          checks.drift?.drift_detected ? 'badge↔file drift' : null,
          checks.triage_queue.stuck    ? `${fileQueued} URL(s) stuck > ${STUCK_THRESHOLD_HOURS}h` : null,
          checks.orchestrator_warning,
          !api.ok ? 'dashboard-server unreachable' : null,
        ].filter(Boolean).join(' · '),
  };

  writeFileSync(HEALTH_FILE, JSON.stringify(result, null, 2));
  // Compact stderr log so launchd's StandardOutPath stays small
  console.error(`[pipeline-health] ${result.healthy ? '✓' : '✗'} ${result.summary}`);

  process.exit(result.healthy ? 0 : 1);
}

main().catch(err => {
  console.error('[pipeline-health] FATAL:', err);
  process.exit(2);
});
