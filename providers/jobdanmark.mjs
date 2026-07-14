// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import {
  cleanText,
  ensureHttpsUrl,
  positiveInt,
  toEpochMs,
} from './_job-board-utils.mjs';

const BASE_URL = 'https://jobdanmark.dk';
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 60;

export function buildJobdanmarkRequest(entry = {}) {
  const filters = [];
  if (entry.text) filters.push({ type: 'freetext', value: String(entry.text), displayText: String(entry.text) });
  if (entry.municipality) filters.push({ type: 'municipality', value: String(entry.municipality), displayText: String(entry.municipality) });
  if (entry.region) filters.push({ type: 'region', value: String(entry.region), displayText: String(entry.region) });

  const jobTypes = entry.job_type
    ? String(entry.job_type).split(',').map((v) => v.trim()).filter(Boolean)
    : [];

  if (filters.length === 0 && jobTypes.length === 0) {
    throw new Error('jobdanmark: at least one of text, municipality, region, or job_type is required');
  }

  return {
    url: `${BASE_URL}/api/jobsearch/search/${positiveInt(entry.page, 1, { min: 1, max: 100 })}`,
    body: {
      jobTypes,
      filters,
      locationMode: 'Text',
      distance: positiveInt(entry.radius, 50, { min: 1, max: 300 }),
    },
  };
}

export function parseJobdanmarkSearchResponse(json) {
  const rows = Array.isArray(json?.items) ? json.items : [];
  return rows
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const title = cleanText(item.title);
      if (!title) return null;

      const rawUrl = typeof item.url === 'string' && item.url.startsWith('http')
        ? item.url
        : `${BASE_URL}${item.url || ''}`;
      const url = ensureHttpsUrl(rawUrl, { hostnames: ['jobdanmark.dk'] });
      if (!url) return null;

      const postedAt = toEpochMs(item.publishedDate);
      const job = {
        title,
        url,
        company: cleanText(item.companyName),
        location: cleanText(item.companyAddress),
      };
      if (postedAt !== undefined) job.postedAt = postedAt;
      return job;
    })
    .filter(Boolean);
}

/** @type {Provider} */
export default {
  id: 'jobdanmark',

  async fetch(entry, ctx) {
    const { url, body } = buildJobdanmarkRequest(entry);
    const json = await ctx.fetchJson(url, {
      method: 'POST',
      redirect: 'follow',
      timeoutMs: 20_000,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const limit = positiveInt(entry?.limit, DEFAULT_LIMIT, { min: 1, max: MAX_LIMIT });
    return parseJobdanmarkSearchResponse(json).slice(0, limit);
  },
};
