// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import {
  BROWSER_HEADERS,
  cleanText,
  decodeEntities,
  ensureHttpsUrl,
  positiveInt,
  requireSearchValue,
  stripTags,
  toEpochMs,
} from './_job-board-utils.mjs';

const SEARCH_URL = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

function jobageToTPR(days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0 || n >= 9999) return null;
  return `r${Math.floor(n) * 86400}`;
}

function workTypeFlag(mode) {
  switch (String(mode || '').toLowerCase()) {
    case 'remote':
      return '2';
    case 'hybrid':
      return '3';
    case 'onsite':
    case 'on-site':
      return '1';
    default:
      return null;
  }
}

export function buildLinkedInSearchUrl(entry = {}) {
  const params = new URLSearchParams();
  if (entry.query) params.set('keywords', String(entry.query));
  params.set('location', requireSearchValue(entry, 'location', 'linkedin'));

  const tpr = jobageToTPR(entry.jobage);
  if (tpr) params.set('f_TPR', tpr);

  const wt = workTypeFlag(entry.remote);
  if (wt) params.set('f_WT', wt);

  const page = positiveInt(entry.page, 1, { min: 1, max: 100 });
  params.set('start', String((page - 1) * 10));

  return `${SEARCH_URL}?${params.toString()}`;
}

export function parseLinkedInSearchResults(html) {
  if (typeof html !== 'string' || !html.trim()) return [];
  const out = [];
  const chunks = html.split(/data-entity-urn="urn:li:jobPosting:/).slice(1);

  for (const chunk of chunks) {
    const id = chunk.match(/^(\d+)/)?.[1];
    if (!id) continue;

    const linkMatch = chunk.match(/class="base-card__full-link[^"]*"[^>]*href="([^"]+)"/i);
    const url = ensureHttpsUrl((linkMatch ? decodeEntities(linkMatch[1]).split('?')[0] : '') || `https://www.linkedin.com/jobs/view/${id}`);
    if (!url) continue;

    const titleHtml =
      chunk.match(/class="base-search-card__title"[^>]*>([\s\S]*?)<\/h3>/i)?.[1]
      ?? chunk.match(/class="sr-only"[^>]*>([\s\S]*?)<\/span>/i)?.[1]
      ?? '';
    const title = stripTags(titleHtml);
    if (!title) continue;

    const subtitle = chunk.match(/class="base-search-card__subtitle"[^>]*>([\s\S]*?)<\/h4>/i)?.[1] ?? '';
    const company = stripTags(subtitle);
    const location = stripTags(chunk.match(/class="job-search-card__location"[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? '');
    const date = chunk.match(/class="job-search-card__listdate[^"]*"[^>]*datetime="([^"]+)"/i)?.[1] ?? '';
    const postedAt = toEpochMs(date);

    const job = {
      title,
      url,
      company,
      location,
    };
    if (postedAt !== undefined) job.postedAt = postedAt;
    out.push(job);
  }

  return out;
}

/** @type {Provider} */
export default {
  id: 'linkedin',

  async fetch(entry, ctx) {
    const url = buildLinkedInSearchUrl(entry);
    const html = await ctx.fetchText(url, {
      redirect: 'follow',
      timeoutMs: 20_000,
      headers: {
        ...BROWSER_HEADERS,
        'x-requested-with': 'XMLHttpRequest',
      },
    });
    const limit = positiveInt(entry?.limit, DEFAULT_LIMIT, { min: 1, max: MAX_LIMIT });
    return parseLinkedInSearchResults(html).slice(0, limit);
  },
};
