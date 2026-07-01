// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import {
  assertHttpsUrl,
  BROWSER_HEADERS,
  cleanString,
  validHttpUrl,
} from './_http-utils.mjs';

// Consider provider — portfolio job boards such as a16z, Sequoia, Balderton,
// and Phoenix Court expose a public JSON endpoint at /api-boards/search-jobs.
// The board id is available in the initial `window.serverInitialData` payload.

const DEFAULT_PAGE_SIZE = 50;

function clampPageSize(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  return Math.min(50, Math.max(1, Math.trunc(n)));
}

/**
 * @param {string} html
 * @returns {any}
 */
export function parseConsiderInitialData(html) {
  if (typeof html !== 'string') return null;
  const match = html.match(/window\.serverInitialData = (\{[\s\S]*?\});\s*<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function considerSalary(job) {
  const salary = job?.salary;
  if (!salary || typeof salary !== 'object') return null;
  const period = cleanString(salary?.period?.value || salary?.period?.label).toLowerCase();
  if (period && period !== 'year') return null;
  const min = Number(salary?.minValue);
  const max = Number(salary?.maxValue);
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);
  if (!hasMin && !hasMax) return null;
  return {
    min: hasMin ? min : null,
    max: hasMax ? max : null,
    currency: cleanString(salary?.currency?.value || salary?.currency?.label),
  };
}

function flattenConsiderJobs(json) {
  const jobs = json?.jobs;
  if (!Array.isArray(jobs)) return [];
  const out = [];
  for (const item of jobs) {
    if (Array.isArray(item?.jobs)) {
      for (const child of item.jobs) {
        out.push({
          ...child,
          companyName: cleanString(child?.companyName) || cleanString(item?.company?.name),
          companySlug: cleanString(child?.companySlug) || cleanString(item?.company?.slug),
        });
      }
    } else {
      out.push(item);
    }
  }
  return out;
}

/**
 * @param {any} json
 * @param {string} boardUrl
 * @param {string} fallbackCompany
 * @returns {Array<{title: string, url: string, company: string, location: string, salary?: {min: number|null, max: number|null, currency: string}}>}
 */
export function parseConsiderJobsResponse(json, boardUrl = 'https://example.com/', fallbackCompany = 'Consider') {
  return flattenConsiderJobs(json)
    .map((job) => {
      const title = cleanString(job?.title);
      const url = validHttpUrl(job?.url || job?.applyUrl, boardUrl);
      const company = cleanString(job?.companyName) || cleanString(job?.company?.name) || fallbackCompany;
      const locations = Array.isArray(job?.locations)
        ? job.locations.filter((l) => typeof l === 'string' && l.trim()).map((l) => l.trim())
        : [];
      if (job?.remote === true && !locations.some((l) => /^remote$/i.test(l))) locations.push('Remote');
      if (job?.hybrid === true && !locations.some((l) => /^hybrid$/i.test(l))) locations.push('Hybrid');
      const salary = considerSalary(job);
      return salary
        ? { title, url, company, location: locations.join(', '), salary }
        : { title, url, company, location: locations.join(', ') };
    })
    .filter((job) => job.title && job.url);
}

/** @type {Provider} */
export default {
  id: 'consider',

  // Consider boards use many custom domains. Require explicit `provider:
  // consider` so an arbitrary page is never guessed as a Consider board.
  detect(entry) {
    if (entry?.provider !== 'consider') return null;
    const raw = typeof entry.careers_url === 'string' ? entry.careers_url : '';
    if (!raw) return null;
    try {
      return { url: assertHttpsUrl(raw, 'consider') };
    } catch {
      return null;
    }
  },

  async fetch(entry, ctx) {
    const pageUrl = assertHttpsUrl(entry.careers_url, 'consider');
    const page = new URL(pageUrl);
    const html = await ctx.fetchText(pageUrl, { redirect: 'follow', headers: BROWSER_HEADERS });
    const initial = parseConsiderInitialData(html);
    const boardId = cleanString(entry.consider?.board_id || entry.consider?.board || initial?.board?.id || initial?.fixedBoard);
    if (!boardId) throw new Error('consider: cannot derive board id from initial page data');

    const payload = {
      meta: { size: clampPageSize(entry.limit) },
      board: { id: boardId, isParent: initial?.board?.isParent !== false },
      query: entry.query && typeof entry.query === 'object' ? entry.query : {},
      grouped: false,
    };

    const json = await ctx.fetchJson(`${page.origin}/api-boards/search-jobs`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: page.origin,
        referer: pageUrl,
      },
      body: JSON.stringify(payload),
    });
    return parseConsiderJobsResponse(json, pageUrl, entry.name || 'Consider');
  },
};
