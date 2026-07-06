const DEFAULT_RESULTS_PER_PAGE = 50;

function cfg(entry = {}) {
  return entry.adzuna || entry.config || {};
}

function requiredCredentials(entry) {
  const config = cfg(entry);
  const appId = config.app_id || config.appId || process.env.ADZUNA_APP_ID;
  const appKey = config.app_key || config.appKey || process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    throw new Error('adzuna: missing ADZUNA_APP_ID or ADZUNA_APP_KEY');
  }
  return { appId, appKey };
}

function trustedApiUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.adzuna.com') {
    throw new Error(`adzuna: untrusted API URL: ${url}`);
  }
  return parsed;
}

export function buildAdzunaUrl(entry = {}, page = 1) {
  const config = cfg(entry);
  const { appId, appKey } = requiredCredentials(entry);
  const country = String(config.country || entry.country || 'us').toLowerCase();
  const url = trustedApiUrl(config.api || entry.api || `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`);
  const what = config.what || config.keyword || config.query || entry.query;
  const where = config.where || config.location || entry.location;
  const resultsPerPage = config.results_per_page || config.resultsPerPage || DEFAULT_RESULTS_PER_PAGE;

  url.searchParams.set('app_id', appId);
  url.searchParams.set('app_key', appKey);
  url.searchParams.set('results_per_page', String(resultsPerPage));
  url.searchParams.set('content-type', 'application/json');
  if (what) url.searchParams.set('what', what);
  if (where) url.searchParams.set('where', where);
  if (config.remote === true) url.searchParams.set('full_time', '1');

  return url.toString();
}

export function parseAdzunaResponse(json, entry = {}) {
  const rows = json?.results || json?.jobs || [];
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => ({
    title: row.title || '',
    url: row.redirect_url || row.url || '',
    company: row.company?.display_name || row.company_name || entry.name || 'Adzuna',
    location: row.location?.display_name || row.location || '',
    postedAt: row.created || row.postedAt || null,
  })).filter((job) => job.title && job.url);
}

export async function fetch(entry = {}, ctx) {
  const maxPages = ctx.maxPages ?? entry.max_pages ?? cfg(entry).max_pages ?? 1;
  const jobs = [];

  for (let page = 1; page <= maxPages; page++) {
    const json = await ctx.fetchJson(buildAdzunaUrl(entry, page), { redirect: 'error' });
    const pageJobs = parseAdzunaResponse(json, entry);
    jobs.push(...pageJobs);
    if (pageJobs.length === 0) break;
  }

  return jobs;
}

export default {
  id: 'adzuna',
  detect() {
    return null;
  },
  fetch,
};
