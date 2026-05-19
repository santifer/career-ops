/**
 * providers/lever.mjs — Lever ATS provider for scan.mjs.
 *
 * Lever public postings API is zero-token.
 * Endpoint: api.lever.co/v0/postings/{board}?mode=json
 *
 * Provider contract:
 *   id: 'lever'
 *   detect(entry): {url} | null
 *   fetch(entry, ctx): [{title, url, company, location}]
 */

import { makeHttpCtx } from './_http.mjs';

const LEVER_JOBS_RE = /jobs\.lever\.co\/([\w-]+)/i;
const LEVER_API_RE  = /api\.lever\.co\/v0\/postings\/([\w-]+)/i;

function extractApiUrl(entry) {
  if (entry.api) {
    const m = entry.api.match(LEVER_API_RE);
    if (m) return `https://api.lever.co/v0/postings/${m[1]}?mode=json`;
    return entry.api.includes('mode=') ? entry.api : `${entry.api}?mode=json`;
  }
  const careersUrl = entry.careers_url || '';
  const m = careersUrl.match(LEVER_JOBS_RE);
  if (m) return `https://api.lever.co/v0/postings/${m[1]}?mode=json`;
  return null;
}

/**
 * Lever API response shape (mode=json):
 *   [{ id, text (=title), hostedUrl, categories: { location, team, department } }]
 */
function parseJobs(data, companyName) {
  const raw = Array.isArray(data) ? data : [];
  return raw.map(posting => ({
    title: posting.text || '',
    url: posting.hostedUrl || '',
    company: companyName,
    location: posting.categories?.location || '',
  }));
}

const lever = {
  id: 'lever',

  detect(entry) {
    const apiUrl     = entry.api          || '';
    const careersUrl = entry.careers_url  || '';
    if (LEVER_JOBS_RE.test(careersUrl) || LEVER_API_RE.test(apiUrl)) {
      const url = extractApiUrl(entry);
      return url ? { url } : null;
    }
    return null;
  },

  async fetch(entry, ctx = makeHttpCtx()) {
    const apiUrl = extractApiUrl(entry);
    if (!apiUrl) throw new Error(`lever: cannot determine API URL for "${entry.name}"`);

    const res = await ctx.fetch(apiUrl, {
      signal: AbortSignal.timeout(ctx.timeoutMs || 8000),
      headers: { ...ctx.headers, 'Accept': 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`lever: HTTP ${res.status} from ${apiUrl}`);
    }

    const data = await res.json();
    return parseJobs(data, entry.name || 'Unknown');
  },
};

export default lever;
