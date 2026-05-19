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

// ── Entry ────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      if (PERSON_ID) await runOne(PERSON_ID);
      else if (PRIORITY) await runPriorityBatch();
      else if (TARGET_CO) await runPriorityBatch();
      else {
        console.error('Usage: node scripts/agents/network-enricher.mjs --person <id> | --priority-batch | --target-company <slug>');
        process.exit(1);
      }
    } catch (e) {
      console.error('[enricher] FATAL:', e.message);
      process.exit(1);
    }
  })();
}

export { enrichOne, runPriorityBatch, runOne, readOverlay };
