#!/usr/bin/env node
/**
 * lib/toxicity-composite.mjs — Composite Company Toxicity Score (v1 MVP).
 *
 * Per Inventory Document B item #4 (Mitchell's exact ask, 2026-05-18):
 *   "i would love some kind of analysis on different elements that
 *   contribute to a total toxicity level... i should still be allowed
 *   to make the tradeoff, because as a user, id be willing to accept a
 *   toxic company if my specific team wasnt as toxic and the salary and
 *   benefits and equity were even more impressive, etc... i need to know
 *   the culture and if its a toxic environment and why before i can make
 *   those decisions"
 *
 * This module:
 *   1. Aggregates negative signals from EXISTING data files (no new fetchers)
 *   2. Produces a 0-10 composite score with driver attribution
 *   3. Surfaces evidence + source per driver so Mitchell can override
 *   4. NEVER auto-trashes — calling code must never gate apply on this score
 *
 * Sources (all optional — score adapts to what's present):
 *   - data/company-intel-cache/{slug}/intel-*.json
 *       → .negative_signals (council-of-models 7-LLM output)
 *       → .toxicity_score.triggered_signals (legacy scorer output)
 *   - data/hm-intel/{slug*}.json
 *       → text-scan of .company_signals_90d for layoff/freeze/exit/scandal cues
 *   - data/applications.md
 *       → grep notes column for company == slug AND any of:
 *         "TOXIC", "toxic culture", "toxic environment", "burnout", "layoff",
 *         "leadership exit", "values flag", "ethics flag", "hiring freeze"
 *   - data/discard-reasons.jsonl
 *       → JSON lines tagged "culture" (from classifyDiscardReason in
 *         dashboard-server.mjs) that mention this company
 *
 * Driver weight table (sum-capped at 10):
 *   layoffs_last_90d              3
 *   senior_leadership_exit        2
 *   manual_toxic_tag_from_tracker 3
 *   culture_ethics_discard_reason 2
 *   hiring_freeze_signal          1
 *   public_scandal_recent         2
 *   short_tenure_pattern          1
 *   funding_distress              2
 *
 * Confidence:
 *   high → ≥3 drivers; med → 2 drivers; low → ≤1 driver
 *
 * CLI:
 *   node lib/toxicity-composite.mjs --slug=anthropic
 *   node lib/toxicity-composite.mjs --slug=anthropic --json
 *   node lib/toxicity-composite.mjs --refresh-all   (recompute every Apply-Now company)
 */

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'fs';
// statSync already imported above; γ GAMMA additions use it for source mtime.
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const INTEL_CACHE_DIR    = join(ROOT, 'data/company-intel-cache');
const HM_INTEL_DIR       = join(ROOT, 'data/hm-intel');
const APPLICATIONS_PATH  = join(ROOT, 'data/applications.md');
const DISCARD_REASONS_FP = join(ROOT, 'data/discard-reasons.jsonl');
const OVERRIDES_FP       = join(ROOT, 'data/toxicity-overrides.jsonl');
const COMPOSITE_CACHE_FP = join(ROOT, 'data/toxicity-composite.json');

// ── Driver weights (Mitchell can tune via env or future profile.yml) ────────
const WEIGHTS = {
  layoffs_last_90d:              3,
  senior_leadership_exit:        2,
  manual_toxic_tag_from_tracker: 3,
  culture_ethics_discard_reason: 2,
  hiring_freeze_signal:          1,
  public_scandal_recent:         2,
  short_tenure_pattern:          1,
  funding_distress:              2,
};

const MAX_SCORE = 10;

// ── Helpers ────────────────────────────────────────────────────────────────
function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function safeRead(fp) {
  try { return readFileSync(fp, 'utf-8'); } catch { return null; }
}
function safeJSON(fp) {
  const t = safeRead(fp);
  if (!t) return null;
  try { return JSON.parse(t); } catch { return null; }
}
function safeJSONL(fp) {
  const t = safeRead(fp);
  if (!t) return [];
  return t.split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

// ── Source 1: council-of-models intel cache ────────────────────────────────
function loadIntelCacheForSlug(slug) {
  const dir = join(INTEL_CACHE_DIR, slug);
  if (!existsSync(dir)) return null;
  let entries = [];
  try {
    entries = readdirSync(dir).filter(f => /^intel-.*\.json$/.test(f));
  } catch { return null; }
  if (!entries.length) return null;
  // Pick newest intel-*.json by lexicographic order (date in filename)
  entries.sort().reverse();
  const filePath = join(dir, entries[0]);
  const parsed = safeJSON(filePath);
  if (!parsed) return null;
  // γ GAMMA addition 2026-05-19 (audit MED-1): stamp the intel record with
  // its file mtime so driversFromIntelCache can report per-driver freshness.
  try {
    parsed._source_mtime_ms = statSync(filePath).mtimeMs;
    parsed._source_filename = entries[0];
  } catch { /* ignore */ }
  return parsed;
}

// γ GAMMA helper 2026-05-19 — derive "stale: 47d old" labels from file mtime.
function ageDaysFromMtime(mtimeMs) {
  if (!mtimeMs) return null;
  return Math.round((Date.now() - mtimeMs) / 86_400_000);
}

function driversFromIntelCache(slug) {
  const intel = loadIntelCacheForSlug(slug);
  if (!intel) return [];
  const drivers = [];
  const ns = intel.negative_signals || {};
  const source = `data/company-intel-cache/${slug}/intel-*.json`;
  // γ GAMMA addition 2026-05-19 (audit MED-1): annotate each driver with the
  // age of its source file so the UI can render a "stale: 47d old" chip when
  // intel is past its useful shelf life.
  const sourceAgeDays = ageDaysFromMtime(intel._source_mtime_ms);

  // negative_signals booleans from council
  if (ns.layoffs_recent === true) {
    drivers.push({
      kind: 'layoffs_last_90d',
      weight: WEIGHTS.layoffs_last_90d,
      evidence: 'Council-of-models flagged layoffs in last 90d',
      source,
      source_age_days: sourceAgeDays,
    });
  }
  if (ns.leadership_exit_pattern === true) {
    drivers.push({
      kind: 'senior_leadership_exit',
      weight: WEIGHTS.senior_leadership_exit,
      evidence: 'Council-of-models flagged senior-leadership exit pattern',
      source,
      source_age_days: sourceAgeDays,
    });
  }
  if (ns.hiring_freeze_signal === true) {
    drivers.push({
      kind: 'hiring_freeze_signal',
      weight: WEIGHTS.hiring_freeze_signal,
      evidence: 'Council-of-models flagged hiring freeze',
      source,
      source_age_days: sourceAgeDays,
    });
  }
  if (ns.public_scandal_recent === true) {
    drivers.push({
      kind: 'public_scandal_recent',
      weight: WEIGHTS.public_scandal_recent,
      evidence: 'Council-of-models flagged recent public scandal',
      source,
      source_age_days: sourceAgeDays,
    });
  }
  if (ns.short_tenure_pattern === true) {
    drivers.push({
      kind: 'short_tenure_pattern',
      weight: WEIGHTS.short_tenure_pattern,
      evidence: 'Council-of-models flagged short-tenure pattern (median < 18mo)',
      source,
      source_age_days: sourceAgeDays,
    });
  }
  if (ns.funding_distress === true) {
    drivers.push({
      kind: 'funding_distress',
      weight: WEIGHTS.funding_distress,
      evidence: 'Council-of-models flagged funding distress',
      source,
      source_age_days: sourceAgeDays,
    });
  }

  // Legacy toxicity_score block sometimes carries triggered_signals with notes —
  // promote a richer evidence string if available, but don't double-count.
  const ts = Array.isArray(intel.toxicity_score?.triggered_signals)
    ? intel.toxicity_score.triggered_signals
    : [];
  for (const t of ts) {
    if (!t || !t.signal) continue;
    // Find an already-pushed driver of same kind, replace evidence if t.note is richer
    const kindMap = {
      layoffs_recent:          'layoffs_last_90d',
      leadership_exit_pattern: 'senior_leadership_exit',
      hiring_freeze_signal:    'hiring_freeze_signal',
      public_scandal_recent:   'public_scandal_recent',
      short_tenure_pattern:    'short_tenure_pattern',
      funding_distress:        'funding_distress',
    };
    const k = kindMap[t.signal];
    if (!k) continue;
    const existing = drivers.find(d => d.kind === k);
    if (existing && t.note) {
      existing.evidence = `${existing.evidence} — ${t.note}`;
      if (t.source && t.source !== 'unknown') existing.source = t.source;
    }
  }

  return drivers;
}

// ── Source 2: hm-intel text-scan on company_signals_90d ────────────────────
function loadHMIntelForSlug(slug) {
  if (!existsSync(HM_INTEL_DIR)) return [];
  let files = [];
  try {
    files = readdirSync(HM_INTEL_DIR).filter(f =>
      f.endsWith('.json') && !f.startsWith('_') && f.startsWith(slug)
    );
  } catch { return []; }
  return files.map(f => safeJSON(join(HM_INTEL_DIR, f))).filter(Boolean);
}

// Negation context — phrases that, when within 40 chars BEFORE a positive
// pattern match, indicate the signal is being denied rather than reported.
// Examples this catches: "no signs of hiring freeze", "no layoff signals
// found", "no signals of a downturn".
const NEGATION_PRECONTEXT = /\b(no|zero|without|not (?:see|find|signal|any)|absence of|free of|no signs of|no signals of|no evidence of)\b[^.]{0,80}$/i;

function isNegated(text, matchIndex) {
  // Look at up to 80 chars BEFORE the match. If a negation token appears
  // there without an intervening sentence boundary (.!?), call it negated.
  if (typeof matchIndex !== 'number') return false;
  const pre = text.slice(Math.max(0, matchIndex - 80), matchIndex);
  return NEGATION_PRECONTEXT.test(pre);
}

function driversFromHMIntel(slug) {
  const intels = loadHMIntelForSlug(slug);
  if (!intels.length) return [];
  const drivers = [];
  // Aggregate all company_signals_90d text fields
  const combined = intels.map(i => String(i.company_signals_90d || '')).join('\n\n');
  if (!combined.trim()) return [];

  const sourcePath = `data/hm-intel/${slug}*.json`;

  // Pattern matching against the synthesis text
  // Each hit produces 1 driver per kind (deduped against intel-cache drivers later)
  const patterns = [
    { kind: 'layoffs_last_90d',
      regex: /(?:\blayoff|\blay-off|\blaid off|\breduction in force|\brif\b)/i,
      label: 'Layoffs mentioned in hm-intel signals' },
    { kind: 'senior_leadership_exit',
      regex: /(?:c[ef]o\s+(?:departed|left|exited|resigned|out)|leadership\s+exit|exec\s+depart|founder\s+(?:left|departed)|head of\s+\w+\s+(?:left|departed|resigned))/i,
      label: 'Senior leadership exit mentioned in hm-intel signals' },
    { kind: 'hiring_freeze_signal',
      regex: /(?:hiring freeze|freeze on hiring|pause hiring|hiring pause|headcount freeze)/i,
      label: 'Hiring freeze mentioned in hm-intel signals' },
    { kind: 'public_scandal_recent',
      regex: /(?:scandal|controversy|lawsuit|investigation|allegation|misconduct|ethics violation)/i,
      label: 'Public scandal/controversy mentioned in hm-intel signals' },
    { kind: 'funding_distress',
      regex: /(?:failed round|funding troubles|cash runway|down round|near insolvency|distress)/i,
      label: 'Funding distress mentioned in hm-intel signals' },
  ];

  for (const p of patterns) {
    const m = combined.match(p.regex);
    if (!m) continue;
    // Skip if the match is in a negation context
    if (isNegated(combined, m.index)) continue;
    let snippet = p.label;
    if (typeof m.index === 'number') {
      const start = Math.max(0, m.index - 40);
      const end   = Math.min(combined.length, m.index + 100);
      snippet = `${p.label}: "...${combined.slice(start, end).replace(/\s+/g, ' ').trim()}..."`;
    }
    drivers.push({
      kind: p.kind,
      weight: WEIGHTS[p.kind],
      evidence: snippet,
      source: sourcePath,
    });
  }
  return drivers;
}

// ── Source 3: applications.md notes column ─────────────────────────────────
function driversFromApplicationsNotes(slug) {
  const text = safeRead(APPLICATIONS_PATH);
  if (!text) return [];
  // Slugified company match — applications.md uses display names so we
  // need a lenient match (slugify the company cell and compare).
  const drivers = [];
  const lines = text.split('\n').filter(l => l.startsWith('|') && !l.includes('---'));
  for (const line of lines) {
    const cells = line.split('|').map(c => c.trim());
    if (cells.length < 9) continue;
    const company = cells[3] || ''; // |#|date|company|role|...
    if (slugify(company) !== slug) continue;
    const notes = cells[9] || '';
    const lower = notes.toLowerCase();

    // Patterns Mitchell uses to flag toxicity in his own tracker notes
    const patterns = [
      { kind: 'manual_toxic_tag_from_tracker',
        regex: /\b(toxic|toxicity|toxic culture|toxic environment|burnout|burnt out)\b/i,
        label: 'Mitchell manually tagged toxic in tracker notes' },
      { kind: 'culture_ethics_discard_reason',
        regex: /\b(values flag|values-flag|ethics flag|ethics-flag|civil[- ]liberties|federal\/defense|defense values)\b/i,
        label: 'Mitchell flagged values/ethics concern in tracker notes' },
      { kind: 'layoffs_last_90d',
        regex: /\b(layoff|layoffs|laid off|layoff-churn|layoff churn)\b/i,
        label: 'Mitchell noted layoffs in tracker notes' },
      { kind: 'hiring_freeze_signal',
        regex: /\b(hiring freeze|freeze on hiring|headcount freeze)\b/i,
        label: 'Mitchell noted hiring freeze in tracker notes' },
    ];
    for (const p of patterns) {
      if (p.regex.test(lower)) {
        const m = notes.match(p.regex);
        const start = Math.max(0, (m?.index ?? 0) - 30);
        const end   = Math.min(notes.length, (m?.index ?? 0) + 100);
        const snippet = `${p.label}: "...${notes.slice(start, end).replace(/\s+/g, ' ').trim()}..."`;
        drivers.push({
          kind: p.kind,
          weight: WEIGHTS[p.kind],
          evidence: snippet,
          source: `data/applications.md (row ${cells[1] || '?'})`,
        });
      }
    }
  }
  return drivers;
}

// ── Source 4: discard-reasons.jsonl ────────────────────────────────────────
function driversFromDiscardReasons(slug) {
  const entries = safeJSONL(DISCARD_REASONS_FP);
  if (!entries.length) return [];
  const drivers = [];
  for (const e of entries) {
    if (slugify(e.company || '') !== slug) continue;
    if ((e.tag || '') !== 'culture') continue;
    drivers.push({
      kind: 'culture_ethics_discard_reason',
      weight: WEIGHTS.culture_ethics_discard_reason,
      evidence: `Discard reason (culture-tagged): "${String(e.reason || '').slice(0, 140)}"`,
      source: `data/discard-reasons.jsonl (${e.ts || 'unknown ts'})`,
    });
  }
  return drivers;
}

// ── Overrides ──────────────────────────────────────────────────────────────
function loadOverridesForSlug(slug) {
  const entries = safeJSONL(OVERRIDES_FP);
  return entries.filter(e => e.slug === slug);
}

// ── Deduplication ──────────────────────────────────────────────────────────
function dedupDrivers(drivers) {
  // For each kind, keep only the driver with the richest evidence (longest string),
  // preferring sources in this priority: intel-cache > hm-intel > applications > discard.
  const sourceRank = (s) => {
    if (s.startsWith('data/company-intel-cache/')) return 4;
    if (s.startsWith('data/hm-intel/'))            return 3;
    if (s.startsWith('data/applications.md'))      return 2;
    if (s.startsWith('data/discard-reasons.jsonl'))return 1;
    return 0;
  };
  const byKind = {};
  for (const d of drivers) {
    const existing = byKind[d.kind];
    if (!existing) { byKind[d.kind] = d; continue; }
    // Prefer higher source rank, then longer evidence
    const er = sourceRank(existing.source);
    const dr = sourceRank(d.source);
    if (dr > er || (dr === er && d.evidence.length > existing.evidence.length)) {
      byKind[d.kind] = d;
    }
  }
  return Object.values(byKind);
}

// ── Public API ─────────────────────────────────────────────────────────────
/**
 * computeToxicityComposite(slug, opts?) → { score, drivers, confidence, overrides, sources_scanned }
 *
 * Hard rule: this function NEVER returns a flag that tells calling code to
 * auto-trash. The return shape includes drivers + evidence so Mitchell can
 * always make the trade-off himself.
 */
export function computeToxicityComposite(companySlug, opts = {}) {
  const slug = slugify(companySlug);
  if (!slug) {
    return {
      slug: '',
      score: 0,
      drivers: [],
      confidence: 'low',
      overrides: [],
      sources_scanned: [],
      auto_trash: false,
      schema_note: 'computeToxicityComposite NEVER returns auto_trash:true',
      computed_at: new Date().toISOString(),
    };
  }

  const collected = [
    ...driversFromIntelCache(slug),
    ...driversFromHMIntel(slug),
    ...driversFromApplicationsNotes(slug),
    ...driversFromDiscardReasons(slug),
  ];
  const drivers = dedupDrivers(collected);

  // Score = sum of unique-kind weights, capped at MAX_SCORE
  const rawSum = drivers.reduce((acc, d) => acc + (d.weight || 0), 0);
  const score = Math.min(rawSum, MAX_SCORE);

  // γ GAMMA fix 2026-05-19 (audit HIGH-5):
  // Confidence used to be a pure driver-count: 3+ = high, 2 = med, ≤1 = low.
  // That treated a single multi-LLM council finding (best-in-class signal) as
  // 'low' and two noisy regex matches in narrative text as 'med'. Now we
  // weight drivers by source-rank — the same ranks used by dedupDrivers:
  //   intel-cache (council-of-models 7-LLM)   → 2.0 weight
  //   hm-intel narrative regex match          → 1.5 weight
  //   applications.md manual tag              → 1.0 weight
  //   discard-reasons.jsonl culture-tagged    → 0.5 weight
  // Confidence bands: high ≥ 3.0, med ≥ 1.5, low otherwise.
  const sourceQualityRank = (sourceStr) => {
    if (!sourceStr) return 0.5;
    if (sourceStr.startsWith('data/company-intel-cache/')) return 2.0;
    if (sourceStr.startsWith('data/hm-intel/'))            return 1.5;
    if (sourceStr.startsWith('data/applications.md'))      return 1.0;
    if (sourceStr.startsWith('data/discard-reasons.jsonl')) return 0.5;
    return 0.5;
  };
  const confidenceWeight = drivers.reduce(
    (acc, d) => acc + sourceQualityRank(d.source),
    0
  );
  let confidence;
  if (confidenceWeight >= 3.0)      confidence = 'high';
  else if (confidenceWeight >= 1.5) confidence = 'med';
  else                              confidence = 'low';

  // Source scan inventory (helps UI explain "no signals yet" vs "checked but clean")
  const sources_scanned = [];
  if (loadIntelCacheForSlug(slug))                   sources_scanned.push('intel-cache');
  if (loadHMIntelForSlug(slug).length)               sources_scanned.push('hm-intel');
  if (existsSync(APPLICATIONS_PATH))                 sources_scanned.push('applications.md');
  if (existsSync(DISCARD_REASONS_FP))                sources_scanned.push('discard-reasons');

  const overrides = loadOverridesForSlug(slug);

  // γ GAMMA addition 2026-05-19 (audit MED-1):
  // Aggregate freshness signals: oldest + newest driver source ages so the UI
  // can render "intel was last refreshed N days ago" alongside the score.
  const driverAges = drivers
    .map(d => d.source_age_days)
    .filter(a => typeof a === 'number');
  const oldestDriverAgeDays = driverAges.length ? Math.max(...driverAges) : null;
  const newestDriverAgeDays = driverAges.length ? Math.min(...driverAges) : null;

  return {
    slug,
    score,
    drivers,
    confidence,
    confidence_weight: Math.round(confidenceWeight * 10) / 10,
    overrides,
    sources_scanned,
    oldest_driver_age_days: oldestDriverAgeDays,
    newest_driver_age_days: newestDriverAgeDays,
    auto_trash: false, // ALWAYS false — never gate apply on this score alone
    schema_note: 'NEVER auto-trash on this composite — Mitchell decides every tradeoff.',
    computed_at: new Date().toISOString(),
  };
}

/**
 * computeAndCacheForSlugs(slugs) → writes data/toxicity-composite.json keyed by slug.
 * Used by the dashboard build step.
 */
export function computeAndCacheForSlugs(slugs) {
  if (!Array.isArray(slugs)) return {};
  const cache = {};
  for (const s of slugs) {
    const slug = slugify(s);
    if (!slug || cache[slug]) continue;
    cache[slug] = computeToxicityComposite(slug);
  }
  try {
    if (!existsSync(dirname(COMPOSITE_CACHE_FP))) mkdirSync(dirname(COMPOSITE_CACHE_FP), { recursive: true });
    writeFileSync(COMPOSITE_CACHE_FP, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.warn(`[toxicity-composite] failed to cache: ${e.message}`);
  }
  return cache;
}

/**
 * loadCachedComposite() → loads cached composite scores (used at dashboard build time
 * to avoid recomputing if a recent cache exists).
 */
export function loadCachedComposite() {
  return safeJSON(COMPOSITE_CACHE_FP) || {};
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const slugArg = (args.find(a => a.startsWith('--slug=')) || '').split('=')[1];
  const refreshAll = args.includes('--refresh-all');
  const jsonOnly = args.includes('--json');

  if (refreshAll) {
    // Build the slug set from every directory under data/company-intel-cache
    // plus every slug-prefix found in data/hm-intel/
    const slugs = new Set();
    if (existsSync(INTEL_CACHE_DIR)) {
      for (const d of readdirSync(INTEL_CACHE_DIR)) {
        try {
          if (statSync(join(INTEL_CACHE_DIR, d)).isDirectory()) slugs.add(d);
        } catch {}
      }
    }
    if (existsSync(HM_INTEL_DIR)) {
      for (const f of readdirSync(HM_INTEL_DIR)) {
        if (!f.endsWith('.json') || f.startsWith('_')) continue;
        // hm-intel filenames: {slug}-{rolepart}.json — slug is first hyphen-delimited token group
        // we approximate by taking up to the first known role-stopword. Easier: try splitting on common role tokens.
        // For MVP, use the full company slug from the intel-cache directory set, and ignore hm-intel-only slugs
        // (they get picked up at dashboard build via the apps loop anyway).
      }
    }
    const cache = computeAndCacheForSlugs([...slugs]);
    if (jsonOnly) {
      console.log(JSON.stringify(cache, null, 2));
    } else {
      console.log(`[toxicity-composite] computed ${Object.keys(cache).length} composites → ${COMPOSITE_CACHE_FP}`);
      for (const [slug, c] of Object.entries(cache)) {
        console.log(`  ${slug.padEnd(28)}  ${String(c.score).padStart(2)} / 10  (${c.drivers.length} drivers, ${c.confidence})`);
      }
    }
    process.exit(0);
  }

  if (!slugArg) {
    console.error('Usage: node lib/toxicity-composite.mjs --slug=<company-slug>   [--json]');
    console.error('       node lib/toxicity-composite.mjs --refresh-all          [--json]');
    process.exit(1);
  }
  const result = computeToxicityComposite(slugArg);
  console.log(JSON.stringify(result, null, 2));
}
