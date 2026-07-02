// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Get on Board provider — board-wide feed for the tech "programming" category
// (https://www.getonbrd.com/api/v0/categories/programming/jobs). Public,
// zero-auth JSON:API. `expand[]=company` embeds the company so its name is
// available at the list level. The broad category feed is fetched (not the
// server-side ?query= search, which requires a query and narrows results) so
// scan.mjs's title_filter can gate on the configured titles instead. Pages are
// fetched until one comes back short/empty or the page cap is reached (default
// 3, override with `max_pages` on the portal entry).
//
// Wire in via a `job_boards:` entry with `provider: getonbrd`.

const FEED_BASE = 'https://www.getonbrd.com/api/v0/categories/programming/jobs';
const TRUSTED_HOST = 'www.getonbrd.com';
const PER_PAGE = 100;
const DEFAULT_MAX_PAGES = 3;
const MAX_PAGES_CAP = 50;

/** @param {string} url */
function assertGetonbrdUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`getonbrd: invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`getonbrd: URL must use HTTPS: ${url}`);
  if (parsed.hostname !== TRUSTED_HOST) {
    throw new Error(`getonbrd: untrusted hostname "${parsed.hostname}" — must be ${TRUSTED_HOST}`);
  }
  return url;
}

/** Resolve the page cap: a positive integer `max_pages` on the entry, capped. */
function resolveMaxPages(entry) {
  const v = entry?.max_pages;
  if (Number.isInteger(v) && v > 0) return Math.min(v, MAX_PAGES_CAP);
  return DEFAULT_MAX_PAGES;
}

/**
 * Normalize a single Get on Board job (JSON:API resource). Exported for tests.
 *
 * Field mapping → the normalized Job shape:
 *   - title:    `attributes.title`, trimmed (items without one are dropped).
 *   - url:      `links.public_url` — an absolute `https:` posting URL host-locked
 *               to www.getonbrd.com (off-host or non-https drops the item). It is
 *               the dedup key and is display-only (never server-fetched here).
 *   - company:  `attributes.company.data.attributes.name` (from `expand[]=company`),
 *               falling back to the portal entry name, then "Get on Board".
 *   - location: "Remote" when `attributes.remote` is true, else `attributes.countries`.
 *
 * @param {any} j
 * @param {string} [fallbackCompany]
 * @returns {{ title: string, url: string, company: string, location: string } | null}
 */
export function normalizeGetonbrdJob(j, fallbackCompany) {
  if (!j || typeof j !== 'object' || !j.attributes || typeof j.attributes !== 'object') return null;
  const attr = j.attributes;

  const title = typeof attr.title === 'string' ? attr.title.trim() : '';
  if (!title) return null;

  // url must be an absolute https posting link on www.getonbrd.com.
  let url = '';
  const rawUrl = j.links && typeof j.links.public_url === 'string' ? j.links.public_url.trim() : '';
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === 'https:' && parsed.hostname === TRUSTED_HOST) url = parsed.href;
    } catch {
      // malformed URL → leave url = '' → dropped below
    }
  }
  if (!url) return null;

  const name = attr.company?.data?.attributes?.name;
  const company =
    typeof name === 'string' && name.trim() ? name.trim() : fallbackCompany || 'Get on Board';
  const location =
    attr.remote === true ? 'Remote' : typeof attr.countries === 'string' ? attr.countries.trim() : '';

  return { title, url, company, location };
}

/** @type {Provider} */
export default {
  id: 'getonbrd',

  async fetch(entry, ctx) {
    assertGetonbrdUrl(FEED_BASE);
    const maxPages = resolveMaxPages(entry);
    const fallbackCompany = entry?.name;
    const out = [];

    for (let page = 1; page <= maxPages; page++) {
      const url = `${FEED_BASE}?per_page=${PER_PAGE}&expand[]=company&page=${page}`;
      // redirect:'error' prevents SSRF via server-side redirects
      const json = await ctx.fetchJson(url, { redirect: 'error' });
      if (!json || !Array.isArray(json.data)) {
        throw new Error(
          `getonbrd: unexpected API response on page ${page} — expected { data: [...] }, got keys: [${json ? Object.keys(json).join(', ') : 'null'}]`,
        );
      }
      for (const j of json.data) {
        const normalized = normalizeGetonbrdJob(j, fallbackCompany);
        if (normalized) out.push(normalized);
      }
      if (json.data.length < PER_PAGE) break; // short page → last page reached
    }
    return out;
  },
};
