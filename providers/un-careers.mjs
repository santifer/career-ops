// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// UN Careers provider - reads the public no-auth active job openings API.

const DEFAULT_LANGUAGE = 'en';
const DEFAULT_API = 'https://careers.un.org/api/public/opening/jo/activeJo?language=en';
const JOBOPENING_URL = 'https://careers.un.org/jobopening';

function asString(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function cleanText(value = '') {
  return asString(value).replace(/\s+/g, ' ').trim();
}

function toEpochMs(raw) {
  const value = asString(raw);
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function stationToString(station) {
  if (typeof station === 'string') return cleanText(station);
  if (station && typeof station === 'object') {
    return cleanText(station.description ?? station.name ?? station.city ?? station.dutyStation ?? '');
  }
  return '';
}

function locationFrom(job) {
  const stations = Array.isArray(job.dutyStation)
    ? job.dutyStation
    : Array.isArray(job.dutyStations)
      ? job.dutyStations
      : [];
  const values = stations.map(stationToString).filter(Boolean);
  const direct = stationToString(job.dutyStation ?? job.location ?? job.dutyStationDescription);
  if (direct) values.unshift(direct);
  return [...new Set(values)].join(' / ');
}

function urlFrom(job, language) {
  const raw = asString(job.url ?? job.jobUrl);
  if (raw) {
    try {
      return new URL(raw, JOBOPENING_URL).href;
    } catch {
      /* build below */
    }
  }
  const jobId = asString(job.jobId ?? job.job_id ?? job.id);
  if (!jobId) return '';
  const url = new URL(JOBOPENING_URL);
  url.searchParams.set('language', language);
  url.searchParams.set('data', JSON.stringify({ jobId }));
  return url.href;
}

function normalizeUnJob(job, language, company) {
  if (!job || typeof job !== 'object' || Array.isArray(job)) return null;
  const title = cleanText(job.postingTitle ?? job.jobTitle ?? job.jobCodeTitle ?? job.title ?? '');
  const url = urlFrom(job, language);
  if (!title || !url) return null;
  const normalized = {
    title,
    url,
    company,
    location: locationFrom(job),
  };
  const postedAt = toEpochMs(job.startDate ?? job.insertedDate ?? job.createdDate ?? job.postingStartDate);
  if (postedAt !== undefined) normalized.postedAt = postedAt;
  return normalized;
}

function rowsFromResponse(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.data?.result)) return json.data.result;
  if (Array.isArray(json?.results)) return json.results;
  return [];
}

/** @param {unknown} json */
export function parseUnCareersResponse(json, { language = DEFAULT_LANGUAGE, company = 'United Nations' } = {}) {
  const jobs = [];
  const seen = new Set();
  for (const row of rowsFromResponse(json)) {
    const job = normalizeUnJob(row, language, company);
    if (!job || seen.has(job.url)) continue;
    seen.add(job.url);
    jobs.push(job);
  }
  return jobs;
}

/** @param {import('./_types.js').PortalEntry & {un?: Record<string, unknown>}} entry */
function buildApiUrl(entry = {}) {
  if (entry.api && typeof entry.api === 'string') return entry.api;
  const cfg = entry.un && typeof entry.un === 'object' ? entry.un : {};
  const language = asString(cfg.language ?? entry.language ?? DEFAULT_LANGUAGE) || DEFAULT_LANGUAGE;
  const url = new URL(DEFAULT_API);
  url.searchParams.set('language', language);
  return url.href;
}

/** @type {Provider} */
export default {
  id: 'un-careers',

  detect(entry) {
    const url = entry.api || entry.careers_url || '';
    if (typeof url !== 'string') return null;
    try {
      const parsed = new URL(url);
      if (parsed.host.toLowerCase() === 'careers.un.org') return { url };
    } catch {
      /* not an absolute URL */
    }
    return null;
  },

  async fetch(entry, ctx) {
    const cfg = entry.un && typeof entry.un === 'object' ? entry.un : {};
    const language = asString(cfg.language ?? entry.language ?? DEFAULT_LANGUAGE) || DEFAULT_LANGUAGE;
    const json = await ctx.fetchJson(buildApiUrl(entry), {
      redirect: 'error',
      headers: {
        accept: 'application/json,text/plain,*/*',
        'user-agent': 'Mozilla/5.0 (compatible; career-ops/1.17)',
      },
    });
    return parseUnCareersResponse(json, { language, company: entry.name || 'United Nations' });
  },
};
