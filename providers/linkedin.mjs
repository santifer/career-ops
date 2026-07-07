// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// LinkedIn provider — hits the public guest job-search endpoint (no auth, no
// cookies). Returns HTML fragments parsed in-process with regex (no external
// dependency). Paginated in steps of 10 results.
//
// Configure via a `job_boards` entry with `provider: linkedin` and a
// `linkedin:` config block:
//
//   - name: LinkedIn — Data Germany
//     provider: linkedin
//     linkedin:
//       keywords: "Data Scientist OR Data Engineer"
//       geoId: "101282230"    # Germany (numeric LinkedIn geo identifier)
//       location: "Germany"   # optional text fallback when geoId unknown
//       f_TPR: "r604800"     # time posted: r86400=24h, r604800=week, r2592000=month
//       f_JT: "F"            # job type: F=Full-time, P=Part-time, C=Contract
//       f_WT: ""             # workplace: 1=On-site, 2=Remote, 3=Hybrid
//       f_E: ""              # experience: 1-6 (Intern..Executive)
//       max_pages: 10        # pagination cap (10 per page, default 10 = 100 jobs)
//     enabled: true

const SEARCH_BASE = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const TRUSTED_HOST_RE = /^[a-z]{2,3}\.linkedin\.com$/;
const PER_PAGE = 10; // guest API returns 10 per page (not 25 as some docs claim)
const DEFAULT_MAX_PAGES = 10;
const MAX_PAGES_CAP = 40;
const INTER_PAGE_DELAY_MS = 3000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 2000;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
];

function pickUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveMaxPages(entry) {
  const cfg = entry?.linkedin;
  const v = cfg?.max_pages;
  if (Number.isInteger(v) && v > 0) return Math.min(v, MAX_PAGES_CAP);
  return DEFAULT_MAX_PAGES;
}

/**
 * Parse the linkedin config block from a portal entry.
 * @param {{ linkedin?: any, name?: string }} entry
 */
export function parseLinkedInConfig(entry) {
  const cfg = (entry && entry.linkedin) || {};
  return {
    keywords: typeof cfg.keywords === 'string' ? cfg.keywords.trim() : '',
    geoId: typeof cfg.geoId === 'string' ? cfg.geoId.trim() : '',
    location: typeof cfg.location === 'string' ? cfg.location.trim() : '',
    f_TPR: typeof cfg.f_TPR === 'string' ? cfg.f_TPR.trim() : '',
    f_JT: typeof cfg.f_JT === 'string' ? cfg.f_JT.trim() : '',
    f_WT: typeof cfg.f_WT === 'string' ? cfg.f_WT.trim() : '',
    f_E: typeof cfg.f_E === 'string' ? cfg.f_E.trim() : '',
  };
}

/**
 * Build the search URL for a given page offset.
 * @param {ReturnType<typeof parseLinkedInConfig>} cfg
 * @param {number} start
 */
function buildSearchUrl(cfg, start) {
  const params = new URLSearchParams();
  if (cfg.keywords) params.set('keywords', cfg.keywords);
  if (cfg.geoId) params.set('geoId', cfg.geoId);
  if (cfg.location) params.set('location', cfg.location);
  params.set('start', String(start));
  if (cfg.f_TPR) params.set('f_TPR', cfg.f_TPR);
  if (cfg.f_JT) params.set('f_JT', cfg.f_JT);
  if (cfg.f_WT) params.set('f_WT', cfg.f_WT);
  if (cfg.f_E) params.set('f_E', cfg.f_E);
  return `${SEARCH_BASE}?${params.toString()}`;
}

/**
 * Parse job cards from LinkedIn's guest HTML response. Exported for testing.
 *
 * The endpoint returns one `<li>` per job card. Each card contains:
 *   - URL in an `<a>` with href like `https://{cc}.linkedin.com/jobs/view/{slug}-{id}`
 *   - Title in `<h3 class="base-search-card__title">` (may be multi-line with whitespace)
 *   - Company in `<h4 class="base-search-card__subtitle">` (contains nested `<a>`)
 *   - Location in `<span class="job-search-card__location">`
 *   - Date in `<time datetime="YYYY-MM-DD">`
 *
 * @param {string} html
 * @returns {Array<{title: string, url: string, company: string, location: string, postedAt?: number}>}
 */
export function parseLinkedInHtml(html) {
  if (!html || typeof html !== 'string') return [];

  const jobs = [];
  // Split on <li> boundaries — each job is one <li> block
  const cards = html.split('<li>').slice(1);

  for (const card of cards) {
    // URL: from the anchor href (country-specific subdomain e.g. de.linkedin.com)
    const urlMatch = card.match(/href="(https:\/\/[a-z]{2,3}\.linkedin\.com\/jobs\/view\/[^"?&]+)/);
    if (!urlMatch) continue;
    const url = urlMatch[1];

    // Validate the host is a LinkedIn domain
    try {
      const parsed = new URL(url);
      if (!TRUSTED_HOST_RE.test(parsed.hostname)) continue;
    } catch { continue; }

    // Title: inside <h3 class="base-search-card__title"> ... </h3>
    const titleMatch = card.match(/base-search-card__title[^>]*>([\s\S]*?)<\/h3>/);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, '').trim()) : '';
    if (!title) continue;

    // Company: inside <h4 class="base-search-card__subtitle"> ... </h4>
    // Contains nested <a> tags — strip all HTML
    const companyMatch = card.match(/base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/);
    const company = companyMatch ? decodeHtmlEntities(companyMatch[1].replace(/<[^>]+>/g, '').trim()) : '';

    // Location: <span class="job-search-card__location">text</span>
    const locationMatch = card.match(/job-search-card__location[^>]*>([^<]+)/);
    const location = locationMatch ? locationMatch[1].trim() : '';

    // Posted date: <time datetime="2026-07-04">
    const timeMatch = card.match(/<time[^>]*datetime="([^"]+)"/);
    const postedAt = timeMatch ? Date.parse(timeMatch[1]) : undefined;

    const job = { title, url, company, location };
    if (postedAt && Number.isFinite(postedAt)) job.postedAt = postedAt;
    jobs.push(job);
  }

  return jobs;
}

/** @type {Provider} */
export default {
  id: 'linkedin',

  async fetch(entry, ctx) {
    const cfg = parseLinkedInConfig(entry);
    if (!cfg.keywords && !cfg.geoId && !cfg.location) {
      throw new Error(`linkedin: entry "${entry.name || '(unnamed)'}" has no linkedin.keywords, geoId, or location`);
    }

    const maxPages = resolveMaxPages(entry);
    const ua = pickUserAgent();
    const jobs = [];
    const seenUrls = new Set();

    for (let page = 0; page < maxPages; page++) {
      const start = page * PER_PAGE;
      const url = buildSearchUrl(cfg, start);

      let html = '';
      let lastErr;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          html = await ctx.fetchText(url, {
            redirect: 'error',
            timeoutMs: 15_000,
            headers: { 'user-agent': ua, accept: 'text/html' },
          });
          break;
        } catch (err) {
          lastErr = err;
          if (err?.status === 429 || err?.status >= 500 || err?.status === undefined) {
            const delay = RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * 500;
            await sleep(delay);
          } else {
            break; // non-retryable (4xx other than 429)
          }
        }
      }

      if (!html) {
        if (page === 0) {
          console.error(`⚠️  linkedin: ${entry.name || 'unnamed'} failed on first page: ${lastErr?.message || 'empty response'}`);
          return jobs;
        }
        console.error(`⚠️  linkedin: ${entry.name || 'unnamed'} truncated at page ${page + 1}: ${lastErr?.message || 'empty response'}`);
        break;
      }

      const pageJobs = parseLinkedInHtml(html);

      if (pageJobs.length === 0) {
        if (page === 0 && html.length > 100) {
          console.error(`⚠️  linkedin: ${entry.name || 'unnamed'} got HTML (${html.length} bytes) but parsed 0 jobs — markup may have changed`);
        }
        break; // no more results
      }

      for (const job of pageJobs) {
        if (!seenUrls.has(job.url)) {
          seenUrls.add(job.url);
          jobs.push(job);
        }
      }

      // Short page means we've reached the end
      if (pageJobs.length < PER_PAGE) break;

      // Inter-page delay to respect rate limits
      if (page < maxPages - 1) {
        await sleep(INTER_PAGE_DELAY_MS);
      }
    }

    return jobs;
  },
};
