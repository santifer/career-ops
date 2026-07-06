// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Microsoft Careers provider - reads the public Eightfold PCS search API and
// keeps the embedded HTML parser as a fallback/fixture parser.

const BASE_URL = 'https://jobs.careers.microsoft.com/global/en/search';
const APPLY_ORIGIN = 'https://apply.careers.microsoft.com';
const SEARCH_API_URL = `${APPLY_ORIGIN}/api/pcsx/search`;
const SEARCH_PAGE_SIZE = 10; // Microsoft PCS currently returns 10 rows/page.
const DEFAULT_MAX_PAGES = 3;
const MAX_PAGES_CAP = 50;

const ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  nbsp: ' ',
};

function decodeEntities(value = '') {
  return String(value)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITY_MAP[name] || m);
}

function cleanText(value = '') {
  return decodeEntities(String(value).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function asString(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function toEpochMs(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 1_000_000_000_000 ? raw : raw * 1000;
  }
  const value = asString(raw);
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function titleFrom(obj) {
  return cleanText(
    obj.title
    ?? obj.jobTitle
    ?? obj.postingTitle
    ?? obj.positionTitle
    ?? obj.name
    ?? obj.displayTitle
    ?? '',
  );
}

function idFrom(obj) {
  return asString(obj.displayJobId ?? obj.atsJobId ?? obj.display_job_id ?? obj.jobId ?? obj.job_id ?? obj.position_id ?? obj.positionId);
}

function urlFrom(obj, id) {
  const raw = asString(obj.canonicalPositionUrl ?? obj.positionUrl ?? obj.externalUrl ?? obj.jobUrl ?? obj.url);
  if (raw) {
    try {
      return new URL(raw, APPLY_ORIGIN).href;
    } catch {
      /* keep looking */
    }
  }
  if (!id) return '';
  return `${APPLY_ORIGIN}/careers/job/${encodeURIComponent(id)}`;
}

function locationFrom(obj) {
  const direct = cleanText(obj.location ?? obj.primaryLocation ?? obj.workLocation ?? obj.displayLocation ?? '');
  if (direct) return direct;
  const locations = Array.isArray(obj.locations) ? obj.locations : Array.isArray(obj.locationList) ? obj.locationList : [];
  const values = locations
    .map((loc) => {
      if (typeof loc === 'string') return cleanText(loc);
      if (loc && typeof loc === 'object') {
        return cleanText(loc.displayName ?? loc.name ?? loc.city ?? loc.location ?? loc.address ?? '');
      }
      return '';
    })
    .filter(Boolean);
  return [...new Set(values)].join(' / ');
}

function postedAtFrom(obj) {
  return toEpochMs(obj.postedTs ?? obj.creationTs ?? obj.postedDate ?? obj.posted_date ?? obj.postingDate ?? obj.createdDate ?? obj.created_at ?? obj.datePosted);
}

function normalizeMicrosoftJob(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const title = titleFrom(obj);
  const id = idFrom(obj);
  const url = urlFrom(obj, id);
  if (!title || !url) return null;
  const hasJobSignal = Boolean(
    obj.positionUrl
    || obj.canonicalPositionUrl
    || obj.jobUrl
    || obj.displayJobId
    || obj.atsJobId
    || obj.display_job_id
    || obj.jobId
    || obj.job_id
    || obj.position_id
    || obj.positionId,
  );
  if (!hasJobSignal || !/\/job\//i.test(url)) return null;

  const job = {
    title,
    url,
    company: 'Microsoft',
    location: locationFrom(obj),
  };
  const postedAt = postedAtFrom(obj);
  if (postedAt !== undefined) job.postedAt = postedAt;
  return job;
}

function walkJobs(value, out, seenObjects = new WeakSet()) {
  if (!value || typeof value !== 'object') return;
  if (seenObjects.has(value)) return;
  seenObjects.add(value);

  const job = normalizeMicrosoftJob(value);
  if (job) out.push(job);

  if (Array.isArray(value)) {
    for (const item of value) walkJobs(item, out, seenObjects);
  } else {
    for (const item of Object.values(value)) walkJobs(item, out, seenObjects);
  }
}

function parsePcsxPayload(html) {
  const m = /<code\b[^>]*id=["']pcsx-data["'][^>]*>([\s\S]*?)<\/code>/i.exec(html);
  if (!m) return null;
  const decoded = decodeEntities(m[1]).trim();
  if (!decoded) return null;
  return JSON.parse(decoded);
}

function parseVisibleLinks(html) {
  const jobs = [];
  const linkRe = /<a\b[^>]*href=["']([^"']*(?:\/global\/en\/job\/|\/careers\/job\/)[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(linkRe)) {
    const title = cleanText(m[2]);
    const url = urlFrom({ url: m[1] }, '');
    if (!title || !url || /^apply$/i.test(title)) continue;
    jobs.push({ title, url, company: 'Microsoft', location: '' });
  }
  return jobs;
}

/** @param {import('./_types.js').PortalEntry & {microsoft?: Record<string, unknown>}} entry */
export function buildMicrosoftCareersUrl(entry = {}) {
  const cfg = entry.microsoft && typeof entry.microsoft === 'object' ? entry.microsoft : {};
  const query = cfg.query ?? cfg.search ?? entry.query ?? entry.search ?? '';
  const url = new URL(BASE_URL);
  if (query) url.searchParams.set('q', String(query));
  return url.href;
}

/** @param {import('./_types.js').PortalEntry & {microsoft?: Record<string, unknown>}} entry */
export function buildMicrosoftSearchApiUrl(entry = {}, start = 0) {
  const cfg = entry.microsoft && typeof entry.microsoft === 'object' ? entry.microsoft : {};
  const query = cfg.query ?? cfg.search ?? entry.query ?? entry.search ?? '';
  const domain = cfg.domain ?? 'microsoft.com';
  const url = new URL(SEARCH_API_URL);
  url.searchParams.set('domain', String(domain));
  if (query) url.searchParams.set('query', String(query));
  if (start > 0) url.searchParams.set('start', String(start));
  return url.href;
}

/** @param {unknown} json */
export function parseMicrosoftSearchResponse(json) {
  const rows = Array.isArray(json?.data?.positions)
    ? json.data.positions
    : Array.isArray(json?.positions)
      ? json.positions
      : [];
  const seen = new Set();
  return rows
    .map(normalizeMicrosoftJob)
    .filter((job) => {
      if (!job || !job.url || seen.has(job.url)) return false;
      seen.add(job.url);
      return true;
    });
}

/** @param {string} html */
export function parseMicrosoftCareersHtml(html) {
  if (typeof html !== 'string' || !html.trim()) return [];

  let jobs = [];
  try {
    const payload = parsePcsxPayload(html);
    if (payload) walkJobs(payload, jobs);
  } catch {
    jobs = [];
  }
  if (jobs.length === 0) jobs = parseVisibleLinks(html);

  const seen = new Set();
  return jobs.filter((job) => {
    if (!job.url || seen.has(job.url)) return false;
    seen.add(job.url);
    return true;
  });
}

/** @type {Provider} */
export default {
  id: 'microsoft-careers',

  detect(entry) {
    const url = entry.api || entry.careers_url || '';
    if (typeof url !== 'string') return null;
    try {
      const parsed = new URL(url);
      if (parsed.host.toLowerCase() === 'jobs.careers.microsoft.com' && parsed.pathname.startsWith('/global/en/search')) {
        return { url };
      }
    } catch {
      /* not an absolute URL */
    }
    return null;
  },

  async fetch(entry, ctx) {
    const maxPages = Math.max(1, Math.min(
      Math.floor(Number(ctx.maxPages ?? entry.max_pages ?? DEFAULT_MAX_PAGES)) || DEFAULT_MAX_PAGES,
      MAX_PAGES_CAP,
    ));
    const jobs = [];
    const seen = new Set();
    for (let page = 0; page < maxPages; page++) {
      const json = await ctx.fetchJson(buildMicrosoftSearchApiUrl(entry, page * SEARCH_PAGE_SIZE), {
        redirect: 'error',
        headers: {
          accept: 'application/json,text/plain,*/*',
        },
      });
      const pageJobs = parseMicrosoftSearchResponse(json);
      if (pageJobs.length === 0) break;
      let fresh = 0;
      for (const job of pageJobs) {
        if (seen.has(job.url)) continue;
        seen.add(job.url);
        fresh++;
        jobs.push({
          ...job,
          company: entry.name || job.company,
        });
      }
      if (fresh === 0 || pageJobs.length < SEARCH_PAGE_SIZE) break;
    }
    return jobs;
  },
};
