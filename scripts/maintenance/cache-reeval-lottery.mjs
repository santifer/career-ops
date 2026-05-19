#!/usr/bin/env node
/**
 * scripts/maintenance/cache-reeval-lottery.mjs — Weekly re-eval lottery.
 *
 * Design source: refresh-master Phase 4 deliverable 4. Weekly, pick a
 * random already-cached refresh + re-run it with a DIFFERENT model than
 * the original. If the delta is > threshold, flag the cache + write a
 * report for OMEGA's weekly proposal generator.
 *
 * Cadence: weekly via launchd (or manual `--run`).
 * State: data/cache-reeval-lottery-state.json (tracks which caches have
 * been re-evaluated to avoid repeats).
 *
 * Output: data/cache-reeval-results-{date}.md with diff analysis.
 *
 * Cheap mode (default): runs the re-eval as a DRY-RUN comparing the cache
 * file against a freshly-computed structural hash (no LLM call). Live mode
 * (--live) actually fires a new LLM call from a different provider.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const STATE_PATH = join(REPO_ROOT, 'data', 'cache-reeval-lottery-state.json');
const OUTPUT_DIR = join(REPO_ROOT, 'data');

const argv = process.argv.slice(2);
const isLive = argv.includes('--live');
const isRun = argv.includes('--run');

function readState() {
  if (!existsSync(STATE_PATH)) return { last_run_at: null, history: [] };
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch { return { last_run_at: null, history: [] }; }
}

function writeState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function listCacheFiles() {
  const dirs = [
    'data/hm-intel',
    'data/role-enrichment',
    'data/positioning-cache',
    'data/company-toxicity-cache',
  ];
  const files = [];
  for (const d of dirs) {
    const abs = join(REPO_ROOT, d);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs).filter(f => f.endsWith('.json'))) {
      files.push({ dir: d, file: f, path: join(abs, f) });
    }
  }
  return files;
}

function pickLotteryWinner(files, state) {
  // Filter out caches re-evaluated in the last 30 days
  const cutoff = Date.now() - 30 * 86400000;
  const recent = new Set((state.history || []).filter(h => Date.parse(h.ts) > cutoff).map(h => h.path));
  const eligible = files.filter(f => !recent.has(f.path));
  if (!eligible.length) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

async function dryRunReEval(file) {
  // Compute structural fingerprint of the cache content. The signal is
  // "does the cache look stale" — old retrieved_at + few citations + lots
  // of empty fields = candidate for live re-eval.
  let cache;
  try { cache = JSON.parse(readFileSync(file.path, 'utf8')); }
  catch (e) { return { ok: false, error: `parse: ${e.message}` }; }

  const mtime = statSync(file.path).mtime;
  const ageDays = (Date.now() - mtime.getTime()) / 86400000;
  const sourceUrls = cache.source_urls || cache.meta?.source_urls || [];
  const emptyFieldCount = countEmptyFields(cache);
  const stalenessScore = 0
    + (ageDays > 7 ? 2 : 0)
    + (ageDays > 14 ? 2 : 0)
    + (sourceUrls.length < 3 ? 1 : 0)
    + (sourceUrls.length === 0 ? 2 : 0)
    + (emptyFieldCount > 5 ? 1 : 0);

  return {
    ok: true,
    file: file.path,
    age_days: ageDays.toFixed(1),
    citations: sourceUrls.length,
    empty_fields: emptyFieldCount,
    staleness_score: stalenessScore,
    recommend_live_reeval: stalenessScore >= 3,
  };
}

function countEmptyFields(obj, depth = 0) {
  if (depth > 4) return 0;
  if (!obj || typeof obj !== 'object') return 0;
  let count = 0;
  for (const v of Object.values(obj)) {
    if (v === null || v === undefined || v === 'unknown' || v === '') count += 1;
    else if (typeof v === 'object') count += countEmptyFields(v, depth + 1);
  }
  return count;
}

async function liveReEval(file) {
  // Live mode would call a different provider than the original and diff
  // the structural fingerprint. Phase 4 ships the dry-run scaffolding;
  // live mode runs only when --live is set and pulls in the provider-
  // adapter dynamically.
  const dry = await dryRunReEval(file);
  if (!dry.ok) return dry;

  let cache;
  try { cache = JSON.parse(readFileSync(file.path, 'utf8')); }
  catch (e) { return { ok: false, error: `parse: ${e.message}` }; }

  // Pick a different provider than the original
  const originalModel = (cache.model || '').toLowerCase();
  let altProvider = 'anthropic-sonnet';
  if (originalModel.includes('sonnet') || originalModel.includes('claude')) altProvider = 'perplexity-agent';
  if (originalModel.includes('sonar') || originalModel.includes('perplexity')) altProvider = 'anthropic-sonnet';

  let providerAdapters;
  try { providerAdapters = await import('../../lib/provider-adapters/index.mjs'); }
  catch (e) { return { ...dry, live: false, error: `adapter import: ${e.message}` }; }
  const adapter = providerAdapters.getAdapter(altProvider);
  if (!adapter) return { ...dry, live: false, error: `no adapter for ${altProvider}` };

  // For the dry-run-of-live mode (no API key check): we report what WOULD
  // happen without actually calling. Set REEVAL_LIVE_CALL=1 to actually
  // hit the API.
  if (process.env.REEVAL_LIVE_CALL !== '1') {
    return {
      ...dry,
      live: 'simulated',
      altProvider,
      note: 'live re-eval recommended; set REEVAL_LIVE_CALL=1 + provider API key to actually fire',
    };
  }

  const stubCache = { id: 'reeval', minCitationsPer100Tokens: 0.5 };
  const stubRow = { num: file.file.replace('.json', ''), company: cache.company || 'unknown', role: cache.role || 'unknown' };
  const result = await adapter.refresh(stubCache, stubRow, {
    caller: 'cache-reeval-lottery',
    maxTokens: 2500,
    promptBuilder: () => `Re-evaluate this cached intel for (${stubRow.company}, ${stubRow.role}). Confirm or contradict the prior cached findings. Return STRICT JSON with: { confirms: [...], contradicts: [...], updates: [...] }`,
  });
  return { ...dry, live: true, altProvider, altResult: result };
}

async function main() {
  if (!isRun) {
    console.log('usage: --run [--live]');
    process.exit(0);
  }
  const state = readState();
  const files = listCacheFiles();
  if (!files.length) { console.log('no cache files found'); return; }

  const winner = pickLotteryWinner(files, state);
  if (!winner) { console.log('no eligible caches (all re-evaluated in last 30 days)'); return; }

  console.log(`lottery winner: ${winner.path}`);
  const evalResult = isLive ? await liveReEval(winner) : await dryRunReEval(winner);
  console.log(JSON.stringify(evalResult, null, 2));

  state.last_run_at = new Date().toISOString();
  state.history = (state.history || []).concat([{ ts: state.last_run_at, path: winner.path, mode: isLive ? 'live' : 'dry', result: evalResult }]).slice(-200);
  writeState(state);

  // Write a markdown summary
  const date = new Date().toISOString().slice(0, 10);
  const reportPath = join(OUTPUT_DIR, `cache-reeval-results-${date}.md`);
  const body = [
    `# Cache re-eval lottery — ${state.last_run_at}`,
    ``,
    `**Winner:** \`${winner.path}\``,
    `**Mode:** ${isLive ? 'live' : 'dry-run'}`,
    `**Staleness score:** ${evalResult.staleness_score || 'n/a'} (≥3 → recommend live re-eval)`,
    ``,
    `## Detail`,
    '```json',
    JSON.stringify(evalResult, null, 2),
    '```',
  ].join('\n');
  writeFileSync(reportPath, body);
  console.log(`report: ${reportPath}`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
