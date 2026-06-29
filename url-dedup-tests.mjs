#!/usr/bin/env node
/**
 * test-merge-url.mjs — tests for URL-keyed deterministic dedup in merge-tracker.
 *
 * Unit-tests normalizeUrl (pure), then drives the REAL merge-tracker.mjs CLI
 * end-to-end against a temp tracker via the CAREER_OPS_TRACKER /
 * CAREER_OPS_ADDITIONS env hooks. Run: node test-merge-url.mjs
 */
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeUrl } from './url-key.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MERGE = join(HERE, 'merge-tracker.mjs');
let pass = 0, fail = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log(`  ✓ ${name}`); } catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); } };

// ───────────────────────── normalizeUrl (unit) ─────────────────────────
console.log('normalizeUrl()');
ok('strips utm_* and gh_src, keeps gh_jid', () => {
  const a = normalizeUrl('https://careers.airbnb.com/positions/8028783?gh_jid=8028783&utm_source=x&gh_src=abc');
  assert.equal(a, 'https://careers.airbnb.com/positions/8028783?gh_jid=8028783');
});
ok('lowercases host, forces https, drops trailing slash + fragment', () => {
  assert.equal(normalizeUrl('HTTP://Jobs.Lever.co/Stripe/123/#apply'), 'https://jobs.lever.co/Stripe/123');
});
ok('query order does not matter (sorted)', () => {
  assert.equal(normalizeUrl('https://x.com/j?b=2&a=1'), normalizeUrl('https://x.com/j?a=1&b=2'));
});
ok('two genuinely different postings stay different', () => {
  assert.notEqual(
    normalizeUrl('https://job-boards.greenhouse.io/doordashusa/jobs/8027044'),
    normalizeUrl('https://job-boards.greenhouse.io/doordashusa/jobs/8026972'));
});
ok('idempotent', () => {
  const once = normalizeUrl('https://X.com/a/?utm_source=y');
  assert.equal(once, normalizeUrl(once));
});
ok('empty / non-url inputs', () => {
  assert.equal(normalizeUrl(''), '');
  assert.equal(normalizeUrl(null), '');
  assert.equal(normalizeUrl('local:jds/foo.md'), 'local:jds/foo.md');
});

// ───────────────────────── merge-tracker (integration) ─────────────────────────
const HEADER = '| # | Date | Company | Role | Score | Status | PDF | Report | Notes | URL |';
const SEP = '|---|---|---|---|---|---|---|---|---|---|';

function makeEnv() {
  const base = mkdtempSync(join(tmpdir(), 'merge-url-test-'));
  const dataDir = join(base, 'data');
  const addDir = join(base, 'additions');
  const reportsDir = join(base, 'reports');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(addDir, { recursive: true });
  mkdirSync(reportsDir, { recursive: true });
  const tracker = join(dataDir, 'applications.md');
  return { base, dataDir, addDir, reportsDir, tracker };
}
function writeTracker(env, rows) {
  writeFileSync(env.tracker, ['# Applications Tracker', '', HEADER, SEP, ...rows, ''].join('\n'));
}
function addTsv(env, name, cols) {
  writeFileSync(join(env.addDir, name), cols.join('\t'));
}
function runMerge(env, args = []) {
  return execFileSync('node', [MERGE, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, CAREER_OPS_TRACKER: env.tracker, CAREER_OPS_ADDITIONS: env.addDir },
  });
}
function trackerRows(env) {
  // Exclude the markdown separator PRECISELY (not any `---`) so rows whose URL
  // contains `---` (Workday slugs) are counted — same bug class as the merge.
  return readFileSync(env.tracker, 'utf-8').split('\n').filter(l => l.startsWith('|') && !/^\|[\s|:-]+\|\s*$/.test(l) && !/^\|\s*#\s*\|/.test(l));
}
const cleanup = (env) => rmSync(env.base, { recursive: true, force: true });

console.log('\nmerge-tracker — deterministic URL dedup');

ok('THE BUG: two distinct same-company roles with different URLs stay two rows', () => {
  const env = makeEnv();
  try {
    writeTracker(env, [
      '| 1 | 2026-06-01 | Google | Strategy and Operations Lead | 3.8/5 | Evaluated | ❌ | [1](reports/1-google-2026-06-01.md) | n | https://www.google.com/about/careers/applications/jobs/results/111-strategy-and-operations-lead |',
    ]);
    // different posting (gTech), fuzzy-matches "strategy operations" but different URL
    addTsv(env, '2-google.tsv', ['2', '2026-06-25', 'Google', 'Strategy and Operations Senior Associate, gTech Ads', 'Evaluated', '3.9/5', '❌', '[2](reports/2-google-2026-06-25.md)', 'n', 'https://www.google.com/about/careers/applications/jobs/results/222-gtech-ads']);
    runMerge(env);
    const rows = trackerRows(env);
    assert.equal(rows.length, 2, `expected 2 rows, got ${rows.length}`);
  } finally { cleanup(env); }
});

ok('control: same two WITHOUT urls collapse (legacy fuzzy fallback)', () => {
  const env = makeEnv();
  try {
    writeTracker(env, [
      '| 1 | 2026-06-01 | Google | Strategy and Operations Lead | 3.8/5 | Evaluated | ❌ | [1](reports/1-google.md) | n |  |',
    ]);
    addTsv(env, '2-google.tsv', ['2', '2026-06-25', 'Google', 'Strategy and Operations Senior Associate gTech', 'Evaluated', '3.9/5', '❌', '[2](reports/2-google.md)', 'n']);
    runMerge(env);
    assert.equal(trackerRows(env).length, 1, 'no-URL rows still collapse via fuzzy (fallback)');
  } finally { cleanup(env); }
});

ok('URL match → last-write-wins, even when the new score is LOWER', () => {
  const env = makeEnv();
  try {
    const url = 'https://explore.jobs.netflix.net/careers/job/790316748684';
    writeTracker(env, [
      `| 5 | 2026-06-01 | Netflix | Associate, Product FP&A | 4.4/5 | Evaluated | ❌ | [5](reports/5-netflix.md) | stale wrong-high | ${url} |`,
    ]);
    addTsv(env, '5-netflix.tsv', ['5', '2026-06-25', 'Netflix', 'Associate, Product FP&A', 'Evaluated', '2.8/5', '❌', '[5](reports/5-netflix.md)', 'corrected', url]);
    runMerge(env);
    const rows = trackerRows(env);
    assert.equal(rows.length, 1, 'same URL → one row');
    assert.ok(rows[0].includes('2.8/5'), 'LWW: corrected lower score wins (not pinned at 4.4)');
    assert.ok(!rows[0].includes('4.4/5'), 'stale wrong-high score is gone');
  } finally { cleanup(env); }
});

ok('URL match → status never downgrades (monotonic funnel)', () => {
  const env = makeEnv();
  try {
    const url = 'https://job-boards.greenhouse.io/doordashusa/jobs/8027044';
    writeTracker(env, [
      `| 7 | 2026-06-01 | DoorDash | Senior Associate, Finance & Strategy | 4.0/5 | Interview | ✅ | [7](reports/7-dd.md) | n | ${url} |`,
    ]);
    addTsv(env, '7-dd.tsv', ['7', '2026-06-25', 'DoorDash', 'Senior Associate, Finance & Strategy', 'Evaluated', '4.3/5', '❌', '[7](reports/7-dd.md)', 're-eval', url]);
    runMerge(env);
    const rows = trackerRows(env);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].includes('Interview'), 'status stays Interview, not downgraded to Evaluated');
    assert.ok(rows[0].includes('4.3/5'), 'score advances via LWW');
    assert.ok(rows[0].includes('✅'), 'PDF ✅ is not lost to a ❌ re-eval (monotonic)');
  } finally { cleanup(env); }
});

ok('terminal status (Rejected) is absorbing — re-eval cannot revive it', () => {
  const env = makeEnv();
  try {
    const url = 'https://jobs.ashbyhq.com/openai/abc';
    writeTracker(env, [
      `| 9 | 2026-06-01 | OpenAI | GTM Strategy & Operations | 3.4/5 | Rejected | ❌ | [9](reports/9-openai.md) | n | ${url} |`,
    ]);
    addTsv(env, '9-openai.tsv', ['9', '2026-06-25', 'OpenAI', 'GTM Strategy & Operations', 'Evaluated', '3.6/5', '❌', '[9](reports/9-openai.md)', 're-eval', url]);
    runMerge(env);
    assert.ok(trackerRows(env)[0].includes('Rejected'), 'Rejected stays Rejected');
  } finally { cleanup(env); }
});

ok('9-col TSV (no url) still parses + inserts (backward compat)', () => {
  const env = makeEnv();
  try {
    writeTracker(env, []);
    addTsv(env, '3-acme.tsv', ['3', '2026-06-25', 'Acme', 'Strategy Manager', 'Evaluated', '4.0/5', '❌', '[3](reports/3-acme.md)', 'note']);
    runMerge(env);
    const rows = trackerRows(env);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].includes('Acme') && rows[0].includes('4.0/5'));
  } finally { cleanup(env); }
});

ok('--backfill-urls fills empty url from the linked report, idempotently', () => {
  const env = makeEnv();
  try {
    writeFileSync(join(env.reportsDir, '11-snap-2026-06-25.md'),
      '# Eval\n**URL:** https://snapchat.wd1.myworkdayjobs.com/snap/job/LA/Senior-Specialist_R1\n');
    writeTracker(env, [
      '| 11 | 2026-06-25 | Snap | Senior Specialist, Product S&O | 3.8/5 | Evaluated | ❌ | [11](../reports/11-snap-2026-06-25.md) | n |  |',
    ]);
    runMerge(env, ['--backfill-urls']);
    let rows = trackerRows(env);
    assert.ok(rows[0].includes('myworkdayjobs.com/snap/job/LA/Senior-Specialist_R1'), 'url backfilled from report');
    // idempotent: a second run changes nothing
    const before = readFileSync(env.tracker, 'utf-8');
    runMerge(env, ['--backfill-urls']);
    assert.equal(readFileSync(env.tracker, 'utf-8'), before, 'second backfill is a no-op');
  } finally { cleanup(env); }
});

ok('URL match → an unscoreable re-eval (N/A) does NOT clobber a real score', () => {
  const env = makeEnv();
  try {
    const url = 'https://job-boards.greenhouse.io/doordashusa/jobs/8027044';
    writeTracker(env, [
      `| 4 | 2026-06-01 | DoorDash | Senior Associate, Finance & Strategy | 4.0/5 | Evaluated | ❌ | [4](reports/4-dd.md) | good | ${url} |`,
    ]);
    addTsv(env, '4-dd.tsv', ['4', '2026-06-25', 'DoorDash', 'Senior Associate, Finance & Strategy', 'Evaluated', 'N/A', '❌', '[4](reports/4-dd.md)', 'fetch failed', url]);
    runMerge(env);
    const rows = trackerRows(env);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].includes('4.0/5'), 'real score kept');
    assert.ok(!rows[0].includes('N/A'), 'failed-fetch N/A did not overwrite the score');
  } finally { cleanup(env); }
});

ok('no-URL addition does NOT clobber a URL-bearing row (over-dedup guard)', () => {
  const env = makeEnv();
  try {
    const url = 'https://stripe.com/jobs/listing/company-strategy/111';
    writeTracker(env, [
      `| 6 | 2026-06-01 | Stripe | Company Strategy & Operations | 4.0/5 | Applied | ✅ | [6](reports/6-stripe.md) | tracked | ${url} |`,
    ]);
    // same company+role, but NO url on the addition → must not seize the known posting's row
    addTsv(env, '7-stripe.tsv', ['7', '2026-06-25', 'Stripe', 'Company Strategy & Operations', 'Evaluated', '4.5/5', '❌', '[7](reports/7-stripe.md)', 'different posting']);
    runMerge(env);
    const rows = trackerRows(env);
    assert.equal(rows.length, 2, 'inserts a new row instead of clobbering the URL-bearing one');
    const orig = rows.find(r => r.includes('[6]') || r.includes('| 6 |'));
    assert.ok(orig && orig.includes('Applied') && orig.includes('✅') && orig.includes('4.0/5'), 'original Applied row untouched');
  } finally { cleanup(env); }
});

ok('buildRow round-trips a Location + URL layout (COLMAP-driven)', () => {
  const env = makeEnv();
  try {
    const H = '| # | Date | Company | Role | Location | Score | Status | PDF | Report | Notes | URL |';
    const S = '|---|---|---|---|---|---|---|---|---|---|---|';
    const url = 'https://snapchat.wd1.myworkdayjobs.com/snap/job/LA/Sr_R1';
    writeFileSync(env.tracker, ['# T', '', H, S,
      `| 8 | 2026-06-01 | Snap | Sr Specialist, S&O | Los Angeles | 3.8/5 | Interview | ✅ | [8](reports/8-snap.md) | n | ${url} |`, ''].join('\n'));
    addTsv(env, '8-snap.tsv', ['8', '2026-06-25', 'Snap', 'Sr Specialist, S&O', 'Evaluated', '4.0/5', '❌', '[8](reports/8-snap.md)', 're-eval', url]);
    runMerge(env);
    const rows = trackerRows(env);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].split('|').length, H.split('|').length, 'same column count as header (no misalignment)');
    assert.ok(rows[0].includes('Los Angeles'), 'Location preserved across the re-eval');
    assert.ok(rows[0].includes('4.0/5') && rows[0].includes('Interview') && rows[0].includes('✅'), 'LWW score, status kept, PDF kept');
  } finally { cleanup(env); }
});

ok('legacy 9-col tracker (no URL column) still merges; URL is dropped, no crash', () => {
  const env = makeEnv();
  try {
    const H = '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |';
    const S = '|---|---|---|---|---|---|---|---|---|';
    writeFileSync(env.tracker, ['# T', '', H, S, ''].join('\n'));
    addTsv(env, '9-acme.tsv', ['9', '2026-06-25', 'Acme', 'Strategy Manager', 'Evaluated', '4.0/5', '❌', '[9](reports/9-acme.md)', 'n', 'https://acme.com/jobs/9']);
    runMerge(env);
    const rows = trackerRows(env);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].split('|').length, H.split('|').length, 'row stays 9-col');
    assert.ok(!rows[0].includes('acme.com'), 'URL dropped (no column to hold it)');
    assert.ok(rows[0].includes('4.0/5') && rows[0].includes('Acme'));
  } finally { cleanup(env); }
});

ok('--backfill-urls resolves a ROOT-relative reports/ link (the P0 regression)', () => {
  const env = makeEnv();
  try {
    writeFileSync(join(env.reportsDir, '13-figma-2026-06-25.md'),
      '# Eval\n**URL:** https://job-boards.greenhouse.io/figma/jobs/13\n');
    // root-relative link (the common real-tracker style), data/ layout
    writeTracker(env, [
      '| 13 | 2026-06-25 | Figma | Strategy & Ops | 3.5/5 | Evaluated | ❌ | [13](reports/13-figma-2026-06-25.md) | n |  |',
    ]);
    runMerge(env, ['--backfill-urls']);
    assert.ok(trackerRows(env)[0].includes('greenhouse.io/figma/jobs/13'), 'root-relative link resolved + url backfilled');
  } finally { cleanup(env); }
});

ok('row with `---` in its URL (Workday slug) stays visible to dedup', () => {
  const env = makeEnv();
  try {
    // Workday URLs encode `&`/spaces as `--`/`---`; the merge must not mistake
    // such a data row for the markdown separator and drop it from existingApps.
    const url = 'https://snapchat.wd1.myworkdayjobs.com/snap/job/LA/Senior-Specialist--Product-Strategy---Operations_R1';
    writeTracker(env, [
      `| 20 | 2026-06-01 | Snap | Senior Specialist, Product S&O | 3.0/5 | Evaluated | ❌ | [20](reports/20-snap.md) | n | ${url} |`,
    ]);
    addTsv(env, '20-snap.tsv', ['20', '2026-06-25', 'Snap', 'Senior Specialist, Product S&O', 'Evaluated', '4.0/5', '❌', '[20](reports/20-snap.md)', 're-eval', url]);
    runMerge(env);
    const rows = trackerRows(env);
    assert.equal(rows.length, 1, 'updated in place, not duplicated, despite --- in the URL');
    assert.ok(rows[0].includes('4.0/5'), 'the row was found and LWW-updated');
  } finally { cleanup(env); }
});

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
