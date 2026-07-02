// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Get on Board provider — board-wide feed for the tech "programming" category
// (https://www.getonbrd.com/api/v0/categories/programming/jobs). Public,
// zero-auth JSON:API. `expand[]=company` embeds the company so its name is
// available at the list level. The broad category feed is fetched (not the
// server-side ?query= search, which requires a query and narrows results) so
// scan.mjs's title_filter can gate on the configured titles instead.
//
// Wire in via a `job_boards:` entry with `provider: getonbrd`.

const FEED_URL =
  'https://www.getonbrd.com/api/v0/categories/programming/jobs?per_page=100&expand[]=company';

/** @type {Provider} */
export default {
  id: 'getonbrd',

  /**
   * Fetches and normalizes postings from the Get on Board public API.
   * @param {{ name?: string }} entry - The job_boards entry being processed.
   * @param {{ fetchJson: (url: string, opts?: { redirect?: 'error'|'follow'|'manual' }) => Promise<any> }} ctx - HTTP context.
   * @returns {Promise<Array<{title: string, url: string, company: string, location: string}>>}
   */
  async fetch(entry, ctx) {
    // redirect:'error' prevents SSRF via server-side redirects
    const json = await ctx.fetchJson(FEED_URL, { redirect: 'error' });
    if (!json || !Array.isArray(json.data)) {
      throw new Error(
        `getonbrd: unexpected API response — expected { data: [...] }, got keys: [${json ? Object.keys(json).join(', ') : 'null'}]`,
      );
    }

    return json.data
      .filter(
        j =>
          j &&
          typeof j === 'object' &&
          j.attributes &&
          typeof j.attributes === 'object' &&
          typeof j.attributes.title === 'string' &&
          j.attributes.title.trim() !== '' &&
          j.links &&
          typeof j.links.public_url === 'string' &&
          /^https?:\/\//i.test(j.links.public_url.trim()),
      )
      .map(j => {
        const attr = j.attributes;
        const name = attr.company?.data?.attributes?.name;
        const company = typeof name === 'string' && name.trim() ? name.trim() : entry.name || 'Get on Board';
        const location =
          attr.remote === true ? 'Remote' : typeof attr.countries === 'string' ? attr.countries.trim() : '';
        return {
          title: attr.title.trim(),
          url: j.links.public_url.trim(),
          company,
          location,
        };
      });
  },
};
