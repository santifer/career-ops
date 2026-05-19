/**
 * providers/greenhouse.mjs — Greenhouse ATS provider for scan.mjs.
 *
 * Greenhouse boards API (v1) is public and zero-token.
 * Structured JSON endpoint: boards-api.greenhouse.io/v1/boards/{board}/jobs
 * EU variant: boards-api.eu.greenhouse.io/v1/boards/{board}/jobs
 *
 * Provider contract:
 *   id: 'greenhouse'
 *   detect(entry): {url} | null   — matches boards-api / boards / job-boards host
 *   fetch(entry, ctx): [{title, url, company, location}]
 */

import { makeHttpCtx } from './_http.mjs';

const BOARD_RE = /(?:boards-api|boards|job-boards)\.(?:eu\.)?greenhouse\.io\//i;
const SLUG_RE  = /greenhouse\.io\/(?:v1\/boards\/)?([\w-]+)/i;

function extractBoard(url) {
  const m = url.match(SLUG_RE);
  return m ? m[1] : null;
}

function buildApiUrl(board) {
  return `https://boards-api.greenhouse.io/v1/boards/${board}/jobs`;
}

/**
 * Greenhouse API response shape:
 *   { jobs: [{ id, title, absolute_url, offices: [{name}], departments: [{name}] }] }
 */
function parseJobs(data, companyName) {
  const raw = Array.isArray(data?.jobs) ? data.jobs : [];
  return raw.map(job => {
    const location = (job.offices?.[0]?.name) || '';
    return {
      title: job.title || '',
      url: job.absolute_url || `https://boards.greenhouse.io/${companyName}`,
      company: companyName,
      location,
    };
  });
}

const greenhouse = {
  id: 'greenhouse',

  detect(entry) {
    const apiUrl   = entry.api          || '';
    const careersUrl = entry.careers_url || '';

    if (BOARD_RE.test(apiUrl) || BOARD_RE.test(careersUrl)) {
      const src = apiUrl || careersUrl;
      const board = extractBoard(src);
      const url = board ? buildApiUrl(board) : src;
      return { url };
    }
    return null;
  },

  async fetch(entry, ctx = makeHttpCtx()) {
    // Prefer the explicit `api` field; fall back to deriving from careers_url.
    let apiUrl = entry.api || '';
    if (!apiUrl) {
      const careersUrl = entry.careers_url || '';
      const board = extractBoard(careersUrl);
      if (!board) throw new Error(`greenhouse: cannot determine board slug from "${careersUrl}"`);
      apiUrl = buildApiUrl(board);
    }

    const res = await ctx.fetch(apiUrl, {
      signal: AbortSignal.timeout(ctx.timeoutMs || 8000),
      headers: { ...ctx.headers, 'Accept': 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`greenhouse: HTTP ${res.status} from ${apiUrl}`);
    }

    const data = await res.json();
    return parseJobs(data, entry.name || 'Unknown');
  },
};

export default greenhouse;
