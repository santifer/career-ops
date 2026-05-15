#!/usr/bin/env node
/**
 * triage-benchmark.mjs — Triage validation harness
 *
 * Usage:
 *   node triage-benchmark.mjs --dry-run
 *   node triage-benchmark.mjs --model=haiku --limit=10
 *   node triage-benchmark.mjs --simulate
 *   node triage-benchmark.mjs --provider-chain=local,anthropic,gemini --limit=10 --dry-run
 *   node triage-benchmark.mjs --output=json
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { HAIKU } from './lib/models.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '..');

// ── CLI args ────────────────────────────────────────────────────
const ARGS = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);

const MODEL          = ARGS.model ?? 'haiku';
const DRY_RUN        = !!ARGS['dry-run'];
const LIMIT          = ARGS.limit ? parseInt(ARGS.limit) : null;
const REPEAT         = parseInt(ARGS.repeat ?? '1');
const OUTPUT         = ARGS.output ?? 'table';
const SIMULATE       = !!ARGS.simulate;
const PROVIDER_CHAIN = ARGS['provider-chain']?.split(',') ?? ['anthropic'];

const BENCHMARK_FILE = join(ROOT, 'batch/triage-benchmark.tsv');
const QUOTA_FILE     = join(ROOT, 'batch/daily-quota.json');

// ── Simulate mode ───────────────────────────────────────────────
if (SIMULATE) {
  runSimulate();
  process.exit(0);
}

// ── Parse benchmark TSV ─────────────────────────────────────────
function loadBenchmark() {
  if (!existsSync(BENCHMARK_FILE)) {
    console.error(`ERROR: ${BENCHMARK_FILE} not found`);
    process.exit(1);
  }
  const lines = readFileSync(BENCHMARK_FILE, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('url'));
  return lines.map(l => {
    const [url, tier, expected_decision, expected_archetype, notes, variance_expected] = l.split('\t');
    return { url: url?.trim(), tier: parseInt(tier) || 2, expected_decision: expected_decision?.trim(),
             expected_archetype: expected_archetype?.trim(), notes: notes?.trim(),
             variance_expected: variance_expected?.trim() === 'high' };
  }).filter(i => i.url?.startsWith('http'));
}

// ── Fixture outputs for dry-run parser testing ──────────────────
const FIXTURES = [
  // valid JSON
  { input: '{"score": 4.2, "archetype": "A2", "decision": "ADVANCE", "reason": "AI-native company solutions architect role matches background"}', expectOk: true },
  { input: '{"score": 2.1, "archetype": "NO", "decision": "SKIP", "reason": "pure SWE mandatory Java production no AI content"}', expectOk: true },
  // preamble
  { input: 'Here is my assessment: {"score": 3.8, "archetype": "A1", "decision": "ADVANCE", "reason": "strong fit for applied AI role"}', expectOk: true },
  // code fences
  { input: '```json\n{"score": 1.5, "archetype": "NO", "decision": "SKIP", "reason": "retail sales role unrelated to AI"}\n```', expectOk: true },
  // malformed JSON
  { input: 'score: 4.0, archetype: A2, decision: ADVANCE, reason: good match', expectOk: false },
];

// ── JSON schema parser ──────────────────────────────────────────
function parseTriageOutput(raw) {
  if (!raw) return { error: 'empty output' };
  const cleaned = raw
    .replace(/^```json?\s*/im, '')
    .replace(/```\s*$/m, '')
    .replace(/^\s*Here.*?:\s*/im, '')
    .trim();
  const jsonMatch = cleaned.match(/\{[^}]+\}/);
  if (!jsonMatch) return { error: 'no JSON object found' };
  try {
    const obj = JSON.parse(jsonMatch[0]);
    const score = parseFloat(obj.score);
    if (typeof obj.score === 'undefined') return { error: 'missing score' };
    if (isNaN(score) || score < 1.0 || score > 5.0) return { error: `invalid score: ${obj.score}` };
    const archetype = String(obj.archetype || '');
    if (!['A1', 'A2', 'B', 'NO'].includes(archetype)) return { error: `invalid archetype: ${archetype}` };
    const decision = String(obj.decision || '');
    if (!['ADVANCE', 'SKIP'].includes(decision)) return { error: `invalid decision: ${decision}` };
    const reason = String(obj.reason || '').slice(0, 120);
    return { score, archetype, decision, reason };
  } catch (e) {
    return { error: `JSON parse failed: ${e.message}`, raw: cleaned.slice(0, 200) };
  }
}

// ── Legacy regex parser (for comparison) ───────────────────────
function parseTriageOutputRegex(raw) {
  if (!raw) return { error: 'empty' };
  const score     = parseFloat((raw.match(/score:\s*([\d.]+)/i)   || [])[1] ?? 'NaN');
  const archetype = ((raw.match(/archetype:\s*([A-Z0-9]+)/i)       || [])[1] ?? '?');
  const decision  = ((raw.match(/decision:\s*(ADVANCE|SKIP)/i)     || [])[1] ?? null);
  const reason    = ((raw.match(/reason:\s*(.+)/i)                 || [])[1] ?? '').trim();
  if (isNaN(score) || !decision) return { error: `regex failed: score=${score} decision=${decision}` };
  return { score, archetype, decision, reason };
}

// ── Run dry-run fixture test ────────────────────────────────────
function runDryRun(items) {
  console.log('\n── DRY-RUN: Fixture parser tests ──────────────────────────\n');
  let passed = 0;
  for (const { input, expectOk } of FIXTURES) {
    const result = parseTriageOutput(input);
    const ok = expectOk ? !result.error : !!result.error;
    const label = ok ? '✅' : '❌';
    console.log(`${label} expectOk=${expectOk} → ${result.error ?? `score=${result.score} ${result.decision}`}`);
    if (ok) passed++;
  }
  console.log(`\nFixture tests: ${passed}/${FIXTURES.length} passed`);

  // Also test regex parser on same fixtures
  console.log('\n── Regex parser comparison ─────────────────────────────────\n');
  for (const { input, expectOk } of FIXTURES) {
    const result = parseTriageOutputRegex(input);
    const ok = expectOk ? !result.error : !!result.error;
    const label = ok ? '✅' : '❌';
    console.log(`${label} regex: ${result.error ?? `score=${result.score} ${result.decision}`}`);
  }

  // Show benchmark item count
  const limitedItems = LIMIT ? items.slice(0, LIMIT) : items;
  console.log(`\n── Benchmark dataset: ${items.length} total items (limit: ${limitedItems.length}) ──`);
  const advance = items.filter(i => i.expected_decision === 'ADVANCE').length;
  const skip = items.filter(i => i.expected_decision === 'SKIP').length;
  const highVariance = items.filter(i => i.variance_expected).length;
  console.log(`  ADVANCE: ${advance} | SKIP: ${skip} | High-variance: ${highVariance}`);
  console.log('\n✅ DRY-RUN complete');
  return passed === FIXTURES.length;
}

// ── Simulate threshold impact ───────────────────────────────────
function runSimulate() {
  console.log('\n── SIMULATE: Threshold impact on 2026-05-08 backlog data ──\n');

  let quota = { triaged: 1314, advanced: 944, skipped: 370, dead: 502 };
  if (existsSync(QUOTA_FILE)) {
    try { quota = { ...quota, ...JSON.parse(readFileSync(QUOTA_FILE, 'utf8')) }; } catch {}
  }

  // Current thresholds: T1/T2=3.5, T3=4.0
  // New thresholds: T1=3.7, T2=3.9, T3=4.2
  // Based on typical score distributions, raising T1/T2 from 3.5→3.7 cuts ~20% of advances,
  // raising T2 to 3.9 cuts another ~15%, raising T3 from 4.0→4.2 cuts ~10% of T3 pool.
  // Estimated combined effect: ~35% advance rate (from 71.8%)

  const oldRate     = quota.advanced / quota.triaged;
  const newRateEst  = 0.35; // estimated based on threshold analysis
  const newAdvanced = Math.round(quota.triaged * newRateEst);
  const reduction   = quota.advanced - newAdvanced;
  const costPerEval = 0.046; // Batches API w/ 50% discount
  const savingsPerRun = reduction * costPerEval;
  const monthlyRunsLow = 2;
  const monthlyRunsHigh = 3;

  console.log('─'.repeat(70));
  console.log('Metric'.padEnd(40) + 'Before'.padEnd(15) + 'After (est)');
  console.log('─'.repeat(70));
  console.log('Triaged'.padEnd(40) + quota.triaged.toString().padEnd(15) + quota.triaged);
  console.log('Advanced'.padEnd(40) + quota.advanced.toString().padEnd(15) + newAdvanced);
  console.log('Advance rate'.padEnd(40) + `${(oldRate * 100).toFixed(1)}%`.padEnd(15) + `~${(newRateEst * 100).toFixed(0)}%`);
  console.log('Evals skipped per run'.padEnd(40) + '-'.padEnd(15) + reduction);
  console.log(`Savings per backlog run ($${costPerEval}/eval)`.padEnd(40) + '-'.padEnd(15) + `$${savingsPerRun.toFixed(2)}`);
  console.log(`Monthly savings (${monthlyRunsLow}–${monthlyRunsHigh} runs)`.padEnd(40) + '-'.padEnd(15) +
    `$${(savingsPerRun * monthlyRunsLow).toFixed(0)}–$${(savingsPerRun * monthlyRunsHigh).toFixed(0)}`);
  console.log('─'.repeat(70));

  // Cache savings estimate
  const staticTokens = 26715;
  const cacheHitRate = 0.90;
  const inputPricePerMTok = 3.0; // Sonnet input price
  const cacheDiscount = 0.10;    // cached reads at 10% of input price
  const cacheSavingPerToken = inputPricePerMTok * (1 - cacheDiscount) / 1e6;
  const monthlyCacheSavings = staticTokens * cacheHitRate * newAdvanced * monthlyRunsLow * cacheSavingPerToken;
  console.log(`\nPrompt cache savings est. (${monthlyRunsLow} runs/mo): $${monthlyCacheSavings.toFixed(0)}/mo`);

  const totalSavingsLow  = savingsPerRun * monthlyRunsLow  + monthlyCacheSavings;
  const totalSavingsHigh = savingsPerRun * monthlyRunsHigh + monthlyCacheSavings;
  console.log(`\nTOTAL PROJECTED SAVINGS: ~$${totalSavingsLow.toFixed(0)}–$${totalSavingsHigh.toFixed(0)}/month`);
  console.log('  (thresholds + caching; excludes Ollama local savings from Phase 6)');
}

// ── Main benchmark run ──────────────────────────────────────────
async function main() {
  const items = loadBenchmark();
  const limitedItems = LIMIT ? items.slice(0, LIMIT) : items;

  if (DRY_RUN) {
    const ok = runDryRun(items);
    process.exit(ok ? 0 : 1);
  }

  // Live run (API calls)
  console.log(`\n── LIVE BENCHMARK: ${limitedItems.length} items, ${REPEAT} repeat(s), providers: ${PROVIDER_CHAIN.join(',')} ──\n`);

  const results = [];
  let trueAdvance = 0, correctSkip = 0, parseable = 0, totalVariance = 0;
  let highVarianceFlags = 0;

  for (const item of limitedItems) {
    const runs = [];
    for (let r = 0; r < REPEAT; r++) {
      const t0 = Date.now();
      // For now, run only via Haiku (Phase 5 will add routing)
      const triagePromptTemplate = readFileSync(join(ROOT, 'batch/triage-prompt.md'), 'utf8');
      const prompt = triagePromptTemplate
        .replace('{{URL}}', item.url)
        .replace('{{TIER}}', String(item.tier))
        .replace('{{JD_SNIPPET}}', '(dry-run: no JD available)');

      const res = spawnSync('claude', ['-p', prompt,
        '--model', HAIKU,
        '--dangerously-skip-permissions', '--tools', '',
        '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'],
        { encoding: 'utf8', timeout: 60_000, cwd: ROOT });

      const raw = (res.stdout || '').trim();
      const parsed = parseTriageOutput(raw);
      const latency = Date.now() - t0;
      runs.push({ parsed, latency, raw });
    }

    const first = runs[0].parsed;
    const parsedOk = !first.error;
    if (parsedOk) parseable++;

    // Check correctness
    if (parsedOk && first.decision === 'ADVANCE' && item.expected_decision === 'ADVANCE') trueAdvance++;
    if (parsedOk && first.decision === 'SKIP' && item.expected_decision === 'SKIP') correctSkip++;

    // Variance
    if (REPEAT > 1 && runs.length > 1) {
      const scores = runs.filter(r => !r.parsed.error).map(r => r.parsed.score);
      if (scores.length > 1) {
        const variance = Math.max(...scores) - Math.min(...scores);
        totalVariance += variance;
        if (variance > 0.5 && item.variance_expected) highVarianceFlags++;
      }
    }

    const status = parsedOk
      ? (first.decision === item.expected_decision ? '✅' : '❌')
      : '⚠️ ';
    console.log(`${status} [T${item.tier}] ${first.decision ?? 'PARSE_FAIL'} (exp: ${item.expected_decision}) score=${first.score ?? 'N/A'} — ${item.url.slice(0, 70)}`);
    results.push({ item, runs });
  }

  // Summary
  const expectedAdvance = limitedItems.filter(i => i.expected_decision === 'ADVANCE').length;
  const expectedSkip    = limitedItems.filter(i => i.expected_decision === 'SKIP').length;
  const advanceRecall   = expectedAdvance > 0 ? (trueAdvance / expectedAdvance * 100).toFixed(0) : 'N/A';
  const skipAgreement   = expectedSkip > 0    ? (correctSkip  / expectedSkip    * 100).toFixed(0) : 'N/A';
  const formatReliability = (parseable / limitedItems.length * 100).toFixed(0);
  const avgVariance     = REPEAT > 1 ? (totalVariance / limitedItems.length).toFixed(2) : 'N/A (repeat=1)';

  console.log('\n' + '─'.repeat(70));
  console.log(`ADVANCE recall: ${advanceRecall}% | SKIP agreement: ${skipAgreement}% | Format: ${formatReliability}% | Avg variance: ${avgVariance}`);
  console.log('─'.repeat(70));

  if (OUTPUT === 'json') {
    console.log(JSON.stringify({ advanceRecall, skipAgreement, formatReliability, avgVariance, results: results.length }));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
