/**
 * lib/refresh-priority.mjs — Classify apply-now rows into priority tiers
 * A (Watch list) / B (Active queue) / C (Tracked) / D (Cold storage).
 *
 * Reads:  config/refresh-policy.yml  (knobs)
 *         data/apply-now-queue.json  (rows + scores)
 *         data/applications.md       (for status overrides; lightweight parse)
 *
 * Returns: [{ ...row, tier, effectiveScore, classificationReason }]
 *
 * Used by: scripts/refresh-master.mjs to decide which rows get refreshed at
 * what cadence in Layer 2/3.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

/**
 * Minimal YAML reader — only handles the subset of YAML we use in
 * config/refresh-policy.yml (scalars, nested objects, lists, comments,
 * inline booleans/numbers). Avoids pulling in a yaml dependency.
 */
function readPolicy() {
  const policyPath = join(REPO_ROOT, 'config', 'refresh-policy.yml');
  if (!existsSync(policyPath)) {
    throw new Error(`refresh-policy.yml not found at ${policyPath}`);
  }
  return parseSimpleYaml(readFileSync(policyPath, 'utf8'));
}

function parseSimpleYaml(text) {
  // Minimal parser: enough for our flat-ish nested-key/value structure.
  // Handles: # comments, key: value, key: (nested block), - list items,
  // strings (quoted + unquoted), booleans, numbers, nulls.
  const lines = text.split('\n');
  const root = {};
  const stack = [{ indent: -1, obj: root, key: null }];

  for (let raw of lines) {
    // strip inline comments and trailing whitespace
    const hashIdx = (() => {
      // don't strip inside quoted strings — keep it simple, scan for # not in quotes
      let inQ = null;
      for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (inQ) { if (c === inQ && raw[i-1] !== '\\') inQ = null; continue; }
        if (c === '"' || c === "'") { inQ = c; continue; }
        if (c === '#') return i;
      }
      return -1;
    })();
    if (hashIdx >= 0) raw = raw.slice(0, hashIdx);
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const indent = line.match(/^( *)/)[1].length;
    const content = line.slice(indent);

    // pop stack until parent indent < current indent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].obj;

    // List item
    if (content.startsWith('- ')) {
      const val = parseScalar(content.slice(2).trim());
      if (!Array.isArray(parent[stack[stack.length - 1].lastKey])) {
        parent[stack[stack.length - 1].lastKey] = [];
      }
      parent[stack[stack.length - 1].lastKey].push(val);
      continue;
    }

    // key: value or key:
    const m = content.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const valRaw = m[2];
    if (valRaw === '' || valRaw === undefined) {
      // nested object incoming
      parent[key] = {};
      stack[stack.length - 1].lastKey = key;
      stack.push({ indent, obj: parent[key], key });
    } else {
      parent[key] = parseScalar(valRaw);
      stack[stack.length - 1].lastKey = key;
    }
  }
  return root;
}

function parseScalar(s) {
  s = s.trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~' || s === '') return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  // strip surrounding quotes
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Heuristic to detect a pre-IPO equity-stage row from the apply-now data.
 * The apply-now row carries `factors` which often includes equity_stage
 * hints + a parsed equity tag like "Pre-IPO Late", "Pre-IPO C/D", etc.
 * If we can't detect, return false (no boost).
 */
function isPreIpoRow(row) {
  const haystack = JSON.stringify(row.factors || {}).toLowerCase()
    + ' ' + String(row.notes_summary || '').toLowerCase();
  // Anything Pre-IPO Series A/B/C/D/Late counts; explicit "ipo'd" / "public" / "post-ipo" don't.
  if (/post[-\s]?ipo|publicly[-\s]?traded|nasdaq|nyse[:\s]/i.test(haystack)) return false;
  return /pre[-\s]?ipo|series\s*[abcd]|seed/i.test(haystack);
}

/**
 * Classify a single row into a tier.
 * Returns: { tier: 'A'|'B'|'C'|'D', effectiveScore, reason }
 */
export function classifyRow(row, policy) {
  const status = (row.status || 'Evaluated').trim();
  const tiers = policy.priority_tiers || {};
  const watchN = tiers.watch_list_size || 5;
  const activeMax = tiers.active_queue_max_rank || 15;
  const trackedMax = tiers.tracked_max_rank || 30;
  const statusBoosts = tiers.status_boosts || {};
  const equityBoost = tiers.pre_ipo_equity_weighting || 1.0;

  const statusBoost = statusBoosts[status] != null ? statusBoosts[status] : 1.0;
  const equityMult = isPreIpoRow(row) ? equityBoost : 1.0;

  // Force tier D if status zeroes it out
  if (statusBoost === 0) {
    return { tier: 'D', effectiveScore: 0, reason: `status=${status}` };
  }

  // Force tier A if status boost is high (Interview / Offer)
  if (statusBoost >= 3.0) {
    return { tier: 'A', effectiveScore: (row.composite || 0) * statusBoost, reason: `status=${status} (force-A)` };
  }

  // Effective rank-equivalent: lower number = higher priority
  // Boost applied to composite; we use composite for tier ranking, rank as a tiebreaker.
  const baseScore = row.composite || row.eval_score || 0;
  const effectiveScore = baseScore * equityMult * statusBoost;

  // For tier classification we compare against the original `rank` adjusted
  // by the boost. The orchestrator does a second-pass re-rank by effectiveScore
  // and assigns Watch-list spots to the top-N.
  return {
    tier: 'PENDING',  // assigned after second-pass re-rank
    effectiveScore,
    reason: `composite=${baseScore.toFixed(2)} × equity=${equityMult.toFixed(2)} × status=${statusBoost.toFixed(2)}`,
  };
}

/**
 * Main entry: classify ALL apply-now rows. Two passes:
 *   1. Compute effectiveScore per row (factoring equity + status boosts)
 *   2. Re-rank by effectiveScore; assign A/B/C/D by configured tier sizes
 */
export function classifyAllRows(opts = {}) {
  const policy = opts.policy || readPolicy();
  const queuePath = opts.queuePath || join(REPO_ROOT, 'data', 'apply-now-queue.json');

  if (!existsSync(queuePath)) {
    throw new Error(`apply-now-queue.json not found at ${queuePath}`);
  }
  const queue = JSON.parse(readFileSync(queuePath, 'utf8'));
  const rows = Array.isArray(queue.ranked) ? queue.ranked : [];

  const tiers = policy.priority_tiers || {};
  const watchN = tiers.watch_list_size || 5;
  const activeMax = tiers.active_queue_max_rank || 15;
  const trackedMax = tiers.tracked_max_rank || 30;

  // Pass 1: compute effective scores
  const classified = rows.map(row => {
    const c = classifyRow(row, policy);
    return { ...row, _classification: c };
  });

  // Pass 2: separate forced-A and forced-D rows from the "ranked by effective score" pool
  const forcedA = classified.filter(r => r._classification.tier === 'A');
  const forcedD = classified.filter(r => r._classification.tier === 'D');
  const pool = classified.filter(r => r._classification.tier === 'PENDING')
    .sort((a, b) => b._classification.effectiveScore - a._classification.effectiveScore);

  // Assign tiers from the pool, leaving room for forced-A rows already claimed
  const watchRemaining = Math.max(0, watchN - forcedA.length);
  for (let i = 0; i < pool.length; i++) {
    const r = pool[i];
    const effectiveRank = i + 1;  // rank within the pool, 1-indexed
    if (i < watchRemaining) {
      r._classification.tier = 'A';
      r._classification.reason += ' | tier=A (effectiveRank ' + effectiveRank + ' ≤ ' + watchRemaining + ')';
    } else if (effectiveRank <= activeMax) {
      r._classification.tier = 'B';
      r._classification.reason += ' | tier=B (effectiveRank ' + effectiveRank + ' ≤ ' + activeMax + ')';
    } else if (effectiveRank <= trackedMax) {
      r._classification.tier = 'C';
      r._classification.reason += ' | tier=C (effectiveRank ' + effectiveRank + ' ≤ ' + trackedMax + ')';
    } else {
      r._classification.tier = 'D';
      r._classification.reason += ' | tier=D (effectiveRank ' + effectiveRank + ' > ' + trackedMax + ')';
    }
  }

  return {
    rows: [...forcedA, ...pool, ...forcedD],
    counts: {
      A: classified.filter(r => r._classification.tier === 'A').length,
      B: classified.filter(r => r._classification.tier === 'B').length,
      C: classified.filter(r => r._classification.tier === 'C').length,
      D: classified.filter(r => r._classification.tier === 'D').length,
    },
    policy,
  };
}

// CLI smoke test: `node lib/refresh-priority.mjs` prints classification summary.
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = classifyAllRows();
  console.log('Tier counts:', result.counts);
  console.log('\nFirst 10 classifications:');
  for (const r of result.rows.slice(0, 10)) {
    console.log(`  ${r._classification.tier} · rank=${r.rank} · ${r.company} ${r.role.slice(0, 40)} · ${r._classification.reason}`);
  }
}
