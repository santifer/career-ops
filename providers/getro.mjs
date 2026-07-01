// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Getro provider — portfolio job boards such as Speedinvest, Atomico, Khosla,
// and Backed render Next.js pages whose `__NEXT_DATA__` payload includes
// `props.pageProps.initialState.jobs.found`.

const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
  accept: 'text/html,application/xhtml+xml',
};

function assertHttpsUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`getro: invalid URL: ${value}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`getro: URL must use HTTPS: ${value}`);
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

function getroSalary(job) {
  const period = cleanString(job?.compensationPeriod).toLowerCase();
  if (period && period !== 'year') return null;
  const minCents = Number(job?.compensationAmountMinCents);
  const maxCents = Number(job?.compensationAmountMaxCents);
  const min = Number.isFinite(minCents) ? minCents / 100 : null;
  const max = Number.isFinite(maxCents) ? maxCents / 100 : null;
  if (min == null && max == null) return null;
  return {
    min,
    max,
    currency: cleanString(job?.compensationCurrency),
  };
}

/**
 * @param {string} html
 * @param {string} pageUrl
 * @param {string} fallbackCompany
 * @returns {Array<{title: string, url: string, company: string, location: string, salary?: {min: number|null, max: number|null, currency: string}}>}
 */
export function parseGetroJobsPage(html, pageUrl = 'https://example.com/jobs', fallbackCompany = 'Getro') {
  if (typeof html !== 'string') return [];
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return [];

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const jobs = data?.props?.pageProps?.initialState?.jobs?.found;
  if (!Array.isArray(jobs)) return [];

  return jobs
    .map((job) => {
      const title = cleanString(job?.title);
      const url = validHttpUrl(job?.url, pageUrl);
      const company = cleanString(job?.organization?.name) || fallbackCompany;
      const locations = Array.isArray(job?.locations)
        ? job.locations.filter((l) => typeof l === 'string' && l.trim()).map((l) => l.trim())
        : [];
      const location = locations.length > 0
        ? locations.join(', ')
        : (Array.isArray(job?.searchableLocations) ? job.searchableLocations.filter(Boolean).join(', ') : '');
      const salary = getroSalary(job);
      return salary ? { title, url, company, location, salary } : { title, url, company, location };
    })
    .filter((job) => job.title && job.url);
}

/** @type {Provider} */
export default {
  id: 'getro',

  // Generic Getro boards use custom domains, so require explicit
  // `provider: getro` in portals.yml instead of guessing from hostname.
  detect() {
    return null;
  },

  async fetch(entry, ctx) {
    const url = assertHttpsUrl(entry.careers_url);
    const html = await ctx.fetchText(url, { redirect: 'follow', headers: BROWSER_HEADERS });
    return parseGetroJobsPage(html, url, entry.name || 'Getro');
  },
};
