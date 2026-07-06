const DEFAULT_API = 'https://www.reed.co.uk/api/1.0/search';
const DEFAULT_RESULTS_TO_TAKE = 100;

function cfg(entry = {}) {
  return entry.reed || entry.config || {};
}

function requiredApiKey(entry) {
  const config = cfg(entry);
  const apiKey = config.api_key || config.apiKey || process.env.REED_API_KEY;
  if (!apiKey) throw new Error('reed: missing REED_API_KEY');
  return apiKey;
}

function reedDate(value) {
  if (!value) return null;
  const match = String(value).match(/\/Date\((\d+)\)\//);
  if (match) return new Date(Number(match[1])).toISOString();
  return value;
}

function trustedApiUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.reed.co.uk') {
    throw new Error(`reed: untrusted API URL: ${url}`);
  }
  return parsed;
}

export function buildReedUrl(entry = {}, page = 1) {
  const config = cfg(entry);
  const url = trustedApiUrl(config.api || entry.api || DEFAULT_API);
  const keywords = config.keywords || config.keyword || config.query || entry.query;
  const locationName = config.locationName || config.location || entry.location;
  const resultsToTake = config.resultsToTake || config.results_to_take || DEFAULT_RESULTS_TO_TAKE;
  const resultsToSkip = (page - 1) * Number(resultsToTake);

  if (keywords) url.searchParams.set('keywords', keywords);
  if (locationName) url.searchParams.set('locationName', locationName);
  url.searchParams.set('resultsToTake', String(resultsToTake));
  url.searchParams.set('resultsToSkip', String(resultsToSkip));
  if (config.permanent === true) url.searchParams.set('permanent', 'true');
  if (config.fullTime === true || config.full_time === true) url.searchParams.set('fullTime', 'true');
  if (config.remote === true) url.searchParams.set('remote', 'true');

  return url.toString();
}

export function parseReedResponse(json, entry = {}) {
  const rows = json?.results || json?.jobs || [];
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => ({
    title: row.jobTitle || row.title || '',
    url: row.jobUrl || row.url || '',
    company: row.employerName || row.company || entry.name || 'Reed',
    location: row.locationName || row.location || '',
    postedAt: reedDate(row.date || row.postedAt || row.expirationDate),
  })).filter((job) => job.title && job.url);
}

export async function fetch(entry = {}, ctx) {
  const apiKey = requiredApiKey(entry);
  const maxPages = ctx.maxPages ?? entry.max_pages ?? cfg(entry).max_pages ?? 1;
  const jobs = [];

  for (let page = 1; page <= maxPages; page++) {
    const json = await ctx.fetchJson(buildReedUrl(entry, page), {
      redirect: 'error',
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
      },
    });
    const pageJobs = parseReedResponse(json, entry);
    jobs.push(...pageJobs);
    if (pageJobs.length === 0) break;
  }

  return jobs;
}

export default {
  id: 'reed',
  detect() {
    return null;
  },
  fetch,
};
