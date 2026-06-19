// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */
/** @typedef {import('./_types.js').Job} Job */
//
// CryptocurrencyJobs — curated Web3/crypto job board. RSS 2.0, no auth.
// Feed: https://cryptocurrencyjobs.co/index.xml (listings are 100% remote).
// Title format: "Role at Company" — split on the last " at " to extract company.
//
// The feed URL is a hardcoded constant (never user-supplied), so there is no
// SSRF surface. Parsing is dependency-free regex over the raw XML, mirroring
// the providers/rwfa.mjs pattern.

const FEED = 'https://cryptocurrencyjobs.co/index.xml';

/**
 * Extract the text content of the first matching XML tag within a block.
 * Handles both CDATA (<tag><![CDATA[...]]></tag>) and plain text.
 * @param {string} block
 * @param {string} tag
 * @returns {string}
 */
function extractTag(block, tag) {
  const re = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))<\\/${tag}>`,
    'i'
  );
  const m = block.match(re);
  if (!m) return '';
  return (m[1] !== undefined ? m[1] : m[2] || '').trim();
}

/**
 * Decode XML/HTML entities iteratively until the string is stable.
 * Handles double-encoded sequences like &amp;amp; → &amp; → &.
 * @param {string} str
 * @returns {string}
 */
function decodeEntities(str) {
  let prev;
  do {
    prev = str;
    str = str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  } while (str !== prev);
  return str;
}

/**
 * Split "Role at Company" on the last " at " occurrence.
 * Falls back to an empty company when the pattern isn't found.
 * @param {string} raw
 * @returns {{ title: string; company: string }}
 */
function splitTitle(raw) {
  const sep = ' at ';
  const idx = raw.lastIndexOf(sep);
  if (idx <= 0) return { title: raw, company: '' };
  return {
    title: raw.slice(0, idx).trim(),
    company: raw.slice(idx + sep.length).trim(),
  };
}

/**
 * Parse a CryptocurrencyJobs RSS document into normalized Job objects.
 * Exported for unit testing; fetch() wraps it around an HTTP fetch.
 * @param {string} xml
 * @returns {Job[]}
 */
export function parseCryptocurrencyJobsRss(xml) {
  // Split on <item> boundaries; element 0 is the channel header — skip it.
  const parts = String(xml ?? '').split(/<item[\s>]/i);
  const results = [];

  for (let i = 1; i < parts.length; i++) {
    try {
      const block = parts[i];
      const rawTitle = decodeEntities(extractTag(block, 'title'));
      const link = extractTag(block, 'link') || extractTag(block, 'guid');
      if (!rawTitle || !link) continue;

      const { title, company } = splitTitle(rawTitle);
      if (!title) continue;

      // pubDate → postedAt epoch ms (optional field per the Job contract).
      const pubDateStr = extractTag(block, 'pubDate');
      const postedAt = pubDateStr ? new Date(pubDateStr).getTime() : undefined;

      results.push({
        title,
        url: link,
        company,
        location: 'Remote',
        ...(postedAt && Number.isFinite(postedAt) ? { postedAt } : {}),
      });
    } catch {
      // Malformed item — skip, don't abort the whole feed.
    }
  }

  return results;
}

/** @type {Provider} */
export default {
  id: 'cryptocurrencyjobs',

  async fetch(_entry, ctx) {
    let xml;
    try {
      xml = await ctx.fetchText(FEED);
    } catch {
      return [];
    }
    return parseCryptocurrencyJobsRss(xml);
  },
};
