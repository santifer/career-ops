/**
 * workable.mjs — Workable ATS provider for career-ops scanner.
 *
 * Detects from a Workable URL in entry.api or entry.careers_url:
 *   https://apply.workable.com/{slug}/                       (public board)
 *   https://apply.workable.com/api/v3/accounts/{slug}/jobs   (API)
 *   https://{slug}.workable.com/...                          (legacy subdomain)
 *
 * Companies whose corporate careers_url is not a Workable URL should set
 * `provider: workable` plus `workable: { slug: nuvei }` (or an `api:` pointing
 * at the apply.workable.com board).
 *
 * API: POST https://apply.workable.com/api/v3/accounts/{slug}/jobs
 *      body {} for page 1; { token: nextPage } for subsequent pages.
 * Response: { total, results: [{ title, location, shortcode }], nextPage }
 * Public job URL: https://apply.workable.com/{slug}/j/{shortcode}/
 */

const ACCOUNTS_RE = /apply\.workable\.com\/api\/v3\/accounts\/([^/?#\s]+)/i;
const BOARD_RE = /apply\.workable\.com\/([^/?#\s]+)/i;
const SUBDOMAIN_RE = /(?:https?:\/\/)?([a-z0-9-]+)\.workable\.com/i;

const MAX_PAGES = 50; // safety cap

function slugFrom(entry) {
  if (entry.workable && entry.workable.slug) return entry.workable.slug;

  for (const url of [entry.api, entry.careers_url]) {
    if (!url) continue;
    const acc = url.match(ACCOUNTS_RE);
    if (acc) return acc[1];
    const board = url.match(BOARD_RE);
    if (board) return board[1];
    const sub = url.match(SUBDOMAIN_RE);
    if (sub && !['apply', 'www', 'jobs'].includes(sub[1].toLowerCase())) return sub[1];
  }
  return null;
}

// Workable's location field is sometimes a string, sometimes an object.
function locationOf(loc) {
  if (!loc) return '';
  if (typeof loc === 'string') return loc;
  return loc.display || [loc.city, loc.region, loc.country].filter(Boolean).join(', ') || '';
}

export default {
  id: 'workable',

  detect(entry) {
    return slugFrom(entry) ? {} : null;
  },

  async fetch(entry, ctx) {
    const slug = slugFrom(entry);
    if (!slug) throw new Error(`workable: cannot determine slug for "${entry.name}"`);

    const apiUrl = `https://apply.workable.com/api/v3/accounts/${slug}/jobs`;
    const out = [];
    let token = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const body = token ? { token } : {};
      const data = await ctx.post(apiUrl, body);

      const results = Array.isArray(data?.results) ? data.results : [];
      if (results.length === 0) break;

      for (const j of results) {
        out.push({
          title: j.title || '',
          url: j.shortcode ? `https://apply.workable.com/${slug}/j/${j.shortcode}/` : '',
          company: entry.name,
          location: locationOf(j.location),
        });
      }

      token = data?.nextPage;
      if (!token) break;
    }

    return out.filter(j => j.title && j.url);
  },
};
