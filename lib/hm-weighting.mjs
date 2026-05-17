// lib/hm-weighting.mjs — Deterministic HM-intel bullet scoring layer.
//
// Implements the HM Feature-Weight Vector formula (finding #47 of
// data/output-pipeline-strategy-2026-05-17.md):
//
//   Score(b_i) = α·SIM_semantic + β·HM_bias − γ·AI_risk
//
// α=0.6  β=0.3  γ=0.1  (see data/hm-intel/_weights.json for all parameters)
//
// This is PURE DETERMINISTIC MATH — no LLM calls, no network I/O.
// The output is a structured preamble injected into the LLM prompt BEFORE
// the model sees the bullet list, so the ranking is never vague or
// instruction-dependent.
//
// v1 note: SIM_semantic is a 0.5 stub until real embeddings land
// (bge-small-en-v1.5 or similar — a future commit per finding #18 of the
// strategy doc). Callers that have pre-computed cosine similarity can pass
// it via bullet._precomputed_sim.
//
// Wiring into cv-tailor live-mode is Tier B #8 — NOT this commit.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadWeights() {
  const path = join(ROOT, 'data', 'hm-intel', '_weights.json');
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// Module-level weight cache — loaded once per process.
let _weightsCache = null;
function getWeights() {
  if (!_weightsCache) _weightsCache = loadWeights();
  return _weightsCache;
}

/**
 * Compute a deterministic score for a single bullet.
 * Score = α·SIM_semantic + β·HM_bias − γ·AI_risk
 *
 * @param {Object} bullet
 *   - text {string}                    — bullet prose
 *   - tags {string[]}                  — optional; 'cross_functional', 'role:X', 'company:X', etc.
 *   - metric_density {number}          — optional; 0–1 ratio of metric tokens in text
 *   - ai_risk {number}                 — optional; 0–100 output of scripts/humanize-check.mjs
 *   - cv_ref {string}                  — optional; e.g. "cv.md:L42" for LLM preamble attribution
 *   - _precomputed_sim {number}        — optional; pass computed cosine similarity (0–1) to bypass stub
 *
 * @param {Object} hmIntel
 *   - top_third_priority_keywords {string[]}  — terms strongly associated with HM's stated priorities
 *   - anti_jargon_keywords {string[]}         — terms the HM profile flags as red-flags / filler
 *   - cross_functional_preference {number}    — reserved; presence handled via bullet.tags
 *
 * @param {Object} jdMeta
 *   - semantic_signature {number[]}           — reserved for future embedding comparison
 *
 * @param {Object} [opts]
 *   - weights {Object}   — override the JSON-loaded weights (useful in tests)
 *
 * @returns {{ score: number, breakdown: { sim: number, hm_bias: number, ai_risk: number, alpha: number, beta: number, gamma: number } }}
 */
export function scoreBullet(bullet, hmIntel = {}, jdMeta = {}, opts = {}) {
  const w = opts.weights || getWeights();

  // 1. SIM_semantic — deterministic stub: 0.5 unless caller passes precomputed similarity.
  //    Real embedding-based similarity (finding #18) is a future commit.
  const sim = typeof bullet._precomputed_sim === 'number' ? bullet._precomputed_sim : 0.5;

  // 2. HM_bias — derived from hmIntel signals against the bullet's text, tags, and density.
  //    Each positive signal nudges the score up; jargon presence nudges it down.
  let hm_bias = 0;
  const text = String(bullet.text || '').toLowerCase();
  const tags = bullet.tags || [];
  const fw = w.feature_weights;

  // Keyword match: top_third priority terms in bullet text
  for (const kw of (hmIntel.top_third_priority_keywords || [])) {
    if (text.includes(String(kw).toLowerCase())) {
      hm_bias += fw.top_third_importance.cv_bullet_weight * 0.1;
    }
  }

  // Cross-functional tag presence
  if (tags.includes('cross_functional')) {
    hm_bias += fw.cross_functional_bias.story_cross_func_weight * 0.1;
  }

  // Metric density meets or exceeds the target
  if (typeof bullet.metric_density === 'number' && bullet.metric_density >= fw.metrics_focus.metric_density_target) {
    hm_bias += 0.1;
  }

  // Anti-jargon penalty
  for (const j of (hmIntel.anti_jargon_keywords || [])) {
    if (text.includes(String(j).toLowerCase())) {
      hm_bias -= fw.anti_jargon.max_jargon_score * 0.5;
    }
  }

  // Clamp hm_bias to [-1, 1] before applying beta weight
  hm_bias = Math.max(-1, Math.min(1, hm_bias));

  // 3. AI_risk — from bullet.ai_risk (humanize-check.mjs returns 0–100; normalize to 0–1).
  const ai_risk = typeof bullet.ai_risk === 'number' ? bullet.ai_risk / 100 : 0;

  const score = w.alpha_sim_semantic * sim + w.beta_hm_bias * hm_bias - w.gamma_ai_risk * ai_risk;

  return {
    score,
    breakdown: {
      sim,
      hm_bias,
      ai_risk,
      alpha: w.alpha_sim_semantic,
      beta: w.beta_hm_bias,
      gamma: w.gamma_ai_risk,
    },
  };
}

/**
 * Score and rank a list of bullets, returning top-N by score with diversity preservation.
 * The diversity pass prevents two bullets sharing the same role/company tag from both
 * landing in the top-N when there are alternatives with distinct tags available.
 *
 * @param {Object[]} bullets — array of bullet objects (see scoreBullet signature)
 * @param {Object}   hmIntel
 * @param {Object}   jdMeta
 * @param {Object}   [opts]
 *   - topN {number=5}                       — maximum bullets to return
 *   - enforceRoleDiversity {boolean=true}   — deduplicate by role/company tag
 *   - weights {Object}                      — override JSON-loaded weights
 * @returns {Object[]} sorted descending by score, each item spread-merged with { score, breakdown }
 */
export function scoreAndRankBullets(bullets, hmIntel = {}, jdMeta = {}, opts = {}) {
  const topN = opts.topN ?? 5;
  const enforceRoleDiversity = opts.enforceRoleDiversity !== false;

  const scored = bullets.map(b => {
    const { score, breakdown } = scoreBullet(b, hmIntel, jdMeta, opts);
    return { ...b, score, breakdown };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  if (!enforceRoleDiversity) return scored.slice(0, topN);

  // Diversity pass: allow one bullet per role/company key before repeating
  const out = [];
  const usedRoleKeys = new Set();

  for (const b of scored) {
    const roleKey = (b.tags || []).find(t => t.startsWith('role:') || t.startsWith('company:')) || '';
    if (!usedRoleKeys.has(roleKey)) {
      out.push(b);
      usedRoleKeys.add(roleKey);
    }
    if (out.length >= topN) break;
  }

  // If we couldn't fill topN with diverse bullets, backfill from remaining scored items
  if (out.length < topN) {
    for (const b of scored) {
      if (!out.includes(b)) out.push(b);
      if (out.length >= topN) break;
    }
  }

  return out.slice(0, topN);
}

/**
 * Build the structured preamble injected into an LLM prompt BEFORE the bullet list.
 * The preamble communicates the deterministic ranking to the model so it does not
 * re-rank, substitute, or deprioritize these bullets based on its own priors.
 *
 * @param {Object[]} rankedBullets — output of scoreAndRankBullets
 * @returns {string} markdown-formatted preamble block
 */
export function buildLlmPreamble(rankedBullets) {
  const lines = [
    '## Top deterministically-ranked bullets (score ↓, do not reorder):',
    '',
  ];

  for (const b of rankedBullets) {
    const ref = b.cv_ref ? ` [${b.cv_ref}]` : '';
    const bd = b.breakdown;
    lines.push(
      `- ${b.text}${ref}  — score ${b.score.toFixed(3)}` +
      ` (sim=${bd.sim.toFixed(2)}, hm=${bd.hm_bias.toFixed(2)}, risk=${bd.ai_risk.toFixed(2)})`
    );
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Self-test block — runs only when this file is invoked directly:
//   node lib/hm-weighting.mjs
// ---------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const hmIntel = {
    top_third_priority_keywords: ['shipped', 'launched', 'reduced'],
    anti_jargon_keywords: ['synergy', 'leverage'],
  };

  const bullets = [
    { text: 'Shipped inference pipeline cutting p99 latency 40%', tags: ['role:anthropic'], metric_density: 0.8, ai_risk: 5 },
    { text: 'Led cross-functional initiative across 6 teams', tags: ['cross_functional', 'role:openai'], metric_density: 0.3, ai_risk: 10 },
    { text: 'Leveraged synergy to drive alignment', tags: [], metric_density: 0.0, ai_risk: 60 },
    { text: 'Launched developer-facing API used by 2K+ teams', tags: ['role:google'], metric_density: 0.9, ai_risk: 8 },
    { text: 'Reduced annual infra cost by $1.2M', tags: ['role:amazon'], metric_density: 0.85, ai_risk: 3 },
    { text: 'Coordinated with design team on UX refresh', tags: ['company:acme'], metric_density: 0.1, ai_risk: 20 },
  ];

  const ranked = scoreAndRankBullets(bullets, hmIntel, {}, { topN: 4 });
  console.log('Ranked top-4 bullets:');
  console.log(JSON.stringify(ranked.map(b => ({ text: b.text, score: b.score.toFixed(3) })), null, 2));
  console.log('\nLLM Preamble:');
  console.log(buildLlmPreamble(ranked));
}
