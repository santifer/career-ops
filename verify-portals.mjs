#!/usr/bin/env node

/**
 * verify-portals.mjs — ATS slug validator for portals.yml.
 *
 * When a company is added to portals.yml, its ATS slug (the path segment in
 * `careers_url`, e.g. `jobs.lever.co/<slug>`) is easy to guess wrong — and a
 * wrong slug 404s silently on every future scan, so the company never appears
 * in results and the mistake is invisible. This script probes the public
 * Greenhouse / Ashby / Lever endpoints for a company's slug (or for candidate
 * slugs derived from its name) and reports which resolve.
 *
 * A 200 that returns an empty job list is reported as 'live but empty' — a
 * legitimate state during between-hires periods — kept distinct from an
 * unresolved (404/wrong) slug so a quiet board isn't mistaken for a typo.
 *
 * Usage:
 *   node verify-portals.mjs                 # sweep tracked_companies in portals.yml
 *   node verify-portals.mjs --add cursor    # probe slug variants for one name
 *   node verify-portals.mjs --strict        # exit non-zero if any slug is unresolved
 *   node verify-portals.mjs --file <path>   # use a specific portals file
 *
 * Network: only the sweep / --add paths hit the network. Importing the module
 * (for tests) runs nothing — main() is guarded — and all network access goes
 * through an injectable `fetchJson`, so the pure logic is testable offline.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import yaml from 'js-yaml';

import { fetchJson as defaultFetchJson } from './providers/_http.mjs';

const DEFAULT_PORTALS_PATH = process.env.CAREER_OPS_PORTALS || 'portals.yml';

// How to turn a slug into a probe URL, and where the job list lives in the
// response, for each supported ATS. Greenhouse/Ashby wrap jobs in `{ jobs }`;
// Lever returns a bare array. `includeCompensation` mirrors the ashby provider.
export const ATS = {
  greenhouse: {
    probeUrl: (slug) =>
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
    jobCount: (json) => (Array.isArray(json?.jobs) ? json.jobs.length : null),
  },
  ashby: {
    probeUrl: (slug) =>
      `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`,
    jobCount: (json) => (Array.isArray(json?.jobs) ? json.jobs.length : null),
  },
  lever: {
    probeUrl: (slug) => `https://api.lever.co/v0/postings/${slug}`,
    jobCount: (json) => (Array.isArray(json) ? json.length : null),
  },
};

// Recognize an ATS + slug from a careers_url OR an `api:` URL. The careers_url
// patterns mirror the provider `resolveApiUrl` regexes; the api-URL patterns
// cover entries that pin the resolved endpoint directly. First match wins.
const ATS_URL_PATTERNS = [
  {
    ats: 'greenhouse',
    re: /boards-api\.greenhouse\.io\/v1\/boards\/([^/?#]+)/,
  },
  { ats: 'greenhouse', re: /job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/ },
  { ats: 'greenhouse', re: /boards\.greenhouse\.io\/([^/?#]+)/ },
  { ats: 'ashby', re: /api\.ashbyhq\.com\/posting-api\/job-board\/([^/?#]+)/ },
  { ats: 'ashby', re: /jobs\.ashbyhq\.com\/([^/?#]+)/ },
  { ats: 'lever', re: /api\.lever\.co\/v0\/postings\/([^/?#]+)/ },
  { ats: 'lever', re: /jobs\.lever\.co\/([^/?#]+)/ },
];

/**
 * Identify the ATS and slug embedded in a careers_url or api URL.
 *
 * @param {string} url - A `careers_url` or `api` value from portals.yml.
 * @returns {{ats: string, slug: string}|null} Match, or null for non-ATS URLs
 *   (branded careers pages, Workday, job boards, etc.) which this tool skips.
 */
export function parseAtsSlug(url) {
  const text = String(url || '');
  for (const { ats, re } of ATS_URL_PATTERNS) {
    const m = text.match(re);
    if (m && m[1]) return { ats, slug: m[1] };
  }
  return null;
}

/**
 * Derive candidate ATS slugs from a company name.
 *
 * Slugs are conventionally the company name lowercased with separators dropped
 * or dashed, so we generate the common shapes plus the first word alone (many
 * boards use just the brand, e.g. 'Acme Corp' → 'acme'). Order is deterministic
 * and duplicates are removed so `--add` probes each distinct candidate once.
 *
 * @param {string} name - Company display name.
 * @returns {string[]} Distinct candidate slugs, most-specific first.
 */
const SLUG_SUFFIXES = ['ai', 'tech', 'io', 'hq', 'labs'];

export function deriveSlugCandidates(name) {
  const lower = String(name || '')
    .toLowerCase()
    .trim();
  if (!lower) return [];
  const words = lower
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (words.length === 0) return [];
  const candidates = [
    words.join(''), // acmecorp
    words.join('-'), // acme-corp
    words.join('_'), // acme_corp
    words[0], // acme
  ];
  const bases = [words.join(''), words[0]].filter(Boolean);
  for (const base of bases) {
    for (const suf of SLUG_SUFFIXES) candidates.push(`${base}${suf}`);
    candidates.push(`${base}.tech`, `${base}.io`);
  }
  return [...new Set(candidates)].filter(Boolean);
}

/**
 * Classify a fetch/probe failure for scan summaries and slug diagnostics.
 *
 * @param {Error|{status?: number, name?: string, message?: string}|null|undefined} err
 * @returns {'slug_gone'|'auth'|'network'|'server'|'unknown'}
 */
export function classifyFetchError(err) {
  if (!err) return 'unknown';
  if (err.name === 'AbortError') return 'network';
  const msg = String(err.message || err);
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network/i.test(msg)) {
    return 'network';
  }
  const status = err.status;
  if (status === 404 || status === 410) return 'slug_gone';
  if (status === 401 || status === 403) return 'auth';
  if (typeof status === 'number' && status >= 500) return 'server';
  if (/HTTP 404|HTTP 410/.test(msg)) return 'slug_gone';
  if (/HTTP 401|HTTP 403/.test(msg)) return 'auth';
  if (/HTTP 5\d\d/.test(msg)) return 'server';
  return 'unknown';
}

/**
 * Probe one ATS for one slug and classify the result.
 *
 * @param {string} ats - Key into ATS (greenhouse | ashby | lever).
 * @param {string} slug - Candidate slug to probe.
 * @param {{fetchJson?: Function}} [deps] - Injectable HTTP for testability.
 * @returns {Promise<{ats,slug,url,status,jobCount?,httpStatus?,errorKind?,reason?}>}
 *   status is 'live' (jobs > 0), 'empty' (200, no jobs), or 'missing'
 *   (404/error/unexpected shape).
 */
export async function probeSlug(
  ats,
  slug,
  { fetchJson = defaultFetchJson } = {},
) {
  const spec = ATS[ats];
  if (!spec)
    return {
      ats,
      slug,
      url: '',
      status: 'missing',
      errorKind: 'unknown',
      reason: `unknown ATS: ${ats}`,
    };
  const url = spec.probeUrl(slug);
  try {
    const json = await fetchJson(url);
    const count = spec.jobCount(json);
    if (count == null)
      return {
        ats,
        slug,
        url,
        status: 'missing',
        errorKind: 'unknown',
        reason: 'unexpected response shape',
      };
    return {
      ats,
      slug,
      url,
      status: count > 0 ? 'live' : 'empty',
      jobCount: count,
    };
  } catch (err) {
    return {
      ats,
      slug,
      url,
      status: 'missing',
      errorKind: classifyFetchError(err),
      httpStatus: err?.status,
      reason: err?.message || String(err),
    };
  }
}

/** Probe slug variants across all ATSes; prefer live boards over empty ones. */
async function discoverAlternates(name, { fetchJson }) {
  let bestEmpty = null;
  for (const slug of deriveSlugCandidates(name)) {
    for (const ats of Object.keys(ATS)) {
      const r = await probeSlug(ats, slug, { fetchJson });
      if (r.status === 'live') return r;
      if (r.status === 'empty' && !bestEmpty) bestEmpty = r;
    }
  }
  return bestEmpty;
}

/**
 * Verify the ATS slug of each enabled tracked company.
 *
 * Companies whose careers_url/api is not a recognized ATS (branded pages,
 * Workday, job boards, websearch) are reported as `skipped` — out of scope for
 * slug probing, not failures. Probing is sequential to stay gentle on Ashby's
 * rate limit.
 *
 * @param {Array<object>} companies - tracked_companies entries.
 * @param {{fetchJson?: Function}} [deps]
 * @returns {Promise<Array<object>>} One result row per company.
 */
export async function verifyCompanies(
  companies,
  { fetchJson = defaultFetchJson } = {},
) {
  const list = Array.isArray(companies) ? companies : [];
  const results = [];
  for (const company of list) {
    if (!company || typeof company !== 'object') continue;
    if (company.enabled === false) continue;
    const name = typeof company.name === 'string' ? company.name : '(unnamed)';
    const match =
      parseAtsSlug(company.api) || parseAtsSlug(company.careers_url);
    if (!match) {
      results.push({
        name,
        status: 'skipped',
        reason: 'no Greenhouse/Ashby/Lever slug in careers_url or api',
      });
      continue;
    }
    const probe = await probeSlug(match.ats, match.slug, { fetchJson });
    if (probe.status === 'live' || probe.status === 'empty') {
      results.push({ name, ...probe });
      continue;
    }
    // Wrong slug or ATS migration — cross-probe only for slug/unknown failures.
    if (probe.errorKind === 'slug_gone' || probe.errorKind === 'unknown') {
      const suggested = await discoverAlternates(name, { fetchJson });
      if (suggested) {
        results.push({ name, ...probe, suggested });
        continue;
      }
    }
    results.push({ name, ...probe });
  }
  return results;
}

/**
 * Read a portals file and verify its tracked companies' slugs.
 *
 * @param {string} filePath - Path to a portals.yml.
 * @param {{fetchJson?: Function}} [deps]
 * @returns {Promise<{found: boolean, results: Array<object>}>} found=false when
 *   the file is absent (a graceful no-op for fresh setups / CI).
 */
export async function verifyPortalsFile(
  filePath,
  { fetchJson = defaultFetchJson } = {},
) {
  if (!existsSync(filePath)) return { found: false, results: [] };
  const config = yaml.load(readFileSync(filePath, 'utf-8'));
  const companies = Array.isArray(config?.tracked_companies)
    ? config.tracked_companies
    : [];
  const results = await verifyCompanies(companies, { fetchJson });
  return { found: true, results };
}

const ICON = { live: '✅', empty: '🟡', missing: '❌', skipped: '➖' };

const ERROR_KIND_LABEL = {
  slug_gone: 'slug not found',
  auth: 'auth blocked',
  network: 'network error',
  server: 'server error',
  unknown: 'unresolved',
};

function printResults(results) {
  for (const r of results) {
    const icon = ICON[r.status] || '?';
    let detail;
    if (r.status === 'live') {
      detail = `${r.ats}/${r.slug} (${r.jobCount} live)`;
    } else if (r.status === 'empty') {
      detail = `${r.ats}/${r.slug} (live but empty)`;
    } else if (r.status === 'missing') {
      const kind = ERROR_KIND_LABEL[r.errorKind] || 'unresolved';
      detail = `${r.ats || '?'}/${r.slug || '?'} (${kind}) — ${r.reason || 'unresolved'}`;
      if (r.suggested) {
        detail += ` → try ${r.suggested.ats}/${r.suggested.slug}`;
      }
    } else {
      detail = r.reason || '';
    }
    console.log(`  ${icon} ${r.name} — ${detail}`);
  }
}

async function runAdd(name, { fetchJson }) {
  const candidates = deriveSlugCandidates(name);
  if (candidates.length === 0) {
    console.error('verify-portals: --add needs a company name');
    process.exit(1);
  }
  console.log(
    `Probing ${candidates.length} slug candidate(s) for '${name}' across Greenhouse/Ashby/Lever...\n`,
  );
  const hits = [];
  for (const slug of candidates) {
    for (const ats of Object.keys(ATS)) {
      const r = await probeSlug(ats, slug, { fetchJson });
      if (r.status !== 'missing') {
        hits.push(r);
        console.log(
          `  ${ICON[r.status]} ${ats}: ${slug}` +
            (r.status === 'empty'
              ? ' (live but empty)'
              : ` (${r.jobCount} jobs)`),
        );
      }
    }
  }
  if (hits.length === 0) {
    console.log(
      '  ❌ No slug variant resolved on any ATS. Check the careers_url manually.',
    );
  } else {
    const best = hits.find((h) => h.status === 'live') || hits[0];
    console.log(
      `\nSuggested: careers_url for ${best.ats} → slug '${best.slug}'`,
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const fetchJson = defaultFetchJson;

  const addFlag = args.indexOf('--add');
  if (addFlag !== -1) {
    await runAdd(args[addFlag + 1] || '', { fetchJson });
    return;
  }

  const fileFlag = args.indexOf('--file');
  const filePath = resolve(
    fileFlag === -1 ? DEFAULT_PORTALS_PATH : args[fileFlag + 1] || '',
  );

  const { found, results } = await verifyPortalsFile(filePath, { fetchJson });
  if (!found) {
    // Graceful no-op: fresh setups (and CI, which ships no portals.yml) have
    // nothing to verify. Not an error.
    console.log(
      `verify-portals: no portals file at ${filePath} — nothing to verify (run onboarding first).`,
    );
    return;
  }

  console.log(`verify-portals: ${filePath}\n`);
  printResults(results);

  const live = results.filter((r) => r.status === 'live').length;
  const empty = results.filter((r) => r.status === 'empty').length;
  const missing = results.filter((r) => r.status === 'missing');
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const kindCounts = Object.fromEntries(
    Object.keys(ERROR_KIND_LABEL).map((k) => [k, 0]),
  );
  for (const r of missing) {
    const k = r.errorKind && ERROR_KIND_LABEL[r.errorKind] ? r.errorKind : 'unknown';
    kindCounts[k]++;
  }
  const breakdown = Object.entries(kindCounts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${ERROR_KIND_LABEL[k]}`)
    .join(', ');
  console.log(
    `\n${live} live, ${empty} live-but-empty, ${missing.length} unresolved${breakdown ? ` (${breakdown})` : ''}, ${skipped} non-ATS (skipped)`,
  );

  if (strict && missing.length > 0) {
    console.log('🔴 Unresolved slugs found (--strict).');
    process.exit(1);
  }
}

// Only run main() when invoked directly (`node verify-portals.mjs`), not when
// imported by tests. `|| ''` guards `node -e` invocations with no script arg.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error(`verify-portals failed: ${err.message}`);
    process.exit(1);
  });
}
