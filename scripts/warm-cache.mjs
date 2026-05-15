#!/usr/bin/env node
/**
 * scripts/warm-cache.mjs — Pre-batch prompt cache warmer
 *
 * Makes a single max_tokens=1 API call with the static context block BEFORE
 * submitting a batch. This writes the 26k-token prefix to Anthropic's cache
 * so all batch items get cache hits instead of cache misses.
 *
 * Why this matters: The Batches API processes all requests in parallel.
 * Without warming, no request benefits from another's cache write — they
 * all potentially miss. One warm-up call (costs ~$0.04) guarantees cache
 * hits across the batch, saving ~90% on static context tokens.
 *
 * Expected savings: 26,715 tokens × 90% hit rate × N items × $1.50/MTok
 * vs. 26,715 tokens × N items × $1.50/MTok without warming.
 *
 * Usage:
 *   node scripts/warm-cache.mjs                  # warms Sonnet cache
 *   node scripts/warm-cache.mjs --model=haiku    # warms Haiku cache (for triage)
 *   node scripts/warm-cache.mjs --dry-run        # shows token count, no API call
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { HAIKU, SONNET } from '../lib/models.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const ARGS     = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const DRY_RUN  = !!ARGS['dry-run'];
const MODEL    = ARGS.model === 'haiku' ? HAIKU : SONNET;

const BAKED    = join(ROOT, 'data', 'baked-context.md');
const CV       = join(ROOT, 'cv.md');
const PROFILE  = join(ROOT, 'config/profile.yml');
const SHARED   = join(ROOT, 'modes/_shared.md');
const PROF_MD  = join(ROOT, 'modes/_profile.md');
const DIGEST   = join(ROOT, 'article-digest.md');

function buildStaticBlock() {
  // Prefer baked bundle
  if (existsSync(BAKED)) return readFileSync(BAKED, 'utf8');
  const parts = [];
  for (const [path, required] of [[CV, true],[PROFILE, true],[SHARED, true],[PROF_MD, false],[DIGEST, false]]) {
    const abs = join(ROOT, path);
    if (!existsSync(abs)) { if (required) throw new Error(`Missing: ${path}`); continue; }
    parts.push(`--- ${path} ---\n${readFileSync(abs, 'utf8')}`);
  }
  return parts.join('\n\n');
}

function getApiKey() {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return process.env.ANTHROPIC_API_KEY.trim();
  try {
    const env = readFileSync(join(ROOT, '.env'), 'utf8');
    const m = env.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (m?.[1]?.trim()) return m[1].trim();
  } catch {}
  return null;
}

const staticBlock = buildStaticBlock();
const tokenEst    = Math.round(staticBlock.length / 4);

console.log(`[warm-cache] Static block: ~${tokenEst.toLocaleString()} tokens | model: ${MODEL}`);
const warmCost = tokenEst * 1.875 / 1e6; // cache write rate
console.log(`[warm-cache] Warm-up cost: ~$${warmCost.toFixed(4)} (cache write)`);
const savingsPerItem = tokenEst * 0.90 * (1.50 - 0.15) / 1e6; // read vs full price
console.log(`[warm-cache] Savings per batch item: ~$${savingsPerItem.toFixed(5)}`);
console.log(`[warm-cache] Break-even: ${Math.ceil(warmCost / savingsPerItem)} items`);

if (DRY_RUN) {
  console.log('[warm-cache] --dry-run: skipping API call');
  process.exit(0);
}

const apiKey = getApiKey();
if (!apiKey) {
  console.error('[warm-cache] ANTHROPIC_API_KEY not set — cannot warm cache');
  process.exit(1);
}

console.log('[warm-cache] Sending warm-up request (max_tokens=1)…');

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key':         apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta':    'prompt-caching-2024-07-31',
    'content-type':      'application/json',
  },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 1,
    system: [{ type: 'text', text: staticBlock, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: 'ready' }],
  }),
});

if (!res.ok) {
  const err = await res.text();
  console.error(`[warm-cache] API error ${res.status}: ${err.slice(0, 200)}`);
  process.exit(1);
}

const data = await res.json();
const usage = data.usage || {};
console.log(`[warm-cache] ✅ Cache warmed`);
console.log(`  cache_creation_input_tokens: ${usage.cache_creation_input_tokens ?? 0}`);
console.log(`  cache_read_input_tokens:     ${usage.cache_read_input_tokens ?? 0}`);
console.log(`  (Next batch should get cache_read for the static block)`);
