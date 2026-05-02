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

import { execSync } from 'child_process';
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

function run(cmd, opts = {}) {
  try {
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
  const result = run(`node --check ${f}`);
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
  const result = run(`node ${name} 2>&1`);
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

// ── 3b. MERGE-TRACKER DEDUP ─────────────────────────────────────

console.log('\n3b. merge-tracker dedup logic');

try {
  const { findDuplicate, roleFuzzyMatch, extractTerritoryToken } =
    await import(pathToFileURL(join(ROOT, 'merge-tracker.mjs')).href);

  // Bug 1 regression: cross-company report-num collision must NOT dedupe.
  // Repro from 2026-05-02: LangChain TSV had report=[042] (filename collision)
  // and Hakimo #42 was already in the tracker — different companies entirely.
  const hakimoExisting = {
    num: 42, date: '2026-05-01', company: 'Hakimo',
    role: 'Mid-Market AE, Multifamily', score: '4.6/5', status: 'Interview',
    pdf: '❌', report: '[042](reports/042-hakimo-2026-05-01.md)',
    notes: 'R1 with Mark Vashon', raw: '',
  };
  const langchainNew = {
    num: 43, date: '2026-05-02', company: 'LangChain',
    role: 'Enterprise Account Executive (SF Bay Area)', score: '4.5/5',
    status: 'Evaluated', pdf: '✅',
    report: '[042](reports/042-langchain-enterprise-ae-sf-2026-05-02.md)',
    notes: '$350K OTE, SF on-site',
  };
  if (findDuplicate(langchainNew, [hakimoExisting]) === null) {
    pass('Cross-company report-num collision treated as new entry (Bug 1)');
  } else {
    fail('Cross-company report-num collision still dedupes (Bug 1)');
  }

  // Bug 2 regression: same Company + same role title shape but different
  // territory parentheticals must NOT collapse onto each other.
  const cursorSouthwest = {
    num: 17, date: '2026-04-19', company: 'Cursor',
    role: 'Strategic Enterprise AE (Southwest)', score: '3.6/5',
    status: 'Evaluated', pdf: '✅',
    report: '[013](reports/013-cursor-strategic-ae-southwest-2026-04-19.md)',
    notes: 'Southwest location gap', raw: '',
  };
  const cursorNyRemote = {
    num: 44, date: '2026-05-02', company: 'Cursor',
    role: 'Strategic Account Executive, Enterprise (NY/Remote)',
    score: '4.3/5', status: 'Evaluated', pdf: '✅',
    report: '[043](reports/043-cursor-strategic-ae-ny-2026-05-02.md)',
    notes: 'NY or Remote',
  };
  if (findDuplicate(cursorNyRemote, [cursorSouthwest]) === null) {
    pass('Distinct territory variants treated as separate entries (Bug 2)');
  } else {
    fail('Territory variants still collapse onto each other (Bug 2)');
  }

  // Positive case: same company + same role + same territory ⇒ real dup.
  const cursorSouthwestReeval = {
    num: 50, date: '2026-05-10', company: 'Cursor',
    role: 'Strategic Enterprise AE (Southwest)', score: '4.0/5',
    status: 'Evaluated', pdf: '✅',
    report: '[050](reports/050-cursor-southwest-reeval-2026-05-10.md)',
    notes: 'Re-eval after relocation policy change',
  };
  if (findDuplicate(cursorSouthwestReeval, [cursorSouthwest]) === cursorSouthwest) {
    pass('True same-territory re-eval still dedupes correctly');
  } else {
    fail('True same-territory re-eval no longer dedupes');
  }

  // Territory token extraction sanity.
  if (extractTerritoryToken('Sr AE (NY/Remote)') === 'nyremote') {
    pass('extractTerritoryToken normalizes NY/Remote');
  } else {
    fail('extractTerritoryToken NY/Remote normalization broken');
  }

  // roleFuzzyMatch should still match where territory is absent on both sides.
  if (roleFuzzyMatch('Senior Enterprise Account Executive', 'Sr Enterprise Account Executive')) {
    pass('roleFuzzyMatch still matches similar titles without territories');
  } else {
    fail('roleFuzzyMatch over-rejects similar titles without territories');
  }
} catch (e) {
  fail(`merge-tracker dedup tests crashed: ${e.message}`);
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
  const tracked = run(`git ls-files ${f}`);
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
const excludeDirs = ['node_modules', '.git', 'dashboard/go.sum'];
const allowedFiles = ['README.md', 'LICENSE', 'CITATION.cff', 'CONTRIBUTING.md',
  'package.json', '.github/FUNDING.yml', 'CLAUDE.md', 'go.mod', 'test-all.mjs'];

let leakFound = false;
for (const pattern of leakPatterns) {
  const result = run(
    `grep -rn "${pattern}" --include="*.{${scanExtensions.join(',')}}" . 2>/dev/null | grep -v node_modules | grep -v ".git/" | grep -v go.sum`
  );
  if (result) {
    for (const line of result.split('\n')) {
      const file = line.split(':')[0].replace('./', '');
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

const absPathResult = run(
  `grep -rn "/Users/" --include="*.mjs" --include="*.sh" --include="*.md" --include="*.go" --include="*.yml" . 2>/dev/null | grep -v node_modules | grep -v ".git/" | grep -v README.md | grep -v LICENSE | grep -v go.sum | grep -v CLAUDE.md | grep -v test-all.mjs`
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
