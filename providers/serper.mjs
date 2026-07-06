// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Serper.dev provider — Google SERP scraping API, replacement for serpapi.mjs.
// Free tier: 2,500 queries/month (no card required), then ~$0.30-$1.00/1k paid.
// Supports full Google query syntax including "site:" operators, so it's a
// drop-in replacement for the existing "site:jobs.ashbyhq.com ..." style
// scan_query strings already used by tracked_companies / job_boards entries.
//
// Wire in via a `tracked_companies` or `job_boards` entry with
// `provider: serper` and a `query` (or `scan_query`) field — same shape as
// the serpapi.mjs entries it replaces.

const API_URL = 'https://google.serper.dev/search';

/** @type {Provider} */
export default {
  id: 'serper',
  // Generic catch-all (matches any bare scan_method:websearch entry) — must
  // run after every specific URL/shape-based detector has had a chance, so a
  // known free ATS (Workable, Ashby, etc.) never gets shadowed by this.
  isFallback: true,

  detect(entry) {
    if (entry.scan_method === 'serper' || entry.provider === 'serper') return { url: 'serper' };
    // Fallback: a bare scan_method:websearch entry (no explicit provider) is
    // handed to Serper.dev when SERPER_API_KEY is present — same role
    // serpapi.mjs used to play before its free tier ran out.
    if (entry.scan_method === 'websearch' && process.env.SERPER_API_KEY) return { url: 'serper' };
    return null;
  },

  /**
   * @param {{ name?: string, scan_query?: string, query?: string }} entry
   * @param {{ fetchJson: (url: string, opts?: any) => Promise<any> }} ctx
   */
  async fetch(entry, ctx) {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) throw new Error('SERPER_API_KEY is not set');

    const query = entry.scan_query || entry.query;
    if (!query) throw new Error('serper: missing query or scan_query');

    const json = await ctx.fetchJson(API_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query }),
    });

    if (!json?.organic || !Array.isArray(json.organic)) {
      throw new Error(`serper: unexpected API response shape (missing 'organic' array). Response keys: ${Object.keys(json || {}).join(',')}`);
    }

    return json.organic
      .filter(r => r.link && r.title)
      .map(r => ({
        title: r.title,
        url: r.link,
        company: entry.name || 'Organic Result',
        location: r.snippet || '',
      }));
  },
};
