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

// ── 11. SCAN UNIT TESTS (via imports) ───────────────────────────

console.log('\n11. Scan unit tests');

try {
  const scan = await import(pathToFileURL(join(ROOT, 'scan.mjs')).href);
  const {
    detectApi, buildTitleFilter, buildLocationFilter,
    formatPipelineEntry, parseBambooHR, parseTeamtailor,
    parseWorkday, parseUkg, showSince, withRetry,
  } = scan;

  // ── detectApi: URL pattern detection ──

  const cases = [
    // Ashby
    [{ careers_url: 'https://jobs.ashbyhq.com/cohere' }, 'ashby', 'api.ashbyhq.com/posting-api/job-board/cohere'],
    // Lever
    [{ careers_url: 'https://jobs.lever.co/mistral' }, 'lever', 'api.lever.co/v0/postings/mistral'],
    // Greenhouse via explicit api field
    [{ api: 'https://boards-api.greenhouse.io/v1/boards/anthropic/jobs' }, 'greenhouse', 'boards-api.greenhouse.io'],
    // Greenhouse via EU board URL
    [{ careers_url: 'https://job-boards.eu.greenhouse.io/parloa' }, 'greenhouse', 'boards-api.greenhouse.io/v1/boards/parloa'],
    // Greenhouse via standard board URL
    [{ careers_url: 'https://job-boards.greenhouse.io/vercel' }, 'greenhouse', 'boards-api.greenhouse.io/v1/boards/vercel'],
    // BambooHR
    [{ careers_url: 'https://loom.bamboohr.com/careers/list' }, 'bamboohr', 'loom.bamboohr.com/careers/list'],
    // Teamtailor
    [{ careers_url: 'https://klarna.teamtailor.com/jobs' }, 'teamtailor', 'klarna.teamtailor.com/jobs.rss'],
    // Workday
    [{ careers_url: 'https://snowflake.wd1.myworkdayjobs.com/en-US/Snowflake_External' }, 'workday', 'myworkdayjobs.com/wday/cxs/snowflake/Snowflake_External/jobs'],
    // UKG
    [{ careers_url: 'https://recruiting.ultipro.com/ACME123/JobBoard/aabb-1234-ccdd-5678/' }, 'ukg', 'JobSearchAPI/GetJobs'],
    // Unknown — returns null
    [{ careers_url: 'https://careers.example.com/jobs' }, null, ''],
  ];

  let detectOk = true;
  for (const [input, expectedType, expectedUrlPart] of cases) {
    const result = detectApi(input);
    if (expectedType === null) {
      if (result !== null) { fail(`detectApi: expected null for ${input.careers_url}, got ${result?.type}`); detectOk = false; }
    } else {
      if (!result) { fail(`detectApi: got null for ${JSON.stringify(input)}, expected type=${expectedType}`); detectOk = false; continue; }
      if (result.type !== expectedType) { fail(`detectApi: expected type=${expectedType} for ${input.careers_url || input.api}, got ${result.type}`); detectOk = false; }
      if (expectedUrlPart && !result.url.includes(expectedUrlPart)) { fail(`detectApi: expected URL to contain "${expectedUrlPart}", got ${result.url}`); detectOk = false; }
    }
  }
  if (detectOk) pass(`detectApi: all ${cases.length} URL patterns correctly identified`);

  // BambooHR slug extraction via detectApi
  const bambooResult = detectApi({ careers_url: 'https://loom.bamboohr.com/careers/list' });
  if (bambooResult?.slug === 'loom') {
    pass('detectApi: BambooHR slug extracted correctly');
  } else {
    fail(`detectApi: BambooHR slug wrong — got ${bambooResult?.slug}`);
  }

  // Workday host extraction via detectApi
  const wdResult = detectApi({ careers_url: 'https://snowflake.wd1.myworkdayjobs.com/en-US/Snowflake_External' });
  if (wdResult?.host === 'https://snowflake.wd1.myworkdayjobs.com') {
    pass('detectApi: Workday host extracted correctly');
  } else {
    fail(`detectApi: Workday host wrong — got ${wdResult?.host}`);
  }

  // UKG orgId/boardId extraction via detectApi
  const ukgResult = detectApi({ careers_url: 'https://recruiting.ultipro.com/ACME123/JobBoard/aabb-1234-ccdd-5678/' });
  if (ukgResult?.orgId === 'ACME123' && ukgResult?.boardId === 'aabb-1234-ccdd-5678') {
    pass('detectApi: UKG orgId and boardId extracted correctly');
  } else {
    fail(`detectApi: UKG extraction wrong — orgId=${ukgResult?.orgId} boardId=${ukgResult?.boardId}`);
  }

  // ── parseBambooHR ──

  const bambooJobs = parseBambooHR(
    { result: [
      { id: 42, jobOpeningName: 'AI Engineer', location: { city: 'Remote', state: '' } },
      { id: 43, jobOpeningName: 'ML Lead', location: { city: 'Berlin', state: 'BE' } },
      { id: 44, jobOpeningName: '', location: { city: 'NYC' } },       // empty title — filtered
      { id: 45, jobOpeningName: 'DevRel', location: null, departmentLabel: 'Engineering' }, // no city — fallback
    ]},
    'Testco', 'testco'
  );
  if (
    bambooJobs.length === 3 &&
    bambooJobs[0].location === 'Remote' &&
    bambooJobs[1].location === 'Berlin, BE' &&
    bambooJobs[2].location === 'Engineering' &&
    bambooJobs[0].url === 'https://testco.bamboohr.com/careers/42/detail'
  ) {
    pass('parseBambooHR: location variants, empty title filter, departmentLabel fallback');
  } else {
    fail(`parseBambooHR: unexpected result: ${JSON.stringify(bambooJobs)}`);
  }

  // ── parseTeamtailor ──

  const rss = `<?xml version="1.0"?>
<rss><channel>
<item><title><![CDATA[Senior AI Engineer]]></title><link>https://acme.teamtailor.com/jobs/123</link><location>Stockholm, SE</location></item>
<item><title>ML Researcher</title><link>https://acme.teamtailor.com/jobs/124</link></item>
<item><title><![CDATA[]]></title><link>https://acme.teamtailor.com/jobs/125</link></item>
</channel></rss>`;
  const ttJobs = parseTeamtailor(rss, 'Acme');
  if (
    ttJobs.length === 2 &&
    ttJobs[0].title === 'Senior AI Engineer' &&
    ttJobs[0].location === 'Stockholm, SE' &&
    ttJobs[1].title === 'ML Researcher' &&
    ttJobs[1].location === ''
  ) {
    pass('parseTeamtailor: CDATA titles, plain titles, empty CDATA filtered, optional location');
  } else {
    fail(`parseTeamtailor: unexpected result: ${JSON.stringify(ttJobs)}`);
  }

  // ── parseWorkday ──

  const wdJobs = parseWorkday(
    [
      { title: 'Data Engineer', externalPath: '/jobs/de-123', locationsText: 'Remote, USA' },
      { title: 'PM', externalPath: '', locationsText: 'Berlin' },     // no path — filtered
      { title: '', externalPath: '/jobs/empty-456', locationsText: '' }, // empty title — kept (title filter downstream)
    ],
    'Snowflake', 'https://snowflake.wd1.myworkdayjobs.com'
  );
  if (
    wdJobs.length === 2 &&
    wdJobs[0].url === 'https://snowflake.wd1.myworkdayjobs.com/jobs/de-123' &&
    wdJobs[0].location === 'Remote, USA'
  ) {
    pass('parseWorkday: builds URLs from externalPath, filters entries without path');
  } else {
    fail(`parseWorkday: unexpected result: ${JSON.stringify(wdJobs)}`);
  }

  // ── parseUkg ──

  const ukgJobs = parseUkg(
    [
      { title: 'Solutions Architect', requisitionId: 'REQ-001', location: 'Remote' },
      { title: '', requisitionId: 'REQ-002', location: 'NYC' },       // empty title — filtered
      { title: 'Engineer', requisitionId: undefined, location: 'SF' }, // no requisitionId — filtered
    ],
    'Acme', 'ACME123', 'board-uuid'
  );
  if (
    ukgJobs.length === 1 &&
    ukgJobs[0].url === 'https://recruiting.ultipro.com/ACME123/JobBoard/board-uuid?requisitionId=REQ-001' &&
    ukgJobs[0].location === 'Remote'
  ) {
    pass('parseUkg: correct URL format, filters empty title and missing requisitionId');
  } else {
    fail(`parseUkg: unexpected result: ${JSON.stringify(ukgJobs)}`);
  }

  // ── buildTitleFilter ──

  const tf = buildTitleFilter({ positive: ['AI', 'ML'], negative: ['Junior', 'Intern'] });
  if (tf('AI Engineer') && tf('Senior ML Lead') && !tf('Junior AI Dev') && !tf('AI Intern')) {
    pass('buildTitleFilter: positive/negative keyword matching works');
  } else {
    fail('buildTitleFilter: unexpected match result');
  }
  const tfEmpty = buildTitleFilter({});
  if (tfEmpty('Anything Goes')) {
    pass('buildTitleFilter: empty config accepts all titles');
  } else {
    fail('buildTitleFilter: empty config should accept all');
  }

  // ── buildLocationFilter ──

  const lf = buildLocationFilter({ include: ['remote', 'emea'], exclude: ['on-site only'] });
  if (
    lf('Remote, USA') &&
    lf('London, EMEA') &&
    !lf('New York — on-site only') &&
    !lf('São Paulo, Brazil')
  ) {
    pass('buildLocationFilter: include/exclude keywords, case-insensitive');
  } else {
    fail('buildLocationFilter: unexpected match result');
  }
  const lfEmpty = buildLocationFilter({});
  if (lfEmpty('anywhere') && lfEmpty('')) {
    pass('buildLocationFilter: empty config accepts all locations including empty string');
  } else {
    fail('buildLocationFilter: empty config should accept all');
  }

  // ── formatPipelineEntry ──

  const e1 = formatPipelineEntry({ url: 'https://example.com/job/1', company: 'Acme', title: 'AI Eng', location: 'Remote', compensation: '$120K' });
  const e2 = formatPipelineEntry({ url: 'https://example.com/job/2', company: 'Acme', title: 'ML Lead', location: '', compensation: '' });
  const e3 = formatPipelineEntry({ url: 'https://example.com/job/3', company: 'Acme', title: 'DevRel', location: 'Berlin', compensation: '' });
  if (
    e1 === '- [ ] https://example.com/job/1 | Acme | AI Eng | Remote | $120K' &&
    e2 === '- [ ] https://example.com/job/2 | Acme | ML Lead' &&
    e3 === '- [ ] https://example.com/job/3 | Acme | DevRel | Berlin'
  ) {
    pass('formatPipelineEntry: includes location+comp when present, omits when absent');
  } else {
    fail(`formatPipelineEntry: unexpected output:\n  e1: ${e1}\n  e2: ${e2}\n  e3: ${e3}`);
  }

  // ── withRetry: succeeds on second attempt ──

  let callCount = 0;
  const retryResult = await withRetry(async () => {
    callCount++;
    if (callCount < 2) throw new Error('network blip');
    return 'ok';
  }, 3);
  if (retryResult === 'ok' && callCount === 2) {
    pass('withRetry: retries on transient error, succeeds on second attempt');
  } else {
    fail(`withRetry: expected success on attempt 2, got callCount=${callCount} result=${retryResult}`);
  }

  // withRetry: does NOT retry on 404
  let calls404 = 0;
  try {
    await withRetry(async () => { calls404++; throw new Error('HTTP 404'); }, 3);
    fail('withRetry: should have thrown on 404');
  } catch (err) {
    if (calls404 === 1 && err.message === 'HTTP 404') {
      pass('withRetry: does not retry on 404 client error');
    } else {
      fail(`withRetry: expected 1 call for 404, got ${calls404}`);
    }
  }

  // withRetry: DOES retry on 503
  let calls503 = 0;
  try {
    await withRetry(async () => { calls503++; throw new Error('HTTP 503'); }, 2);
    fail('withRetry: should have thrown after exhausting retries on 503');
  } catch (err) {
    if (calls503 === 3) { // initial + 2 retries
      pass('withRetry: retries on 503 server error up to maxRetries');
    } else {
      fail(`withRetry: expected 3 attempts for 503, got ${calls503}`);
    }
  }

  // ── showSince: reads history correctly ──

  const { mkdtempSync, writeFileSync: wfs, rmSync } = await import('fs');
  const { tmpdir } = await import('os');
  const tmpDir = mkdtempSync(tmpdir() + '/scan-test-');
  const historyPath = tmpDir + '/scan-history.tsv';
  const today = new Date().toISOString().slice(0, 10);
  const old = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  wfs(historyPath, [
    'url\tfirst_seen\tportal\ttitle\tcompany\tstatus',
    `https://example.com/job/1\t${today}\tashby-api\tAI Engineer\tAcme\tadded`,
    `https://example.com/job/2\t${old}\tashby-api\tOld Job\tAcme\tadded`,
    `https://example.com/job/3\t${today}\tashby-api\tFiltered Job\tAcme\tskipped_title`,
  ].join('\n') + '\n');

  // Capture console output
  const lines = [];
  const origLog = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  showSince(7, historyPath);
  console.log = origLog;

  rmSync(tmpDir, { recursive: true });

  const output = lines.join('\n');
  const hasRecent = output.includes('AI Engineer') && output.includes('Acme');
  const hasOld = output.includes('Old Job');
  const hasFiltered = output.includes('Filtered Job');
  if (hasRecent && !hasOld && !hasFiltered) {
    pass('showSince: shows only added offers within date window, excludes old and skipped');
  } else {
    fail(`showSince: recent=${hasRecent} old=${hasOld} filtered=${hasFiltered}\noutput: ${output.slice(0, 200)}`);
  }

  // --since with invalid argument exits non-zero
  const invalidResult = run('node', ['scan.mjs', '--since', 'abc'], { stdio: ['pipe', 'pipe', 'pipe'] });
  if (invalidResult === null) {
    pass('scan.mjs --since abc: exits non-zero for invalid argument');
  } else {
    fail('scan.mjs --since abc: should exit non-zero');
  }

} catch (e) {
  fail(`Scan unit tests failed to load: ${e.message}`);
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
