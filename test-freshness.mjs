#!/usr/bin/env node

/**
 * test-freshness.mjs — Unit tests for check-liveness.mjs freshness detection
 *
 * Tests:
 *   - JSON-LD datePosted extraction (top-level + @graph)
 *   - Inline "datePosted":"..." patterns
 *   - Visible text patterns (ISO, long form, "N days/weeks/months ago")
 *   - LinkedIn URL ID → year heuristic
 *   - Freshness classification (fresh/stale/expired/unverified)
 *   - Config loader from portals.yml
 *
 * Pure unit tests — no network, no Playwright.
 *
 * Usage: node test-freshness.mjs
 * Exit code: 0 on all-pass, 1 on any failure
 */

import {
  extractPostingDate,
  linkedinIdToYear,
  ageInDays,
  classifyFreshness,
  loadFreshnessConfig,
  FRESHNESS_DEFAULTS,
} from './liveness-core.mjs';

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  ❌ ${name}`);
  }
}

console.log('\n🧪 freshness unit tests\n');

// ── 1. JSON-LD extraction ────────────────────────────────────────
console.log('1. JSON-LD datePosted extraction');

ok('top-level JobPosting', (() => {
  const html = `<script type="application/ld+json">
    {"@context":"https://schema.org","@type":"JobPosting","title":"SWE","datePosted":"2025-08-15"}
  </script>`;
  const d = extractPostingDate(html);
  return d instanceof Date && d.toISOString().slice(0, 10) === '2025-08-15';
})());

ok('@graph nested', (() => {
  const html = `<script type="application/ld+json">
    {"@graph":[{"@type":"Organization","name":"Acme"},{"@type":"JobPosting","datePosted":"2024-12-01"}]}
  </script>`;
  const d = extractPostingDate(html);
  return d instanceof Date && d.toISOString().slice(0, 10) === '2024-12-01';
})());

ok('multiple JSON-LD blocks (returns first valid)', (() => {
  const html = `
    <script type="application/ld+json">{"@type":"Organization"}</script>
    <script type="application/ld+json">{"@type":"JobPosting","datePosted":"2026-01-15"}</script>
  `;
  const d = extractPostingDate(html);
  return d instanceof Date && d.toISOString().slice(0, 10) === '2026-01-15';
})());

ok('malformed JSON-LD doesn\'t crash', (() => {
  const html = `<script type="application/ld+json">{not json</script>`;
  return extractPostingDate(html) === null;
})());

ok('inline "datePosted":"..." (minified)', (() => {
  const html = `var x={"datePosted":"2025-06-20","other":"foo"};`;
  const d = extractPostingDate(html);
  return d instanceof Date && d.toISOString().slice(0, 10) === '2025-06-20';
})());

// ── 2. Visible text patterns ──────────────────────────────────────
console.log('\n2. Visible text date patterns');

ok('ISO format "Posted 2025-09-01"', (() => {
  const d = extractPostingDate(`<p>Posted 2025-09-01</p>`);
  return d?.toISOString().slice(0, 10) === '2025-09-01';
})());

ok('"Posted on Aug 15, 2025"', (() => {
  const d = extractPostingDate(`<p>Posted on Aug 15, 2025</p>`);
  return d?.getFullYear() === 2025 && d?.getMonth() === 7;
})());

ok('"Posted 14 days ago"', (() => {
  const d = extractPostingDate(`<div>Posted 14 days ago</div>`);
  return Math.abs(ageInDays(d) - 14) <= 1;
})());

ok('"Posted 3 weeks ago"', (() => {
  const d = extractPostingDate(`<div>Posted 3 weeks ago</div>`);
  return Math.abs(ageInDays(d) - 21) <= 1;
})());

ok('"Posted 2 months ago"', (() => {
  const d = extractPostingDate(`<div>Posted 2 months ago</div>`);
  // 2 months ≈ 60 days (varies by month length)
  return ageInDays(d) >= 55 && ageInDays(d) <= 65;
})());

ok('no date returns null', extractPostingDate(`<html>nothing here</html>`) === null);

ok('null/undefined input handled', extractPostingDate(null) === null && extractPostingDate(undefined) === null);

// ── 3. LinkedIn URL ID heuristic ──────────────────────────────────
console.log('\n3. LinkedIn URL ID heuristic');

ok('id 2_900_000_000 → 2020', linkedinIdToYear('https://linkedin.com/jobs/view/swe-2900000000') === 2020);
ok('id 3_200_000_000 → 2021', linkedinIdToYear('https://linkedin.com/jobs/view/foo-3200000000') === 2021);
ok('id 3_700_000_000 → 2022', linkedinIdToYear('https://linkedin.com/jobs/view/bar-3700000000') === 2022);
ok('id 4_000_000_000 → 2023', linkedinIdToYear('https://linkedin.com/jobs/view/baz-4000000000') === 2023);
ok('id 4_300_000_000 → 2024', linkedinIdToYear('https://linkedin.com/jobs/view/qux-4300000000') === 2024);
ok('id 4_500_000_000 → 2025', linkedinIdToYear('https://linkedin.com/jobs/view/zap-4500000000') === 2025);
ok('long slug with hyphens', linkedinIdToYear('https://www.linkedin.com/jobs/view/senior-c++-engineer-bql-kernel-at-bloomberg-lp-2901218433') === 2020);
ok('non-linkedin URL → null', linkedinIdToYear('https://greenhouse.io/foo/jobs/123') === null);
ok('linkedin without job id → null', linkedinIdToYear('https://linkedin.com/in/charles') === null);
ok('null input → null', linkedinIdToYear(null) === null);

// ── 4. Age + classification ──────────────────────────────────────
console.log('\n4. ageInDays + classifyFreshness');

const now = new Date();
const fresh10 = new Date(now.getTime() - 10 * 86400 * 1000);
const stale45 = new Date(now.getTime() - 45 * 86400 * 1000);
const expired100 = new Date(now.getTime() - 100 * 86400 * 1000);

ok('ageInDays(10d ago) === 10', ageInDays(fresh10) === 10);
ok('ageInDays(null) === null', ageInDays(null) === null);

const cfg = { ...FRESHNESS_DEFAULTS };
ok('10d → fresh', classifyFreshness(fresh10, cfg) === 'fresh');
ok('45d → stale', classifyFreshness(stale45, cfg) === 'stale');
ok('100d → expired', classifyFreshness(expired100, cfg) === 'expired');
ok('null + require_date=false → fresh', classifyFreshness(null, cfg) === 'fresh');
ok('null + require_date=true → unverified', classifyFreshness(null, { ...cfg, require_date: true }) === 'unverified');

// Boundary cases
const exactWarn = new Date(now.getTime() - cfg.warn_age_days * 86400 * 1000);
const justOverWarn = new Date(now.getTime() - (cfg.warn_age_days + 1) * 86400 * 1000);
const exactMax = new Date(now.getTime() - cfg.max_age_days * 86400 * 1000);
const justOverMax = new Date(now.getTime() - (cfg.max_age_days + 1) * 86400 * 1000);

ok('exact warn_age_days → fresh', classifyFreshness(exactWarn, cfg) === 'fresh');
ok('warn_age_days + 1 → stale', classifyFreshness(justOverWarn, cfg) === 'stale');
ok('exact max_age_days → stale', classifyFreshness(exactMax, cfg) === 'stale');
ok('max_age_days + 1 → expired', classifyFreshness(justOverMax, cfg) === 'expired');

// Custom config
const strict = { max_age_days: 14, warn_age_days: 7, linkedin_suspect: true, require_date: true };
ok('custom strict: 10d → stale', classifyFreshness(fresh10, strict) === 'stale');
ok('custom strict: 45d → expired', classifyFreshness(stale45, strict) === 'expired');

// ── 5. Config loader ──────────────────────────────────────────────
console.log('\n5. Config loader');

const loaded = loadFreshnessConfig();
ok('loader returns an object', typeof loaded === 'object' && loaded !== null);
ok('loader has max_age_days', typeof loaded.max_age_days === 'number');
ok('loader has warn_age_days', typeof loaded.warn_age_days === 'number');
ok('loader has linkedin_suspect bool', typeof loaded.linkedin_suspect === 'boolean');
ok('loader has require_date bool', typeof loaded.require_date === 'boolean');

// ── Summary ──────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed (${pass + fail} total)`);
if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nAll freshness tests passed.');
process.exit(0);
