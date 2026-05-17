/**
 * lib/toxicity-scorer.mjs — Composite company-toxicity score (Phase 8).
 *
 * Per career calibration 2026-05-16: a flag-for-review, NEVER-auto-trash
 * metric that aggregates negative-signal inputs about a company and produces
 * a composite 0-100 score. High score = consider risk; LOW does NOT mean
 * "safe to apply" — it means "no negative signals surfaced yet."
 *
 * Inputs (all optional — score adapts to what's available):
 *   - Council intel sections (when council-of-models has been run on company)
 *   - data/toxicity-signals/{slug}.json (manual entries Mitchell or scrapers add)
 *   - data/linkedin/overrides.json notes (e.g., "left in Apr 2026 to start own thing")
 *
 * Signal categories and weights:
 *   layoffs_recent          (last 6 months)         weight 20
 *   leadership_exit_pattern (>2 senior departures)  weight 15
 *   hiring_freeze_signal                            weight 15
 *   glassdoor_low_score     (< 3.0 / 5.0)           weight 10
 *   short_tenure_pattern    (median < 18mo)         weight 10
 *   litigation_active                               weight 10
 *   funding_distress        (failed round, etc.)    weight 10
 *   public_scandal_recent                           weight 5
 *   x_employee_sentiment_negative                   weight 5
 *
 * Returns a JSON shape that the dashboard widget + heartbeat email can render
 * directly. NEVER returns "auto_trash: true" — even max score is flag-for-review.
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SIGNALS_DIR = join(ROOT, 'data/toxicity-signals');

const SIGNAL_WEIGHTS = {
  layoffs_recent:                20,
  leadership_exit_pattern:       15,
  hiring_freeze_signal:          15,
  glassdoor_low_score:           10,
  short_tenure_pattern:          10,
  litigation_active:             10,
  funding_distress:              10,
  public_scandal_recent:          5,
  x_employee_sentiment_negative:  5,
};

const VERDICT_THRESHOLDS = {
  clear:    { max:  9,   label: 'clear',       color: 'green',  emoji: '✅' },
  watch:    { max: 24,   label: 'watch',       color: 'yellow', emoji: '👁️' },
  caution:  { max: 49,   label: 'caution',     color: 'orange', emoji: '⚠️' },
  flag:     { max: 100,  label: 'FLAG-REVIEW', color: 'red',    emoji: '🚩' },
};

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function loadCompanySignals(slug) {
  const fp = join(SIGNALS_DIR, `${slug}.json`);
  if (!existsSync(fp)) return null;
  try { return JSON.parse(readFileSync(fp, 'utf-8')); }
  catch (e) {
    console.warn(`[toxicity-scorer] Failed to parse ${fp}: ${e.message}`);
    return null;
  }
}

/**
 * scoreToxicity(company, signals?) → composite score breakdown
 *
 * @param {string} company - company name (slugified for lookup)
 * @param {object} signals - optional signal map; falls back to disk file if omitted.
 *   Shape: { layoffs_recent: bool, leadership_exit_pattern: bool, ... }
 *          (booleans, or { active: bool, source: string, date: string, note: string })
 */
export function scoreToxicity(company, signals = null) {
  const slug = slugify(company);
  const data = signals || loadCompanySignals(slug) || {};
  const sources = data.sources || data.signals || data; // schema-flexible

  let composite = 0;
  const triggered = [];
  const dormant = [];

  for (const [key, weight] of Object.entries(SIGNAL_WEIGHTS)) {
    const raw = sources[key];
    const active = raw && (typeof raw === 'boolean' ? raw : !!raw.active);
    if (active) {
      composite += weight;
      triggered.push({
        signal: key,
        weight,
        source: raw?.source || 'unknown',
        date: raw?.date || null,
        note: raw?.note || null,
      });
    } else {
      dormant.push(key);
    }
  }

  // Verdict bucket
  let verdict;
  if (composite <= VERDICT_THRESHOLDS.clear.max) verdict = VERDICT_THRESHOLDS.clear;
  else if (composite <= VERDICT_THRESHOLDS.watch.max) verdict = VERDICT_THRESHOLDS.watch;
  else if (composite <= VERDICT_THRESHOLDS.caution.max) verdict = VERDICT_THRESHOLDS.caution;
  else verdict = VERDICT_THRESHOLDS.flag;

  return {
    company: slug,
    score: composite,
    score_max: Object.values(SIGNAL_WEIGHTS).reduce((a, b) => a + b, 0), // 100
    verdict: verdict.label,
    verdict_color: verdict.color,
    verdict_emoji: verdict.emoji,
    triggered_signals: triggered,
    dormant_signal_count: dormant.length,
    has_data: triggered.length > 0 || (data.last_computed_at !== undefined),
    auto_trash: false, // ALWAYS false — calibration brief: flag-for-review only
    recommendation: triggered.length === 0
      ? 'No negative signals on file. NOTE: absence of signal is not proof of health — flag this company in the council brief for fresh intel.'
      : verdict.label === 'FLAG-REVIEW'
        ? 'Manually review before submitting. Multiple high-weight signals active.'
        : verdict.label === 'caution'
          ? 'Submit cautiously. At least one high-weight signal active.'
          : verdict.label === 'watch'
            ? 'OK to submit with eyes open. Minor signal(s) noted.'
            : 'OK to submit.',
    sources_file: `data/toxicity-signals/${slug}.json`,
    last_computed_at: data.last_computed_at || null,
    schema_note: 'NEVER auto-trash on this score per calibration 2026-05-16.',
  };
}

/**
 * Convenience: combine TTO + toxicity into a single per-company risk view.
 * Used by the dashboard widget + heartbeat email's company-flags section.
 */
export function combinedRiskView(company, ttoEstimate, signals = null) {
  const tox = scoreToxicity(company, signals);
  const ttoBoost = ttoEstimate?.velocity_tier;
  let combined = tox.verdict;
  // If TTO is slow/glacial AND toxicity is non-clear, escalate the warning.
  if ((ttoBoost === 'slow' || ttoBoost === 'glacial') && tox.verdict !== 'clear') {
    combined = tox.verdict === 'watch' ? 'caution' : 'FLAG-REVIEW';
  }
  return {
    company: tox.company,
    combined_verdict: combined,
    toxicity: tox,
    tto: ttoEstimate || null,
  };
}

// CLI: node lib/toxicity-scorer.mjs <company> [<signals-json-string>]
if (import.meta.url === `file://${process.argv[1]}`) {
  const company = process.argv[2];
  const signalsArg = process.argv[3];
  if (!company) {
    console.error('Usage: node lib/toxicity-scorer.mjs <company> [\'{"layoffs_recent":true}\']');
    process.exit(1);
  }
  const signals = signalsArg ? JSON.parse(signalsArg) : null;
  console.log(JSON.stringify(scoreToxicity(company, signals), null, 2));
}
