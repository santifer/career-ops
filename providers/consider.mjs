// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Consider provider — portfolio job boards such as a16z, Sequoia, Balderton,
// and Phoenix Court expose a public JSON endpoint at /api-boards/search-jobs.
// The board id is available in the initial `window.serverInitialData` payload.

const DEFAULT_PAGE_SIZE = 50;
const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
  accept: 'text/html,application/xhtml+xml',
};

function assertHttpsUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`consider: invalid URL: ${value}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`consider: URL must use HTTPS: ${value}`);
  return parsed.href;
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validHttpUrl(value, baseUrl) {
  try {
    const parsed = new URL(value, baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

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
  detect() {
    return null;
  },

  async fetch(entry, ctx) {
    const pageUrl = assertHttpsUrl(entry.careers_url);
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
