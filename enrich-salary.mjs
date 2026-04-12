#!/usr/bin/env node

/**
 * enrich-salary.mjs — Annotate pipeline.md URLs with salary data from ATS APIs.
 *
 * Reads `data/pipeline.md`, groups each URL by its ATS provider
 * (Ashby / Lever / Greenhouse), hits the corresponding public board
 * API, and writes structured salary into `data/salary-cache.json`.
 *
 * Zero Claude API tokens — pure HTTP.
 *
 * Core (no dependencies):
 *   - Ashby   → api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true
 *               (reads compensation.compensationTierSummary; falls back to
 *               regex on descriptionPlain when org opts out of structured comp)
 *   - Lever   → api.lever.co/v0/postings/{slug}?mode=json
 *               (salaryDescription.text / salaryRange.min+max; regex fallback)
 *   - Greenhouse (including proxied hosts: unity.com, databricks.com,
 *               epicgames.com, careers.roblox.com) →
 *               boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
 *               (parses `<div class="pay-range">` from double-HTML-encoded content)
 *   - OpenAI  → openai.com/careers/... maps to Ashby "openai" board
 *   - Amazon  → www.amazon.jobs/en/search.json?base_query={id}
 *               (regex on embedded description text)
 *
 * Advanced (requires Browserless; see --browserless flag):
 *   - Google  → JS-rendered careers SPA, regex on "US base salary range…"
 *   - Apple   → JS-rendered jobs SPA, regex on "base pay range…between $X and $Y"
 *   - Snap    → regex on "base salary range for this position is $X-$Y"
 *   - Datadog → regex on <div class="content-pay-transparency"> HTML
 *
 * Usage:
 *   node enrich-salary.mjs                          # ATS APIs only, offline-safe
 *   node enrich-salary.mjs --browserless URL        # plus JS-rendered hosts via
 *                                                   # a Browserless-compatible
 *                                                   # endpoint (e.g. self-hosted
 *                                                   # browserless/chrome). Format:
 *                                                   # http://host:port?token=...
 *   node enrich-salary.mjs --out path.json          # custom output path
 *   node enrich-salary.mjs --dry-run                # print results, don't write
 *
 * Output: data/salary-cache.json — object keyed by URL:
 *   {
 *     "<url>": {
 *       "salary":   "$180K–$240K",
 *       "jobTitle": "Senior Product Manager, Foo",
 *       "location": "San Francisco, CA",
 *       "verifiedAt": "2026-04-12T22:00:00Z",
 *       "source":   "ashby" | "lever" | "greenhouse" | "amazon" | "browserless:google"
 *     }
 *   }
 *
 * Safe to run repeatedly — idempotent. Entries that already have salary are
 * skipped. Entries where the source genuinely doesn't publish comp are cached
 * with `salary: null` + `reason` so the next run doesn't re-hit the API.
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

// ── CLI args ───────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}

const PIPELINE_PATH = 'data/pipeline.md';
const OUT_PATH = flag('out', 'data/salary-cache.json');
const DRY_RUN = hasFlag('dry-run');
const BROWSERLESS = flag('browserless', null); // full URL e.g. http://host:3000?token=xxx

const HTTP_TIMEOUT_MS = 15_000;

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] enrich-salary: ${msg}`);
}

// ── Pipeline parsing ───────────────────────────────────────────────

function parsePipeline(md) {
  const items = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^- \[([ x])\] (\S+)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$/);
    if (m) {
      items.push({
        checked: m[1] === 'x',
        url: m[2].trim(),
        company: m[3].trim(),
        role: m[4].trim(),
      });
    }
  }
  return items;
}

// ── Cache I/O ──────────────────────────────────────────────────────

async function loadCache() {
  if (!existsSync(OUT_PATH)) return {};
  try { return JSON.parse(await readFile(OUT_PATH, 'utf-8')); }
  catch { return {}; }
}

async function saveCache(cache) {
  if (DRY_RUN) return;
  await writeFile(OUT_PATH, JSON.stringify(cache, null, 2));
}

// ── HTTP helper ────────────────────────────────────────────────────

async function httpGet(url, opts = {}) {
  const ctl = AbortSignal.timeout(HTTP_TIMEOUT_MS);
  const r = await fetch(url, { ...opts, signal: ctl });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r;
}

// ── HTML entity decode (double-pass for double-encoded content) ────

function decodeEntities(s) {
  return String(s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

// ── Extractors ─────────────────────────────────────────────────────

function slugify(s) {
  return String(s || '').toLowerCase()
    .replace(/[—–]/g, '-')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function ashbySalary(j) {
  if (j.compensation?.compensationTierSummary) {
    return j.compensation.compensationTierSummary;
  }
  // Fallback: regex on description text (some orgs disable structured comp
  // but still publish the range inline for pay-transparency compliance).
  const text = String(j.descriptionPlain || '').slice(0, 8000);
  const m = text.match(/\$(\d{2,3}[,.]?\d{3})(?:[Kk]|(?:\.\d{2})?)\s*[-–—to]+\s*\$?(\d{2,3}[,.]?\d{3})(?:[Kk]|(?:\.\d{2})?)/);
  if (m) return `$${m[1]}–$${m[2]}`;
  return null;
}

function leverSalary(j) {
  if (j.salaryDescription?.text) return j.salaryDescription.text.slice(0, 80);
  const r = j.salaryRange;
  if (r && r.min && r.max) {
    const sym = r.currency === 'USD' ? '$' : (r.currency ? `${r.currency} ` : '$');
    const fmt = (n) => n >= 1000 ? `${sym}${Math.round(n / 1000)}K` : `${sym}${n}`;
    return `${fmt(r.min)}–${fmt(r.max)}`;
  }
  // Fallback: regex on combined description fields
  const text = [j.descriptionBodyPlain, j.additionalPlain, j.descriptionPlain, j.openingPlain]
    .filter(Boolean).join(' ').slice(0, 8000);
  const m = text.match(/\$(\d{2,3}[,.]?\d{3})\s*[-–—to]+\s*\$?(\d{2,3}[,.]?\d{3})/);
  if (m) return `$${m[1]}–$${m[2]}`;
  return null;
}

function greenhouseSalary(j) {
  if (!j.content) return null;
  // Content is typically double-HTML-encoded — decode twice.
  const raw = decodeEntities(decodeEntities(j.content));
  // Primary: structured <div class="pay-range">$X</span>…<span>$Y USD</span>
  const prM = raw.match(/<div class="pay-range">\s*<span[^>]*>([^<]+)<\/span>\s*<span[^>]*>[^<]*<\/span>\s*<span[^>]*>([^<]+)<\/span>/i);
  if (prM) {
    const min = prM[1].trim();
    const max = prM[2].trim();
    if (/\$/.test(min) || /USD/i.test(max)) {
      return `${min}–${max}`.replace(/\s*USD\s*/g, '').replace(/\s+/g, '');
    }
    return null; // non-USD (£/€) — skip
  }
  // Fallback regex on stripped text
  const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 12000);
  const m = text.match(/\$\s?(\d{2,3}[,.]?\d{3})\s*[-–—to]+\s*\$?(\d{2,3}[,.]?\d{3})/);
  if (m) return `$${m[1]}–$${m[2]}`;
  return null;
}

// ── Ashby (including OpenAI proxy) ─────────────────────────────────

async function fetchAshbyBoard(slug) {
  const r = await httpGet(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
  const d = await r.json();
  return d.jobs || [];
}

function ashbyIndex(jobs) {
  const idx = {};
  for (const j of jobs) {
    if (j.id) idx[j.id] = j;
    const tslug = slugify(j.title);
    idx[tslug] = j;
    if (j.location) {
      const locSlug = slugify(j.location).replace(/,.*$/, '');
      idx[`${tslug}-${locSlug}`] = j;
    }
  }
  return idx;
}

function ashbyMatchByUrl(url, idx) {
  // jobs.ashbyhq.com/{board}/{uuid}
  const uuidM = url.match(/ashbyhq\.com\/[^/]+\/([a-f0-9-]{36})/);
  if (uuidM && idx[uuidM[1]]) return idx[uuidM[1]];
  // openai.com/careers/{slug}
  const oaiM = url.match(/openai\.com\/careers\/([^/?#]+)/);
  if (oaiM) {
    const slug = oaiM[1].replace(/\/+$/, '');
    if (idx[slug]) return idx[slug];
    // Drop location suffix progressively
    const parts = slug.split('-');
    for (let cut = 1; cut <= 4; cut++) {
      const key = parts.slice(0, -cut).join('-');
      if (idx[key]) return idx[key];
    }
  }
  return null;
}

// ── Lever ──────────────────────────────────────────────────────────

async function fetchLeverBoard(slug) {
  const r = await httpGet(`https://api.lever.co/v0/postings/${slug}?mode=json&limit=500`);
  return r.json();
}

// ── Greenhouse (and proxied hosts) ─────────────────────────────────

async function fetchGreenhouseBoard(slug) {
  const r = await httpGet(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
  const d = await r.json();
  return d.jobs || [];
}

function mapToGreenhouseBoard(url) {
  // Direct greenhouse hosts
  const direct = url.match(/(?:job-boards|boards)\.greenhouse\.io\/([^/]+)/);
  if (direct) return direct[1];
  // Greenhouse-proxied hosts (company domain with gh_jid or equivalent path)
  if (url.match(/unity\.com\/careers\/positions\/\d+/)) return 'unity3d';
  if (url.match(/databricks\.com\/.*[?&]gh_jid=\d+/)) return 'databricks';
  if (url.match(/epicgames\.com\/.*jobs\/\d+/)) return 'epicgames';
  if (url.match(/careers\.roblox\.com\/jobs\/\d+/)) return 'roblox';
  return null;
}

function greenhouseIdFromUrl(url) {
  return (url.match(/[?&]gh_jid=(\d+)/) || url.match(/\/(?:jobs|positions)\/(\d+)/))?.[1] || null;
}

// ── Amazon (search.json) ───────────────────────────────────────────

async function amazonJob(id) {
  const r = await httpGet(`https://www.amazon.jobs/en/search.json?base_query=${id}&result_limit=1`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const d = await r.json();
  const j = d.jobs?.[0];
  if (!j || String(j.id_icims) !== id) return null;
  return j;
}

function amazonSalary(j) {
  const text = [j.description, j.basic_qualifications, j.preferred_qualifications]
    .filter(Boolean).join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  // Format 1 (corporate): "151,200.00 - 204,600.00 USD annually"
  // Format 2 (AWS):       "Salary Range $153,600/year to $207,800/year"
  const m = text.match(/(\d{2,3}[,.]?\d{3})(?:\.\d{2})?\s*[-–]\s*(\d{2,3}[,.]?\d{3})(?:\.\d{2})?\s*USD\s*annually/i)
    || text.match(/Salary Range\s*\$(\d{2,3}[,.]?\d{3})\s*\/year\s*to\s*\$(\d{2,3}[,.]?\d{3})\s*\/year/i);
  if (!m) return null;
  return `$${m[1]}–$${m[2]}`;
}

// ── Browserless (optional) ─────────────────────────────────────────

async function browserlessRender(url) {
  if (!BROWSERLESS) return null;
  try {
    const endpoint = BROWSERLESS.includes('/content')
      ? BROWSERLESS
      : `${BROWSERLESS.replace(/\/$/, '')}/content`;
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, waitForTimeout: 6000 }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
}

const BROWSERLESS_EXTRACTORS = {
  'google.com/about/careers': (html) => {
    const m = html.match(/base salary[^.<]{0,80}?\$(\d{2,3}[,.]?\d{3})\s*[-–—to]+\s*\$?(\d{2,3}[,.]?\d{3})/i);
    return m ? `$${m[1]}–$${m[2]}` : null;
  },
  'jobs.apple.com': (html) => {
    const m = html.match(/base pay range[^.<]{0,80}?\$(\d{2,3}[,.]?\d{3})\s*(?:and|[-–—to]+)\s*\$?(\d{2,3}[,.]?\d{3})/i);
    if (m) return `$${m[1]}–$${m[2]}`;
    const m2 = html.slice(0, 20000).match(/\$\s?(\d{2,3}[,.]?\d{3})\s*(?:and|[-–—to]+)\s*\$?(\d{2,3}[,.]?\d{3})/);
    return m2 ? `$${m2[1]}–$${m2[2]}` : null;
  },
  'careers.snap.com': (html) => {
    const m = html.match(/base salary range for this position is \$([\d,]+)\s*[-–—to]+\s*\$?([\d,]+)/i);
    return m ? `$${m[1]}–$${m[2]}` : null;
  },
  'careers.datadoghq.com': (html) => {
    const m = html.match(/content-pay-transparency[\s\S]{0,400}?\$(\d{2,3}[,.]?\d{3})[\s\S]{0,80}?\$(\d{2,3}[,.]?\d{3})/i);
    return m ? `$${m[1]}–$${m[2]} USD` : null;
  },
};

// ── Orchestrator ───────────────────────────────────────────────────

function bucketize(items, cache) {
  const buckets = { ashby: {}, lever: {}, greenhouse: {}, amazon: [], browserless: [] };
  for (const it of items) {
    if (cache[it.url]?.salary) continue;
    if (cache[it.url]?.reason === 'not-published') continue; // already known-empty
    const url = it.url;

    // OpenAI → Ashby openai
    if (url.includes('openai.com/careers/')) {
      (buckets.ashby.openai ??= []).push(it);
      continue;
    }
    // Ashby direct
    const ashbyM = url.match(/jobs\.ashbyhq\.com\/([^/]+)\//);
    if (ashbyM) {
      (buckets.ashby[ashbyM[1]] ??= []).push(it);
      continue;
    }
    // Lever
    const leverM = url.match(/jobs\.lever\.co\/([^/]+)\//);
    if (leverM) {
      (buckets.lever[leverM[1]] ??= []).push(it);
      continue;
    }
    // Greenhouse (direct or proxied)
    const ghBoard = mapToGreenhouseBoard(url);
    if (ghBoard) {
      (buckets.greenhouse[ghBoard] ??= []).push(it);
      continue;
    }
    // Amazon
    if (url.match(/amazon\.jobs\/en\/jobs\/\d+/)) {
      buckets.amazon.push(it);
      continue;
    }
    // Browserless hosts (only bucketed when --browserless is set)
    if (BROWSERLESS && Object.keys(BROWSERLESS_EXTRACTORS).some(h => url.includes(h))) {
      buckets.browserless.push(it);
    }
  }
  return buckets;
}

async function enrichAshby(buckets, cache) {
  let found = 0;
  for (const [slug, items] of Object.entries(buckets)) {
    try {
      log(`ashby/${slug}: ${items.length} items`);
      const jobs = await fetchAshbyBoard(slug);
      const idx = ashbyIndex(jobs);
      for (const it of items) {
        const j = ashbyMatchByUrl(it.url, idx);
        if (!j) {
          cache[it.url] = { ...(cache[it.url] || {}), verifiedAt: new Date().toISOString(), salary: null, reason: 'not-in-board' };
          continue;
        }
        const salary = ashbySalary(j);
        cache[it.url] = {
          verifiedAt: new Date().toISOString(),
          salary: salary || null,
          reason: salary ? null : 'not-published',
          jobTitle: j.title || null,
          location: j.location || null,
          source: 'ashby',
        };
        if (salary) found++;
      }
    } catch (e) { log(`ashby/${slug} failed: ${e.message}`); }
  }
  return found;
}

async function enrichLever(buckets, cache) {
  let found = 0;
  for (const [slug, items] of Object.entries(buckets)) {
    try {
      log(`lever/${slug}: ${items.length} items`);
      const jobs = await fetchLeverBoard(slug);
      const byId = {};
      for (const j of jobs) byId[j.id] = j;
      for (const it of items) {
        const uuidM = it.url.match(/lever\.co\/[^/]+\/([a-f0-9-]{36})/);
        if (!uuidM || !byId[uuidM[1]]) {
          cache[it.url] = { ...(cache[it.url] || {}), verifiedAt: new Date().toISOString(), salary: null, reason: 'not-in-board' };
          continue;
        }
        const j = byId[uuidM[1]];
        const salary = leverSalary(j);
        cache[it.url] = {
          verifiedAt: new Date().toISOString(),
          salary: salary || null,
          reason: salary ? null : 'not-published',
          jobTitle: j.text || null,
          location: j.categories?.location || null,
          source: 'lever',
        };
        if (salary) found++;
      }
    } catch (e) { log(`lever/${slug} failed: ${e.message}`); }
  }
  return found;
}

async function enrichGreenhouse(buckets, cache) {
  let found = 0;
  for (const [slug, items] of Object.entries(buckets)) {
    try {
      log(`greenhouse/${slug}: ${items.length} items`);
      const jobs = await fetchGreenhouseBoard(slug);
      const byId = {};
      for (const j of jobs) byId[String(j.id)] = j;
      for (const it of items) {
        const id = greenhouseIdFromUrl(it.url);
        if (!id || !byId[id]) {
          cache[it.url] = { ...(cache[it.url] || {}), verifiedAt: new Date().toISOString(), salary: null, reason: 'not-in-board' };
          continue;
        }
        const j = byId[id];
        const salary = greenhouseSalary(j);
        cache[it.url] = {
          verifiedAt: new Date().toISOString(),
          salary: salary || null,
          reason: salary ? null : 'not-published',
          jobTitle: j.title || null,
          location: j.location?.name || null,
          source: 'greenhouse',
        };
        if (salary) found++;
      }
    } catch (e) { log(`greenhouse/${slug} failed: ${e.message}`); }
  }
  return found;
}

async function enrichAmazon(items, cache) {
  if (!items.length) return 0;
  log(`amazon: ${items.length} items`);
  let found = 0;
  for (const it of items) {
    const idM = it.url.match(/\/jobs\/(\d+)/);
    if (!idM) continue;
    try {
      const j = await amazonJob(idM[1]);
      if (!j) {
        cache[it.url] = { ...(cache[it.url] || {}), verifiedAt: new Date().toISOString(), salary: null, reason: 'closed' };
        continue;
      }
      const salary = amazonSalary(j);
      cache[it.url] = {
        verifiedAt: new Date().toISOString(),
        salary: salary || null,
        reason: salary ? null : 'not-published',
        jobTitle: j.title || null,
        location: j.normalized_location || null,
        source: 'amazon',
      };
      if (salary) found++;
    } catch {}
  }
  return found;
}

async function enrichBrowserless(items, cache) {
  if (!items.length) return 0;
  if (!BROWSERLESS) return 0;
  log(`browserless: ${items.length} items via ${BROWSERLESS.split('?')[0]}`);
  let found = 0;
  for (const it of items) {
    const extractor = Object.entries(BROWSERLESS_EXTRACTORS)
      .find(([host]) => it.url.includes(host))?.[1];
    if (!extractor) continue;
    const html = await browserlessRender(it.url);
    if (!html) continue;
    const salary = extractor(html);
    if (!salary) {
      cache[it.url] = { ...(cache[it.url] || {}), verifiedAt: new Date().toISOString(), salary: null, reason: 'not-published' };
      continue;
    }
    cache[it.url] = {
      verifiedAt: new Date().toISOString(),
      salary,
      jobTitle: (html.match(/<title>([^<]+)</)?.[1] || '').split('|')[0].trim() || null,
      source: `browserless:${new URL(it.url).hostname}`,
    };
    found++;
  }
  return found;
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(PIPELINE_PATH)) {
    log(`no ${PIPELINE_PATH} — run scan.mjs first`);
    process.exit(1);
  }
  const items = parsePipeline(await readFile(PIPELINE_PATH, 'utf-8'));
  const pending = items.filter(i => !i.checked);
  log(`${pending.length} pending pipeline items`);

  const cache = await loadCache();
  const buckets = bucketize(pending, cache);

  const totals = {
    ashby: Object.values(buckets.ashby).reduce((a, b) => a + b.length, 0),
    lever: Object.values(buckets.lever).reduce((a, b) => a + b.length, 0),
    greenhouse: Object.values(buckets.greenhouse).reduce((a, b) => a + b.length, 0),
    amazon: buckets.amazon.length,
    browserless: buckets.browserless.length,
  };
  log(`buckets: ashby=${totals.ashby} lever=${totals.lever} greenhouse=${totals.greenhouse} amazon=${totals.amazon} browserless=${totals.browserless}`);

  const found = (await Promise.all([
    enrichAshby(buckets.ashby, cache),
    enrichLever(buckets.lever, cache),
    enrichGreenhouse(buckets.greenhouse, cache),
    enrichAmazon(buckets.amazon, cache),
    enrichBrowserless(buckets.browserless, cache),
  ])).reduce((a, b) => a + b, 0);

  await saveCache(cache);

  const totalWithSalary = Object.values(cache).filter(v => v?.salary).length;
  log(`done: ${found} new, ${totalWithSalary} total with salary`);
  if (DRY_RUN) log(`dry-run — cache not written`);
  else log(`cache: ${OUT_PATH}`);
}

main().catch(e => {
  console.error('enrich-salary fatal:', e);
  process.exit(1);
});
