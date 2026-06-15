// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Teamtailor provider — parses the public jobs.rss feed.
//
// careers_url shape: `https://{company}.teamtailor.com/jobs` (or `/jobs.rss`)
// Feed URL:          `https://{company}.teamtailor.com/jobs.rss`
//
// Lightweight RSS parsing — Teamtailor's feed is well-formed XML with one
// <item> per posting. No external XML dep needed.

import { toEpochMs } from './_http.mjs';

function assertTeamtailorUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`teamtailor: invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`teamtailor: URL must use HTTPS: ${url}`);
  if (!parsed.hostname.endsWith('.teamtailor.com'))
    throw new Error(`teamtailor: untrusted hostname "${parsed.hostname}" — must end in .teamtailor.com`);
  return url;
}

function resolveFeedUrl(entry) {
  if (entry.api) {
    assertTeamtailorUrl(entry.api);
    return entry.api;
  }
  const url = entry.careers_url || '';
  const match = url.match(/https:\/\/([^/]+)\.teamtailor\.com/);
  if (!match) return null;
  return `https://${match[1]}.teamtailor.com/jobs.rss`;
}

// Decode the small set of XML entities that appear in Teamtailor feeds.
// Numeric and named — kept conservative on purpose; the feed is never HTML.
function decodeXmlEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractTag(itemXml, tag) {
  const cdata = itemXml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
  if (cdata) return cdata[1].trim();
  const plain = itemXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  if (plain) return decodeXmlEntities(plain[1]).trim();
  return '';
}

/** @type {Provider} */
export default {
  id: 'teamtailor',

  detect(entry) {
    try {
      const feedUrl = resolveFeedUrl(entry);
      return feedUrl ? { url: feedUrl } : null;
    } catch {
      return null;
    }
  },

  async fetch(entry, ctx) {
    const feedUrl = resolveFeedUrl(entry);
    if (!feedUrl) throw new Error(`teamtailor: cannot derive feed URL for ${entry.name}`);
    assertTeamtailorUrl(feedUrl);
    const xml = await ctx.fetchText(feedUrl, {
      headers: { accept: 'application/rss+xml, application/xml, text/xml' },
      redirect: 'error',
    });
    const items = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/g) || [];
    const jobs = [];
    for (const item of items) {
      const title = extractTag(item, 'title');
      const link = extractTag(item, 'link');
      if (!title || !link) continue;
      // Teamtailor exposes location via custom <jobs:location> elements when
      // present — fall back to empty when the feed omits them.
      const location = extractTag(item, 'jobs:location') || extractTag(item, 'location') || '';
      const postedAt = toEpochMs(extractTag(item, 'pubDate'));
      jobs.push({ title, url: link, company: entry.name, location, postedAt });
    }
    return jobs;
  },
};
