// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Avature provider — parses the public Avature career-site job list.
// Auto-detects from a careers_url on `*.avature.net`; a branded custom domain
// that proxies Avature needs an explicit `provider: avature` + `api:` pointing
// at the Avature origin (or its /careers/SearchJobs URL).
//
//   GET {origin}/careers/SearchJobs?jobOffset=N
//
// returns a server-rendered page of <article class="article--result"> blocks.
// Avature hard-caps the page at 6 results (a jobRecordsPerPage override is
// ignored), and paginates via jobOffset in steps of 6 — so this is request-
// heavy for large boards; max_pages (default 50 → ~300 postings) bounds it and
// can be raised per entry.
//
// Location isn't rendered in every tenant's list (the subtitle is Job ID /
// hire-type / posted-date); we extract it when a marker is present and leave it
// empty otherwise. postedAt comes from the "Posted DD-Mon-YYYY" subtitle.

const PAGE_SIZE = 6; // Avature serves exactly 6 results per page
const DEFAULT_MAX_PAGES = 50; // ~300 postings; override via entry.max_pages
const HARD_MAX_PAGES = 200;

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** @param {import('./_types.js').PortalEntry} entry */
function resolveConfig(entry) {
  const raw = entry.api || entry.careers_url || '';
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  // Honour an explicit SearchJobs path (branded tenants may prefix a locale,
  // e.g. /en_US/searchjobs/SearchJobs); otherwise default to the classic path.
  const searchPath = /\/SearchJobs\b/i.test(u.pathname) ? u.pathname.replace(/\/+$/, '') : '/careers/SearchJobs';
  return { searchUrl: `${u.origin}${searchPath}`, origin: u.origin };
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#8226': '•' };
/** @param {string} s */
function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z0-9]+);/g, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[body.toLowerCase()] ?? m;
  });
}

/** @param {string} s */
function clean(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// "Posted 02-May-2026" → epoch ms (UTC midnight). Undefined when absent/unparseable.
/** @param {string} block */
function parsePosted(block) {
  const m = block.match(/Posted\s+(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (!m) return undefined;
  const mon = MONTHS[m[2].toLowerCase()];
  if (mon === undefined) return undefined;
  const ms = Date.UTC(Number(m[3]), mon, Number(m[1]));
  return Number.isNaN(ms) ? undefined : ms;
}

// Best-effort location: some tenants tag it with a list-item-location span or a
// map-marker glyph; most (e.g. Synopsys) render none, so this returns ''.
/** @param {string} block */
function parseLocation(block) {
  const m =
    block.match(/list-item-location[^>]*>([\s\S]*?)<\/span>/i) ||
    block.match(/class="[^"]*\blocation\b[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div|li)>/i) ||
    block.match(/glyphicon-map-marker[\s\S]{0,80}?>([^<]{2,60})</i);
  return m ? clean(m[1]) : '';
}

/** @param {string} htmlText @param {string} origin */
export function parseArticles(htmlText, origin) {
  const out = [];
  const re = /<article class="article article--result"[\s\S]*?<\/article>/g;
  let a;
  while ((a = re.exec(htmlText)) !== null) {
    const block = a[0];
    // JobDetail path may or may not sit under /careers/ (branded tenants vary),
    // so anchor on JobDetail/ itself rather than a fixed prefix.
    const urlM = block.match(/<a[^>]*class="link"[^>]*href="([^"]*\/JobDetail\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!urlM) continue;
    const title = clean(urlM[2]);
    if (!title) continue;
    let url = decodeEntities(urlM[1]);
    if (!/^https?:\/\//i.test(url)) url = origin + (url.startsWith('/') ? url : '/' + url);
    const idM = url.match(/\/JobDetail\/[^/]*\/(\d+)/);
    out.push({
      id: idM ? idM[1] : url,
      title,
      url,
      location: parseLocation(block),
      postedAt: parsePosted(block),
    });
  }
  return out;
}

/** @type {Provider} */
export default {
  id: 'avature',

  detect(entry) {
    const url = entry.api || entry.careers_url || '';
    if (typeof url !== 'string') return null;
    try {
      const host = new URL(url).host.toLowerCase();
      if (host === 'avature.net' || host.endsWith('.avature.net')) return { url };
    } catch {
      /* not absolute */
    }
    return null;
  },

  async fetch(entry, ctx) {
    const cfg = resolveConfig(entry);
    if (!cfg) throw new Error(`avature: cannot resolve origin for ${entry.name}`);
    const maxPages = Math.min(
      HARD_MAX_PAGES,
      Number.isFinite(entry.max_pages) && entry.max_pages > 0 ? Number(entry.max_pages) : DEFAULT_MAX_PAGES,
    );

    const jobs = [];
    const seen = new Set();
    for (let page = 0; page < maxPages; page++) {
      const htmlText = await ctx.fetchText(`${cfg.searchUrl}?jobOffset=${page * PAGE_SIZE}`, {
        redirect: 'error',
        headers: { accept: 'text/html' },
      });
      const articles = parseArticles(htmlText, cfg.origin);
      if (articles.length === 0) break;

      let fresh = 0;
      for (const art of articles) {
        if (seen.has(art.id)) continue;
        seen.add(art.id);
        fresh++;
        jobs.push({
          title: art.title,
          url: art.url,
          company: entry.name,
          location: art.location,
          postedAt: art.postedAt,
        });
      }
      if (fresh === 0) break; // looped / offset ignored
      if (articles.length < PAGE_SIZE) break; // last page
    }
    return jobs;
  },
};
