// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// SAP SuccessFactors provider — Recruiting Marketing (RMK, ex-jobs2web) career
// sites (Career Site Builder's branded job boards). These are the portals big
// German industrials run at their own domains (jobs.zf.com, jobs.schaeffler.com,
// jobs.hensoldt.net, jobs.sap.com, …) — all served by the same SF RMK backend.
//
// The RMK backend exposes a public, no-auth job-list fragment endpoint:
//   GET {origin}/tile-search-results/?startrow={N}
// It returns an HTML fragment (not JSON) of <li class="job-tile job-id-{id}">
// blocks, each carrying data-url (job path), the title link, and — when the
// tenant configures it — a rendered city field. We parse those out; the scanner
// contract only needs {title, url, company, location, postedAt}.
//
// Pagination: startrow is a plain row offset, and page size is tenant-specific
// (Schaeffler serves 100/page, most others 25). We never assume a page size —
// each loop advances startrow by the number of tiles actually returned, and a
// per-id dedup set guards against overlap or a server that ignores the offset.
//
// Detection: branded RMK hosts (jobs.zf.com) contain no "successfactors" string,
// so detect() only auto-claims literal *.successfactors.eu/.com and jobs2web
// URLs. The branded portals are wired up with an explicit `provider:
// successfactors` in portals.yml (which bypasses detect()); `api:` may override
// careers_url when the public careers_url isn't the RMK origin.
//
// RMK carries no posting date in the list fragment, so postedAt is always
// omitted (consumers treat an absent date as "unknown", never as stale).

const MAX_PAGES = 40; // safety cap on request count
const MAX_JOBS = 1000; // cap total postings pulled per site

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
  return {
    origin: u.origin,
    tileApi: `${u.origin}/tile-search-results/`,
    jobBase: u.origin,
  };
}

// Minimal HTML entity decoder — titles carry named (&amp;) and numeric
// (&#252; / &#xfc;) entities. We only need the handful that show up in job
// titles; anything else is left as-is.
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** @param {string} s */
function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? m;
  });
}

/** @param {string} s */
function clean(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// RMK job paths encode the city as the leading slug segment:
//   /job/{City-Words}-{Title-Words}-{reqCode}/{id}/
// When the tenant doesn't render a dedicated city field we recover the city by
// stripping the title (and trailing code) off the front slug. We anchor on the
// first two title words — a prefix the slug always reproduces verbatim, unlike
// the title's tail where punctuation like "(m/w/d)" gets mangled.
/** @param {string} dataUrl @param {string} title */
export function cityFromSlug(dataUrl, title) {
  let path;
  try {
    path = decodeURIComponent(dataUrl);
  } catch {
    path = dataUrl;
  }
  const m = path.match(/\/job\/([^/]+)\//);
  if (!m) return '';
  const slug = m[1].toLowerCase();
  const words = title.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!words || !words.length) return '';
  // Anchor on the first two title words, but allow ANY run of non-alphanumerics
  // between them — in the slug those words may be joined by "-", "-amp-" (a
  // decoded "&"), or several hyphens, none of which survive the title's word
  // split. A rigid "word-word" anchor would miss "Program & Release" → "program-&amp;-release".
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let anchorRe;
  try {
    anchorRe = new RegExp(words.slice(0, 2).map(esc).join('[^\\p{L}\\p{N}]+'), 'u');
  } catch {
    return '';
  }
  const hit = slug.match(anchorRe);
  if (!hit || hit.index === undefined || hit.index <= 0) return '';
  return slug
    .slice(0, hit.index)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Parse one page fragment into raw {id, title, url, city} records.
// Each posting renders three responsive copies (desktop/tablet/mobile) inside
// one <li>; a single <li> per id means the top-level dedup already collapses
// them, and within a block the first match of each field wins.
/** @param {string} htmlText @param {string} jobBase */
export function parseTiles(htmlText, jobBase) {
  const out = [];
  const tileRe = /<li class="job-tile job-id-(\d+)\b[\s\S]*?<\/li>/g;
  let t;
  while ((t = tileRe.exec(htmlText)) !== null) {
    const id = t[1];
    const block = t[0];
    const urlM = block.match(/data-url="([^"]+)"/);
    if (!urlM) continue;
    const titleM = block.match(/class="jobTitle-link[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    const title = titleM ? clean(titleM[1]) : '';
    if (!title) continue;
    // data-url is an HTML attribute, so a literal "&" in the path arrives as
    // &amp;. Decode entities (but not percent-encoding — %28 etc. stays) before
    // both URL building and slug parsing, so the "amp" of &amp; can't leak into
    // the recovered city.
    const path = decodeEntities(urlM[1]);
    // Anchor on id="…-section-city-value"> — the value div. The sibling label
    // span references the same id via aria-describedby, so a looser match would
    // swallow the "City" label text too.
    const cityM = block.match(/id="[^"]*-section-city-value">([\s\S]*?)<\/div>/);
    const city = cityM ? clean(cityM[1]) : cityFromSlug(path, title);
    const url = /^https?:\/\//i.test(path) ? path : jobBase + (path.startsWith('/') ? path : '/' + path);
    out.push({ id, title, url, location: city });
  }
  return out;
}

/** @type {Provider} */
export default {
  id: 'successfactors',

  detect(entry) {
    const url = entry.api || entry.careers_url || '';
    if (/successfactors\.(eu|com)|jobs2web\.com/i.test(url)) return { url };
    return null;
  },

  async fetch(entry, ctx) {
    const cfg = resolveConfig(entry);
    if (!cfg) throw new Error(`successfactors: cannot resolve origin for ${entry.name}`);

    const jobs = [];
    const seen = new Set();
    let startrow = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const htmlText = await ctx.fetchText(`${cfg.tileApi}?startrow=${startrow}`, {
        redirect: 'error',
        headers: { accept: 'text/html' },
      });
      const tiles = parseTiles(htmlText, cfg.jobBase);
      if (tiles.length === 0) break;

      let fresh = 0;
      for (const tile of tiles) {
        if (seen.has(tile.id)) continue;
        seen.add(tile.id);
        fresh++;
        jobs.push({
          title: tile.title,
          url: tile.url,
          company: entry.name,
          location: tile.location,
        });
      }
      // No new ids this page → server ignored the offset (or we've looped). Stop.
      if (fresh === 0) break;
      if (jobs.length >= MAX_JOBS) break;
      startrow += tiles.length;
    }
    // The cap is checked between pages, so the last page can overshoot it.
    return jobs.slice(0, MAX_JOBS);
  },
};
