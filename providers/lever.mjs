// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Lever provider — hits the public postings endpoint.
// Auto-detects from a careers_url whose host is jobs.lever.co (US) or
// jobs.eu.lever.co (EU); the company slug is the first path segment.

function resolveApiUrl(entry) {
  let parsed;
  try {
    parsed = new URL(entry.careers_url || '');
  } catch {
    return null;
  }
  // Lever has a US instance (jobs.lever.co / api.lever.co) and an EU instance
  // (jobs.eu.lever.co / api.eu.lever.co). Match on the hostname, not a loose
  // substring, then take the company slug from the path.
  const host = parsed.hostname.toLowerCase();
  if (host !== 'jobs.lever.co' && host !== 'jobs.eu.lever.co') return null;
  const slug = parsed.pathname.split('/').filter(Boolean)[0];
  if (!slug) return null;
  const apiHost = host === 'jobs.eu.lever.co' ? 'api.eu.lever.co' : 'api.lever.co';
  return `https://${apiHost}/v0/postings/${slug}`;
}

/** @type {Provider} */
export default {
  id: 'lever',

  detect(entry) {
    const apiUrl = resolveApiUrl(entry);
    return apiUrl ? { url: apiUrl } : null;
  },

  async fetch(entry, ctx) {
    const apiUrl = resolveApiUrl(entry);
    if (!apiUrl) throw new Error(`lever: cannot derive API URL for ${entry.name}`);
    const json = await ctx.fetchJson(apiUrl, { redirect: 'error' });
    if (!Array.isArray(json)) return [];
    return json.map(j => ({
      title: j.text || '',
      url: j.hostedUrl || '',
      company: entry.name,
      location: j.categories?.location || '',
      // Lever's v0 postings list ships the full description for free (same
      // payload, no per-job request) — enables scan.mjs content_filter.
      description: typeof j.descriptionPlain === 'string' ? j.descriptionPlain : '',
      postedAt: typeof j.createdAt === 'number' ? j.createdAt : undefined,
    }));
  },
};
