/**
 * scan-sources.mjs — Job discovery source registry
 *
 * Defines the JobSource contract and all built-in ATS API sources.
 * Imported by scan.mjs (runtime) and test-all.mjs (tests).
 *
 * Adding a new source
 * ───────────────────
 * Append one object to SOURCES that satisfies this interface:
 *
 *   name    string   Identifier written to scan-history.tsv
 *   type    string   'ats-api' | 'search' | 'scrape' | 'static'
 *
 *   detect(company) → { url: string } | null
 *     Inspect a portals.yml company entry and return the API endpoint
 *     URL if this source handles it, or null if it doesn't.
 *
 *   fetch(url) → Promise<any>
 *     Retrieve raw data from the resolved endpoint.
 *
 *   parse(data, companyName) → Array<Job>
 *     Convert raw data into jobs. Missing fields are fine —
 *     normalizeJob() will fill defaults after this call.
 *
 * That's it. Nothing else in scan.mjs needs to change.
 */

const FETCH_TIMEOUT_MS = 10_000;

// ── Shared fetch helper ──────────────────────────────────────────────

export async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Output contract ──────────────────────────────────────────────────
//
// Every source.parse() return value passes through normalizeJob().
// This guarantees core logic always receives clean strings, regardless
// of how consistent or inconsistent an individual parser is.

export function normalizeJob(job) {
  return {
    title:    (job.title    || '').trim(),
    url:      (job.url      || '').trim(),
    company:  (job.company  || '').trim(),
    location: (job.location || '').trim(),
  };
}

// ── Source registry ──────────────────────────────────────────────────

export const SOURCES = [
  {
    name: 'greenhouse',
    type: 'ats-api',
    detect(company) {
      if (company.api) {
        try {
          if (new URL(company.api).hostname === 'boards-api.greenhouse.io') {
            return { url: company.api };
          }
        } catch { /* invalid URL — fall through to careers_url inference */ }
      }
      const m = (company.careers_url || '')
        .match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
      if (m) return { url: `https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs` };
      return null;
    },
    fetch: fetchJson,
    parse(json, companyName) {
      return (json.jobs || []).map(j => ({
        title:    j.title || '',
        url:      j.absolute_url || '',
        company:  companyName,
        location: j.location?.name || '',
      }));
    },
  },

  {
    name: 'ashby',
    type: 'ats-api',
    detect(company) {
      const m = (company.careers_url || '').match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
      if (!m) return null;
      return { url: `https://api.ashbyhq.com/posting-api/job-board/${m[1]}?includeCompensation=true` };
    },
    fetch: fetchJson,
    parse(json, companyName) {
      return (json.jobs || []).map(j => ({
        title:    j.title || '',
        url:      j.jobUrl || '',
        company:  companyName,
        location: j.location || '',
      }));
    },
  },

  {
    name: 'lever',
    type: 'ats-api',
    detect(company) {
      const m = (company.careers_url || '').match(/jobs\.lever\.co\/([^/?#]+)/);
      if (!m) return null;
      return { url: `https://api.lever.co/v0/postings/${m[1]}` };
    },
    fetch: fetchJson,
    parse(json, companyName) {
      if (!Array.isArray(json)) return [];
      return json.map(j => ({
        title:    j.text || '',
        url:      j.hostedUrl || '',
        company:  companyName,
        location: j.categories?.location || '',
      }));
    },
  },

  {
    name: 'smartrecruiters',
    type: 'ats-api',
    detect(company) {
      const m = (company.careers_url || '').match(/jobs\.smartrecruiters\.com\/([^/?#]+)/);
      if (!m) return null;
      return { url: `https://api.smartrecruiters.com/v1/companies/${m[1]}/postings?limit=100` };
    },
    fetch: fetchJson,
    parse(json, companyName) {
      return (json.content || []).map(j => ({
        title:    j.name        || '',
        url:      j.postingUrl  || j.ref || '',
        company:  companyName,
        location: [j.location?.city, j.location?.region].filter(Boolean).join(', '),
      }));
    },
  },

  {
    name: 'workable',
    type: 'ats-api',
    detect(company) {
      const m = (company.careers_url || '').match(/apply\.workable\.com\/([^/?#]+)/);
      if (!m) return null;
      return { url: `https://apply.workable.com/api/v1/widget/jobs/${m[1]}` };
    },
    fetch: fetchJson,
    parse(json, companyName) {
      return (json.results || []).map(j => ({
        title:    j.title || '',
        url:      j.url   || '',
        company:  companyName,
        location: j.location?.city || '',
      }));
    },
  },
];

// ── Source resolution ────────────────────────────────────────────────

/**
 * Find the first source that handles a given portals.yml company entry.
 * @param {object} company - Entry from portals.yml tracked_companies
 * @param {string[]} [types] - Optional type filter (e.g. ['ats-api'])
 * @returns {{ source: object, url: string } | null}
 */
export function resolveSource(company, types) {
  for (const source of SOURCES) {
    if (types && !types.includes(source.type)) continue;
    const result = source.detect(company);
    if (result) return { source, url: result.url };
  }
  return null;
}
