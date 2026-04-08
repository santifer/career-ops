#!/usr/bin/env node

/**
 * test-all.mjs - Comprehensive test suite for career-ops
 *
 * Run before merging any PR or pushing changes.
 * Tests: syntax, scripts, dashboard, data contract, personal data, paths.
 *
 * Usage:
 *   node test-all.mjs           # Run all tests
 *   node test-all.mjs --quick   # Skip dashboard build (faster)
 */

import { execFileSync, execSync } from 'child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { delimiter, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const QUICK = process.argv.includes('--quick');

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) { console.log(`  PASS ${msg}`); passed++; }
function fail(msg) { console.log(`  FAIL ${msg}`); failed++; }
function warn(msg) { console.log(`  WARN ${msg}`); warnings++; }

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    }).trim();
  } catch {
    return null;
  }
}

function getGitBashPath() {
  if (process.platform !== 'win32') {
    return 'bash';
  }
  const candidates = [
    'C:/Program Files/Git/bin/bash.exe',
    'C:/Program Files (x86)/Git/bin/bash.exe',
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function fileExists(path) {
  return existsSync(join(ROOT, path));
}

function readFile(path) {
  return readFileSync(join(ROOT, path), 'utf-8');
}

function runBatchRunnerSmoke(agent, unsafe = false) {
  const shellBinary = getGitBashPath();
  if (shellBinary === null) {
    return null;
  }

  const tempRoot = mkdtempSync(join(tmpdir(), 'career-ops-batch-smoke-'));
  const batchDir = join(tempRoot, 'batch');
  const binDir = join(tempRoot, 'bin');
  const argvFile = join(tempRoot, `${agent}-argv.txt`);

  try {
    mkdirSync(batchDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    mkdirSync(join(tempRoot, 'reports'), { recursive: true });
    mkdirSync(join(tempRoot, 'data'), { recursive: true });

    writeFileSync(join(batchDir, 'batch-runner.sh'), readFile('batch/batch-runner.sh'));
    chmodSync(join(batchDir, 'batch-runner.sh'), 0o755);

    writeFileSync(
      join(batchDir, 'batch-input.tsv'),
      'id\turl\tsource\tnotes\n1\thttps://example.com/job\tmanual\t-\n',
    );
    writeFileSync(join(batchDir, 'batch-prompt.md'), 'Smoke test prompt.\n');
    writeFileSync(join(tempRoot, 'merge-tracker.mjs'), 'process.exit(0);\n');
    writeFileSync(join(tempRoot, 'verify-pipeline.mjs'), 'process.exit(0);\n');

    const stub = `#!/usr/bin/env bash
printf '%s\n' "$*" > "$CAREER_OPS_TEST_ARGV_FILE"
cat >/dev/null
`;
    writeFileSync(join(binDir, agent), stub);
    chmodSync(join(binDir, agent), 0o755);

    const env = {
      ...process.env,
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
      CAREER_OPS_AGENT: agent,
      CAREER_OPS_TEST_ARGV_FILE: argvFile,
    };
    if (unsafe) {
      env.CAREER_OPS_UNSAFE_AGENT_EXEC = '1';
    }

    execFileSync(shellBinary, ['batch/batch-runner.sh'], {
      cwd: tempRoot,
      env,
      encoding: 'utf-8',
      timeout: 30000,
    });

    return readFileSync(argvFile, 'utf-8').trim();
  } catch {
    return null;
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runNode(args, opts = {}) {
  try {
    return execFileSync('node', args, {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    }).trim();
  } catch {
    return null;
  }
}

function listFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(ROOT, full).replaceAll('\\', '/');
    if (entry === '.git' || entry === 'node_modules') continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      listFiles(full, out);
    } else {
      out.push(rel);
    }
  }
  return out;
}

console.log('\ncareer-ops test suite\n');

// 1. SYNTAX CHECKS
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

const gitBash = getGitBashPath();
const shellFiles = [
  'batch/batch-runner.sh',
  'batch/agent-adapter.example.sh',
];

if (gitBash !== null) {
  const shellBinary = process.platform === 'win32' ? `"${gitBash}"` : gitBash;
  for (const f of shellFiles) {
    const result = run(`${shellBinary} -n ${f}`);
    if (result !== null) {
      pass(`${f} shell syntax OK`);
    } else {
      fail(`${f} has shell syntax errors`);
    }
  }
} else {
  warn('Git Bash not found; shell syntax checks skipped');
}

// 2. SCRIPT EXECUTION
console.log('\n2. Script execution (graceful on empty data)');

const scripts = [
  { name: 'cv-sync-check.mjs', allowFail: true },
  { name: 'verify-pipeline.mjs' },
  { name: 'normalize-statuses.mjs' },
  { name: 'dedup-tracker.mjs' },
  { name: 'merge-tracker.mjs' },
  { name: 'update-system.mjs check' },
];

for (const { name, allowFail } of scripts) {
  const result = run(`node ${name}`);
  if (result !== null) {
    pass(`${name} runs OK`);
  } else if (allowFail) {
    warn(`${name} exited with error (expected without user data)`);
  } else {
    fail(`${name} crashed`);
  }
}

console.log('\n2b. Batch runner safety smoke tests');

const codexSafeArgv = runBatchRunnerSmoke('codex', false);
const codexUnsafeArgv = runBatchRunnerSmoke('codex', true);
const claudeSafeArgv = runBatchRunnerSmoke('claude', false);
const claudeUnsafeArgv = runBatchRunnerSmoke('claude', true);

if (codexSafeArgv === null || codexUnsafeArgv === null || claudeSafeArgv === null || claudeUnsafeArgv === null) {
  warn('Batch runner safety smoke tests skipped or failed to initialize');
} else {
  if (!codexSafeArgv.includes('--dangerously-bypass-approvals-and-sandbox')) {
    pass('Codex default path omits dangerous bypass flag');
  } else {
    fail('Codex default path still enables dangerous bypass flag');
  }

  if (codexUnsafeArgv.includes('--dangerously-bypass-approvals-and-sandbox')) {
    pass('Codex unsafe opt-in enables dangerous bypass flag');
  } else {
    fail('Codex unsafe opt-in does not enable dangerous bypass flag');
  }

  if (!claudeSafeArgv.includes('--dangerously-skip-permissions')) {
    pass('Claude default path omits dangerous permission bypass flag');
  } else {
    fail('Claude default path still enables dangerous permission bypass flag');
  }

  if (claudeUnsafeArgv.includes('--dangerously-skip-permissions')) {
    pass('Claude unsafe opt-in enables dangerous permission bypass flag');
  } else {
    fail('Claude unsafe opt-in does not enable dangerous permission bypass flag');
  }
}

console.log('\n2c. PDF generation smoke test');

const pdfSmokeRoot = mkdtempSync(join(tmpdir(), 'career-ops-pdf-smoke-'));
const pdfSmokeInput = join(pdfSmokeRoot, 'smoke.html');
const pdfSmokeOutput = join(pdfSmokeRoot, 'smoke.pdf');

try {
  writeFileSync(
    pdfSmokeInput,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Career-Ops PDF Smoke</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 32px; color: #111; }
      h1 { font-size: 22px; margin-bottom: 12px; }
      p { font-size: 12px; line-height: 1.5; }
    </style>
  </head>
  <body>
    <h1>Career-Ops PDF Smoke</h1>
    <p>This smoke test exercises ATS normalization for smart quotes, em dashes, ellipsis, and non-breaking spaces.</p>
    <p>“Quoted text” — Product-minded platform engineer… Remote&nbsp;friendly.</p>
  </body>
</html>\n`,
    'utf-8',
  );

  const atsSmokeLine = `${String.fromCodePoint(0x201c)}Quoted text${String.fromCodePoint(0x201d)} ` +
    `${String.fromCodePoint(0x2014)} Product-minded platform engineer${String.fromCodePoint(0x2026)} ` +
    `Remote${String.fromCodePoint(0x00a0)}friendly.`;
  const normalizedSmokeHtml = readFileSync(pdfSmokeInput, 'utf-8').replace(
    /<p>.*Product-minded platform engineer.*<\/p>/,
    `<p>${atsSmokeLine}</p>`,
  );
  writeFileSync(pdfSmokeInput, normalizedSmokeHtml, 'utf-8');

  const pdfResult = runNode(['generate-pdf.mjs', pdfSmokeInput, pdfSmokeOutput, '--format=a4']);
  const hasPdf = existsSync(pdfSmokeOutput);
  const pdfBytes = hasPdf ? statSync(pdfSmokeOutput).size : 0;
  const normalizationSignals = ['smart-double-quote=', 'em-dash=', 'ellipsis=', 'nbsp='];
  const normalizationLogged = pdfResult !== null && pdfResult.includes('ATS normalization:') &&
    normalizationSignals.every(signal => pdfResult.includes(signal));
  const pageCountLogged = pdfResult !== null && /Pages:\s*[1-9]\d*/.test(pdfResult);

  if (pdfResult !== null && hasPdf && pdfBytes > 0 && normalizationLogged && pageCountLogged) {
    pass('generate-pdf.mjs normalizes ATS-sensitive glyphs and produces a paginated PDF fixture');
  } else {
    fail('generate-pdf.mjs failed ATS normalization/PDF smoke expectations');
  }
} finally {
  rmSync(pdfSmokeRoot, { recursive: true, force: true });
}

console.log('\n2d. Fixture-backed pipeline verification');

const fixtureBundle = join(ROOT, 'fixtures', 'pipeline');
if (!existsSync(fixtureBundle)) {
  fail('Missing fixtures/pipeline bundle required for reproducible verification');
} else {
  const fixtureVerifyRoot = mkdtempSync(join(tmpdir(), 'career-ops-verify-fixture-'));
  try {
    cpSync(fixtureBundle, fixtureVerifyRoot, { recursive: true });
    writeFileSync(join(fixtureVerifyRoot, 'verify-pipeline.mjs'), readFile('verify-pipeline.mjs'), 'utf-8');

    const fixtureVerifyOutput = run('node verify-pipeline.mjs', { cwd: fixtureVerifyRoot });
    if (
      fixtureVerifyOutput !== null &&
      fixtureVerifyOutput.includes('Checking 1 entries') &&
      fixtureVerifyOutput.includes('Pipeline is clean')
    ) {
      pass('verify-pipeline.mjs validates the committed fixture bundle');
    } else {
      fail('verify-pipeline.mjs fixture validation failed');
    }
  } finally {
    rmSync(fixtureVerifyRoot, { recursive: true, force: true });
  }
}

// 3. DASHBOARD BUILD
if (!QUICK) {
  console.log('\n3. Dashboard build');
  const goVersion = run('go version');
  if (goVersion === null) {
    warn('Go not installed; dashboard build skipped');
  } else {
    const dashboardBuildRoot = mkdtempSync(join(tmpdir(), 'career-ops-dashboard-build-'));
    try {
      const outputName = process.platform === 'win32' ? 'career-dashboard-test.exe' : 'career-dashboard-test';
      const outputPath = join(dashboardBuildRoot, outputName);
      const build = run(`go build -o "${outputPath}" .`, { cwd: join(ROOT, 'dashboard') });
      if (build !== null && existsSync(outputPath)) {
        pass('Dashboard compiles');
      } else {
        fail('Dashboard build failed');
      }
    } finally {
      rmSync(dashboardBuildRoot, { recursive: true, force: true });
    }
  }
} else {
  console.log('\n3. Dashboard build (skipped --quick)');
}

// 4. DATA CONTRACT
console.log('\n4. Data contract validation');

const systemFiles = [
  'AGENTS.md',
  'CLAUDE.md',
  'VERSION',
  'DATA_CONTRACT.md',
  'modes/_shared.md',
  'modes/_profile.template.md',
  'modes/oferta.md',
  'modes/pdf.md',
  'modes/scan.md',
  'templates/states.yml',
  'templates/cv-template.html',
  '.claude/skills/career-ops/SKILL.md',
  'docs/AGENT_COMPATIBILITY.md',
  'batch/agent-adapter.example.sh',
];

for (const f of systemFiles) {
  if (fileExists(f)) {
    pass(`System file exists: ${f}`);
  } else {
    fail(`Missing system file: ${f}`);
  }
}

const userFiles = [
  'config/profile.yml',
  'modes/_profile.md',
  'portals.yml',
];

for (const f of userFiles) {
  const tracked = run(`git ls-files ${f}`);
  if (tracked === '' || tracked === null) {
    pass(`User file gitignored: ${f}`);
  } else {
    fail(`User file IS tracked (should be gitignored): ${f}`);
  }
}

// 5. PERSONAL DATA LEAK CHECK
console.log('\n5. Personal data leak check');

const leakPatterns = [
  'Santiago',
  'Santifer iRepair',
  'Zinkee',
  'ALMAS',
  'hi@santifer.io',
  'hola@santifer.io',
  '688921377',
  '/Users/santifer/',
];

const allowedFiles = new Set([
  'README.md',
  'LICENSE',
  'CITATION.cff',
  'CONTRIBUTING.md',
  'package.json',
  '.github/FUNDING.yml',
  'CLAUDE.md',
  'AGENTS.md',
  'docs/AGENT_COMPATIBILITY.md',
  'test-all.mjs',
]);

const scannedFiles = listFiles(ROOT).filter(f => /\.(md|yml|html|mjs|sh|go|json)$/i.test(f));
let leakFound = false;

for (const file of scannedFiles) {
  if (allowedFiles.has(file)) continue;
  if (file === 'dashboard/go.mod' || file === 'dashboard/go.sum') continue;
  const content = readFile(file);
  for (const pattern of leakPatterns) {
    if (content.includes(pattern)) {
      warn(`Possible personal data in ${file}: "${pattern}"`);
      leakFound = true;
    }
  }
}

if (!leakFound) {
  pass('No personal data leaks outside allowed files');
}

// 6. ABSOLUTE PATH CHECK
console.log('\n6. Absolute path check');

const absoluteHits = [];
for (const file of scannedFiles) {
  if (allowedFiles.has(file)) continue;
  if (file === 'dashboard/go.mod' || file === 'dashboard/go.sum') continue;
  const content = readFile(file);
  if (content.includes('/Users/')) {
    absoluteHits.push(`${file}: contains /Users/ path`);
  }
}

if (absoluteHits.length === 0) {
  pass('No absolute paths in code files');
} else {
  for (const hit of absoluteHits) fail(hit);
}

// 7. MODE FILE INTEGRITY
console.log('\n7. Mode file integrity');

const expectedModes = [
  '_shared.md',
  '_profile.template.md',
  'oferta.md',
  'pdf.md',
  'scan.md',
  'batch.md',
  'apply.md',
  'auto-pipeline.md',
  'contacto.md',
  'deep.md',
  'ofertas.md',
  'pipeline.md',
  'project.md',
  'tracker.md',
  'training.md',
];

for (const mode of expectedModes) {
  if (fileExists(`modes/${mode}`)) {
    pass(`Mode exists: ${mode}`);
  } else {
    fail(`Missing mode: ${mode}`);
  }
}

const shared = readFile('modes/_shared.md');
if (shared.includes('_profile.md')) {
  pass('_shared.md references _profile.md');
} else {
  fail('_shared.md does NOT reference _profile.md');
}

// 8. AGENT INSTRUCTION INTEGRITY
console.log('\n8. Agent instruction integrity');

const agents = readFile('AGENTS.md');
const requiredAgentSections = [
  'Data Contract',
  'Session Start',
  'First-Run Onboarding',
  'Ethical Use',
  'Batch Runner Contract',
  'Pipeline Integrity',
];

for (const section of requiredAgentSections) {
  if (agents.includes(section)) {
    pass(`AGENTS.md has section: ${section}`);
  } else {
    fail(`AGENTS.md missing section: ${section}`);
  }
}

const claude = readFile('CLAUDE.md');
if (claude.includes('AGENTS.md') && claude.toLowerCase().includes('compatibility')) {
  pass('CLAUDE.md points to the universal guide');
} else {
  fail('CLAUDE.md does not behave like a compatibility layer');
}

const batchRunner = readFile('batch/batch-runner.sh');
if (batchRunner.includes('CAREER_OPS_AGENT') && batchRunner.includes('CAREER_OPS_AGENT_ADAPTER')) {
  pass('Batch runner exposes agent adapter configuration');
} else {
  fail('Batch runner is still missing agent adapter configuration');
}

if (batchRunner.includes('CAREER_OPS_UNSAFE_AGENT_EXEC')) {
  pass('Batch runner exposes explicit unsafe execution opt-in');
} else {
  fail('Batch runner missing explicit unsafe execution opt-in');
}

const updaterContent = readFile('update-system.mjs');
if (updaterContent.includes("execFileSync('git', args")) {
  pass('Updater uses argument-based git execution');
} else {
  fail('Updater does not use argument-based git execution');
}

if (updaterContent.includes('const VERSION_RE = /^\\d+\\.\\d+\\.\\d+$/;') && updaterContent.includes('assertVersion(')) {
  pass('Updater validates VERSION as strict semver');
} else {
  fail('Updater missing strict VERSION validation');
}

if (!updaterContent.includes('execSync(`git ${cmd}`')) {
  pass('Updater no longer constructs git shell commands from strings');
} else {
  fail('Updater still constructs git shell commands from strings');
}

// 9. VERSION FILE
console.log('\n9. Version file');

if (fileExists('VERSION')) {
  const version = readFile('VERSION').trim();
  if (/^\d+\.\d+\.\d+$/.test(version)) {
    pass(`VERSION is valid semver: ${version}`);
  } else {
    fail(`VERSION is not valid semver: "${version}"`);
  }

  const pkg = JSON.parse(readFile('package.json'));
  if (pkg.version === version) {
    pass(`package.json version matches VERSION (${version})`);
  } else {
    fail(`package.json version (${pkg.version}) does not match VERSION (${version})`);
  }
} else {
  fail('VERSION file missing');
}

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${warnings} warnings`);

if (failed > 0) {
  console.log('TESTS FAILED - do NOT push/merge until fixed\n');
  process.exit(1);
}

if (warnings > 0) {
  console.log('Tests passed with warnings - review before pushing\n');
  process.exit(0);
}

console.log('All tests passed - safe to push/merge\n');
