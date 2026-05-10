/**
 * lib/linkedin-network.mjs — Parse Mitchell's LinkedIn data export and
 * surface 1st-degree connections per company for the dashboard.
 *
 * Input:  data/linkedin/Connections.csv  (LinkedIn's standard export schema:
 *         First Name,Last Name,URL,Email Address,Company,Position,Connected On
 *         preceded by a "Notes:" preamble that we skip.)
 *
 * Output: companyToContacts(): Map<normalizedCompany, Contact[]>
 *         getContactsAtCompany(company): Contact[]
 *
 * Privacy: emails are STRIPPED from every Contact returned to the dashboard.
 *          The CSV file itself is gitignored (data/linkedin/.gitignore-bound).
 *
 * Optional: data/linkedin/2nd-degree/{company-slug}.json adds 2nd-degree
 *           connections scraped from LinkedIn's company People page via
 *           scripts/scrape-linkedin-2nd-degree.mjs (Phase 1).
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_PATH = join(ROOT, 'data/linkedin/Connections.csv');
const SECOND_DEGREE_DIR = join(ROOT, 'data/linkedin/2nd-degree');
const OVERRIDES_PATH = join(ROOT, 'data/linkedin/overrides.json');

// ── Company-name normalization ────────────────────────────────────────────
// LinkedIn lets people self-report their employer in any format:
//   "OpenAI" / "OpenAI, Inc." / "OpenAI Inc" / "OpenAI inc." / "openai"
// Normalize by lowercasing + stripping common corporate suffixes + trailing
// punctuation so "OpenAI, Inc." matches "openai" and the queue's "OpenAI".
const SUFFIX_RE = /[,]?\s*(?:inc\.?|incorporated|llc\.?|ltd\.?|limited|corp\.?|corporation|co\.?|company|gmbh|s\.?a\.?|sas|plc|s\.?r\.?l\.?|holdings?|group|labs?|technologies|technology)\.?\s*$/i;
const PAREN_TAIL_RE = /\s*\([^)]*\)\s*$/;

export function normalizeCompany(name) {
  if (!name) return '';
  let n = String(name).toLowerCase().trim();
  // Strip parenthetical tails like "Cursor (Anysphere)" → "cursor"
  // (matches the queue convention but keeps both parts as alternates below).
  n = n.replace(PAREN_TAIL_RE, '');
  // Collapse whitespace.
  n = n.replace(/\s+/g, ' ');
  // Strip corporate suffixes (loop because "OpenAI, Inc." → "openai," → "openai")
  for (let i = 0; i < 3; i++) {
    const next = n.replace(SUFFIX_RE, '').replace(/[.,;]+$/, '').trim();
    if (next === n) break;
    n = next;
  }
  return n;
}

// Common alternate names so "Cursor" matches "Anysphere" matches "Cursor (Anysphere)"
const COMPANY_ALIASES = {
  'cursor': ['anysphere'],
  'anysphere': ['cursor'],
  'mistral ai': ['mistral'],
  'mistral': ['mistral ai'],
  'x': ['xai', 'x corp', 'twitter'],
  'xai': ['x', 'x.ai'],
  'meta': ['facebook'],
  'facebook': ['meta'],
  'google': ['alphabet'],
  'alphabet': ['google'],
};

function aliasesFor(company) {
  const norm = normalizeCompany(company);
  const aliases = new Set([norm]);
  if (COMPANY_ALIASES[norm]) {
    for (const a of COMPANY_ALIASES[norm]) aliases.add(normalizeCompany(a));
  }
  return Array.from(aliases);
}

// ── Tolerant CSV parser ───────────────────────────────────────────────────
// LinkedIn's export uses standard RFC 4180 quoting (""double quotes"" inside
// quoted fields, commas inside quotes are literal). We need a real parser,
// not a split(',') hack — names + titles routinely contain commas.
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cur += c;
      }
    } else {
      if (c === ',') { fields.push(cur); cur = ''; }
      else if (c === '"' && cur === '') { inQuotes = true; }
      else { cur += c; }
    }
  }
  fields.push(cur);
  return fields;
}

// ── Overrides loader ──────────────────────────────────────────────────────
// Manual corrections layered on top of the CSV (which is a point-in-time
// snapshot). Schema described in data/linkedin/overrides.json. Gitignored
// like the CSV itself — the override file may carry the same kind of
// personal-relationship metadata that should never reach the remote repo.
let _overridesCache = null;
function loadOverrides() {
  if (_overridesCache) return _overridesCache;
  const empty = { no_longer_at: {}, now_at: {}, notes: {} };
  if (!existsSync(OVERRIDES_PATH)) { _overridesCache = empty; return empty; }
  try {
    const obj = JSON.parse(readFileSync(OVERRIDES_PATH, 'utf-8'));
    _overridesCache = {
      no_longer_at: obj.no_longer_at || {},
      now_at: obj.now_at || {},
      notes: obj.notes || {},
    };
  } catch { _overridesCache = empty; }
  return _overridesCache;
}

let _cache = null;
export function loadConnections() {
  if (_cache) return _cache;
  const empty = { byCompany: new Map(), updated: '', total: 0 };
  if (!existsSync(CSV_PATH)) { _cache = empty; return empty; }
  let raw = '';
  let updated = '';
  try {
    raw = readFileSync(CSV_PATH, 'utf-8');
    updated = statSync(CSV_PATH).mtime.toISOString().slice(0, 10);
  } catch { _cache = empty; return empty; }
  // Find the header line — it starts with "First Name," and follows the
  // free-text Notes preamble (which itself can span multiple lines inside
  // quoted strings on some LinkedIn locales).
  const lines = raw.split(/\r?\n/);
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (/^\s*First Name\s*,\s*Last Name\s*,/i.test(lines[i])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) { _cache = empty; return empty; }
  const header = parseCsvLine(lines[headerIdx]).map(c => c.trim().toLowerCase());
  const idx = {
    first:    header.indexOf('first name'),
    last:     header.indexOf('last name'),
    url:      header.indexOf('url'),
    email:    header.indexOf('email address'),
    company:  header.indexOf('company'),
    position: header.indexOf('position'),
    when:     header.indexOf('connected on'),
  };
  const overrides = loadOverrides();
  const byCompany = new Map();
  let total = 0;
  let overrideStats = { dropped: 0, relocated: 0, noted: 0 };
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const f = parseCsvLine(line);
    const csvCompany = (f[idx.company] || '').trim();
    if (!csvCompany) continue; // unemployed-at-time-of-export rows; skip
    const first = (f[idx.first] || '').trim();
    const last  = (f[idx.last]  || '').trim();
    if (!first && !last) continue;
    const nameKey = (first + ' ' + last).toLowerCase().trim();
    const note = overrides.notes[nameKey] || '';
    // Apply "now_at" relocation first — if Mitchell knows the contact moved,
    // bucket them at the new company instead of the CSV's stale value.
    let effectiveCompany = csvCompany;
    let effectivePosition = (f[idx.position] || '').trim();
    if (overrides.now_at[nameKey]) {
      effectiveCompany = overrides.now_at[nameKey].company || csvCompany;
      if (overrides.now_at[nameKey].position) effectivePosition = overrides.now_at[nameKey].position;
      overrideStats.relocated++;
    }
    const normCsv = normalizeCompany(csvCompany);
    const normEff = normalizeCompany(effectiveCompany);
    // Apply "no_longer_at" — if the CSV says they're at Company X but
    // Mitchell knows they've LEFT X, do not bucket them at X (or any of X's
    // aliases). Falls through to the "now_at" company if specified, else
    // skip entirely (no current company known).
    const noLongerAt = (overrides.no_longer_at[nameKey] || []).map(c => normalizeCompany(c));
    if (noLongerAt.includes(normCsv) && !overrides.now_at[nameKey]) {
      // Stale company, no replacement known — skip the contact entirely so
      // they don't surface as a warm-intro path into a company they've left.
      overrideStats.dropped++;
      if (note) overrideStats.noted++;
      continue;
    }
    if (noLongerAt.includes(normEff)) {
      overrideStats.dropped++;
      continue;
    }
    if (note) overrideStats.noted++;
    const contact = {
      first, last,
      url:      (f[idx.url] || '').trim(),
      // Privacy: email is intentionally NOT stored. Strip at parse time so
      // it never reaches the dashboard JSON or any downstream consumer.
      company:  effectiveCompany,
      position: effectivePosition,
      when:     (f[idx.when] || '').trim(),
      note:     note || undefined,
      _source:  effectiveCompany === csvCompany ? 'csv' : 'override',
    };
    if (!byCompany.has(normEff)) byCompany.set(normEff, []);
    byCompany.get(normEff).push(contact);
    total++;
  }
  _cache = { byCompany, updated, total, overrideStats };
  return _cache;
}

// ── 2nd-degree loader (optional) ──────────────────────────────────────────
let _secondDegreeCache = null;
function loadSecondDegree() {
  if (_secondDegreeCache) return _secondDegreeCache;
  const map = new Map();
  if (!existsSync(SECOND_DEGREE_DIR)) { _secondDegreeCache = map; return map; }
  for (const f of readdirSync(SECOND_DEGREE_DIR).filter(x => x.endsWith('.json'))) {
    try {
      const obj = JSON.parse(readFileSync(join(SECOND_DEGREE_DIR, f), 'utf-8'));
      if (!obj || !obj.company) continue;
      // 2nd-degree records carry less metadata: name + url + position usually.
      // Schema: { company, generated_at, contacts: [{ name, url, position, mutuals_count }] }
      map.set(normalizeCompany(obj.company), obj);
    } catch (_) {}
  }
  _secondDegreeCache = map;
  return map;
}

// ── Public API ────────────────────────────────────────────────────────────
export function getContactsAtCompany(company) {
  const { byCompany } = loadConnections();
  const aliases = aliasesFor(company);
  const seen = new Set();
  const out = [];
  for (const a of aliases) {
    const list = byCompany.get(a) || [];
    for (const c of list) {
      const key = (c.url || (c.first + ' ' + c.last)).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  }
  // Sort by recency of connection (most recent first), falling back to name.
  out.sort((a, b) => {
    const da = Date.parse(a.when) || 0;
    const db = Date.parse(b.when) || 0;
    if (db !== da) return db - da;
    return (a.last || '').localeCompare(b.last || '');
  });
  return out;
}

export function getSecondDegreeAtCompany(company) {
  const map = loadSecondDegree();
  const aliases = aliasesFor(company);
  for (const a of aliases) {
    if (map.has(a)) return map.get(a);
  }
  return null;
}

export function networkSummary(company) {
  const first = getContactsAtCompany(company);
  const second = getSecondDegreeAtCompany(company);
  // Index Mitchell's 1st-degree by lowercased "First Last" so we can match
  // mutual-connection names from the 2nd-degree scrape back to their full
  // contact records (URL, position, company, when-connected).
  const firstByName = new Map();
  const { byCompany } = loadConnections();
  for (const list of byCompany.values()) {
    for (const c of list) {
      const k = ((c.first || '') + ' ' + (c.last || '')).toLowerCase().trim();
      if (k && !firstByName.has(k)) firstByName.set(k, c);
    }
  }
  // Augment 2nd-degree contacts with resolved warm-intro paths — for each
  // mutual-connection name, look up the full 1st-degree record so the
  // dashboard can render a clickable LinkedIn link to ask for the intro.
  const secondAug = (second?.contacts || []).map(c => {
    const mutuals = (c.mutual_connections || []).map(name => {
      const k = String(name).toLowerCase().trim();
      const match = firstByName.get(k);
      if (match) {
        return {
          name: ((match.first || '') + ' ' + (match.last || '')).trim(),
          url: match.url,
          position: match.position,
          atCompany: match.company,
        };
      }
      return { name, url: '', position: '', atCompany: '' };
    });
    return { ...c, mutuals_resolved: mutuals };
  });
  return {
    firstDegreeCount:  first.length,
    secondDegreeCount: secondAug.length,
    firstDegree:       first,
    secondDegree:      secondAug,
    secondDegreeMeta:  second ? { generated_at: second.generated_at, mutual_connections_scraped_at: second.mutual_connections_scraped_at } : null,
  };
}

// Warm-intro path finder. For each 2nd-degree person at the target
// company, return the list of Mitchell's 1st-degree contacts who could
// introduce him. Sorted strongest-path-first (more mutuals = stronger).
export function getWarmIntroPaths(company) {
  const summary = networkSummary(company);
  const paths = [];
  for (const target of summary.secondDegree) {
    const resolved = (target.mutuals_resolved || []).filter(m => m.url);
    if (!resolved.length) continue;
    paths.push({
      target_name: target.name,
      target_url: target.url,
      target_title: target.title || '',
      target_location: target.location || '',
      mutual_count: (target.mutual_connections || []).length,
      resolved_intros: resolved, // [{name, url, position, atCompany}]
    });
  }
  // Strongest first: most mutuals, then most resolved intros.
  paths.sort((a, b) => (b.resolved_intros.length - a.resolved_intros.length) || (b.mutual_count - a.mutual_count));
  return paths;
}

export function networkMeta() {
  const c = loadConnections();
  return { csvLoaded: !!c.total, csvUpdated: c.updated, totalContacts: c.total };
}

// CLI smoke test: node lib/linkedin-network.mjs OpenAI
if (import.meta.url === `file://${process.argv[1]}`) {
  const company = process.argv[2] || 'OpenAI';
  const m = networkMeta();
  const s = networkSummary(company);
  console.log(`Network meta: ${m.totalContacts} contacts loaded (export from ${m.csvUpdated})`);
  console.log(`At "${company}": ${s.firstDegreeCount} 1st-degree · ${s.secondDegreeCount} 2nd-degree`);
  if (s.firstDegree.length) {
    console.log('--- first 3 ---');
    for (const c of s.firstDegree.slice(0, 3)) {
      console.log(`  ${c.first} ${c.last} · ${c.position || '—'} · ${c.when || '?'} · ${c.url}`);
    }
  }
}
