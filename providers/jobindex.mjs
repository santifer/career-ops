// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import {
  BROWSER_HEADERS,
  cleanText,
  ensureHttpsUrl,
  positiveInt,
  requireSearchValue,
  toEpochMs,
} from './_job-board-utils.mjs';

const BASE_URL = 'https://www.jobindex.dk';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 60;

export function extractJobindexStash(html) {
  const marker = 'var Stash = ';
  const start = String(html || '').indexOf(marker);
  if (start === -1) throw new Error('jobindex: could not locate Stash blob');

  const open = start + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let i = open; i < html.length; i += 1) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === '{') {
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end === -1) throw new Error('jobindex: unterminated Stash blob');
  return JSON.parse(html.slice(open, end));
}

function findSearchResponse(node) {
  if (!node || typeof node !== 'object') return null;
  if (!Array.isArray(node) && node.searchResponse && Array.isArray(node.searchResponse.results)) {
    return node.searchResponse;
  }
  for (const value of Array.isArray(node) ? node : Object.values(node)) {
    const found = findSearchResponse(value);
    if (found) return found;
  }
  return null;
}

export function parseJobindexSearchPage(html) {
  const searchResponse = findSearchResponse(extractJobindexStash(html));
  if (!searchResponse) throw new Error('jobindex: could not locate searchResponse in Stash');

  return (searchResponse.results || [])
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const title = cleanText(row.headline || '');
      if (!title) return null;

      const id = typeof row.tid === 'string' ? row.tid.trim() : '';
      const rawUrl = id ? `${BASE_URL}/jobannonce/${id}` : row.share_url || row.url || '';
      const url = ensureHttpsUrl(rawUrl, { hostnames: ['www.jobindex.dk'] });
      if (!url) return null;

      const company = cleanText(row.company?.name || row.companytext || '');
      const location = cleanText(row.area || row.geojson?.features?.[0]?.properties?.title || '');
      const postedAt = toEpochMs(row.firstdate);

      const job = { title, url, company, location };
      if (postedAt !== undefined) job.postedAt = postedAt;
      return job;
    })
    .filter(Boolean);
}

export function buildJobindexSearchUrl(entry = {}) {
  const params = new URLSearchParams({
    q: requireSearchValue(entry, 'query', 'jobindex'),
    page: String(positiveInt(entry.page, 1, { min: 1, max: 100 })),
    jobage: String(positiveInt(entry.jobage, 9999, { min: 1, max: 9999 })),
    sort: String(entry.sort || 'score'),
  });
  return `${BASE_URL}/jobsoegning?${params.toString()}`;
}

/** @type {Provider} */
export default {
  id: 'jobindex',

  async fetch(entry, ctx) {
    const html = await ctx.fetchText(buildJobindexSearchUrl(entry), {
      redirect: 'follow',
      timeoutMs: 20_000,
      headers: BROWSER_HEADERS,
    });
    const limit = positiveInt(entry?.limit, DEFAULT_LIMIT, { min: 1, max: MAX_LIMIT });
    return parseJobindexSearchPage(html).slice(0, limit);
  },
};
