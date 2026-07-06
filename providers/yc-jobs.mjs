// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// YC Work at a Startup provider - parses the public Inertia data embedded in
// ycombinator.com/jobs.

const BASE_URL = 'https://www.ycombinator.com/jobs/';

const ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(value = '') {
  return String(value)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITY_MAP[name] || m);
}

function cleanText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function asString(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function toEpochMs(raw) {
  const value = asString(raw);
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function locationFrom(job) {
  const direct = asString(job.location ?? job.locationName ?? job.city);
  if (direct) return direct;
  if (job.isRemote === true || job.remote === true) return 'Remote';
  return '';
}

function normalizeYcJob(job) {
  if (!job || typeof job !== 'object' || Array.isArray(job)) return null;
  const title = cleanText(job.title ?? job.role ?? job.name ?? '');
  const rawUrl = asString(job.url ?? job.path ?? job.jobUrl ?? job.applyUrl);
  if (!title || !rawUrl) return null;
  let url;
  try {
    url = new URL(rawUrl, BASE_URL).href;
  } catch {
    return null;
  }

  const company = cleanText(job.companyName ?? job.company?.name ?? job.company?.title ?? 'YC Work at a Startup');
  const normalized = {
    title,
    url,
    company,
    location: locationFrom(job),
  };
  const postedAt = toEpochMs(job.createdAt ?? job.created_at ?? job.postedAt ?? job.posted_at);
  if (postedAt !== undefined) normalized.postedAt = postedAt;
  return normalized;
}

function walkJobArrays(value, out, seenObjects = new WeakSet()) {
  if (!value || typeof value !== 'object') return;
  if (seenObjects.has(value)) return;
  seenObjects.add(value);

  if (Array.isArray(value)) {
    const jobs = value.map(normalizeYcJob).filter(Boolean);
    if (jobs.length > 0) out.push(...jobs);
    for (const item of value) walkJobArrays(item, out, seenObjects);
  } else {
    for (const item of Object.values(value)) walkJobArrays(item, out, seenObjects);
  }
}

function parseDataPage(html) {
  const m = /data-page=["']([^"']+)["']/i.exec(html);
  if (!m) return null;
  return JSON.parse(decodeEntities(m[1]));
}

/** @param {string} html */
export function parseYcJobsHtml(html) {
  if (typeof html !== 'string' || !html.trim()) return [];
  const page = parseDataPage(html);
  if (!page) return [];
  const jobs = [];
  walkJobArrays(page, jobs);

  const seen = new Set();
  return jobs.filter((job) => {
    if (!job.url || seen.has(job.url)) return false;
    seen.add(job.url);
    return true;
  });
}

/** @type {Provider} */
export default {
  id: 'yc-jobs',

  detect(entry) {
    const url = entry.api || entry.careers_url || '';
    if (typeof url !== 'string') return null;
    try {
      const parsed = new URL(url);
      const host = parsed.host.toLowerCase();
      if ((host === 'www.ycombinator.com' || host === 'ycombinator.com') && parsed.pathname.startsWith('/jobs')) return { url };
      if (host === 'www.workatastartup.com' || host === 'workatastartup.com') return { url };
    } catch {
      /* not an absolute URL */
    }
    return null;
  },

  async fetch(_entry, ctx) {
    const html = await ctx.fetchText(BASE_URL, { redirect: 'error' });
    return parseYcJobsHtml(html);
  },
};
