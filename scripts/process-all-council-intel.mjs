#!/usr/bin/env node
/**
 * scripts/process-all-council-intel.mjs — Phase 3 council intel orchestrator.
 *
 * Per-company multi-model research workhorse for the Tier 5 enrichment pipeline.
 * Fans `callCouncil()` across the unique companies in Mitchell's Apply-Now queue
 * (or a provided subset), caches aggressively, auto-trashes defense-exclude items,
 * and surfaces hiring-momentum + TTO + toxicity signals.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * CLI usage
 * ──────────────────────────────────────────────────────────────────────────────
 *   # Default — enrich every unique company in data/apply-now-queue.json
 *   node scripts/process-all-council-intel.mjs
 *
 *   # Specific subset (comma-separated; matched against company field, case-insensitive)
 *   node scripts/process-all-council-intel.mjs --companies "Anthropic,OpenAI,xAI"
 *
 *   # Tune parallelism (default 5; Perplexity sonar-deep is the slow leg at ~2min)
 *   node scripts/process-all-council-intel.mjs --concurrency 3
 *
 *   # Bypass cache (re-research even cached companies — useful for testing)
 *   node scripts/process-all-council-intel.mjs --no-cache
 *
 *   # Dry-run: print plan + cost estimate, fire NO LLM calls
 *   node scripts/process-all-council-intel.mjs --dry-run
 *
 *   # Cost ceiling for this invocation (default = PER_RUN_CAP_PROCESS_ALL_USD or $250)
 *   node scripts/process-all-council-intel.mjs --max-cost 50
 *
 *   # Override output directory
 *   node scripts/process-all-council-intel.mjs --out-dir data/company-intel-cache
 *
 *   # Override the queue path (defaults to data/apply-now-queue.json)
 *   node scripts/process-all-council-intel.mjs --queue data/apply-now-queue.json
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Per-company workflow (see numbered comments in main loop)
 * ──────────────────────────────────────────────────────────────────────────────
 *   1. Defense-exclude check → write _excluded.md, SKIP (zero LLM cost).
 *   2. Cache check (30-day TTL) → use cached intel-{date}.json if present.
 *   3. Compose council brief with TTO context + role hints.
 *   4. Fire council via lib/council.mjs (7 models default, parallel, per-model timeout).
 *   5. Lightweight adjudicator (consensus reducer pattern — see lib/eval-council.mjs).
 *   6. Toxicity scoring via lib/toxicity-scorer.mjs (FLAG-FOR-REVIEW only, NEVER auto-trash).
 *   7. TTO enrichment — append/update data/tto-overrides.json when council surfaces signal.
 *   8. Write intel-{date}.json + intel-{date}.md to data/company-intel-cache/{slug}/.
 *   9. Aggregate cost tracking — stop launching new councils if ceiling hit.
 *
 * Outputs:
 *   - data/company-intel-cache/{slug}/intel-{YYYY-MM-DD}.json   (machine-readable)
 *   - data/company-intel-cache/{slug}/intel-{YYYY-MM-DD}.md     (human summary)
 *   - data/company-intel-cache/{slug}/council-{ts}.json         (raw council report)
 *   - data/company-intel-cache/{slug}/_excluded.md              (defense-exclude only)
 *   - data/company-intel-cache/{slug}/_toxicity-flag.md         (FLAG-REVIEW only)
 *   - data/process-all-council-intel-{ts}.log                   (per-run log)
 *   - data/process-all-council-intel-{ts}-summary.md            (final summary)
 *   - data/cost-log.tsv                                         (one appended row)
 *   - data/tto-overrides.json                                   (in-place updates if signal surfaced)
 *
 * Hard rules (per calibration brief 2026-05-16):
 *   - Defense-exclude (palantir, anduril, shield-ai) → auto-trash + zero LLM cost.
 *   - Toxicity scoring is FLAG-FOR-REVIEW only, NEVER auto-trash.
 *   - Per-run cost capped at PER_RUN_CAP_PROCESS_ALL_USD (default $250).
 *   - Rolling 30-day spend respected against MONTHLY_BUDGET_USD (default $500).
 *   - Script never commits or pushes — Mitchell commits at end of session.
 *   - Re-runnable: second invocation should cache-hit everything from the first.
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callCouncil } from '../lib/council.mjs';
import { estimateTTO } from '../lib/tto-estimator.mjs';
import { scoreToxicity } from '../lib/toxicity-scorer.mjs';

// ──────────────────────────────────────────────────────────────────────────────
// Paths + constants
// ──────────────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DEFAULT_QUEUE = join(ROOT, 'data/apply-now-queue.json');
const DEFAULT_OUT_DIR = join(ROOT, 'data/company-intel-cache');
const TTO_OVERRIDES_PATH = join(ROOT, 'data/tto-overrides.json');
const COST_LOG_PATH = join(ROOT, 'data/cost-log.tsv');

// Defense-exclude list per calibration brief 2026-05-16 — slugified.
// Items at these companies get an _excluded.md stub written; ZERO LLM cost.
const DEFENSE_EXCLUDE = new Set(['palantir', 'anduril', 'shield-ai']);

// Cache TTL: a fresh intel-{date}.json within this many days satisfies a cache hit.
const CACHE_TTL_DAYS = 30;

// Per-model rough cost estimates (USD) — used for ceiling checks BEFORE the call
// fires, and for cost-log attribution AFTER. These are intentionally conservative;
// real spend may differ. Council call typically lands around $1.50–2.50/company.
const PER_MODEL_COST_EST_USD = {
  'perplexity:sonar-deep-research': 0.80,  // multi-step search-and-synthesize
  'perplexity:sonar-reasoning-pro': 0.35,
  'xai:grok-4':                     0.30,
  'xai:grok-4-fast-reasoning':      0.15,
  'xai:grok-4-x-search':            0.20,
  'openai:gpt-5':                   0.40,
  'google:gemini-2.5-pro':          0.10,
  'anthropic:claude-opus-4-7':      0.30,
};
const PER_COMPANY_COST_EST_USD = 2.0;  // matches dashboard COST_PER_COMPANY_COUNCIL

// Per-run + monthly caps (env-overridable).
const PER_RUN_CAP = parseFloat(process.env.PER_RUN_CAP_PROCESS_ALL_USD || '250');
const MONTHLY_BUDGET = parseFloat(process.env.MONTHLY_BUDGET_USD || '500');

// Default parallelism — 5 keeps wall-clock reasonable for ~60-company runs while
// not pummeling Perplexity. Override with --concurrency.
const DEFAULT_CONCURRENCY = 5;

// ──────────────────────────────────────────────────────────────────────────────
// CLI argument parsing
// ──────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function arg(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}
function flag(name) { return args.includes(name); }

const CLI = {
  companies:   arg('--companies', '').split(',').map(s => s.trim()).filter(Boolean),
  concurrency: parseInt(arg('--concurrency', String(DEFAULT_CONCURRENCY)), 10) || DEFAULT_CONCURRENCY,
  noCache:     flag('--no-cache'),
  dryRun:      flag('--dry-run'),
  maxCost:     parseFloat(arg('--max-cost', String(PER_RUN_CAP))),
  outDir:      arg('--out-dir', DEFAULT_OUT_DIR),
  queue:       arg('--queue', DEFAULT_QUEUE),
};

// Resolve absolute output dir.
const OUT_DIR = CLI.outDir.startsWith('/') ? CLI.outDir : join(ROOT, CLI.outDir);
const QUEUE_PATH = CLI.queue.startsWith('/') ? CLI.queue : join(ROOT, CLI.queue);

// Per-run log + summary file paths (timestamped).
const RUN_TS = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_PATH = join(ROOT, `data/process-all-council-intel-${RUN_TS}.log`);
const SUMMARY_PATH = join(ROOT, `data/process-all-council-intel-${RUN_TS}-summary.md`);

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function todayDateStr() {
  // YYYY-MM-DD in local time (matches existing cost-log + report convention).
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ensureDir(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }

function logLine(s) {
  const line = `[${new Date().toISOString()}] ${s}`;
  console.log(line);
  if (!CLI.dryRun) {
    try { appendFileSync(LOG_PATH, line + '\n'); }
    catch { /* log writes never abort the run */ }
  }
}

/**
 * Rolling 30-day spend across data/cost-log.tsv. Tolerant of both TSV shapes
 * observed in the log (long-form 9-col Sonnet batch rows AND short-form 4-col
 * eval append rows — mirror of dashboard-server.mjs#getRolling30dSpend).
 */
function getRolling30dSpend() {
  if (!existsSync(COST_LOG_PATH)) return 0;
  const cutoff = Date.now() - 30 * 86400000;
  let total = 0;
  for (const line of readFileSync(COST_LOG_PATH, 'utf-8').split('\n')) {
    if (!line.trim() || line.startsWith('date\t')) continue;
    const cols = line.split('\t');
    let dateStr, cost;
    if (cols.length >= 9) { dateStr = cols[0]; cost = parseFloat(cols[7]); }
    else if (cols.length >= 4) { dateStr = cols[0]; cost = parseFloat(cols[2]); }
    else continue;
    if (!isFinite(cost)) continue;
    const t = Date.parse(dateStr);
    if (isNaN(t) || t < cutoff) continue;
    total += cost;
  }
  return total;
}

/**
 * Cache lookup — returns the most-recent intel-{date}.json for a company iff
 * within CACHE_TTL_DAYS. Returns null on miss.
 */
function findCachedIntel(slug) {
  const dir = join(OUT_DIR, slug);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter(f => /^intel-\d{4}-\d{2}-\d{2}\.json$/.test(f));
  if (files.length === 0) return null;
  // Pick newest by mtime.
  const newest = files
    .map(f => ({ f, path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0];
  const ageDays = (Date.now() - newest.mtime) / 86400000;
  if (ageDays > CACHE_TTL_DAYS) return null;
  try {
    return { path: newest.path, json: JSON.parse(readFileSync(newest.path, 'utf-8')), ageDays };
  } catch (e) {
    logLine(`cache-read failed for ${slug}: ${e.message}`);
    return null;
  }
}

/**
 * Pull unique companies from the apply-now-queue.json file. Returns array of
 * { company, slug, sample_role } in queue order (rank-sorted by source file).
 */
function loadUniqueCompaniesFromQueue() {
  if (!existsSync(QUEUE_PATH)) throw new Error(`queue file missing: ${QUEUE_PATH}`);
  const queue = JSON.parse(readFileSync(QUEUE_PATH, 'utf-8'));
  const rows = queue.ranked || [];
  const seen = new Map(); // slug → { company, slug, sample_role }
  for (const row of rows) {
    const slug = slugify(row.company);
    if (!slug || seen.has(slug)) continue;
    seen.set(slug, {
      company: row.company,
      slug,
      sample_role: row.role || '',
      sample_rank: row.rank || null,
    });
  }
  return Array.from(seen.values());
}

/**
 * Apply --companies filter if set.
 *
 * If the user explicitly named companies that aren't in the queue, we still
 * include them as bare entries (no sample_role). This is the right call for
 * the defense-exclude path — naming "Palantir" should still produce the
 * _excluded.md stub even if Palantir isn't in apply-now-queue.json.
 */
function filterCompanies(all) {
  if (CLI.companies.length === 0) return all;
  const wanted = CLI.companies.map(s => ({ raw: s, slug: slugify(s) }));
  const wantedSlugs = new Set(wanted.map(w => w.slug));
  const inQueue = all.filter(c => wantedSlugs.has(c.slug));
  const inQueueSlugs = new Set(inQueue.map(c => c.slug));
  const extras = wanted
    .filter(w => !inQueueSlugs.has(w.slug))
    .map(w => ({ company: w.raw, slug: w.slug, sample_role: '', sample_rank: null }));
  return [...inQueue, ...extras];
}

/**
 * Compose the council brief prompt for a single company. Includes role context
 * + TTO baseline so the council can update it if they find fresher signal.
 *
 * The prompt is intentionally structured so output sections are easy to
 * machine-extract (TTO, hiring posture, manager name, etc.) by the inline
 * adjudicator.
 */
function composeCouncilBrief({ company, slug, sample_role, ttoBaseline }) {
  const today = todayDateStr();
  return `You are part of a council of premium reasoning models. Mitchell Williams is a senior IC AI candidate (career-ops) researching ${company} for an active job-search application. Produce sharp, source-cited intel for the following questions. Today is ${today}.

## Company
**${company}** (slug: ${slug})
${sample_role ? `**Target role example:** ${sample_role}` : ''}

## TTO baseline (from lib/tto-estimator.mjs)
- Current estimate: ${ttoBaseline.weeks_estimate} weeks (${ttoBaseline.velocity_tier})
- Basis: ${ttoBaseline.basis}
- Confidence: ${ttoBaseline.confidence}
${ttoBaseline.note ? `- Note: ${ttoBaseline.note}` : ''}

## Required output sections (use these exact headers — they are machine-parsed)

### HIRING_POSTURE
One of: actively-hiring | freeze | layoffs | unclear
Followed by 2-3 sentences citing source (Layoffs.fyi date, news article, employee LinkedIn post, etc.).

### TIME_TO_OFFER
Concrete weeks-to-offer estimate based on RECENT (2025-2026) Glassdoor cycle reports, recruiter chatter, employee posts, etc. If you have fresher signal than the baseline, say so explicitly with a number and a source — your number will UPDATE the override file. If you have no fresher signal, write "no fresher signal — baseline holds."

### HIRING_MANAGER
${sample_role ? `For the target role "${sample_role}":` : 'For typical roles Mitchell targets (AI Program Manager, Solutions Architect, Forward Deployed Engineer, Applied AI, AI Enablement, Engineering Editorial Lead):'} who is the hiring manager? Name, title, LinkedIn or source URL, and your confidence level (high/med/low/unknown).

### TEAM_INTEL
2-4 sentences on team structure, recent additions, recent departures, leadership exits, who's writing publicly. If you have X/Twitter chatter from team members (especially from Grok with x_search), include it here.

### EQUITY_STORY
Current funding stage, valuation, IPO probability, pre/post-IPO timing. Source-cite recent rounds or filings. If RSU/PPU structure is unusual, note it.

### SKILL_PORTABILITY_SCORE
Integer 1-5. Does working in this kind of role here build skills that transfer to high-WTP non-tech industries (finance, health, legal)? 1 = locked-in to AI-lab work; 5 = highly portable.

### BRIDGE_TO_AI_PM_SCORE
Integer 1-5. Does this role build credibility for a 2-3yr transition to AI Product Management? 1 = lateral / dead-end; 5 = direct PM-bridge.

### NEGATIVE_SIGNALS
Bullet list of any flagged risks: layoffs, hiring freeze, leadership exit pattern, glassdoor low score, short tenure pattern, litigation, funding distress, public scandal, X employee sentiment negative. Cite each. If none, write "none surfaced."

### CITATIONS
Numbered list of URLs you relied on. Be specific.

---

Be brutally honest. If you have low confidence, say so. Mitchell needs accuracy over hedging — calibration is everything.`;
}

/**
 * Lightweight inline adjudicator. Mirrors the consensus reducer pattern in
 * lib/eval-council.mjs but lighter — for this use case we're aggregating
 * narrative intel rather than scoring an eval, so we extract per-section
 * findings and flag fields where models contradict.
 *
 * Returns { sections, contradictions, models_responding }.
 */
function adjudicateCouncil(council) {
  const succeeded = council.results.filter(r => !r.error && r.content);
  const failed = council.results.filter(r => r.error);

  const SECTION_KEYS = [
    'HIRING_POSTURE',
    'TIME_TO_OFFER',
    'HIRING_MANAGER',
    'TEAM_INTEL',
    'EQUITY_STORY',
    'SKILL_PORTABILITY_SCORE',
    'BRIDGE_TO_AI_PM_SCORE',
    'NEGATIVE_SIGNALS',
    'CITATIONS',
  ];

  // Per-section extraction: grab everything between `### KEY` and the next `### ` or EOF.
  function extractSection(text, key) {
    const re = new RegExp(`#{2,4}\\s*${key}\\s*\\n([\\s\\S]*?)(?=\\n#{2,4}\\s|$)`, 'i');
    const m = text.match(re);
    return m ? m[1].trim() : null;
  }

  const sections = {};
  for (const key of SECTION_KEYS) {
    const perModel = [];
    for (const r of succeeded) {
      const txt = extractSection(r.content, key);
      if (txt) perModel.push({ model: r.model, text: txt });
    }
    sections[key] = perModel;
  }

  // Hiring posture — majority vote across the four buckets.
  const postureBuckets = { 'actively-hiring': 0, freeze: 0, layoffs: 0, unclear: 0 };
  for (const entry of sections.HIRING_POSTURE) {
    const head = entry.text.toLowerCase().slice(0, 200);
    if (head.includes('layoff')) postureBuckets.layoffs++;
    else if (head.includes('freeze')) postureBuckets.freeze++;
    else if (head.includes('actively-hiring') || head.includes('actively hiring') || head.startsWith('actively')) postureBuckets['actively-hiring']++;
    else postureBuckets.unclear++;
  }
  const postureWinner = Object.entries(postureBuckets).sort((a, b) => b[1] - a[1])[0][0];

  // Score-style sections: try to extract leading integer 1-5 from each model.
  function extractScore(perModel) {
    const scores = [];
    for (const e of perModel) {
      const m = e.text.match(/\b([1-5])\b/);
      if (m) scores.push(parseInt(m[1], 10));
    }
    if (scores.length === 0) return null;
    // Median (robust to one outlier).
    const sorted = [...scores].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  const skillPortability = extractScore(sections.SKILL_PORTABILITY_SCORE);
  const bridgeToPM = extractScore(sections.BRIDGE_TO_AI_PM_SCORE);

  // TTO — pull "X weeks" or "X-Y weeks" patterns from each TIME_TO_OFFER response;
  // take the median of any concrete numbers.
  function extractTtoWeeks(perModel) {
    const weeks = [];
    for (const e of perModel) {
      const m = e.text.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*week/i);
      if (m) { weeks.push((parseInt(m[1], 10) + parseInt(m[2], 10)) / 2); continue; }
      const single = e.text.match(/\b(\d{1,2})\s*week/i);
      if (single) weeks.push(parseInt(single[1], 10));
    }
    if (weeks.length === 0) return null;
    const sorted = [...weeks].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }
  const fresherTtoWeeks = extractTtoWeeks(sections.TIME_TO_OFFER);

  // Hiring-manager extraction — pick the first specific name found, prefer
  // entries explicitly marked high-confidence.
  let hiringManager = null;
  for (const e of sections.HIRING_MANAGER) {
    const t = e.text;
    // skip "unknown" / "low confidence" filler
    if (/unknown|no.{0,5}name|low.{0,5}confidence/i.test(t.slice(0, 80))) continue;
    // try to find "Name: X" or first proper-noun pair followed by a job-titley word
    const nameMatch = t.match(/(?:name[:\s]+)?\b([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/);
    if (nameMatch) {
      const confMatch = t.match(/\b(high|med|low)\b/i);
      hiringManager = {
        name: nameMatch[1],
        source_model: e.model,
        confidence: confMatch ? confMatch[1].toLowerCase() : 'unknown',
        text: t.slice(0, 400),
      };
      break;
    }
  }

  // Negative signals — boolean rollup of any per-model bullets matching the
  // toxicity-scorer signal keys.
  const negativeSignals = {};
  const NEG_KEYS = [
    'layoffs_recent',
    'leadership_exit_pattern',
    'hiring_freeze_signal',
    'glassdoor_low_score',
    'short_tenure_pattern',
    'litigation_active',
    'funding_distress',
    'public_scandal_recent',
    'x_employee_sentiment_negative',
  ];
  for (const e of sections.NEGATIVE_SIGNALS) {
    const t = e.text.toLowerCase();
    if (/layoff/.test(t)) negativeSignals.layoffs_recent = true;
    if (/leadership exit|exec.{0,10}depart|senior.{0,10}depart/.test(t)) negativeSignals.leadership_exit_pattern = true;
    if (/hiring.{0,5}freeze/.test(t)) negativeSignals.hiring_freeze_signal = true;
    if (/glassdoor.{0,10}(low|<\s*3|2\.|3\.0)/.test(t)) negativeSignals.glassdoor_low_score = true;
    if (/short tenure|median.{0,5}(<|under).{0,5}18/.test(t)) negativeSignals.short_tenure_pattern = true;
    if (/litigation|lawsuit|sued/.test(t)) negativeSignals.litigation_active = true;
    if (/funding distress|down round|failed.{0,10}round|cash.{0,10}runway/.test(t)) negativeSignals.funding_distress = true;
    if (/scandal|controvers|investigation/.test(t)) negativeSignals.public_scandal_recent = true;
    if (/x\b.{0,30}negative|twitter.{0,30}negative|employee.{0,10}sentiment.{0,10}negative/.test(t)) negativeSignals.x_employee_sentiment_negative = true;
  }

  return {
    sections,
    models_responding: succeeded.map(r => r.model),
    models_failed:     failed.map(r => ({ model: r.model, error: r.error })),
    hiring_posture:    postureWinner,
    skill_portability_score: skillPortability,
    bridge_to_ai_pm_score:   bridgeToPM,
    fresher_tto_weeks:       fresherTtoWeeks,
    hiring_manager:          hiringManager,
    negative_signals:        negativeSignals,
  };
}

/**
 * Update data/tto-overrides.json with fresh council-surfaced TTO data.
 * Only writes if there's actually a fresher signal AND the new number differs
 * materially from the baseline. Returns { changed, action: 'new'|'updated'|'skipped' }.
 */
function maybeUpdateTtoOverride({ slug, fresherWeeks, baseline, councilDate, modelsResponding }) {
  if (!fresherWeeks || !isFinite(fresherWeeks)) return { changed: false, action: 'skipped' };
  // Material-change gate: only update if >= 2 weeks different from baseline.
  if (Math.abs(fresherWeeks - baseline.weeks_estimate) < 2) return { changed: false, action: 'skipped' };

  let overrides;
  try {
    overrides = JSON.parse(readFileSync(TTO_OVERRIDES_PATH, 'utf-8'));
  } catch (e) {
    logLine(`tto-overrides read failed: ${e.message}`);
    return { changed: false, action: 'skipped' };
  }
  overrides.companies = overrides.companies || {};

  const existing = overrides.companies[slug];
  const action = existing ? 'updated' : 'new';
  const weeks = Math.round(fresherWeeks);
  const tier = weeks <= 5 ? 'fast' : weeks <= 9 ? 'med' : weeks <= 13 ? 'slow' : 'glacial';

  overrides.companies[slug] = {
    weeks,
    tier,
    confidence: modelsResponding.length >= 3 ? 'high' : modelsResponding.length >= 2 ? 'med' : 'low',
    source: `process-all-council-intel ${councilDate} (council: ${modelsResponding.join(', ')})`,
    note: `Council-surfaced fresher TTO (baseline was ${baseline.weeks_estimate} weeks).`,
    // 60-day expiry — councils get re-run nightly under steady state.
    expires_at: new Date(Date.now() + 60 * 86400000).toISOString(),
  };

  if (!CLI.dryRun) {
    writeFileSync(TTO_OVERRIDES_PATH, JSON.stringify(overrides, null, 2) + '\n');
  }
  return { changed: true, action, weeks, tier };
}

/**
 * Concurrency limiter — simple promise-pool. Resolves with array of results
 * in the same order as inputs.
 */
async function withConcurrency(items, limit, worker) {
  const out = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const myIdx = i++;
      if (myIdx >= items.length) return;
      try { out[myIdx] = await worker(items[myIdx], myIdx); }
      catch (e) { out[myIdx] = { error: e.message, item: items[myIdx] }; }
    }
  });
  await Promise.all(runners);
  return out;
}

/**
 * Per-company processor. Returns a structured outcome object that the summary
 * writer + cost tracker consume.
 */
async function processCompany({ company, slug, sample_role }, runState) {
  const date = todayDateStr();
  const companyDir = join(OUT_DIR, slug);

  // ── 1. Defense exclusion (ALWAYS first; ZERO LLM cost) ──
  if (DEFENSE_EXCLUDE.has(slug)) {
    const excludedPath = join(companyDir, '_excluded.md');
    if (!CLI.dryRun) {
      ensureDir(companyDir);
      const md = `# ${company} — EXCLUDED\n\n` +
        `**Reason:** Defense exclusion per career calibration brief 2026-05-16.\n` +
        `**Computed at:** ${new Date().toISOString()}\n\n` +
        `Mitchell explicitly hard-excluded primary defense-mission companies (Palantir, Anduril, Shield AI). This company will not be enriched, evaluated, or surfaced in the Apply-Now queue.\n\n` +
        `Auto-trash on this list is the ONLY auto-trash path in the system. Toxicity scoring is FLAG-FOR-REVIEW only.\n`;
      writeFileSync(excludedPath, md);
    }
    logLine(`EXCLUDED ${company} (${slug}) — defense exclusion; zero LLM cost`);
    return { slug, company, outcome: 'excluded', cost_usd: 0, models_used: [], models_failed: [] };
  }

  // ── 2. Cache check ──
  if (!CLI.noCache) {
    const cached = findCachedIntel(slug);
    if (cached) {
      logLine(`CACHE HIT ${company} (${slug}) — using ${cached.path} (age ${cached.ageDays.toFixed(1)}d)`);
      return {
        slug, company, outcome: 'cache_hit', cost_usd: 0, cached_path: cached.path,
        cached_age_days: cached.ageDays,
        models_used: cached.json?.council_models_used || [], models_failed: [],
      };
    }
  }

  // ── 3. Compose brief ──
  const ttoBaseline = estimateTTO(company);
  const prompt = composeCouncilBrief({ company, slug, sample_role, ttoBaseline });

  // ── Cost-ceiling check BEFORE firing ──
  if (runState.spentUsd + PER_COMPANY_COST_EST_USD > CLI.maxCost) {
    logLine(`SKIP ${company} — would exceed --max-cost ${CLI.maxCost} (spent ${runState.spentUsd.toFixed(2)})`);
    return { slug, company, outcome: 'skipped_cost_cap', cost_usd: 0, models_used: [], models_failed: [] };
  }

  // ── Dry-run short-circuit (after baseline TTO computed; before any LLM cost) ──
  if (CLI.dryRun) {
    logLine(`DRY-RUN ${company} (${slug}) — would fire council (~$${PER_COMPANY_COST_EST_USD.toFixed(2)}); brief ${prompt.length} chars`);
    return {
      slug, company, outcome: 'dry_run',
      cost_usd_est: PER_COMPANY_COST_EST_USD,
      tto_baseline: ttoBaseline,
      brief_chars: prompt.length,
      models_used: [], models_failed: [],
    };
  }

  ensureDir(companyDir);

  // ── 4. Fire council ──
  logLine(`COUNCIL FIRE ${company} (${slug}) — ${prompt.length} char brief`);
  let council;
  try {
    council = await callCouncil({ prompt, opts: { maxTokens: 4000 } });
  } catch (e) {
    logLine(`COUNCIL ERROR ${company}: ${e.message}`);
    return { slug, company, outcome: 'council_error', cost_usd: 0, error: e.message, models_used: [], models_failed: [] };
  }

  // Save raw council report (for forensics + future re-runs that bypass cache).
  const rawPath = join(companyDir, `council-${RUN_TS}.json`);
  writeFileSync(rawPath, JSON.stringify(council, null, 2));

  // Tally cost from per-model estimate of succeeded calls.
  const modelsResponding = council.results.filter(r => !r.error).map(r => r.model);
  const modelsFailed = council.results.filter(r => r.error).map(r => ({ model: r.model, error: r.error }));
  const councilCost = modelsResponding.reduce((sum, m) => sum + (PER_MODEL_COST_EST_USD[m] || 0.2), 0);

  // ── 5. Adjudicate ──
  const adj = adjudicateCouncil(council);

  // ── 6. Toxicity scoring ──
  const tox = scoreToxicity(slug, { signals: adj.negative_signals });
  if (tox.verdict === 'FLAG-REVIEW') {
    const flagPath = join(companyDir, '_toxicity-flag.md');
    const md = `# ${company} — Toxicity FLAG-REVIEW\n\n` +
      `**Score:** ${tox.score}/100\n` +
      `**Verdict:** ${tox.verdict}\n` +
      `**Computed at:** ${new Date().toISOString()}\n\n` +
      `**Recommendation:** ${tox.recommendation}\n\n` +
      `**Triggered signals:**\n${tox.triggered_signals.map(s => `- ${s.signal} (weight ${s.weight})`).join('\n')}\n\n` +
      `_NEVER auto-trash on toxicity per calibration 2026-05-16 — Mitchell makes the tradeoff. This file is a flag, not a block._\n`;
    writeFileSync(flagPath, md);
    logLine(`TOXICITY FLAG ${company} (${slug}) — score ${tox.score}/100`);
  }

  // ── 7. TTO enrichment ──
  const ttoUpdate = maybeUpdateTtoOverride({
    slug,
    fresherWeeks: adj.fresher_tto_weeks,
    baseline: ttoBaseline,
    councilDate: date,
    modelsResponding,
  });
  if (ttoUpdate.changed) {
    logLine(`TTO ${ttoUpdate.action.toUpperCase()} ${company} — ${ttoUpdate.weeks}w (${ttoUpdate.tier})`);
  }

  // ── 8. Write per-company intel files ──
  const intelJson = {
    company: slug,
    company_display: company,
    computed_at: new Date().toISOString(),
    council_models_used: modelsResponding,
    council_models_failed: modelsFailed,
    cost_usd: Math.round(councilCost * 100) / 100,
    tto_estimate: ttoBaseline,
    tto_update: ttoUpdate,
    toxicity_score: tox,
    hiring_manager: adj.hiring_manager,
    team_intel: (adj.sections.TEAM_INTEL[0]?.text || '').slice(0, 1200),
    hiring_posture: adj.hiring_posture,
    negative_signals: adj.negative_signals,
    equity_story: (adj.sections.EQUITY_STORY[0]?.text || '').slice(0, 1200),
    skill_portability_score: adj.skill_portability_score,
    bridge_to_ai_pm_score: adj.bridge_to_ai_pm_score,
    raw_council_report_path: rawPath.replace(ROOT + '/', ''),
    expires_at: new Date(Date.now() + CACHE_TTL_DAYS * 86400000).toISOString(),
  };
  const jsonPath = join(companyDir, `intel-${date}.json`);
  writeFileSync(jsonPath, JSON.stringify(intelJson, null, 2));

  // Human-readable companion.
  const mdSummary = [
    `# ${company} — Council Intel ${date}`,
    '',
    `**Computed at:** ${intelJson.computed_at}`,
    `**Models responding:** ${modelsResponding.join(', ') || '(none)'}`,
    `**Models failed:** ${modelsFailed.map(m => `${m.model} (${m.error.slice(0,80)})`).join('; ') || '(none)'}`,
    `**Estimated cost:** $${intelJson.cost_usd.toFixed(2)}`,
    '',
    `## TTO`,
    `- Baseline: ${ttoBaseline.weeks_estimate} weeks (${ttoBaseline.velocity_tier}, ${ttoBaseline.basis})`,
    ttoUpdate.changed ? `- **UPDATED:** ${ttoUpdate.weeks} weeks (${ttoUpdate.tier}) — written to data/tto-overrides.json` : `- No fresher signal — baseline holds`,
    '',
    `## Toxicity`,
    `- Score: ${tox.score}/100  ·  Verdict: **${tox.verdict}**  ${tox.verdict_emoji || ''}`,
    `- Recommendation: ${tox.recommendation}`,
    '',
    `## Hiring posture`,
    `**${adj.hiring_posture}**`,
    '',
    `## Hiring manager`,
    adj.hiring_manager
      ? `- ${adj.hiring_manager.name} (confidence ${adj.hiring_manager.confidence}, source: ${adj.hiring_manager.source_model})`
      : '- _no specific name surfaced_',
    '',
    `## Team intel`,
    intelJson.team_intel || '_no team intel surfaced_',
    '',
    `## Equity story`,
    intelJson.equity_story || '_no equity story surfaced_',
    '',
    `## Portability scores`,
    `- Skill portability (1–5): **${adj.skill_portability_score ?? '?'}**`,
    `- Bridge to AI PM (1–5): **${adj.bridge_to_ai_pm_score ?? '?'}**`,
    '',
    `## Raw council report`,
    `\`${intelJson.raw_council_report_path}\``,
    '',
    `_Expires: ${intelJson.expires_at} (30-day TTL)_`,
  ].join('\n');
  writeFileSync(join(companyDir, `intel-${date}.md`), mdSummary);

  runState.spentUsd += councilCost;
  logLine(`COUNCIL DONE ${company} — $${councilCost.toFixed(2)}; ${modelsResponding.length}/${modelsResponding.length + modelsFailed.length} models; total spent $${runState.spentUsd.toFixed(2)}`);

  return {
    slug, company, outcome: 'fresh',
    cost_usd: councilCost,
    models_used: modelsResponding,
    models_failed: modelsFailed,
    intel_json_path: jsonPath.replace(ROOT + '/', ''),
    tto_update: ttoUpdate,
    toxicity_verdict: tox.verdict,
  };
}

/**
 * Append a single row to data/cost-log.tsv summarizing this run. Schema matches
 * dashboard-server.mjs#getRolling30dSpend tolerant-parser (4-col short form is OK).
 */
function appendCostLog({ totalCost, freshCount, label }) {
  if (CLI.dryRun) return;
  if (totalCost <= 0) return;
  // Short form (4 cols): date, iso_ts, cost_usd, label
  const row = [
    todayDateStr(),
    new Date().toISOString(),
    totalCost.toFixed(4),
    `${label} (${freshCount} fresh councils)`,
  ].join('\t') + '\n';
  try {
    if (!existsSync(COST_LOG_PATH)) writeFileSync(COST_LOG_PATH, 'date\tbatch_id\tcost_usd\tlabel\n');
    appendFileSync(COST_LOG_PATH, row);
  } catch (e) {
    logLine(`cost-log append failed: ${e.message}`);
  }
}

/**
 * Build + write the per-run summary markdown.
 */
function writeSummary({ companies, outcomes, totalCost, startedAt, finishedAt }) {
  const counts = {
    attempted: outcomes.length,
    excluded:    outcomes.filter(o => o.outcome === 'excluded').length,
    cache_hit:   outcomes.filter(o => o.outcome === 'cache_hit').length,
    fresh:       outcomes.filter(o => o.outcome === 'fresh').length,
    dry_run:     outcomes.filter(o => o.outcome === 'dry_run').length,
    council_err: outcomes.filter(o => o.outcome === 'council_error').length,
    cost_cap:    outcomes.filter(o => o.outcome === 'skipped_cost_cap').length,
  };
  const toxFlagged = outcomes.filter(o => o.toxicity_verdict === 'FLAG-REVIEW').length;
  const ttoChanged = outcomes.filter(o => o.tto_update?.changed);

  const table = [
    '| Company | Outcome | Cost | Models | TTO Δ | Toxicity |',
    '|---|---|---|---|---|---|',
    ...outcomes.map(o => [
      o.company || o.slug,
      o.outcome,
      `$${(o.cost_usd ?? 0).toFixed(2)}${o.cost_usd_est ? ` (est)` : ''}`,
      (o.models_used || []).length + (o.models_failed?.length ? `/${o.models_used.length + o.models_failed.length}` : ''),
      o.tto_update?.changed ? `${o.tto_update.action} → ${o.tto_update.weeks}w` : '—',
      o.toxicity_verdict || '—',
    ].join(' | ')).map(r => `| ${r} |`),
  ].join('\n');

  const md = [
    `# process-all-council-intel — Run Summary ${RUN_TS}`,
    '',
    `**Started:** ${startedAt}`,
    `**Finished:** ${finishedAt}`,
    `**Dry-run:** ${CLI.dryRun ? 'YES (no LLM calls fired, no files written)' : 'NO'}`,
    `**Queue source:** \`${QUEUE_PATH.replace(ROOT + '/', '')}\``,
    `**Output dir:** \`${OUT_DIR.replace(ROOT + '/', '')}\``,
    `**Concurrency:** ${CLI.concurrency}`,
    `**Cache:** ${CLI.noCache ? 'BYPASSED (--no-cache)' : `enabled (30-day TTL)`}`,
    `**Per-run cost cap:** $${CLI.maxCost}`,
    `**Rolling 30-day spend (pre-run):** $${getRolling30dSpend().toFixed(2)}`,
    `**Monthly budget:** $${MONTHLY_BUDGET}`,
    '',
    `## Counts`,
    `- Attempted: **${counts.attempted}**`,
    `- Cache hits: **${counts.cache_hit}**`,
    `- Fresh councils: **${counts.fresh}**`,
    `- Defense-excluded (auto-trash, zero cost): **${counts.excluded}**`,
    `- Skipped (cost cap): **${counts.cost_cap}**`,
    `- Council errors: **${counts.council_err}**`,
    CLI.dryRun ? `- Dry-run preview: **${counts.dry_run}**` : '',
    '',
    `## Cost`,
    `- **Total spent this run:** $${totalCost.toFixed(2)}`,
    `- Estimated per-company average (fresh): $${counts.fresh > 0 ? (totalCost / counts.fresh).toFixed(2) : '0.00'}`,
    '',
    `## Toxicity flags surfaced`,
    toxFlagged > 0 ? `**${toxFlagged}** company(ies) hit FLAG-REVIEW. See \`_toxicity-flag.md\` in each company subdir. (NEVER auto-trash per calibration.)` : '_none_',
    '',
    `## TTO overrides applied`,
    ttoChanged.length > 0
      ? ttoChanged.map(o => `- **${o.company}**: ${o.tto_update.action} → ${o.tto_update.weeks} weeks (${o.tto_update.tier})`).join('\n')
      : '_none — no fresher signal surfaced that materially differed from baselines_',
    '',
    `## Per-company outcomes`,
    table,
    '',
    `## Failures`,
    ...outcomes.filter(o => o.outcome === 'council_error' || (o.models_failed?.length))
      .flatMap(o => [
        `### ${o.company} (${o.outcome})`,
        o.error ? `Error: \`${o.error}\`` : '',
        ...(o.models_failed || []).map(m => `- ${m.model}: ${m.error?.slice(0, 200)}`),
        '',
      ]),
    '',
    `## Log file`,
    `\`${LOG_PATH.replace(ROOT + '/', '')}\``,
    '',
    `_Generated by scripts/process-all-council-intel.mjs_`,
  ].join('\n');

  if (!CLI.dryRun || true /* always write summary even on dry run */) {
    writeFileSync(SUMMARY_PATH, md);
  }
  return md;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date().toISOString();

  ensureDir(OUT_DIR);
  logLine(`STARTED — dry-run=${CLI.dryRun} concurrency=${CLI.concurrency} max-cost=$${CLI.maxCost}`);

  // Monthly-budget guard (informational; CLI --max-cost is the hard cap).
  const spent30d = getRolling30dSpend();
  logLine(`Rolling 30-day spend: $${spent30d.toFixed(2)} / $${MONTHLY_BUDGET}`);
  if (spent30d >= MONTHLY_BUDGET) {
    logLine(`WARNING: rolling 30-day spend ($${spent30d.toFixed(2)}) already at/above MONTHLY_BUDGET_USD ($${MONTHLY_BUDGET}). Continuing (per-run cap still honored), but consider deferring this run.`);
  }

  // Load + filter target companies.
  let companies;
  try {
    companies = loadUniqueCompaniesFromQueue();
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exit(1);
  }
  companies = filterCompanies(companies);

  if (companies.length === 0) {
    console.error('No companies to process (queue empty or --companies filter matched nothing).');
    process.exit(1);
  }

  logLine(`Plan: ${companies.length} unique companies — ${companies.map(c => c.company).join(', ')}`);

  // Run pool.
  const runState = { spentUsd: 0 };
  const outcomes = await withConcurrency(companies, CLI.concurrency, c => processCompany(c, runState));

  const totalCost = outcomes.reduce((sum, o) => sum + (o.cost_usd || 0), 0);
  const freshCount = outcomes.filter(o => o.outcome === 'fresh').length;

  // Cost-log append (only counts real spend; dry-run + cache-hit + excluded contribute 0).
  appendCostLog({ totalCost, freshCount, label: 'process-all-council-intel' });

  const finishedAt = new Date().toISOString();
  const summary = writeSummary({ companies, outcomes, totalCost, startedAt, finishedAt });

  // Stdout: one-paragraph summary + path to summary file.
  console.log('');
  console.log('─'.repeat(72));
  console.log(`process-all-council-intel${CLI.dryRun ? ' (DRY RUN)' : ''} complete in ${Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000)}s.`);
  console.log(`Attempted ${outcomes.length} companies: ${outcomes.filter(o => o.outcome === 'fresh').length} fresh councils, ${outcomes.filter(o => o.outcome === 'cache_hit').length} cache hits, ${outcomes.filter(o => o.outcome === 'excluded').length} defense-excluded, ${outcomes.filter(o => o.outcome === 'council_error').length} errors, ${outcomes.filter(o => o.outcome === 'skipped_cost_cap').length} cost-capped.`);
  console.log(`Total cost: $${totalCost.toFixed(2)} (cap $${CLI.maxCost}).`);
  console.log(`Toxicity flags: ${outcomes.filter(o => o.toxicity_verdict === 'FLAG-REVIEW').length}. TTO overrides applied: ${outcomes.filter(o => o.tto_update?.changed).length}.`);
  console.log(`Summary: ${SUMMARY_PATH.replace(ROOT + '/', '')}`);
  console.log(`Log:     ${LOG_PATH.replace(ROOT + '/', '')}`);
  console.log('─'.repeat(72));
}

main().catch(e => {
  console.error('FATAL:', e);
  try { appendFileSync(LOG_PATH, `[${new Date().toISOString()}] FATAL: ${e.stack || e.message}\n`); } catch {}
  process.exit(1);
});
