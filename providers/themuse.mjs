// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// The Muse provider — public, zero-auth JSON jobs feed.
// Endpoint: https://www.themuse.com/api/public/jobs?page=0
// Response shape: { results: [...], page: 0, page_count: N }
//
// Wire in via a `job_boards:` entry with `provider: themuse`.

const FEED_URL = 'https://www.themuse.com/api/public/jobs?page=0';
const TRUSTED_HOST = 'www.themuse.com';

/** @param {string} url */
function assertMuseUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`themuse: invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`themuse: URL must use HTTPS: ${url}`);
  if (parsed.hostname !== TRUSTED_HOST) {
    throw new Error(`themuse: untrusted hostname "${parsed.hostname}" — must be ${TRUSTED_HOST}`);
  }
  return url;
}

/**
 * Normalize a single result from the Muse API response. Exported for unit tests.
 *
 * Field mapping:
 *   name              → title
 *   refs.landing_page → url
 *   company.name      → company
 *   locations[0].name → location
 *
 * Returns null when required fields (title or url) are missing or invalid.
 *
 * @param {any} j
 * @returns {{ title: string, url: string, company: string, location: string } | null}
 */
export function normalizeMuseJob(j) {
  if (!j || typeof j !== 'object') return null;
  const title = typeof j.name === 'string' ? j.name.trim() : '';
  if (!title) return null;
  const url = typeof j.refs?.landing_page === 'string' ? j.refs.landing_page.trim() : '';
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const company =
    typeof j.company?.name === 'string' && j.company.name.trim()
      ? j.company.name.trim()
      : 'The Muse';
  const location =
    Array.isArray(j.locations) && j.locations.length > 0 && typeof j.locations[0]?.name === 'string'
      ? j.locations[0].name.trim()
      : '';
  return { title, url, company, location };
}

/** @type {Provider} */
export default {
  id: 'themuse',

  async fetch(_entry, ctx) {
    assertMuseUrl(FEED_URL);
    // redirect:'error' prevents SSRF via server-side redirects
    const json = await ctx.fetchJson(FEED_URL, { redirect: 'error' });
    if (!json || !Array.isArray(json.results)) {
      throw new Error(
        `themuse: unexpected API response — expected { results: [...] }, got keys: [${json ? Object.keys(json).join(', ') : 'null'}]`,
      );
    }
    return json.results.map(normalizeMuseJob).filter(Boolean);
  },
};
