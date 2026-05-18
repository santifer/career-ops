#!/usr/bin/env node
/**
 * test-anthropic-slots.mjs — sanity test for the new Anthropic PROVIDERS slots
 * added to lib/council.mjs on 2026-05-18 (dealbreaker-v2 Impasse B1).
 *
 * Runs ONE small call against each of:
 *   - anthropic:claude-opus-4-7
 *   - anthropic:claude-sonnet-4-6
 *   - anthropic:claude-haiku-4-5
 *
 * Plus 2 guard-rail tests:
 *   - Opus 4.7 + thinkingBudgetTokens should throw (Opus 4.7 budget_tokens HTTP 400)
 *   - Haiku 4.5 + thinkingEffort should throw (Haiku 4.5 no adaptive thinking)
 *
 * Cost: ~$0.005 total (5 calls × ~50 input + ~30 output tokens at premium-tier rates).
 *
 * Usage:
 *   node ~/Documents/career-ops/scripts/test-anthropic-slots.mjs
 *
 * Exit codes:
 *   0 — all 5 tests passed
 *   1 — at least one test failed (details in stderr)
 */

import { existsSync, readFileSync } from 'node:fs';
import { callCouncil } from '/Users/mitchellwilliams/Documents/career-ops/lib/council.mjs';

// Inline .env loader (override:true per memory rule — shell may pre-set ANTHROPIC_API_KEY to empty)
function loadEnv(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) {
      const [, key, rawValue] = m;
      const value = rawValue.replace(/^['"]|['"]$/g, '');
      process.env[key] = value;
    }
  }
}
loadEnv('/Users/mitchellwilliams/Documents/career-ops/.env');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('FAIL: ANTHROPIC_API_KEY missing from env. Cannot run tests.');
  process.exit(1);
}

const PROMPT = 'Reply with the single word "ok" and nothing else.';
const SMALL_OPTS = { maxTokens: 50 }; // Keep output tiny to minimize cost

const results = [];

async function runTest(name, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    results.push({ name, status: 'PASS', ms, ...result });
    console.log(`✅ ${name} (${ms}ms): ${result.detail || ''}`);
  } catch (e) {
    const ms = Date.now() - t0;
    results.push({ name, status: 'FAIL', ms, error: String(e.message || e) });
    console.error(`❌ ${name} (${ms}ms): ${e.message || e}`);
  }
}

// Test 1: Opus 4.7 basic call
await runTest('anthropic:claude-opus-4-7 — basic call', async () => {
  const { results } = await callCouncil({
    prompt: PROMPT,
    models: ['anthropic:claude-opus-4-7'],
    opts: SMALL_OPTS,
  });
  const r = results[0];
  if (r.error) throw new Error(r.error);
  if (!r.content || r.content.length === 0) throw new Error('empty content');
  if (!r.tokens || r.tokens === 0) throw new Error('no token count');
  return { detail: `content="${r.content.slice(0, 40)}" tokens=${r.tokens}` };
});

// Test 2: Sonnet 4.6 basic call
await runTest('anthropic:claude-sonnet-4-6 — basic call', async () => {
  const { results } = await callCouncil({
    prompt: PROMPT,
    models: ['anthropic:claude-sonnet-4-6'],
    opts: SMALL_OPTS,
  });
  const r = results[0];
  if (r.error) throw new Error(r.error);
  if (!r.content || r.content.length === 0) throw new Error('empty content');
  if (!r.tokens || r.tokens === 0) throw new Error('no token count');
  return { detail: `content="${r.content.slice(0, 40)}" tokens=${r.tokens}` };
});

// Test 3: Haiku 4.5 basic call
await runTest('anthropic:claude-haiku-4-5 — basic call', async () => {
  const { results } = await callCouncil({
    prompt: PROMPT,
    models: ['anthropic:claude-haiku-4-5'],
    opts: SMALL_OPTS,
  });
  const r = results[0];
  if (r.error) throw new Error(r.error);
  if (!r.content || r.content.length === 0) throw new Error('empty content');
  if (!r.tokens || r.tokens === 0) throw new Error('no token count');
  return { detail: `content="${r.content.slice(0, 40)}" tokens=${r.tokens}` };
});

// Test 4: Opus 4.7 + thinkingBudgetTokens should throw (W7 guard)
await runTest('anthropic:claude-opus-4-7 — thinkingBudgetTokens guard rejects', async () => {
  const { results } = await callCouncil({
    prompt: PROMPT,
    models: ['anthropic:claude-opus-4-7'],
    opts: { ...SMALL_OPTS, thinkingBudgetTokens: 1024 },
  });
  const r = results[0];
  if (!r.error) throw new Error('expected guard rejection but got content');
  if (!String(r.error).includes('thinkingBudgetTokens is not supported on Opus 4.7')) {
    throw new Error(`wrong error: ${r.error}`);
  }
  return { detail: `correctly rejected: ${String(r.error).slice(0, 80)}` };
});

// Test 5: Haiku 4.5 + thinkingEffort should throw (no adaptive thinking on Haiku)
await runTest('anthropic:claude-haiku-4-5 — thinkingEffort guard rejects', async () => {
  const { results } = await callCouncil({
    prompt: PROMPT,
    models: ['anthropic:claude-haiku-4-5'],
    opts: { ...SMALL_OPTS, thinkingEffort: 'low' },
  });
  const r = results[0];
  if (!r.error) throw new Error('expected guard rejection but got content');
  if (!String(r.error).includes('thinkingEffort (adaptive thinking) is not supported on Haiku 4.5')) {
    throw new Error(`wrong error: ${r.error}`);
  }
  return { detail: `correctly rejected: ${String(r.error).slice(0, 80)}` };
});

// Summary
const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
console.log(`\n${'='.repeat(60)}\nSUMMARY: ${passed}/${results.length} passed, ${failed} failed`);
console.log(`Total wallclock: ${results.reduce((s, r) => s + r.ms, 0)}ms`);

if (failed > 0) {
  console.error('\nFailed tests:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.error(`  ${r.name}: ${r.error}`);
  });
  process.exit(1);
}
process.exit(0);
