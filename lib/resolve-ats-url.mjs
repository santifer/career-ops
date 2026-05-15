/**
 * lib/resolve-ats-url.mjs
 *
 * Resolves LinkedIn jobs/view URLs to canonical ATS URLs (Greenhouse,
 * Ashby, Lever, Workday, etc.) using a four-strategy cascade:
 *
 * Strategy A: Follow HTTP redirect chain — land on ATS domain directly
 * Strategy B: Scan fetched HTML body for ATS URL patterns
 * Strategy C: Extract data-apply-url / href attributes from fetched HTML
 * Strategy D: extractAtsUrlFromText(text) — scan arbitrary text (e.g. report body)
 * Strategy E: resolveViaAtsSearch(company, role) — query ATS API by title
 *
 * A–C are run inside _fetchAndParse() (called by resolveUrl / resolveUrls).
 * D and E are exported separately for use in backfill-linkedin-urls.mjs.
 *
 * Results cached in data/url-resolve-cache.tsv (TTL 30 days).
 * UNRESOLVABLE sentinel stored for Easy Apply / auth-gated jobs.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { fetchWithTimeout } from './fetch-utils.mjs';

const CACHE_TTL_DAYS = 30;
const FETCH_TIMEOUT_MS = 12_000;
const UNRESOLVABLE = 'UNRESOLVABLE';

// ATS patterns — direct job-board domains we want to surface.
// Kept in sync with scan-email.mjs JOB_URL_PATTERNS (ATS subset only).
export const ATS_PATTERNS = [
  /https?:\/\/(?:job-boards|boards)\.greenhouse\.io\/[\w-]+\/jobs\/\d+/i,
  /https?:\/\/jobs\.ashbyhq\.com\/[\w-]+\/[\w-]+/i,
  /https?:\/\/jobs\.lever\.co\/[\w-]+\/[\w-]+/i,
  /https?:\/\/(?:apply|jobs)\.workable\.com\/[\w-]+\/[\w-]+/i,
  /https?:\/\/amazon\.jobs\/(?:en\/)?jobs\/\d+/i,
  /https?:\/\/[\w-]+\.wd\d+\.myworkdayjobs\.com\/[^\s"'<>]+/i,
  /https?:\/\/jobs\.icims\.com\/[^\s"'<>]+/i,
  /https?:\/\/[\w-]+\.breezy\.hr\/p\/[\w-]+/i,
  /https?:\/\/[\w-]+\.recruitee\.com\/o\/[\w-]+/i,
  /https?:\/\/apply\.dover\.io\/[^\s"'<>]+/i,
  /https?:\/\/[\w-]+\.rippling-ats\.com\/[^\s"'<>]+/i,
];

function isLinkedInJobUrl(url) {
  return typeof url === 'string' &&
    /linkedin\.com\/(?:comm\/)?jobs\/view\/\d+/i.test(url);
}

function linkedInJobId(url) {
  const m = url.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i);
  return m ? m[1] : null;
}

// ── Cache helpers ──────────────────────────────────────────────

function cachePath(root) {
  return join(root, 'data', 'url-resolve-cache.tsv');
}

function loadCache(root) {
  const path = cachePath(root);
  const cache = new Map();
  if (!existsSync(path)) return cache;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [jobId, resolvedUrl, tsStr] = parts;
    const ageDays = (Date.now() - parseInt(tsStr, 10)) / 86_400_000;
    if (ageDays <= CACHE_TTL_DAYS) cache.set(jobId, resolvedUrl);
  }
  return cache;
}

function persistCache(root, cache) {
  const lines = [];
  for (const [jobId, resolvedUrl] of cache.entries()) {
    lines.push(`${jobId}\t${resolvedUrl}\t${Date.now()}`);
  }
  writeFileSync(cachePath(root), lines.join('\n') + (lines.length ? '\n' : ''));
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Synchronous cache-only lookup. Returns the cached canonical URL if
 * available and not expired, otherwise returns the original URL unchanged.
 * Safe to call from synchronous server request handlers.
 */
export function getCachedUrl(url, root = process.cwd()) {
  if (!isLinkedInJobUrl(url)) return url;
  const jobId = linkedInJobId(url);
  if (!jobId) return url;
  const cache = loadCache(root);
  const cached = cache.get(jobId);
  if (!cached || cached === UNRESOLVABLE) return url;
  return cached;
}

/**
 * Async resolver. Checks cache first; on miss fetches the LinkedIn page
 * and searches for embedded ATS URLs. Updates cache before returning.
 *
 * Always returns a URL string — the original LinkedIn URL if resolution
 * fails or the job uses Easy Apply only.
 */
export async function resolveUrl(url, root = process.cwd()) {
  if (!isLinkedInJobUrl(url)) return url;
  const jobId = linkedInJobId(url);
  if (!jobId) return url;

  const cache = loadCache(root);

  if (cache.has(jobId)) {
    const cached = cache.get(jobId);
    return cached === UNRESOLVABLE ? url : cached;
  }

  const resolved = await _fetchAndParse(url);

  cache.set(jobId, resolved || UNRESOLVABLE);
  persistCache(root, cache);

  return resolved || url;
}

/**
 * Batch resolver — resolves multiple URLs with rate limiting.
 * Yields { url, resolved, changed } for each input.
 */
export async function* resolveUrls(urls, { root = process.cwd(), delayMs = 400 } = {}) {
  const cache = loadCache(root);
  let cacheModified = false;

  for (const url of urls) {
    if (!isLinkedInJobUrl(url)) {
      yield { url, resolved: url, changed: false };
      continue;
    }

    const jobId = linkedInJobId(url);

    if (cache.has(jobId)) {
      const cached = cache.get(jobId);
      const resolved = cached === UNRESOLVABLE ? url : cached;
      yield { url, resolved, changed: resolved !== url };
      continue;
    }

    const resolved = await _fetchAndParse(url);
    cache.set(jobId, resolved || UNRESOLVABLE);
    cacheModified = true;

    yield { url, resolved: resolved || url, changed: !!resolved && resolved !== url };

    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
  }

  if (cacheModified) persistCache(root, cache);
}

// ── Internal fetch + parse ─────────────────────────────────────

async function _fetchAndParse(linkedInUrl) {
  try {
    const { ok, text: html, finalUrl } = await fetchWithTimeout(linkedInUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }, FETCH_TIMEOUT_MS);

    // Strategy A: redirect chain landed on ATS URL
    for (const pat of ATS_PATTERNS) {
      if (pat.test(finalUrl)) return _clean(finalUrl);
    }

    if (!ok) return null;

    // Strategy B: scan page body for ATS URL patterns
    for (const pat of ATS_PATTERNS) {
      const re = new RegExp(pat.source.replace(/^https?\?:\/\//, 'https?://'), 'gi');
      const m = html.match(re);
      if (m) {
        const candidate = _clean(_decodeHtml(m[0]));
        if (_isValidAtsUrl(candidate)) return candidate;
      }
    }

    // Strategy C: look for apply-URL attributes (LinkedIn embeds these in
    // data attributes for the external apply button)
    const attrPatterns = [
      /(?:data-apply-url|data-tracking-control-name[^=]*apply[^=]*|applyUrl)[=:]["'](https:\/\/[^"'<>\s]+)/gi,
      /["'](https:\/\/(?:boards|job-boards)\.greenhouse\.io\/[^"'<>\s]+)["']/gi,
      /["'](https:\/\/jobs\.ashbyhq\.com\/[^"'<>\s]+)["']/gi,
      /["'](https:\/\/jobs\.lever\.co\/[^"'<>\s]+)["']/gi,
      /["'](https:\/\/[\w-]+\.wd\d+\.myworkdayjobs\.com\/[^"'<>\s]+)["']/gi,
    ];

    for (const re of attrPatterns) {
      re.lastIndex = 0;
      const m = re.exec(html);
      if (m) {
        const candidate = _clean(_decodeHtml(m[1]));
        if (_isValidAtsUrl(candidate)) return candidate;
      }
    }

  } catch {
    // Timeout, network error, or parse failure — return null (caller uses original)
  }

  return null;
}

function _decodeHtml(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x2F;/g, '/');
}

function _clean(url) {
  // Strip fragment and common tracking params that don't affect the posting
  return url.split('#')[0].replace(/[?&](utm_[^&]+|src=[^&]+|ref=[^&]+|gh_src=[^&]+)(&|$)/gi, '$2').replace(/[?&]$/, '');
}

function _isValidAtsUrl(url) {
  if (!url || url.length < 20) return false;
  return ATS_PATTERNS.some(p => p.test(url));
}

// ── Strategy D: scan arbitrary text for ATS URLs ───────────────

/**
 * Scans any text block (report body, email, notes) for the first valid
 * ATS URL. Returns the cleaned URL or null. Synchronous.
 */
export function extractAtsUrlFromText(text) {
  if (!text) return null;
  for (const pat of ATS_PATTERNS) {
    const re = new RegExp(pat.source, 'gi');
    const m = re.exec(text);
    if (m) {
      const candidate = _clean(_decodeHtml(m[0]));
      if (_isValidAtsUrl(candidate)) return candidate;
    }
  }
  return null;
}

// ── Strategy E: ATS API title search ──────────────────────────

/**
 * Looks up the company in portals.yml, detects the ATS type, queries
 * the ATS job listings API, and returns the canonical URL for the job
 * whose title best matches `roleTitle`. Returns null on any failure.
 */
export async function resolveViaAtsSearch(companyName, roleTitle, { root = process.cwd() } = {}) {
  if (!companyName || !roleTitle) return null;

  const portalsPath = join(root, 'portals.yml');
  if (!existsSync(portalsPath)) return null;

  let portals;
  try {
    portals = yaml.load(readFileSync(portalsPath, 'utf8'));
  } catch { return null; }

  const companies = portals?.tracked_companies || [];
  const normalQuery = _normCompany(companyName);

  const entry = companies.find(c => {
    const n = _normCompany(c.name || '');
    return n === normalQuery || n.startsWith(normalQuery) || normalQuery.startsWith(n);
  });

  if (!entry) return null;

  const careersUrl = entry.careers_url || '';
  const apiUrl = entry.api || '';

  // Greenhouse
  if (apiUrl.includes('greenhouse') || careersUrl.includes('greenhouse')) {
    const slug =
      (apiUrl.match(/boards\/([^/]+)\/jobs/) ||
       careersUrl.match(/greenhouse\.io\/([^/?#\s]+)/))?.[1];
    if (slug) return _searchGreenhouseApi(slug, roleTitle);
  }

  // Ashby
  if (careersUrl.includes('ashbyhq.com')) {
    const slug = careersUrl.match(/ashbyhq\.com\/([^/?#\s]+)/)?.[1];
    if (slug) return _searchAshbyApi(slug, roleTitle);
  }

  // Lever
  if (careersUrl.includes('lever.co')) {
    const slug = careersUrl.match(/lever\.co\/([^/?#\s]+)/)?.[1];
    if (slug) return _searchLeverApi(slug, roleTitle);
  }

  return null;
}

/**
 * Directly write a resolved URL into the cache (used by backfill script
 * when Strategy D/E finds a canonical URL without going through _fetchAndParse).
 */
export function updateCache(jobId, resolvedUrl, root = process.cwd()) {
  const cache = loadCache(root);
  cache.set(String(jobId), resolvedUrl);
  persistCache(root, cache);
}

// ── ATS API helpers ────────────────────────────────────────────

function _normCompany(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function _titleScore(a, b) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const wa = new Set(norm(a));
  const wb = new Set(norm(b));
  const hits = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union > 0 ? hits / union : 0;
}

function _bestTitleMatch(jobs, roleTitle, minScore = 0.35) {
  let best = null, bestScore = 0;
  for (const job of jobs) {
    const score = _titleScore(job.title || '', roleTitle);
    if (score > bestScore) { best = job; bestScore = score; }
  }
  return bestScore >= minScore && best?.url ? _clean(best.url) : null;
}

async function _searchGreenhouseApi(slug, roleTitle) {
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return null;
    const { jobs = [] } = await res.json();
    return _bestTitleMatch(jobs.map(j => ({ title: j.title, url: j.absolute_url })), roleTitle);
  } catch { return null; }
}

async function _searchAshbyApi(slug, roleTitle) {
  try {
    const res = await fetch(
      `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const postings = data.jobPostings || [];
    return _bestTitleMatch(postings.map(j => ({ title: j.title, url: j.jobUrl || j.url })), roleTitle);
  } catch { return null; }
}

async function _searchLeverApi(slug, roleTitle) {
  try {
    const res = await fetch(
      `https://api.lever.co/v0/postings/${slug}?mode=json`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return _bestTitleMatch(
      (Array.isArray(data) ? data : []).map(j => ({ title: j.text, url: j.hostedUrl })),
      roleTitle
    );
  } catch { return null; }
}
