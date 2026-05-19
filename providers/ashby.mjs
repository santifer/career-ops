/**
 * providers/ashby.mjs — Ashby ATS provider for scan.mjs.
 *
 * Ashby public posting API is zero-token.
 * Endpoint: api.ashbyhq.com/posting-api/job-board/{board}
 * Optional: ?includeCompensation=true (adds comp bands to each posting)
 *
 * NOTE: The Ashby public board URL slug (jobs.ashbyhq.com/{board}) is not always
 * the same as the API slug. E.g. Cognition's front-end slug is 'cognition-ai' but
 * their API slug is 'cognition'. Always use the `api` field in portals.yml if set
 * (confirmed by EPSILON Ε.7 adversarial review 2026-05-19).
 *
 * Provider contract:
 *   id: 'ashby'
 *   detect(entry): {url} | null
 *   fetch(entry, ctx): [{title, url, company, location}]
 */

import { makeHttpCtx } from './_http.mjs';

const ASHBY_JOBS_RE = /jobs\.ashbyhq\.com\/([\w-]+)/i;
const ASHBY_API_RE  = /api\.ashbyhq\.com\/posting-api\/job-board\/([\w-]+)/i;

function extractApiUrl(entry) {
  // Prefer explicit api field (may already be the API URL).
  if (entry.api) {
    const m = entry.api.match(ASHBY_API_RE);
    if (m) return `https://api.ashbyhq.com/posting-api/job-board/${m[1]}?includeCompensation=true`;
    // If api field is not a known pattern, use as-is.
    return entry.api.includes('?') ? entry.api : `${entry.api}?includeCompensation=true`;
  }
  // Derive from careers_url (front-end slug).
  const careersUrl = entry.careers_url || '';
  const m = careersUrl.match(ASHBY_JOBS_RE);
  if (m) return `https://api.ashbyhq.com/posting-api/job-board/${m[1]}?includeCompensation=true`;
  return null;
}

/**
 * Ashby API response shape:
 *   { jobs: [{ id, title, jobUrl, isListed, publishedDate, location: {name},
 *              department: {name}, team: {name} }] }
 */
function parseJobs(data, companyName) {
  const raw = Array.isArray(data?.jobs) ? data.jobs : [];
  return raw
    .filter(job => job.isListed !== false)
    .map(job => ({
      title: job.title || '',
      url: job.jobUrl || '',
      company: companyName,
      location: job.location?.name || '',
    }));
}

const ashby = {
  id: 'ashby',

  detect(entry) {
    const apiUrl     = entry.api          || '';
    const careersUrl = entry.careers_url  || '';
    if (ASHBY_JOBS_RE.test(careersUrl) || ASHBY_API_RE.test(apiUrl)) {
      const url = extractApiUrl(entry);
      return url ? { url } : null;
    }
    return null;
  },

  async fetch(entry, ctx = makeHttpCtx()) {
    const apiUrl = extractApiUrl(entry);
    if (!apiUrl) throw new Error(`ashby: cannot determine API URL for "${entry.name}"`);

    const res = await ctx.fetch(apiUrl, {
      signal: AbortSignal.timeout(ctx.timeoutMs || 8000),
      headers: { ...ctx.headers, 'Accept': 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`ashby: HTTP ${res.status} from ${apiUrl}`);
    }

    const data = await res.json();
    return parseJobs(data, entry.name || 'Unknown');
  },
};

export default ashby;
