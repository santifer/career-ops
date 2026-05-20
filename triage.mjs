#!/usr/bin/env node
/**
 * triage.mjs — liveness filter + Haiku quick-score for pipeline items
 *
 * Phase 0: HTTP liveness check (free, no AI) — purges dead/404 items immediately
 * Phase 1: Haiku quick-score — scores live items at ~$0.002/job
 *
 * Usage:
 *   node triage.mjs                              # liveness + score Tier 1,2,3
 *   node triage.mjs --liveness-only              # purge dead items only (free)
 *   node triage.mjs --liveness-only --concurrency=20  # fast parallel purge
 *   node triage.mjs --tier=1                     # score Tier 1 only
 *   node triage.mjs --tier=2,3                   # score Tier 2+3
 *   node triage.mjs --limit=30                   # max items this session
 *   node triage.mjs --limit=1000 --concurrency=20 --liveness-only  # full purge
 *   node triage.mjs --threshold=3.5              # ADVANCE if score >= N
 *   node triage.mjs --dry-run                    # show what would happen, no writes
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

// Load .env from project root so ANTHROPIC_API_KEY (used by callHaiku) and
// GEMINI_API_KEY (used by quickScoreGemini) are available. override:true
// because Mitchell's shell pre-sets ANTHROPIC_API_KEY to empty string.
try {
  const { config } = await import('dotenv');
  config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env'), override: true });
} catch { /* dotenv optional */ }

import { isCircuitOpen, withRetryBackoff, recordSuccess, recordFailure } from './lib/provider-client.mjs';
import { HAIKU, SONNET } from './lib/models.mjs';
import { readCached, poolMap } from './lib/fetch-utils.mjs';
import { guessCompany, buildCompanyMatcher } from './lib/ats-utils.mjs';
import { checkUrl } from './lib/http-liveness.mjs';
import { renderDiscardPatternBrief } from './lib/discard-pattern-injector.mjs';
import { scoreZombie } from './lib/zombie-scorer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// ── Args ────────────────────────────────────────────────────────
const ARGS = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v = true] = a.slice(2).split('='); return [k, v]; })
);
const TIERS          = (ARGS.tier   ?? '1,2,3').split(',').map(Number);
const LIMIT          = parseInt(ARGS.limit     ?? '50');

// Thresholds: env vars take precedence, then CLI args, then new defaults (raised from 3.5/4.0)
const ADVANCE_THRESHOLDS = {
  1: parseFloat(process.env.TRIAGE_THRESHOLD_T1 ?? ARGS.threshold              ?? '3.7'),
  2: parseFloat(process.env.TRIAGE_THRESHOLD_T2 ?? ARGS.threshold              ?? '3.9'),
  3: parseFloat(process.env.TRIAGE_THRESHOLD_T3 ?? ARGS['tier3-threshold']     ?? '4.2'),
};
// Keep backward-compatible aliases for any external scripts referencing these
const THRESHOLD    = ADVANCE_THRESHOLDS[1];
const T3_THRESHOLD = ADVANCE_THRESHOLDS[3];
// DAILY_LIMIT bumped from 50 → 200 (2026-05-16): with a 645-item backlog at
// the old cap, daily launchd runs would take 13 days to clear. 200/day clears
// the same backlog in ~3 days at ~$0.40/day (200 × $0.002 Haiku cost). CLI
// can still override with --daily-limit=N for full backlog burns.
const DAILY_LIMIT    = parseInt(ARGS['daily-limit'] ?? '200');
const LIVENESS_ONLY  = ARGS['liveness-only'] === true || ARGS['liveness-only'] === 'true';
const DRY_RUN        = ARGS['dry-run']       === true || ARGS['dry-run']       === 'true';
const CONCURRENCY    = Math.max(1, parseInt(ARGS.concurrency ?? '1'));
const LIVENESS_TIMEOUT_MS = 10_000;
// Tier-5 quality flag — route triage scoring to Sonnet 4.6 (richer JD reasoning,
// ~14× higher per-call cost vs Haiku). Default false → preserve historical
// Haiku path. Activated by Process All's Tier-5 button.
const USE_SONNET_JD  = ARGS['use-sonnet-jd'] === true || ARGS['use-sonnet-jd'] === 'true';

// ── Paths ───────────────────────────────────────────────────────
const PIPELINE_FILE        = join(ROOT, 'data/pipeline.md');
const QUOTA_FILE           = join(ROOT, 'batch/daily-quota.json');
const ADVANCE_FILE         = join(ROOT, 'batch/triage-advance.tsv');
const SKIPS_TSV            = join(ROOT, 'batch/tracker-additions/triage-skips.tsv');
const TRIAGE_PROMPT        = join(ROOT, 'batch/triage-prompt.md');
const URL_CACHE_FILE       = join(ROOT, 'data/triage-cache.tsv');
const ZOMBIE_DECISIONS_FILE = join(ROOT, 'data/zombie-decisions.tsv');
const URL_CACHE_TTL_DAYS = 7;   // re-triage after 7 days

// ── Persistent URL dedup cache ───────────────────────────────────
// Format: url TAB date TAB score TAB decision TAB archetype
// Only caches clear results (score <3.0 SKIP or >4.0 ADVANCE) to avoid
// locking in borderline scores that might change with updated prompts.
const _urlCache = new Map(); // url → { date, score, decision, archetype }
function loadUrlCache() {
  if (!existsSync(URL_CACHE_FILE)) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - URL_CACHE_TTL_DAYS);
  for (const line of readFileSync(URL_CACHE_FILE, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('url')) continue;
    const [url, date, score, decision, archetype] = line.split('\t');
    if (url && date && new Date(date) >= cutoff) {
      _urlCache.set(url.trim(), { date, score: parseFloat(score), decision: decision?.trim(), archetype: archetype?.trim() });
    }
  }
}
function saveUrlCacheEntry(url, score, decision, archetype) {
  // Only cache clear results to avoid freezing borderline scores
  if (score >= 3.0 && score <= 4.0) return;
  const date = new Date().toISOString().slice(0, 10);
  const header = !existsSync(URL_CACHE_FILE) ? 'url\tdate\tscore\tdecision\tarchetype\n' : '';
  appendFileSync(URL_CACHE_FILE, header + [url, date, score, decision, archetype].join('\t') + '\n');
  _urlCache.set(url, { date, score, decision, archetype });
}
loadUrlCache();

// ── In-memory session dedup (same URL within one run) ────────────
const _sessionCache = new Map(); // url → parsed triage result

// ── Scan-history for freshness-aware ordering ────────────────────
const SCAN_HISTORY_FILE = join(ROOT, 'data/scan-history.tsv');
const _scanHistory = new Map(); // url → first_seen (ISO date string)

function loadScanHistory() {
  if (!existsSync(SCAN_HISTORY_FILE)) return;
  for (const line of readFileSync(SCAN_HISTORY_FILE, 'utf8').split('\n').slice(1)) {
    if (!line.trim()) continue;
    const [url, first_seen] = line.split('\t');
    if (url?.trim() && first_seen?.trim()) _scanHistory.set(url.trim(), first_seen.trim());
  }
}

// Per-source staleness TTLs (days). Sources with faster posting cycles go stale sooner.
function getSourceTTL(url) {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    if (host.includes('linkedin'))                              return 10; // posts disappear fast
    if (host.includes('glassdoor'))                            return 0;  // always 403 — skip
    if (host.includes('myworkday') || host.includes('workday')) return 14;
    if (host === 'amazon.jobs')                                return 28; // stable ATS
    if (host.includes('ashbyhq') || host.includes('lever') || host.includes('greenhouse')) return 21;
    return 21; // default
  } catch { return 21; }
}

function getUrlAgeDays(url) {
  const firstSeen = _scanHistory.get(url);
  if (!firstSeen) return null;
  try {
    return Math.floor((Date.now() - new Date(firstSeen).getTime()) / 86_400_000);
  } catch { return null; }
}

loadScanHistory();

// ── Zombie scorer integration ────────────────────────────────────
// _zombieHistory is built once per triage run from scan-history.tsv so the
// cluster scorer can detect multi-region duplicate postings without an extra
// file read inside the hot path. Built lazily in buildZombieHistory().
let _zombieHistory = null;

function buildZombieHistory() {
  if (_zombieHistory) return _zombieHistory;
  const rows = [];
  if (existsSync(SCAN_HISTORY_FILE)) {
    for (const line of readFileSync(SCAN_HISTORY_FILE, 'utf8').split('\n').slice(1)) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      // scan-history.tsv schema: url, first_seen, portal, title, company, status
      const [url, , , title, company] = parts;
      if (url?.trim()) rows.push({ url: url.trim(), title: title?.trim() || '', company: company?.trim() || '', location: '' });
    }
  }
  _zombieHistory = rows;
  return rows;
}

function logZombieDecision(url, result, ageDays, clusterN) {
  if (DRY_RUN) return;
  const header = !existsSync(ZOMBIE_DECISIONS_FILE)
    ? 'timestamp\turl\tcomposite\tdecision\tage_d\tcluster_n\tevergreen_hit\n'
    : '';
  const line = [
    new Date().toISOString(),
    url,
    result.composite.toFixed(4),
    result.decision,
    ageDays ?? '',
    clusterN,
    result.breakdown.evergreen,
  ].join('\t') + '\n';
  try { appendFileSync(ZOMBIE_DECISIONS_FILE, header + line); } catch {}
}

// ── Daily quota ─────────────────────────────────────────────────
function getQuota() {
  const today = new Date().toISOString().slice(0, 10);
  if (existsSync(QUOTA_FILE)) {
    const q = JSON.parse(readFileSync(QUOTA_FILE, 'utf8'));
    if (q.date === today) return q;
  }
  return { date: today, triaged: 0, advanced: 0, skipped: 0, dead: 0 };
}
function saveQuota(q) {
  if (!DRY_RUN) writeFileSync(QUOTA_FILE, JSON.stringify(q, null, 2));
}

// ── Pipeline parser ─────────────────────────────────────────────
// Pure function — accepts content so unit tests can pass fixtures.
export function parsePipeline(content) {
  const lines = content.split('\n');
  const items = [];
  let tier = 0;
  for (const line of lines) {
    if (/Tier 1/i.test(line) && !/Tier 2|Tier 3/.test(line)) tier = 1;
    else if (/Tier 2/i.test(line)) tier = 2;
    else if (/Tier 3/i.test(line)) tier = 3;
    const m = line.match(/^- \[ \] (https?:\/\/\S+)/);
    if (m) items.push({ url: m[1], tier });
  }
  return items;
}

// Mark a URL as [x] in pipeline.md
function markChecked(url) {
  if (DRY_RUN) return;
  const content = readFileSync(PIPELINE_FILE, 'utf8');
  const updated = content.replace(`- [ ] ${url}`, `- [x] ${url}`);
  if (updated !== content) writeFileSync(PIPELINE_FILE, updated);
}

// Mark multiple URLs in one read/write pass (efficient for concurrent results)
function markCheckedBatch(urls) {
  if (DRY_RUN || urls.length === 0) return;
  let content = readFileSync(PIPELINE_FILE, 'utf8');
  for (const url of urls) {
    content = content.replace(`- [ ] ${url}`, `- [x] ${url}`);
  }
  writeFileSync(PIPELINE_FILE, content);
}

// Write a SKIP tracker entry (for dashboard visibility)
function writeSkip(url, reason) {
  if (DRY_RUN) return;
  if (!existsSync(dirname(SKIPS_TSV))) mkdirSync(dirname(SKIPS_TSV), { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const company = guessCompany(url);
  const line = `\t${date}\t${company}\t—\tSKIP\t—\t❌\t—\t${reason.slice(0, 120)}\n`;
  appendFileSync(SKIPS_TSV, line);
}

// In-memory dedup index — URLs already in ADVANCE_FILE at session start +
// URLs appended during this triage session. Prevents the same URL from being
// appended multiple times (the duplicate-bloat bug Mitchell hit 2026-05-19
// where some URLs appeared 5× in the queue).
const _advanceUrlIndex = new Set();
let _advanceIndexLoaded = false;
function _loadAdvanceIndex() {
  if (_advanceIndexLoaded) return;
  _advanceIndexLoaded = true;
  if (!existsSync(ADVANCE_FILE)) return;
  try {
    const lines = readFileSync(ADVANCE_FILE, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim() || line.startsWith('url\t')) continue;
      const url = line.split('\t')[0];
      if (url) _advanceUrlIndex.add(url);
    }
  } catch (e) {
    // Soft-fail — if the file is unreadable we lose dedup but don't crash triage.
    console.warn(`[triage] could not load advance-file dedup index: ${e.message}`);
  }
}

// Write ADVANCE entry for full-eval queue. Skips silently if URL is already
// in the queue (prevents duplicate-bloat).
function writeAdvance(url, tier, score, archetype, reason) {
  if (DRY_RUN) return;
  _loadAdvanceIndex();
  if (_advanceUrlIndex.has(url)) return;  // dedup — already queued
  _advanceUrlIndex.add(url);
  const header = !existsSync(ADVANCE_FILE) ? 'url\ttier\tscore\tarchetype\treason\n' : '';
  appendFileSync(ADVANCE_FILE, header + [url, tier, score, archetype, reason].join('\t') + '\n');
}

// guessCompany and HTTP liveness now live in lib/ats-utils.mjs and lib/http-liveness.mjs.

async function checkLiveness(url) {
  return checkUrl(url, { timeoutMs: LIVENESS_TIMEOUT_MS });
}

// ── JSON schema parser (replaces brittle regex) ─────────────────
export function parseTriageOutput(raw) {
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
    // Accept canonical archetypes plus sub-tier suffixes the local LLMs
    // routinely emit (A2a/A2b/A2c, A1a/A1b, B1, B1a, etc.). Normalize to the
    // canonical 4 — sub-tier nuance isn't used downstream, so collapsing it
    // keeps Phase 3b decisions stable without forcing a parser-retry loop
    // that would never converge on small models like qwen3:8b / llama3.2:3b.
    let archetype = String(obj.archetype || '').trim().toUpperCase();
    const normalized = (
      /^A1/.test(archetype) ? 'A1' :
      /^A2/.test(archetype) ? 'A2' :
      /^B/.test(archetype)  ? 'B'  :
      /^NO|NONE|SKIP/.test(archetype) ? 'NO' :
      ''
    );
    if (!normalized) return { error: `invalid archetype: ${archetype}` };
    archetype = normalized;
    const decision = String(obj.decision || '');
    if (!['ADVANCE', 'SKIP'].includes(decision)) return { error: `invalid decision: ${decision}` };
    const reason = String(obj.reason || '').slice(0, 120);
    return { score, archetype, decision, reason };
  } catch (e) {
    return { error: `JSON parse failed: ${e.message}`, raw: cleaned.slice(0, 200) };
  }
}

// ── Haiku quick-score (Anthropic API direct, returns raw text) ──
// Originally used `claude -p` (Claude Code CLI), but that path has
// significant per-call overhead (auth + MCP config load + CLI startup)
// that pushed each call past the 60s timeout on prompts > 5KB. Calling
// the Messages API directly is ~5-15s/call instead of >60s, and uses the
// project .env ANTHROPIC_API_KEY (loaded into process.env at startup
// below). Cost: ~$0.001-0.003/call at Haiku 4.5 pricing.
async function callHaiku(prompt) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set in env');
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), USE_SONNET_JD ? 75_000 : 45_000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:       USE_SONNET_JD ? SONNET : HAIKU,
        max_tokens:  USE_SONNET_JD ? 800 : 300,
        temperature: 0,
        messages:    [{ role: 'user', content: prompt }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`anthropic HTTP ${res.status}: ${errBody.slice(0, 100)}`);
    }
    const data = await res.json();
    const text = (data.content || [])
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('')
      .trim();
    if (!text) throw new Error('anthropic returned empty response');
    return text;
  } finally {
    clearTimeout(t);
  }
}

// readCached lives in lib/fetch-utils.mjs (module-level cache shared across importers).

// ── Discard-pattern brief (computed once per process, appended to every triage prompt) ──
// Per modes/_shared.md "Discard Pattern Awareness": surface recent human discards so
// the LLM doesn't re-advance the same anti-patterns. Wrapped in try/catch because a
// missing data/discard-reasons.jsonl is normal on fresh installs.
let _discardBrief = '';
try { _discardBrief = renderDiscardPatternBrief({ limit: 20, format: 'markdown' }) || ''; }
catch (e) { console.warn(`[triage] discard-pattern brief unavailable: ${e.message}`); }

// ── Haiku quick-score with retry loop (max 3 attempts) ──────────
async function quickScore(url, tier, jdSnippet) {
  // Cached read — triage-prompt.md is the same for every item in a session
  const promptTemplate = readCached(TRIAGE_PROMPT) ?? readFileSync(TRIAGE_PROMPT, 'utf8');
  const prompt = promptTemplate
    .replace('{{URL}}', url)
    .replace('{{TIER}}', String(tier))
    .replace('{{JD_SNIPPET}}', (jdSnippet || '(page body unavailable — score based on URL/domain only)').slice(0, 3000))
    + _discardBrief;

  for (let attempt = 0; attempt < 3; attempt++) {
    let raw;
    try {
      raw = await callHaiku(prompt);
    } catch (err) {
      if (attempt < 2) continue;
      return { score: null, archetype: '?', decision: null, reason: `haiku error: ${err.message.slice(0, 60)}` };
    }

    const parsed = parseTriageOutput(raw);
    if (parsed && !parsed.error) return parsed;
    console.warn(`[triage] Parse failed (attempt ${attempt + 1}/3): ${parsed?.error || 'null'}`);
  }

  console.error(`[triage] All retries failed for ${url} — defaulting to SKIP`);
  return { score: 0, archetype: 'NO', decision: 'SKIP', reason: 'parse failure after 3 retries' };
}

// ── Gemini triage fallback ───────────────────────────────────────
async function quickScoreGemini(url, tier, jdSnippet) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
  return withRetryBackoff(async () => {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      // 2026-05-17 — gemini-2.0-flash deprecated Feb 2026 (shuts down June 1
      // 2026). gemini-3-flash-preview is the current Flash 3.x default per
      // Mitchell's preference. gemini-2.5-flash kept as fallback alias.
      // Gemini 3 uses thinking_level (minimal/low/medium/high) instead of
      // thinkingConfig.thinkingBudget. For triage we want minimal: a number
      // + 15-word reason needs zero internal reasoning overhead.
      model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 250,
        // Gemini 3 path: minimal thinking. Gemini 2.x path: thinkingBudget 0.
        // We send BOTH — Google silently ignores whichever doesn't apply.
        thinking_level: 'minimal',
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const promptTemplate = readCached(TRIAGE_PROMPT) ?? readFileSync(TRIAGE_PROMPT, 'utf8');
    const prompt = promptTemplate
      .replace('{{URL}}', url)
      .replace('{{TIER}}', String(tier))
      .replace('{{JD_SNIPPET}}', (jdSnippet || '').slice(0, 3000))
      + _discardBrief;
    const result = await model.generateContent([{ text: prompt }]);
    const raw = result.response.text().trim();
    const parsed = parseTriageOutput(raw);
    if (parsed.error) throw new Error(`Gemini parse failed: ${parsed.error}`);
    return parsed;
  }, 'gemini');
}

// ── Provider routing (local → anthropic → gemini) ────────────────
// TRIAGE_PROVIDER_PRIORITY env var controls order (default: local,anthropic,gemini)
const PROVIDER_CHAIN = (process.env.TRIAGE_PROVIDER_PRIORITY || 'local,anthropic,gemini')
  .split(',').map(p => p.trim());

async function quickScoreRouted(url, tier, jdSnippet) {
  // 1. In-memory session cache — free, zero latency
  if (_sessionCache.has(url)) {
    const cached = _sessionCache.get(url);
    console.log(`[cache-hit] session: ${url.slice(0, 60)}`);
    return cached;
  }

  // 2. Persistent URL cache — clear results within TTL window
  const persisted = _urlCache.get(url);
  if (persisted) {
    console.log(`[cache-hit] url-cache (${persisted.date}): ${url.slice(0, 60)}`);
    return { score: persisted.score, archetype: persisted.archetype, decision: persisted.decision, reason: 'cached result' };
  }

  for (const provider of PROVIDER_CHAIN) {
    if (isCircuitOpen(provider)) continue;
    try {
      switch (provider) {
        case 'local': {
          // Phase 6 — quickScoreLocal imported dynamically to avoid hard dep
          try {
            const { quickScoreLocal } = await import('./triage-local.mjs');
            const result = await quickScoreLocal(url, tier, jdSnippet);
            if (result && !result.error) {
              recordSuccess('local');
              _sessionCache.set(url, result);
              saveUrlCacheEntry(url, result.score, result.decision, result.archetype);
              return result;
            }
          } catch { /* local not available yet */ }
          continue;
        }
        case 'anthropic': {
          const result = await quickScore(url, tier, jdSnippet);
          if (result.score !== null) {
            _sessionCache.set(url, result);
            saveUrlCacheEntry(url, result.score, result.decision, result.archetype);
          }
          return result;
        }
        case 'gemini': {
          const result = await quickScoreGemini(url, tier, jdSnippet);
          _sessionCache.set(url, result);
          saveUrlCacheEntry(url, result.score, result.decision, result.archetype);
          return result;
        }
      }
    } catch (err) {
      console.warn(`[triage] ${provider} failed: ${err.message.slice(0, 80)} — trying next`);
    }
  }
  throw new Error('All triage providers exhausted');
}

// poolMap lives in lib/fetch-utils.mjs (shared with scan.mjs and heartbeat).

// ── Main ────────────────────────────────────────────────────────
async function main() {
  const quota = getQuota();
  const concLabel = CONCURRENCY > 1 ? ` (${CONCURRENCY}x concurrent)` : '';
  const mode  = LIVENESS_ONLY
    ? `LIVENESS-ONLY (free)${concLabel}`
    : `LIVENESS + HAIKU SCORE (T1≥${ADVANCE_THRESHOLDS[1]}/T2≥${ADVANCE_THRESHOLDS[2]}/T3≥${ADVANCE_THRESHOLDS[3]})`;

  console.log(`\n=== career-ops triage.mjs ===`);
  console.log(`Mode:        ${mode}`);
  console.log(`Tiers:       ${TIERS.join(',')}`);
  console.log(`Limit:       ${LIMIT} items this run`);
  if (!LIVENESS_ONLY) console.log(`Daily quota: ${quota.triaged}/${DAILY_LIMIT} triaged today`);
  if (DRY_RUN) console.log(`DRY RUN — no files will be modified\n`);

  if (!LIVENESS_ONLY && quota.triaged >= DAILY_LIMIT) {
    console.log(`Daily limit of ${DAILY_LIMIT} reached. Run tomorrow or pass --daily-limit=N to override.`);
    process.exit(0);
  }

  const allItems = parsePipeline(readFileSync(PIPELINE_FILE, 'utf8'));

  // ── Freshness sweep ─────────────────────────────────────────────
  // Mark stale URLs [x] before spending quota, then sort newest-first
  const staleUrls = [];
  const freshItems = [];
  for (const item of allItems) {
    const age = getUrlAgeDays(item.url);
    const ttl = getSourceTTL(item.url);
    if (ttl === 0 || (age !== null && age > ttl)) {
      staleUrls.push(item.url);
    } else {
      freshItems.push({ ...item, _age: age ?? 999 });
    }
  }
  if (staleUrls.length > 0 && !DRY_RUN) {
    console.log(`[freshness] Auto-expiring ${staleUrls.length} stale URLs (past source TTL) → marking [x]`);
    markCheckedBatch(staleUrls);
  }
  // Sort freshest first so quota is spent on highest-probability-live items
  freshItems.sort((a, b) => a._age - b._age);

  // ── Company filter (--companies, optional) ─────────────────────
  // Applied BEFORE the LIMIT slice so the quota / liveness / Haiku budget is
  // never spent on filtered-out items. Quota counts only scored items (the
  // increment lives in the SKIP/ADVANCE branch below), so filtered-out items
  // are free in every sense.
  const companyMatcher = buildCompanyMatcher(ARGS.companies);
  if (companyMatcher.isActive) {
    console.log(`[companies-filter] scope: ${companyMatcher.describe()}`);
  }
  const tierItems = freshItems.filter(i => TIERS.includes(i.tier));
  const scopedItems = companyMatcher.isActive
    ? tierItems.filter(i => companyMatcher.matchesUrl(i.url))
    : tierItems;
  if (companyMatcher.isActive) {
    console.log(`[companies-filter] tier-eligible items: ${tierItems.length} → ${scopedItems.length} after company filter`);
    if (scopedItems.length === 0 && tierItems.length > 0) {
      console.log(`[companies-filter] WARNING: 0 items matched scope ${companyMatcher.describe()} across ${tierItems.length} tier-eligible items — possible alias gap in lib/ats-utils.mjs:COMPANY_SLUG_ALIASES?`);
    }
  }
  const items = scopedItems.slice(0, LIMIT);
  console.log(`Found ${scopedItems.length} fresh items in tiers [${TIERS.join(',')}] (${staleUrls.length} expired, ${allItems.length} total pending)`);
  console.log(`Processing:  ${items.length} this run\n`);

  let processed = 0, dead = 0, skipped = 0, advanced = 0, uncertain = 0;

  // ── CONCURRENT LIVENESS-ONLY path ────────────────────────────
  if (LIVENESS_ONLY && CONCURRENCY > 1) {
    const deadUrls   = [];
    const skipLines  = [];

    await poolMap(
      items,
      async ({ url, tier }) => {
        const { live, reason } = await checkLiveness(url);
        return { url, tier, live, reason };
      },
      CONCURRENCY,
      (batchResults, done, total) => {
        const batchDead = batchResults.filter(r => r.live === false).length;
        const batchUncertain = batchResults.filter(r => r.live === null).length;
        process.stdout.write(`  [${done}/${total}] +${batchDead} dead, +${batchUncertain} uncertain\n`);
      }
    ).then(results => {
      for (const { url, tier, live, reason } of results) {
        if (live === false) {
          deadUrls.push(url);
          skipLines.push({ url, reason: `dead: ${reason}` });
          dead++;
          quota.dead++;
        } else if (live === null) {
          uncertain++;
        }
        processed++;
      }
    });

    // Batch file writes (single read/write pass for pipeline.md)
    markCheckedBatch(deadUrls);
    for (const { url, reason } of skipLines) writeSkip(url, reason);
    saveQuota(quota);

  } else {
    // ── SEQUENTIAL path (original behavior, also used for scoring) ──
    for (const { url, tier } of items) {
      if (!LIVENESS_ONLY && quota.triaged >= DAILY_LIMIT) {
        console.log('\nDaily quota hit — stopping. Resume tomorrow.\n');
        break;
      }

      const short = url.slice(0, 72) + (url.length > 72 ? '…' : '');
      process.stdout.write(`[T${tier}] ${short}\n      `);

      // ── Phase 0: Liveness ──
      const { live, reason, body } = await checkLiveness(url);

      if (live === false) {
        console.log(`❌ DEAD   ${reason}`);
        markChecked(url);
        writeSkip(url, `dead: ${reason}`);
        dead++;
        quota.dead++;
        processed++;
        saveQuota(quota);
        continue;
      }

      if (live === null) {
        console.log(`⚠️  uncertain (${reason}) → keeping`);
        uncertain++;
        if (LIVENESS_ONLY) { processed++; continue; }
      } else {
        process.stdout.write(`✅ live   `);
      }

      if (LIVENESS_ONLY) { processed++; continue; }

      // ── Phase 0.5: Zombie gate (free — no LLM tokens) ────────────────
      // Runs BEFORE the Haiku quick-score so zombie postings never reach
      // the LLM eval path. scoreZombie is synchronous and O(history) only.
      {
        const ageDays = getUrlAgeDays(url);
        const zombieHistory = buildZombieHistory();
        const jdRow = { url, title: '', company: guessCompany(url), location: '', body: body || '', ageDays };
        const zr = scoreZombie(jdRow, zombieHistory);
        // Compute cluster_n for the decision log (cluster.locations count is
        // internal to scorer — proxy by checking score)
        const clusterN = zr.breakdown.cluster === 1.0 ? '≥4' : '<4';
        logZombieDecision(url, zr, ageDays, clusterN);

        if (zr.decision === 'skip') {
          console.log(`🧟 ${zr.reason} → ZOMBIE SKIP`);
          markChecked(url);
          writeSkip(url, zr.reason);
          skipped++;
          quota.skipped++;
          quota.triaged++;
          processed++;
          saveQuota(quota);
          continue;
        }

        if (zr.decision === 'cheap-eval') {
          // Force Haiku for borderline postings even in Tier-5 (Sonnet) mode.
          // cheap-eval acknowledges the posting may be stale — Sonnet-level
          // reasoning is wasted here. The 3-band design is the safety net.
          process.stdout.write(`🔶 cheap-eval (${zr.composite.toFixed(2)})… `);
        }
      }

      // ── Phase 1: Quick-score (routed: local → anthropic → gemini) ──
      const threshold = ADVANCE_THRESHOLDS[tier] ?? ADVANCE_THRESHOLDS[2];
      process.stdout.write(`⚡ scoring… `);

      const { score, archetype, decision, reason: scoreReason } = await quickScoreRouted(url, tier, body || '');

      if (score === null) {
        console.log(`⚠️  score failed (${scoreReason}) → advancing cautiously`);
        writeAdvance(url, tier, 0, '?', `score-fail: ${scoreReason}`);
        advanced++;
        quota.advanced++;
      } else if (score < threshold || decision === 'SKIP') {
        console.log(`⏭️  ${score.toFixed(1)}/5 → SKIP  (${scoreReason})`);
        markChecked(url);
        writeSkip(url, `score ${score.toFixed(1)}/5 < threshold ${threshold} | ${scoreReason}`);
        skipped++;
        quota.skipped++;
      } else {
        console.log(`🟢 ${score.toFixed(1)}/5 [${archetype}] → ADVANCE  (${scoreReason})`);
        writeAdvance(url, tier, score, archetype, scoreReason);
        advanced++;
        quota.advanced++;
      }

      quota.triaged++;
      processed++;
      saveQuota(quota);
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Processed:   ${processed}`);
  console.log(`Dead/purged: ${dead}`);
  if (!LIVENESS_ONLY) {
    console.log(`Skipped:     ${skipped}`);
    console.log(`Advanced:    ${advanced} → batch/triage-advance.tsv`);
    console.log(`Uncertain:   ${uncertain} (kept)`);
    console.log(`\nNext steps:`);
    console.log(`  • node batch-runner-batches.mjs   # submit advanced items to Batches API`);
    console.log(`  • node triage.mjs --tier=2,3      # score more tiers`);
  } else {
    console.log(`Uncertain:   ${uncertain} (kept in pipeline)`);
    const remaining = allItems.filter(i => TIERS.includes(i.tier)).length - processed;
    console.log(`\nPipeline reduced by ${dead} dead items. ~${remaining} still pending in selected tiers.`);
    if (dead > 0) console.log(`Run: node triage.mjs --liveness-only --concurrency=${CONCURRENCY} --limit=1000 to continue.`);
  }
}

// Guard: only run main() when invoked as the entrypoint, so test files can
// import this module without triggering the script.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('\nFatal error:', err.message);
    process.exit(1);
  });
}
