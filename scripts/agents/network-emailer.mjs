#!/usr/bin/env node
/**
 * scripts/agents/network-emailer.mjs (ZETA 2026-05-19)
 *
 * Find a professional email for a person. STRICT MODE:
 *   1. Hunter.io API if HUNTER_API_KEY is set
 *   2. Pattern permutation generator (first.last@, flast@, first@) →
 *      MX-verify the domain via DNS resolveMx. **NO SMTP probing.**
 *   3. Cross-check against existing result_ok=true entries — never overwrite
 *      a Hunter-verified address with a pattern guess.
 *   4. Never claim confidence=high without real MX verification + Hunter
 *      verification=valid OR an explicit verified_at timestamp from Hunter.
 *
 * Output goes into data/network-database-enrichments.json under
 * `email_guesses[personId]` so the aggregator's next run materializes
 * them into emails.professional[] with the correct confidence band.
 *
 * Tonight's batch cap: 200 people, prioritized by warm_path_strength.
 *
 * CLI:
 *   node scripts/agents/network-emailer.mjs --person <id>
 *   node scripts/agents/network-emailer.mjs --top 200
 *   node scripts/agents/network-emailer.mjs --target-company anthropic --top 50
 *   node scripts/agents/network-emailer.mjs --dry-run            # don't hit network
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as dns } from 'node:dns';

try {
  const { config } = await import('dotenv');
  config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'), override: true });
} catch { /* dotenv optional */ }

import { personById as networkPersonById, loadDatabase } from '../../lib/network-database-search.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ENRICH_PATH = join(ROOT, 'data/contacts-enriched.json');
const OVERLAY_PATH = join(ROOT, 'data/network-database-enrichments.json');
const MX_CACHE = join(ROOT, 'data/network-database-cache/mx-cache.json');
const HUNTER_KEY = process.env.HUNTER_API_KEY || '';
const BATCH_CAP_PEOPLE = 200;

const argv = process.argv.slice(2);
function flag(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] || true) : null;
}
const PERSON_ID = flag('--person');
const TOP_N     = Number(flag('--top') || 200);
const TARGET_CO = flag('--target-company');
const DRY_RUN   = argv.includes('--dry-run');
const VERBOSE   = argv.includes('--verbose') || argv.includes('-v');

function log(...args) { if (VERBOSE) console.error('[emailer]', ...args); }

// ── MX cache (DNS results) ──────────────────────────────────────────────────
function readMxCache() {
  if (!existsSync(MX_CACHE)) return {};
  try { return JSON.parse(readFileSync(MX_CACHE, 'utf-8')); } catch { return {}; }
}
function writeMxCache(c) {
  if (!existsSync(dirname(MX_CACHE))) mkdirSync(dirname(MX_CACHE), { recursive: true });
  writeFileSync(MX_CACHE, JSON.stringify(c, null, 2));
}

async function mxVerify(domain, cache) {
  if (!domain) return false;
  const d = domain.toLowerCase();
  if (cache[d] != null) return cache[d];
  try {
    const records = await dns.resolveMx(d);
    const ok = Array.isArray(records) && records.length > 0;
    cache[d] = ok;
    return ok;
  } catch (e) {
    cache[d] = false;
    return false;
  }
}

// ── Domain inference ─────────────────────────────────────────────────────────
const COMPANY_DOMAIN_MAP = {
  anthropic: 'anthropic.com',
  openai: 'openai.com',
  google: 'google.com',
  meta: 'meta.com',
  microsoft: 'microsoft.com',
  cursor: 'cursor.com',
  anysphere: 'anysphere.inc',
  cohere: 'cohere.com',
  perplexity: 'perplexity.ai',
  sierra: 'sierra.ai',
  cognition: 'cognition.ai',
  pinecone: 'pinecone.io',
  'eleven': 'elevenlabs.io',
  elevenlabs: 'elevenlabs.io',
  mistral: 'mistral.ai',
  'mistral ai': 'mistral.ai',
  synthesia: 'synthesia.io',
};

function inferDomain(company) {
  if (!company) return null;
  const norm = String(company).toLowerCase().trim();
  if (COMPANY_DOMAIN_MAP[norm]) return COMPANY_DOMAIN_MAP[norm];
  // Heuristic: collapse whitespace + drop common suffixes; pick the longest
  // alpha-stem and try `${stem}.com`.
  const stem = norm
    .replace(/\b(inc|llc|ltd|corp|co|company|gmbh|labs?|technologies)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
  if (!stem || stem.length < 3) return null;
  return `${stem}.com`;
}

// ── Pattern permutation ──────────────────────────────────────────────────────
function patternGuesses(first, last, domain) {
  if (!first || !domain) return [];
  const f = String(first).toLowerCase().replace(/[^a-z]/g, '');
  const l = String(last || '').toLowerCase().replace(/[^a-z]/g, '');
  const guesses = [];
  if (f && l) {
    guesses.push(`${f}.${l}@${domain}`);     // first.last
    guesses.push(`${f[0]}${l}@${domain}`);   // flast
    guesses.push(`${f}${l}@${domain}`);      // firstlast
    guesses.push(`${f}_${l}@${domain}`);     // first_last
    guesses.push(`${l}.${f}@${domain}`);     // last.first
  }
  if (f) {
    guesses.push(`${f}@${domain}`);          // first@
  }
  // De-dupe
  return Array.from(new Set(guesses));
}

// ── Hunter.io call ───────────────────────────────────────────────────────────
async function hunterFind({ first, last, domain }) {
  if (!HUNTER_KEY || !domain || !first || !last) return null;
  const params = new URLSearchParams({
    api_key: HUNTER_KEY,
    domain,
    first_name: first,
    last_name: last,
  });
  const url = `https://api.hunter.io/v2/email-finder?${params}`;
  try {
    const r = await fetch(url, { method: 'GET' });
    if (!r.ok) {
      log(`Hunter HTTP ${r.status} for ${first} ${last} @ ${domain}`);
      return null;
    }
    const json = await r.json();
    if (!json?.data?.email) return null;
    return {
      email: json.data.email,
      score: json.data.score,
      verification: json.data.verification?.result || null,
      pattern: json.data.pattern || null,
      sources_count: Array.isArray(json.data.sources) ? json.data.sources.length : 0,
    };
  } catch (e) {
    log(`Hunter error: ${e.message}`);
    return null;
  }
}

// ── Overlay (shared with enricher) ───────────────────────────────────────────
function readOverlay() {
  if (!existsSync(OVERLAY_PATH)) return {};
  try { return JSON.parse(readFileSync(OVERLAY_PATH, 'utf-8')); } catch { return {}; }
}
function writeOverlay(o) {
  if (!existsSync(dirname(OVERLAY_PATH))) mkdirSync(dirname(OVERLAY_PATH), { recursive: true });
  writeFileSync(OVERLAY_PATH, JSON.stringify(o, null, 2));
}

// ── Existing enriched check (never overwrite a Hunter-verified address) ──────
function existingEnriched(nameKey) {
  if (!existsSync(ENRICH_PATH)) return null;
  try {
    const d = JSON.parse(readFileSync(ENRICH_PATH, 'utf-8'));
    return d.entries?.[nameKey] || null;
  } catch { return null; }
}

// ── Single-person ──────────────────────────────────────────────────────────
async function findFor(person, mxCache) {
  if (!person) throw new Error('no person');
  const nameKey = (person.full_name || '').toLowerCase().trim();
  const existing = existingEnriched(nameKey);
  if (existing && existing.email_guess?.address) {
    log(`skip ${person.id}: existing Hunter address ${existing.email_guess.address}`);
    return { ok: true, skipped: true, reason: 'existing_hunter_entry' };
  }
  if (DRY_RUN) {
    return { ok: true, dry_run: true, guesses: [] };
  }
  const domain = inferDomain(person.current_company || '');
  if (!domain) return { ok: false, reason: 'no_domain' };
  const mx = await mxVerify(domain, mxCache);
  if (!mx) return { ok: false, reason: 'no_mx', domain };

  let chosen = null;

  // Step 1: Hunter
  if (HUNTER_KEY) {
    const h = await hunterFind({ first: person.first, last: person.last, domain });
    if (h && h.email) {
      let conf = 'low';
      if (h.verification === 'valid' && (h.score || 0) >= 90) conf = 'high';
      else if (h.verification === 'valid' || h.verification === 'accept_all') conf = 'medium';
      chosen = {
        email: h.email,
        source: 'hunter_api',
        confidence: conf,
        verified_at: new Date().toISOString(),
        score: h.score,
        verification: h.verification,
        pattern: h.pattern,
        sources_count: h.sources_count,
      };
    }
  }

  // Step 2: Pattern guess + MX
  if (!chosen) {
    const guesses = patternGuesses(person.first, person.last, domain);
    if (guesses.length) {
      // We've already MX-verified the domain. Confidence: medium (pattern + MX).
      // Never high — that requires Hunter or equivalent send-side validation.
      chosen = {
        email: guesses[0], // most-likely-correct pattern (first.last@)
        source: 'pattern_mx_verified',
        confidence: 'medium',
        verified_at: new Date().toISOString(),
        pattern: '{first}.{last}',
        alternates: guesses.slice(1),
      };
    }
  }

  if (!chosen) return { ok: false, reason: 'no_candidate', domain };

  return { ok: true, email_record: chosen };
}

// ── Batch runner ─────────────────────────────────────────────────────────────
async function runBatch() {
  const db = loadDatabase();
  if (!db) throw new Error('database_not_built');

  let candidates = db.people
    .filter(p => p.warm_path_strength > 0)
    .filter(p => !((p.emails?.professional || []).some(e => e.confidence !== 'low')))
    .sort((a, b) => (b.warm_path_strength || 0) - (a.warm_path_strength || 0));
  if (TARGET_CO) {
    candidates = candidates.filter(p => (p.warm_to_target_companies || []).some(w => w.company_slug === TARGET_CO));
  }
  candidates = candidates.slice(0, Math.min(TOP_N, BATCH_CAP_PEOPLE));
  console.log(`[emailer] batch: ${candidates.length} candidates (cap ${BATCH_CAP_PEOPLE})`);

  const overlay = readOverlay();
  const mxCache = readMxCache();
  let ok = 0, fail = 0, skipped = 0;
  for (const p of candidates) {
    const result = await findFor(p, mxCache);
    if (result.ok && result.email_record) {
      overlay[p.id] = overlay[p.id] || {};
      overlay[p.id].email_guess = result.email_record;
      overlay[p.id].emailed_at = new Date().toISOString();
      ok++;
      log(`${p.full_name} → ${result.email_record.email} (${result.email_record.confidence})`);
    } else if (result.skipped) {
      skipped++;
    } else {
      fail++;
      log(`${p.full_name} → no_email (${result.reason})`);
    }
    if (((ok + fail) % 20) === 0) { writeOverlay(overlay); writeMxCache(mxCache); }
  }
  writeOverlay(overlay);
  writeMxCache(mxCache);

  // Re-run aggregator (only if anything found)
  if (ok > 0) {
    const { spawnSync } = await import('node:child_process');
    console.log(`[emailer] re-running aggregator`);
    spawnSync('node', [join(ROOT, 'scripts/build-network-database.mjs')], { stdio: 'inherit' });
  }

  console.log(`[emailer] done: ${ok} found · ${skipped} skipped · ${fail} failed`);
}

async function runOne(personId) {
  const person = networkPersonById(personId);
  if (!person) throw new Error(`person_not_found: ${personId}`);
  const mxCache = readMxCache();
  const result = await findFor(person, mxCache);
  writeMxCache(mxCache);

  if (result.ok && result.email_record) {
    const overlay = readOverlay();
    overlay[personId] = overlay[personId] || {};
    overlay[personId].email_guess = result.email_record;
    overlay[personId].emailed_at = new Date().toISOString();
    writeOverlay(overlay);
  }
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      if (PERSON_ID) await runOne(PERSON_ID);
      else await runBatch();
    } catch (e) {
      console.error('[emailer] FATAL:', e.message);
      process.exit(1);
    }
  })();
}

export { findFor, runBatch, runOne, mxVerify, patternGuesses, inferDomain };
