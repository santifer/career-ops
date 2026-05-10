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
  const byCompany = new Map();
  let total = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const f = parseCsvLine(line);
    const company = (f[idx.company] || '').trim();
    if (!company) continue; // unemployed-at-time-of-export rows; skip
    const norm = normalizeCompany(company);
    if (!norm) continue;
    const contact = {
      first:    (f[idx.first]    || '').trim(),
      last:     (f[idx.last]     || '').trim(),
      url:      (f[idx.url]      || '').trim(),
      // Privacy: email is intentionally NOT stored. Strip at parse time so it
      // never reaches the dashboard JSON or any downstream consumer.
      company:  company,                // raw company string for display
      position: (f[idx.position] || '').trim(),
      when:     (f[idx.when]     || '').trim(),
    };
    if (!contact.first && !contact.last) continue;
    if (!byCompany.has(norm)) byCompany.set(norm, []);
    byCompany.get(norm).push(contact);
    total++;
  }
  _cache = { byCompany, updated, total };
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
  return {
    firstDegreeCount:  first.length,
    secondDegreeCount: second ? (second.contacts || []).length : 0,
    firstDegree:       first,
    secondDegree:      second ? (second.contacts || []) : [],
    secondDegreeMeta:  second ? { generated_at: second.generated_at } : null,
  };
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
