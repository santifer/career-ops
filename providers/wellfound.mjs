// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Wellfound (formerly AngelList Talent) provider — board-wide public RSS feed.
// Endpoint: https://wellfound.com/jobs.rss
// The feed is zero-auth and exposes the latest startup/eng postings as
// standard RSS 2.0; no API key or account required.
//
// Each <item> carries:
//   <title>   — "Role at Company" (Wellfound encodes both in the title)
//   <link>    — absolute job URL on wellfound.com
//   <pubDate> — RFC 2822 publication date
//   <author>  — company name (mirrors what's in the title suffix)
//
// The title is split on the last " at " to extract role vs company. When the
// split fails (free-form titles) the full title is used and company falls back
// to the <author> tag, then to the portal entry name.
//
// Wire in via a `job_boards:` entry with `provider: wellfound`.

import { tagText, toEpochMs, splitItems } from './_rss.mjs';

const FEED_URL = 'https://wellfound.com/jobs.rss';
const TRUSTED_HOST = 'wellfound.com';

/** @param {string} url */
function assertWellfoundUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`wellfound: invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`wellfound: URL must use HTTPS: ${url}`);
  if (parsed.hostname !== TRUSTED_HOST) {
    throw new Error(`wellfound: untrusted hostname "${parsed.hostname}" — must be ${TRUSTED_HOST}`);
  }
  return url;
}

// Keep only absolute HTTPS links on wellfound.com (job links should never
// redirect to an external host in a well-formed feed).
/** @param {string} value */
function cleanUrl(value) {
  if (!value) return '';
  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname.toLowerCase();
    const trusted = host === TRUSTED_HOST || host.endsWith(`.${TRUSTED_HOST}`);
    return parsed.protocol === 'https:' && trusted ? parsed.href : '';
  } catch {
    return '';
  }
}

/** @param {import('./_types.js').PortalEntry} entry */
function fallbackCompany(entry) {
  return typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : 'Wellfound';
}

/** @type {Provider} */
export default {
  id: 'wellfound',

  detect(entry) {
    return entry?.provider === 'wellfound' ? { url: FEED_URL } : null;
  },

  async fetch(entry, ctx) {
    assertWellfoundUrl(FEED_URL);
    // redirect:'error' prevents SSRF via server-side redirects; combined with
    // assertWellfoundUrl above it keeps the request pinned to wellfound.com.
    const text = await ctx.fetchText(FEED_URL, { redirect: 'error' });
    return parseWellfoundFeed(text, fallbackCompany(entry));
  },
};

/**
 * Split a Wellfound RSS title into role and company.
 *
 * Wellfound encodes both in the title as "Role at Company" (e.g.
 * "Senior Software Engineer at Stripe"). We split on the last " at " to
 * handle roles that themselves contain " at " (e.g. "Staff Engineer at Scale
 * at Acme"). Returns the full title as role and an empty company string when
 * no split point is found.
 *
 * @param {string} rawTitle
 * @returns {{ role: string, company: string }}
 */
export function splitWellfoundTitle(rawTitle) {
  const text = rawTitle.trim();
  const lower = text.toLowerCase();
  const idx = lower.lastIndexOf(' at ');
  if (idx > 0) {
    const role = text.slice(0, idx).trim();
    const company = text.slice(idx + 4).trim();
    if (role && company) return { role, company };
  }
  return { role: text, company: '' };
}

/**
 * Parse a Wellfound public RSS jobs feed. Exported for unit tests.
 *
 * Shape: standard RSS 2.0 `<rss><channel><item>…</item>…</channel></rss>`.
 * Each item carries `<title>`, `<link>`, `<pubDate>`, and `<author>`.
 * Location is not present in the feed and is left empty — Wellfound's RSS
 * exposes role/company/URL only.
 *
 * Items without a parseable HTTPS link on wellfound.com are dropped. Items
 * without a title are dropped. The `<author>` tag is used as the company
 * fallback when the title cannot be split.
 *
 * @param {string} xml - raw RSS feed body
 * @param {string} [defaultCompany] - fallback when title and author both absent
 * @returns {Array<{title: string, url: string, company: string, location: string, postedAt?: number}>}
 */
export function parseWellfoundFeed(xml, defaultCompany = 'Wellfound') {
  if (typeof xml !== 'string') return [];
  const fallback = typeof defaultCompany === 'string' && defaultCompany.trim() ? defaultCompany.trim() : 'Wellfound';
  const jobs = [];
  const blocks = splitItems(xml);

  for (const item of blocks) {
    const url = cleanUrl(tagText(item, 'link'));
    if (!url) continue;

    const rawTitle = tagText(item, 'title');
    if (!rawTitle) continue;

    const { role: title, company: splitCompany } = splitWellfoundTitle(rawTitle);

    // <author> is a secondary source for the company name when the title
    // doesn't follow the "Role at Company" convention.
    const author = tagText(item, 'author').trim();
    const company = splitCompany || author || fallback;

    const postedAt = toEpochMs(tagText(item, 'pubDate'));
    /** @type {import('./_types.js').Job & {postedAt?: number}} */
    const job = { title, url, company, location: '' };
    if (postedAt !== undefined) job.postedAt = postedAt;
    jobs.push(job);
  }

  return jobs;
}
