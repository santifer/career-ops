const DEFAULT_API = 'https://data.usajobs.gov/api/search';
const DEFAULT_RESULTS_PER_PAGE = 50;

function cfg(entry = {}) {
  return entry.usajobs || entry.config || {};
}

function requiredCredentials(entry) {
  const config = cfg(entry);
  const userAgent = config.user_agent || config.userAgent || process.env.USAJOBS_USER_AGENT;
  const apiKey = config.api_key || config.apiKey || process.env.USAJOBS_API_KEY;
  if (!userAgent || !apiKey) {
    throw new Error('usajobs: missing USAJOBS_USER_AGENT or USAJOBS_API_KEY');
  }
  return { userAgent, apiKey };
}

function trustedApiUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'data.usajobs.gov') {
    throw new Error(`usajobs: untrusted API URL: ${url}`);
  }
  return parsed;
}

export function buildUsajobsUrl(entry = {}, page = 1) {
  const config = cfg(entry);
  const url = trustedApiUrl(config.api || entry.api || DEFAULT_API);
  const keyword = config.keyword || config.query || entry.query;
  const location = config.location || config.locationName || entry.location;
  const resultsPerPage = config.results_per_page || config.resultsPerPage || DEFAULT_RESULTS_PER_PAGE;

  if (keyword) url.searchParams.set('Keyword', keyword);
  if (location) url.searchParams.set('LocationName', location);
  if (config.remote === true || config.remoteIndicator === true) {
    url.searchParams.set('RemoteIndicator', 'true');
  }
  url.searchParams.set('ResultsPerPage', String(resultsPerPage));
  url.searchParams.set('Page', String(page));
  return url.toString();
}

function locationDisplay(descriptor = {}) {
  if (Array.isArray(descriptor.PositionLocation) && descriptor.PositionLocation.length > 0) {
    return descriptor.PositionLocation
      .map((loc) => loc.LocationName || loc.CityName || loc.CountryCode)
      .filter(Boolean)
      .join('; ');
  }
  return descriptor.PositionLocationDisplay || descriptor.LocationName || '';
}

export function parseUsajobsResponse(json, entry = {}) {
  const items = json?.SearchResult?.SearchResultItems || json?.SearchResultItems || json?.results || [];
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const descriptor = item.MatchedObjectDescriptor || item;
    return {
      title: descriptor.PositionTitle || descriptor.title || '',
      url: descriptor.PositionURI || descriptor.url || '',
      company: descriptor.OrganizationName || descriptor.DepartmentName || entry.name || 'USAJOBS',
      location: locationDisplay(descriptor),
      postedAt: descriptor.PublicationStartDate || descriptor.postedAt || descriptor.created_at || null,
    };
  }).filter((job) => job.title && job.url);
}

export async function fetch(entry = {}, ctx) {
  const { userAgent, apiKey } = requiredCredentials(entry);
  const maxPages = ctx.maxPages ?? entry.max_pages ?? cfg(entry).max_pages ?? 1;
  const jobs = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = buildUsajobsUrl(entry, page);
    const json = await ctx.fetchJson(url, {
      redirect: 'error',
      headers: {
        Host: 'data.usajobs.gov',
        'User-Agent': userAgent,
        'Authorization-Key': apiKey,
      },
    });
    const pageJobs = parseUsajobsResponse(json, entry);
    jobs.push(...pageJobs);
    if (pageJobs.length === 0) break;
  }

  return jobs;
}

export default {
  id: 'usajobs',
  detect() {
    return null;
  },
  fetch,
};
