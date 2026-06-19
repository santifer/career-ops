// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Teamtailor provider — reads jobs from the public /jobs.rss feed.
// Auto-detects from careers_url matching *.teamtailor.com.
// For companies with a custom domain, set `provider: teamtailor` in portals.yml.

import { isSafeUrl } from './_url-guard.mjs';

function resolveRssUrl(entry) {
  const url = (entry.careers_url || '').replace(/\/$/, '');
  if (!url || !isSafeUrl(url)) return null;
  // Auto-detect: slug.teamtailor.com
  if (/\.teamtailor\.com$/i.test(new URL(url).hostname)) return `${url}/jobs.rss`;
  // Explicit provider: custom domain — append /jobs.rss to the base
  if (entry.provider === 'teamtailor') return `${url}/jobs.rss`;
  return null;
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function parseRss(xml, companyName) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = decodeHtmlEntities(
      (/<title>(.*?)<\/title>/.exec(block) || [])[1] || ''
    ).trim();
    const url = ((/<link>(.*?)<\/link>/.exec(block) || [])[1] || '').trim();
    const city = ((/<tt:city>(.*?)<\/tt:city>/.exec(block) || [])[1] || '').trim();
    const country = ((/<tt:country>(.*?)<\/tt:country>/.exec(block) || [])[1] || '').trim();
    const remote = ((/<remoteStatus>(.*?)<\/remoteStatus>/.exec(block) || [])[1] || '').trim();
    const pubDate = ((/<pubDate>(.*?)<\/pubDate>/.exec(block) || [])[1] || '').trim();

    if (!title || !url) continue;

    const locationParts = [city, country].filter(Boolean);
    const location = remote === 'fully'
      ? locationParts.length ? `Remote (${locationParts.join(', ')})` : 'Remote'
      : locationParts.join(', ');

    const postedAt = pubDate ? Date.parse(pubDate) : undefined;
    items.push({ title, url, company: companyName, location, ...(postedAt && !isNaN(postedAt) ? { postedAt } : {}) });
  }
  return items;
}

/** @type {Provider} */
export default {
  id: 'teamtailor',

  detect(entry) {
    try {
      const rssUrl = resolveRssUrl(entry);
      return rssUrl ? { url: rssUrl } : null;
    } catch {
      return null;
    }
  },

  async fetch(entry, ctx) {
    const rssUrl = resolveRssUrl(entry);
    if (!rssUrl) throw new Error('teamtailor: cannot derive RSS URL from careers_url');
    const xml = await ctx.fetchText(rssUrl, { redirect: 'error' });
    return parseRss(xml, entry.name);
  },
};
