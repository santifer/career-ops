#!/usr/bin/env node
/**
 * scripts/process-all-pipeline.mjs — one-shot pipeline orchestrator.
 *
 * Chains the full intake-to-dashboard flow so the user can click ONE button
 * on the dashboard ("Process All Pipeline Items") and have everything land:
 *
 *   1. triage   → reads data/pipeline.md, scores via Haiku, advances to batch
 *   2. batch    → submits advanced items to Anthropic batch API, polls, reconciles
 *   3. rebuild  → regenerates dashboard/index.html
 *   4. email    → (optional) sends a heartbeat email summarizing what landed
 *
 * Writes state to data/pipeline-process-state.json so the dashboard can
 * poll /api/pipeline/process/status and show a progress bar.
 *
 * Usage:
 *   node scripts/process-all-pipeline.mjs                 # no email
 *   node scripts/process-all-pipeline.mjs --send-email    # email on completion
 *   node scripts/process-all-pipeline.mjs --dry-run       # report what would run, no API calls
 *   node scripts/process-all-pipeline.mjs --job-id=xxx    # use specific job ID (server pre-allocates)
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
const SEND_EMAIL = !!ARGS['send-email'];
const DRY_RUN = !!ARGS['dry-run'];
const JOB_ID = ARGS['job-id'] || ('proc-' + Date.now().toString(36) + '-' + randomBytes(3).toString('hex'));
const LOG_PATH = `/tmp/process-all-${JOB_ID}.log`;

// Optional company scope from the Process All Phase A modal. When present,
// passed through to triage.mjs and batch-runner-batches.mjs so both filter
// at their respective layers (forward funnel — both must respect the scope
// or work leaks through one side). Merge + rebuild operate on global output
// artifacts and are intentionally NOT scoped.
const COMPANIES_ARG = typeof ARGS.companies === 'string' && ARGS.companies.trim() ? ARGS.companies.trim() : '';
const SCOPED_ARGS = COMPANIES_ARG ? [`--companies=${COMPANIES_ARG}`] : [];

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

// ── Run a child script, stream stdout into our log + state ────────────────
function runScript(name, args = [], env = {}) {
  return new Promise((resolve) => {
    log(`▶ ${name} ${args.join(' ')}`);
    const proc = spawn('node', [name, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
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
async function phaseTriage() {
  updateJob({ phase: 'triage', phase_started_at: new Date().toISOString() });
  log('━━━ Phase 1/4: TRIAGE ━━━');
  if (DRY_RUN) { log('(dry-run) skipping triage'); return { ok: true, advanced: 0 }; }
  const code = await runScript('triage.mjs', ['--daily-limit=300', ...SCOPED_ARGS]);
  // Parse triage's output for advanced count (best-effort)
  let advanced = 0;
  try {
    const logText = readFileSync(LOG_PATH, 'utf-8');
    const m = logText.match(/Advanced:\s+(\d+)/);
    if (m) advanced = parseInt(m[1], 10);
  } catch {}
  if (code !== 0) {
    log(`✗ triage failed (exit ${code})`);
    return { ok: false, advanced };
  }
  log(`✓ triage complete — ${advanced} advanced to batch queue`);
  updateJob({ triage_advanced: advanced });
  return { ok: true, advanced };
}

async function phaseBatch() {
  updateJob({ phase: 'batch', phase_started_at: new Date().toISOString() });
  log('━━━ Phase 2/4: BATCH EVAL ━━━');
  if (DRY_RUN) { log('(dry-run) skipping batch'); return { ok: true }; }
  // batch-runner-batches.mjs run = submit + poll + process in one
  const code = await runScript('batch-runner-batches.mjs', ['run', ...SCOPED_ARGS]);
  if (code !== 0) {
    log(`✗ batch run failed (exit ${code})`);
    return { ok: false };
  }
  log('✓ batch eval complete');
  return { ok: true };
}

async function phaseMergeTracker() {
  updateJob({ phase: 'merge', phase_started_at: new Date().toISOString() });
  log('━━━ Phase 2.5/4: MERGE TRACKER ━━━');
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

// ── Main orchestration ────────────────────────────────────────────────────
function countPendingPipeline() {
  const fp = join(ROOT, 'data/pipeline.md');
  if (!existsSync(fp)) return 0;
  return readFileSync(fp, 'utf-8').split('\n').filter(l => l.startsWith('- [ ]')).length;
}

async function main() {
  const pendingBefore = countPendingPipeline();
  updateJob({
    status:          'running',
    started_at:      new Date().toISOString(),
    pending_before:  pendingBefore,
    send_email:      SEND_EMAIL,
    dry_run:         DRY_RUN,
    log_path:        LOG_PATH,
  });
  log(`Process-all-pipeline job ${JOB_ID} starting`);
  log(`  pending items before: ${pendingBefore}`);
  log(`  send_email: ${SEND_EMAIL}`);
  log(`  dry_run: ${DRY_RUN}`);
  log(`  company scope: ${COMPANIES_ARG || '(none — full drain)'}`);

  const phases = {};
  phases.triage  = await phaseTriage();
  if (!phases.triage.ok) {
    updateJob({ status: 'failed', failed_at: new Date().toISOString(), failure_phase: 'triage' });
    process.exit(2);
  }
  phases.batch   = await phaseBatch();
  if (!phases.batch.ok) {
    updateJob({ status: 'failed', failed_at: new Date().toISOString(), failure_phase: 'batch' });
    process.exit(2);
  }
  phases.merge   = await phaseMergeTracker();
  if (!phases.merge.ok) {
    // Non-fatal — tracker merge failure shouldn't block rebuild
    log('⚠️  merge-tracker failed but continuing to rebuild');
  }
  phases.rebuild = await phaseRebuild();
  if (!phases.rebuild.ok) {
    updateJob({ status: 'failed', failed_at: new Date().toISOString(), failure_phase: 'rebuild' });
    process.exit(2);
  }
  phases.email   = await phaseEmail();
  // email failure is non-fatal — the work IS done; only the notification didn't go out

  const pendingAfter = countPendingPipeline();
  const processed = Math.max(0, pendingBefore - pendingAfter);
  updateJob({
    status:          'completed',
    finished_at:     new Date().toISOString(),
    pending_after:   pendingAfter,
    processed,
    phases,
    phase:           'done',
  });
  log(`✓ Done. Processed ${processed} items (${pendingBefore} → ${pendingAfter}).`);
}

main().catch(err => {
  log(`FATAL: ${err.message}\n${err.stack}`);
  updateJob({ status: 'failed', failed_at: new Date().toISOString(), error: err.message });
  process.exit(2);
});
