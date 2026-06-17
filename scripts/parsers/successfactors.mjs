// @ts-check
/**
 * Generic SAP SuccessFactors career-site parser.
 *
 * Zero-token Level-0 source for scan.mjs. SuccessFactors career sites (SAP's
 * own ATS, used by many German employers — Fraunhofer, and others) serve a
 * paginated server-rendered job list at `{base}/search/?startrow=N` in steps of
 * 25. Each job is a `<tr class="data-row">` with a `jobTitle-link` (title+href),
 * `jobShifttype` (location/city) and `jobFacility` (department/institute).
 *
 * This parser ENUMERATES ALL PAGES (loops startrow until exhausted), unlike a
 * first-page Playwright snapshot — so it returns every posting, not page 1.
 *
 * One parser covers any SF tenant: pass the search base URL as the first arg
 * (portals.yml `parser.args: ['{careers_url}']`) or via env SF_BASE. The company
 * label comes from the second arg / env SF_COMPANY / the portals.yml entry name.
 *
 * scan.mjs applies title_filter + location_filter + dedup afterwards, so this
 * parser over-fetches (recall-first). Logs to stderr; JSON array to stdout.
 *
 * Usage: node successfactors.mjs <searchBaseUrl> [companyLabel]
 */

import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first'); // WSL2/Node fetch can stall on IPv6.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const PAGE_SIZE = 25; // SuccessFactors fixed result-page size
const MAX_PAGES = Number(process.env.SF_MAX_PAGES || 60); // safety cap (60*25 = 1500)
const PER_REQUEST_TIMEOUT_MS = Number(process.env.SF_TIMEOUT_MS || 15_000);

const BASE = process.argv[2] || process.env.SF_BASE || '';
const COMPANY = process.argv[3] || process.env.SF_COMPANY || '';

/** Decode the handful of HTML entities that appear in SF titles. */
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Parse one SuccessFactors search-results HTML page into job objects.
 * Pure + synchronous so it can be unit-tested against a saved fixture.
 * @param {string} html
 * @param {string} origin - e.g. "https://jobs.fraunhofer.de" for absolute URLs
 * @returns {Array<{title:string,url:string,location:string,facility:string,id:string}>}
 */
export function parsePage(html, origin) {
  if (!html) return [];
  const jobs = [];
  const rowRe = /<tr class="data-row">([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(html))) {
    const row = m[1];
    const link = row.match(/<a[^>]*class="jobTitle-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
      || row.match(/<a[^>]*href="([^"]+)"[^>]*class="jobTitle-link"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const href = link[1];
    const title = decodeEntities(link[2].replace(/<[^>]+>/g, ''));
    if (!title) continue;
    const loc = row.match(/class="jobShifttype[^"]*"[^>]*>([\s\S]*?)</i);
    const fac = row.match(/class="jobFacility[^"]*"[^>]*>([\s\S]*?)</i);
    const idMatch = href.match(/\/(\d+)\/?$/);
    let url;
    try { url = new URL(href, origin).href; } catch { continue; }
    jobs.push({
      title,
      url,
      location: loc ? decodeEntities(loc[1].replace(/<[^>]+>/g, '')) : '',
      facility: fac ? decodeEntities(fac[1].replace(/<[^>]+>/g, '')) : '',
      id: idMatch ? idMatch[1] : url,
    });
  }
  return jobs;
}

/**
 * Extract total result count from "<n> von <total>" / "<n> of <total>".
 * The page renders BOTH a results count ("25 von 956") and a pagination label
 * ("1 von 39"); take the MAX so we get the job total (956), not the page count.
 */
export function parseTotal(html) {
  const totals = [...html.matchAll(/\b\d[\d.,]*\s+(?:von|of)\s+([\d.,]+)/gi)]
    .map((m) => Number(m[1].replace(/[.,]/g, '')))
    .filter((n) => Number.isFinite(n));
  return totals.length ? Math.max(...totals) : null;
}

function pageUrl(base, startrow) {
  const u = new URL(base);
  u.searchParams.set('startrow', String(startrow));
  return u.href;
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'de-DE,de;q=0.9' },
      signal: controller.signal,
    });
    if (!res.ok) { console.error(`  ! ${url}: HTTP ${res.status}`); return null; }
    return await res.text();
  } catch (err) {
    console.error(`  ! ${url}: ${err?.message || err}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (!BASE) { console.error('successfactors: no search base URL (arg 1 / SF_BASE)'); process.stdout.write('[]'); return; }
  const origin = new URL(BASE).origin;
  console.error(`SuccessFactors: ${BASE} (company=${COMPANY || '?'}), paginating startrow by ${PAGE_SIZE}`);

  const byId = new Map();
  let total = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const html = await fetchPage(pageUrl(BASE, page * PAGE_SIZE));
    if (!html) break;
    if (total === null) total = parseTotal(html);
    const jobs = parsePage(html, origin);
    if (jobs.length === 0) break; // no more rows
    let added = 0;
    for (const j of jobs) if (!byId.has(j.id)) { byId.set(j.id, j); added++; }
    console.error(`  · startrow ${page * PAGE_SIZE}: ${jobs.length} rows (+${added} new); total so far ${byId.size}${total ? '/' + total : ''}`);
    if (added === 0) break; // page returned only already-seen rows → done
    if (total !== null && byId.size >= total) break;
  }

  const out = [...byId.values()].map(({ id, facility, location, ...rest }) => ({
    ...rest,
    company: COMPANY || '',
    location: [location, facility].filter(Boolean).join(' — '),
  }));
  console.error(`SuccessFactors: ${out.length} jobs from ${COMPANY || BASE}`);
  process.stdout.write(JSON.stringify(out));
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`SuccessFactors parser fatal: ${err?.message || err}`);
    process.stdout.write('[]');
    process.exit(0);
  });
}
