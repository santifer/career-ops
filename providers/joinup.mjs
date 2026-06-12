// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// joinup.ch provider — Swiss startup job platform (Typesense-backed Next.js).
//
// The browse page server-renders the newest page of results into __NEXT_DATA__
// at props.pageProps.serverState.initialResults.jobs.results[0].hits[]. The
// full board (~1000 jobs) lives behind a Typesense search key that is injected
// at runtime (not in the static bundle), so we read the SSR'd newest page —
// since results are created-DESC this reliably catches the latest postings,
// which is what a periodic scan needs. Most older joinup roles are also tracked
// directly via their company's ATS (Getro/Personio/Ashby/etc.).
//
// Each hit: { title|headline, startup (employer), slug, location, created }.
// Public posting URL: https://joinup.ch/job/{slug}
//
// Auto-detects from a careers_url containing `joinup.ch`.

// Normalize an ISO-8601 string or epoch (seconds/ms) to epoch ms; undefined
// when missing or unparseable (matches the optional Job.postedAt typedef).
function toEpochMs(value) {
  if (value == null) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

const BROWSE_URL = 'https://joinup.ch/browse/jobs';

/** @type {Provider} */
export default {
  id: 'joinup',

  detect(entry) {
    const url = entry.careers_url || '';
    return /joinup\.ch/i.test(url) ? { url: BROWSE_URL } : null;
  },

  async fetch(entry, ctx) {
    const html = await ctx.fetchText(BROWSE_URL);
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return [];
    let hits = [];
    try {
      const data = JSON.parse(m[1]);
      const ir = data?.props?.pageProps?.serverState?.initialResults?.jobs?.results;
      hits = Array.isArray(ir) && ir[0]?.hits ? ir[0].hits : [];
    } catch {
      return [];
    }
    return hits
      .filter(h => h && h.slug && (h.title || h.headline))
      .map(h => ({
        title: h.title || h.headline || '',
        url: `https://joinup.ch/job/${h.slug}`,
        company: h.startup || entry.name || '',
        location: typeof h.location === 'string' ? h.location
          : (h.location?.name || h.location?.city || ''),
        postedAt: toEpochMs(h.created),
      }));
  },
};
