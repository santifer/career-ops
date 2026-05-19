/**
 * lib/ai-detection-gate.mjs — API-backed AI detection gate.
 *
 * Exports:
 *   checkText(text, opts)           → { passes, gptzero_prob, originality_prob, verdict, cost_usd_estimate }
 *   checkArtifact(filePath, opts)   → checkText result + writes sidecar JSON
 *
 * Detectors (called in parallel via fetch — no new npm deps):
 *   GPTZero       POST https://api.gptzero.me/v2/predict/text
 *   Originality.ai POST https://api.originality.ai/api/v1/scan/ai
 *
 * Cache: sha1 of normalised text → data/ai-detection-cache/{hash}.json (30-day TTL, gitignored)
 * Budget: per-call cap enforced via opts.budgetUsd (default 0.10)
 *
 * pass logic: gptzero_prob < 0.5 AND originality_prob < 0.5
 *   If a detector's API key is missing, it is skipped and doesn't block the pass.
 *   If BOTH keys are missing, passes = null (unchecked).
 *
 * Cost estimates (2026-05 pricing):
 *   GPTZero:        ~$0.01 / document
 *   Originality.ai: ~$0.01 / document
 *   Total per call: ~$0.02
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE_DIR = join(ROOT, 'data', 'ai-detection-cache');
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Per-call cost estimates (USD)
const COST_GPTZERO = 0.01;
const COST_ORIGINALITY = 0.01;
const TOTAL_COST_ESTIMATE = COST_GPTZERO + COST_ORIGINALITY;

// Default per-call budget cap
const DEFAULT_BUDGET_USD = 0.10;

// ── Load .env so keys are available when imported directly ──────────────────
try {
  const { config } = await import('dotenv');
  config({ path: join(ROOT, '.env'), override: true });
} catch { /* dotenv optional */ }

// ── Normalise text for cache key (collapse whitespace) ──────────────────────
function normaliseText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function cacheKey(text) {
  return createHash('sha1').update(normaliseText(text)).digest('hex');
}

// ── Cache read/write ─────────────────────────────────────────────────────────
function readCache(hash) {
  const path = join(CACHE_DIR, `${hash}.json`);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    const age = Date.now() - (raw._cached_at ?? 0);
    if (age > CACHE_TTL_MS) return null; // expired
    return raw;
  } catch {
    return null;
  }
}

function writeCache(hash, data) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(
      join(CACHE_DIR, `${hash}.json`),
      JSON.stringify({ ...data, _cached_at: Date.now() }, null, 2),
      'utf-8'
    );
  } catch { /* non-fatal — cache miss next time */ }
}

// ── GPTZero v2 ───────────────────────────────────────────────────────────────
async function callGPTZero(text) {
  const key = process.env.GPTZERO_API_KEY;
  if (!key) {
    return { skipped: true, reason: 'GPTZERO_API_KEY not set in .env', prob: null };
  }
  const resp = await fetch('https://api.gptzero.me/v2/predict/text', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
    },
    body: JSON.stringify({
      document: text.slice(0, 5000),
      multilingual: false,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`GPTZero HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = await resp.json();
  const doc = data.documents?.[0];
  if (!doc) throw new Error('GPTZero: no documents in response');
  const prob = doc.average_generated_prob ?? doc.completely_generated_prob ?? null;
  if (prob === null) throw new Error('GPTZero: prob field missing in response');
  const verdict = prob > 0.8 ? 'AI' : prob > 0.5 ? 'MIXED' : 'HUMAN';

  // Sentence-level highlights: per-sentence generated_prob + GPTZero's own
  // `highlight_sentence_for_ai` flag. Used by the Editing Priority callout
  // to surface the SPECIFIC sentences that need a human rewrite, rather
  // than reporting only the document-wide score (which the Δ.1 baseline
  // showed is uniformly 1.0 across both human + AI samples — useless as
  // a binary gate).
  const sentences = Array.isArray(doc.sentences) ? doc.sentences.map(s => ({
    sentence: s.sentence,
    generated_prob: s.generated_prob ?? null,
    perplexity: s.perplexity ?? null,
    highlight_for_ai: s.highlight_sentence_for_ai ?? false,
    interpretability_designation: s.interpretability_designation ?? null,
  })) : [];

  // Aggregate sentence-level signal: mean / max / min of generated_prob,
  // and the count of GPTZero-flagged highlight sentences. These are far
  // more useful than the document-level prob for editing decisions.
  const sentProbs = sentences.map(s => s.generated_prob).filter(p => typeof p === 'number');
  const sent_mean_prob = sentProbs.length ? sentProbs.reduce((a, b) => a + b, 0) / sentProbs.length : null;
  const sent_max_prob  = sentProbs.length ? Math.max(...sentProbs) : null;
  const sent_min_prob  = sentProbs.length ? Math.min(...sentProbs) : null;
  const sent_variance  = sentProbs.length ? (() => {
    const m = sent_mean_prob;
    return sentProbs.reduce((acc, p) => acc + (p - m) ** 2, 0) / sentProbs.length;
  })() : null;
  const highlight_count = sentences.filter(s => s.highlight_for_ai).length;

  return {
    skipped: false,
    prob: Math.round(prob * 100) / 100,
    verdict,
    raw: {
      average_generated_prob: doc.average_generated_prob ?? null,
      completely_generated_prob: doc.completely_generated_prob ?? null,
      overall_burstiness: doc.overall_burstiness ?? null,
      predicted_class: doc.predicted_class ?? null,
      confidence_category: doc.confidence_category ?? null,
      class_probabilities: doc.class_probabilities ?? null,
    },
    sentences,
    sentence_signals: {
      count: sentences.length,
      mean_prob: sent_mean_prob,
      max_prob:  sent_max_prob,
      min_prob:  sent_min_prob,
      variance:  sent_variance,
      highlighted_count: highlight_count,
    },
  };
}

// ── Originality.ai ───────────────────────────────────────────────────────────
async function callOriginalityAI(text) {
  const key = process.env.ORIGINALITY_API_KEY;
  if (!key) {
    return { skipped: true, reason: 'ORIGINALITY_API_KEY not set in .env', prob: null };
  }
  const resp = await fetch('https://api.originality.ai/api/v1/scan/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-OAI-API-KEY': key,
    },
    body: JSON.stringify({
      content: text.slice(0, 5000),
      aiModelVersion: '1',
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Originality.ai HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = await resp.json();
  if (data.status !== 'success' && !data.score) {
    throw new Error(`Originality.ai API error: ${JSON.stringify(data).slice(0, 200)}`);
  }
  const aiScore = data.score?.ai ?? null;
  if (aiScore === null) throw new Error('Originality.ai: score.ai field missing');
  const verdict = aiScore > 0.8 ? 'AI' : aiScore > 0.5 ? 'MIXED' : 'HUMAN';
  return {
    skipped: false,
    prob: Math.round(aiScore * 100) / 100,
    verdict,
    raw: {
      ai_score: aiScore,
      original_score: data.score?.original ?? null,
      credits_used: data.credits_used ?? null,
    },
  };
}

// ── Calibrated thresholds (DELTA P2) ─────────────────────────────────────────
// Read once at module load. If the file is missing (first run before
// calibration) the gate falls back to absolute thresholds so it still works.
const FALLBACK_THRESHOLDS = {
  derived_at: null,
  gptzero:     { CLEAR: { max: 0.50 }, MED: { min: 0.50, max: 0.80 }, HIGH: { min: 0.80, max: 0.95 }, CRIT: { min: 0.95 } },
  originality: { CLEAR: { max: 0.50 }, MED: { min: 0.50, max: 0.80 }, HIGH: { min: 0.80, max: 0.95 }, CRIT: { min: 0.95 } },
};
function loadCalibratedThresholds() {
  const path = join(ROOT, 'data', 'ai-detection-calibration', 'current-thresholds.json');
  if (!existsSync(path)) return FALLBACK_THRESHOLDS;
  try {
    const t = JSON.parse(readFileSync(path, 'utf-8'));

    // AAA-2 (calibration-poisoning defence): require a `_provenance.baseline_sha256`
    // field that matches the on-disk baseline file. Without this, a malicious
    // single-line patch to current-thresholds.json could permanently flip the
    // gate to USELESS-passes-everything. If provenance is missing OR the SHA
    // doesn't match the baseline file referenced, fall back to absolute
    // thresholds — fail-secure, no silent ship.
    if (t?._provenance?.baseline_path && t?._provenance?.baseline_sha256) {
      try {
        const baselinePath = join(ROOT, t._provenance.baseline_path);
        if (existsSync(baselinePath)) {
          const baselineBytes = readFileSync(baselinePath);
          const actualSha = createHash('sha256').update(baselineBytes).digest('hex');
          if (actualSha !== t._provenance.baseline_sha256) {
            console.warn('[ai-detection-gate] thresholds provenance mismatch — falling back to absolute thresholds');
            return FALLBACK_THRESHOLDS;
          }
        } else {
          console.warn('[ai-detection-gate] provenance baseline file missing — falling back');
          return FALLBACK_THRESHOLDS;
        }
      } catch (e) {
        console.warn('[ai-detection-gate] provenance check threw — falling back:', e.message);
        return FALLBACK_THRESHOLDS;
      }
    } else {
      console.warn('[ai-detection-gate] thresholds missing _provenance — falling back to absolute thresholds');
      return FALLBACK_THRESHOLDS;
    }

    // Sanity validation: bands must be strictly ordered. Degenerate calibration
    // (e.g. CLEAR.max >= CRIT.min — every band collapses to one point) MUST NOT
    // load; that's the AAA-1 "USELESS detector" state which the calibrator
    // refuses to write but a hand-edited file might smuggle in.
    for (const det of ['gptzero', 'originality']) {
      const d = t[det];
      if (!d?.CLEAR || !d?.CRIT) return FALLBACK_THRESHOLDS;
      if ((d.CLEAR.max ?? 0) >= (d.CRIT.min ?? 1)) {
        console.warn(`[ai-detection-gate] degenerate ${det} bands (CLEAR.max ≥ CRIT.min) — falling back`);
        return FALLBACK_THRESHOLDS;
      }
    }
    return t;
  } catch { return FALLBACK_THRESHOLDS; }
}
let CACHED_THRESHOLDS = null;
function thresholds() {
  if (!CACHED_THRESHOLDS) CACHED_THRESHOLDS = loadCalibratedThresholds();
  return CACHED_THRESHOLDS;
}

/**
 * Assign a CLEAR / MED / HIGH / CRIT band based on the calibrated thresholds.
 * Returns null if prob is null/skipped.
 *
 * IMPORTANT: when human-baseline ≥ AI-decoy-baseline (the Δ.1 finding —
 * both score 1.0 — and any future state where the detector can't
 * separate the classes), every score lands at the CLEAR boundary. The
 * downstream interpreter should treat that case as "detector signal not
 * useful" rather than "no risk." The Editing Priority callout reads this
 * via the `signal_quality` field.
 */
function assignBand(prob, detectorName) {
  if (prob == null) return null;
  const t = thresholds()[detectorName];
  if (!t) return null;
  if (prob >= (t.CRIT.min ?? 0.95)) return 'CRIT';
  if (prob >= (t.HIGH.min ?? 0.80)) return 'HIGH';
  if (prob >= (t.MED.min  ?? 0.50)) return 'MED';
  return 'CLEAR';
}

/**
 * Worst-of bands across both detectors. CRIT > HIGH > MED > CLEAR.
 */
function worstBand(...bands) {
  const ranks = { CRIT: 3, HIGH: 2, MED: 1, CLEAR: 0 };
  const valid = bands.filter(Boolean);
  if (!valid.length) return null;
  return valid.reduce((a, b) => (ranks[a] >= ranks[b] ? a : b));
}

/**
 * Compute signal-quality assessment: how trustworthy is this score?
 *
 * Returns one of:
 *   'GOOD'        — detector separates Mitchell's writing from AI baseline well.
 *   'WEAK'        — small but real margin between baselines (≥0.05 gap).
 *   'USELESS'     — detector cannot distinguish the classes (gap < 0.05).
 *   'UNCALIBRATED' — no baseline available yet.
 */
function signalQuality(detectorName) {
  const t = thresholds();
  if (!t.derived_at) return 'UNCALIBRATED';
  const clearMax = t[detectorName]?.CLEAR?.max ?? null;
  const critMin  = t[detectorName]?.CRIT?.min ?? null;
  if (clearMax == null || critMin == null) return 'UNCALIBRATED';
  const gap = critMin - clearMax;
  if (gap < 0.05) return 'USELESS';
  if (gap < 0.20) return 'WEAK';
  return 'GOOD';
}

// ── Shared result builder ─────────────────────────────────────────────────────
function buildResult({ gptzero, originality, fromCache = false, ackDetectionDegraded = false }) {
  const gzProb   = gptzero?.skipped   ? null : (gptzero?.prob   ?? null);
  const origProb = originality?.skipped ? null : (originality?.prob ?? null);

  // passes logic:
  //   both keys present → both must pass (< 0.5)
  //   one key present  → that one must pass
  //   no keys present  → null (unchecked)
  let passes;
  if (gzProb === null && origProb === null) {
    passes = null; // neither detector ran
  } else {
    const gzOk   = gzProb   === null ? true : gzProb   < 0.5;
    const origOk = origProb === null ? true : origProb < 0.5;
    passes = gzOk && origOk;
  }

  // Overall verdict
  let verdict;
  const maxProb = Math.max(gzProb ?? 0, origProb ?? 0);
  if (gzProb === null && origProb === null) {
    verdict = 'UNCHECKED';
  } else if (maxProb > 0.8) {
    verdict = 'AI';
  } else if (maxProb > 0.5) {
    verdict = 'MIXED';
  } else {
    verdict = 'HUMAN';
  }

  // Calibrated bands (DELTA P1) — anchored to Mitchell's voice baseline.
  const gzBand   = assignBand(gzProb,   'gptzero');
  const origBand = assignBand(origProb, 'originality');
  const band     = worstBand(gzBand, origBand);

  // Signal-quality assessment: tells the dashboard whether the score
  // means anything at all (detectors that score Mitchell-voice = AI-decoy
  // are surfaced as USELESS so the UI can de-emphasise them).
  const gzSignalQuality   = signalQuality('gptzero');
  const origSignalQuality = signalQuality('originality');

  // GATE LOGIC (P1): only block on CRIT band where signal quality is GOOD.
  // - CRIT + USELESS detector → advisory only (don't block; surface for review).
  // - CRIT + GOOD detector    → block.
  // - HIGH / MED / CLEAR      → never block (sentence highlights guide editing).
  //
  // CRITICAL OVERRIDE: the legacy `passes = (gzProb < 0.5) && (origProb < 0.5)`
  // logic above is preserved for backward-compat callers reading `passes`, but
  // the new gate ALSO returns `gateBlocks` (the calibrated authority). Callers
  // upgraded to the band system should read `gateBlocks`, not `passes`. The
  // Δ.1 baseline showed `passes` = false on ALL of Mitchell's authentic prose
  // (false positive rate ~100%), so we soften `passes` when signal quality is
  // USELESS — failing the legacy gate with `passes=false` while every detector
  // is provably useless would block every legitimate apply-pack ship.
  const gateBlocks = (band === 'CRIT') && (gzSignalQuality === 'GOOD' || origSignalQuality === 'GOOD');
  let degraded = false;
  if (gateBlocks) {
    passes = false;
  } else if (gzSignalQuality === 'USELESS' && origSignalQuality === 'USELESS') {
    // AAA-4 (fail-secure default): when BOTH detectors are calibrated USELESS,
    // the gate has no actionable signal. The previous version force-passed
    // every artifact in this state, converting the gate to a permanent silent
    // no-op (Saltzer & Schroeder fail-open inversion). Now we mark passes=null
    // ("unchecked"), set degraded=true, and require the caller to opt in via
    // opts.ackDetectionDegraded=true. Callers who do NOT pass the ack get
    // passes=null and must surface the degraded state to a human reviewer.
    degraded = true;
    passes = ackDetectionDegraded ? true : null;
  }

  // Sentence highlights (from GPTZero only — Originality v1 returns no
  // per-sentence data, just `score.ai` aggregate. Confirmed by Δ.1 audit.)
  const gz_sentences = gptzero?.sentences ?? [];
  const sentence_signals = gptzero?.sentence_signals ?? null;

  return {
    passes,
    band,
    gateBlocks,
    gptzero_prob:      gzProb,
    gptzero_band:      gzBand,
    gptzero_signal_quality:     gzSignalQuality,
    originality_prob:  origProb,
    originality_band:  origBand,
    originality_signal_quality: origSignalQuality,
    verdict,
    cost_usd_estimate: TOTAL_COST_ESTIMATE,
    from_cache:        fromCache,
    gptzero_skipped:   gptzero?.skipped  ?? false,
    originality_skipped: originality?.skipped ?? false,
    gptzero_error:     gptzero?.error    ?? null,
    originality_error: originality?.error ?? null,
    sentences: gz_sentences,
    sentence_signals,
    burstiness: gptzero?.raw?.overall_burstiness ?? null,
    thresholds_at:     thresholds().derived_at ?? null,
    degraded,
    checked_at:        new Date().toISOString(),
  };
}

// ── Primary export: checkText ─────────────────────────────────────────────────

/**
 * Check text against GPTZero and Originality.ai.
 *
 * @param {string} text — raw text to check (prose only, no JSON/frontmatter)
 * @param {object} [opts]
 * @param {number}  [opts.budgetUsd=0.10] — throw if a single call would exceed this
 * @param {boolean} [opts.skipCache=false] — bypass cache and force fresh API calls
 * @returns {Promise<{
 *   passes: boolean|null,
 *   gptzero_prob: number|null,
 *   originality_prob: number|null,
 *   verdict: string,
 *   cost_usd_estimate: number,
 *   from_cache: boolean,
 * }>}
 */
export async function checkText(text, opts = {}) {
  const budgetUsd = opts.budgetUsd ?? DEFAULT_BUDGET_USD;

  // Budget guard: estimated cost per call
  if (TOTAL_COST_ESTIMATE > budgetUsd) {
    throw new Error(
      `ai-detection-gate: estimated call cost $${TOTAL_COST_ESTIMATE.toFixed(3)} exceeds ` +
      `per-call budget $${budgetUsd.toFixed(3)}. ` +
      `Pass opts.budgetUsd >= ${TOTAL_COST_ESTIMATE} to allow this call.`
    );
  }

  // Cache check (skip if either key is missing — both detectors must have run for cache to be valid)
  const hash = cacheKey(text);
  if (!opts.skipCache) {
    const cached = readCache(hash);
    if (cached) {
      return buildResult({ gptzero: cached.gptzero, originality: cached.originality, fromCache: true, ackDetectionDegraded: !!opts.ackDetectionDegraded });
    }
  }

  // Call both APIs in parallel
  const [gzSettled, origSettled] = await Promise.allSettled([
    callGPTZero(text),
    callOriginalityAI(text),
  ]);

  const gptzero = gzSettled.status === 'fulfilled'
    ? gzSettled.value
    : { skipped: false, error: String(gzSettled.reason?.message || gzSettled.reason), prob: null };

  const originality = origSettled.status === 'fulfilled'
    ? origSettled.value
    : { skipped: false, error: String(origSettled.reason?.message || origSettled.reason), prob: null };

  const result = buildResult({ gptzero, originality, fromCache: false, ackDetectionDegraded: !!opts.ackDetectionDegraded });

  // Cache the raw detector results (not the built result — so we can re-derive)
  // Only cache when at least one non-skipped result came back successfully
  const hasValidResult = (gptzero.prob !== null || originality.prob !== null);
  if (hasValidResult) {
    writeCache(hash, { gptzero, originality });
  }

  return result;
}

// ── Secondary export: checkArtifact ──────────────────────────────────────────

/**
 * Check an artifact file and write a sidecar JSON at `{filePath}.ai-detection.json`.
 *
 * Extracts prose-only sections from the file (strips frontmatter, code blocks,
 * JSON sections, metadata comments). Runs checkText on the extracted prose.
 *
 * @param {string} filePath — absolute path to the artifact
 * @param {object} [opts] — same opts as checkText
 * @returns {Promise<ReturnType<typeof checkText> & { file_path: string, prose_word_count: number }>}
 */
export async function checkArtifact(filePath, opts = {}) {
  const raw = readFileSync(filePath, 'utf-8');
  const prose = extractProseText(raw);

  const result = await checkText(prose, opts);

  const enriched = {
    ...result,
    file_path: filePath,
    prose_word_count: prose.split(/\s+/).filter(Boolean).length,
  };

  // Write sidecar JSON
  const sidecarPath = `${filePath}.ai-detection.json`;
  try {
    writeFileSync(sidecarPath, JSON.stringify(enriched, null, 2), 'utf-8');
  } catch { /* non-fatal if write fails */ }

  return enriched;
}

// ── Prose extraction (mirrors calibrate-ai-detectors.mjs logic) ──────────────

/**
 * Extract prose-only text from an artifact file.
 * Strips: YAML/TOML frontmatter, code fences, JSON blocks, metadata comments,
 * blockquotes, markdown headers, and DO NOT SUBMIT banners.
 */
export function extractProseText(raw) {
  let body = raw;

  // Strip YAML/TOML frontmatter — bounded to the FIRST ---...--- pair at the
  // start of the document, and only when that block is short enough to be
  // plausible metadata. The leading-position check fixed one bug (mid-document
  // section separators eaten as frontmatter); the "first close fence" + size
  // cap added 2026-05-19 closes the FRONTMATTER-CLOAK evasion (Δ.5 review,
  // Attack C — empirically reproduced: wrapping AI prose between `---` markers
  // with a benign tail caused extractProseText to return only the tail). The
  // detector now sees the AI prose because frontmatter strip stops at the
  // first close fence (lines ≤30 + bytes ≤500) or is skipped entirely.
  const lines = body.split('\n');
  if (lines[0]?.trim() === '---') {
    const closeIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (closeIdx > 0 && closeIdx < lines.length - 1) {
      const fmText = lines.slice(0, closeIdx + 1).join('\n');
      if (closeIdx <= 30 && fmText.length <= 500) {
        body = lines.slice(closeIdx + 1).join('\n').trim();
      }
      // else: opening --- is real but the "frontmatter" is too large to trust
      // as metadata; treat the whole document as body (no strip).
    }
  }

  // Strip fenced code blocks and JSON blocks
  body = body.replace(/```[\s\S]*?```/gm, '');

  // Strip HTML comments (metadata, agent warnings, etc.)
  body = body.replace(/<!--[\s\S]*?-->/g, '');

  // Strip blockquotes (usage notes, DO NOT SUBMIT banners)
  body = body.replace(/^>.*$/gm, '');

  // Strip markdown headers
  body = body.replace(/^#{1,6}\s+.+$/gm, '');

  // Strip inline code
  body = body.replace(/`[^`]+`/g, '');

  // Strip markdown link syntax [text](url) → text
  body = body.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Strip bold/italic markers (keep text)
  body = body.replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1');
  body = body.replace(/_{1,3}([^_\n]+)_{1,3}/g, '$1');

  // Strip SCAFFOLD / DO NOT SUBMIT sections
  body = body.replace(/\[SCAFFOLD\][^\n]*/g, '');

  // Collapse multiple blanks
  body = body.replace(/\n{3,}/g, '\n\n');

  return body.trim();
}

// ── DO-NOT-SUBMIT banner builder (used by orchestrator) ──────────────────────

/**
 * Build the frontmatter warning banner for an artifact that failed the gate.
 *
 * @param {{ gptzero_prob: number|null, originality_prob: number|null }} result
 * @param {string} commitSha — short SHA of the gate commit (can be 'pending' if not yet committed)
 * @returns {string} — markdown banner block ending with `\n\n---\n\n`
 */
export function buildDoNotSubmitBanner(result, commitSha = 'pending') {
  const gz  = result.gptzero_prob   != null ? `${Math.round(result.gptzero_prob   * 100)}%` : 'n/a';
  const orig = result.originality_prob != null ? `${Math.round(result.originality_prob * 100)}%` : 'n/a';
  return [
    `> ⚠️ **DO NOT SUBMIT — failed AI detection gate**`,
    `>`,
    `> GPTZero: **${gz}** AI prob · Originality.ai: **${orig}** AI prob`,
    `> Gate commit: \`${commitSha}\` · Checked: ${result.checked_at ?? new Date().toISOString()}`,
    `>`,
    `> Re-run via the orchestrator after humanization to clear this banner.`,
    ``,
    `---`,
    ``,
  ].join('\n');
}
