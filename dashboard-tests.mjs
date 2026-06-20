#!/usr/bin/env node

/**
 * dashboard-tests.mjs — regression tests for generate-dashboard.mjs + activity.mjs.
 *
 * Locks in the behaviour established during code review:
 *   1. Tracker columns are mapped by header NAME, so a custom tracker (e.g. an
 *      extra Location column) doesn't shift Score/Status/Report (#946-style bug).
 *   2. An App#-tagged activity matches only that application — logging work for
 *      app 7 must not refresh app 8 at the same company.
 *   3. The needs-attention stale scan includes interview-stage apps.
 *   4. The embedded JSON is escaped so a literal </script> in scraped job data
 *      can't break out of the inline <script> (XSS).
 *   5. Report links are rebased relative to the output file.
 *   6. activity.mjs: a valueless --minutes flag logs 0 (not 1), and a first
 *      `add` self-heals .gitignore so the personal log isn't accidentally tracked.
 *
 * Provisions throwaway trackers via CAREER_OPS_TRACKER / CAREER_OPS_ACTIVITIES
 * and a temp CWD; never touches real user data.
 */

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;
const DASH = join(ROOT, 'generate-dashboard.mjs');
const ACT = join(ROOT, 'activity.mjs');

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

// Run generate-dashboard.mjs against provisioned content; return the embedded payload.
function genDashboard(trackerMd, activitiesMd) {
  const dir = tmp('dash-test-');
  const tracker = join(dir, 'applications.md');
  const activities = join(dir, 'activities.md');
  const out = join(dir, 'dashboard.html');
  writeFileSync(tracker, trackerMd);
  writeFileSync(activities, activitiesMd || '# Activity Log\n');
  execFileSync(NODE, [DASH, '--out', out], {
    cwd: ROOT,
    env: { ...process.env, CAREER_OPS_TRACKER: tracker, CAREER_OPS_ACTIVITIES: activities },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const html = readFileSync(out, 'utf8');
  return { html, dir, out, data: JSON.parse(html.match(/const DATA = (\{[\s\S]*?\});\n/)[1]) };
}

const cardsByGroup = (data) => Object.fromEntries(data.columns.map((c) => [c.group, c.cards]));

// ---------------------------------------------------------------------------
console.log('1. Header-name column mapping (custom Location column)');
{
  // Score/Status/Report shifted one column right by the inserted Location column.
  const md = [
    '# Applications Tracker', '',
    '| # | Date | Company | Role | Location | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|----------|-------|--------|-----|--------|-------|',
    '| 1 | 2026-06-19 | Acme | ML Eng | Remote | 4.5/5 | Applied | ✅ | [1](reports/001.md) | x |',
    '',
  ].join('\n');
  const { data } = genDashboard(md);
  const g = cardsByGroup(data);
  const applied = g.applied || [];
  check('Applied row lands in the applied column (not shifted to a bogus status)', applied.length === 1, JSON.stringify(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.length]))));
  check('Score parsed as 4.5 (Score column, not Location)', applied[0] && applied[0].score === 4.5, applied[0] && String(applied[0].score));
  check('Company parsed correctly', applied[0] && applied[0].company === 'Acme');
}

// ---------------------------------------------------------------------------
console.log('2. App#-tagged activity matches only its application');
{
  const md = [
    '# Applications Tracker', '',
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    '| 7 | 2026-05-01 | Acme | ML Eng | 4.5/5 | Applied | ✅ | [7](reports/007.md) | a |',
    '| 8 | 2026-05-02 | Acme | Data Eng | 4.3/5 | Applied | ✅ | [8](reports/008.md) | b |',
    '',
  ].join('\n');
  const acts = [
    '# Activity Log', '',
    '| Date | App# | Company | Role | Type | Minutes | Notes |',
    '|------|------|---------|------|------|---------|-------|',
    '| 2026-06-19 | 7 | Acme | ML Eng | call | 30 | app 7 only |',
    '',
  ].join('\n');
  const { data } = genDashboard(md, acts);
  const stale = data.stats.needsAttention.map((a) => a.num).sort();
  check('app 7 is fresh (App#-7 activity), app 8 is stale', JSON.stringify(stale) === '[8]', JSON.stringify(stale));
}

// ---------------------------------------------------------------------------
console.log('3. Stale scan includes interview-stage apps');
{
  const md = [
    '# Applications Tracker', '',
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    '| 1 | 2026-04-01 | Globex | Lead | 4.0/5 | Interview | ✅ | [1](reports/001.md) | old interview |',
    '',
  ].join('\n');
  const { data } = genDashboard(md);
  check('stalled interview is flagged in needs-attention', data.stats.needsAttention.some((a) => a.num === 1), JSON.stringify(data.stats.needsAttention));
}

// ---------------------------------------------------------------------------
console.log('4. JSON is escaped so </script> in data cannot break out');
{
  const md = [
    '# Applications Tracker', '',
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    '| 1 | 2026-06-19 | Ev</script><script>x | Eng | 4.0/5 | Applied | ✅ | [1](reports/001.md) | xss |',
    '',
  ].join('\n');
  const { html, data } = genDashboard(md);
  const payloadBlock = html.match(/const DATA = (\{[\s\S]*?\});\n/)[1];
  check('no raw </script> inside the embedded payload', !payloadBlock.includes('</script>'));
  check('company value preserved after JSON.parse (round-trips)', data.columns.flatMap((c) => c.cards)[0].company.includes('</script>'));
  check('exactly one real </script> (the closing tag)', (html.match(/<\/script>/g) || []).length === 1);
}

// ---------------------------------------------------------------------------
console.log('5. Report links are rebased relative to the output file');
{
  const md = [
    '# Applications Tracker', '',
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    '| 1 | 2026-06-19 | Acme | Eng | 4.0/5 | Applied | ✅ | [1](../reports/001.md) | x |',
    '',
  ].join('\n');
  // tracker at <dir>/applications.md, out at <dir>/dashboard.html (same dir):
  // "../reports/001.md" relative to the tracker dir, re-relativized to the out dir.
  const { data } = genDashboard(md);
  const href = data.columns.flatMap((c) => c.cards)[0].reportHref;
  check('report href is rebased (points at reports/, no leftover /data/)', /reports\/001\.md$/.test(href) && !href.includes('/data/'), href);
}

// ---------------------------------------------------------------------------
console.log('6. activity.mjs — valueless --minutes logs 0, and .gitignore self-heal');
{
  // 6a: --minutes with no value must not become 1
  const dir = tmp('act-test-');
  const log = join(dir, 'activities.md');
  execFileSync(NODE, [ACT, 'add', '--company', 'Acme', '--type', 'call', '--minutes', '--note', 'no minutes'], {
    cwd: ROOT, env: { ...process.env, CAREER_OPS_ACTIVITIES: log }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const summary = execFileSync(NODE, [ACT, 'summary'], {
    cwd: ROOT, env: { ...process.env, CAREER_OPS_ACTIVITIES: log }, encoding: 'utf8',
  });
  check('valueless --minutes logs 0m total (not 1m)', /0m logged/.test(summary), summary.split('\n')[0]);

  // 6b: a first `add` on the default path self-heals .gitignore (idempotent)
  const repo = tmp('act-repo-');
  writeFileSync(join(repo, '.gitignore'), 'node_modules\noutput/*\n');
  const addOnce = () => execFileSync(NODE, [ACT, 'add', '--company', 'Acme', '--type', 'prep', '--minutes', '10'], {
    cwd: repo, env: { ...process.env, CAREER_OPS_ACTIVITIES: '' }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  addOnce(); addOnce();
  const gi = readFileSync(join(repo, '.gitignore'), 'utf8');
  const ruleCount = gi.split('\n').filter((l) => l.trim() === 'data/activities.md').length;
  check('.gitignore gains exactly one data/activities.md rule (idempotent)', ruleCount === 1, `count=${ruleCount}`);
}

// ---------------------------------------------------------------------------
console.log('7. Empty tracker is handled gracefully');
{
  const md = '# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|---|---|---|---|---|---|---|---|\n';
  const { data } = genDashboard(md);
  check('zero applications, no crash', data.stats.total === 0 && Array.isArray(data.columns));
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
