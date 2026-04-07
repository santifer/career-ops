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
import { readFileSync, existsSync, readdirSync, statSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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

function walkFiles(baseDir, extensions, excludedDirs = new Set()) {
  const results = [];

  function visit(currentDir, relativeDir = '') {
    for (const entry of readdirSync(currentDir)) {
      const absolutePath = join(currentDir, entry);
      const relativePath = relativeDir ? `${relativeDir}/${entry}` : entry;
      const normalizedPath = relativePath.replace(/\\/g, '/');
      const stats = statSync(absolutePath);

      if (stats.isDirectory()) {
        if (excludedDirs.has(entry) || excludedDirs.has(normalizedPath)) continue;
        visit(absolutePath, normalizedPath);
        continue;
      }

      const ext = entry.includes('.') ? entry.split('.').pop() : '';
      if (extensions.has(ext)) results.push(normalizedPath);
    }
  }

  visit(baseDir);
  return results;
}

function findMatches(path, pattern) {
  const content = readFile(path);
  const lines = content.split(/\r?\n/);
  const matches = [];

  for (let index = 0; index < lines.length; index++) {
    if (lines[index].includes(pattern)) {
      matches.push(`${path}:${index + 1}:${lines[index].trim()}`);
    }
  }

  return matches;
}

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

// ── 3. DASHBOARD BUILD ──────────────────────────────────────────

if (!QUICK) {
  console.log('\n3. Dashboard build');
  const goVersion = run('go version');
  if (goVersion === null) {
    warn('Go not installed; dashboard build skipped');
  } else {
    const outputName = process.platform === 'win32' ? 'career-dashboard-test.exe' : 'career-dashboard-test';
    const outputPath = join(tmpdir(), outputName);
    const goBuild = run(`go build -o "${outputPath}" . 2>&1`, { cwd: join(ROOT, 'dashboard') });
    if (goBuild !== null) {
      pass('Dashboard compiles');
      if (existsSync(outputPath)) rmSync(outputPath, { force: true });
    } else {
      fail('Dashboard build failed');
    }
  }
} else {
  console.log('\n3. Dashboard build (skipped --quick)');
}

// ── 4. DATA CONTRACT ────────────────────────────────────────────

console.log('\n4. Data contract validation');

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

// ── 5. PERSONAL DATA LEAK CHECK ─────────────────────────────────

console.log('\n5. Personal data leak check');

const leakPatterns = [
  'Santiago', 'santifer.io', 'Santifer iRepair', 'Zinkee', 'ALMAS',
  'hi@santifer.io', '688921377', '/Users/santifer/',
];

const scanExtensions = new Set(['md', 'yml', 'html', 'mjs', 'sh', 'go', 'json']);
const excludeDirs = new Set(['node_modules', '.git']);
const allowedFiles = ['README.md', 'LICENSE', 'CITATION.cff', 'CONTRIBUTING.md',
  'package.json', '.github/FUNDING.yml', '.github/ISSUE_TEMPLATE/', 'CLAUDE.md', 'go.mod',
  'test-all.mjs', 'dashboard/internal/ui/screens/pipeline.go', '.specs/'];
const scannableFiles = walkFiles(ROOT, scanExtensions, excludeDirs);

let leakFound = false;
for (const pattern of leakPatterns) {
  for (const file of scannableFiles) {
    if (allowedFiles.some(a => file.includes(a))) continue;
    if (file.includes('dashboard/go.mod') || file.includes('dashboard/go.sum')) continue;

    for (const match of findMatches(file, pattern)) {
      warn(`Possible personal data: ${match}`);
      leakFound = true;
    }
  }
}
if (!leakFound) {
  pass('No personal data leaks outside allowed files');
}

// ── 6. ABSOLUTE PATH CHECK ──────────────────────────────────────

console.log('\n6. Absolute path check');

const absPathFiles = walkFiles(ROOT, new Set(['mjs', 'sh', 'md', 'go', 'yml']), excludeDirs);
const absPathIgnoreFiles = ['README.md', 'LICENSE', 'go.sum', 'CLAUDE.md', 'test-all.mjs', '.specs/'];
const absPathMatches = [];

for (const file of absPathFiles) {
  if (absPathIgnoreFiles.some(ignored => file.includes(ignored))) continue;
  absPathMatches.push(...findMatches(file, '/Users/'));
}

if (absPathMatches.length === 0) {
  pass('No absolute paths in code files');
} else {
  for (const match of absPathMatches) {
    fail(`Absolute path: ${match.slice(0, 140)}`);
  }
}

// ── 7. MODE FILE INTEGRITY ──────────────────────────────────────

console.log('\n7. Mode file integrity');

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

// ── 8. CLAUDE.md INTEGRITY ──────────────────────────────────────

console.log('\n8. CLAUDE.md integrity');

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

// ── 9. VERSION FILE ─────────────────────────────────────────────

console.log('\n9. Version file');

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
