const DEFAULT_API = 'https://europa.eu/eures/eures-apps/searchengine/page/jv-search/search';
const DETAILS_BASE = 'https://europa.eu/eures/portal/jv-se/jv-details';

function cfg(entry = {}) {
  return entry.eures || entry.config || {};
}

function rowsFrom(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.jobs)) return json.jobs;
  if (Array.isArray(json?.results)) return json.results;
  if (Array.isArray(json?.items)) return json.items;
  if (Array.isArray(json?.content)) return json.content;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.data?.items)) return json.data.items;
  if (Array.isArray(json?.data?.content)) return json.data.content;
  return [];
}

function value(row, names) {
  for (const name of names) {
    if (row?.[name] !== undefined && row[name] !== null) return row[name];
  }
  return '';
}

function locationValue(row) {
  const location = value(row, ['location', 'jobLocation', 'workLocation']);
  if (typeof location === 'string') return location;
  if (location && typeof location === 'object') {
    return [location.city, location.region, location.country, location.countryCode].filter(Boolean).join(', ');
  }
  return [row.city, row.region, row.country, row.countryCode].filter(Boolean).join(', ');
}

function jobUrl(row) {
  const direct = value(row, ['url', 'jobUrl', 'detailsUrl', 'link']);
  if (direct) return direct;
  const id = value(row, ['id', 'jobId', 'reference']);
  return id ? `${DETAILS_BASE}/${encodeURIComponent(id)}` : '';
}

function trustedApiUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || (parsed.hostname !== 'europa.eu' && !parsed.hostname.endsWith('.europa.eu'))) {
    throw new Error(`eures: untrusted API URL: ${url}`);
  }
  return parsed;
}

export function buildEuresUrl(entry = {}, page = 1) {
  const config = cfg(entry);
  const url = trustedApiUrl(config.api || entry.api || DEFAULT_API);
  if ((config.method || 'POST').toUpperCase() === 'GET') {
    const query = config.query || config.keyword || entry.query;
    if (query) url.searchParams.set(config.query_param || 'keywords', query);
    url.searchParams.set(config.page_param || 'page', String(page));
    url.searchParams.set(config.size_param || 'size', String(config.size || config.page_size || 50));
  }
  return url.toString();
}

export function buildEuresBody(entry = {}, page = 1) {
  const config = cfg(entry);
  return {
    keywords: config.keywords || config.keyword || config.query || entry.query || '',
    locationCodes: config.locationCodes || config.location_codes || [],
    page,
    size: config.size || config.page_size || 50,
    ...(config.body && typeof config.body === 'object' ? config.body : {}),
  };
}

export function parseEuresResponse(json, entry = {}) {
  return rowsFrom(json).map((row) => ({
    title: value(row, ['title', 'jobTitle', 'positionTitle', 'name']),
    url: jobUrl(row),
    company: value(row, ['company', 'companyName', 'employerName']) || entry.name || 'EURES',
    location: locationValue(row),
    postedAt: value(row, ['postedAt', 'postedDate', 'publicationDate', 'createdAt']) || null,
  })).filter((job) => job.title && job.url);
}

export async function fetch(entry = {}, ctx) {
  const config = cfg(entry);
  const method = (config.method || 'POST').toUpperCase();
  const maxPages = ctx.maxPages ?? entry.max_pages ?? config.max_pages ?? 1;
  const jobs = [];

  for (let page = 1; page <= maxPages; page++) {
    const json = await ctx.fetchJson(buildEuresUrl(entry, page), {
      method,
      redirect: 'error',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(method === 'GET' ? {} : { body: JSON.stringify(buildEuresBody(entry, page)) }),
    });
    const pageJobs = parseEuresResponse(json, entry);
    jobs.push(...pageJobs);
    if (pageJobs.length === 0) break;
  }
  return jobs;
}

export default {
  id: 'eures',
  detect() {
    return null;
  },
  fetch,
};
