// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Workday provider — hits the public "cxs" job-board JSON endpoint.
//
// Auto-detects from a careers_url of the form
//   https://<tenant>.<wdN>.myworkdayjobs.com/<site>
//   (an optional /<locale> segment such as /en-US is tolerated)
// and derives the cxs endpoint
//   https://<tenant>.<wdN>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs
//
// The cxs endpoint is POST-only and paginates via { limit, offset }. Workday
// caps `limit` at 20 on most tenants, so we page in 20s. Server-side keyword
// filtering is NOT used (searchText left empty) — scan.mjs applies the
// title/location filters after fetch. Very large boards (e.g. big distributors)
// are capped at WD_MAX_PAGES to keep a scan bounded; relevant roles for this
// profile are a small slice and the title filter trims the rest.
//
// SSRF defence: the host must match <tenant>.<wdN>.myworkdayjobs.com and use
// HTTPS; the cxs call uses redirect:'error' so a server-side redirect can't
// bounce off-host. A tracked_companies entry can also set
// `provider: workday` explicitly to bypass detection.

const WD_HOST_RE = /^([a-z0-9][a-z0-9-]*)\.(wd\d+)\.myworkdayjobs\.com$/;
const WD_LOCALE_RE = /^[a-z]{2}-[A-Za-z]{2}$/;  // e.g. en-US, en-GB
const WD_PAGE_SIZE = 20;   // Workday cxs caps `limit` at 20 on most tenants
const WD_MAX_PAGES = 50;   // safety cap (1000 postings) to keep a scan bounded

// Parse a careers_url into { host, tenant, site } or null if it isn't a
// recognisable Workday board URL.
function parseWorkday(rawUrl) {
  const raw = typeof rawUrl === 'string' ? rawUrl : '';
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const m = parsed.hostname.match(WD_HOST_RE);
  if (!m) return null;
  const tenant = m[1];
  // The site id is the first path segment that isn't a locale (e.g. en-US).
  const site = parsed.pathname.split('/').filter(Boolean).find(s => !WD_LOCALE_RE.test(s));
  if (!site) return null;
  return { host: parsed.hostname, tenant, site };
}

function cxsUrl({ host, tenant, site }) {
  return `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
}

function assertWorkdayUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`workday: invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`workday: URL must use HTTPS: ${url}`);
  if (!WD_HOST_RE.test(parsed.hostname)) {
    throw new Error(`workday: untrusted hostname "${parsed.hostname}" — must match <tenant>.<wdN>.myworkdayjobs.com`);
  }
  return url;
}

/**
 * Parse a Workday cxs /jobs response. Exported for unit tests.
 *
 * Workday returns:
 *   { total: N, jobPostings: [{ title, externalPath, locationsText, postedOn }] }
 *
 * - url: the public posting URL is `https://<host>/en-US/<site><externalPath>`
 *   (Workday serves the same page with or without the /en-US locale prefix).
 *   Postings without an externalPath are dropped (empty url → filtered out).
 * - location: `locationsText` (e.g. "Chicago, IL" or "2 Locations").
 *
 * @param {any} json
 * @param {{host: string, tenant: string, site: string}} info
 * @param {string} companyName
 * @returns {Array<{title: string, url: string, company: string, location: string}>}
 */
export function parseWorkdayResponse(json, info, companyName) {
  const posts = Array.isArray(json?.jobPostings) ? json.jobPostings : [];
  return posts
    .map((p) => {
      const ext = typeof p.externalPath === 'string' ? p.externalPath.trim() : '';
      const url = ext ? `https://${info.host}/en-US/${info.site}${ext}` : '';
      return {
        title: String(p.title || '').trim(),
        url,
        company: companyName,
        location: String(p.locationsText || '').trim(),
      };
    })
    .filter((j) => j.title && j.url);
}

/** @type {Provider} */
export default {
  id: 'workday',

  detect(entry) {
    const info = parseWorkday(entry.careers_url || '');
    return info ? { url: cxsUrl(info) } : null;
  },

  async fetch(entry, ctx) {
    const info = parseWorkday(entry.careers_url || '');
    if (!info) throw new Error(`workday: cannot derive cxs URL for ${entry.name}`);
    const url = cxsUrl(info);
    assertWorkdayUrl(url);

    const all = [];
    for (let page = 0; page < WD_MAX_PAGES; page++) {
      const body = JSON.stringify({
        appliedFacets: {},
        limit: WD_PAGE_SIZE,
        offset: page * WD_PAGE_SIZE,
        searchText: '',
      });
      const json = await ctx.fetchJson(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body,
        redirect: 'error',
      });
      const parsed = parseWorkdayResponse(json, info, entry.name);
      if (parsed.length === 0) break;
      all.push(...parsed);
      const total = Number(json?.total) || 0;
      if (total > 0 && all.length >= total) break;  // got everything
      if (parsed.length < WD_PAGE_SIZE) break;        // short page = last page
    }
    return all;
  },
};
