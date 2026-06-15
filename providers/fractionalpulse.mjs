// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Fractional Pulse provider — fractionalpulse.com/jobs, an aggregator of
// fractional / interim executive roles (CFO, COO, Head of Finance/Ops, etc.).
//
// The /jobs listing is server-rendered (no JS, no pagination — all current roles
// on one page). Each role is an anchor:
//
//   <a href="/jobs/{slug}/" class="job-item" data-role="cfo" data-remote="true|false"
//      data-company="..." data-title="...">
//     <div class="job-item__company">Acme</div>
//     <div class="job-item__title">Fractional CFO</div>
//     <div class="job-item__meta">
//       <span class="job-item__tag job-item__tag--remote">Remote</span>     <- remote roles
//       <span class="job-item__tag job-item__tag--location">Dallas, TX, US</span> <- on-site
//       <span class="job-item__tag job-item__tag--role">CFO</span>
//       <span class="job-item__date">Jun 12, 2026</span>
//     </div>
//   </a>
//
// LOCATION CAVEAT (the reason this provider isn't a one-liner): the board is
// US-centric. On-site roles list an explicit US city (the location filter blocks
// them). But remote roles are tagged only "Remote" with NO country, even though
// nearly all are US-remote — so emitting a bare "Remote" would wrongly PASS the
// location filter and flood the pipeline with US roles Remo can't take. Each
// detail page, however, carries a JSON-LD JobPosting with the employer country
// (jobLocation.address.addressCountry / applicantLocationRequirements). So for
// remote roles we fetch the detail page and emit "Remote, {Country}" — US-remote
// then matches the "Remote, United States" block keyword and is dropped, while a
// genuine non-US remote role survives on the "Remote" allow keyword.
//
// Detail fetches are bounded (fractionalpulse_max_detail, default 80) and run
// with limited concurrency. On a detail-fetch failure we fall back to the
// conservative "Remote, United States" (block) rather than a bare "Remote" — a
// US-centric board means a false block is far less harmful than a flood, and the
// role retries next scan.
//
//   - name: Fractional Pulse (fractional job board)
//     provider: fractionalpulse
//     careers_url: https://fractionalpulse.com/jobs
//     enabled: true

import { toEpochMs } from './_http.mjs';

const LIST_URL = 'https://fractionalpulse.com/jobs';
const ORIGIN = 'https://fractionalpulse.com';
const DEFAULT_MAX_DETAIL = 80;
const DETAIL_CONCURRENCY = 6;
const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

// Normalize a country code/name into the wording the location filter expects.
// US must read "United States" so it hits the "Remote, United States" block key.
function normalizeCountry(raw) {
  const v = decodeEntities(String(raw || '')).trim();
  if (!v) return '';
  if (/^(us|usa|u\.s\.a?\.?|united states.*|america)$/i.test(v)) return 'United States';
  if (/^(uk|gb|u\.k\.|united kingdom|great britain|england)$/i.test(v)) return 'United Kingdom';
  if (/^(ch|switzerland|suisse|schweiz)$/i.test(v)) return 'Switzerland';
  if (/^(de|germany|deutschland)$/i.test(v)) return 'Germany';
  if (/^(ca|canada)$/i.test(v)) return 'Canada';
  return v; // emit as-is for anything else
}

// Pull the employer/eligibility country out of a detail page's JSON-LD JobPosting.
function extractCountry(html) {
  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let data;
    try { data = JSON.parse(b[1]); } catch { continue; }
    const nodes = Array.isArray(data) ? data : (Array.isArray(data['@graph']) ? data['@graph'] : [data]);
    for (const node of nodes) {
      if (!node || !/JobPosting/i.test(String(node['@type'] || ''))) continue;
      // Prefer explicit remote-eligibility region, then the employer address country.
      const alr = node.applicantLocationRequirements;
      const alrName = Array.isArray(alr) ? alr[0]?.name : alr?.name;
      if (alrName) return normalizeCountry(alrName);
      const loc = Array.isArray(node.jobLocation) ? node.jobLocation[0] : node.jobLocation;
      const country = loc?.address?.addressCountry;
      const countryName = typeof country === 'object' ? (country.name || country['@id']) : country;
      if (countryName) return normalizeCountry(countryName);
    }
  }
  return '';
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

/** @type {Provider} */
export default {
  id: 'fractionalpulse',

  detect(entry) {
    return /fractionalpulse\.com/i.test(entry.careers_url || '') ? { url: LIST_URL } : null;
  },

  async fetch(entry, ctx) {
    const html = await ctx.fetchText(LIST_URL, { headers: BROWSER_HEADERS });

    const cards = [...html.matchAll(
      /<a[^>]+href="(\/jobs\/[^"/][^"]*\/)"[^>]*class="job-item"[^>]*>([\s\S]*?)<\/a>/gi
    )];

    const parsed = cards.map(([full, href, inner]) => {
      const company = decodeEntities((inner.match(/job-item__company">([^<]+)</i) || [])[1]);
      const title = decodeEntities((inner.match(/job-item__title">([^<]+)</i) || [])[1]);
      const dateStr = (inner.match(/job-item__date">([^<]+)</i) || [])[1] || '';
      const remote = /data-remote="true"/i.test(full);
      // On-site listing city: the meta tag that is neither the role tag nor the remote tag.
      const tags = [...inner.matchAll(/job-item__tag(--[a-z]+)?"[^>]*>([^<]+)</gi)]
        .map(m => ({ cls: m[1] || '', txt: decodeEntities(m[2]) }));
      const cityTag = tags.find(t => t.cls !== '--role' && t.cls !== '--remote');
      return {
        url: ORIGIN + href,
        company,
        title,
        postedAt: toEpochMs(dateStr),
        remote,
        listingCity: cityTag ? cityTag.txt : '',
      };
    }).filter(p => p.title && p.url);

    // On-site roles already carry a city (US cities get blocked downstream).
    for (const p of parsed.filter(p => !p.remote)) p.location = p.listingCity;

    // Remote roles: resolve the real country from the detail JSON-LD so US-remote
    // is blocked and genuine non-US remote survives.
    const maxDetail = Number.isInteger(entry.fractionalpulse_max_detail) && entry.fractionalpulse_max_detail >= 0
      ? entry.fractionalpulse_max_detail
      : DEFAULT_MAX_DETAIL;
    const remoteRoles = parsed.filter(p => p.remote);
    const toEnrich = remoteRoles.slice(0, maxDetail);
    const overflow = remoteRoles.slice(maxDetail);

    await mapLimit(toEnrich, DETAIL_CONCURRENCY, async (p) => {
      try {
        const detail = await ctx.fetchText(p.url, { headers: BROWSER_HEADERS });
        const country = extractCountry(detail);
        p.location = country ? `Remote, ${country}` : 'Remote, United States';
      } catch {
        p.location = 'Remote, United States'; // conservative: block rather than flood
      }
    });
    // Anything past the cap: conservative block (board is US-centric).
    for (const p of overflow) p.location = 'Remote, United States';

    return parsed.map(({ title, url, company, location, postedAt }) => ({
      title, url, company, location: location || '', postedAt,
    }));
  },
};
