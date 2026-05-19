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

  const closedMycareersfuture = classifyLiveness({
    finalUrl: 'https://www.mycareersfuture.gov.sg/job/engineering/senior-staff-embedded-software-engineer',
    bodyText: [
      'Senior Staff Embedded Software Engineer',
      'MaxLinear Asia Singapore Private Limited',
      '9 applications    Posted 27 Oct 2025    Closed on 26 Nov 2025',
      'Applications have closed for this job',
      'Log in to Apply',
      "You'll need to log in with Singpass to verify your identity.",
      'Roles & Responsibilities: design, develop and maintain embedded firmware for broadband communications ICs.',
    ].join('\n'),
    applyControls: ['Log in to Apply'],
  });
  if (closedMycareersfuture.result === 'expired') {
    pass('Closed postings with "Applications have closed" banner are detected');
  } else {
    fail(`Closed mycareersfuture posting misclassified as ${closedMycareersfuture.result}`);
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
  'package.json', '.github/FUNDING.yml', 'CLAUDE.md', 'AGENTS.md', 'go.mod', 'test-all.mjs',
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

// ── 9. AGENTS.md INTEGRITY ──────────────────────────────────────

console.log('\n9. AGENTS.md integrity');

const agents = readFile('AGENTS.md');
const requiredSections = [
  'Data Contract', 'Update Check', 'Ethical Use',
  'Offer Verification', 'Canonical States', 'TSV Format',
  'First Run', 'Onboarding',
];

for (const section of requiredSections) {
  if (agents.includes(section)) {
    pass(`AGENTS.md has section: ${section}`);
  } else {
    fail(`AGENTS.md missing section: ${section}`);
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

// ── 11. PROVIDERS — Apify ──────────────────────────────────────

console.log('\n11. Provider — apify');

try {
  const apifyMod = await import(pathToFileURL(join(ROOT, 'providers/apify.mjs')).href);
  const apify = apifyMod.default;
  const { isFieldSpec, isHttpsUrl, normalizeItem, htmlToText } = apifyMod;
  const { normalizeActorId } = await import(pathToFileURL(join(ROOT, 'providers/_apify.mjs')).href);

  // -- id + detect (no auto-detect — explicit provider: apify required) --
  if (apify.id === 'apify') pass('apify.id is "apify"');
  else fail(`apify.id is ${JSON.stringify(apify.id)}`);

  if (apify.detect({ name: 'X', careers_url: 'https://anything.example' }) === null) {
    pass('apify.detect() always returns null (no auto-detect)');
  } else {
    fail('apify.detect() must return null; provider: apify is required');
  }

  // -- isHttpsUrl — guards actor-supplied URLs at the boundary --
  if (isHttpsUrl('https://example.com/job/123')) pass('isHttpsUrl accepts https URLs');
  else fail('isHttpsUrl should accept https URLs');

  for (const bad of [
    'http://example.com',           // downgrade
    'javascript:alert(1)',          // XSS-via-click
    'data:text/html,<x>',           // arbitrary content
    'file:///etc/passwd',           // local file
    'ftp://example.com/x',          // wrong protocol
    'not-a-url',                    // malformed → URL throws
    '',                             // empty
    null,                           // non-string
    undefined,                      // non-string
  ]) {
    if (!isHttpsUrl(bad)) pass(`isHttpsUrl rejects ${JSON.stringify(bad)}`);
    else fail(`isHttpsUrl must reject ${JSON.stringify(bad)}`);
  }

  // -- isFieldSpec — config-time validation of field_map shapes --
  if (isFieldSpec('positionName')) pass('isFieldSpec accepts a single string key');
  else fail('isFieldSpec should accept a single string key');

  if (isFieldSpec(['positionName', 'title'])) pass('isFieldSpec accepts a non-empty string array');
  else fail('isFieldSpec should accept a non-empty string array');

  for (const bad of [
    42,                  // number
    [],                  // empty array
    ['title', 42],       // mixed types
    null,                // null
    {},                  // object
  ]) {
    if (!isFieldSpec(bad)) pass(`isFieldSpec rejects ${JSON.stringify(bad)}`);
    else fail(`isFieldSpec must reject ${JSON.stringify(bad)}`);
  }

  // -- normalizeItem — fallback ordering + defaults whitelist --
  const item = { positionName: 'Senior PM', url: 'https://x.example/1', companyName: 'Acme' };
  const fmap = {
    title:    ['positionName', 'title'],
    url:      'url',
    company:  ['company', 'companyName'],
    location: 'location',
  };
  const norm = normalizeItem(item, fmap, { company: 'IgnoredBecauseAlreadySet', location: 'Remote' });
  if (norm.title === 'Senior PM' && norm.url === 'https://x.example/1' && norm.company === 'Acme' && norm.location === 'Remote') {
    pass('normalizeItem picks first non-empty fallback and applies defaults only to empty fields');
  } else {
    fail(`normalizeItem returned ${JSON.stringify(norm)}`);
  }

  const blockedDefaults = normalizeItem({ positionName: 't', url: 'https://u' }, fmap, { malicious: 'should-not-appear' });
  if (!('malicious' in blockedDefaults)) {
    pass('normalizeItem ignores non-allowlisted default keys');
  } else {
    fail('normalizeItem must reject default keys outside title/url/company/location');
  }

  // -- htmlToText — CodeQL hardening (script close-tag tolerance, polyglot
  //    sanitization, entity-decode ordering) --
  const scriptSpaceClose = htmlToText('keep<script>evil()</script >after');
  if (!/evil\(\)/.test(scriptSpaceClose) && /keep/.test(scriptSpaceClose) && /after/.test(scriptSpaceClose)) {
    pass('htmlToText strips <script>…</script > with whitespace before close >');
  } else {
    fail(`htmlToText leaked script content with whitespace close: ${JSON.stringify(scriptSpaceClose)}`);
  }

  const scriptJunkAttrs = htmlToText('keep<script>evil()</script\t\n foo bar>after');
  if (!/evil\(\)/.test(scriptJunkAttrs) && /keep/.test(scriptJunkAttrs) && /after/.test(scriptJunkAttrs)) {
    pass('htmlToText strips </script ...> with parser-tolerated junk attributes');
  } else {
    fail(`htmlToText leaked script content with junk-attr close: ${JSON.stringify(scriptJunkAttrs)}`);
  }

  const polyglot = htmlToText('<<a>safe-text<b>');
  if (!polyglot.includes('<')) {
    pass('htmlToText iterates to strip dangling < from polyglot input');
  } else {
    fail(`htmlToText left a dangling < in polyglot input: ${JSON.stringify(polyglot)}`);
  }

  const doubleEntity = htmlToText('value &amp;#60;b&amp;#62;');
  if (doubleEntity.includes('&#60;') && doubleEntity.includes('&#62;') && !/<b>/.test(doubleEntity)) {
    pass('htmlToText does not double-decode &amp;#60; into a literal tag');
  } else {
    fail(`htmlToText double-decoded entities: ${JSON.stringify(doubleEntity)}`);
  }

  // -- normalizeActorId — SSRF guard on the actor path segment --
  if (normalizeActorId('owner/actor') === `${encodeURIComponent('owner')}~${encodeURIComponent('actor')}`) {
    pass('normalizeActorId accepts owner/actor');
  } else {
    fail('normalizeActorId should accept owner/actor');
  }
  if (normalizeActorId('owner~actor') === `${encodeURIComponent('owner')}~${encodeURIComponent('actor')}`) {
    pass('normalizeActorId accepts owner~actor');
  } else {
    fail('normalizeActorId should accept owner~actor');
  }

  for (const bad of [
    '../etc/passwd',          // path traversal
    'owner/actor?x=1',        // query injection
    'owner/actor#frag',       // fragment
    'owner/actor/extra',      // extra path segment
    'owner',                  // no separator
    '',                       // empty
    42,                       // non-string
    null,                     // null
  ]) {
    let threw = false;
    try { normalizeActorId(bad); } catch { threw = true; }
    if (threw) pass(`normalizeActorId rejects ${JSON.stringify(bad)}`);
    else fail(`normalizeActorId must reject ${JSON.stringify(bad)}`);
  }

  // -- fetch() guards — error before any network call --
  const validEntry = {
    name: 'Indeed',
    actor: 'misceres/indeed-scraper',
    field_map: { title: 'positionName', url: 'url' },
  };

  // Missing APIFY_TOKEN must throw a clear error (and never reach runActor).
  // Save + restore the env var so this works whether or not the caller has it set.
  const savedToken = process.env.APIFY_TOKEN;
  delete process.env.APIFY_TOKEN;
  try {
    let threw = null;
    try {
      await apify.fetch(validEntry, {});
    } catch (e) {
      threw = e;
    }
    if (threw && /APIFY_TOKEN/.test(threw.message)) {
      pass('fetch() throws clear APIFY_TOKEN error when env var is missing');
    } else {
      fail(`fetch() should throw APIFY_TOKEN error; got ${threw && threw.message}`);
    }
  } finally {
    if (savedToken !== undefined) process.env.APIFY_TOKEN = savedToken;
  }

  // With a (fake) token set, the next guards fire before any network call.
  process.env.APIFY_TOKEN = 'test-token-not-real';
  try {
    let threw = null;
    try {
      await apify.fetch({ name: 'NoActor', field_map: validEntry.field_map }, {});
    } catch (e) {
      threw = e;
    }
    if (threw && /missing 'actor'/.test(threw.message)) {
      pass("fetch() throws when entry is missing 'actor'");
    } else {
      fail(`fetch() should reject missing actor; got ${threw && threw.message}`);
    }

    threw = null;
    try {
      await apify.fetch({ ...validEntry, field_map: { title: 42, url: 'url' } }, {});
    } catch (e) {
      threw = e;
    }
    if (threw && /invalid field_map/.test(threw.message)) {
      pass('fetch() throws when field_map.title is malformed');
    } else {
      fail(`fetch() should reject malformed field_map; got ${threw && threw.message}`);
    }

    threw = null;
    try {
      await apify.fetch({ ...validEntry, field_map: { url: 'url' } }, {});
    } catch (e) {
      threw = e;
    }
    if (threw && /invalid field_map/.test(threw.message)) {
      pass('fetch() throws when field_map.title is missing');
    } else {
      fail(`fetch() should reject field_map missing title; got ${threw && threw.message}`);
    }
  } finally {
    if (savedToken !== undefined) process.env.APIFY_TOKEN = savedToken;
    else delete process.env.APIFY_TOKEN;
  }

} catch (e) {
  fail(`apify provider tests crashed: ${e.message}`);
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
