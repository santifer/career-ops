// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Personio provider — hits the public `search.json` feed of a Personio careers
// subdomain. Used by Swiss/DACH employers (e.g. AMINA/SEBA Bank) and many
// startups whose careers pages are `{slug}.jobs.personio.com` / `.de`.
//
// Feed: https://{slug}.jobs.personio.com/search.json
//   -> [ { id, name, office, employment_type, seniority, ... } ]   (array)
// Public posting URL: https://{slug}.jobs.personio.com/job/{id}
//
// Auto-detects from careers_url; no extra config needed.

function resolveSlugHost(entry) {
  const url = entry.careers_url || entry.api || '';
  const m = url.match(/https?:\/\/([a-z0-9-]+)\.jobs\.personio\.(com|de)/i);
  if (!m) return null;
  return { slug: m[1], tld: m[2] };
}

/** @type {Provider} */
export default {
  id: 'personio',

  detect(entry) {
    const r = resolveSlugHost(entry);
    return r ? { url: `https://${r.slug}.jobs.personio.${r.tld}/search.json` } : null;
  },

  async fetch(entry, ctx) {
    const r = resolveSlugHost(entry);
    if (!r) throw new Error(`personio: cannot derive slug for ${entry.name} (need {slug}.jobs.personio.com careers_url)`);
    const base = `https://${r.slug}.jobs.personio.${r.tld}`;
    const json = await ctx.fetchJson(`${base}/search.json`, { headers: { accept: 'application/json' } });
    const positions = Array.isArray(json) ? json : (Array.isArray(json?.positions) ? json.positions : []);
    return positions
      .filter(p => p && p.id != null)
      .map(p => ({
        title: p.name || p.title || '',
        url: `${base}/job/${p.id}`,
        company: entry.name,
        location: p.office || p.location || '',
      }));
  },
};
