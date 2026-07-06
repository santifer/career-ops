function cfg(entry = {}) {
  return entry.icims || entry.config || {};
}

function authHeaders(entry) {
  const config = cfg(entry);
  const username = config.username || process.env.ICIMS_USERNAME;
  const password = config.password || process.env.ICIMS_PASSWORD;
  if (!username || !password) {
    if (config.requires_auth === false || config.requiresAuth === false) return {};
    throw new Error('icims: missing ICIMS_USERNAME or ICIMS_PASSWORD');
  }
  return {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  };
}

function fieldValue(row, names) {
  for (const name of names) {
    if (row?.[name] !== undefined && row[name] !== null) return row[name];
  }

  const fields = row?.fields;
  if (fields && !Array.isArray(fields) && typeof fields === 'object') {
    for (const name of names) {
      if (fields[name] !== undefined && fields[name] !== null) return fields[name];
    }
  }

  if (Array.isArray(fields)) {
    for (const field of fields) {
      const key = field.name || field.key || field.id || field.label;
      if (names.includes(key)) return field.value || field.text || '';
    }
  }

  return '';
}

function rowsFrom(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.searchResults)) return json.searchResults;
  if (Array.isArray(json?.results)) return json.results;
  if (Array.isArray(json?.jobs)) return json.jobs;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.data?.results)) return json.data.results;
  return [];
}

function locationValue(row) {
  const direct = fieldValue(row, ['location', 'jobLocation', 'job_location', 'cityState', 'city_state']);
  if (direct && typeof direct === 'string') return direct;
  if (direct && typeof direct === 'object') {
    return [direct.city, direct.state, direct.country].filter(Boolean).join(', ');
  }
  return [fieldValue(row, ['city']), fieldValue(row, ['state']), fieldValue(row, ['country'])]
    .filter(Boolean)
    .join(', ');
}

function trustedApiUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || (parsed.hostname !== 'api.icims.com' && !parsed.hostname.endsWith('.icims.com'))) {
    throw new Error(`icims: untrusted API URL: ${url}`);
  }
  return parsed;
}

export function buildIcimsUrl(entry = {}, page = 1) {
  const config = cfg(entry);
  if (!entry.api && !config.api) {
    throw new Error('icims: configure an official Job Portal API endpoint in api');
  }

  const url = trustedApiUrl(config.api || entry.api);
  const pageParam = config.page_param || config.pageParam || 'page';
  const pageSizeParam = config.page_size_param || config.pageSizeParam || 'limit';
  const pageSize = config.page_size || config.pageSize || 50;
  url.searchParams.set(pageParam, String(page));
  url.searchParams.set(pageSizeParam, String(pageSize));

  const searchJson = config.search_json || config.searchJson;
  if (searchJson) {
    url.searchParams.set('searchJson', typeof searchJson === 'string' ? searchJson : JSON.stringify(searchJson));
  }
  if (config.query) url.searchParams.set(config.query_param || 'q', config.query);
  return url.toString();
}

export function parseIcimsResponse(json, entry = {}) {
  return rowsFrom(json).map((row) => ({
    title: fieldValue(row, ['title', 'jobTitle', 'jobtitle', 'positionTitle', 'name']),
    url: fieldValue(row, ['url', 'jobUrl', 'jobURL', 'portalUrl', 'applyUrl', 'link']),
    company: fieldValue(row, ['company', 'companyName']) || entry.name || 'iCIMS',
    location: locationValue(row),
    postedAt: fieldValue(row, ['postedAt', 'postedDate', 'datePosted', 'createdAt', 'updatedAt']) || null,
  })).filter((job) => job.title && job.url);
}

export async function fetch(entry = {}, ctx) {
  const maxPages = ctx.maxPages ?? entry.max_pages ?? cfg(entry).max_pages ?? 1;
  const jobs = [];

  for (let page = 1; page <= maxPages; page++) {
    const json = await ctx.fetchJson(buildIcimsUrl(entry, page), {
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        ...authHeaders(entry),
      },
    });
    const pageJobs = parseIcimsResponse(json, entry);
    jobs.push(...pageJobs);
    if (pageJobs.length === 0) break;
  }

  return jobs;
}

export default {
  id: 'icims',
  detect() {
    return null;
  },
  fetch,
};
