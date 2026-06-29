/**
 * url-key.mjs — canonical posting-URL key for deterministic tracker dedup.
 *
 * Two URLs that point to the same job posting must produce the same key so the
 * merge can upsert on it (the stable natural key — see merge-tracker.mjs Pass 0).
 *
 * UNDER-STRIP ON PURPOSE. The two failure modes are asymmetric:
 *   - over-normalizing collapses two genuinely different postings into one key
 *     → a SILENT merge / data loss (the exact bug this whole change fixes);
 *   - under-normalizing leaves two spellings of the SAME posting as two keys
 *     → a VISIBLE duplicate row you can see and fix.
 * So we strip only a denylist of known tracking params, lowercase the host,
 * force https, drop the fragment + a trailing slash, and sort the remaining
 * query — and KEEP every functional query param (e.g. gh_jid, which on some
 * corporate-hosted Greenhouse boards is the canonical posting id).
 *
 * Used by merge-tracker.mjs. Kept in its own module so scan.mjs / scan-history
 * can adopt the same key later without the definitions drifting.
 */

// Query params that identify a click/campaign, never the posting itself.
const TRACKING_PARAMS = [
  /^utm_/i, /^gh_src$/i, /^ref$/i, /^source$/i, /^src$/i, /^fbclid$/i, /^gclid$/i,
  /^mc_cid$/i, /^mc_eid$/i, /^igshid$/i, /^_hsenc$/i, /^_hsmi$/i, /^trk$/i, /^trackingid$/i,
];

/**
 * Reduce a posting URL to a stable comparison key.
 *
 * @param {string} raw - A posting URL (or any string) from a tracker row / TSV.
 * @returns {string} A normalized key, or '' when there is nothing to key on.
 */
export function normalizeUrl(raw) {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!s) return '';

  let u;
  try {
    u = new URL(s);
  } catch {
    // Not a parseable absolute URL (e.g. a `local:jds/...` pipeline reference).
    // Fall back to a lowercased string so identical spellings still match.
    return s.toLowerCase();
  }

  // Only http(s) postings get URL-shaped normalization; anything else keys as-is.
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return s.toLowerCase();

  u.protocol = 'https:';            // http vs https is the same posting
  u.hostname = u.hostname.toLowerCase();
  u.hash = '';                      // fragments never identify the posting

  // Drop tracking params, keep functional ones, sort for order-independence.
  const keep = [];
  for (const [k, v] of u.searchParams.entries()) {
    if (!TRACKING_PARAMS.some((re) => re.test(k))) keep.push([k, v]);
  }
  keep.sort((x, y) => (x[0] !== y[0] ? (x[0] < y[0] ? -1 : 1) : (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0)));
  u.search = '';
  for (const [k, v] of keep) u.searchParams.append(k, v);

  // Drop a single trailing slash on the path (but never the root "/").
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.slice(0, -1);
  }

  return u.toString();
}

export default normalizeUrl;
