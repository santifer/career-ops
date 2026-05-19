/**
 * providers/workable.mjs — Workable ATS provider for scan.mjs.
 *
 * Workable public jobs API is zero-token.
 * Two URL patterns:
 *   apply.workable.com/api/v3/accounts/{board}/jobs          (canonical)
 *   {board}.workable.com → infer board slug from subdomain
 *
 * Response paginates via `next_page` cursor in the top-level object.
 * We fetch pages until exhausted (or 10-page safety cap).
 *
 * Provider contract:
 *   id: 'workable'
 *   detect(entry): {url} | null
 *   fetch(entry, ctx): [{title, url, company, location}]
 */

import { makeHttpCtx } from './_http.mjs';

const WORKABLE_APPLY_RE  = /apply\.workable\.com\/(?:api\/v3\/accounts\/)?([\w-]+)/i;
const WORKABLE_SUBDOMAIN_RE = /([\w-]+)\.workable\.com/i;

const MAX_PAGES = 10;

function extractBoard(entry) {
  const apiUrl     = entry.api         || '';
  const careersUrl = entry.careers_url || '';
  for (const url of [apiUrl, careersUrl]) {
    const m = url.match(WORKABLE_APPLY_RE) || url.match(WORKABLE_SUBDOMAIN_RE);
    if (m) return m[1];
  }
  return null;
}

function buildApiUrl(board, cursor = null) {
  const base = `https://apply.workable.com/api/v3/accounts/${board}/jobs`;
  return cursor ? `${base}?cursor=${encodeURIComponent(cursor)}` : base;
}

/**
 * Workable API response shape (v3):
 *   { results: [{ id, title, shortcode, url, location: { city, country, region }, state }],
 *     next_page: <cursor | null> }
 */
function parseJobs(results, companyName) {
  return results
    .filter(job => job.state === 'published')
    .map(job => {
      const loc = job.location;
      const location = [loc?.city, loc?.region, loc?.country].filter(Boolean).join(', ');
      return {
        title: job.title || '',
        url: job.url || `https://apply.workable.com/${companyName}/j/${job.shortcode}`,
        company: companyName,
        location,
      };
    });
}

const workable = {
  id: 'workable',

  detect(entry) {
    const apiUrl     = entry.api          || '';
    const careersUrl = entry.careers_url  || '';
    if (
      WORKABLE_APPLY_RE.test(apiUrl) || WORKABLE_APPLY_RE.test(careersUrl) ||
      WORKABLE_SUBDOMAIN_RE.test(apiUrl) || WORKABLE_SUBDOMAIN_RE.test(careersUrl)
    ) {
      const board = extractBoard(entry);
      return board ? { url: buildApiUrl(board) } : null;
    }
    return null;
  },

  async fetch(entry, ctx = makeHttpCtx()) {
    const board = extractBoard(entry);
    if (!board) throw new Error(`workable: cannot determine board slug for "${entry.name}"`);

    const allJobs = [];
    let cursor = null;
    let pages = 0;

    while (pages < MAX_PAGES) {
      const url = buildApiUrl(board, cursor);
      const res = await ctx.fetch(url, {
        signal: AbortSignal.timeout(ctx.timeoutMs || 8000),
        headers: { ...ctx.headers, 'Accept': 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`workable: HTTP ${res.status} from ${url}`);
      }

      const data = await res.json();
      const results = Array.isArray(data?.results) ? data.results : [];
      allJobs.push(...parseJobs(results, entry.name || 'Unknown'));

      cursor = data?.next_page || null;
      pages++;
      if (!cursor) break;
    }

    return allJobs;
  },
};

export default workable;
