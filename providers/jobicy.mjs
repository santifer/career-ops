// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Jobicy provider — board-wide remote-jobs aggregator feed
// (https://jobicy.com/api/v2/remote-jobs?count=50). Returns { jobs: [...] }.
//
// Wire in via a `job_boards:` entry with `provider: jobicy`.

const FEED_URL = 'https://jobicy.com/api/v2/remote-jobs?count=50';

/** @type {Provider} */
export default {
  id: 'jobicy',

  detect(entry) {
    return entry?.provider === 'jobicy' ? { url: FEED_URL } : null;
  },

  /**
   * Fetches and normalizes postings from the Jobicy public feed.
   * @param {{ name?: string }} entry - The job_boards entry being processed.
   * @param {{ fetchJson: (url: string, opts?: { redirect?: 'error'|'follow'|'manual' }) => Promise<any> }} ctx - HTTP context.
   * @returns {Promise<Array<{title: string, url: string, company: string, location: string, postedAt?: number}>>}
   */
  async fetch(entry, ctx) {
    // redirect:'error' prevents SSRF via server-side redirects
    const json = await ctx.fetchJson(FEED_URL, { redirect: 'error' });
    if (!json || !Array.isArray(json.jobs)) {
      throw new Error(`jobicy: unexpected API response — expected { jobs: [...] }, got keys: [${json ? Object.keys(json).join(', ') : 'null'}]`);
    }

    return parseJobicyResponse(json, entry.name || 'Jobicy');
  },
};

/**
 * Parse a Jobicy API response. Exported for unit tests.
 *
 * @param {any} json - Raw response payload.
 * @param {string} defaultCompany - Fallback company name.
 * @returns {Array<{title: string, url: string, company: string, location: string}>}
 */
export function parseJobicyResponse(json, defaultCompany = 'Jobicy') {
  if (!json || !Array.isArray(json.jobs)) return [];

  const toEpochMs = (value) => {
    if (!value) return undefined;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  return json.jobs
    .filter(j => j && typeof j === 'object'
      && typeof j.jobTitle === 'string' && j.jobTitle.trim() !== ''
      && typeof j.url === 'string' && /^https?:\/\//i.test(j.url.trim()))
    .map(j => ({
      title: j.jobTitle.trim(),
      url: j.url.trim(),
      company: typeof j.companyName === 'string' && j.companyName.trim() ? j.companyName.trim() : defaultCompany,
      location: typeof j.jobGeo === 'string' ? j.jobGeo.trim() : '',
      postedAt: toEpochMs(j.pubDate),
    }));
}