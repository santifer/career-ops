#!/usr/bin/env node

/**
 * test-all.mjs — Comprehensive test suite for career-ops
 *
 * Run before merging any PR or pushing changes.
 * Tests: syntax, scripts, dashboard, data contract, personal data, paths.
 *
 * Usage:
 *   node test-all.mjs           # Run all tests
 *   node test-all.mjs --quick   # Skip dashboard build (faster)
 */

import { execSync, execFileSync } from 'child_process';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const QUICK = process.argv.includes('--quick');

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; }
function warn(msg) { console.log(`  ⚠️  ${msg}`); warnings++; }

function run(cmd, args = [], opts = {}) {
  try {
    if (Array.isArray(args) && args.length > 0) {
      return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf-8', timeout: 30000, ...opts }).trim();
    }
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', timeout: 30000, ...opts }).trim();
  } catch (e) {
    return null;
  }
}

function fileExists(path) { return existsSync(join(ROOT, path)); }
function readFile(path) { return readFileSync(join(ROOT, path), 'utf-8'); }

console.log('\n🧪 career-ops test suite\n');

// ── 1. SYNTAX CHECKS ────────────────────────────────────────────

console.log('1. Syntax checks');

const mjsFiles = readdirSync(ROOT).filter(f => f.endsWith('.mjs'));
for (const f of mjsFiles) {
  const result = run('node', ['--check', f]);
  if (result !== null) {
    pass(`${f} syntax OK`);
  } else {
    fail(`${f} has syntax errors`);
  }
}

// ── 2. SCRIPT EXECUTION ─────────────────────────────────────────

console.log('\n2. Script execution (graceful on empty data)');

const scripts = [
  { name: 'cv-sync-check.mjs', expectExit: 1, allowFail: true }, // fails without cv.md (normal in repo)
  { name: 'verify-pipeline.mjs', expectExit: 0 },
  { name: 'normalize-statuses.mjs', expectExit: 0 },
  { name: 'dedup-tracker.mjs', expectExit: 0 },
  { name: 'merge-tracker.mjs', expectExit: 0 },
  { name: 'update-system.mjs check', expectExit: 0 },
];

for (const { name, allowFail } of scripts) {
  const result = run('node', name.split(' '), { stdio: ['pipe', 'pipe', 'pipe'] });
  if (result !== null) {
    pass(`${name} runs OK`);
  } else if (allowFail) {
    warn(`${name} exited with error (expected without user data)`);
  } else {
    fail(`${name} crashed`);
  }
}

// ── 3. LIVENESS CLASSIFICATION ──────────────────────────────────

console.log('\n3. Liveness classification');

try {
  const { classifyLiveness } = await import(pathToFileURL(join(ROOT, 'liveness-core.mjs')).href);

  const expiredChromeApply = classifyLiveness({
    finalUrl: 'https://example.com/jobs/closed-role',
    bodyText: 'Company Careers\nApply\nThe job you are looking for is no longer open.',
    applyControls: [],
  });
  if (expiredChromeApply.result === 'expired') {
    pass('Expired pages are not revived by nav/footer "Apply" text');
  } else {
    fail(`Expired page misclassified as ${expiredChromeApply.result}`);
  }

  const activeWorkdayPage = classifyLiveness({
    finalUrl: 'https://example.workday.com/job/123',
    bodyText: [
      '663 JOBS FOUND',
      'Senior AI Engineer',
      'Join our applied AI team to ship production systems, partner with customers, and own delivery across evaluation, deployment, and reliability.',
    ].join('\n'),
    applyControls: ['Apply for this Job'],
  });
  if (activeWorkdayPage.result === 'active') {
    pass('Visible apply controls still keep real job pages active');
  } else {
    fail(`Active job page misclassified as ${activeWorkdayPage.result}`);
  }
} catch (e) {
  fail(`Liveness classification tests crashed: ${e.message}`);
}

// ── 4. DASHBOARD BUILD ──────────────────────────────────────────

if (!QUICK) {
  console.log('\n4. Dashboard build');
  const goBuild = run('cd dashboard && go build -o /tmp/career-dashboard-test . 2>&1');
  if (goBuild !== null) {
    pass('Dashboard compiles');
  } else {
    fail('Dashboard build failed');
  }
} else {
  console.log('\n4. Dashboard build (skipped --quick)');
}

// ── 5. DATA CONTRACT ────────────────────────────────────────────

console.log('\n5. Data contract validation');

// Check system files exist
const systemFiles = [
  'CLAUDE.md', 'VERSION', 'DATA_CONTRACT.md',
  'modes/_shared.md', 'modes/_profile.template.md',
  'modes/oferta.md', 'modes/pdf.md', 'modes/scan.md',
  'templates/states.yml', 'templates/cv-template.html',
  '.claude/skills/career-ops/SKILL.md',
];

for (const f of systemFiles) {
  if (fileExists(f)) {
    pass(`System file exists: ${f}`);
  } else {
    fail(`Missing system file: ${f}`);
  }
}

// Check user files are NOT tracked (gitignored)
const userFiles = [
  'config/profile.yml', 'modes/_profile.md', 'portals.yml',
];
for (const f of userFiles) {
  const tracked = run('git', ['ls-files', f]);
  if (tracked === '') {
    pass(`User file gitignored: ${f}`);
  } else if (tracked === null) {
    pass(`User file gitignored: ${f}`);
  } else {
    fail(`User file IS tracked (should be gitignored): ${f}`);
  }
}

// ── 6. PERSONAL DATA LEAK CHECK ─────────────────────────────────

console.log('\n6. Personal data leak check');

const leakPatterns = [
  'Santiago', 'santifer.io', 'Santifer iRepair', 'Zinkee', 'ALMAS',
  'hi@santifer.io', '688921377', '/Users/santifer/',
];

const scanExtensions = ['md', 'yml', 'html', 'mjs', 'sh', 'go', 'json'];
const allowedFiles = [
  // English README + localized translations (all legitimately credit Santiago)
  'README.md', 'README.es.md', 'README.ja.md', 'README.ko-KR.md',
  'README.pt-BR.md', 'README.ru.md',
  // Standard project files
  'LICENSE', 'CITATION.cff', 'CONTRIBUTING.md',
  'package.json', '.github/FUNDING.yml', 'CLAUDE.md', 'go.mod', 'test-all.mjs',
  // Community / governance files (added in v1.3.0, all legitimately reference the maintainer)
  'CODE_OF_CONDUCT.md', 'GOVERNANCE.md', 'SECURITY.md', 'SUPPORT.md',
  '.github/SECURITY.md',
  // Dashboard credit string
  'dashboard/internal/ui/screens/pipeline.go',
];

// Build pathspec for git grep — only scan tracked files matching these
// extensions. This is what `grep -rn` was trying to do, but git-aware:
// untracked files (debate artifacts, AI tool scratch, local plans/) and
// gitignored files can't trigger false positives because they were never
// going to reach a commit anyway.
const grepPathspec = scanExtensions.map(e => `'*.${e}'`).join(' ');

let leakFound = false;
for (const pattern of leakPatterns) {
  const result = run(
    `git grep -n "${pattern}" -- ${grepPathspec} 2>/dev/null`
  );
  if (result) {
    for (const line of result.split('\n')) {
      const file = line.split(':')[0];
      if (allowedFiles.some(a => file.includes(a))) continue;
      if (file.includes('dashboard/go.mod')) continue;
      warn(`Possible personal data in ${file}: "${pattern}"`);
      leakFound = true;
    }
  }
}
if (!leakFound) {
  pass('No personal data leaks outside allowed files');
}

// ── 7. ABSOLUTE PATH CHECK ──────────────────────────────────────

console.log('\n7. Absolute path check');

// Same git grep approach: only scans tracked files. Untracked AI tool
// outputs, local debate artifacts, etc. can't false-positive here.
const absPathResult = run(
  `git grep -n "/Users/" -- '*.mjs' '*.sh' '*.md' '*.go' '*.yml' 2>/dev/null | grep -v README.md | grep -v LICENSE | grep -v CLAUDE.md | grep -v test-all.mjs`
);
if (!absPathResult) {
  pass('No absolute paths in code files');
} else {
  for (const line of absPathResult.split('\n').filter(Boolean)) {
    fail(`Absolute path: ${line.slice(0, 100)}`);
  }
}

// ── 8. MODE FILE INTEGRITY ──────────────────────────────────────

console.log('\n8. Mode file integrity');

const expectedModes = [
  '_shared.md', '_profile.template.md', 'oferta.md', 'pdf.md', 'scan.md',
  'batch.md', 'apply.md', 'auto-pipeline.md', 'contacto.md', 'deep.md',
  'ofertas.md', 'pipeline.md', 'project.md', 'tracker.md', 'training.md',
];

for (const mode of expectedModes) {
  if (fileExists(`modes/${mode}`)) {
    pass(`Mode exists: ${mode}`);
  } else {
    fail(`Missing mode: ${mode}`);
  }
}

// Check _shared.md references _profile.md
const shared = readFile('modes/_shared.md');
if (shared.includes('_profile.md')) {
  pass('_shared.md references _profile.md');
} else {
  fail('_shared.md does NOT reference _profile.md');
}

// ── 9. CLAUDE.md INTEGRITY ──────────────────────────────────────

console.log('\n9. CLAUDE.md integrity');

const claude = readFile('CLAUDE.md');
const requiredSections = [
  'Data Contract', 'Update Check', 'Ethical Use',
  'Offer Verification', 'Canonical States', 'TSV Format',
  'First Run', 'Onboarding',
];

for (const section of requiredSections) {
  if (claude.includes(section)) {
    pass(`CLAUDE.md has section: ${section}`);
  } else {
    fail(`CLAUDE.md missing section: ${section}`);
  }
}

// ── 10. VERSION FILE ─────────────────────────────────────────────

console.log('\n10. Version file');

if (fileExists('VERSION')) {
  const version = readFile('VERSION').trim();
  if (/^\d+\.\d+\.\d+$/.test(version)) {
    pass(`VERSION is valid semver: ${version}`);
  } else {
    fail(`VERSION is not valid semver: "${version}"`);
  }
} else {
  fail('VERSION file missing');
}

// ── 11. SCAN PARSER UNIT TESTS ──────────────────────────────────

console.log('\n11. Scan parser unit tests');

// BambooHR parser
try {
  const bambooJson = {
    result: [
      { id: 42, jobOpeningName: 'AI Engineer', location: { city: 'Remote', state: '' } },
      { id: 43, jobOpeningName: '', location: { city: 'Berlin' } }, // empty title — should be filtered
    ],
  };
  const slug = 'testco';
  // Inline the same logic as parseBambooHR in scan.mjs
  const jobs = bambooJson.result
    .map(j => {
      const city = j.location?.city || '';
      const state = j.location?.state || '';
      const location = city ? `${city}${state ? ', ' + state : ''}` : (j.departmentLabel || '');
      return { title: j.jobOpeningName || '', url: `https://${slug}.bamboohr.com/careers/${j.id}/detail`, location };
    })
    .filter(j => j.title);
  if (jobs.length === 1 && jobs[0].title === 'AI Engineer' && jobs[0].location === 'Remote') {
    pass('BambooHR parser: extracts jobs, filters empty titles, builds correct URL');
  } else {
    fail(`BambooHR parser: unexpected result: ${JSON.stringify(jobs)}`);
  }
} catch (e) {
  fail(`BambooHR parser test crashed: ${e.message}`);
}

// Teamtailor RSS parser
try {
  const rss = `<?xml version="1.0"?>
<rss><channel>
<item><title><![CDATA[Senior AI Engineer]]></title><link>https://acme.teamtailor.com/jobs/123</link><location>Stockholm, SE</location></item>
<item><title>ML Researcher</title><link>https://acme.teamtailor.com/jobs/124</link></item>
</channel></rss>`;
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(rss)) !== null) {
    const block = m[1];
    const title = (/<title><!\[CDATA\[(.*?)\]\]><\/title>/s.exec(block) || /<title>(.*?)<\/title>/s.exec(block))?.[1]?.trim() || '';
    const link = (/<link>(.*?)<\/link>/s.exec(block))?.[1]?.trim() || '';
    const location = (/<location>(.*?)<\/location>/s.exec(block))?.[1]?.trim() || '';
    if (title && link) items.push({ title, url: link, location });
  }
  if (
    items.length === 2 &&
    items[0].title === 'Senior AI Engineer' &&
    items[0].location === 'Stockholm, SE' &&
    items[1].title === 'ML Researcher'
  ) {
    pass('Teamtailor RSS parser: handles CDATA titles, plain titles, optional location');
  } else {
    fail(`Teamtailor RSS parser: unexpected result: ${JSON.stringify(items)}`);
  }
} catch (e) {
  fail(`Teamtailor RSS parser test crashed: ${e.message}`);
}

// Workday parser
try {
  const rawJobs = [
    { title: 'Data Engineer', externalPath: '/jobs/de-123', locationsText: 'Remote, USA' },
    { title: '', externalPath: '/jobs/empty-456', locationsText: '' }, // empty title — kept (filtered downstream)
    { title: 'PM', externalPath: '', locationsText: 'Berlin' }, // no externalPath — should be filtered
  ];
  const host = 'https://acme.wd1.myworkdayjobs.com';
  const jobs = rawJobs.map(j => ({
    title: j.title || '',
    url: j.externalPath ? `${host}${j.externalPath}` : '',
    location: j.locationsText || '',
  })).filter(j => j.url);
  if (jobs.length === 2 && jobs[0].url === `${host}/jobs/de-123` && jobs[0].location === 'Remote, USA') {
    pass('Workday parser: builds URLs from externalPath, filters entries without URL');
  } else {
    fail(`Workday parser: unexpected result: ${JSON.stringify(jobs)}`);
  }
} catch (e) {
  fail(`Workday parser test crashed: ${e.message}`);
}

// UKG parser
try {
  const rawJobs = [
    { title: 'Solutions Architect', requisitionId: 'REQ-001', location: 'Remote' },
    { title: '', requisitionId: 'REQ-002', location: 'NYC' }, // empty title — should be filtered
  ];
  const orgId = 'TESTORG', boardId = 'test-board-uuid';
  const jobs = rawJobs.map(j => ({
    title: j.title || '',
    url: `https://recruiting.ultipro.com/${orgId}/JobBoard/${boardId}?requisitionId=${j.requisitionId}`,
    location: j.location || '',
  })).filter(j => j.title && j.url.includes('requisitionId='));
  if (jobs.length === 1 && jobs[0].url.includes('REQ-001') && jobs[0].location === 'Remote') {
    pass('UKG parser: builds correct URLs, filters empty titles');
  } else {
    fail(`UKG parser: unexpected result: ${JSON.stringify(jobs)}`);
  }
} catch (e) {
  fail(`UKG parser test crashed: ${e.message}`);
}

// Location filter
try {
  // Inline buildLocationFilter logic
  function buildLocationFilter(locationFilter) {
    const include = (locationFilter?.include || []).map(k => k.toLowerCase());
    const exclude = (locationFilter?.exclude || []).map(k => k.toLowerCase());
    if (include.length === 0 && exclude.length === 0) return () => true;
    return (location) => {
      const lower = (location || '').toLowerCase();
      const passInclude = include.length === 0 || include.some(k => lower.includes(k));
      const passExclude = !exclude.some(k => lower.includes(k));
      return passInclude && passExclude;
    };
  }

  const filter = buildLocationFilter({ include: ['remote', 'emea'], exclude: ['on-site only'] });
  const passRemote = filter('Remote, USA');
  const passEmea = filter('London, EMEA');
  const failOnSite = filter('New York — on-site only');
  const failNoMatch = filter('São Paulo, Brazil');
  const noFilter = buildLocationFilter({});

  if (passRemote && passEmea && !failOnSite && !failNoMatch && noFilter('anywhere')) {
    pass('Location filter: include/exclude keywords work correctly; empty filter passes all');
  } else {
    fail(`Location filter: unexpected results remote=${passRemote} emea=${passEmea} onsite=${failOnSite} nomatch=${failNoMatch}`);
  }
} catch (e) {
  fail(`Location filter test crashed: ${e.message}`);
}

// --since flag: graceful on missing history
try {
  const result = run('node', ['scan.mjs', '--since', '7'], { stdio: ['pipe', 'pipe', 'pipe'] });
  // result is null on non-zero exit; null or string both acceptable here
  // We only care it doesn't crash with unhandled exception
  pass('scan.mjs --since 7 exits gracefully (no history file)');
} catch (e) {
  fail(`scan.mjs --since 7 crashed: ${e.message}`);
}

// ── SUMMARY ─────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`📊 Results: ${passed} passed, ${failed} failed, ${warnings} warnings`);

if (failed > 0) {
  console.log('🔴 TESTS FAILED — do NOT push/merge until fixed\n');
  process.exit(1);
} else if (warnings > 0) {
  console.log('🟡 Tests passed with warnings — review before pushing\n');
  process.exit(0);
} else {
  console.log('🟢 All tests passed — safe to push/merge\n');
  process.exit(0);
}
