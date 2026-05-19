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

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, statSync } from 'fs';
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

// ε 2026-05-19 — Orphan state cleanup on startup. Previously
// pipeline-process-state.json grew unbounded (every job, every run, forever)
// AND any 'running' job from a crashed prior pipeline kept that job marked
// running indefinitely — confusing batchLive()'s "active job" detection.
// Strategy:
//   - Mark jobs status='running' or 'queued' with updated_at >2h ago as 'crashed'
//     so the next dashboard rebuild and batchLive() don't treat them as active.
//   - Prune any job (any status) with updated_at >7d ago. Audit trail lives in
//     /tmp/process-all-*.log (each job has its own log).
// Bounded by ORPHAN_AGE_HOURS + STATE_TTL_DAYS env vars for ops tuning.
const ORPHAN_AGE_HOURS = parseFloat(process.env.PIPELINE_STATE_ORPHAN_AGE_HOURS || '2');
const STATE_TTL_DAYS   = parseFloat(process.env.PIPELINE_STATE_TTL_DAYS         || '7');
function cleanupOrphanState() {
  const s = loadState();
  if (!s.jobs || typeof s.jobs !== 'object') return;
  const now = Date.now();
  let markedCrashed = 0;
  let pruned = 0;
  for (const [jid, j] of Object.entries(s.jobs)) {
    if (!j || typeof j !== 'object') { delete s.jobs[jid]; pruned++; continue; }
    const tsStr = j.updated_at || j.started_at;
    if (!tsStr) continue;
    const ts = Date.parse(tsStr);
    if (!Number.isFinite(ts)) continue;
    const ageHours = (now - ts) / (1000 * 60 * 60);
    // Mark stale running/queued as crashed
    if ((j.status === 'running' || j.status === 'queued') && ageHours > ORPHAN_AGE_HOURS) {
      s.jobs[jid] = { ...j, status: 'crashed', crashed_at: new Date().toISOString(), updated_at: new Date().toISOString(), crash_reason: `no update for ${ageHours.toFixed(1)}h (orphan-cleanup at ${new Date().toISOString()})` };
      markedCrashed++;
    }
    // Prune anything older than TTL
    if (ageHours > STATE_TTL_DAYS * 24) {
      delete s.jobs[jid];
      pruned++;
    }
  }
  if (markedCrashed || pruned) {
    saveState(s);
    log(`[cleanup] orphan-state pass: ${markedCrashed} marked crashed, ${pruned} pruned (TTL ${STATE_TTL_DAYS}d, orphan-age ${ORPHAN_AGE_HOURS}h)`);
  }
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

// α ALPHA 2026-05-19 — optional polish stage between batch and pack zip.
// Gated by POLISH_PACK_ENABLED env var so this stage is OPT-IN.
// Reads the apply-now-queue, scans for top-N rows whose pack has artifacts
// but no polish-summary.json (or one >3d old), runs apply-pack-polish on each.
// Soft-fail: a polish failure does NOT block the rest of the pipeline.
//
// α Run-Batch eval 2026-05-19 — additions:
//   1. Honors POLISH_TOP_N_PER_RUN (default 5) so the dashboard preview slug-count
//      matches the actual policy.
//   2. Passes --cost-cap from POLISH_PER_PACK_COST_CAP_USD (default $120) so the
//      polish agent's $500 spec ceiling can't silently blow $2500 across 5 rows.
//   3. Includes 'Applied' and 'Interview' rows (not just 'Evaluated') — Mitchell
//      benefits from polished interview-prep + post-applied materials too.
//   4. Aggregates polished/failed/skipped + cumulative cost into the job state
//      object so dashboard SSE bars can render real counts.
async function phasePolish() {
  const enabled = String(process.env.POLISH_PACK_ENABLED || '').trim() === '1';
  if (!enabled) {
    log('━━━ Phase 2.6/4: POLISH PACKS ━━━ (skipped — POLISH_PACK_ENABLED!=1)');
    return { ok: true, skipped: true };
  }
  updateJob({ phase: 'polish', phase_started_at: new Date().toISOString() });
  log('━━━ Phase 2.6/4: POLISH PACKS ━━━');
  if (DRY_RUN) { log('(dry-run) skipping polish'); return { ok: true, skipped: true }; }

  // Find rows that have at least one outbound artifact + no recent polish-summary
  const apqPath = join(ROOT, 'data/apply-now-queue.json');
  if (!existsSync(apqPath)) {
    log('  no apply-now-queue.json — skipping');
    return { ok: true };
  }
  let apq;
  try { apq = JSON.parse(readFileSync(apqPath, 'utf-8')); } catch (_) { return { ok: true }; }
  const topN     = parseInt(process.env.POLISH_TOP_N_PER_RUN || '5', 10);
  const costCap  = process.env.POLISH_PER_PACK_COST_CAP_USD || '120';
  // Polish applies to Evaluated (pre-application materials), Applied (waiting-for-recruiter
  // tightening), and Interview (closing-stage materials). All three states ship downstream
  // artifacts that benefit from the loop.
  const polishStatuses = new Set(['Evaluated', 'Applied', 'Interview']);
  const ranked = (apq.ranked || []).filter(r => r && r.num && polishStatuses.has(r.status)).slice(0, topN);

  let polished = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of ranked) {
    const slug = `${String(r.num).padStart(3, '0')}-${String(r.company || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${String(r.role || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    const polishSummary = join(ROOT, 'data', 'apply-packs', slug, 'polish-summary.json');
    if (existsSync(polishSummary)) {
      const ageMs = Date.now() - statSync(polishSummary).mtimeMs;
      if (ageMs < 3 * 24 * 60 * 60 * 1000) {
        log(`  ↪ row ${r.num} polish-summary fresh (<3d) — skipping`);
        skipped++;
        continue;
      }
    }
    log(`  → polishing row ${r.num} (${r.company} — ${r.role}) [cap $${costCap}]`);
    const code = await runScript('scripts/agents/apply-pack-polish.mjs', ['--row', String(r.num), '--cost-cap', String(costCap)]);
    if (code === 0) { polished++; log(`  ✓ row ${r.num} polish ok`); }
    else { failed++; log(`  ⚠ row ${r.num} polish failed (exit ${code}) — continuing`); }
    // Surface running totals at top-level (dashboard SSE bar reads polish_progress.*
    // since phases.polish only commits at the end of main()).
    updateJob({ polish_progress: { polished, failed, skipped, total: ranked.length, cap_per_pack_usd: Number(costCap) } });
  }
  log(`  polish stage done: ${polished} polished, ${failed} failed, ${skipped} skipped (cap=$${costCap}/pack, topN=${topN})`);
  return { ok: true, polished, failed, skipped, cost_cap_per_pack_usd: Number(costCap), top_n: topN };
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
  // ε 2026-05-19 — run orphan-state cleanup BEFORE registering ourselves so
  // we don't accidentally mark our own brand-new row as crashed.
  try { cleanupOrphanState(); } catch (err) { log(`[cleanup] error (non-fatal): ${err.message}`); }
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
  // α ALPHA 2026-05-19 — opt-in polish stage (POLISH_PACK_ENABLED=1)
  phases.polish = await phasePolish();
  if (!phases.polish.ok) {
    // Soft-fail: log and continue. Polish failures shouldn't block the rest.
    log('⚠️  polish phase reported failure — continuing pipeline');
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

  // γ GAMMA 2026-05-19 truth-audit: persist published_count so the SSE
  // batchLive stream renders the publish stage correctly. Before this fix the
  // publish stage always showed `0/0` even when items were promoted. Derive
  // from apply-now-queue.json (post-rebuild) by counting `Evaluated` entries
  // with score ≥ THRESHOLD_FOR_PUBLISH (4.0).
  let publishedCount = null;
  try {
    const apqPath = join(ROOT, 'data/apply-now-queue.json');
    if (existsSync(apqPath)) {
      const apq = JSON.parse(readFileSync(apqPath, 'utf-8'));
      publishedCount = (apq.ranked || []).filter(r =>
        r && (r.score >= 4.0 || parseFloat(r.score) >= 4.0)
      ).length;
    }
  } catch (_) { /* leave null — renderer falls back to ✓ */ }

  updateJob({
    status:           'completed',
    finished_at:      new Date().toISOString(),
    pending_after:    pendingAfter,
    processed,
    published_count:  publishedCount,
    phases,
    phase:            'done',
  });
  log(`✓ Done. Processed ${processed} items (${pendingBefore} → ${pendingAfter}). Published: ${publishedCount == null ? 'unknown' : publishedCount}`);
}

main().catch(err => {
  log(`FATAL: ${err.message}\n${err.stack}`);
  updateJob({ status: 'failed', failed_at: new Date().toISOString(), error: err.message });
  process.exit(2);
});
