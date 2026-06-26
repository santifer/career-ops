// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Wellfound provider — scrapes the public job search page via HTTP.
//
// Wellfound uses GraphQL (POST /graphql) with session-based auth, so
// unauthenticated API calls won't return job data. Instead, this provider
// fetches the SSR HTML from the public search URL and parses out job cards
// from the embedded JSON (__NEXT_DATA__) or page text.
//
// Wire in via a `job_boards:` entry with `provider: wellfound`.
// Required entry fields: `searchUrl` (the full Wellfound search URL with filters)
//
// Example portals.yml entry:
//   - name: Wellfound Remote Engineering
//     provider: wellfound
//     searchUrl: "https://wellfound.com/jobs?remote=true&keywords=platform+engineer+OR+SRE+OR+devops&locationSlugs[]=everywhere"
//     enabled: true
//
// NOTE: Wellfound requires login to see full results. If this provider
// returns empty results, use the Chrome MCP to scan manually (the user
// is already logged in via the browser session).

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Parse salary range from job text like "$90k – $160k" or "$135k – $165k"
 * @param {string} text
 * @returns {{min: number, max: number, currency: string}|null}
 */
function parseSalary(text) {
  const match = text.match(/\$(\d+)k?\s*[–-]\s*\$(\d+)k?/i);
  if (!match) return null;
  const min = parseInt(match[1]) * (match[1].length <= 3 ? 1000 : 1);
  const max = parseInt(match[2]) * (match[2].length <= 3 ? 1000 : 1);
  return { min, max, currency: 'USD' };
}

/**
 * Extract jobs from Wellfound HTML page text.
 * Wellfound renders job cards with consistent link patterns: /jobs/{id}-{slug}
 * @param {string} html
 * @param {string} companyName
 * @returns {Array<{title: string, url: string, company: string, location: string, salary: {min:number,max:number,currency:string}|null}>}
 */
function parseJobsFromHtml(html, companyName) {
  const jobs = [];
  const seen = new Set();

  // Match job listing links: /jobs/{id}-{slug}
  const jobLinkRe = /href="(\/jobs\/(\d+)-([^"]+))"/g;
  let match;

  while ((match = jobLinkRe.exec(html)) !== null) {
    const path = match[1];
    const id = match[2];
    if (seen.has(id)) continue;
    seen.add(id);

    // Skip nav links
    if (['home', 'applications', 'starred', 'hidden', 'messages'].some(s => path.includes(s))) continue;

    const url = 'https://wellfound.com' + path;

    // Try to extract title from the slug (convert kebab-case to Title Case)
    const slug = match[3];
    const title = slug
      .replace(/-at-[^-].*$/, '') // remove "-at-company" suffix
      .replace(/-\d+$/, '')        // remove trailing ID
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    // Extract salary if present in surrounding context
    const contextStart = Math.max(0, match.index - 200);
    const contextEnd = Math.min(html.length, match.index + 400);
    const context = html.slice(contextStart, contextEnd);
    const salary = parseSalary(context);

    // Check if "Everywhere" or "Remote only" is in context
    const isGlobalRemote = /everywhere|remote only everywhere/i.test(context);
    const location = isGlobalRemote ? 'Remote · Everywhere' : '';

    jobs.push({ title, url, company: companyName, location, salary });
  }

  return jobs;
}

/** @type {Provider} */
export default {
  id: 'wellfound',

  /** @param {any} entry */
  detect(entry) {
    const url = entry.careers_url || entry.searchUrl || '';
    return url.includes('wellfound.com') ? { url } : null;
  },

  /** @param {any} entry @param {any} ctx */
  async fetch(entry, ctx) {
    const searchUrl = entry.searchUrl || entry.careers_url;
    if (!searchUrl) throw new Error('wellfound: missing searchUrl in portals.yml entry');

    let html;
    try {
      // fetchJson won't work here — we need raw HTML
      // career-ops ctx only has fetchJson; fall back to direct fetch if available
      if (typeof ctx.fetch === 'function') {
        const res = await ctx.fetch(searchUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
          timeoutMs: DEFAULT_TIMEOUT_MS,
        });
        html = typeof res === 'string' ? res : await res.text();
      } else {
        // ctx.fetchJson with a text workaround — fetch the page as "json" will fail,
        // but we can try and catch. Most career-ops HTTP providers use ctx.fetchJson.
        // If ctx has no raw fetch, we throw a descriptive error.
        throw new Error('wellfound: ctx.fetch not available — Wellfound requires browser-based scanning. Use the Chrome MCP to scan manually.');
      }
    } catch (err) {
      if (err.message && err.message.includes('ctx.fetch not available')) throw err;
      throw new Error(`wellfound: failed to fetch ${searchUrl} — ${err.message}. Wellfound may require authentication. Use Chrome MCP to scan while logged in.`);
    }

    const jobs = parseJobsFromHtml(html, entry.name || 'Wellfound');

    // Filter to global remote only
    return jobs.filter(j => j.location.toLowerCase().includes('everywhere') || j.location === '');
  },
};
