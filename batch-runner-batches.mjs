#!/usr/bin/env node
/**
 * batch-runner-batches.mjs — Submit pipeline evaluations via Anthropic Message Batches API
 *
 * Costs ~$0.02-0.05 per full evaluation vs $0.80-1.50 via headless `claude -p`.
 * Batches API gives 50% off standard per-token rates and runs async (up to 24h).
 *
 * Phases:
 *   submit  — Fetch JDs, build batch request, submit to API, save batch ID
 *   poll    — Check batch status, download results when done
 *   process — Parse results, write report .md files, write tracker TSV lines
 *
 * Usage:
 *   node batch-runner-batches.mjs submit [--limit=50] [--tier=1,2,3] [--dry-run]
 *   node batch-runner-batches.mjs poll
 *   node batch-runner-batches.mjs process
 *   node batch-runner-batches.mjs run     # submit + poll + process in one go
 *   node batch-runner-batches.mjs status  # show current batch state
 *
 * Requirements:
 *   ANTHROPIC_API_KEY must be set (console.anthropic.com → API Keys)
 *   Node ≥ 18 (native fetch)
 */

import {
  readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logBatchCost } from './scripts/cost-logger.mjs';
import { SONNET } from './lib/models.mjs';
import { readCached } from './lib/fetch-utils.mjs';
import { guessCompany, buildCompanyMatcher } from './lib/ats-utils.mjs';
import { checkUrl } from './lib/http-liveness.mjs';
import { renderDiscardPatternBrief } from './lib/discard-pattern-injector.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// ── Args ─────────────────────────────────────────────────────────
const PHASE = process.argv[2] ?? 'status';
const ARGS  = Object.fromEntries(
  process.argv.slice(3)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v = true] = a.slice(2).split('='); return [k, v]; })
);
const LIMIT   = parseInt(ARGS.limit   ?? '100');
const TIERS   = (ARGS.tier ?? '1,2,3').split(',').map(Number);
const MODEL   = ARGS.model ?? SONNET;
const DRY_RUN = ARGS['dry-run'] === true || ARGS['dry-run'] === 'true';
const LIVENESS_TIMEOUT_MS = 10_000;

// ── Paths ─────────────────────────────────────────────────────────
const ADVANCE_FILE   = join(ROOT, 'batch/triage-advance.tsv');
const BATCH_STATE    = join(ROOT, 'batch/batches-api-state.json');
const CV_FILE        = join(ROOT, 'cv.md');
const DIGEST_FILE    = join(ROOT, 'article-digest.md');
const PROFILE_FILE   = join(ROOT, 'config/profile.yml');
const SCAN_HISTORY   = join(ROOT, 'data/scan-history.tsv');
const APPLICATIONS   = join(ROOT, 'data/applications.md');
const REPORTS_DIR    = join(ROOT, 'reports');
const TRACKER_DIR    = join(ROOT, 'batch/tracker-additions');
const PIPELINE_FILE  = join(ROOT, 'data/pipeline.md');

const ANTHROPIC_API  = 'https://api.anthropic.com/v1';
const BATCHES_VERSION = '2023-06-01';
const BETAS          = 'message-batches-2024-09-24,prompt-caching-2024-07-31';

// ── API Key ───────────────────────────────────────────────────────
function getApiKey() {
  // Check env first
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim()) {
    return process.env.ANTHROPIC_API_KEY.trim();
  }
  // Check .env file
  try {
    const envContent = readFileSync(join(ROOT, '.env'), 'utf8');
    const match = envContent.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match && match[1].trim() && !match[1].trim().startsWith('#')) {
      return match[1].trim();
    }
  } catch {}
  return null;
}

function requireApiKey() {
  const key = getApiKey();
  if (!key) {
    console.error(`
ERROR: ANTHROPIC_API_KEY not set.

The Batches API requires a direct Anthropic API key (separate from Claude Max).

To get one:
  1. Go to console.anthropic.com
  2. Settings → API Keys → Create Key
  3. Add to career-ops/.env:
       ANTHROPIC_API_KEY=sk-ant-...

Then re-run this script.
`);
    process.exit(1);
  }
  return key;
}

// ── Anthropic Batches API calls ───────────────────────────────────
// ε 2026-05-19 — fetch hardening. Every call now has an AbortSignal.timeout
// so a hung Anthropic API endpoint can no longer freeze the entire batch
// pipeline. Defaults to 2min (control-plane ops: submit/poll/cancel are fast)
// but overridable per-call. Results-download is intentionally longer (10min)
// because JSONL streams can be 100s of MB and the Anthropic SDK ships 300s
// as its own ceiling for batch.results — we match.
const FETCH_TIMEOUT_DEFAULT_MS = parseInt(process.env.BATCH_API_FETCH_TIMEOUT_MS || '120000', 10);
const FETCH_TIMEOUT_RESULTS_MS = parseInt(process.env.BATCH_API_RESULTS_TIMEOUT_MS || '600000', 10);

async function apiCall(method, path, body, apiKey, { timeoutMs = FETCH_TIMEOUT_DEFAULT_MS } = {}) {
  let res;
  try {
    res = await fetch(`${ANTHROPIC_API}${path}`, {
      method,
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': BATCHES_VERSION,
        'anthropic-beta':    BETAS,
        'content-type':      'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error(`API ${method} ${path} → timeout after ${timeoutMs}ms`);
    }
    throw err;
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${method} ${path} → ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

// readCached imported from lib/fetch-utils.mjs (shared module-level cache).

// ── Source file readers ───────────────────────────────────────────
function readCv()      { return readCached(CV_FILE)      ?? '(cv.md not found)'; }
function readDigest()  { return readCached(DIGEST_FILE)  ?? '(article-digest.md not found)'; }
function readProfile() { return readCached(PROFILE_FILE) ?? '(config/profile.yml not found)'; }

// ── Static context block (built once per batch run, cached by API) ─
// Reads from pre-baked bundle if available (scripts/prebake-context.mjs),
// otherwise falls back to reading individual files.
const BAKED_CONTEXT = join(ROOT, 'data', 'baked-context.md');

function buildStaticContextBlock(cvText, digestText, profileText) {
  // Prefer baked bundle — single read, hash-validated by prebake-context.mjs
  const baked = readCached(BAKED_CONTEXT);
  let block;
  if (baked) {
    block = `You are a job evaluation AI for Mitchell Williams. Produce a full A-G evaluation of this job posting.\n\n${baked}`;
  } else {
    const SHARED_FILE  = join(ROOT, 'modes/_shared.md');
    const PROFILE_MODE = join(ROOT, 'modes/_profile.md');
    const sharedText   = readCached(SHARED_FILE)  ?? '';
    const profileMode  = readCached(PROFILE_MODE) ?? '';

    block = [
      `You are a job evaluation AI for Mitchell Williams. Produce a full A-G evaluation of this job posting.\n`,
      `--- cv.md ---\n${cvText}`,
      `--- config/profile.yml ---\n${profileText}`,
      `--- modes/_shared.md ---\n${sharedText}`,
      `--- modes/_profile.md ---\n${profileMode}`,
      `--- article-digest.md ---\n${digestText}`,
    ].join('\n\n').trim();
  }

  const tokenEst = Math.round(block.length / 4);
  const source   = baked ? 'baked-context.md' : 'individual files';
  console.log(`[cache] Static block: ~${tokenEst.toLocaleString()} tokens (source: ${source}, cache_control: ephemeral)`);
  if (tokenEst < 1024) {
    console.warn('[cache] WARNING: static block < 1024 tokens — cache hit rate will be low');
  }
  return block;
}

// ── Dynamic per-item prompt (JD + URL + report metadata only) ─────
function buildDynamicEvalPrompt(item, jdText, reportNum, date) {
  const company  = guessCompany(item.url);
  const scanSnip = scanHistorySnippet(company);

  return `## Job Posting
URL: ${item.url}
Triage score: ${item.score}/5 (archetype: ${item.archetype})
Report number: ${reportNum.toString().padStart(3, '0')}
Date: ${date}

### JD Content (first 5,500 chars)
${jdText || '(JD unavailable — evaluate from URL and company context only)'}

## Scan History (prior appearances of this company)
${scanSnip}

---

## Instructions

Produce a complete evaluation in this EXACT markdown format. The header block must be verbatim.

\`\`\`
# Evaluation: {Company} — {Role}

**Date:** ${date}
**Archetype:** {detected archetype from the 6 in the system}
**Score:** {X.X/5}
**Legitimacy:** {High Confidence | Proceed with Caution | Suspicious}
**URL:** ${item.url}
**PDF:** ❌ (Batches API mode — run generate-pdf.mjs separately if applying)
**Batch ID:** batches-api-${date}
**Model:** ${MODEL}
**Verification:** unconfirmed (batch mode)

---

## A) Role Summary

Table with: Detected archetype, Domain, Function, Seniority, Remote policy, Team size, TL;DR.

## B) CV Match

Table mapping each JD requirement to exact lines from the CV above.
Include a Gaps section.

## C) Level and Strategy

1. Level detected in JD vs candidate level
2. "Sell senior without lying" plan
3. "If downleveled" plan

## D) Comp and Market

Estimated comp range based on role type and seniority (note: live web search unavailable in batch mode).
Comp score (1-5).

## E) Personalization Plan

Top 5 CV changes + Top 5 LinkedIn changes for this specific role.

## F) Interview Plan

6-8 STAR stories mapped to JD requirements.

## G) Posting Legitimacy

Assessment of legitimacy using available signals (JD quality, scan history above, company hiring context).
Three tiers: High Confidence / Proceed with Caution / Suspicious.

---

## Global Score

| Dimension | Score |
|-----------|-------|
| CV Match | X/5 |
| North Star Alignment | X/5 |
| Comp | X/5 |
| Cultural Signals | X/5 |
| **Global** | **X.X/5** |

## Extracted Keywords
(15-20 keywords from JD for ATS)
\`\`\`

## Rules
- NEVER invent experience or metrics not in the CV or article-digest above
- North Star = Anthropic/OpenAI/xAI/DeepMind/Mistral/Sierra → 1.3x weight for safety-alignment signals
- Comp floor: $175K total comp (Seattle $180K), target $200K-$320K
- Only recommend applying (score ≥ 4.0) if role is genuinely Mitchell-shaped
- End your response with a JSON block on its own line:
  {"batch_status":"completed","score":X.X,"company":"{company}","role":"{role}","archetype":"{arch}","legitimacy":"{tier}"}`;
}

// Return just the lines from scan-history.tsv that contain the company
function scanHistorySnippet(company) {
  try {
    const hist = readFileSync(SCAN_HISTORY, 'utf8');
    const hits = hist.split('\n').filter(l => l.toLowerCase().includes(company.toLowerCase())).slice(0, 10);
    return hits.length ? hits.join('\n') : '(no prior scans for this company)';
  } catch { return '(scan-history.tsv not found)'; }
}

// Get next report number
function nextReportNum() {
  const existing = readdirSync(REPORTS_DIR)
    .map(f => parseInt(f.slice(0, 3)))
    .filter(n => !isNaN(n));
  return existing.length ? (Math.max(...existing) + 1) : 1;
}

// Get last tracker number from applications.md
function lastTrackerNum() {
  try {
    const lines = readFileSync(APPLICATIONS, 'utf8').split('\n').filter(l => l.startsWith('|'));
    for (let i = lines.length - 1; i >= 0; i--) {
      const cols = lines[i].split('|').map(c => c.trim());
      const n = parseInt(cols[1]);
      if (!isNaN(n) && n > 0) return n;
    }
  } catch {}
  return 0;
}

// JD Fetcher — wraps the shared liveness check.
// Treats uncertain pages (live=null) as ok:true to preserve the prior lenient
// behavior (the old EXPIRED_PATTERNS list didn't require an apply control).
// 5,500 chars ≈ 1,375 tokens — covers role/requirements; trims benefits boilerplate.
async function fetchJD(url) {
  const { live, reason, body } = await checkUrl(url, { timeoutMs: LIVENESS_TIMEOUT_MS });
  if (live === false) return { ok: false, reason, text: '' };
  return { ok: true, reason: reason || 'live', text: (body || '').slice(0, 5_500) };
}

// ── Triage-advance reader ─────────────────────────────────────────
function readAdvanceItems() {
  if (!existsSync(ADVANCE_FILE)) return [];
  const lines = readFileSync(ADVANCE_FILE, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('url'));
  return lines.map(l => {
    const [url, tier, score, archetype, reason] = l.split('\t');
    return { url: url?.trim(), tier: parseInt(tier) || 1, score: parseFloat(score) || 0, archetype: archetype?.trim() || '?', reason: reason?.trim() || '' };
  }).filter(i => i.url && i.url.startsWith('http'));
}

// ── Build evaluation prompt for one item ─────────────────────────
function buildEvalPrompt(item, jdText, cvText, digestText, profileText, reportNum, date) {
  const company = guessCompany(item.url);
  const scanSnip = scanHistorySnippet(company);

  return `You are a job evaluation AI for Mitchell Williams. Produce a full A-G evaluation of this job posting.

## Candidate Profile
${profileText.slice(0, 3000)}

## CV (canonical — do not invent metrics, read from here)
${cvText}

## Portfolio & Proof Points (article-digest.md — takes precedence over cv.md for metrics)
${digestText}

## Job Posting
URL: ${item.url}
Triage score: ${item.score}/5 (archetype: ${item.archetype})
Report number: ${reportNum.toString().padStart(3, '0')}
Date: ${date}

### JD Content (first 5,500 chars)
${jdText || '(JD unavailable — evaluate from URL and company context only)'}

## Scan History (prior appearances of this company)
${scanSnip}

---

## Instructions

Produce a complete evaluation in this EXACT markdown format. The header block must be verbatim.

\`\`\`
# Evaluation: {Company} — {Role}

**Date:** ${date}
**Archetype:** {detected archetype from the 6 in the system}
**Score:** {X.X/5}
**Legitimacy:** {High Confidence | Proceed with Caution | Suspicious}
**URL:** ${item.url}
**PDF:** ❌ (Batches API mode — run generate-pdf.mjs separately if applying)
**Batch ID:** batches-api-${date}
**Model:** ${MODEL}
**Verification:** unconfirmed (batch mode)

---

## A) Role Summary

Table with: Detected archetype, Domain, Function, Seniority, Remote policy, Team size, TL;DR.

## B) CV Match

Table mapping each JD requirement to exact lines from the CV above.
Include a Gaps section.

## C) Level and Strategy

1. Level detected in JD vs candidate level
2. "Sell senior without lying" plan
3. "If downleveled" plan

## D) Comp and Market

Estimated comp range based on role type and seniority (note: live web search unavailable in batch mode).
Comp score (1-5).

## E) Personalization Plan

Top 5 CV changes + Top 5 LinkedIn changes for this specific role.

## F) Interview Plan

6-8 STAR stories mapped to JD requirements.

## G) Posting Legitimacy

Assessment of legitimacy using available signals (JD quality, scan history above, company hiring context).
Three tiers: High Confidence / Proceed with Caution / Suspicious.

---

## Global Score

| Dimension | Score |
|-----------|-------|
| CV Match | X/5 |
| North Star Alignment | X/5 |
| Comp | X/5 |
| Cultural Signals | X/5 |
| **Global** | **X.X/5** |

## Extracted Keywords
(15-20 keywords from JD for ATS)
\`\`\`

## Rules
- NEVER invent experience or metrics not in the CV or article-digest above
- North Star = Anthropic/OpenAI/xAI/DeepMind/Mistral/Sierra → 1.3x weight for safety-alignment signals
- Comp floor: $175K total comp (Seattle $180K), target $200K-$320K
- Only recommend applying (score ≥ 4.0) if role is genuinely Mitchell-shaped
- End your response with a JSON block on its own line:
  {"batch_status":"completed","score":X.X,"company":"{company}","role":"{role}","archetype":"{arch}","legitimacy":"{tier}"}`;
}

// guessCompany imported from lib/ats-utils.mjs.

// ── State file helpers ────────────────────────────────────────────
function loadState() {
  if (existsSync(BATCH_STATE)) return JSON.parse(readFileSync(BATCH_STATE, 'utf8'));
  return { batches: [] };
}
function saveState(state) {
  writeFileSync(BATCH_STATE, JSON.stringify(state, null, 2));
}

// ── PHASE: submit ─────────────────────────────────────────────────
async function phaseSubmit(apiKey) {
  // ── Company filter (--companies, optional) ────────────────────────
  // Applied BEFORE the slice so a small scoped run isn't starved by LIMIT
  // capping the unscoped portion of triage-advance.tsv. When active, an empty
  // result set exits cleanly (no zero-row payload to Anthropic).
  const companyMatcher = buildCompanyMatcher(ARGS.companies);
  if (companyMatcher.isActive) console.log(`[companies-filter] scope: ${companyMatcher.describe()}`);

  const rawItems = readAdvanceItems();
  const scopedItems = companyMatcher.isActive
    ? rawItems.filter(i => companyMatcher.matchesUrl(i.url))
    : rawItems;
  if (companyMatcher.isActive) {
    console.log(`[companies-filter] advance.tsv: ${rawItems.length} → ${scopedItems.length} after company filter`);
    if (scopedItems.length === 0) {
      console.log('[companies-filter] no advance.tsv rows matched scope — batch is a no-op');
      return;
    }
  }
  const items = scopedItems.slice(0, LIMIT).filter(i => TIERS.includes(i.tier));
  if (items.length === 0) {
    console.log('No items in batch/triage-advance.tsv. Run triage.mjs first.');
    console.log('  node triage.mjs --liveness-only --concurrency=20 --limit=1000');
    console.log('  node triage.mjs --limit=200');
    return;
  }

  console.log(`\nBuilding batch for ${items.length} items (model: ${MODEL})...\n`);

  const cvText      = readCv();
  const digestText  = readDigest();
  const profileText = readProfile();
  const date        = new Date().toISOString().slice(0, 10);
  let   reportNum   = nextReportNum();

  // Build static context block ONCE for the entire batch (cached by Anthropic API)
  const staticBlock = buildStaticContextBlock(cvText, digestText, profileText);

  // Build discard-pattern brief ONCE per submit run. Appended to each item's
  // user prompt (NOT the cached system block) so cache hit rate stays high
  // while new discards still influence the next batch. See modes/_shared.md
  // "Discard Pattern Awareness".
  let discardBrief = '';
  try { discardBrief = renderDiscardPatternBrief({ limit: 20, format: 'markdown' }) || ''; }
  catch (e) { console.warn(`[batch] discard-pattern brief unavailable: ${e.message}`); }

  const requests = [];
  let fetchErrors = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    process.stdout.write(`  [${i + 1}/${items.length}] Fetching JD: ${item.url.slice(0, 60)}…`);

    const { ok, reason, text } = await fetchJD(item.url);
    if (!ok) {
      process.stdout.write(` ❌ ${reason} — skipping\n`);
      fetchErrors++;
      continue;
    }
    process.stdout.write(` ✅\n`);

    const customId    = `eval-${date}-${i.toString().padStart(4, '0')}`;
    const userPrompt  = buildDynamicEvalPrompt(item, text, reportNum, date) + discardBrief;

    // Static context in system block with cache_control — API caches this prefix across requests
    // max_tokens capped at 1,400: eval reports are 500–900 tokens; 4096 wastes money on runaway outputs
    // temperature: 0 eliminates verbose preambles that inflate output tokens in scoring tasks
    //
    // QUALITY WARNING (added 2026-05-16): 1400 is set assuming the current
    // A–F + Block G prompt produces ≤900 token reports. If you add new
    // report sections (Block H, additional Cultural Signals depth, longer
    // rationale fields), bump this to avoid silent mid-report truncation.
    // Symptoms of truncation: reports missing trailing sections, dashboard
    // shows "—" for late blocks, score-without-rationale rows. Same pattern
    // as the maxOutputTokens=80 bug in gemini-eval.mjs.
    let params;
    try {
      params = {
        model: MODEL,
        max_tokens: 1400,
        temperature: 0,
        system: [{ type: 'text', text: staticBlock, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userPrompt }],
      };
    } catch (cacheErr) {
      // Fallback: if cache_control causes any issue, collapse to flat user message
      console.warn(`[cache] Falling back to flat message for ${customId}: ${cacheErr.message}`);
      params = {
        model: MODEL,
        max_tokens: 1400,
        temperature: 0,
        messages: [{ role: 'user', content: `${staticBlock}\n\n${userPrompt}` }],
      };
    }

    requests.push({
      custom_id: customId,
      params,
      _meta: { url: item.url, tier: item.tier, triageScore: item.score, archetype: item.archetype, reportNum, date },
    });
    reportNum++;
  }

  if (requests.length === 0) {
    console.log(`\nAll ${fetchErrors} items had fetch errors — nothing to submit.`);
    return;
  }

  // Strip _meta before submitting (not an API field)
  const apiRequests = requests.map(r => ({ custom_id: r.custom_id, params: r.params }));

  console.log(`\n${requests.length} requests ready (${fetchErrors} skipped due to fetch errors).`);
  if (DRY_RUN) {
    // Cost estimate: static block cached (90% hit → $0.15/MTok read), dynamic ~2k tokens input, output capped at 1,400
    const staticTokens  = 26_715;
    const dynamicTokens = 2_000;
    const outputTokens  = 900; // p95 actual (max_tokens=1400 hard cap)
    const costPerItem = (staticTokens * 0.10 * 1.50 / 1e6)  // cache miss (10%)
                      + (staticTokens * 0.90 * 0.15 / 1e6)  // cache read (90%)
                      + (dynamicTokens * 1.50 / 1e6)         // dynamic input
                      + (outputTokens  * 7.50 / 1e6);        // output
    console.log(`\nDRY RUN — would submit ${requests.length} requests to Batches API.`);
    console.log(`Estimated cost: ~$${(requests.length * costPerItem).toFixed(3)} (Sonnet+cache, 50% off, max_tokens=1400)`);
    return;
  }

  // Budget guard — abort if rolling 30-day spend exceeds MONTHLY_BUDGET_USD
  const MONTHLY_BUDGET = parseFloat(process.env.MONTHLY_BUDGET_USD ?? '0');
  if (MONTHLY_BUDGET > 0) {
    const COST_LOG = join(ROOT, 'data', 'cost-log.tsv');
    if (existsSync(COST_LOG)) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      let spent = 0;
      for (const line of readFileSync(COST_LOG, 'utf8').split('\n').slice(1)) {
        if (!line.trim()) continue;
        const cols = line.split('\t');
        if (new Date(cols[0]) >= cutoff) spent += parseFloat(cols[7]) || 0;
      }
      if (spent >= MONTHLY_BUDGET) {
        console.error(`\n⛔ Budget guard: $${spent.toFixed(2)} spent (limit $${MONTHLY_BUDGET.toFixed(2)}/mo) — aborting batch submission.`);
        console.error(`   Unset MONTHLY_BUDGET_USD or raise the limit to proceed.`);
        process.exit(1);
      }
      console.log(`[budget] $${spent.toFixed(2)} / $${MONTHLY_BUDGET.toFixed(2)} spent this month`);
    }
  }

  console.log(`\nSubmitting to Batches API…`);
  const batch = await apiCall('POST', '/messages/batches', { requests: apiRequests }, apiKey);

  const state = loadState();
  state.batches.push({
    id: batch.id,
    submitted_at: new Date().toISOString(),
    request_count: requests.length,
    model: MODEL,
    status: batch.processing_status,
    requests: requests.map(r => ({ custom_id: r.custom_id, ...r._meta })),
  });
  saveState(state);

  console.log(`\n✅ Batch submitted!`);
  console.log(`   Batch ID:      ${batch.id}`);
  console.log(`   Requests:      ${requests.length}`);
  console.log(`   Status:        ${batch.processing_status}`);
  console.log(`   Est. cost:     ~$${(requests.length * 0.035).toFixed(2)}`);
  console.log(`\nPoll for completion:`);
  console.log(`   node batch-runner-batches.mjs poll`);
  console.log(`   (Batches API takes up to 24h; usually done within 1h for small batches)`);
}

// ── PHASE: poll ───────────────────────────────────────────────────
async function phasePoll(apiKey) {
  const state = loadState();
  const pending = state.batches.filter(b => b.status !== 'ended');

  if (pending.length === 0) {
    console.log('No pending batches. Run submit first.');
    return;
  }

  for (const batchRecord of pending) {
    const batch = await apiCall('GET', `/messages/batches/${batchRecord.id}`, null, apiKey);
    batchRecord.status = batch.processing_status;
    batchRecord.request_counts = batch.request_counts;
    batchRecord.results_url = batch.results_url;
    batchRecord.ended_at = batch.ended_at;
    console.log(`\nBatch ${batchRecord.id}`);
    console.log(`  Status:    ${batch.processing_status}`);
    if (batch.request_counts) {
      const c = batch.request_counts;
      console.log(`  Progress:  ${c.succeeded}✅ ${c.errored}❌ ${c.processing}⏳ of ${c.succeeded + c.errored + c.processing + (c.canceled || 0)} total`);
    }
    if (batch.processing_status === 'ended') {
      console.log(`  Done! Run: node batch-runner-batches.mjs process`);
    } else {
      console.log(`  Check again in a few minutes.`);
    }
  }

  saveState(state);
}

// ── PHASE: process ────────────────────────────────────────────────
async function phaseProcess(apiKey) {
  const state = loadState();
  const done  = state.batches.filter(b => b.status === 'ended' && !b.processed_at);

  if (done.length === 0) {
    console.log('No completed-but-unprocessed batches. Run poll first.');
    return;
  }

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  if (!existsSync(TRACKER_DIR)) mkdirSync(TRACKER_DIR, { recursive: true });

  let trackerNum = lastTrackerNum();
  const date = new Date().toISOString().slice(0, 10);

  for (const batchRecord of done) {
    console.log(`\nProcessing batch ${batchRecord.id} (${batchRecord.request_count} requests)…`);

    // Download results (JSONL stream)
    // ε 2026-05-19 — AbortSignal.timeout added. Anthropic's batches results
    // endpoint can stream 100s of MB; 10min ceiling matches their official SDK
    // and stops a stalled stream from blocking the rest of the run.
    let res;
    try {
      res = await fetch(`${ANTHROPIC_API}/messages/batches/${batchRecord.id}/results`, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': BATCHES_VERSION, 'anthropic-beta': BETAS },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_RESULTS_MS),
      });
    } catch (err) {
      const reason = (err.name === 'TimeoutError' || err.name === 'AbortError')
        ? `timeout after ${FETCH_TIMEOUT_RESULTS_MS}ms`
        : err.message;
      console.error(`Failed to fetch results for ${batchRecord.id}: ${reason}`);
      continue;
    }
    if (!res.ok) { console.error(`Failed to fetch results: ${res.status}`); continue; }

    const text = await res.text();
    const results = text.trim().split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

    let written = 0, errors = 0;

    for (const result of results) {
      const meta = batchRecord.requests?.find(r => r.custom_id === result.custom_id);
      if (!meta) { errors++; continue; }

      if (result.result?.type !== 'succeeded') {
        console.log(`  ❌ ${result.custom_id}: ${result.result?.type} — ${result.result?.error?.message ?? 'unknown'}`);
        errors++;
        continue;
      }

      const rawText = result.result.message?.content?.[0]?.text ?? '';

      // Extract JSON summary from end of response
      const jsonMatch = rawText.match(/\{[^{}]*"batch_status"\s*:\s*"completed"[^{}]*\}/);
      let company = meta.archetype === '?' ? guessCompany(meta.url) : guessCompany(meta.url);
      let role = 'Unknown Role';
      let score = meta.triageScore || 0;
      let archetype = meta.archetype || '?';
      let legitimacy = 'Proceed with Caution';

      if (jsonMatch) {
        try {
          const j = JSON.parse(jsonMatch[0]);
          company    = j.company    || company;
          role       = j.role       || role;
          score      = parseFloat(j.score) || score;
          archetype  = j.archetype  || archetype;
          legitimacy = j.legitimacy || legitimacy;
        } catch {}
      } else {
        // Fallback: extract from report header
        const scoreM   = rawText.match(/\*\*Score:\*\*\s*([\d.]+)/);
        const companyM = rawText.match(/# Evaluation:\s*([^—\n]+)/);
        const roleM    = rawText.match(/# Evaluation:[^—]*—\s*([^\n]+)/);
        const legitM   = rawText.match(/\*\*Legitimacy:\*\*\s*([^\n]+)/);
        if (scoreM)   score      = parseFloat(scoreM[1]);
        if (companyM) company    = companyM[1].trim();
        if (roleM)    role       = roleM[1].trim();
        if (legitM)   legitimacy = legitM[1].trim();
      }

      // Write report file
      const slug     = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const numStr   = meta.reportNum.toString().padStart(3, '0');
      const filename = `${numStr}-${slug}-${date}.md`;
      const filepath = join(REPORTS_DIR, filename);

      // Strip the JSON block from report text before saving
      const cleanReport = rawText.replace(/\{[^{}]*"batch_status"\s*:\s*"completed"[^{}]*\}/, '').trim();
      writeFileSync(filepath, cleanReport);

      // Write tracker TSV
      trackerNum++;
      const tsvLine = [
        trackerNum,
        date,
        company,
        role,
        'Evaluated',
        `${score.toFixed(1)}/5`,
        '❌',
        `[${numStr}](reports/${filename})`,
        `Batches API eval | ${archetype} | ${legitimacy} | triage ${meta.triageScore}/5`,
      ].join('\t');
      appendFileSync(join(TRACKER_DIR, `${numStr}-${slug}.tsv`), tsvLine + '\n');

      // Mark URL as checked in pipeline.md
      try {
        const pipeline = readFileSync(PIPELINE_FILE, 'utf8');
        const updated  = pipeline.replace(`- [ ] ${meta.url}`, `- [x] ${meta.url}`);
        if (updated !== pipeline) writeFileSync(PIPELINE_FILE, updated);
      } catch {}

      console.log(`  ✅ ${numStr} ${company} — ${role} (${score.toFixed(1)}/5)`);
      written++;
    }

    // Aggregate token usage across succeeded results and log cost
    const aggregatedUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    for (const result of results) {
      if (result.result?.type === 'succeeded') {
        const u = result.result.message?.usage ?? {};
        aggregatedUsage.input_tokens                += u.input_tokens                ?? 0;
        aggregatedUsage.output_tokens               += u.output_tokens               ?? 0;
        aggregatedUsage.cache_read_input_tokens     += u.cache_read_input_tokens     ?? 0;
        aggregatedUsage.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
      }
    }
    try {
      logBatchCost({ batchId: batchRecord.id, model: batchRecord.model ?? MODEL, requests: written, usage: aggregatedUsage });
    } catch (e) {
      console.warn(`[cost] Could not log batch cost: ${e.message}`);
    }

    batchRecord.processed_at = new Date().toISOString();
    batchRecord.written = written;
    batchRecord.errors  = errors;

    console.log(`\n  Written: ${written} reports | Errors: ${errors}`);
    console.log(`  Run: node merge-tracker.mjs   to sync tracker`);
    if (written > 0) console.log(`  Run: node verify-pipeline.mjs  to validate`);

    // 2026-05-19 cohesion fix (Mitchell postmortem) — dequeue processed URLs
    // from batch/triage-advance.tsv so the modal "drains to 0" promise is
    // honest. Without this, every Process All run re-submits the same URLs
    // to Anthropic Batches API (real spend on duplicate evals; dedup happens
    // only inside merge-tracker AFTER the API spend). Archive removed rows
    // to batch/triage-advance-archive/{date}-{batchId}.tsv (audit trail
    // preserved, reversible).
    try {
      const processedUrls = new Set(
        (batchRecord.requests || []).map(r => r.url).filter(Boolean)
      );
      if (processedUrls.size > 0 && existsSync(ADVANCE_FILE)) {
        const lines = readFileSync(ADVANCE_FILE, 'utf8').split('\n');
        const kept = [];
        const removed = [];
        for (const line of lines) {
          if (!line.trim()) { kept.push(line); continue; }
          if (line.startsWith('url\t')) { kept.push(line); continue; } // header
          const cols = line.split('\t');
          const url = cols[0];
          if (url && processedUrls.has(url)) {
            removed.push(line);
          } else {
            kept.push(line);
          }
        }
        if (removed.length > 0) {
          writeFileSync(ADVANCE_FILE, kept.join('\n'));
          const archiveDir = join(ROOT, 'batch/triage-advance-archive');
          if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
          const archivePath = join(archiveDir, `${new Date().toISOString().slice(0,10)}-${batchRecord.id}.tsv`);
          const header = 'url\ttier\tscore\tarchetype\treason';
          writeFileSync(archivePath, [header, ...removed].join('\n') + '\n');
          console.log(`  Dequeued ${removed.length} processed URL(s) from triage-advance.tsv → ${archivePath.replace(ROOT + '/', '')}`);
        }
      }
    } catch (err) {
      console.warn(`  ⚠ Could not dequeue from triage-advance.tsv: ${err.message} (non-fatal — items will re-submit next run)`);
    }
  }

  saveState(state);
}

// ── PHASE: status ─────────────────────────────────────────────────
function phaseStatus() {
  const state = loadState();
  const items = readAdvanceItems();
  console.log(`\n=== batch-runner-batches.mjs status ===`);
  console.log(`Triage queue: ${items.length} items in batch/triage-advance.tsv`);
  console.log(`Batches:      ${state.batches.length} total\n`);

  if (state.batches.length === 0) {
    console.log('No batches submitted yet.');
    console.log('Run: node triage.mjs --liveness-only --concurrency=20 --limit=1000');
    console.log('Then: node triage.mjs --limit=200  (Haiku scoring)');
    console.log('Then: node batch-runner-batches.mjs submit');
    return;
  }

  for (const b of state.batches) {
    const age = b.submitted_at ? Math.round((Date.now() - new Date(b.submitted_at)) / 60000) : '?';
    console.log(`  ${b.id}`);
    console.log(`    Submitted: ${b.submitted_at?.slice(0, 16)} (${age}m ago)`);
    console.log(`    Status:    ${b.status}`);
    console.log(`    Requests:  ${b.request_count}`);
    if (b.request_counts) {
      const c = b.request_counts;
      console.log(`    Progress:  ${c.succeeded}✅ ${c.errored}❌ ${c.processing}⏳`);
    }
    if (b.processed_at) console.log(`    Processed: ${b.processed_at?.slice(0, 16)} (${b.written} reports written)`);
    console.log('');
  }
}

// ── PHASE: run (all in one) ───────────────────────────────────────
async function phaseRun(apiKey) {
  await phaseSubmit(apiKey);
  const state = loadState();
  const latest = state.batches[state.batches.length - 1];
  if (!latest) return;

  console.log('\nPolling for completion (checks every 60s, up to 2h)…\n');
  for (let attempt = 0; attempt < 120; attempt++) {
    const batch = await apiCall('GET', `/messages/batches/${latest.id}`, null, apiKey);
    latest.status = batch.processing_status;
    latest.request_counts = batch.request_counts;
    latest.results_url = batch.results_url;
    saveState(state);

    const c = batch.request_counts || {};
    const done = (c.succeeded || 0) + (c.errored || 0);
    const total = done + (c.processing || 0) + (c.canceled || 0);
    process.stdout.write(`\r  ${done}/${total} complete (${batch.processing_status})   `);

    if (batch.processing_status === 'ended') {
      console.log('\n');
      await phaseProcess(apiKey);
      return;
    }
    await new Promise(r => setTimeout(r, 60_000));
  }
  console.log('\nTimed out after 2h. Run: node batch-runner-batches.mjs poll');
}

// ── Entry point ───────────────────────────────────────────────────
async function main() {
  console.log(`\n=== career-ops batch-runner-batches.mjs [${PHASE}] ===\n`);

  switch (PHASE) {
    case 'submit': {
      const key = requireApiKey();
      await phaseSubmit(key);
      break;
    }
    case 'poll': {
      const key = requireApiKey();
      await phasePoll(key);
      break;
    }
    case 'process': {
      const key = requireApiKey();
      await phaseProcess(key);
      break;
    }
    case 'run': {
      const key = requireApiKey();
      await phaseRun(key);
      break;
    }
    case 'status':
    default:
      phaseStatus();
      break;
  }
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
