// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Apple Jobs provider - parses the public server-rendered search results.

const BASE_URL = 'https://jobs.apple.com/en-us/search';

const ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  nbsp: ' ',
};

function decodeEntities(value = '') {
  return String(value)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITY_MAP[name] || m);
}

function cleanText(value = '') {
  return decodeEntities(String(value).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function firstMatch(source, re) {
  const m = re.exec(source);
  return m ? m[1] : '';
}

function toEpochMs(raw) {
  if (!raw) return undefined;
  const parsed = Date.parse(cleanText(raw));
  return Number.isNaN(parsed) ? undefined : parsed;
}

function resolveJobUrl(rawHref) {
  try {
    return new URL(decodeEntities(rawHref), BASE_URL).href;
  } catch {
    return '';
  }
}

/** @param {import('./_types.js').PortalEntry & {apple?: Record<string, unknown>}} entry */
export function buildAppleCareersUrl(entry = {}) {
  const cfg = entry.apple && typeof entry.apple === 'object' ? entry.apple : {};
  const search = cfg.search ?? cfg.query ?? entry.query ?? entry.search ?? '';
  const sort = cfg.sort ?? 'relevance';
  const url = new URL(BASE_URL);
  if (search) url.searchParams.set('search', String(search));
  if (sort) url.searchParams.set('sort', String(sort));
  return url.href;
}

/** @param {string} html */
export function parseAppleCareersHtml(html) {
  if (typeof html !== 'string' || !html.trim()) return [];
  const matches = [];
  const linkRe = /<a\b[^>]*href=["']([^"']*\/en-us\/details\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRe.exec(html))) {
    matches.push({
      index: match.index,
      end: linkRe.lastIndex,
      href: match[1],
      titleHtml: match[2],
    });
  }

  const jobs = [];
  const seen = new Set();
  for (let i = 0; i < matches.length; i++) {
    const item = matches[i];
    const nextIndex = matches[i + 1]?.index ?? html.length;
    const context = html.slice(item.index, nextIndex);
    const title = cleanText(item.titleHtml);
    const url = resolveJobUrl(item.href);
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);

    const location = cleanText(firstMatch(context, /<span\b[^>]*id=["']search-store-name-container-[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
    const postedAt = toEpochMs(firstMatch(context, /<span\b[^>]*class=["'][^"']*\bjob-posted-date\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));

    const job = {
      title,
      url,
      company: 'Apple',
      location,
    };
    if (postedAt !== undefined) job.postedAt = postedAt;
    jobs.push(job);
  }

  return jobs;
}

/** @type {Provider} */
export default {
  id: 'apple-careers',

  detect(entry) {
    const url = entry.api || entry.careers_url || '';
    if (typeof url !== 'string') return null;
    try {
      const parsed = new URL(url);
      if (parsed.host.toLowerCase() === 'jobs.apple.com' && parsed.pathname.startsWith('/en-us/search')) {
        return { url };
      }
    } catch {
      /* not an absolute URL */
    }
    return null;
  },

  async fetch(entry, ctx) {
    const html = await ctx.fetchText(buildAppleCareersUrl(entry), { redirect: 'error' });
    return parseAppleCareersHtml(html).map((job) => ({
      ...job,
      company: entry.name || job.company,
    }));
  },
};
