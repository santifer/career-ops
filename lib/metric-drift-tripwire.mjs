/**
 * lib/metric-drift-tripwire.mjs — Drift sentry for high-stakes computed metrics.
 *
 * Design source: refresh-master Phase 1.5 deliverable 6. Watches 5 highest-
 * stakes computed metrics and halts the orchestrator (with an
 * escalation flag) if any metric moves ±20% in 24h without a corresponding
 * source-data update.
 *
 * Tracked metrics:
 *   1. profile_alignment    (alignment-scorer.mjs → reports/*.md Block A)
 *   2. interview_likelihood (alignment-scorer.mjs)
 *   3. recruiter_pipeline_density (dashboard-server.mjs:computeRecruiterPipelineDensity)
 *   4. toxicity_composite   (data/company-toxicity-cache/<slug>.json)
 *   5. hm_sees_you_pct      (alignment-scorer.mjs hmNoticing field)
 *
 * Tripwire logic per metric:
 *   - Snapshot current value + computed_at + source_data_hash on every run
 *   - Compare to last snapshot (≤24h old)
 *   - If |new - old| / max(|old|, 1) > 0.20 AND source_data_hash unchanged →
 *     TRIPWIRE: file a report to data/drift-tripwire-{date}.md and emit a
 *     non-zero exit code so refresh-master halts.
 *   - If source_data_hash changed, the move is "explained" — log it but don't halt.
 *
 * State: data/metric-drift-state.json (rolling 7 days of snapshots).
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const STATE_PATH = join(REPO_ROOT, 'data', 'metric-drift-state.json');
const REPORT_DIR = join(REPO_ROOT, 'data');

export const TRACKED_METRICS = [
  'profile_alignment',
  'interview_likelihood',
  'recruiter_pipeline_density',
  'toxicity_composite',
  'hm_sees_you_pct',
];

const DRIFT_THRESHOLD = 0.20;     // ±20%
const LOOKBACK_HOURS = 24;
const ROLLING_RETENTION_DAYS = 7;

function loadState() {
  if (!existsSync(STATE_PATH)) return { snapshots: [] };
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); }
  catch { return { snapshots: [] }; }
}

function saveState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function pruneState(state) {
  const cutoff = Date.now() - ROLLING_RETENTION_DAYS * 86400000;
  state.snapshots = (state.snapshots || []).filter(s => Date.parse(s.ts) > cutoff);
}

function hashStr(s) {
  return createHash('sha256').update(String(s || '')).digest('hex').slice(0, 16);
}

/**
 * Record a new snapshot. Returns { tripwires, explainedDrifts, snapshot }.
 * Caller (refresh-master) decides whether to halt based on tripwires.length.
 *
 * @param {object} snapshot
 * @param {Object<string, {value: number, source_data_hash: string}>} snapshot.metrics
 * @param {string} snapshot.context  - e.g., 'refresh-master:start' | 'post-write:hm_intel_delta:row-42'
 */
export function recordAndCheck(snapshot) {
  const state = loadState();
  pruneState(state);

  const ts = new Date().toISOString();
  const newSnap = { ts, context: snapshot.context || 'unknown', metrics: snapshot.metrics || {} };

  const lookbackMs = LOOKBACK_HOURS * 3600_000;
  const cutoffMs = Date.now() - lookbackMs;
  const recent = state.snapshots.filter(s => Date.parse(s.ts) > cutoffMs);
  const tripwires = [];
  const explainedDrifts = [];

  for (const metric of TRACKED_METRICS) {
    const curr = newSnap.metrics[metric];
    if (!curr || typeof curr.value !== 'number') continue;

    // Compare against MOST RECENT snapshot in lookback window (not the oldest)
    const prior = [...recent].reverse().find(s => s.metrics && typeof s.metrics[metric]?.value === 'number');
    if (!prior) continue;

    const priorValue = prior.metrics[metric].value;
    const priorHash = prior.metrics[metric].source_data_hash || '';
    const currHash = curr.source_data_hash || '';
    const delta = Math.abs(curr.value - priorValue);
    const denom = Math.max(Math.abs(priorValue), 1);
    const driftPct = delta / denom;

    if (driftPct > DRIFT_THRESHOLD) {
      const evt = {
        metric,
        prior_value: priorValue,
        current_value: curr.value,
        drift_pct: driftPct,
        prior_ts: prior.ts,
        current_ts: ts,
        source_hash_changed: priorHash !== currHash,
        prior_source_hash: priorHash,
        current_source_hash: currHash,
      };
      if (evt.source_hash_changed) {
        explainedDrifts.push(evt);
      } else {
        tripwires.push(evt);
      }
    }
  }

  state.snapshots.push(newSnap);
  saveState(state);

  // Write a tripwire report if anything fired
  if (tripwires.length > 0) {
    writeTripwireReport({ tripwires, explainedDrifts, snapshot: newSnap });
  }

  return { tripwires, explainedDrifts, snapshot: newSnap };
}

function writeTripwireReport({ tripwires, explainedDrifts, snapshot }) {
  const date = new Date().toISOString().slice(0, 10);
  const path = join(REPORT_DIR, `drift-tripwire-${date}.md`);
  const banner = `# Metric drift tripwire — ${snapshot.ts}\n\n` +
    `Context: ${snapshot.context}\n` +
    `Threshold: ±${(DRIFT_THRESHOLD * 100).toFixed(0)}% over last ${LOOKBACK_HOURS}h.\n\n`;
  const tripwireBlock = tripwires.map(t =>
    `## TRIPWIRE: ${t.metric}\n` +
    `- prior: ${t.prior_value} @ ${t.prior_ts}\n` +
    `- current: ${t.current_value} @ ${t.current_ts}\n` +
    `- drift: ${(t.drift_pct * 100).toFixed(1)}%\n` +
    `- source_data_hash unchanged (${t.current_source_hash})  ← UNEXPLAINED\n` +
    `- escalation: GAMMA truth-audit skill should investigate.\n\n`
  ).join('');
  const explainedBlock = explainedDrifts.length ? `## Explained drifts (source data changed)\n` +
    explainedDrifts.map(t =>
      `- ${t.metric}: ${t.prior_value} → ${t.current_value} (${(t.drift_pct * 100).toFixed(1)}%); source hash ${t.prior_source_hash} → ${t.current_source_hash}\n`
    ).join('') : '';
  appendFileSync(path, banner + tripwireBlock + explainedBlock + '\n', 'utf8');
}

/**
 * Convenience: build a `metrics` snapshot map from current dashboard state.
 * Reads:
 *   - data/apply-now-queue.json (averages alignment/interview/hmNoticing across rows)
 *   - data/network-database.json (recruiter pipeline density approx via warm-paths)
 *   - data/company-toxicity-cache/* (composite avg)
 *
 * source_data_hash is computed from the file mtimes — if any source file
 * changes, the hash changes.
 */
export function buildDashboardMetricsSnapshot() {
  const metrics = {};
  const queuePath = join(REPO_ROOT, 'data', 'apply-now-queue.json');
  const networkPath = join(REPO_ROOT, 'data', 'network-database.json');
  const toxDir = join(REPO_ROOT, 'data', 'company-toxicity-cache');

  if (existsSync(queuePath)) {
    try {
      const q = JSON.parse(readFileSync(queuePath, 'utf8'));
      const rows = Array.isArray(q) ? q : (q.rows || q.ranked || []);
      // apply-now-queue.json has factors.base_fit (proxy for alignment) and
      // composite (overall score). We treat these as our alignment + interview-
      // likelihood proxies until the dashboard exports them explicitly.
      const align = avg(rows.map(r => num(r?.alignment ?? r?.scores?.alignment ?? r?.factors?.base_fit)));
      const interview = avg(rows.map(r => num(r?.interview ?? r?.scores?.interview ?? r?.composite)));
      const hm = avg(rows.map(r => num(r?.hmNoticing ?? r?.scores?.hmNoticing ?? r?.scores?.hm_noticing ?? r?.factors?.tier_match)));
      const stat = statSync(queuePath);
      const hash = hashStr(`${stat.size}:${stat.mtime.toISOString()}`);
      if (align !== null) metrics.profile_alignment = { value: align, source_data_hash: hash };
      if (interview !== null) metrics.interview_likelihood = { value: interview, source_data_hash: hash };
      if (hm !== null) metrics.hm_sees_you_pct = { value: hm, source_data_hash: hash };
    } catch { /* skip */ }
  }

  if (existsSync(networkPath)) {
    try {
      const n = JSON.parse(readFileSync(networkPath, 'utf8'));
      const warmPaths = Array.isArray(n?.warm_path_index)
        ? n.warm_path_index.length
        : (typeof n?.headline?.warm_to_apply_now === 'number' ? n.headline.warm_to_apply_now : null);
      const stat = statSync(networkPath);
      const hash = hashStr(`${stat.size}:${stat.mtime.toISOString()}`);
      if (warmPaths !== null) metrics.recruiter_pipeline_density = { value: warmPaths, source_data_hash: hash };
    } catch { /* skip */ }
  }

  if (existsSync(toxDir)) {
    try {
      const entries = readdirSync(toxDir).filter(f => f.endsWith('.json'));
      let total = 0, n = 0, agg = '';
      for (const f of entries) {
        try {
          const p = join(toxDir, f);
          const j = JSON.parse(readFileSync(p, 'utf8'));
          if (typeof j.composite_score === 'number') { total += j.composite_score; n++; }
          agg += statSync(p).mtime.toISOString();
        } catch { /* skip */ }
      }
      if (n > 0) metrics.toxicity_composite = { value: total / n, source_data_hash: hashStr(agg) };
    } catch { /* skip */ }
  }

  return metrics;
}

function avg(arr) {
  const xs = arr.filter(v => typeof v === 'number' && Number.isFinite(v));
  if (!xs.length) return null;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function num(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// CLI:
//   node lib/metric-drift-tripwire.mjs --snapshot
//   node lib/metric-drift-tripwire.mjs --check
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--snapshot' || argv[0] === '--check') {
    const metrics = buildDashboardMetricsSnapshot();
    const r = recordAndCheck({ context: argv[0] === '--check' ? 'cli:check' : 'cli:snapshot', metrics });
    console.log(JSON.stringify(r, null, 2));
    if (r.tripwires.length > 0) process.exit(2);
  } else {
    console.log('usage: --snapshot | --check');
  }
}
