/**
 * lib/network-database-search.mjs (ZETA 2026-05-19)
 *
 * Pure-JS in-memory search over data/network-database.json. No
 * Elasticsearch, no external services. The DB is 2,824 people; an
 * inverted index on names + companies + roles fits comfortably in
 * memory and serves <300ms p95 on commodity hardware.
 *
 * Public API:
 *   loadDatabase(force=false) → { people, headline, totals_by_target, ... }
 *   searchNetwork({ query, filters, sort, page, pageSize }) → { hits, total, page, page_count, took_ms }
 *   personById(id) → person or null
 *   resolveWarmIntros(person) → enriches with mutual 1st-degree path data for each warm_to_target_companies entry
 *
 * Filter keys: degree, target_company, has_email, engagement,
 *   company_keyword, role_keyword, connected_after, connected_before.
 *
 * Sort keys: relevance (default), recently_connected, engagement_score,
 *   warm_path_strength.
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DB_PATH = join(ROOT, 'data/network-database.json');
const SECOND_DEGREE_DIR = join(ROOT, 'data/linkedin/2nd-degree');

let _cache = null;
let _cacheMtime = 0;
let _indexCache = null;

export function loadDatabase(force = false) {
  if (!existsSync(DB_PATH)) return null;
  const mtime = statSync(DB_PATH).mtimeMs;
  if (!force && _cache && _cacheMtime === mtime) return _cache;
  try {
    _cache = JSON.parse(readFileSync(DB_PATH, 'utf-8'));
    _cacheMtime = mtime;
    _indexCache = null;
    return _cache;
  } catch (e) {
    console.error('[network-search] DB parse failed:', e.message);
    return null;
  }
}

export function databaseLastBuilt() {
  if (!existsSync(DB_PATH)) return null;
  const db = loadDatabase();
  return db ? db.last_run : null;
}

// ── Tokenization ─────────────────────────────────────────────────────────────
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'at', 'in', 'on', 'and', 'or', 'to', '&']);

function tokens(s) {
  if (!s) return [];
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s.@-]/g, ' ')
    .split(/\s+/)
    .filter(t => t && t.length >= 2 && !STOPWORDS.has(t));
}

// Build a deduped per-person token bag — name + company + role + email
// localparts + warm-target slugs. We don't include LinkedIn URLs because
// they're long-tail identifiers, not search terms a human types.
function personTokens(p) {
  const bag = new Set();
  for (const t of tokens(p.full_name)) bag.add(t);
  for (const t of tokens(p.first)) bag.add(t);
  for (const t of tokens(p.last)) bag.add(t);
  if (p.current_company) for (const t of tokens(p.current_company)) bag.add(t);
  if (p.current_role)    for (const t of tokens(p.current_role))    bag.add(t);
  for (const e of (p.emails?.professional || [])) {
    const local = String(e.email || '').split('@')[0];
    for (const t of tokens(local)) bag.add(t);
  }
  for (const w of (p.warm_to_target_companies || [])) {
    for (const t of tokens(w.company_slug)) bag.add(t);
  }
  return bag;
}

function buildIndex(db) {
  if (_indexCache && _indexCache.db === db) return _indexCache;
  const tokenToIds = new Map(); // token → Set(personId)
  const byId = new Map();       // id → person
  for (const p of db.people) {
    byId.set(p.id, p);
    const bag = personTokens(p);
    for (const t of bag) {
      if (!tokenToIds.has(t)) tokenToIds.set(t, new Set());
      tokenToIds.get(t).add(p.id);
    }
  }
  _indexCache = { db, tokenToIds, byId };
  return _indexCache;
}

// ── Scoring ──────────────────────────────────────────────────────────────────
// BM25-ish lite: for each query token, score = idf(term) × tf-in-name-bonus.
// Then add bonuses: warm_path_strength × 0.1, has_email × 0.5, degree=1 × 0.2.
function scorePerson(p, queryTokens, idf) {
  let s = 0;
  const nameBag = new Set([...tokens(p.full_name), ...tokens(p.first), ...tokens(p.last)]);
  const companyBag = new Set(tokens(p.current_company || ''));
  const roleBag = new Set(tokens(p.current_role || ''));
  for (const qt of queryTokens) {
    const idfQ = idf.get(qt) || 0;
    if (nameBag.has(qt)) s += idfQ * 3;
    else if (companyBag.has(qt)) s += idfQ * 2;
    else if (roleBag.has(qt)) s += idfQ * 1.5;
    else s += idfQ * 0.5; // matched somewhere else in bag (email localpart, warm-slug)
  }
  s += (p.warm_path_strength || 0) * 0.1;
  if (p.emails?.professional?.some(e => e.confidence !== 'low')) s += 0.5;
  if (p.degree === 1) s += 0.2;
  return s;
}

function computeIdf(index) {
  const N = index.byId.size;
  const idf = new Map();
  for (const [t, ids] of index.tokenToIds) {
    idf.set(t, Math.log(1 + N / (1 + ids.size)));
  }
  return idf;
}

let _idfCache = null;
function getIdf(index) {
  if (_idfCache && _idfCache.index === index) return _idfCache.idf;
  _idfCache = { index, idf: computeIdf(index) };
  return _idfCache.idf;
}

// ── Filters ──────────────────────────────────────────────────────────────────
function applyFilters(p, filters) {
  if (!filters) return true;
  if (filters.degree && Number(p.degree) !== Number(filters.degree)) return false;
  if (filters.target_company) {
    const want = String(filters.target_company).toLowerCase();
    const has = (p.warm_to_target_companies || []).some(w => w.company_slug.includes(want));
    if (!has) return false;
  }
  if (filters.has_email === 'true' || filters.has_email === true) {
    const has = (p.emails?.professional || []).some(e => e.confidence !== 'low');
    if (!has) return false;
  }
  if (filters.engagement === 'any') {
    const e = p.engagement || {};
    if (!(e.linkedin_posts_engaged_count || e.x_posts_engaged_count)) return false;
  }
  if (filters.company_keyword) {
    const k = String(filters.company_keyword).toLowerCase();
    if (!String(p.current_company || '').toLowerCase().includes(k)) return false;
  }
  if (filters.role_keyword) {
    const k = String(filters.role_keyword).toLowerCase();
    if (!String(p.current_role || '').toLowerCase().includes(k)) return false;
  }
  if (filters.connected_after && p.connected_on && p.connected_on < filters.connected_after) return false;
  if (filters.connected_before && p.connected_on && p.connected_on > filters.connected_before) return false;
  return true;
}

// ── Sort ─────────────────────────────────────────────────────────────────────
function sortHits(hits, sortKey, scoresById) {
  if (sortKey === 'recently_connected') {
    hits.sort((a, b) => {
      const da = a.connected_on || '';
      const db = b.connected_on || '';
      return db.localeCompare(da);
    });
  } else if (sortKey === 'engagement_score') {
    hits.sort((a, b) => {
      const ea = (a.engagement?.linkedin_posts_engaged_count || 0) + (a.engagement?.x_posts_engaged_count || 0);
      const eb = (b.engagement?.linkedin_posts_engaged_count || 0) + (b.engagement?.x_posts_engaged_count || 0);
      return eb - ea;
    });
  } else if (sortKey === 'warm_path_strength') {
    hits.sort((a, b) => (b.warm_path_strength || 0) - (a.warm_path_strength || 0));
  } else {
    // relevance — uses precomputed scoresById
    hits.sort((a, b) => (scoresById.get(b.id) || 0) - (scoresById.get(a.id) || 0));
  }
}

// ── Public search ────────────────────────────────────────────────────────────
export function searchNetwork({ query = '', filters = {}, sort = 'relevance', page = 1, pageSize = 50 } = {}) {
  const t0 = Date.now();
  const db = loadDatabase();
  if (!db) return { hits: [], total: 0, page: 1, page_count: 0, took_ms: 0, error: 'database_not_built' };
  const index = buildIndex(db);
  const idf = getIdf(index);

  let candidates;
  let scoresById = new Map();
  const queryTokens = tokens(query);

  if (queryTokens.length === 0) {
    candidates = db.people;
  } else {
    // Union of all docs touched by any query token
    const idSet = new Set();
    for (const qt of queryTokens) {
      const ids = index.tokenToIds.get(qt);
      if (ids) for (const id of ids) idSet.add(id);
      // Prefix fallback — match tokens that *start with* qt (caps at 50 token-lookups)
      if (qt.length >= 3) {
        let prefixHits = 0;
        for (const [t, ids2] of index.tokenToIds) {
          if (prefixHits > 50) break;
          if (t !== qt && t.startsWith(qt)) {
            for (const id of ids2) idSet.add(id);
            prefixHits++;
          }
        }
      }
    }
    candidates = [];
    for (const id of idSet) candidates.push(index.byId.get(id));
    for (const p of candidates) scoresById.set(p.id, scorePerson(p, queryTokens, idf));
  }

  const filtered = candidates.filter(p => applyFilters(p, filters));
  sortHits(filtered, sort, scoresById);

  const ps = Math.max(1, Math.min(Number(pageSize) || 50, 500));
  const pg = Math.max(1, Number(page) || 1);
  const start = (pg - 1) * ps;
  const slice = filtered.slice(start, start + ps);

  return {
    hits: slice.map(stripInternal),
    total: filtered.length,
    page: pg,
    page_count: Math.max(1, Math.ceil(filtered.length / ps)),
    took_ms: Date.now() - t0,
  };
}

function stripInternal(p) {
  // No internal fields today — _name_key is stripped at build time. Keep this
  // helper so future internals (e.g., _ids, _embedding) don't leak into API.
  return p;
}

// ── Person detail ────────────────────────────────────────────────────────────
//
// personById applies live overlays from network-database-enrichments.json and
// network-database-notes.json. The aggregator merges these on every full
// build, but the live overlay handles the gap between "user clicks save note"
// and "next aggregator run", so the UI reflects the truth immediately.
const ENRICH_PATH = join(ROOT, 'data/network-database-enrichments.json');
const NOTES_PATH = join(ROOT, 'data/network-database-notes.json');
let _overlayCache = null;
let _overlayMtime = { enrich: 0, notes: 0 };
function readOverlays() {
  const enrichMtime = existsSync(ENRICH_PATH) ? statSync(ENRICH_PATH).mtimeMs : 0;
  const notesMtime  = existsSync(NOTES_PATH) ? statSync(NOTES_PATH).mtimeMs : 0;
  if (_overlayCache && _overlayMtime.enrich === enrichMtime && _overlayMtime.notes === notesMtime) {
    return _overlayCache;
  }
  const enrich = existsSync(ENRICH_PATH)
    ? (() => { try { return JSON.parse(readFileSync(ENRICH_PATH, 'utf-8')); } catch { return {}; } })()
    : {};
  const notes = existsSync(NOTES_PATH)
    ? (() => { try { return JSON.parse(readFileSync(NOTES_PATH, 'utf-8')); } catch { return {}; } })()
    : {};
  _overlayCache = { enrich, notes };
  _overlayMtime = { enrich: enrichMtime, notes: notesMtime };
  return _overlayCache;
}

export function personById(id) {
  const db = loadDatabase();
  if (!db) return null;
  const index = buildIndex(db);
  const base = index.byId.get(id) || null;
  if (!base) return null;
  // Apply live overlays without mutating the cached person object — return a copy.
  const overlays = readOverlays();
  const enrich = overlays.enrich[id];
  const notes = overlays.notes[id];
  if (!enrich && !notes) return base;
  const out = { ...base, emails: { ...base.emails, professional: base.emails.professional.slice() } };
  if (enrich) {
    if (enrich.current_team !== undefined || Array.isArray(enrich.likely_projects) || Array.isArray(enrich.drives)) {
      out.inferred = {
        current_team:   enrich.current_team || null,
        likely_projects: Array.isArray(enrich.likely_projects) ? enrich.likely_projects.slice(0, 8) : [],
        drives:         Array.isArray(enrich.drives) ? enrich.drives.slice(0, 8) : [],
        evidence_urls:  Array.isArray(enrich.evidence_urls) ? enrich.evidence_urls.slice(0, 20) : [],
      };
    }
    if (enrich.x_handle && !out.x_url) {
      out.x_url = `https://x.com/${String(enrich.x_handle).replace(/^@/, '')}`;
    }
    if (enrich.email_guess && enrich.email_guess.email) {
      const eg = enrich.email_guess;
      const already = out.emails.professional.find(e => e.email.toLowerCase() === String(eg.email).toLowerCase());
      if (!already) {
        out.emails.professional.push({
          email: eg.email,
          source: eg.source || 'pattern_mx_verified',
          confidence: eg.confidence || 'low',
          verified_at: eg.verified_at || null,
        });
      }
    }
  }
  if (notes && typeof notes.note === 'string') {
    out.notes = notes.note;
  }
  return out;
}

/**
 * resolveWarmIntros(person)
 * For each warm_to_target_companies entry, look up the 1st-degree intro
 * paths from data/linkedin/2nd-degree/{slug}.json. Returns the original
 * person enriched with `_warm_intro_paths`:
 *
 *   [
 *     { target_name, target_url, target_title, target_company_slug,
 *       intro_via: { name, url, atCompany, position } | null,
 *       evidence }
 *   ]
 *
 * The intro_via path is *this person* if they appear as a mutual_connection
 * in the 2nd-degree JSON for the target company.
 */
const _secondDegreeCache = new Map();
function loadSecondDegree(slug) {
  if (_secondDegreeCache.has(slug)) return _secondDegreeCache.get(slug);
  if (!existsSync(SECOND_DEGREE_DIR)) { _secondDegreeCache.set(slug, null); return null; }
  // Try slug.json, then alias-shaped fallbacks
  const candidates = [slug, slug.replace(/\s+/g, '-'), slug.replace(/\s+/g, ''), slug + '-ai'];
  for (const c of candidates) {
    const p = join(SECOND_DEGREE_DIR, `${c}.json`);
    if (existsSync(p)) {
      try {
        const obj = JSON.parse(readFileSync(p, 'utf-8'));
        _secondDegreeCache.set(slug, obj);
        return obj;
      } catch { /* try next */ }
    }
  }
  // Last resort: scan all files for one whose company normalizes to slug
  for (const f of readdirSync(SECOND_DEGREE_DIR)) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue;
    try {
      const obj = JSON.parse(readFileSync(join(SECOND_DEGREE_DIR, f), 'utf-8'));
      if (obj && obj.company && obj.company.toLowerCase().replace(/[^a-z0-9]+/g, '') === slug.replace(/[^a-z0-9]+/g, '')) {
        _secondDegreeCache.set(slug, obj);
        return obj;
      }
    } catch { /* ignore */ }
  }
  _secondDegreeCache.set(slug, null);
  return null;
}

export function resolveWarmIntros(person) {
  if (!person) return null;
  const paths = [];
  for (const w of (person.warm_to_target_companies || [])) {
    const sec = loadSecondDegree(w.company_slug);
    if (!sec || !Array.isArray(sec.contacts)) {
      // No 2nd-degree data available for this slug — surface evidence string
      // unchanged. This happens for `current_employer:` warm paths.
      paths.push({
        target_company_slug: w.company_slug,
        target_name: w.target_name,
        target_url: w.target_url,
        target_title: w.target_title,
        evidence: w.evidence,
        confidence: w.confidence,
        intro_path: null,
      });
      continue;
    }
    // Find the target by name
    const target = sec.contacts.find(c => c.name === w.target_name);
    paths.push({
      target_company_slug: w.company_slug,
      target_name: w.target_name || (target?.name || null),
      target_url: w.target_url || (target?.url || null),
      target_title: w.target_title || (target?.title || null),
      target_mutuals_text: target?.mutual_connections_text || null,
      evidence: w.evidence,
      confidence: w.confidence,
      intro_path: {
        via_name: person.full_name,
        via_url: person.linkedin_url,
        via_company: person.current_company,
        via_position: person.current_role,
      },
    });
  }
  return { ...person, _warm_intro_paths: paths };
}

// ── Headline + summary accessors ─────────────────────────────────────────────
export function networkDatabaseHeadline() {
  const db = loadDatabase();
  if (!db) return null;
  return {
    last_run: db.last_run,
    total: db.total,
    headline: db.headline,
    totals_by_target: db.totals_by_target,
  };
}

/**
 * topByWarmPath(n=100) — pre-baked preview for first-paint of the popout.
 * Returns top-N people by warm_path_strength, with the heavy `inferred.*`
 * and `engagement.*` blocks compacted to keep payload small.
 */
export function topByWarmPath(n = 100) {
  const db = loadDatabase();
  if (!db) return [];
  const sorted = db.people.slice().sort((a, b) => (b.warm_path_strength || 0) - (a.warm_path_strength || 0));
  return sorted.slice(0, n).map(p => ({
    id: p.id,
    full_name: p.full_name,
    linkedin_url: p.linkedin_url,
    x_url: p.x_url,
    current_company: p.current_company,
    current_role: p.current_role,
    connected_on: p.connected_on,
    degree: p.degree,
    warm_to_target_companies: p.warm_to_target_companies,
    warm_path_strength: p.warm_path_strength,
    has_email: (p.emails?.professional || []).some(e => e.confidence !== 'low'),
    top_email: pickBestEmail(p),
  }));
}

function pickBestEmail(p) {
  const list = (p.emails?.professional || []);
  if (!list.length) return null;
  const order = { high: 3, medium: 2, low: 1 };
  const sorted = list.slice().sort((a, b) => (order[b.confidence] || 0) - (order[a.confidence] || 0));
  return sorted[0];
}

// CLI smoke test: node lib/network-database-search.mjs "anthropic"
if (import.meta.url === `file://${process.argv[1]}`) {
  const q = process.argv.slice(2).join(' ') || 'anthropic';
  const r = searchNetwork({ query: q, page: 1, pageSize: 10 });
  console.log(`Q: "${q}" → ${r.total} hits in ${r.took_ms}ms`);
  for (const p of r.hits) {
    const intros = (p.warm_to_target_companies || []).map(w => w.company_slug).join(',');
    console.log(`  ${p.full_name.padEnd(28)} · ${(p.current_company || '').padEnd(20)} · degree=${p.degree} · warm=${intros || '—'}`);
  }
  console.log('headline:', networkDatabaseHeadline());
}
