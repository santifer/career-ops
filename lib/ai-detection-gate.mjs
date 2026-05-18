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
  return {
    skipped: false,
    prob: Math.round(prob * 100) / 100,
    verdict,
    raw: {
      average_generated_prob: doc.average_generated_prob ?? null,
      completely_generated_prob: doc.completely_generated_prob ?? null,
      burstiness_score: doc.burstiness_score ?? null,
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

// ── Shared result builder ─────────────────────────────────────────────────────
function buildResult({ gptzero, originality, fromCache = false }) {
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

  return {
    passes,
    gptzero_prob:      gzProb,
    originality_prob:  origProb,
    verdict,
    cost_usd_estimate: TOTAL_COST_ESTIMATE,
    from_cache:        fromCache,
    gptzero_skipped:   gptzero?.skipped  ?? false,
    originality_skipped: originality?.skipped ?? false,
    gptzero_error:     gptzero?.error    ?? null,
    originality_error: originality?.error ?? null,
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
      return buildResult({ gptzero: cached.gptzero, originality: cached.originality, fromCache: true });
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

  const result = buildResult({ gptzero, originality, fromCache: false });

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

  // Strip YAML/TOML frontmatter (between leading --- ... ---)
  const sepMatches = [...body.matchAll(/^---$/gm)];
  if (sepMatches.length >= 2) {
    body = body.slice(sepMatches[1].index + 3).trim();
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
