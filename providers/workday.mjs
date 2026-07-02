// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Workday provider — hits the public CXS jobs endpoint (POST, paginated).
// Auto-detects from careers_url pattern
// `https://<tenant>.<instance>.myworkdayjobs.com[/<locale>]/<site>`,
// e.g. https://23andme.wd5.myworkdayjobs.com/23 →
//      POST https://23andme.wd5.myworkdayjobs.com/wday/cxs/23andme/23/jobs
//
// Workday only exposes a relative "postedOn" label ("Posted Today",
// "Posted 5 Days Ago", "Posted 30+ Days Ago"); postedAt is derived from it
// and omitted for the unbounded "30+ Days Ago" form.

const PAGE_SIZE = 20;

// Safety cap on pagination — applied regardless of what the upstream reports
// as `total` (or, when `total` is absent, regardless of how many full pages
// keep coming back), so a misbehaving/compromised API can't drive this into
// fetching an unbounded number of pages. Override with `max_pages` on the
// portal entry for a tenant that genuinely exceeds it.
const DEFAULT_MAX_PAGES = 50;
const MAX_PAGES_CAP = 500;

/** Resolve the page cap: a positive integer `max_pages` on the entry, capped. */
function resolveMaxPages(entry) {
  const v = entry?.max_pages;
  if (Number.isInteger(v) && v > 0) return Math.min(v, MAX_PAGES_CAP);
  return DEFAULT_MAX_PAGES;
}

function resolveEndpoint(entry) {
  const url = entry.careers_url || '';
  const m = url.match(/^https:\/\/([\w-]+)\.(wd[\w-]*)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)/);
  if (!m) return null;
  const [, tenant, instance, site] = m;
  const origin = `https://${tenant}.${instance}.myworkdayjobs.com`;
  return {
    api: `${origin}/wday/cxs/${tenant}/${site}/jobs`,
    // externalPath is relative to the site, not the host root — without the
    // site segment the URL 404s.
    jobBase: `${origin}/${site}`,
  };
}

function parsePostedOn(label) {
  if (!label) return undefined;
  if (/posted\s+today/i.test(label)) return Date.now();
  if (/posted\s+yesterday/i.test(label)) return Date.now() - 86_400_000;
  const m = label.match(/posted\s+(\d+)(\+?)\s*day/i);
  if (!m || m[2] === '+') return undefined; // "30+ Days Ago" — unbounded, no usable date
  return Date.now() - Number(m[1]) * 86_400_000;
}

// Workday URL path encodes location as /job/{Location-Slug}/{title-slug}.
// Use it as fallback when locationsText is absent (common on some tenants).
function locationFromPath(externalPath) {
  const m = String(externalPath || '').match(/\/job\/([^/]+)\//);
  return m ? decodeURIComponent(m[1]).replace(/-/g, ' ') : '';
}

export function parseWorkdayResponse(json, entry) {
  const ep = resolveEndpoint(entry);
  const jobBase = ep?.jobBase || '';
  const postings = Array.isArray(json?.jobPostings) ? json.jobPostings : [];
  const jobs = [];
  for (const j of postings) {
    if (j == null) continue;
    if (!j.externalPath || !String(j.title || '').trim()) continue;
    jobs.push({
      title: j.title || '',
      url: jobBase + j.externalPath,
      company: entry.name,
      location: j.locationsText || locationFromPath(j.externalPath),
      postedAt: parsePostedOn(j.postedOn),
    });
  }
  return jobs;
}

/** @type {Provider} */
export default {
  id: 'workday',

  detect(entry) {
    const ep = resolveEndpoint(entry);
    return ep ? { url: ep.api } : null;
  },

  async fetch(entry, ctx) {
    const ep = resolveEndpoint(entry);
    if (!ep) throw new Error(`workday: cannot derive CXS endpoint for ${entry.name}`);

    const postOpts = { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', accept: 'application/json' } };
    const makeBody = (offset) => JSON.stringify({ limit: PAGE_SIZE, offset, searchText: '', appliedFacets: {} });

    const first = await ctx.fetchJson(ep.api, { ...postOpts, body: makeBody(0) });
    const jobs = parseWorkdayResponse(first, entry);

    const total = typeof first?.total === 'number' ? first.total : null;
    const firstPostings = Array.isArray(first?.jobPostings) ? first.jobPostings : [];
    const maxPages = resolveMaxPages(entry);

    // How many pages to fetch in total (including the first, already-fetched
    // one): bounded by `total` when the server reports it, always capped at
    // maxPages. When `total` is absent, only probe further pages if the first
    // one was full — a short first page already means there's nothing more.
    const pagesToFetch = total !== null
      ? Math.min(Math.ceil(total / PAGE_SIZE), maxPages)
      : (firstPostings.length >= PAGE_SIZE ? maxPages : 1);

    // Sequential, not concurrent (mirrors providers/4dayweek.mjs, thehub.mjs,
    // arbeitnow.mjs, jibeapply.mjs) — a single tenant's API has no reason to
    // receive a burst of parallel requests, and a mid-run failure stops
    // cleanly with whatever pages were already gathered instead of
    // discarding them (Promise.all would fail the whole batch on one error).
    let page = 1;
    for (; page < pagesToFetch; page++) {
      let json;
      try {
        json = await ctx.fetchJson(ep.api, { ...postOpts, body: makeBody(page * PAGE_SIZE) });
      } catch (err) {
        console.error(`⚠️  workday: ${entry.name} page ${page + 1} fetch failed — ${err.message} (returning ${jobs.length} jobs fetched so far)`);
        break;
      }
      jobs.push(...parseWorkdayResponse(json, entry));
      if (total === null) {
        const postings = Array.isArray(json?.jobPostings) ? json.jobPostings : [];
        if (postings.length < PAGE_SIZE) break; // short page → last page reached
      }
    }

    // The cap is silent by design (it's a safety net, not a working limit),
    // but a tenant that actually exceeds it needs to be surfaced — otherwise
    // the user has no way to notice postings are missing from their scan.
    const truncated = total !== null
      ? Math.ceil(total / PAGE_SIZE) > maxPages
      : page === pagesToFetch && pagesToFetch === maxPages;
    if (truncated) {
      console.error(
        `⚠️  workday: ${entry.name} has more postings than max_pages allows ` +
        `(fetched ${jobs.length}${total !== null ? ` of ${total}` : ''}) — ` +
        `set max_pages on this portal entry to raise the cap (current: ${maxPages})`,
      );
    }

    return jobs;
  },
};
