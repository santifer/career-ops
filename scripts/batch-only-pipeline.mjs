#!/usr/bin/env node
/**
 * scripts/batch-only-pipeline.mjs — state-tracked Run Batch orchestrator.
 *
 * Chains the batch-only evaluation flow so the dashboard "Run Batch" button
 * has the same state tracking + completion notification as Process All:
 *
 *   1. batch     → submits queued items to Anthropic Batches API, polls, reconciles
 *   2. merge     → merges batch/tracker-additions/ into data/applications.md
 *   3. rebuild   → regenerates dashboard/index.html
 *   4. email     → (optional) sends a heartbeat email summarizing what landed
 *
 * Writes state to data/pipeline-process-state.json (same file as process-all)
 * so the dashboard SSE can poll /api/pipeline/job-status and show the toast.
 *
 * Usage:
 *   node scripts/batch-only-pipeline.mjs                 # no email
 *   node scripts/batch-only-pipeline.mjs --send-email    # email on completion
 *   node scripts/batch-only-pipeline.mjs --dry-run       # report what would run, no API calls
 *   node scripts/batch-only-pipeline.mjs --job-id=xxx    # use specific job ID (server pre-allocates)
 *   node scripts/batch-only-pipeline.mjs --cap-override  # skip cap check (server already enforced)
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

try {
  const { config } = await import('dotenv');
  config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env'), override: true });
} catch {}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STATE_FILE = join(ROOT, 'data/pipeline-process-state.json');

const ARGS = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith('--')).map(a => {
    const idx = a.indexOf('=');
    return idx >= 0 ? [a.slice(2, idx), a.slice(idx + 1)] : [a.slice(2), true];
  })
);
const SEND_EMAIL  = !!ARGS['send-email'];
const DRY_RUN     = !!ARGS['dry-run'];
const JOB_ID      = ARGS['job-id'] || ('batch-' + Date.now().toString(36) + '-' + randomBytes(3).toString('hex'));
const LOG_PATH    = `/tmp/batch-only-${JOB_ID}.log`;

// ── State helpers ─────────────────────────────────────────────────────────
function loadState() {
  if (!existsSync(STATE_FILE)) return { jobs: {} };
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf-8')); }
  catch { return { jobs: {} }; }
}
function saveState(s) {
  if (!existsSync(dirname(STATE_FILE))) mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}
function updateJob(patch) {
  const s = loadState();
  s.jobs[JOB_ID] = { ...(s.jobs[JOB_ID] || {}), jobId: JOB_ID, ...patch, updated_at: new Date().toISOString() };
  saveState(s);
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_PATH, line + '\n'); } catch {}
}

function runScript(name, args = []) {
  return new Promise((resolve) => {
    log(`▶ ${name} ${args.join(' ')}`);
    const proc = spawn('node', [name, ...args], {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let outBytes = 0;
    proc.stdout.on('data', (chunk) => {
      outBytes += chunk.length;
      try { appendFileSync(LOG_PATH, chunk); } catch {}
    });
    proc.stderr.on('data', (chunk) => {
      try { appendFileSync(LOG_PATH, '[stderr] ' + chunk); } catch {}
    });
    proc.on('close', (code) => {
      log(`◀ ${name} exited ${code} (${outBytes} bytes stdout)`);
      resolve(code);
    });
  });
}

// ── Phase wrappers ────────────────────────────────────────────────────────
async function phaseBatch() {
  updateJob({ phase: 'batch', phase_started_at: new Date().toISOString() });
  log('━━━ Phase 1/4: BATCH EVAL ━━━');
  if (DRY_RUN) { log('(dry-run) skipping batch'); return { ok: true }; }
  const code = await runScript('batch-runner-batches.mjs', ['run']);
  if (code !== 0) {
    log(`✗ batch run failed (exit ${code})`);
    return { ok: false };
  }
  log('✓ batch eval complete');
  return { ok: true };
}

async function phaseMergeTracker() {
  updateJob({ phase: 'merge', phase_started_at: new Date().toISOString() });
  log('━━━ Phase 2/4: MERGE TRACKER ━━━');
  if (DRY_RUN) { log('(dry-run) skipping merge-tracker'); return { ok: true }; }
  const code = await runScript('merge-tracker.mjs');
  if (code !== 0) {
    log(`✗ merge-tracker failed (exit ${code})`);
    return { ok: false };
  }
  log('✓ tracker merged');
  return { ok: true };
}

async function phaseRebuild() {
  updateJob({ phase: 'rebuild', phase_started_at: new Date().toISOString() });
  log('━━━ Phase 3/4: DASHBOARD REBUILD ━━━');
  if (DRY_RUN) { log('(dry-run) skipping rebuild'); return { ok: true }; }
  const code = await runScript('scripts/build-dashboard.mjs');
  if (code !== 0) {
    log(`✗ rebuild failed (exit ${code})`);
    return { ok: false };
  }
  log('✓ dashboard rebuilt');
  return { ok: true };
}

async function phaseEmail() {
  if (!SEND_EMAIL) {
    log('━━━ Phase 4/4: EMAIL ━━━ (skipped — no --send-email flag)');
    return { ok: true, skipped: true };
  }
  updateJob({ phase: 'email', phase_started_at: new Date().toISOString() });
  log('━━━ Phase 4/4: HEARTBEAT EMAIL ━━━');
  if (DRY_RUN) { log('(dry-run) skipping email'); return { ok: true }; }
  const code = await runScript('scripts/heartbeat.mjs', ['--send']);
  if (code !== 0) {
    log(`✗ heartbeat email failed (exit ${code})`);
    return { ok: false };
  }
  log('✓ heartbeat email sent');
  return { ok: true };
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  updateJob({
    status:     'running',
    type:       'batch-only',
    started_at: new Date().toISOString(),
    send_email: SEND_EMAIL,
    dry_run:    DRY_RUN,
    log_path:   LOG_PATH,
  });
  log(`Batch-only pipeline job ${JOB_ID} starting`);
  log(`  send_email: ${SEND_EMAIL}`);
  log(`  dry_run:    ${DRY_RUN}`);

  const phases = {};
  phases.batch = await phaseBatch();
  if (!phases.batch.ok) {
    updateJob({ status: 'failed', failed_at: new Date().toISOString(), failure_phase: 'batch' });
    process.exit(2);
  }
  phases.merge = await phaseMergeTracker();
  if (!phases.merge.ok) {
    // Non-fatal — tracker merge failure shouldn't block rebuild
    log('⚠️  merge-tracker failed but continuing to rebuild');
  }
  phases.rebuild = await phaseRebuild();
  if (!phases.rebuild.ok) {
    updateJob({ status: 'failed', failed_at: new Date().toISOString(), failure_phase: 'rebuild' });
    process.exit(2);
  }
  phases.email = await phaseEmail();

  updateJob({
    status:      'completed',
    finished_at: new Date().toISOString(),
    phases,
    phase:       'done',
  });
  log('✓ Done.');
}

main().catch(err => {
  log(`FATAL: ${err.message}\n${err.stack}`);
  updateJob({ status: 'failed', failed_at: new Date().toISOString(), error: err.message });
  process.exit(2);
});
