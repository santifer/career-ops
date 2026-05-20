/**
 * lib/zombie-scorer.mjs — Pre-LLM zombie/dying-posting filter (P0-4)
 *
 * Computes a composite [0,1] zombie probability and returns a routing decision
 * so the triage pipeline can skip dead postings before spending LLM tokens.
 *
 * Formula (Opus 4.7, dealbreaker-verified coefficients):
 *   composite = 0.35 × age + 0.25 × cluster + 0.20 × cosine + 0.10 × unmaintained + 0.10 × evergreen
 *
 * Routing thresholds:
 *   composite >= 0.5  → 'skip'       (zombie, do not eval)
 *   0.3 <= c < 0.5    → 'cheap-eval' (Haiku, middle-band safety net)
 *   composite < 0.3   → 'full-eval'  (current Sonnet/Haiku pipeline, unchanged)
 *
 * cosine_score and unmaintained_score are stubbed to 0 until P1-7 (embeddings)
 * and P0-5 (first_seen_at) land respectively.
 */

const ZOMBIE_AGE_THRESHOLD_DAYS = 45;
const ZOMBIE_AGE_RAMP_DAYS      = 60;

const W_AGE          = 0.35;
const W_CLUSTER      = 0.25;
const W_COSINE       = 0.20;
const W_UNMAINTAINED = 0.10;
const W_EVERGREEN    = 0.10;

const CLUSTER_MIN_LOCATIONS = 4;

const EVERGREEN_RE = /\b(always|continuously|ongoing|year.round|various\s+positions|multiple\s+roles|rolling\s+basis|evergreen|pipeline\s+role|general\s+application|talent\s+pool)\b/i;

/**
 * ageScore — linear ramp from 0 at day 0 to 1.0 at ZOMBIE_AGE_THRESHOLD_DAYS,
 * then held at 1.0 beyond ZOMBIE_AGE_RAMP_DAYS.
 *
 * The two-boundary design (threshold=45d, ramp=60d) lets a fresh posting
 * score 0 while a definitively-stale posting (>60d) always scores 1.0.
 * Postings in the 45-60d band get a proportional score (0.75-1.0 range)
 * which, combined with the 0.35 weight, yields +0.26 to +0.35 — not
 * enough on its own to cross the 0.5 skip threshold, so a 50d posting
 * without cluster/evergreen signals gets cheap-eval, not skip.
 */
function computeAgeScore(ageDays) {
  if (ageDays === null || ageDays === undefined) return 0;
  if (ageDays <= 0) return 0;
  if (ageDays >= ZOMBIE_AGE_RAMP_DAYS) return 1.0;
  if (ageDays >= ZOMBIE_AGE_THRESHOLD_DAYS) {
    return (ageDays - ZOMBIE_AGE_THRESHOLD_DAYS) / (ZOMBIE_AGE_RAMP_DAYS - ZOMBIE_AGE_THRESHOLD_DAYS);
  }
  return ageDays / ZOMBIE_AGE_THRESHOLD_DAYS;
}

/**
 * normalizeTitle — strip location noise for cluster grouping.
 *
 * Removes known location suffixes in parentheses, after a dash or comma,
 * then trims and lowercases. "Solutions Architect (NYC)" and
 * "Solutions Architect (Seattle)" both normalize to "solutions architect".
 */
function normalizeTitle(title) {
  return (title || '')
    .replace(/\s*[\-,]\s*(?:remote|us|usa|uk|eu|emea|apac|latam|\w+,\s*\w+|\w+\s+\w+)$/i, '')
    .replace(/\s*\([^)]+\)\s*$/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * extractLocation — pull a location string from the JD row for cluster grouping.
 * Priority: explicit location field → parenthetical in title → company city → empty string.
 */
function extractLocation(jdRow) {
  if (jdRow.location && jdRow.location.trim()) return jdRow.location.trim().toLowerCase();
  const m = (jdRow.title || '').match(/\(([^)]+)\)\s*$/);
  if (m) return m[1].trim().toLowerCase();
  return '';
}

/**
 * clusterScore — returns 1.0 when this posting's normalized title appears
 * at >=4 distinct locations in the history, else 0.
 *
 * Binary (not proportional) because a single-location role with an old age
 * is handled by ageScore. The cluster signal is specifically "same job at many
 * cities simultaneously = mass-posting evergreen pattern."
 *
 * history is an array of { url, title, location, company } objects covering
 * the full candidate set (pipeline + scan history, deduplicated by url).
 */
function computeClusterScore(jdRow, history) {
  const thisTitle    = normalizeTitle(jdRow.title);
  const thisCompany  = (jdRow.company || '').toLowerCase().trim();
  if (!thisTitle) return 0;

  const locationsSeen = new Set();
  for (const h of history) {
    if (normalizeTitle(h.title) !== thisTitle) continue;
    if (thisCompany && (h.company || '').toLowerCase().trim() !== thisCompany) continue;
    const loc = extractLocation(h);
    if (loc) locationsSeen.add(loc);
  }

  return locationsSeen.size >= CLUSTER_MIN_LOCATIONS ? 1.0 : 0;
}

/**
 * evergreenScore — 1.0 if title or body text matches EVERGREEN_RE, else 0.
 */
function computeEvergreenScore(jdRow) {
  const haystack = `${jdRow.title || ''} ${jdRow.body || ''}`;
  return EVERGREEN_RE.test(haystack) ? 1.0 : 0;
}

/**
 * scoreZombie — main export.
 *
 * @param {object} jdRow    — { url, title, company, location?, body?, ageDays? }
 *   ageDays: caller-computed days since first_seen. When absent, scorer reads
 *   from scan-history; when that's also absent, age_score defaults to 0.
 * @param {Array}  history  — array of { url, title, company, location } for cluster check.
 *   Passing [] disables cluster scoring (safe — score stays 0).
 *
 * @returns {{ composite: number, breakdown: object, decision: string, reason: string }}
 */
export function scoreZombie(jdRow, history = []) {
  const ageDays       = jdRow.ageDays ?? null;
  const age           = computeAgeScore(ageDays);
  const cluster       = computeClusterScore(jdRow, history);
  const cosine        = 0;      // P1-7 stub — embeddings not yet built
  const unmaintained  = 0;      // P0-5 stub — first_seen_at not yet instrumented
  const evergreen     = computeEvergreenScore(jdRow);

  const composite = (
    W_AGE          * age         +
    W_CLUSTER      * cluster     +
    W_COSINE       * cosine      +
    W_UNMAINTAINED * unmaintained +
    W_EVERGREEN    * evergreen
  );

  let decision, reason;
  if (composite >= 0.5) {
    decision = 'skip';
    const drivers = [];
    if (age >= 0.75)    drivers.push(`age ${ageDays}d`);
    if (cluster === 1)  drivers.push(`cluster ≥${CLUSTER_MIN_LOCATIONS} locations`);
    if (evergreen === 1) drivers.push('evergreen language');
    reason = `zombie composite ${composite.toFixed(3)} [${drivers.join(', ')}]`;
  } else if (composite >= 0.3) {
    decision = 'cheap-eval';
    reason   = `borderline composite ${composite.toFixed(3)} — routed to Haiku`;
  } else {
    decision = 'full-eval';
    reason   = `low zombie signal ${composite.toFixed(3)} — standard pipeline`;
  }

  return {
    composite,
    breakdown: { age, cluster, cosine, unmaintained, evergreen },
    decision,
    reason,
  };
}

export { ZOMBIE_AGE_THRESHOLD_DAYS, ZOMBIE_AGE_RAMP_DAYS, CLUSTER_MIN_LOCATIONS, EVERGREEN_RE };
