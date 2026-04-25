// HTML scraper provider — extracts postings from a search-results page that
// embeds a JSON-LD ItemList (schema.org) or any other repeating markup with
// title + url. Paginates with `&page=N` until the list is empty.
//
// Each portals.yml entry must provide its own `list_item_pattern` and
// `url_must_include` — no built-in defaults. Entries look like:
//
//   tracked_companies:
//     - name: "Some Site — Search"
//       careers_url: "https://example.com/jobs?q=foo"
//       provider: scraper
//       url_must_include: "/careers/"
//       list_item_pattern: '"jobTitle":"([^"]+)","jobUrl":"([^"]+)"'   # group 1=title, 2=url
//
// Use single-quoted YAML strings for `list_item_pattern` so backslashes are
// preserved literally. The string is compiled with `new RegExp(s, 'g')` —
// the `g` flag is added automatically. To disable URL filtering, set
// `url_must_include: ""`.
//
// Company name isn't available at the list-page level — the source site only
// exposes it on the detail page. Scan time uses a unique-per-job placeholder
// (`Scraper #{id}`) so dedup works correctly; the real company name is
// filled in by the pipeline mode when extracting the full JD.

const MAX_PAGES = 20;
// Defensive cap for `list_item_pattern` execution. Patterns are compiled from
// portals.yml — a runaway regex on a large page can spin for a long time. Stop
// well above any realistic single-page result count.
const MAX_MATCHES_PER_PAGE = 500;

function unescapeJsonString(s) {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\//g, '/');
}

// `&amp;` must come first — if we ran `&lt;` first, an input of `&amp;lt;`
// (literal `&lt;` in source) would incorrectly become `<` instead of `&lt;`.
function unescapeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function decodeText(s) {
  return unescapeHtmlEntities(unescapeJsonString(s));
}

function compilePattern(pattern, entryName) {
  if (pattern instanceof RegExp) {
    return pattern.flags.includes('g') ? pattern : new RegExp(pattern.source, pattern.flags + 'g');
  }
  try {
    return new RegExp(pattern, 'g');
  } catch (err) {
    throw new Error(`scraper: entry ${entryName} has invalid list_item_pattern: ${err.message}`);
  }
}

function extractJobsFromHtml(html, pattern, urlMustInclude, entryName) {
  const jobs = [];
  const seen = new Set();
  pattern.lastIndex = 0;
  let m;
  let matchCount = 0;
  while ((m = pattern.exec(html)) !== null) {
    if (++matchCount > MAX_MATCHES_PER_PAGE) {
      console.error(`⚠️  scraper: ${entryName} hit MAX_MATCHES_PER_PAGE (${MAX_MATCHES_PER_PAGE}) — truncating; check list_item_pattern for runaway matching`);
      break;
    }
    const title = decodeText(m[1]);
    const url = decodeText(m[2]);
    if (urlMustInclude && !url.includes(urlMustInclude)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const id = extractIdFromUrl(url);
    jobs.push({
      title,
      url,
      company: `Scraper #${id}`,
      location: '',
    });
  }
  return jobs;
}

// Prefer a numeric path segment (builtin.com /job/.../{id}); fall back to the
// last path segment (Dice /job-detail/{uuid}); fall back to the full URL.
function extractIdFromUrl(url) {
  const numericMatch = url.match(/\/(\d+)(?:[/?#]|$)/);
  if (numericMatch) return numericMatch[1];
  const path = url.split(/[?#]/)[0];
  const segments = path.split('/').filter(Boolean);
  return segments[segments.length - 1] || url;
}

function buildPageUrl(baseUrl, page) {
  if (page <= 1) return baseUrl;
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}page=${page}`;
}

export default {
  id: 'scraper',

  // No auto-detect: scraper entries must set `provider: scraper` explicitly.
  detect() { return null; },

  async fetch(entry, ctx) {
    const baseUrl = entry.careers_url;
    if (!baseUrl) throw new Error(`scraper: entry ${entry.name} missing careers_url`);

    if (entry.list_item_pattern == null || entry.list_item_pattern === '') {
      throw new Error(`scraper: entry ${entry.name} missing list_item_pattern`);
    }
    if (entry.url_must_include == null) {
      throw new Error(`scraper: entry ${entry.name} missing url_must_include (set to "" to disable URL filtering)`);
    }
    const pattern = compilePattern(entry.list_item_pattern, entry.name);
    const urlMustInclude = entry.url_must_include;

    const all = [];
    const seenUrls = new Set();

    for (let page = 1; page <= MAX_PAGES; page++) {
      const pageUrl = buildPageUrl(baseUrl, page);
      let html;
      try {
        html = await ctx.fetchText(pageUrl);
      } catch (err) {
        if (page === 1) throw err;
        break;
      }
      const pageJobs = extractJobsFromHtml(html, pattern, urlMustInclude, entry.name);
      if (pageJobs.length === 0) break;

      let novel = 0;
      for (const j of pageJobs) {
        if (seenUrls.has(j.url)) continue;
        seenUrls.add(j.url);
        all.push(j);
        novel++;
      }
      // If the page returned results but none were novel, the site is looping
      // (common when the last page is reached but still serves content).
      if (novel === 0) break;
    }

    return all;
  },
};
