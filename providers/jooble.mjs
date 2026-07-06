const DEFAULT_API_BASE = 'https://jooble.org/api';

function cfg(entry = {}) {
  return entry.jooble || entry.config || {};
}

function requiredApiKey(entry) {
  const config = cfg(entry);
  const apiKey = config.api_key || config.apiKey || process.env.JOOBLE_API_KEY;
  if (!apiKey) throw new Error('jooble: missing JOOBLE_API_KEY');
  return apiKey;
}

function trustedApiUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || (parsed.hostname !== 'jooble.org' && !parsed.hostname.endsWith('.jooble.org'))) {
    throw new Error(`jooble: untrusted API URL: ${url}`);
  }
  return parsed.toString();
}

export function buildJoobleUrl(entry = {}) {
  const config = cfg(entry);
  const apiKey = requiredApiKey(entry);
  return trustedApiUrl(config.api || entry.api || `${DEFAULT_API_BASE}/${encodeURIComponent(apiKey)}`);
}

export function buildJoobleBody(entry = {}, page = 1) {
  const config = cfg(entry);
  return {
    keywords: config.keywords || config.keyword || config.query || entry.query || '',
    location: config.location || entry.location || '',
    page,
    ...(config.body && typeof config.body === 'object' ? config.body : {}),
  };
}

export function parseJoobleResponse(json, entry = {}) {
  const rows = json?.jobs || json?.results || [];
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => ({
    title: row.title || '',
    url: row.link || row.url || '',
    company: row.company || row.company_name || entry.name || 'Jooble',
    location: row.location || '',
    postedAt: row.updated || row.created || row.postedAt || null,
  })).filter((job) => job.title && job.url);
}

export async function fetch(entry = {}, ctx) {
  const maxPages = ctx.maxPages ?? entry.max_pages ?? cfg(entry).max_pages ?? 1;
  const jobs = [];

  for (let page = 1; page <= maxPages; page++) {
    const json = await ctx.fetchJson(buildJoobleUrl(entry), {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildJoobleBody(entry, page)),
    });
    const pageJobs = parseJoobleResponse(json, entry);
    jobs.push(...pageJobs);
    if (pageJobs.length === 0) break;
  }

  return jobs;
}

export default {
  id: 'jooble',
  detect() {
    return null;
  },
  fetch,
};
