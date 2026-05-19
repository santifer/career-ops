#!/usr/bin/env node
/**
 * scripts/recalibrate-cost-decomp.mjs — Re-calibrate the 5 cost-decomp
 * constants in dashboard-server.mjs from current real data + emit a report.
 *
 * γ GAMMA 2026-05-19 — built so the next audit doesn't have to re-derive
 * these numbers from scratch. Outputs a structured JSON suggestion the
 * operator can paste into dashboard-server.mjs:378-470 (or env vars).
 *
 * Usage:
 *   node scripts/recalibrate-cost-decomp.mjs              # print suggested constants
 *   node scripts/recalibrate-cost-decomp.mjs --json       # JSON-only output
 *   node scripts/recalibrate-cost-decomp.mjs --apply      # NOT IMPLEMENTED (NEEDS_HUMAN)
 *
 * Inputs:
 *   - data/applications.md             → real publish rate (score ≥ 4.0)
 *   - data/apply-now-queue.json        → queue size
 *   - data/hm-intel/*.json             → cached researcher results
 *   - data/cost-log.tsv                → observed researcher + dealbreaker costs
 *   - data/company-intel-cache/*       → council cache freshness
 *   - scripts/hiring-manager-research.mjs:COST_ESTIMATE  → researcher per-call ceiling
 *
 * Outputs JSON shape:
 *   {
 *     suggestions: {
 *       PUBLISH_RATE_ESTIMATE:      { value, source, confidence, sample_size },
 *       COST_PER_RESEARCHER_CALL:   { value, source, confidence, sample_size },
 *       COST_PER_DEALBREAKER_CALL:  { value, source, confidence, sample_size },
 *       RESEARCHER_ENRICHMENT_RATE: { value, source, confidence, sample_size },
 *       THRESHOLD_FOR_PUBLISH:      { value, source, confidence, sample_size },
 *     },
 *     current_constants: { ... },
 *     drift: { ... }    // delta between current + calibrated
 *   }
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARGS = new Set(process.argv.slice(2));
const JSON_ONLY = ARGS.has('--json');

// ── Current constants (mirror of dashboard-server.mjs:378-470) ────────────
// γ GAMMA 2026-05-19: COST_PER_RESEARCHER_CALL default corrected to $3 after
// hallucination self-discovery (see data/agent-hallucination-log.md).
const CURRENT = {
  PUBLISH_RATE_ESTIMATE:      parseFloat(process.env.PUBLISH_RATE_ESTIMATE      || '0.22'),
  COST_PER_RESEARCHER_CALL:   parseFloat(process.env.COST_PER_RESEARCHER_CALL_USD  || '3.00'),
  COST_PER_DEALBREAKER_CALL:  parseFloat(process.env.COST_PER_DEALBREAKER_CALL_USD || '0.30'),
  RESEARCHER_ENRICHMENT_RATE: parseFloat(process.env.RESEARCHER_ENRICHMENT_RATE || '0.19'),
  THRESHOLD_FOR_PUBLISH:      parseFloat(process.env.THRESHOLD_FOR_PUBLISH      || '4.0'),
};

// ── 1. Real publish rate from applications.md ──────────────────────────────
function calibratePublishRate() {
  const fp = join(ROOT, 'data/applications.md');
  if (!existsSync(fp)) {
    return { value: null, source: 'data/applications.md MISSING', confidence: 'UNCAL', sample_size: 0 };
  }
  const lines = readFileSync(fp, 'utf-8').split('\n');
  let total = 0, publish = 0;
  for (const l of lines) {
    if (!l.startsWith('|')) continue;
    const cols = l.split('|').map(s => s.trim());
    // Tracker schema: | # | Date | Company | Role | Score | Status | ...
    // Score is column index 5 (after split with empty first/last cells)
    if (cols.length < 8) continue;
    const scoreCell = cols[5];
    const m = scoreCell.match(/^([0-9]+\.?[0-9]*)/);
    if (!m) continue;
    const score = parseFloat(m[1]);
    if (!Number.isFinite(score)) continue;
    total++;
    if (score >= 4.0) publish++;
  }
  if (total === 0) {
    return { value: null, source: 'data/applications.md (no scored rows)', confidence: 'UNCAL', sample_size: 0 };
  }
  return {
    value: Math.round((publish / total) * 1000) / 1000,
    source: `data/applications.md (${publish} of ${total} scored rows ≥ 4.0)`,
    confidence: total >= 100 ? 'HIGH' : (total >= 30 ? 'MED' : 'LOW'),
    sample_size: total,
  };
}

// ── 2. Researcher per-call — REAL evidence path ────────────────────────────
// γ GAMMA 2026-05-19 (post-hallucination correction): the original audit cited
// scripts/hiring-manager-research.mjs which does NOT exist. The real path is
// lib/hm-intel-research.mjs:335 setting budgetUsd default = 3, AND
// data/cost-log.tsv showing N=2 observed runs at mean $0.625.
function calibrateResearcherCost() {
  // 1. Read the budget cap from lib/hm-intel-research.mjs
  const fp = join(ROOT, 'lib/hm-intel-research.mjs');
  let budgetCap = null;
  if (existsSync(fp)) {
    const src = readFileSync(fp, 'utf-8');
    const m = src.match(/budgetUsd\s*=\s*([0-9.]+)/);
    if (m) budgetCap = parseFloat(m[1]);
  }
  // 2. Read observed researcher cost from cost-log
  const costFp = join(ROOT, 'data/cost-log.tsv');
  let observedSum = 0, observedN = 0;
  if (existsSync(costFp)) {
    const lines = readFileSync(costFp, 'utf-8').split('\n');
    for (const l of lines) {
      if (!l.toLowerCase().includes('researcher')) continue;
      const cols = l.split('\t');
      let cost;
      if (cols.length >= 9) cost = parseFloat(cols[7]);
      else if (cols.length >= 4) cost = parseFloat(cols[2]);
      else continue;
      if (Number.isFinite(cost)) { observedSum += cost; observedN++; }
    }
  }
  const observedMean = observedN > 0 ? observedSum / observedN : null;
  // Pick the more conservative of (budget cap, 2x observed mean).
  // If both unknown → return null.
  if (budgetCap == null && observedMean == null) {
    return { value: null, source: 'no real evidence available', confidence: 'UNCAL', sample_size: 0 };
  }
  const conservative = (budgetCap != null && observedMean != null)
    ? Math.max(budgetCap, observedMean * 2)
    : (budgetCap != null ? budgetCap : observedMean * 2);
  return {
    value: Math.round(conservative * 100) / 100,
    source: `lib/hm-intel-research.mjs (budgetUsd=${budgetCap ?? 'unknown'}) + data/cost-log.tsv (N=${observedN} obs mean ${observedMean != null ? '$' + observedMean.toFixed(2) : 'n/a'})`,
    confidence: observedN >= 10 ? 'HIGH' : (observedN >= 3 ? 'MED' : 'LOW'),
    sample_size: observedN,
    observed_mean: observedMean != null ? Math.round(observedMean * 100) / 100 : null,
    budget_cap: budgetCap,
  };
}

// ── 3. Dealbreaker observed mean from cost-log.tsv ─────────────────────────
function calibrateDealbreakerCost() {
  const fp = join(ROOT, 'data/cost-log.tsv');
  if (!existsSync(fp)) {
    return { value: null, source: 'data/cost-log.tsv MISSING', confidence: 'UNCAL', sample_size: 0 };
  }
  const lines = readFileSync(fp, 'utf-8').split('\n');
  let sum = 0, n = 0;
  for (const l of lines) {
    if (!l.includes('dealbreaker')) continue;
    const cols = l.split('\t');
    // Long format: date, batch_id, requests, in, out, cache_r, cache_w, cost, model
    // Short format: date, ts, cost, label  → if cols.length < 9
    let cost;
    if (cols.length >= 9) cost = parseFloat(cols[7]);
    else if (cols.length >= 4) cost = parseFloat(cols[2]);
    else continue;
    if (Number.isFinite(cost)) { sum += cost; n++; }
  }
  if (n === 0) {
    return { value: null, source: 'data/cost-log.tsv (no dealbreaker rows)', confidence: 'UNCAL', sample_size: 0 };
  }
  const mean = sum / n;
  // Add a 20% buffer like prior calibration
  return {
    value: Math.round(mean * 1.2 * 100) / 100,
    source: `data/cost-log.tsv (observed mean N=${n}, +20% buffer)`,
    confidence: n >= 10 ? 'HIGH' : (n >= 3 ? 'MED' : 'LOW'),
    sample_size: n,
    observed_mean: Math.round(mean * 100) / 100,
  };
}

// ── 4. Researcher enrichment rate: uncached-in-queue ratio ─────────────────
function calibrateResearcherEnrichmentRate() {
  const apqFp  = join(ROOT, 'data/apply-now-queue.json');
  const intelDir = join(ROOT, 'data/hm-intel');
  if (!existsSync(apqFp) || !existsSync(intelDir)) {
    return { value: null, source: 'apply-now-queue.json or hm-intel/ MISSING', confidence: 'UNCAL', sample_size: 0 };
  }
  let queue;
  try { queue = JSON.parse(readFileSync(apqFp, 'utf-8')); }
  catch (e) { return { value: null, source: `apply-now-queue.json parse error: ${e.message}`, confidence: 'UNCAL', sample_size: 0 }; }
  const queueSize = (queue.ranked || []).length;
  if (queueSize === 0) {
    return { value: null, source: 'apply-now-queue.json empty', confidence: 'UNCAL', sample_size: 0 };
  }
  let cached = 0;
  try {
    const files = readdirSync(intelDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    cached = files.length;
  } catch (_) {}
  const uncachedRatio = Math.max(0, queueSize - cached) / queueSize;
  return {
    value: Math.round(uncachedRatio * 1000) / 1000,
    source: `data/apply-now-queue.json (${queueSize} roles) vs data/hm-intel/*.json (${cached} cached)`,
    confidence: queueSize >= 30 ? 'HIGH' : (queueSize >= 10 ? 'MED' : 'LOW'),
    sample_size: queueSize,
  };
}

// ── 5. Threshold for publish: verified against real code ───────────────────
function calibratePublishThreshold() {
  // Verify the code actually uses 4.0 in the canonical funnel-completion path.
  const fp = join(ROOT, 'lib/funnel-completion.mjs');
  if (!existsSync(fp)) {
    return { value: 4.0, source: 'lib/funnel-completion.mjs MISSING — assuming 4.0', confidence: 'LOW', sample_size: 0 };
  }
  const src = readFileSync(fp, 'utf-8');
  const m = src.match(/scoreThreshold\s*=\s*opts\.scoreThreshold\s*\?\?\s*([0-9.]+)/);
  if (!m) {
    return { value: 4.0, source: 'lib/funnel-completion.mjs (default not parseable, assuming 4.0)', confidence: 'LOW', sample_size: 0 };
  }
  return {
    value: parseFloat(m[1]),
    source: `lib/funnel-completion.mjs:128 (scoreThreshold default ${m[1]})`,
    confidence: 'HIGH',
    sample_size: null,
  };
}

// ── Compose ────────────────────────────────────────────────────────────────
const suggestions = {
  PUBLISH_RATE_ESTIMATE:      calibratePublishRate(),
  COST_PER_RESEARCHER_CALL:   calibrateResearcherCost(),
  COST_PER_DEALBREAKER_CALL:  calibrateDealbreakerCost(),
  RESEARCHER_ENRICHMENT_RATE: calibrateResearcherEnrichmentRate(),
  THRESHOLD_FOR_PUBLISH:      calibratePublishThreshold(),
};

const drift = {};
for (const [k, s] of Object.entries(suggestions)) {
  if (s.value == null) { drift[k] = { current: CURRENT[k], suggested: null, drift_pct: null }; continue; }
  const cur = CURRENT[k];
  drift[k] = {
    current: cur,
    suggested: s.value,
    drift_pct: cur !== 0 ? Math.round(((s.value - cur) / cur) * 1000) / 10 : null,
  };
}

const out = {
  generated_at: new Date().toISOString(),
  suggestions,
  current_constants: CURRENT,
  drift,
};

if (JSON_ONLY) {
  process.stdout.write(JSON.stringify(out, null, 2));
} else {
  console.log('# Cost-Decomp Re-Calibration Suggestions');
  console.log(`# Generated: ${out.generated_at}`);
  console.log('');
  for (const [k, s] of Object.entries(suggestions)) {
    const d = drift[k];
    console.log(`### ${k}`);
    console.log(`  current:    ${d.current}`);
    console.log(`  suggested:  ${s.value ?? 'UNCAL'}`);
    if (d.drift_pct != null) console.log(`  drift:      ${d.drift_pct >= 0 ? '+' : ''}${d.drift_pct}%`);
    console.log(`  source:     ${s.source}`);
    console.log(`  confidence: ${s.confidence}  (N=${s.sample_size ?? 'n/a'})`);
    if (s.note) console.log(`  note:       ${s.note}`);
    if (s.observed_mean != null) console.log(`  observed_mean: ${s.observed_mean}`);
    if (s.expected_mean_value != null) console.log(`  expected_mean: ${s.expected_mean_value}`);
    console.log('');
  }
}
