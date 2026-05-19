#!/usr/bin/env node
/**
 * scripts/agents/network-enricher.mjs (ZETA 2026-05-19)
 *
 * Sub-agent that takes a person from data/network-database.json and
 * infers `inferred.current_team`, `likely_projects`, `drives`, plus an
 * X handle if discoverable. Every claim must carry an evidence URL.
 *
 * Conventions match scripts/agents/cv-tailor.mjs:
 *   - Loads .env via dotenv with override:true
 *   - Uses lib/council.mjs callCouncil() for the LLM call
 *   - Zod-validated response schema; one retry on schema fail
 *   - 30-day result cache at data/network-database-cache/enrich/<id>.json
 *
 * Per-person cap: $0.50 (sonar-pro single call ≈ $0.03 + sonnet single
 * call ≈ $0.05 + safety headroom). Batch cap: $50 across top-200 by
 * warm_path_strength × target_company_priority.
 *
 * CLI:
 *   node scripts/agents/network-enricher.mjs --person <id>
 *   node scripts/agents/network-enricher.mjs --target-company anthropic --top 50
 *   node scripts/agents/network-enricher.mjs --priority-batch
 *
 * After enriching, the agent re-runs `scripts/build-network-database.mjs`
 * so the inferred.* updates land in data/network-database.json.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const { config } = await import('dotenv');
  config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'), override: true });
} catch { /* dotenv optional */ }

import { z } from 'zod';
import { callCouncil } from '../../lib/council.mjs';
import { personById as networkPersonById, loadDatabase } from '../../lib/network-database-search.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const CACHE_DIR = join(ROOT, 'data/network-database-cache/enrich');
const OVERLAY_PATH = join(ROOT, 'data/network-database-enrichments.json');
const COST_LOG = join(ROOT, 'data/network-database-cache/cost-log.jsonl');
const CACHE_TTL_DAYS = 30;
const PER_PERSON_CAP_USD = 0.50;
const BATCH_CAP_USD = 50;

const argv = process.argv.slice(2);
function flag(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] || true) : null;
}
const PERSON_ID  = flag('--person');
const CONTACT_ID = flag('--contact'); // Phase A.7: contact_enrichment cache mode
const TARGET_CO  = flag('--target-company');
const TOP_N      = Number(flag('--top') || 50);
const PRIORITY   = argv.includes('--priority-batch');
const DRY_RUN    = argv.includes('--dry-run');
const VERBOSE    = argv.includes('--verbose') || argv.includes('-v');

function log(...args) { if (VERBOSE) console.error('[enricher]', ...args); }

// ── Output schema ────────────────────────────────────────────────────────────
const EnrichmentSchema = z.object({
  current_team:   z.string().nullable(),
  likely_projects: z.array(z.string()).max(8),
  drives:         z.array(z.string()).max(8),
  evidence_urls:  z.array(z.string().url()).max(20),
  x_handle:       z.string().nullable(),
  confidence:     z.enum(['high', 'medium', 'low']),
  no_data_reason: z.string().nullable().optional(),
});

// ── Cost log ─────────────────────────────────────────────────────────────────
function ensureCacheDir() { if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true }); }

function appendCost({ person_id, model, dollars, tokens, took_ms }) {
  ensureCacheDir();
  const line = JSON.stringify({ ts: new Date().toISOString(), person_id, model, dollars, tokens, took_ms }) + '\n';
  try { writeFileSync(COST_LOG, line, { flag: 'a' }); } catch (e) { console.error('[enricher] cost-log write failed:', e.message); }
}

function totalSpentSession() {
  if (!existsSync(COST_LOG)) return 0;
  const today = new Date().toISOString().slice(0, 10);
  let total = 0;
  for (const line of readFileSync(COST_LOG, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      if ((rec.ts || '').slice(0, 10) === today) total += Number(rec.dollars) || 0;
    } catch { /* skip */ }
  }
  return total;
}

// ── Cache ────────────────────────────────────────────────────────────────────
function cachePath(id) { return join(CACHE_DIR, `${id}.json`); }

function readCache(id) {
  const p = cachePath(id);
  if (!existsSync(p)) return null;
  try {
    const obj = JSON.parse(readFileSync(p, 'utf-8'));
    const age = (Date.now() - new Date(obj.cached_at).getTime()) / 86400000;
    if (age > CACHE_TTL_DAYS) return null;
    return obj.data;
  } catch { return null; }
}

function writeCache(id, data) {
  ensureCacheDir();
  writeFileSync(cachePath(id), JSON.stringify({ cached_at: new Date().toISOString(), data }, null, 2));
}

// ── Overlay (the persisted inferred.* layer) ─────────────────────────────────
function readOverlay() {
  if (!existsSync(OVERLAY_PATH)) return {};
  try { return JSON.parse(readFileSync(OVERLAY_PATH, 'utf-8')); } catch { return {}; }
}

function writeOverlay(overlay) {
  if (!existsSync(dirname(OVERLAY_PATH))) mkdirSync(dirname(OVERLAY_PATH), { recursive: true });
  writeFileSync(OVERLAY_PATH, JSON.stringify(overlay, null, 2));
}

// ── Prompt ───────────────────────────────────────────────────────────────────
function buildPrompt(person) {
  const profile = {
    full_name: person.full_name,
    linkedin_url: person.linkedin_url,
    current_company: person.current_company,
    current_role: person.current_role,
    warm_to_target_companies: person.warm_to_target_companies?.map(w => w.company_slug) || [],
  };
  return [
    `You are researching a single person in Mitchell Williams' professional network to enrich his personal CRM.`,
    ``,
    `Person:`,
    `  Full name: ${profile.full_name}`,
    `  LinkedIn: ${profile.linkedin_url || '(not on file)'}`,
    `  Current company: ${profile.current_company || '(unknown)'}`,
    `  Current role: ${profile.current_role || '(unknown)'}`,
    `  Marked warm-to-target-companies: ${profile.warm_to_target_companies.join(', ') || '(none)'}`,
    ``,
    `Use ONLY public web sources (LinkedIn public profile, company blog/press/team pages, GitHub, Twitter/X, conference speaker lists, podcast appearances, news mentions). DO NOT use anything paywalled, anything inferred from training-data memory without a current URL, or anything you cannot cite.`,
    ``,
    `Return STRICT JSON (no markdown fences, no commentary) with this shape:`,
    `{`,
    `  "current_team":    string | null,           // e.g., "Anthropic Frontiers Comms" — only if confirmed by a cited source`,
    `  "likely_projects": string[],                // 0-8 items, public-facing project names this person currently drives (e.g., "Claude 4 launch comms")`,
    `  "drives":          string[],                // 0-8 items, areas of responsibility they are publicly known for`,
    `  "evidence_urls":   string[],                // 0-20 URLs that back the above`,
    `  "x_handle":        string | null,           // their X/Twitter handle (no leading @), only if confirmed`,
    `  "confidence":      "high" | "medium" | "low",`,
    `  "no_data_reason":  string | null            // when everything is null/empty — explain (e.g., "Person has no public footprint; LinkedIn profile blank")`,
    `}`,
    ``,
    `RULES (anti-hallucination):`,
    `  - If you cannot find a cited source, return null for current_team/x_handle and [] for projects/drives. NEVER guess.`,
    `  - Every project, drive, or team claim MUST be backed by an evidence_urls entry.`,
    `  - confidence = "high" only if 2+ independent sources corroborate; "medium" if 1; "low" if you returned empties.`,
    `  - URLs must be live and specific (not the homepage of a giant site).`,
  ].join('\n');
}

// ── Council call + cost rollup ───────────────────────────────────────────────
async function enrichOne(person) {
  const cached = readCache(person.id);
  if (cached) {
    log(`cache hit for ${person.id}`);
    return { ...cached, _cache: true };
  }

  if (DRY_RUN) {
    return {
      current_team: null, likely_projects: [], drives: [], evidence_urls: [],
      x_handle: null, confidence: 'low',
      no_data_reason: '[dry-run] no LLM call made',
      _cache: false, _dry_run: true,
    };
  }

  const sessionSpent = totalSpentSession();
  if (sessionSpent >= BATCH_CAP_USD) {
    throw new Error(`batch_cap_reached: $${sessionSpent.toFixed(2)} spent today, cap is $${BATCH_CAP_USD}`);
  }

  const prompt = buildPrompt(person);
  log(`firing council for ${person.id} (${person.full_name})`);

  // Use Sonar-pro (cheap, native citations) + Sonnet (reasoning) — exactly the
  // pair the Z.3 brief calls for.
  const t0 = Date.now();
  const { results } = await callCouncil({
    prompt,
    models: ['perplexity:sonar-pro', 'anthropic:claude-sonnet-4-6'],
    opts: { maxTokens: 2000, retryOnRefusal: false },
  });

  // Pick the first successful, schema-valid response.
  let chosen = null;
  let chosenModel = null;
  for (const r of results) {
    if (r.error || !r.content) continue;
    const parsed = tryParseEnrichment(r.content);
    if (parsed) { chosen = parsed; chosenModel = r.model; break; }
  }
  if (!chosen) {
    // Last-resort: log the raw and bail without polluting cache. Returns an
    // empty inferred record so the caller can fall back to "no data".
    log(`no usable response from council for ${person.id}`);
    const empty = { current_team: null, likely_projects: [], drives: [], evidence_urls: [], x_handle: null, confidence: 'low', no_data_reason: 'no_council_response' };
    appendCost({ person_id: person.id, model: 'council_failed', dollars: 0.01, tokens: 0, took_ms: Date.now() - t0 });
    return { ...empty, _cache: false };
  }

  // Estimate cost: sonar-pro ≈ $0.03/call, sonnet ≈ $0.05/call. Use the
  // observed model's typed estimate rather than per-token math (which is
  // brittle across providers).
  const costEstimate = chosenModel === 'perplexity:sonar-pro' ? 0.03 : 0.05;
  appendCost({ person_id: person.id, model: chosenModel, dollars: costEstimate, tokens: results.find(r => r.model === chosenModel)?.tokens || 0, took_ms: Date.now() - t0 });

  if (costEstimate > PER_PERSON_CAP_USD) {
    console.warn(`[enricher] cost ${costEstimate} exceeded per-person cap ${PER_PERSON_CAP_USD} for ${person.id}`);
  }

  writeCache(person.id, chosen);
  return { ...chosen, _cache: false, _model_used: chosenModel };
}

function tryParseEnrichment(content) {
  // Strip code fences if model added them despite instructions
  const stripped = String(content).trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(stripped); }
  catch {
    // Try to extract the first JSON object via brace matching
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { parsed = JSON.parse(m[0]); } catch { return null; }
  }
  const v = EnrichmentSchema.safeParse(parsed);
  if (v.success) return v.data;
  log(`schema validation failed: ${v.error.message}`);
  return null;
}

// ── Priority batch (warm_path_strength × target_company_priority) ────────────
function priorityScore(person, applyNowMeta) {
  let s = (person.warm_path_strength || 0);
  for (const w of (person.warm_to_target_companies || [])) {
    const rank = applyNowMeta?.[w.company_slug]?.rank;
    if (rank) s += Math.max(0, 30 - rank) * 0.5;
  }
  return s;
}

async function runPriorityBatch() {
  const db = loadDatabase();
  if (!db) throw new Error('database_not_built: run scripts/build-network-database.mjs first');
  const applyNowMeta = db.totals_by_target || {};
  let candidates = db.people
    .filter(p => p.warm_path_strength > 0)
    .map(p => ({ p, score: priorityScore(p, applyNowMeta) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 200)
    .map(x => x.p);

  if (TARGET_CO) {
    candidates = candidates.filter(p => (p.warm_to_target_companies || []).some(w => w.company_slug === TARGET_CO)).slice(0, TOP_N);
  }

  console.log(`[enricher] priority batch: ${candidates.length} candidates, batch cap $${BATCH_CAP_USD}`);

  const results = [];
  const overlay = readOverlay();
  for (const p of candidates) {
    const spent = totalSpentSession();
    if (spent >= BATCH_CAP_USD - PER_PERSON_CAP_USD) {
      console.warn(`[enricher] stopping batch: $${spent.toFixed(2)} of $${BATCH_CAP_USD} spent`);
      break;
    }
    try {
      const enr = await enrichOne(p);
      overlay[p.id] = { ...enr, enriched_at: new Date().toISOString() };
      results.push({ id: p.id, ok: true, cache: !!enr._cache });
      if ((results.length % 10) === 0) writeOverlay(overlay);
      console.log(`[enricher] ${results.length}/${candidates.length} — ${p.full_name} → conf=${enr.confidence} ev_urls=${enr.evidence_urls?.length || 0}${enr._cache ? ' (cache)' : ''}`);
    } catch (e) {
      console.error(`[enricher] ${p.id} failed: ${e.message}`);
      results.push({ id: p.id, ok: false, error: e.message });
      if (/batch_cap_reached/.test(e.message)) break;
    }
  }
  writeOverlay(overlay);

  // Re-run the aggregator so inferred.* lands in data/network-database.json.
  const { spawnSync } = await import('node:child_process');
  console.log(`[enricher] re-running aggregator to materialize enrichments`);
  const r = spawnSync('node', [join(ROOT, 'scripts/build-network-database.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) console.warn(`[enricher] aggregator returned ${r.status}`);

  console.log(`[enricher] batch complete: ${results.filter(r => r.ok).length}/${results.length} ok, $${totalSpentSession().toFixed(2)} spent today`);
  return results;
}

async function runOne(personId) {
  const person = networkPersonById(personId);
  if (!person) throw new Error(`person_not_found: ${personId}`);
  const enr = await enrichOne(person);
  const overlay = readOverlay();
  overlay[personId] = { ...enr, enriched_at: new Date().toISOString() };
  writeOverlay(overlay);
  console.log(JSON.stringify({ person_id: personId, ...enr }, null, 2));
  return enr;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase A.7 (2026-05-19): contact_enrichment cache schema adapter.
//
// Different schema target than the network-database --person mode:
//   - reads contact from _CONTACTS_DATA (baked dashboard) NOT from network-database
//   - writes rich schema to data/contact-enrichment-cache/{id}.json
//     (per data/contact-card-schema-2026-05-19.md)
//   - provider routing per registry:
//       Perplexity Sonar Pro for engagement.linkedin_topics (web research)
//       Grok-4-X-search for engagement.x_topics + verifier (architecturally
//                       orthogonal vs. Sonnet — catches sycophantic agreement)
//       Anthropic Sonnet for outreach_recommendation.positioning (uses
//                       Mitchell's voice corpus)
//   - records provenance (source_urls, retrieved_at, model, verifier_passed)
//   - per-contact cap: $0.50 (sonar-pro ≈$0.03 + grok-X ≈$0.05 + sonnet ≈$0.05
//     + safety headroom). Honors A.0 timeout hardening via callCouncil's
//     opts.timeoutMs.
// ─────────────────────────────────────────────────────────────────────────────
import { z as _z } from 'zod';
const CONTACT_ENRICHMENT_CACHE_DIR = join(ROOT, 'data/contact-enrichment-cache');
const CONTACT_ENRICHMENT_TTL_DAYS = 30; // engagement moves slowly
const DASHBOARD_HTML_PATH = join(ROOT, 'dashboard/index.html');

const ContactEngagementSchema = _z.object({
  linkedin_topics: _z.array(_z.string()).max(15).default([]),
  linkedin_last_active: _z.string().nullable().default(null),
  x_topics: _z.array(_z.string()).max(15).default([]),
  x_last_active: _z.string().nullable().default(null),
  recent_engaged_posts: _z.array(_z.object({
    url: _z.string().nullable().default(null),
    ts: _z.string().nullable().default(null),
    summary: _z.string().max(400).default(''),
  })).max(15).default([]),
});

const ContactOutreachSchema = _z.object({
  positioning: _z.string().nullable().default(null),
  best_channel: _z.enum(['linkedin_dm', 'email', 'x_dm', 'in_person', 'unknown']).default('unknown'),
  suggested_opening_lines: _z.array(_z.string()).max(5).default([]),
  recommended_next_action: _z.string().nullable().default(null),
});

const ContactInferredSchema = _z.object({
  arc: _z.string().nullable().default(null),
  why_we_might_connect_now: _z.string().nullable().default(null),
  shared_interests: _z.array(_z.string()).max(10).default([]),
});

const ContactCacheSchema = _z.object({
  schema_version: _z.literal(1).default(1),
  engagement: ContactEngagementSchema,
  outreach_recommendation: ContactOutreachSchema,
  inferred_relationship: ContactInferredSchema,
  no_data_reason: _z.string().nullable().default(null),
});

function _extractContactsData() {
  if (!existsSync(DASHBOARD_HTML_PATH)) return [];
  const html = readFileSync(DASHBOARD_HTML_PATH, 'utf8');
  const m = html.match(/var\s+_CONTACTS_DATA\s*=\s*(\[[\s\S]*?\]);/m);
  if (!m) return [];
  try { return JSON.parse(m[1].replace(/<\\\//g, '</')); } catch { return []; }
}

function _readContactCache(id) {
  const fp = join(CONTACT_ENRICHMENT_CACHE_DIR, `${id}.json`);
  if (!existsSync(fp)) return null;
  try {
    const obj = JSON.parse(readFileSync(fp, 'utf-8'));
    const age = (Date.now() - new Date(obj.retrieved_at || obj.cached_at || 0).getTime()) / 86400000;
    if (age > CONTACT_ENRICHMENT_TTL_DAYS) return null;
    return obj;
  } catch { return null; }
}

function _writeContactCache(id, obj) {
  if (!existsSync(CONTACT_ENRICHMENT_CACHE_DIR)) mkdirSync(CONTACT_ENRICHMENT_CACHE_DIR, { recursive: true });
  writeFileSync(join(CONTACT_ENRICHMENT_CACHE_DIR, `${id}.json`), JSON.stringify(obj, null, 2));
}

function _buildContactPrompt(contact) {
  return [
    `You are researching ONE person in Mitchell Williams's professional network to populate his contact-card relationship-intelligence layer.`,
    ``,
    `Contact:`,
    `  Name: ${contact.name}`,
    `  Current company: ${contact.company || 'unknown'}`,
    `  Current role: ${contact.position || 'unknown'}`,
    `  LinkedIn: ${contact.linkedin_url || '(not on file)'}`,
    `  X / Twitter: ${contact.x_handle ? '@' + contact.x_handle.replace(/^@/,'') : '(not on file)'}`,
    `  Mitchell + this contact shared employers: ${(contact.overlap_with_mitchell || []).map(o => o.company).join(', ') || 'none'}`,
    `  Other Mitchell-network contacts at the same company: ${(contact.others_at_company || []).length}`,
    `  Currently in active outreach: ${contact.in_outreach ? 'YES' : 'no'}`,
    `  Pre-IPO equity company: ${contact.goal_alignment && contact.goal_alignment.pre_ipo_match ? 'yes' : 'no'}`,
    ``,
    `Use ONLY publicly accessible web sources. Cite every claim with a URL.`,
    `If you cannot find a cited source for a field, leave it null/empty — NEVER fabricate.`,
    ``,
    `Return STRICT JSON matching this schema (no markdown fences, no commentary):`,
    `{`,
    `  "schema_version": 1,`,
    `  "engagement": {`,
    `    "linkedin_topics":          ["short tag", ...],            // 0-15, topics they post/engage about on LinkedIn`,
    `    "linkedin_last_active":     "YYYY-MM-DD" | null,            // most recent confirmed post / comment / reaction`,
    `    "x_topics":                 ["short tag", ...],            // 0-15`,
    `    "x_last_active":            "YYYY-MM-DD" | null,`,
    `    "recent_engaged_posts": [`,
    `      { "url": "...", "ts": "YYYY-MM-DD" | null, "summary": "<=400 chars" }`,
    `    ]                                                          // up to 15 most-recent posts`,
    `  },`,
    `  "outreach_recommendation": {`,
    `    "positioning": "<= 320 chars, Mitchell-voice — first-person, plain language, no AI-jargon, references specific signal" | null,`,
    `    "best_channel": "linkedin_dm" | "email" | "x_dm" | "in_person" | "unknown",`,
    `    "suggested_opening_lines": ["<=160 char first line that lands a reply", ...],   // 0-5`,
    `    "recommended_next_action": "<=200 char concrete next-step Mitchell can take in the next 7 days" | null`,
    `  },`,
    `  "inferred_relationship": {`,
    `    "arc": "<=240 char synthesis of the relationship history + current state" | null,`,
    `    "why_we_might_connect_now": "<=240 chars, citing TODAY's signal (news, project, hire, fundraise, etc.) — never a generic platitude" | null,`,
    `    "shared_interests": ["short tag", ...]                                              // 0-10`,
    `  },`,
    `  "no_data_reason": null | "string explaining why most fields are empty"`,
    `}`,
    ``,
    `Mitchell's voice for the positioning field:`,
    `  - first-person, plain language, no AI-marketing-speak`,
    `  - kill list: "delve", "passionate", "synergy", "leverage", "tapestry", exclamation marks, em-dashes`,
    `  - concrete metrics > vague claims`,
    `  - never invent metrics about Mitchell — only restate what cv.md already says`,
    `  - tone: "I noticed you posted about X. I'm working on Y. Worth a 20-min call?"`,
    ``,
    `Anti-hallucination rules:`,
    `  - Every "engages with" / "posts about" claim MUST cite a URL in recent_engaged_posts.`,
    `  - If LinkedIn / X profile is private or returns 0 posts: set linkedin_topics = [] and write a no_data_reason explaining.`,
    `  - Do NOT invent timestamps. If you can't determine linkedin_last_active, return null.`,
  ].join('\n');
}

async function _runContactEnrichment(contactId, opts = {}) {
  const t0 = Date.now();
  // Cache hit?
  if (!opts.refresh) {
    const cached = _readContactCache(contactId);
    if (cached) {
      vlog(`contact-enrichment cache hit for ${contactId}`);
      return { ok: true, cache_hit: true, contactId, ...cached };
    }
  }
  // Locate contact in baked _CONTACTS_DATA
  const contacts = _extractContactsData();
  const contact = contacts.find(c => c.id === contactId);
  if (!contact) {
    return { ok: false, error: `contact ${contactId} not found in _CONTACTS_DATA` };
  }
  if (DRY_RUN) {
    return { ok: false, dry_run: true, would_enrich: contactId, name: contact.name };
  }

  // Build prompt
  const prompt = _buildContactPrompt(contact);

  // Fire 3-way council: Perplexity Sonar Pro (search) + Sonnet (voice synthesis)
  //                     + Grok-4 with X search (architecturally orthogonal verifier)
  // POLISH_API_TIMEOUT_MS doesn't apply here; the registry calls per-cache provider routing.
  const { callCouncil } = await import('../../lib/council.mjs');
  const lineup = [
    'perplexity:sonar-pro',
    'anthropic:claude-sonnet-4-6',
    'xai:grok-4-x-search',
  ];

  log(`[contact-enrich] firing 3-way council for ${contact.name} (${contactId}); cost cap ~$0.50`);
  let council;
  try {
    council = await callCouncil({
      prompt,
      models: lineup,
      opts: {
        maxTokens: 3500,
        timeoutMs: 180_000,   // 3-min ceiling per slot (A.0 hardening)
        retryOnRefusal: false,
        agentSlug: 'network-enricher:contact',
      },
    });
  } catch (e) {
    return { ok: false, error: `council error: ${e.message}` };
  }

  // Pick the FIRST schema-valid response as primary content.
  // Verifier = a DIFFERENT-architecture model agreeing on the engagement claims.
  let primary = null;
  let primaryModel = null;
  const sourceUrlsAll = new Set();
  for (const r of (council.results || [])) {
    if (r.error || !r.content) continue;
    for (const c of (r.citations || [])) {
      if (typeof c === 'string' && c.startsWith('http')) sourceUrlsAll.add(c);
    }
    const parsed = _tryParseContactJson(r.content);
    if (parsed && !primary) {
      primary = parsed;
      primaryModel = r.model;
    }
  }
  if (!primary) {
    return { ok: false, error: 'no schema-valid response from 3-way council', council_summary: (council.results || []).map(r => ({ model: r.model, error: r.error })) };
  }

  // Verifier pass: at least 2 of 3 models agree the engagement.linkedin_topics
  // contains the SAME themes (≥1 overlap). Stricter than nothing, looser than
  // exact-match — engagement is qualitative.
  const allParsed = (council.results || [])
    .map(r => r.error ? null : _tryParseContactJson(r.content))
    .filter(Boolean);
  const verifier_passed = _verifierAgreement(allParsed);

  const totalCost = (council.results || []).reduce((s, r) => s + (r.costUsd || 0), 0);

  const envelope = {
    schema_version: 1,
    id: contactId,
    ...primary,
    source_urls: Array.from(sourceUrlsAll),
    retrieved_at: new Date().toISOString(),
    model: primaryModel,
    verifier_passed,
    verifier_lineup: lineup,
    verifier_dissent_count: allParsed.length - (verifier_passed ? allParsed.length : 1),
    fields_populated: _countPopulated(primary),
    cost_usd: +totalCost.toFixed(4),
    latency_ms: Date.now() - t0,
    diff_summary: 'initial',
    priority_score_at_write: opts.priorityScore ?? null,
  };

  _writeContactCache(contactId, envelope);
  log(`[contact-enrich] wrote ${contactId} (verifier=${verifier_passed ? 'PASS' : 'FAIL'}, cost=$${envelope.cost_usd}, citations=${envelope.source_urls.length}, fields=${envelope.fields_populated})`);
  return { ok: true, contactId, ...envelope };
}

function _tryParseContactJson(content) {
  const stripped = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(stripped); }
  catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { parsed = JSON.parse(m[0]); } catch { return null; }
  }
  const v = ContactCacheSchema.safeParse(parsed);
  return v.success ? v.data : null;
}

function _verifierAgreement(parsedList) {
  if (parsedList.length < 2) return false;
  const themes = parsedList.map(p =>
    new Set([...(p.engagement?.linkedin_topics || []), ...(p.engagement?.x_topics || []), ...(p.inferred_relationship?.shared_interests || [])].map(t => String(t).toLowerCase().trim()))
  );
  // At least 2 models share ≥1 theme
  let pairs = 0;
  for (let i = 0; i < themes.length; i++) {
    for (let j = i + 1; j < themes.length; j++) {
      const overlap = [...themes[i]].some(t => themes[j].has(t));
      if (overlap) pairs++;
    }
  }
  return pairs > 0;
}

function _countPopulated(parsed) {
  let count = 0;
  if ((parsed.engagement?.linkedin_topics || []).length) count++;
  if (parsed.engagement?.linkedin_last_active) count++;
  if ((parsed.engagement?.x_topics || []).length) count++;
  if (parsed.engagement?.x_last_active) count++;
  if ((parsed.engagement?.recent_engaged_posts || []).length) count++;
  if (parsed.outreach_recommendation?.positioning) count++;
  if (parsed.outreach_recommendation?.best_channel && parsed.outreach_recommendation.best_channel !== 'unknown') count++;
  if ((parsed.outreach_recommendation?.suggested_opening_lines || []).length) count++;
  if (parsed.inferred_relationship?.arc) count++;
  if (parsed.inferred_relationship?.why_we_might_connect_now) count++;
  if ((parsed.inferred_relationship?.shared_interests || []).length) count++;
  return count;
}

// Public API for orchestrators (used by refresh-master per-contact handler).
export async function runContactEnrichment(contactId, opts = {}) {
  return _runContactEnrichment(contactId, opts);
}

// ── Entry ────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      if (CONTACT_ID) {
        const r = await runContactEnrichment(CONTACT_ID);
        console.log(JSON.stringify(r, null, 2));
        process.exit(r.ok ? 0 : 1);
      }
      else if (PERSON_ID) await runOne(PERSON_ID);
      else if (PRIORITY) await runPriorityBatch();
      else if (TARGET_CO) await runPriorityBatch();
      else {
        console.error('Usage: node scripts/agents/network-enricher.mjs --contact <id> | --person <id> | --priority-batch | --target-company <slug>');
        process.exit(1);
      }
    } catch (e) {
      console.error('[enricher] FATAL:', e.message);
      process.exit(1);
    }
  })();
}

export { enrichOne, runPriorityBatch, runOne, readOverlay };
