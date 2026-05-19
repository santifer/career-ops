/**
 * lib/refresh-cache-registry.mjs — Single source of truth for every cache
 * the refresh-master orchestrator manages.
 *
 * Each cache entry declares:
 *   - id            : stable key used in policy + state
 *   - layer         : 1 (continuous/free) | 2 (Sonnet refresh) | 3 (Deep) | 4 (audit)
 *   - dir / pattern : where the cache files live + how to enumerate them
 *   - tierForRow(r) : optional; if cache is row-scoped, returns the row's tier
 *   - refreshHandler: relative path to the script that refreshes ONE item
 *   - costEstimate  : USD per refresh (used for budget pre-flight)
 *   - hardMaxTtlDays: never exceed this (Mitchell's <7d guarantee)
 *   - provider      : (Phase 1.5) which provider-adapter refreshes this cache.
 *                     Defaults to 'anthropic-sonnet' if absent. Other valid
 *                     values: 'perplexity-agent', 'grok-4-x-search'. Phase 2
 *                     wires the real implementations for non-Anthropic;
 *                     Phase 1.5 keeps everything pointed at anthropic-sonnet.
 *   - dedupScope    : (Phase 1.5) 'row' | 'company'. The orchestrator dedupes
 *                     queue entries by (cache.id, keyFromRow(row)) so per-
 *                     company caches only fire once per company even when
 *                     multiple rows reference that company.
 *   - minCitationsPer100Tokens : (Phase 1.5) citation density floor for
 *                     cache-write-validator. Default 1.0; set higher for
 *                     research-heavy caches (toxicity, company_pulse).
 *
 * Read by: scripts/refresh-master.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ── Cache registry ──────────────────────────────────────────────────────────
// Layer 1 entries are listed for observability; orchestrator doesn't fire them
// itself (they run on their own plists). Layer 2/3 are the ones the
// orchestrator actively schedules.

export const CACHES = [
  // ── Layer 1: continuous deterministic (orchestrator just OBSERVES freshness) ──
  {
    id: 'apply-now-queue',
    layer: 1,
    path: 'data/apply-now-queue.json',
    scope: 'global',
    hardMaxTtlDays: 1,
    refreshHandler: 'node scripts/build-dashboard.mjs', // dashboard build regenerates this
    costEstimate: 0,
  },
  {
    id: 'network-database',
    layer: 1,
    path: 'data/network-database.json',
    scope: 'global',
    hardMaxTtlDays: 1,
    refreshHandler: 'node scripts/build-network-database.mjs',
    costEstimate: 0,
  },
  {
    id: 'scan-history',
    layer: 1,
    path: 'data/scan-history.tsv',
    scope: 'global',
    hardMaxTtlDays: 1,
    refreshHandler: 'node scan.mjs',
    costEstimate: 0,
  },
  {
    id: 'liveness',
    layer: 1,
    path: 'data/liveness-cache.json',
    scope: 'global',
    hardMaxTtlDays: 1,
    refreshHandler: 'node check-liveness.mjs',
    costEstimate: 0,
  },

  // ── Layer 2: Sonnet refresh (per-row, tier-stratified) ──
  {
    id: 'hm_intel_delta',
    layer: 2,
    dir: 'data/hm-intel',
    scope: 'per-row',
    filePattern: '{slug}.json',
    keyFromRow: (r) => slugify(r.company + '-' + r.role),
    refreshHandler: 'node scripts/agents/intel-refresh.mjs --row {num} --slots hm-intel --mode delta-sonnet',
    costEstimate: 1.0,
    hardMaxTtlDays: 7,
    provider: 'anthropic-sonnet',
    dedupScope: 'row',
    minCitationsPer100Tokens: 0.8,
  },
  {
    id: 'toxicity_composite',
    layer: 2,
    dir: 'data/company-toxicity-cache',
    scope: 'per-company',
    filePattern: '{company_slug}.json',
    keyFromRow: (r) => slugify(r.company),
    refreshHandler: 'node scripts/agents/intel-refresh.mjs --row {num} --slots toxicity --mode sonnet',
    // Phase 2: per-cache provider routing. Toxicity research needs live
    // Glassdoor/Blind/Reddit search → Perplexity Sonar Deep Research is the
    // natural-home provider. Verifier (different architecture) is grok-4-x-search.
    costEstimate: 4.0, // Sonar Deep ~$4/call (search inclusive)
    hardMaxTtlDays: 7,
    provider: 'perplexity-agent',
    verifierProvider: 'grok-4-x-search',
    dedupScope: 'company',
    minCitationsPer100Tokens: 1.2,
  },
  {
    id: 'positioning',
    layer: 2,
    dir: 'data/positioning-cache',
    scope: 'per-row',
    filePattern: '{num}.json',
    keyFromRow: (r) => String(r.num),
    refreshHandler: 'node scripts/agents/intel-refresh.mjs --row {num} --slots positioning --mode sonnet',
    costEstimate: 1.0,
    hardMaxTtlDays: 7,
    provider: 'anthropic-sonnet',
    dedupScope: 'row',
    minCitationsPer100Tokens: 0.5, // positioning is craft, not citation-heavy
  },
  {
    id: 'role_enrichment',
    layer: 2,
    dir: 'data/role-enrichment',
    scope: 'per-row',
    // Files follow pattern {NN}-{slug}.json where NN is zero-padded rank.
    // Match by slug suffix since rank can change between refreshes.
    filePattern: '{rank}-{slug}.json',
    keyFromRow: (r) => slugify(r.company + '-' + r.role),
    refreshHandler: 'node scripts/enrich-apply-now.mjs --ranks {rank}-{rank}',
    // Phase 2: role-enrichment researches relocation + benefits + sentiment
    // + people. Mostly company-public-data + LinkedIn → Perplexity Sonar Pro
    // is faster + cheaper than Sonar Deep here. Verifier = anthropic-sonnet.
    costEstimate: 1.5,
    hardMaxTtlDays: 7,
    provider: 'perplexity-agent',
    providerOpts: { model: 'sonar-pro' },
    verifierProvider: 'anthropic-sonnet',
    dedupScope: 'row',
    minCitationsPer100Tokens: 1.0,
  },

  // ── Layer 3: Deep Research + council (event-triggered + scheduled rotation) ──
  {
    id: 'hm_intel_deep',
    layer: 3,
    dir: 'data/hm-intel',
    scope: 'per-row',
    filePattern: '{slug}.json',
    keyFromRow: (r) => slugify(r.company + '-' + r.role),
    refreshHandler: 'node scripts/hiring-manager-research.mjs --role "{company} {role}" --no-skip-deep',
    costEstimate: 30,
    hardMaxTtlDays: 14,  // deep refresh on rotation; delta refresh covers 7d
    provider: 'anthropic-sonnet', // Layer 3 doesn't actually call the adapter — it shells out — but the field is required for cache-write-validator gating
    dedupScope: 'row',
    minCitationsPer100Tokens: 1.0,
    // Phase 3 deliverable 5: pre-IPO equity stage/funding claims MUST cite
    // SEC OR Crunchbase OR a first-party company source. The cache-write-
    // validator gates writes against these allowlists.
    evidenceAllowlistForFields: {
      'comp.equity_stage': [
        'sec\\.gov',
        'crunchbase\\.com',
        // First-party company source: any URL that includes the company slug.
        '{company_slug}',
      ],
    },
  },
  {
    id: 'company_pulse',
    layer: 3,
    dir: 'data/company-pulse',
    scope: 'per-company',
    filePattern: '{company_slug}.json',
    keyFromRow: (r) => slugify(r.company),
    refreshHandler: 'node scripts/hiring-manager-research.mjs --company {company} --pulse-only',
    costEstimate: 2,
    hardMaxTtlDays: 7,
    provider: 'anthropic-sonnet',
    dedupScope: 'company',
    minCitationsPer100Tokens: 1.0,
  },

  // 2026-05-19 — relationship-intelligence enrichment per contact. Populates
  // the LLM-required fields in data/contact-card-schema-2026-05-19.md:
  // engagement topics + outreach positioning + inferred relationship arc.
  // NOT row-scoped (not all contacts map to apply-now rows) — the orchestrator
  // needs a separate priority queue for contacts (top-100 by
  // pre-IPO × archetype-match × in_outreach × shared-employer).
  // Provider routing: Perplexity Sonar Pro for engagement-pattern web research,
  // Grok-4-X-search for X engagement signal (architecturally orthogonal
  // verifier), Anthropic Sonnet for synthesis + voice-aligned positioning.
  // TTL 30d — engagement moves slowly.
  {
    id: 'contact_enrichment',
    layer: 2,
    dir: 'data/contact-enrichment-cache',
    scope: 'per-contact',
    filePattern: '{id}.json',
    // keyFromRow not used — contacts come from contactsDirectory, not apply-now.
    // Orchestrator handles this cache via a separate "contacts priority queue"
    // pass (see scripts/refresh-master.mjs Phase 2 wiring).
    keyFromContact: (c) => c.id,
    refreshHandler: 'node scripts/agents/network-enricher.mjs --contact {id}',
    costEstimate: 0.5,
    hardMaxTtlDays: 30,    // engagement moves slowly; 30d is reasonable
    provider: 'perplexity-agent',
    providerOpts: { model: 'sonar-pro' },
    verifierProvider: 'grok-4-x-search',  // architecturally orthogonal
    dedupScope: 'contact',
    minCitationsPer100Tokens: 1.0,
    // Priority signals (used by orchestrator to pick top-N contacts to enrich):
    priorityFactors: ['pre_ipo_match', 'archetype_match', 'in_outreach', 'shared_employer_with_mitchell'],
    priorityTopN: 100,  // default budget per refresh cycle
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * For a per-row cache + a row, find the existing cache file (if any) and return
 * { exists, path, ageDays }. Used by the orchestrator to decide refresh.
 */
export function inspectCacheForRow(cache, row) {
  if (cache.scope === 'global') {
    const abs = join(REPO_ROOT, cache.path);
    if (!existsSync(abs)) return { exists: false, path: abs, ageDays: Infinity };
    const stat = statSync(abs);
    return { exists: true, path: abs, ageDays: (Date.now() - stat.mtimeMs) / 86400000 };
  }
  const key = cache.keyFromRow(row);
  const dir = join(REPO_ROOT, cache.dir);
  if (!existsSync(dir)) return { exists: false, path: null, ageDays: Infinity, key };
  // Match files by key suffix (handles {rank}-{slug}.json pattern for role-enrichment).
  let entries;
  try { entries = readdirSync(dir); } catch { return { exists: false, path: null, ageDays: Infinity, key }; }
  const match = entries.find(f => f === `${key}.json` || f.endsWith(`-${key}.json`));
  if (!match) return { exists: false, path: null, ageDays: Infinity, key };
  const abs = join(dir, match);
  const stat = statSync(abs);
  return { exists: true, path: abs, ageDays: (Date.now() - stat.mtimeMs) / 86400000, key };
}

/**
 * Substitute {placeholders} in a refresh handler command using row data.
 * Supported: {num} {company} {role} {company_slug} {slug} {rank}
 */
export function buildCommand(handlerTemplate, row, opts = {}) {
  return handlerTemplate
    .replace('{num}', row.num || '')
    .replace('{rank}', String(row.rank || '').padStart(2, '0'))
    .replace('{company}', JSON.stringify(row.company || ''))
    .replace('{role}', JSON.stringify(row.role || ''))
    .replace('{company_slug}', slugify(row.company || ''))
    .replace('{slug}', slugify((row.company || '') + '-' + (row.role || '')));
}

export function getCachesByLayer(layer) {
  return CACHES.filter(c => c.layer === layer);
}

export function getCacheById(id) {
  return CACHES.find(c => c.id === id);
}
