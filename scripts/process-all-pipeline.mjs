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

// 2026-05-20 — Tier system overhaul. Three tiers selectable in the Process
// All cost modal; defaults to 1 (Standard). See lib/process-all-tiers.mjs
// for the canonical definitions + cost estimates.
//
//   1 Standard         Haiku triage + Sonnet eval
//   2 Premium Triage   Sonnet triage + Sonnet eval (matches legacy '5')
//   3 Premium Eval     Sonnet triage + Opus eval
//
// Independent of tier: post-eval auto-escalation. Every row scoring ≥4.0
// gets apply-pack pregen + polish — the system invests more in proven
// winners regardless of which tier the user picked.
const { resolveTier, AUTO_ESCALATE_FLOOR } = await import('../lib/process-all-tiers.mjs');
const TIER_OBJ = resolveTier(ARGS.tier);
const TIER = String(TIER_OBJ.id);
const IS_TIER5 = TIER_OBJ.id >= 2;  // legacy alias — anything 2+ used to be "Tier-5"
// HIGH_CONFIDENCE_PREGEN_FLOOR retained for envar override; now defaults to
// the AUTO_ESCALATE_FLOOR (4.0) instead of 4.5 — the user wants pregen to
// fire on every ≥4.0 row, not just the top 4.5+ cream.
const HIGH_CONFIDENCE_PREGEN_FLOOR = parseFloat(process.env.HIGH_CONFIDENCE_PREGEN_FLOOR || String(AUTO_ESCALATE_FLOOR));

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
  updateJob({ phase: 'triage', phase_started_at: new Date().toISOString(), tier: TIER });
  log(`━━━ Phase 1/4: TRIAGE ${IS_TIER5 ? '(TIER-5: Sonnet JD)' : '(Haiku)'} ━━━`);
  if (DRY_RUN) { log('(dry-run) skipping triage'); return { ok: true, advanced: 0 }; }
  // 2026-05-20 — Process All is gated by an explicit cost-confirmation
  // modal (Run Batch $25 / Process All $250 / Monthly $500). That user
  // consent IS the throughput governor; hidden caps below it break the
  // contract — the cost preview promises "drain the pipeline" but the
  // caps silently truncate.
  //
  // triage.mjs has TWO caps:
  //   --limit=N         per-session (default 50, the binding constraint)
  //   --daily-limit=N   cumulative daily (default 200)
  //
  // The original bug only overrode --daily-limit=300, leaving --limit at
  // its 50 default → each Process All run processed at most 50 URLs
  // regardless of confirmed cost. Now we override BOTH to effectively-
  // unlimited values (high enough to drain any realistic queue), letting
  // the modal's confirmed spend be the only governor.
  //
  // Mitchell can re-impose caps via:
  //   - PROCESS_ALL_TRIAGE_LIMIT env var (sets both --limit and
  //     --daily-limit to the same value), OR
  //   - triage_daily_limit in data/dashboard-settings.json (only used
  //     by the scheduled-launchd path, not Process All).
  //
  // Standalone `node triage.mjs --limit=N --daily-limit=M` still works
  // for ad-hoc capped runs outside Process All.
  const triageArgs = [...SCOPED_ARGS];
  const envCap = process.env.PROCESS_ALL_TRIAGE_LIMIT;
  const cap = envCap && /^\d+$/.test(envCap) ? parseInt(envCap, 10) : 100000;
  triageArgs.push(`--limit=${cap}`);
  triageArgs.push(`--daily-limit=${cap}`);
  log(envCap
    ? `  cap: --limit=${cap} --daily-limit=${cap} (from PROCESS_ALL_TRIAGE_LIMIT env)`
    : `  cap: --limit=${cap} --daily-limit=${cap} (effectively unlimited — per cost-confirmation contract)`);
  if (TIER_OBJ.triage_use_sonnet_jd) triageArgs.push('--use-sonnet-jd');

  // 2026-05-20 — Per-run telemetry. Capture pipeline size BEFORE triage so we
  // can detect cap-hits in post (if processed < pipeline_size_before AND cap
  // < pipeline_size_before, the cap bound the throughput). Surfaced via
  // pipeline-process-state.json + the dashboard Batch Status modal.
  let pipelineBefore = 0;
  try {
    const pipeText = readFileSync(join(ROOT, 'data/pipeline.md'), 'utf-8');
    pipelineBefore = (pipeText.match(/^- \[ \] https?:\/\//gm) || []).length;
  } catch {}
  updateJob({ triage_pipeline_before: pipelineBefore, triage_cap: cap });

  const code = await runScript('triage.mjs', triageArgs);
  // Parse triage's output for advanced + skipped + dead counts.
  let advanced = 0, skipped = 0, dead = 0;
  try {
    const logText = readFileSync(LOG_PATH, 'utf-8');
    const mA = logText.match(/Advanced:\s+(\d+)/);     if (mA) advanced = parseInt(mA[1], 10);
    const mS = logText.match(/Skipped:\s+(\d+)/);      if (mS) skipped  = parseInt(mS[1], 10);
    const mD = logText.match(/Dead:\s+(\d+)/);         if (mD) dead     = parseInt(mD[1], 10);
  } catch {}
  if (code !== 0) {
    log(`✗ triage failed (exit ${code})`);
    return { ok: false, advanced };
  }
  // Cap-hit detection: triage processed (advanced + skipped + dead) URLs;
  // if that equals the cap AND pipeline still has un-touched rows, the cap
  // was the binding constraint.
  const processed = advanced + skipped + dead;
  let pipelineAfter = 0;
  try {
    const pipeText = readFileSync(join(ROOT, 'data/pipeline.md'), 'utf-8');
    pipelineAfter = (pipeText.match(/^- \[ \] https?:\/\//gm) || []).length;
  } catch {}
  const capHit = processed >= cap && pipelineAfter > 0;
  const missed = capHit ? pipelineAfter : 0;
  log(`✓ triage complete — pipeline ${pipelineBefore} → ${pipelineAfter} · processed ${processed} (advanced=${advanced} skipped=${skipped} dead=${dead}) · cap=${cap}${capHit ? ` · ⚠ CAP HIT — ${missed} URL(s) missed this run` : ''}`);
  updateJob({
    triage_advanced: advanced,
    triage_skipped:  skipped,
    triage_dead:     dead,
    triage_processed: processed,
    triage_pipeline_after: pipelineAfter,
    triage_cap_hit:  capHit,
    triage_missed_this_run: missed,
  });
  return { ok: true, advanced, skipped, dead, processed, cap_hit: capHit, missed };
}

// 2026-05-19 cohesion fix (Mitchell postmortem) — count rows in the
// triage-advance queue so phaseBatch can loop until drained. Skips the
// header row. Returns 0 if the file doesn't exist.
function countTriageAdvanceRows() {
  const fp = join(ROOT, 'batch/triage-advance.tsv');
  if (!existsSync(fp)) return 0;
  const lines = readFileSync(fp, 'utf-8').split('\n').filter(l => l.trim() && !l.startsWith('url\t'));
  return lines.length;
}

async function phaseBatch() {
  updateJob({ phase: 'batch', phase_started_at: new Date().toISOString() });
  log('━━━ Phase 2/4: BATCH EVAL ━━━');
  if (DRY_RUN) { log('(dry-run) skipping batch'); return { ok: true }; }

  // 2026-05-19 cohesion fix #1 (Mitchell postmortem) — drain loop. Was a
  // single batch-runner call capped at LIMIT=100 (the script's default),
  // which left items in triage-advance.tsv after queues > 100. Now loops
  // up to MAX_ROUNDS calls with --limit=1000 each, breaking when queue
  // empties OR no progress is made between rounds.
  const MAX_ROUNDS = Math.max(1, Math.min(20, parseInt(process.env.PROCESS_ALL_MAX_BATCH_ROUNDS || '10', 10)));
  const PER_ROUND_LIMIT = Math.max(1, parseInt(process.env.PROCESS_ALL_BATCH_LIMIT || '1000', 10));
  let round = 1;
  let totalDrained = 0;
  while (round <= MAX_ROUNDS) {
    const beforeCount = countTriageAdvanceRows();
    if (beforeCount === 0) {
      log(`  batch queue empty (round ${round}) — drain complete`);
      break;
    }
    log(`━━━ Batch round ${round}/${MAX_ROUNDS} — ${beforeCount} items in queue · eval=${TIER_OBJ.eval_model} ━━━`);
    // 2026-05-20 — pass tier's eval model to batch-runner-batches.mjs
    // (which already accepts --model). Tier 1+2 use Sonnet (default);
    // Tier 3 uses Opus for the A-G report writing.
    const batchArgs = ['run', `--limit=${PER_ROUND_LIMIT}`, `--model=${TIER_OBJ.eval_model}`, ...SCOPED_ARGS];
    const code = await runScript('batch-runner-batches.mjs', batchArgs);
    if (code !== 0) {
      log(`✗ batch round ${round} failed (exit ${code})`);
      return { ok: false };
    }
    const afterCount = countTriageAdvanceRows();
    const drainedThisRound = beforeCount - afterCount;
    totalDrained += drainedThisRound;
    log(`  round ${round}: ${beforeCount} → ${afterCount} (drained ${drainedThisRound})`);
    if (drainedThisRound <= 0) {
      log(`  round ${round}: no drain detected — breaking (queue may be stuck behind expired postings or company-scope filter)`);
      break;
    }
    round++;
  }
  log(`✓ batch eval complete — ${totalDrained} item(s) drained across ${round - 1} round(s)`);
  updateJob({ batch_rounds_used: round - 1, batch_items_drained: totalDrained });
  // β Run-Batch eval 2026-05-19: persist published_count so the sidebar's
  // 5-stage Publish bar can render a real ratio (was hard-coded 0/0 because
  // dashboard-server.mjs:batchLive() reads activeJob.published_count and no
  // upstream phase ever set it). "Published" = items that finished with a
  // score ≥ THRESHOLD_FOR_PUBLISH (4.0 — matches buildPipelinePreview).
  // Soft-fail on parse error: we'd rather log 0 than crash the whole orchestrator.
  try {
    const PUBLISH_THRESHOLD = parseFloat(process.env.THRESHOLD_FOR_PUBLISH || '4.0');
    const statePath = join(ROOT, 'batch/batch-state.tsv');
    let publishedCount = 0;
    if (existsSync(statePath)) {
      const lines = readFileSync(statePath, 'utf-8').split('\n').filter(l => l.trim() && !l.startsWith('id'));
      for (const l of lines) {
        const cols = l.split('\t');
        const status = cols[2];
        const score = parseFloat(cols[6] || '0');
        if (status === 'completed' && !Number.isNaN(score) && score >= PUBLISH_THRESHOLD) {
          publishedCount++;
        }
      }
    }
    updateJob({ published_count: publishedCount });
    log(`  published_count: ${publishedCount} (score ≥ ${PUBLISH_THRESHOLD})`);
  } catch (err) {
    log(`  ⚠ could not compute published_count: ${err.message} — defaulting to 0`);
    updateJob({ published_count: 0 });
  }
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
  // 2026-05-20 — Auto-escalation rule: polish ALWAYS runs on ≥4.0 rows
  // post-eval (the "premium treatment for anything that passes triage and
  // proves itself with a ≥4.0 score" contract). The POLISH_PACK_ENABLED
  // env var is retained as a kill-switch — set to '0' to explicitly
  // disable polish for a run. Default is now ON.
  const killSwitch = String(process.env.POLISH_PACK_ENABLED || '').trim() === '0';
  if (killSwitch) {
    log('━━━ Phase 2.6/4: POLISH PACKS ━━━ (skipped — POLISH_PACK_ENABLED=0 kill-switch)');
    return { ok: true, skipped: true };
  }
  if (!TIER_OBJ.auto_polish_on_high_score) {
    log(`━━━ Phase 2.6/4: POLISH PACKS ━━━ (skipped — tier ${TIER_OBJ.id} disables auto-polish)`);
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
  // Clamp to sane bounds — topN: 1-20 (above 20 is almost certainly a typo since the
  // cost would explode), costCap: $10-$500 (matches polish agent's spec range).
  const rawTopN  = parseInt(process.env.POLISH_TOP_N_PER_RUN || '5', 10);
  const topN     = Number.isFinite(rawTopN) && rawTopN > 0 ? Math.min(rawTopN, 20) : 5;
  const rawCap   = parseFloat(process.env.POLISH_PER_PACK_COST_CAP_USD || '120');
  const costCap  = String(Number.isFinite(rawCap) && rawCap > 0 ? Math.min(Math.max(rawCap, 10), 500) : 120);
  // Polish applies to Evaluated (pre-application materials), Applied (waiting-for-recruiter
  // tightening), and Interview (closing-stage materials). All three states ship downstream
  // artifacts that benefit from the loop.
  const polishStatuses = new Set(['Evaluated', 'Applied', 'Interview']);
  const ranked = (apq.ranked || []).filter(r => r && r.num && polishStatuses.has(r.status)).slice(0, topN);

  let polished = 0;
  let failed = 0;
  let skipped = 0;
  // Surface running totals at top-level (dashboard SSE bar reads polish_progress.*
  // since phases.polish only commits at the end of main()). Helper makes sure every
  // path through the loop — skipped, polished, failed — emits live progress.
  const writeProgress = () => updateJob({
    polish_progress: { polished, failed, skipped, total: ranked.length, cap_per_pack_usd: Number(costCap) },
  });
  for (const r of ranked) {
    const slug = `${String(r.num).padStart(3, '0')}-${String(r.company || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${String(r.role || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    const polishSummary = join(ROOT, 'data', 'apply-packs', slug, 'polish-summary.json');
    if (existsSync(polishSummary)) {
      const ageMs = Date.now() - statSync(polishSummary).mtimeMs;
      if (ageMs < 3 * 24 * 60 * 60 * 1000) {
        log(`  ↪ row ${r.num} polish-summary fresh (<3d) — skipping`);
        skipped++;
        writeProgress();
        continue;
      }
    }
    log(`  → polishing row ${r.num} (${r.company} — ${r.role}) [cap $${costCap}]`);
    const code = await runScript('scripts/agents/apply-pack-polish.mjs', ['--row', String(r.num), '--cost-cap', String(costCap)]);
    if (code === 0) {
      polished++;
      log(`  ✓ row ${r.num} polish ok`);
      // α Run-Batch eval 2026-05-19: now also run preflight-pack against the slug so
      // gate 6 (polish-summary.final_recommendation === 'APPROVED') is enforced. The
      // result is PREFLIGHT.md on disk — non-fatal here (we don't gate the rest of the
      // pipeline), but the visible NEEDS_HUMAN / FAIL on the dashboard gives Mitchell
      // a reason not to ship a pack that didn't converge.
      const pfCode = await runScript('scripts/preflight-pack.mjs', ['--slug', slug]);
      log(`  ↪ preflight row ${r.num} exit=${pfCode} (0=PASS, 1=CAUTION, 2=FAIL)`);
    } else {
      failed++;
      log(`  ⚠ row ${r.num} polish failed (exit ${code}) — continuing`);
    }
    writeProgress();
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

// Tier-5 only — pre-generate apply-packs for high-confidence rows that just landed.
// build-apply-packs.mjs reads applications.md, picks top-N by score (floor=4.0 hardcoded in that script),
// and generates the full pack directory (cover-letter, form-fields, interview-prep, ATS check, etc.).
// We cap N at TIER5_PREGEN_TOP_N (default 10) so a single run can't auto-generate 50 packs.
async function phasePregen() {
  // 2026-05-20 — Auto-escalation rule: apply-pack pregen ALWAYS runs on
  // ≥AUTO_ESCALATE_FLOOR (4.0) rows post-eval. Was previously gated to
  // Tier-5 only with a top-10 cap; now caps at TIER5_PREGEN_TOP_N (default
  // raised from 10 → 50 since the floor is now ≥4.0 not ≥4.5).
  if (!TIER_OBJ.auto_pregen_on_high_score) {
    log(`━━━ Phase 2.75/4: APPLY-PACK PREGEN ━━━ (skipped — tier ${TIER_OBJ.id} disables auto-pregen)`);
    return { ok: true, skipped: true };
  }
  updateJob({ phase: 'pregen', phase_started_at: new Date().toISOString() });
  const topN = Math.max(1, Math.min(50, parseInt(process.env.TIER5_PREGEN_TOP_N || '50', 10)));
  log(`━━━ Phase 2.75/4: APPLY-PACK PREGEN — top ${topN} rows ≥${HIGH_CONFIDENCE_PREGEN_FLOOR} (auto-escalation, tier ${TIER_OBJ.id}) ━━━`);
  if (DRY_RUN) { log('(dry-run) skipping pregen'); return { ok: true, generated: 0 }; }
  const code = await runScript('scripts/build-apply-packs.mjs', [`--top=${topN}`, '--include-todays-top']);
  if (code !== 0) {
    log(`⚠ apply-pack pregen exited ${code} — continuing (soft-fail per phasePolish convention)`);
    return { ok: true, generated: 0, exit_code: code };
  }
  log(`✓ apply-pack pregen complete (top ${topN})`);
  updateJob({ pregen_top_n: topN });
  return { ok: true, top_n: topN };
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
  // Tier-5 only — apply-pack pregen for top-N high-confidence rows.
  // Soft-fail: pregen failure does not block merge/rebuild.
  phases.pregen = await phasePregen();
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
