/**
 * workday.mjs — Workday ATS provider for career-ops scanner.
 *
 * Detects from a Workday-hosted URL in entry.api or entry.careers_url:
 *   https://{tenant}.{shard}.myworkdayjobs.com/{site}
 *   https://{tenant}.{shard}.myworkdayjobs.com/en-US/{site}
 *   https://{tenant}.{shard}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
 *
 * Companies whose corporate careers_url is NOT a myworkdayjobs.com URL
 * (e.g. CrowdStrike at crowdstrike.com/careers) should set `provider: workday`
 * plus an `api:` field pointing at their Workday board, or a `workday:` override:
 *
 *   - name: CrowdStrike
 *     provider: workday
 *     api: https://crowdstrike.wd5.myworkdayjobs.com/crowdstrikecareers
 *   # or explicit:
 *   - name: CrowdStrike
 *     provider: workday
 *     workday: { host: crowdstrike.wd5.myworkdayjobs.com, tenant: crowdstrike, site: crowdstrikecareers }
 *
 * API: POST https://{host}/wday/cxs/{tenant}/{site}/jobs
 *      body { appliedFacets:{}, limit, offset, searchText:"" } — paginate by offset.
 * Response: { total, jobPostings: [{ title, externalPath, locationsText }] }
 * Public job URL: https://{host}/{site}{externalPath}
 */

const HOST_RE = /([a-z0-9-]+)\.([a-z0-9-]+)\.myworkdayjobs\.com/i;
const CXS_RE = /\/wday\/cxs\/([^/]+)\/([^/]+)\/jobs/i;
// Locale segments like en-US, en-GB, fr-CA — skipped when reading the site path.
const LOCALE_RE = /^[a-z]{2}-[A-Za-z]{2,}$/;

const PAGE_SIZE = 20;
const MAX_PAGES = 50; // safety cap (1000 postings)

// Resolve { host, tenant, site } from an explicit override or a Workday URL.
function resolve(entry) {
  const o = entry.workday;
  if (o && o.host && o.tenant && o.site) {
    return { host: o.host, tenant: o.tenant, site: o.site };
  }

  const url = entry.api || entry.careers_url || '';
  const hostMatch = url.match(HOST_RE);
  if (!hostMatch) return null;
  const host = hostMatch[0];
  const tenantFromHost = hostMatch[1];

  // Explicit cxs URL carries tenant + site directly.
  const cxs = url.match(CXS_RE);
  if (cxs) return { host, tenant: cxs[1], site: cxs[2] };

  // Otherwise derive site from the path: first non-locale segment after host.
  const path = url.slice(url.indexOf(host) + host.length).split(/[?#]/)[0];
  const segs = path.split('/').filter(Boolean).filter(s => !LOCALE_RE.test(s));
  const site = segs[0];
  if (!site) return null;

  const tenant = (o && o.tenant) || tenantFromHost;
  return { host, tenant, site };
}

export default {
  id: 'workday',

  detect(entry) {
    return resolve(entry) ? {} : null;
  },

  async fetch(entry, ctx) {
    const r = resolve(entry);
    if (!r) throw new Error(`workday: cannot determine board for "${entry.name}"`);
    const { host, tenant, site } = r;

    const apiUrl = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
    const out = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * PAGE_SIZE;
      const data = await ctx.post(apiUrl, {
        appliedFacets: {},
        limit: PAGE_SIZE,
        offset,
        searchText: '',
      });

      const postings = Array.isArray(data?.jobPostings) ? data.jobPostings : [];
      if (postings.length === 0) break;

      for (const p of postings) {
        const ext = p.externalPath || '';
        out.push({
          title: p.title || '',
          url: ext ? `https://${host}/${site}${ext}` : '',
          company: entry.name,
          location: p.locationsText || '',
        });
      }

      const total = Number(data?.total) || 0;
      if (offset + PAGE_SIZE >= total) break;
    }

    return out.filter(j => j.title && j.url);
  },
};
