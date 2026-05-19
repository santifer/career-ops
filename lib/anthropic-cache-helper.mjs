/**
 * lib/anthropic-cache-helper.mjs — Anthropic prompt-caching wrapper.
 *
 * Design source: refresh-master Phase 1.5 deliverable 1 (Anthropic prompt
 * caching). Anthropic prompt caching reduces input-token cost by 90% on
 * cache hits and 10x reduces latency on repeated stable-prefix calls. The
 * stable corpus we re-send on every refresh call:
 *   - system prompt (Mitchell persona + task framing)
 *   - voice baseline (lib/voice-corpus.mjs exemplars)
 *   - cv.md
 *   - modes/_profile.md
 *
 * Cache lifetime is 5 minutes by default (Anthropic ephemeral cache); long
 * enough that batch-style refresh-master runs hit the cache for every row.
 *
 * Verified API behavior (WebFetch of docs.anthropic.com 2026-05-19):
 *   - cache_control: { type: 'ephemeral' } on a content block creates a
 *     breakpoint; everything ABOVE that block is cached.
 *   - Up to 4 cache breakpoints per request.
 *   - Min cacheable size: 1024 tokens (Sonnet/Opus) or 2048 (Haiku).
 *   - Response usage object includes cache_creation_input_tokens and
 *     cache_read_input_tokens; we log both to track hit rate.
 *
 * If the stable corpus is below the min cacheable threshold, the helper
 * falls back to a normal (uncached) call. The log line records this so we
 * can see if the corpus is too small.
 *
 * Usage:
 *   import { callAnthropicCached } from './lib/anthropic-cache-helper.mjs';
 *   const r = await callAnthropicCached({
 *     model: 'claude-sonnet-4-6',
 *     systemPrompt: 'You are Mitchell\'s research assistant. ...',
 *     stableCorpus: ['<long voice baseline + cv.md content>'],
 *     varyingPrompt: 'Summarize the toxicity signals for OpenAI.',
 *     maxTokens: 3000,
 *     caller: 'intel-refresh:toxicity',
 *   });
 *   // r.content, r.usage, r.cacheHitRate, r.modelUsed, r.cacheStats
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const STATS_DIR = join(REPO_ROOT, 'data', 'logs');
const STATS_PATH = join(STATS_DIR, 'anthropic-cache-stats.jsonl');

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';

// Anthropic min cacheable input. Sonnet/Opus: 1024 tokens, Haiku: 2048.
// We use a tokens-≈-chars/3.5 heuristic so we don't need a tokenizer here.
const MIN_CACHEABLE_CHARS = {
  'claude-sonnet-4-6': 1024 * 3.5,
  'claude-opus-4-7':   1024 * 3.5,
  'claude-haiku-4-5':  2048 * 3.5,
};

function ensureStatsDir() {
  if (!existsSync(STATS_DIR)) mkdirSync(STATS_DIR, { recursive: true });
}

function logCacheStats(record) {
  try {
    ensureStatsDir();
    appendFileSync(STATS_PATH, JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n');
  } catch { /* logging is best-effort */ }
}

// Public helper for council.mjs to log cache usage without depending on internals.
export function __logCouncilCacheUsage(record) { logCacheStats(record); }

/**
 * Build a Mitchell-stable corpus from on-disk files. Returns the
 * concatenated text + a list of source labels. Used as the default cache
 * prefix when caller doesn't provide one.
 */
export function buildDefaultStableCorpus(opts = {}) {
  const sources = [];
  const chunks = [];
  for (const file of opts.files || ['cv.md', 'modes/_profile.md', 'article-digest.md']) {
    const abs = join(REPO_ROOT, file);
    if (!existsSync(abs)) continue;
    try {
      chunks.push(`\n\n=== ${file} ===\n${readFileSync(abs, 'utf8')}`);
      sources.push(file);
    } catch { /* skip unreadable */ }
  }
  return { text: chunks.join(''), sources };
}

/**
 * Core wrapper. Calls Anthropic /v1/messages with cache_control on the
 * stable corpus. Falls back to uncached call if corpus is below min size.
 *
 * @param {object} req
 * @param {string} req.model        - 'claude-sonnet-4-6' | 'claude-opus-4-7' | 'claude-haiku-4-5'
 * @param {string} req.systemPrompt - System prompt; cached as a block.
 * @param {string[]} req.stableCorpus - Long stable content; cached.
 * @param {string} req.varyingPrompt - Per-call query, NOT cached.
 * @param {number} req.maxTokens
 * @param {string} req.caller        - For stats labelling; e.g., 'intel-refresh:toxicity'.
 * @param {AbortSignal} [req.signal]
 * @returns {Promise<{content, usage, cacheStats, modelUsed, cacheHitRate, cached, costUsd}>}
 */
export async function callAnthropicCached(req) {
  const {
    model = 'claude-sonnet-4-6',
    systemPrompt = '',
    stableCorpus = [],
    varyingPrompt,
    maxTokens = 3000,
    caller = 'unknown',
    signal,
    apiKey = process.env.ANTHROPIC_API_KEY,
  } = req || {};

  if (!apiKey) throw new Error('callAnthropicCached: ANTHROPIC_API_KEY not set');
  if (!varyingPrompt) throw new Error('callAnthropicCached: varyingPrompt is required');

  const stableText = (Array.isArray(stableCorpus) ? stableCorpus.join('\n\n') : String(stableCorpus || '')).trim();
  const minChars = MIN_CACHEABLE_CHARS[model] || MIN_CACHEABLE_CHARS['claude-sonnet-4-6'];
  const shouldCache = stableText.length >= minChars;

  // Build the message body.
  const body = { model, max_tokens: maxTokens };

  if (systemPrompt) {
    body.system = shouldCache
      ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
      : systemPrompt;
  }

  // User content: optional cached stable block + varying prompt.
  if (stableText && shouldCache) {
    body.messages = [{
      role: 'user',
      content: [
        { type: 'text', text: stableText, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: varyingPrompt },
      ],
    }];
  } else {
    const combined = stableText ? `${stableText}\n\n${varyingPrompt}` : varyingPrompt;
    body.messages = [{ role: 'user', content: combined }];
  }

  const t0 = Date.now();
  const r = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!r.ok) {
    const txt = (await r.text()).slice(0, 480);
    logCacheStats({ caller, model, ok: false, http: r.status, error: txt, latency_ms: Date.now() - t0 });
    throw new Error(`callAnthropicCached HTTP ${r.status}: ${txt}`);
  }

  const j = await r.json();
  const content = (j.content || []).map(c => c.text || '').join('');
  const usage = j.usage || {};
  const cacheCreation = usage.cache_creation_input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const totalInputTokens = inputTokens + cacheCreation + cacheRead;
  const cacheHitRate = totalInputTokens > 0 ? cacheRead / totalInputTokens : 0;

  // Cost: Anthropic Sonnet $3 input / $15 output / $3.75 cache write / $0.30 cache read per 1M tokens.
  // Opus: $15 / $75 / $18.75 / $1.50. Haiku: $0.25 / $1.25 / $0.3125 / $0.025.
  const PRICING = {
    'claude-sonnet-4-6': { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.30 },
    'claude-opus-4-7':   { input: 15.0, output: 75.0, cacheWrite: 18.75, cacheRead: 1.50 },
    'claude-haiku-4-5':  { input: 0.25, output: 1.25, cacheWrite: 0.3125, cacheRead: 0.025 },
  };
  const p = PRICING[model] || PRICING['claude-sonnet-4-6'];
  const costUsd =
    (inputTokens / 1_000_000) * p.input +
    (outputTokens / 1_000_000) * p.output +
    (cacheCreation / 1_000_000) * p.cacheWrite +
    (cacheRead / 1_000_000) * p.cacheRead;

  const cacheStats = {
    cache_creation_input_tokens: cacheCreation,
    cache_read_input_tokens: cacheRead,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_hit_rate: cacheHitRate,
    cached_prefix_chars: shouldCache ? stableText.length : 0,
    fell_back_uncached: !shouldCache,
  };

  logCacheStats({
    caller,
    model,
    ok: true,
    cached: shouldCache,
    ...cacheStats,
    cost_usd: costUsd,
    latency_ms: Date.now() - t0,
  });

  return {
    content,
    usage,
    cacheStats,
    cacheHitRate,
    cached: shouldCache,
    modelUsed: model,
    costUsd,
  };
}

/**
 * Read the rolling cache-stats log and compute hit rate over last N entries.
 * Used by the dashboard widget + Phase 1.5 exit-criteria verification.
 */
export function getRecentCacheHitRate({ caller = null, lastN = 100 } = {}) {
  if (!existsSync(STATS_PATH)) return { samples: 0, hitRate: 0, avgLatencyMs: 0, avgCostUsd: 0 };
  let lines;
  try { lines = readFileSync(STATS_PATH, 'utf8').trim().split('\n').filter(Boolean); }
  catch { return { samples: 0, hitRate: 0, avgLatencyMs: 0, avgCostUsd: 0 }; }
  const filtered = caller ? lines.filter(l => l.includes(`"caller":"${caller}"`)) : lines;
  const recent = filtered.slice(-lastN);
  const records = recent.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(r => r && r.ok);
  if (!records.length) return { samples: 0, hitRate: 0, avgLatencyMs: 0, avgCostUsd: 0 };
  const sum = (k) => records.reduce((s, r) => s + (r[k] || 0), 0);
  return {
    samples: records.length,
    hitRate: sum('cache_read_input_tokens') / Math.max(1, sum('cache_read_input_tokens') + sum('input_tokens') + sum('cache_creation_input_tokens')),
    avgLatencyMs: sum('latency_ms') / records.length,
    avgCostUsd: sum('cost_usd') / records.length,
  };
}

// CLI: node lib/anthropic-cache-helper.mjs --stats
//      node lib/anthropic-cache-helper.mjs --stats --caller intel-refresh:toxicity
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes('--stats')) {
    const caller = argv.includes('--caller') ? argv[argv.indexOf('--caller') + 1] : null;
    console.log(JSON.stringify(getRecentCacheHitRate({ caller }), null, 2));
  } else {
    console.log('usage: node lib/anthropic-cache-helper.mjs --stats [--caller <name>]');
  }
}
