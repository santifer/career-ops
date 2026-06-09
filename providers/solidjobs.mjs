// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// SolidJobs provider — hits the public offers API.
// Auto-detects from careers_url pattern `https://solid.jobs/public-api/offers/<division>`.
//
// Available divisions: it, engineering, marketing, sales, hr, logistics, finances, other
// API docs: https://solid.jobs/public-api/offers/{division}?campaign={campaign}

const ALLOWED_HOSTS = new Set(['solid.jobs']);

function assertUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`solidjobs: invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`solidjobs: URL must use HTTPS: ${url}`);
  if (!ALLOWED_HOSTS.has(parsed.hostname))
    throw new Error(`solidjobs: untrusted hostname "${parsed.hostname}" — must be solid.jobs`);
  return url;
}

/** @type {Provider} */
export default {
  id: 'solidjobs',

  detect(entry) {
    const url = entry.careers_url || '';
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'solid.jobs' && parsed.pathname.startsWith('/public-api/offers/'))
        return { url };
    } catch {}
    return null;
  },

  async fetch(entry, ctx) {
    const url = entry.careers_url;
    if (!url) throw new Error('solidjobs: careers_url required');
    assertUrl(url);
    // redirect:'error' prevents SSRF via server-side redirects
    const json = await ctx.fetchJson(url, { redirect: 'error' });
    const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
    return jobs.map(j => ({
      title: j.title || '',
      url: j.url || '',
      company: j.company || entry.name,
      location: Array.isArray(j.locations) ? j.locations.join(', ') : '',
    }));
  },
};
