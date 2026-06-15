// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Lever provider — hits the public postings endpoint.
// Auto-detects from careers_url pattern `https://jobs.lever.co/<slug>`.

function resolveApiUrl(entry) {
  const url = entry.careers_url || '';
  // Lever has a US instance (jobs.lever.co / api.lever.co) and an EU instance
  // (jobs.eu.lever.co / api.eu.lever.co) — match both and route to the right host.
  const match = url.match(/jobs(?:\.eu)?\.lever\.co\/([^/?#]+)/);
  if (!match) return null;
  const apiHost = /jobs\.eu\.lever\.co/i.test(url) ? 'api.eu.lever.co' : 'api.lever.co';
  return `https://${apiHost}/v0/postings/${match[1]}`;
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
    const json = await ctx.fetchJson(apiUrl);
    if (!Array.isArray(json)) return [];
    return json.map(j => ({
      title: j.text || '',
      url: j.hostedUrl || '',
      company: entry.name,
      location: j.categories?.location || '',
      postedAt: typeof j.createdAt === 'number' ? j.createdAt : undefined,
    }));
  },
};
