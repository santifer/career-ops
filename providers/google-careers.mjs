// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Google Careers provider - parses the public server-rendered search results.

const BASE_URL = 'https://www.google.com/about/careers/applications/jobs/results/';
const APP_BASE_URL = 'https://www.google.com/about/careers/applications/';

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

function resolveJobUrl(rawHref) {
  if (!rawHref) return '';
  try {
    return new URL(decodeEntities(rawHref), APP_BASE_URL).href;
  } catch {
    return '';
  }
}

/** @param {import('./_types.js').PortalEntry & {google?: Record<string, unknown>}} entry */
export function buildGoogleCareersUrl(entry = {}) {
  const cfg = entry.google && typeof entry.google === 'object' ? entry.google : {};
  const query = cfg.query ?? entry.query ?? entry.search ?? '';
  const url = new URL(BASE_URL);
  if (query) url.searchParams.set('q', String(query));
  return url.href;
}

/** @param {string} html */
export function parseGoogleCareersHtml(html) {
  if (typeof html !== 'string' || !html.trim()) return [];
  const jobs = [];
  const seen = new Set();
  const cardRe = /<li\b[^>]*class=["'][^"']*\blLd3Je\b[^"']*["'][^>]*>[\s\S]*?(?=<li\b[^>]*class=["'][^"']*\blLd3Je\b|<\/main>|$)/gi;

  for (const m of html.matchAll(cardRe)) {
    const card = m[0];
    const title = cleanText(firstMatch(card, /<h3\b[^>]*class=["'][^"']*\bQJPWVe\b[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i));
    const href = firstMatch(card, /<a\b[^>]+href=["']([^"']*jobs\/results\/[^"']+)["']/i);
    const url = resolveJobUrl(href);
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);

    const location = cleanText(
      firstMatch(card, /<span\b[^>]*class=["'][^"']*\br0wTof\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)
      || firstMatch(card, /<span\b[^>]*class=["'][^"']*\bpwO9Dc\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i),
    );

    jobs.push({
      title,
      url,
      company: 'Google',
      location,
    });
  }

  return jobs;
}

/** @type {Provider} */
export default {
  id: 'google-careers',

  detect(entry) {
    const url = entry.api || entry.careers_url || '';
    if (typeof url !== 'string') return null;
    try {
      const parsed = new URL(url);
      const host = parsed.host.toLowerCase();
      if ((host === 'www.google.com' || host === 'careers.google.com')
          && parsed.pathname.includes('/careers/applications/jobs')) {
        return { url };
      }
    } catch {
      /* not an absolute URL */
    }
    return null;
  },

  async fetch(entry, ctx) {
    const html = await ctx.fetchText(buildGoogleCareersUrl(entry), { redirect: 'error' });
    return parseGoogleCareersHtml(html).map((job) => ({
      ...job,
      company: entry.name || job.company,
    }));
  },
};
