// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Y Combinator Jobs / Work at a Startup provider.
//
// YC renders public job listing pages with an escaped `data-page` JSON payload
// containing `props.jobPostings`. That lets the scanner consume the board with
// a single HTML fetch, without browser automation or account cookies.

const YC_HOSTS = new Set(['www.ycombinator.com', 'ycombinator.com', 'www.workatastartup.com', 'workatastartup.com']);
const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
  accept: 'text/html,application/xhtml+xml',
};

function assertYcUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`ycombinator: invalid URL: ${value}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`ycombinator: URL must use HTTPS: ${value}`);
  if (!YC_HOSTS.has(parsed.hostname)) {
    throw new Error(`ycombinator: untrusted hostname "${parsed.hostname}"`);
  }
  return parsed.href;
}

function decodeHtmlAttr(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
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

/**
 * @param {string} html
 * @param {string} pageUrl
 * @returns {Array<{title: string, url: string, company: string, location: string}>}
 */
export function parseYCombinatorJobsPage(html, pageUrl = 'https://www.ycombinator.com/jobs') {
  if (typeof html !== 'string') return [];
  const match = html.match(/data-page="([^"]+)"/);
  if (!match) return [];

  let data;
  try {
    data = JSON.parse(decodeHtmlAttr(match[1]));
  } catch {
    return [];
  }

  const postings = data?.props?.jobPostings;
  if (!Array.isArray(postings)) return [];

  return postings
    .map((job) => {
      const title = cleanString(job?.title);
      const url = validHttpUrl(job?.url, pageUrl);
      const company = cleanString(job?.companyName) || 'YC Startup';
      const location = cleanString(job?.location);
      return { title, url, company, location };
    })
    .filter((job) => job.title && job.url);
}

/** @type {Provider} */
export default {
  id: 'ycombinator',

  detect(entry) {
    const raw = typeof entry.careers_url === 'string' ? entry.careers_url : '';
    if (!raw) return null;
    try {
      const parsed = new URL(raw);
      if (!YC_HOSTS.has(parsed.hostname)) return null;
      if (!parsed.pathname.startsWith('/jobs')) return null;
      return { url: parsed.href };
    } catch {
      return null;
    }
  },

  async fetch(entry, ctx) {
    const url = assertYcUrl(entry.careers_url);
    const html = await ctx.fetchText(url, { redirect: 'error', headers: BROWSER_HEADERS });
    return parseYCombinatorJobsPage(html, url);
  },
};
