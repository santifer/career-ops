// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Jobspresso provider - board-wide WordPress job feed
// (https://jobspresso.co/?feed=job_feed). The feed is public, no-auth, and XML,
// so it is parsed in-process with a small tag extractor (no new dependency).
//
// Wire in via a `job_boards:` entry with `provider: jobspresso`.

const FEED_URL = 'https://jobspresso.co/?feed=job_feed';
const TRUSTED_HOST = 'jobspresso.co';

/**
 * Assert that the feed URL stays pinned to the trusted Jobspresso host.
 *
 * @param {string} url
 * @returns {string}
 */
function assertJobspressoUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`jobspresso: invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`jobspresso: URL must use HTTPS: ${url}`);
  if (parsed.hostname !== TRUSTED_HOST) {
    throw new Error(`jobspresso: untrusted hostname "${parsed.hostname}" - must be ${TRUSTED_HOST}`);
  }
  return url;
}

/**
 * Parse a feed date into epoch milliseconds without coercing NaN to 0/falsey.
 *
 * @param {string} value
 * @returns {number | undefined}
 */
function toEpochMs(value) {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Fallback company name used when the feed row omits <job_listing:company>.
 *
 * @param {{ name?: string }} entry
 * @returns {string}
 */
function fallbackCompany(entry) {
  return typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : 'Jobspresso';
}

/** @type {Provider} */
export default {
  id: 'jobspresso',

  detect(entry) {
    return entry?.provider === 'jobspresso' ? { url: FEED_URL } : null;
  },

  async fetch(entry, ctx) {
    const feedUrl = assertJobspressoUrl(FEED_URL);
    // redirect:'error' prevents SSRF via server-side redirects; combined with
    // assertJobspressoUrl above it keeps the request pinned to jobspresso.co.
    const text = await ctx.fetchText(feedUrl, { redirect: 'error' });
    return parseJobspressoFeed(text, fallbackCompany(entry));
  },
};

/**
 * Safely decode a numeric XML entity into a Unicode code point.
 *
 * @param {number} cp
 * @returns {string}
 */
function fromCodePoint(cp) {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return '';
  }
}

/**
 * Decode the XML entities that appear in the RSS text payload.
 *
 * @param {string} s
 * @returns {string}
 */
function decodeXmlEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Resolve a tag's inner text by unwrapping CDATA or decoding XML entities.
 *
 * @param {string} inner
 * @returns {string}
 */
function extractText(inner) {
  const cdata = inner.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdata) return cdata[1].trim();
  return decodeXmlEntities(inner).trim();
}

/**
 * Extract the first matching tag's text from an XML block.
 *
 * @param {string} block
 * @param {string} tag
 * @returns {string}
 */
function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? extractText(m[1]) : '';
}

/**
 * Normalize and trust-check a posting URL from the feed.
 *
 * @param {string} value
 * @returns {string}
 */
function cleanUrl(value) {
  if (!value) return '';
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const trusted = host === TRUSTED_HOST || host.endsWith(`.${TRUSTED_HOST}`);
    return parsed.protocol === 'https:' && trusted ? parsed.href : '';
  } catch {
    return '';
  }
}

/**
 * Parse Jobspresso's public RSS jobs feed. Exported for unit tests.
 *
 * Shape: `<rss><channel><item>...</item>...</channel></rss>`, each item
 * carrying `<title>`, `<link>`, `<pubDate>`, `<job_listing:location>`, and
 * `<job_listing:company>`. The RSS `<link>` is the dedup key; items without a
 * usable trusted absolute URL or without a non-empty title are dropped.
 *
 * @param {string} xml - raw RSS feed body
 * @param {string} [defaultCompany] - fallback company for items without an explicit company tag
 * @returns {Array<{title: string, url: string, company: string, location: string, postedAt?: number}>}
 */
export function parseJobspressoFeed(xml, defaultCompany = 'Jobspresso') {
  if (typeof xml !== 'string') return [];
  const fallback = typeof defaultCompany === 'string' && defaultCompany.trim() ? defaultCompany.trim() : 'Jobspresso';
  const jobs = [];
  const blocks = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || [];

  for (const item of blocks) {
    const title = tagText(item, 'title');
    if (!title) continue;

    const url = cleanUrl(tagText(item, 'link'));
    if (!url) continue;

    const company = tagText(item, 'job_listing:company') || fallback;
    const location = tagText(item, 'job_listing:location');

    jobs.push({
      title,
      url,
      company,
      location,
      postedAt: toEpochMs(tagText(item, 'pubDate')),
    });
  }

  return jobs;
}
