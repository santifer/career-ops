import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import yaml from 'js-yaml';
import { paths } from './storage.mjs';

const PORTALS_PATH = process.env.CAREER_OPS_PORTALS || paths.portals;
const REQUEST_TIMEOUT_MS = 15000;
const COMPANY_CONCURRENCY = 8;
const MAX_RESULTS = 200;

const ALLOWED_HOSTS = new Set([
  'boards-api.greenhouse.io',
  'api.ashbyhq.com',
  'api.lever.co',
]);

// ── ATS detection + list-API URL derivation ─────────────────────────────────

export function detectAts(entry) {
  const careers = entry.careers_url || '';
  const api = entry.api || '';

  if (/greenhouse\.io/.test(api) || /greenhouse\.io/.test(careers)) {
    const board = boardFromGreenhouse(api || careers);
    if (board) return { ats: 'greenhouse', url: `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true` };
  }
  const ashby = careers.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (ashby) return { ats: 'ashby', url: `https://api.ashbyhq.com/posting-api/job-board/${ashby[1]}?includeCompensation=true` };

  const lever = careers.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (lever) return { ats: 'lever', url: `https://api.lever.co/v0/postings/${lever[1]}?mode=json` };

  return null;
}

function boardFromGreenhouse(url) {
  const apiMatch = url.match(/boards-api\.greenhouse\.io\/v1\/boards\/([^/?#]+)/);
  if (apiMatch) return apiMatch[1];
  const boardMatch = url.match(/(?:job-boards(?:\.eu)?|boards)\.greenhouse\.io\/([^/?#]+)/);
  return boardMatch ? boardMatch[1] : null;
}

// ── HTTP ────────────────────────────────────────────────────────────────────

async function fetchJson(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`untrusted ATS host: ${parsed.hostname}`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'error',
      signal: controller.signal,
      headers: { 'user-agent': 'career-ops-web', accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Per-ATS mapping (includes job description) ───────────────────────────────

async function fetchCompany(entry) {
  const detected = detectAts(entry);
  if (!detected) return [];
  const json = await fetchJson(detected.url);

  if (detected.ats === 'greenhouse') {
    const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
    return jobs.filter(j => j.absolute_url).map(j => ({
      company: entry.name,
      title: j.title || '',
      url: j.absolute_url,
      location: j.location?.name || '',
      description: htmlToText(j.content || ''),
    }));
  }
  if (detected.ats === 'ashby') {
    const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
    return jobs.map(j => ({
      company: entry.name,
      title: j.title || '',
      url: j.jobUrl || '',
      location: j.location || '',
      description: j.descriptionPlain || htmlToText(j.descriptionHtml || ''),
    }));
  }
  // lever
  if (!Array.isArray(json)) return [];
  return json.map(j => ({
    company: entry.name,
    title: j.text || '',
    url: j.hostedUrl || '',
    location: j.categories?.location || '',
    description: j.descriptionPlain || htmlToText(j.description || ''),
  }));
}

// ── HTML → plain text ────────────────────────────────────────────────────────

function htmlToText(html) {
  if (!html) return '';
  return html
    // Greenhouse encodes its HTML markup as entities, so decode the structural
    // angle brackets first, then strip the now-real tags.
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Title + location filtering ───────────────────────────────────────────────

// Words too generic to carry meaning in a role phrase.
const STOPWORDS = new Set(['of', 'the', 'and', 'a', 'an', 'in', 'for', 'to', 'at', 'on', 'with', 'or']);

function tokenizePhrase(phrase) {
  return String(phrase || '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter(t => t && !STOPWORDS.has(t));
}

// Compile a single token into a matcher. Short alphanumeric tokens like "ai" use
// word boundaries so they don't match inside unrelated words ("maintenance").
function compileToken(tok) {
  const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordBounded = /^[a-z0-9]$/.test(tok) || /^[a-z0-9].*[a-z0-9]$/.test(tok);
  try {
    return new RegExp(wordBounded ? `\\b${esc}\\b` : esc, 'i');
  } catch {
    return null;
  }
}

// A role/keyword phrase matches a title when ALL of its significant tokens are
// present (order-independent). So "Spanish Teacher" matches "World Language
// Teacher (Spanish)" or "Teacher - Spanish", not just the exact phrase.
function compilePhrase(phrase) {
  const tokens = tokenizePhrase(phrase).map(compileToken).filter(Boolean);
  return tokens.length ? tokens : null;
}

// Common abbreviations so "New York City" also matches "New York, NY" / "NYC".
const LOCATION_ALIASES = {
  'new york city': ['new york', 'nyc'],
  'new york': ['nyc'],
  'san francisco': ['sf', 'bay area'],
  'los angeles': ['la'],
  'washington dc': ['washington', 'dc'],
  'united states': ['usa', 'u.s.'],
};

// Expand one location needle into the set of strings any of which counts as a hit.
function locationVariants(needle) {
  const variants = new Set([needle]);
  const noCity = needle.replace(/\s+city$/, '').trim();
  if (noCity && noCity !== needle) variants.add(noCity);
  for (const v of [needle, noCity]) {
    for (const alias of LOCATION_ALIASES[v] || []) variants.add(alias);
  }
  return [...variants].filter(Boolean);
}

function buildLocationFilter(locations = []) {
  const needles = (Array.isArray(locations) ? locations : [locations])
    .map(s => String(s || '').toLowerCase().trim())
    .filter(Boolean);
  if (needles.length === 0) return () => true;
  const wantsRemote = needles.some(n => n.includes('remote'));
  const variants = needles.flatMap(locationVariants);
  return (location) => {
    const loc = String(location || '').toLowerCase();
    if (!loc) return true; // unknown location — don't exclude, let evaluation decide
    if (wantsRemote && loc.includes('remote')) return true;
    return variants.some(n => loc.includes(n));
  };
}

// True when every token matches within a sliding window of the text, so a
// multi-word phrase like "Sustainable Finance" must appear close together in the
// description rather than in unrelated paragraphs.
function tokensWithinWindow(text, tokenRes, windowSize = 220) {
  const s = String(text || '');
  if (!s) return false;
  if (s.length <= windowSize) return tokenRes.every(re => re.test(s));
  for (let start = 0; start < s.length; start += Math.floor(windowSize / 2)) {
    const win = s.slice(start, start + windowSize);
    if (tokenRes.every(re => re.test(win))) return true;
  }
  return false;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function scanPortals({ company, onProgress, roleKeywords, locations } = {}) {
  const emit = typeof onProgress === 'function' ? onProgress : () => {};

  if (!existsSync(PORTALS_PATH)) {
    const err = new Error('portals.yml not found. Create it from templates/portals.example.yml to enable scanning.');
    err.code = 'NO_PORTALS';
    throw err;
  }

  const portals = yaml.load(await readFile(PORTALS_PATH, 'utf-8')) || {};
  const portalFilter = portals.title_filter || {};
  // Prefer the candidate's own target roles so results match their resume. Fall
  // back to portals.yml keywords only when the candidate has no target roles set.
  const roles = (Array.isArray(roleKeywords) ? roleKeywords : [])
    .map(s => String(s || '').trim())
    .filter(Boolean);
  const positive = roles.length ? roles : (portalFilter.positive || []);
  const posMatchers = positive.map(compilePhrase).filter(Boolean);
  const negMatchers = (portalFilter.negative || []).map(compilePhrase).filter(Boolean);
  const matchesLocation = buildLocationFilter(locations);

  const titleRejected = (title) => negMatchers.some(tokens => tokens.every(re => re.test(String(title || ''))));
  const matchesRole = (text) => posMatchers.some(tokens => tokens.every(re => re.test(String(text || ''))));
  // Only multi-word role phrases fall back to the description — requiring all of
  // their tokens keeps it selective. Single words like "Teacher" stay title-only
  // so they don't match every posting that merely mentions the word.
  const posMatchersMulti = posMatchers.filter(tokens => tokens.length >= 2);
  const matchesRoleDesc = (text) => posMatchersMulti.some(tokens => tokensWithinWindow(text, tokens));

  let companies = Array.isArray(portals.tracked_companies) ? portals.tracked_companies : [];
  companies = companies.filter(c => c && c.name && c.enabled !== false && detectAts(c));
  if (company) {
    const needle = company.toLowerCase();
    companies = companies.filter(c => c.name.toLowerCase().includes(needle));
  }

  emit({ type: 'start', total: companies.length });

  const jobs = [];
  const errors = [];
  let processed = 0;
  for (let i = 0; i < companies.length; i += COMPANY_CONCURRENCY) {
    const batch = companies.slice(i, i + COMPANY_CONCURRENCY);
    const settled = await Promise.allSettled(batch.map(fetchCompany));
    settled.forEach((result, idx) => {
      processed += 1;
      const name = batch[idx].name;
      if (result.status === 'fulfilled') {
        jobs.push(...result.value);
        emit({ type: 'company', name, found: result.value.length, processed, total: companies.length });
      } else {
        const message = result.reason?.message || String(result.reason);
        errors.push({ company: name, error: message });
        emit({ type: 'company', name, error: message, processed, total: companies.length });
      }
    });
  }

  const seen = new Set();
  const filtered = [];
  let totalSeen = 0;
  let matchedRole = 0;
  for (const job of jobs) {
    if (!job.url || !job.title) continue;
    totalSeen += 1;
    if (titleRejected(job.title)) continue;
    // Match the role on the title, falling back to the description for niche
    // fields whose titles use different words (e.g. "Attorney" for migration law).
    const roleOk = posMatchers.length === 0 || matchesRole(job.title) || matchesRoleDesc(job.description);
    if (!roleOk) continue;
    matchedRole += 1;
    if (!matchesLocation(job.location)) continue;
    if (seen.has(job.url)) continue;
    seen.add(job.url);
    filtered.push(job);
    if (filtered.length >= MAX_RESULTS) break;
  }

  return { scanned: companies.length, totalSeen, matchedRole, found: filtered.length, jobs: filtered, errors };
}

// ── Company validation helpers (used by the company finder + manual add) ──────

// Build a portals.yml-style entry from an ATS provider + board slug.
export function entryFromAtsSlug(ats, slug, name) {
  const s = String(slug || '').trim().replace(/^\/+|\/+$/g, '');
  if (!s) return null;
  if (ats === 'greenhouse') {
    return {
      name: name || s,
      careers_url: `https://job-boards.greenhouse.io/${s}`,
      api: `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`,
      enabled: true,
    };
  }
  if (ats === 'ashby') {
    return { name: name || s, careers_url: `https://jobs.ashbyhq.com/${s}`, enabled: true };
  }
  if (ats === 'lever') {
    return { name: name || s, careers_url: `https://jobs.lever.co/${s}`, enabled: true };
  }
  return null;
}

// Build an entry from a pasted careers URL, deriving the ATS + slug.
export function entryFromUrl(url, name) {
  const raw = String(url || '').trim();
  const entry = { name: name || '', careers_url: raw, enabled: true };
  if (!detectAts(entry)) return null;
  if (!entry.name) {
    let slug = '';
    try { slug = new URL(raw).pathname.split('/').filter(Boolean).pop() || ''; } catch { slug = ''; }
    entry.name = slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || slug;
  }
  return entry;
}

// Probe a company's ATS board and return how many openings it currently lists.
// Used to validate suggested/added companies so we never persist a dead board.
export async function countOpenings(entry) {
  try {
    const jobs = await fetchCompany(entry);
    return { ok: true, count: jobs.length };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}
