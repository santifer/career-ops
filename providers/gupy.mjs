const DEFAULT_API = 'https://api.gupy.io/api/v1/jobs';

function cfg(entry = {}) {
  return entry.gupy || entry.config || {};
}

function token(entry) {
  const config = cfg(entry);
  return config.token || process.env.GUPY_API_TOKEN || '';
}

function rowsFrom(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.results)) return json.results;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.jobs)) return json.jobs;
  if (Array.isArray(json?.data?.results)) return json.data.results;
  return [];
}

function locationValue(row) {
  const location = row.location || row.workplace || row.workPlace || row.address;
  if (typeof location === 'string') return location;
  if (location && typeof location === 'object') {
    return [location.city, location.state, location.country].filter(Boolean).join(', ');
  }
  return [row.city, row.state, row.country].filter(Boolean).join(', ');
}

function trustedApiUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || (parsed.hostname !== 'api.gupy.io' && !parsed.hostname.endsWith('.gupy.io'))) {
    throw new Error(`gupy: untrusted API URL: ${url}`);
  }
  return parsed;
}

export function buildGupyUrl(entry = {}, page = 1) {
  const config = cfg(entry);
  const url = trustedApiUrl(config.api || entry.api || DEFAULT_API);
  const query = config.query || config.keyword || entry.query;
  const limit = config.limit || config.page_size || config.pageSize || 50;
  if (query) url.searchParams.set(config.query_param || config.queryParam || 'name', query);
  url.searchParams.set(config.page_param || config.pageParam || 'page', String(page));
  url.searchParams.set(config.limit_param || config.limitParam || 'limit', String(limit));
  return url.toString();
}

export function parseGupyResponse(json, entry = {}) {
  return rowsFrom(json).map((row) => ({
    title: row.name || row.title || row.jobTitle || '',
    url: row.jobUrl || row.url || row.applyUrl || '',
    company: row.companyName || row.company?.name || row.company || entry.name || 'Gupy',
    location: locationValue(row),
    postedAt: row.publishedDate || row.createdAt || row.postedAt || null,
  })).filter((job) => job.title && job.url);
}

export async function fetch(entry = {}, ctx) {
  const config = cfg(entry);
  const apiToken = token(entry);
  if (!apiToken && config.requires_token !== false && config.requiresToken !== false) {
    throw new Error('gupy: missing GUPY_API_TOKEN');
  }

  const maxPages = ctx.maxPages ?? entry.max_pages ?? config.max_pages ?? 1;
  const jobs = [];
  for (let page = 1; page <= maxPages; page++) {
    const json = await ctx.fetchJson(buildGupyUrl(entry, page), {
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
      },
    });
    const pageJobs = parseGupyResponse(json, entry);
    jobs.push(...pageJobs);
    if (pageJobs.length === 0) break;
  }
  return jobs;
}

export default {
  id: 'gupy',
  detect() {
    return null;
  },
  fetch,
};
