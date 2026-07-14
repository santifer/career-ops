// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import {
  cleanText,
  positiveInt,
  toEpochMs,
} from './_job-board-utils.mjs';

const BASE_URL = 'https://jobnet.dk/bff';
const PUBLIC_BASE_URL = 'https://job.jobnet.dk/CV/FindWork/Details';
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export function buildJobnetSearchUrl(entry = {}) {
  const params = new URLSearchParams({
    resultsPerPage: String(positiveInt(entry.per_page, entry.limit || DEFAULT_LIMIT, { min: 1, max: MAX_LIMIT })),
    pageNumber: String(positiveInt(entry.page, 1, { min: 1, max: 100 })),
    orderType: String(entry.order || 'PublicationDate'),
  });

  if (entry.search_string) params.set('searchString', String(entry.search_string));
  if (entry.region) params.set('regions', String(entry.region));
  if (entry.work_hours) params.set('workHoursType', String(entry.work_hours));
  if (entry.duration) params.set('employmentDurationType', String(entry.duration));
  if (entry.job_type) params.set('jobAnnouncementType', String(entry.job_type));
  if (entry.postal_code) {
    params.set('postalCode', String(entry.postal_code));
    params.set('kmRadius', String(positiveInt(entry.radius, 50, { min: 1, max: 300 })));
  }

  return `${BASE_URL}/FindJob/Search?${params.toString()}`;
}

export function parseJobnetSearchResponse(json) {
  const rows = Array.isArray(json?.jobAds) ? json.jobAds : [];
  return rows
    .map((job) => {
      if (!job || typeof job !== 'object') return null;
      const title = cleanText(job.title);
      const id = cleanText(job.jobAdId);
      if (!title || !id) return null;

      const city = cleanText(job.municipality || job.postalDistrictName || '');
      const country = cleanText(job.country || '');
      const location = [city, country].filter(Boolean).join(', ');
      const postedAt = toEpochMs(job.publicationDate);
      const out = {
        title,
        url: `${PUBLIC_BASE_URL}/${encodeURIComponent(id)}`,
        company: cleanText(job.hiringOrgName),
        location,
      };
      if (postedAt !== undefined) out.postedAt = postedAt;
      return out;
    })
    .filter(Boolean);
}

/** @type {Provider} */
export default {
  id: 'jobnet',

  async fetch(entry, ctx) {
    const json = await ctx.fetchJson(buildJobnetSearchUrl(entry), {
      redirect: 'follow',
      timeoutMs: 20_000,
      headers: { 'x-csrf': '1' },
    });
    const limit = positiveInt(entry?.limit, DEFAULT_LIMIT, { min: 1, max: MAX_LIMIT });
    return parseJobnetSearchResponse(json).slice(0, limit);
  },
};
