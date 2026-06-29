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


import { execSync, execFileSync, spawn } from 'child_process';
import { readFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync, unlinkSync, realpathSync } from 'fs';
import { join, dirname, delimiter } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const QUICK = process.argv.includes('--quick');
const NODE = process.execPath;

let passed = 0;
let failed = 0;
let warnings = 0;

/**
 * Record and print one passing test assertion.
 *
 * The suite uses these small counters instead of a framework so it can run in
 * any freshly cloned career-ops checkout with only Node.js available.
 *
 * @param {string} msg - Human-readable success message for the terminal log.
 * @returns {void}
 */
function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }

/**
 * Record and print one failing test assertion.
 *
 * Failures increment the shared counter that controls the final process exit
 * code, while still allowing later checks to run and show the full problem set.
 *
 * @param {string} msg - Human-readable failure message for the terminal log.
 * @returns {void}
 */
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; }

/**
 * Record and print one non-fatal warning.
 *
 * Warnings are used for expected local-environment gaps, such as missing user
 * data in a clean repo, where the check should stay visible but not fail CI.
 *
 * @param {string} msg - Human-readable warning message for the terminal log.
 * @returns {void}
 */
function warn(msg) { console.log(`  ⚠️  ${msg}`); warnings++; }

/**
 * Run a shell command or executable and return trimmed stdout on success.
 *
 * Array-form arguments use execFileSync to avoid shell parsing. String-only
 * commands use execSync for existing simple checks. Failures return null so the
 * caller can decide whether to count the result as a failure or warning.
 *
 * @param {string} cmd - Command or executable to run.
 * @param {string[]} [args=[]] - Optional argument vector for execFileSync.
 * @param {object} [opts={}] - Extra child_process options.
 * @returns {string|null} Trimmed stdout, or null when the command fails.
 */
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

/**
 * Check whether a repo-relative file exists.
 *
 * @param {string} path - Path relative to the career-ops repository root.
 * @returns {boolean} True when the file exists.
 */
function fileExists(path) { return existsSync(join(ROOT, path)); }

function toBashPath(wpath) {
  if (process.platform !== 'win32') return wpath;
  try {
    const forwardSlashed = wpath.replace(/\\/g, '/');
    const out = execSync(`wsl wslpath -u "${forwardSlashed}"`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    if (out) return out;
  } catch {}
  try {
    const forwardSlashed = wpath.replace(/\\/g, '/');
    const out = execSync(`cygpath -u "${forwardSlashed}"`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    if (out) return out;
  } catch {}
  return wpath.replace(/^[A-Za-z]:/, m => '/' + m[0].toLowerCase()).replace(/\\/g, '/');
}

/**
 * Read a repo-relative text file as UTF-8.
 *
 * @param {string} path - Path relative to the career-ops repository root.
 * @returns {string} File contents.
 */
function readFile(path) {
  const fullPath = join(ROOT, path);
  let content = readFileSync(fullPath, 'utf-8');
  if (content.trim().startsWith('..') && content.trim().split('\n').length === 1) {
    const target = join(dirname(fullPath), content.trim());
    if (existsSync(target)) {
      content = readFileSync(target, 'utf-8');
    }
  }
  return content;
}

console.log('\n🧪 career-ops test suite\n');

// ── 1. SYNTAX CHECKS ────────────────────────────────────────────

console.log('1. Syntax checks');

const mjsFiles = readdirSync(ROOT).filter(f => f.endsWith('.mjs'));
for (const f of mjsFiles) {
  const result = run(NODE, ['--check', f]);
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
  // --dry-run: these scripts resolve ROOT from import.meta.url and write
  // data/applications.md (or data/pipeline.md) in place. On a provisioned working
  // copy with a real tracker present, running them without --dry-run mutates user
  // data. Harmless in this repo (no tracker shipped), risky for end users who run
  // tests inside their active career-ops workspace.
  { name: 'normalize-statuses.mjs --dry-run', expectExit: 0 },
  { name: 'dedup-tracker.mjs --dry-run', expectExit: 0 },
  { name: 'merge-tracker.mjs --dry-run', expectExit: 0 },
  { name: 'reconcile-pipeline.mjs --dry-run', expectExit: 0 },
  { name: 'analyze-patterns.mjs --self-test', expectExit: 0 },
  { name: 'updater-migration-tests.mjs', expectExit: 0 },
  { name: 'tracker-columns-tests.mjs', expectExit: 0 },
  { name: 'validate-portals.mjs --file templates/portals.example.yml', expectExit: 0 },
  { name: 'validate-system-paths-coverage.mjs --self-test', expectExit: 0 },
  { name: 'validate-system-paths-coverage.mjs', expectExit: 0 },
  // Missing-file run: must exit 0 gracefully and hit no network. Do not use the
  // default portals.yml because end-user workspaces often have a real user-layer
  // portals file that would trigger a live remote sweep during tests.
  { name: 'verify-portals.mjs --file .tmp-test-missing-portals.yml', expectExit: 0 },
  { name: 'update-system.mjs check', expectExit: 0 },
  { name: 'archive-posting.mjs --help', expectExit: 0 },
];

for (const { name, allowFail } of scripts) {
  const result = run(NODE, name.split(' '), { stdio: ['pipe', 'pipe', 'pipe'] });
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

  const cloudflareChallenge = classifyLiveness({
    status: 403,
    finalUrl: 'https://www.pracuj.pl/praca/sap-consultant,oferta,1004870954',
    bodyText: 'www.pracuj.pl\nJust a moment...\nPerforming security verification\nThis website uses a security service to protect against malicious bots.\nRay ID: a06489bab8bc4cd7\nPerformance and Security by Cloudflare',
    applyControls: [],
  });
  if (cloudflareChallenge.result === 'uncertain' && cloudflareChallenge.code === 'bot_challenge') {
    pass('Cloudflare anti-bot challenge pages are uncertain, not expired');
  } else {
    fail(`Cloudflare challenge misclassified as ${cloudflareChallenge.result} (${cloudflareChallenge.code})`);
  }

  const blocked403 = classifyLiveness({
    status: 403,
    finalUrl: 'https://www.pracuj.pl/praca/sap-consultant,oferta,1004870954',
    bodyText: 'Access denied',
    applyControls: [],
  });
  if (blocked403.result === 'uncertain' && blocked403.code === 'access_blocked') {
    pass('HTTP 403 is treated as access-blocked (uncertain), not expired');
  } else {
    fail(`HTTP 403 misclassified as ${blocked403.result} (${blocked403.code})`);
  }

  const activePolishPosting = classifyLiveness({
    status: 200,
    finalUrl: 'https://www.pracuj.pl/praca/administrator-sap-utilities-warszawa,oferta,1004870954',
    bodyText: 'Administrator SAP Utilities. Connectis_. Siedziba firmy: Chmielna 71, Warszawa. '.repeat(6),
    applyControls: ['Aplikuj Aplikuj na ogłoszenie'],
  });
  if (activePolishPosting.result === 'active') {
    pass('Polish "Aplikuj" apply control marks a loaded posting active');
  } else {
    fail(`Polish apply control not recognized: ${activePolishPosting.result} (${activePolishPosting.code})`);
  }

  // Liveness API rung (liveness-api.mjs) — the zero-token ATS first rung. We test the
  // pure URL→API resolution + SSRF guard; the network fetch is conservative by
  // construction (only 404/410→expired, 200→active, else null→Playwright fallback).
  const { resolveAtsApi } = await import(pathToFileURL(join(ROOT, 'liveness-api.mjs')).href);
  const ghApi = resolveAtsApi('https://boards.greenhouse.io/acme/jobs/4567890');
  if (ghApi?.ats === 'greenhouse' && ghApi.apiUrl === 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/4567890') {
    pass('resolveAtsApi maps a Greenhouse posting to its per-job API URL');
  } else {
    fail(`Greenhouse API URL wrong: ${JSON.stringify(ghApi)}`);
  }
  const lvApi = resolveAtsApi('https://jobs.lever.co/acme/abc-123-def');
  if (lvApi?.ats === 'lever' && lvApi.apiUrl === 'https://api.lever.co/v0/postings/acme/abc-123-def') {
    pass('resolveAtsApi maps a Lever posting to its per-job API URL');
  } else {
    fail(`Lever API URL wrong: ${JSON.stringify(lvApi)}`);
  }
  if (resolveAtsApi('https://example.com/jobs/123') === null) {
    pass('resolveAtsApi returns null for non-ATS URLs (→ Playwright fallback)');
  } else {
    fail('resolveAtsApi should return null for an unknown host');
  }
  if (resolveAtsApi('https://boards.greenhouse.io/acme/jobs/not-a-number') === null
      && resolveAtsApi('http://boards.greenhouse.io/acme/jobs/123') === null) {
    pass('resolveAtsApi rejects non-numeric Greenhouse ids and non-https (SSRF guard)');
  } else {
    fail('resolveAtsApi guard failed (bad id or http accepted)');
  }

  // Headed-fallback-on-challenge path (liveness-browser.mjs). Fake Playwright
  // pages script the goto/evaluate calls so we can exercise the wrapper without
  // launching a browser. checkUrlLiveness reads body text first, apply controls
  // second — the fake returns them in that order.
  const { checkUrlLivenessWithFallback, isChallengeResult, jitteredDelayMs } =
    await import(pathToFileURL(join(ROOT, 'liveness-browser.mjs')).href);

  const disabled = jitteredDelayMs(0) === 0 && jitteredDelayMs(-1) === 0;
  let inRange = true;
  for (let i = 0; i < 200; i += 1) {
    const d = jitteredDelayMs(5000);
    if (d < 5000 || d >= 10000) { inRange = false; break; }
  }
  if (disabled && inRange) {
    pass('jitteredDelayMs returns 0 when disabled and stays in [base, 2*base)');
  } else {
    fail(`jitteredDelayMs out of spec (disabled=${disabled}, inRange=${inRange})`);
  }

  const fakePage = ({ status, finalUrl, bodyText, applyControls }) => {
    let evalCall = 0;
    return {
      async goto() { return { status: () => status }; },
      async waitForTimeout() {},
      url() { return finalUrl; },
      async evaluate() { evalCall += 1; return evalCall === 1 ? bodyText : applyControls; },
    };
  };
  const URL = 'https://www.pracuj.pl/praca/sap-consultant,oferta,1004870954';
  const challengePage = () => fakePage({
    status: 403,
    finalUrl: URL,
    bodyText: 'Just a moment... Performing security verification. Ray ID: abc123. Cloudflare.',
    applyControls: [],
  });
  const livePage = () => fakePage({
    status: 200,
    finalUrl: URL,
    bodyText: 'Administrator SAP Utilities. '.repeat(20),
    applyControls: ['Apply for this job'],
  });

  if (isChallengeResult({ result: 'uncertain', code: 'bot_challenge' }) &&
      isChallengeResult({ result: 'uncertain', code: 'access_blocked' }) &&
      !isChallengeResult({ result: 'expired', code: 'http_gone' }) &&
      !isChallengeResult({ result: 'active', code: 'apply_control_visible' })) {
    pass('isChallengeResult flags only bot_challenge/access_blocked uncertains');
  } else {
    fail('isChallengeResult misclassified a result');
  }

  const fellBackToActive = await checkUrlLivenessWithFallback(challengePage(), URL, {
    getHeadedPage: async () => livePage(),
  });
  if (fellBackToActive.result === 'active') {
    pass('Headed fallback recovers a challenge-blocked page as active');
  } else {
    fail(`Headed fallback did not recover page: ${fellBackToActive.result} (${fellBackToActive.code})`);
  }

  const noProvider = await checkUrlLivenessWithFallback(challengePage(), URL, {});
  if (noProvider.result === 'uncertain' && noProvider.code === 'bot_challenge') {
    pass('No fallback provider keeps the original challenge result');
  } else {
    fail(`Missing provider changed result to ${noProvider.result} (${noProvider.code})`);
  }

  const stillBlocked = await checkUrlLivenessWithFallback(challengePage(), URL, {
    getHeadedPage: async () => challengePage(),
  });
  if (stillBlocked.result === 'uncertain' && stillBlocked.code === 'bot_challenge'
      && /headed retry also blocked/.test(stillBlocked.reason)) {
    pass('Persistent challenge stays uncertain after headed retry (never upgraded to expired)');
  } else {
    fail(`Persistent challenge mishandled: ${stillBlocked.result} (${stillBlocked.code})`);
  }

  const noHeadedAvailable = await checkUrlLivenessWithFallback(challengePage(), URL, {
    getHeadedPage: async () => null, // headed launch failed (no display)
  });
  if (noHeadedAvailable.result === 'uncertain' && noHeadedAvailable.code === 'bot_challenge') {
    pass('Headless-only environment degrades to original challenge result');
  } else {
    fail(`No-display degrade path wrong: ${noHeadedAvailable.result} (${noHeadedAvailable.code})`);
  }

  // SSRF guard — `rejectPrivateOrInvalid` has to refuse every URL whose host
  // resolves to loopback / private / link-local space. The earlier guard only
  // matched literal IPv4 patterns and bracketless IPv6, so several Chromium-
  // routable bypasses (0.0.0.0, [::], [::1] (bracketed), [::ffff:127.0.0.1],
  // localhost.) slipped through. These cases keep that regression covered.
  const { rejectPrivateOrInvalid } = await import(
    pathToFileURL(join(ROOT, 'liveness-browser.mjs')).href
  );
  const blockCases = [
    ['http://0.0.0.0/admin', 'IPv4 all-zeros (Linux routes to loopback)'],
    ['http://[::]/', 'IPv6 all-zeros (Linux routes to loopback)'],
    ['http://[::1]/', 'IPv6 loopback (brackets included in url.hostname)'],
    ['http://[::ffff:127.0.0.1]/', 'IPv4-mapped IPv6 loopback (dotted form)'],
    ['http://[::ffff:7f00:1]/', 'IPv4-mapped IPv6 loopback (hex form)'],
    ['http://[::ffff:169.254.169.254]/', 'IPv4-mapped IPv6 link-local (cloud metadata)'],
    ['http://[fc00::1]/', 'IPv6 ULA (private)'],
    ['http://[fe80::1]/', 'IPv6 link-local'],
    ['http://localhost./', 'FQDN-trailing-dot localhost'],
    ['http://localhost.localdomain/', 'localhost.localdomain alias'],
    ['http://169.254.169.254/latest/meta-data/', 'cloud metadata IPv4 link-local'],
    ['http://10.0.0.5/', 'IPv4 RFC1918'],
  ];
  let blockMissed = 0;
  for (const [url, label] of blockCases) {
    const verdict = rejectPrivateOrInvalid(url);
    if (verdict?.code !== 'blocked_host') {
      fail(`SSRF guard missed ${label}: ${url} → ${verdict ? verdict.code : 'allowed'}`);
      blockMissed += 1;
    }
  }
  if (blockMissed === 0) pass(`SSRF guard blocks ${blockCases.length} known bypass vectors`);

  const allowCases = [
    'https://boards.greenhouse.io/example/jobs/123',
    'https://jobs.lever.co/example/abc-def',
    'https://example.com/careers/role',
    'https://www.pracuj.pl/praca/role,oferta,1234567',
  ];
  let allowDenied = 0;
  for (const url of allowCases) {
    if (rejectPrivateOrInvalid(url) !== null) {
      fail(`SSRF guard false-positive on legitimate ATS URL: ${url}`);
      allowDenied += 1;
    }
  }
  if (allowDenied === 0) pass('SSRF guard lets legitimate ATS URLs through');

  const protoCase = rejectPrivateOrInvalid('file:///etc/passwd');
  if (protoCase?.code === 'unsupported_protocol') {
    pass('SSRF guard rejects unsupported protocol');
  } else {
    fail(`SSRF guard let unsupported protocol through: ${protoCase?.code ?? 'allowed'}`);
  }
} catch (e) {
  fail(`Liveness classification tests crashed: ${e.message}`);
}

// ── 4. DASHBOARD BUILD ──────────────────────────────────────────

if (!QUICK) {
  console.log('\n4. Dashboard build');
  const isWindows = process.platform === 'win32';
  const outPath = isWindows ? 'career-dashboard-test.exe' : '/tmp/career-dashboard-test';
  const goBuild = run(`cd dashboard && go build -o ${outPath} . 2>&1`);
  if (goBuild !== null) {
    pass('Dashboard compiles');
    if (isWindows) {
      try { rmSync(join(ROOT, 'dashboard', 'career-dashboard-test.exe'), { force: true }); } catch (e) {}
    }
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
  'CLAUDE.md', 'CODEX.md', 'OPENCODE.md', 'VERSION', 'DATA_CONTRACT.md', 'docs/CODEX.md',
  'modes/_shared.md', 'modes/_profile.template.md',
  'modes/oferta.md', 'modes/pdf.md', 'modes/scan.md',
  'modes/heuristics/recruiter-side.md',
  'templates/states.yml', 'templates/cv-template.html',
  '.claude/skills/career-ops/SKILL.md',
  '.opencode/skills/career-ops/SKILL.md',
  '.qwen/skills/career-ops/SKILL.md',
  '.antigravitycli/skills/career-ops/SKILL.md',
  '.grok/skills/career-ops/SKILL.md',
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

const batchRunnerSource = readFile('batch/batch-runner.sh');
const minScoreSkipIndex = batchRunnerSource.indexOf('update_state "$id" "$url" "skipped"');
const minScoreReturnIndex = batchRunnerSource.indexOf('return 0', minScoreSkipIndex);
const completedStateIndex = batchRunnerSource.indexOf('update_state "$id" "$url" "completed"', minScoreSkipIndex);
if (
  minScoreSkipIndex !== -1 &&
  minScoreReturnIndex !== -1 &&
  completedStateIndex !== -1 &&
  minScoreSkipIndex < minScoreReturnIndex &&
  minScoreReturnIndex < completedStateIndex
) {
  pass('Batch min-score gate returns before completed state update');
} else {
  fail('Batch min-score gate can fall through to completed state update');
}

if (/if \[\[ "\$status" == "completed" \|\| "\$status" == "skipped" \]\]/.test(batchRunnerSource)) {
  pass('Batch resume treats min-score skipped offers as terminal');
} else {
  fail('Batch resume can reprocess min-score skipped offers');
}

if (/local total=0 completed=0 skipped=0 failed=0 pending=0/.test(batchRunnerSource) &&
    /skipped\) skipped=\$\(\(skipped \+ 1\)\)/.test(batchRunnerSource) &&
    /Completed: \$completed \| Skipped: \$skipped \| Failed: \$failed \| Pending: \$pending/.test(batchRunnerSource)) {
  pass('Batch summary reports skipped offers separately from pending');
} else {
  fail('Batch summary can misreport skipped offers as pending');
}

if (!/\bbc\b/.test(batchRunnerSource)) {
  pass('Batch runner does not depend on bc for score arithmetic');
} else {
  fail('Batch runner still depends on bc for score arithmetic');
}

if (
  !/awk "BEGIN\{[^"]*\$MIN_SCORE/.test(batchRunnerSource) &&
  !/awk "BEGIN\{[^"]*\$score/.test(batchRunnerSource) &&
  !/awk "BEGIN\{[^"]*\$sscore/.test(batchRunnerSource) &&
  /awk -v score="\$score" -v min="\$MIN_SCORE"/.test(batchRunnerSource)
) {
  pass('Batch runner passes score values to awk via -v');
} else {
  fail('Batch runner interpolates score values into awk programs');
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
  'README.md', 'README.da.md', 'README.de.md', 'README.es.md', 'README.fr.md', 'README.ja.md', 'README.ko-KR.md',
  'README.pt-BR.md', 'README.ru.md', 'README.cn.md', 'README.zh-TW.md',
  // Standard project files
  'LICENSE', 'CITATION.cff', 'CONTRIBUTING.md', 'CHANGELOG.md', 'TRADEMARK.md',
  'package.json', '.github/FUNDING.yml', 'CLAUDE.md', 'AGENTS.md', 'go.mod', 'test-all.mjs',
  '.claude-plugin/marketplace.json', '.claude-plugin/plugin.json',
  // Community / governance files (added in v1.3.0, all legitimately reference the maintainer)
  'CODE_OF_CONDUCT.md', 'GOVERNANCE.md', 'SECURITY.md', 'SUPPORT.md',
  '.github/SECURITY.md',
  // Dashboard credit string
  'dashboard/internal/ui/screens/pipeline.go',
  'dashboard/internal/ui/screens/progress.go',
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

// ── 7b. PDF RENDER WAIT CONDITION ───────────────────────────────

console.log('\n7b. PDF render wait condition');

const generatePdfScript = readFile('generate-pdf.mjs');
if (/waitUntil:\s*['"]load['"]/.test(generatePdfScript)) {
  pass('generate-pdf waits for load before rendering');
} else {
  fail('generate-pdf does not wait for load before rendering');
}
if (!/waitUntil:\s*['"]networkidle['"]/.test(generatePdfScript)) {
  pass('generate-pdf does not wait for networkidle');
} else {
  fail('generate-pdf still waits for networkidle');
}

// ── 7c. UPDATER DASHBOARD REBUILD ─────────────────────────────────

console.log('\n7c. Updater dashboard rebuild');

const updateSystemScript = readFile('update-system.mjs');
if (
  /git\('diff',\s*'--name-only',\s*'HEAD',\s*'--',\s*'dashboard'\)/.test(updateSystemScript) &&
  /path\.startsWith\(['"]dashboard\/['"]\)\s*&&\s*path\.endsWith\(['"]\.go['"]\)/.test(updateSystemScript) &&
  /go build -o career-dashboard \./.test(updateSystemScript) &&
  /cwd:\s*join\(ROOT,\s*['"]dashboard['"]\)/.test(updateSystemScript) &&
  /dashboard binary rebuild skipped/.test(updateSystemScript)
) {
  pass('update-system rebuilds dashboard binary when dashboard Go sources change');
} else {
  fail('update-system does not rebuild dashboard binary after dashboard Go source updates');
}

if (updateSystemScript.includes("'CODEX.md'")) {
  pass('update-system preserves CODEX.md as a system-layer wrapper');
} else {
  fail('update-system does not preserve CODEX.md');
}

// ── 8. MODE FILE INTEGRITY ──────────────────────────────────────

console.log('\n8. Mode file integrity');

const expectedModes = [
  '_shared.md', '_profile.template.md', 'oferta.md', 'pdf.md', 'scan.md',
  'batch.md', 'apply.md', 'auto-pipeline.md', 'contacto.md', 'deep.md',
  'ofertas.md', 'pipeline.md', 'project.md', 'tracker.md', 'training.md',
  'interview.md', 'latex.md',
  'regional/eu-swe.md',
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

for (const skillPath of ['.claude/skills/career-ops/SKILL.md', '.agents/skills/career-ops/SKILL.md']) {
  if (!fileExists(skillPath)) {
    fail(`${skillPath} is missing`);
    continue;
  }
  const skill = readFile(skillPath);
  if (skill.includes('/career-ops latex')) {
    pass(`${skillPath} exposes /career-ops latex in discovery menu`);
  } else {
    fail(`${skillPath} does not expose /career-ops latex in discovery menu`);
  }
}

const applyMode = readFile('modes/apply.md');
if (
  applyMode.includes('## Step 5 — Preflight gate') &&
  applyMode.includes('verify liveness with Playwright') &&
  applyMode.includes('matching report has been loaded') &&
  applyMode.includes('Do not continue to Step 6 until this preflight is resolved') &&
  applyMode.includes('refuse to generate final copy')
) {
  pass('apply mode includes liveness and role-match preflight gate');
} else {
  fail('apply mode missing liveness/role-match preflight gate');
}

const ofertaMode = readFile('modes/oferta.md');
const autoPipelineMode = readFile('modes/auto-pipeline.md');
if (
  ofertaMode.includes('## Liveness gate (URL inputs)') &&
  ofertaMode.includes('closed posting evidence') &&
  ofertaMode.includes('Do not continue to Block A until this gate is resolved') &&
  autoPipelineMode.includes('## Step 0.5 — Liveness gate') &&
  autoPipelineMode.includes('closed posting evidence') &&
  autoPipelineMode.includes('Do not continue to Step 1 until this gate is resolved')
) {
  pass('eval modes (oferta/auto-pipeline) gate dead links before evaluation');
} else {
  fail('eval modes missing liveness gate before evaluation');
}

if (
  ofertaMode.includes('## Bounded Research Budget') &&
  ofertaMode.includes('single-pass') &&
  ofertaMode.includes('hard cap: 5 total WebSearch queries') &&
  ofertaMode.includes('Do not invoke `deep-research`') &&
  ofertaMode.includes('Do not spawn subagents') &&
  ofertaMode.includes('Do not continue researching after the query cap is reached') &&
  autoPipelineMode.includes('bounded research budget') &&
  autoPipelineMode.includes('must not invoke `deep-research`') &&
  autoPipelineMode.includes('must not spawn subagents')
) {
  pass('eval modes bound company/comp research to a non-recursive query budget (#1235)');
} else {
  fail('eval modes do not bound company/comp research against recursive fanout (#1235)');
}

const pipelineMode = readFile('modes/pipeline.md');
if (
  pipelineMode.includes('## Liveness sweep') &&
  pipelineMode.includes('check-liveness.mjs') &&
  pipelineMode.includes('unconfirmed') &&
  pipelineMode.includes('Do not') &&
  pipelineMode.includes('liveness sweep')
) {
  pass('pipeline mode sweeps unconfirmed entries for liveness before processing');
} else {
  fail('pipeline mode missing batch liveness sweep for unconfirmed entries');
}

// ── 9. LOCAL PARSER CONTRACT ────────────────────────────────────

console.log('\n9. Local parser contract');

const scanScript = readFile('scan.mjs');
if (
  scanScript.includes('typeof entry.name !== \'string\'') &&
  scanScript.includes('entry.name.trim()') &&
  scanScript.includes('entry.name.toLowerCase()')
) {
  pass('scan.mjs guards company names before filtering');
} else {
  fail('scan.mjs does not guard company names before filtering');
}

if (
  scanScript.includes("skipIds: ['local-parser']") &&
  scanScript.includes('local parser failed, used API fallback') &&
  scanScript.includes('resolveProvider(company, providers')
) {
  pass('scan.mjs falls back to ATS API when local parser fails');
} else {
  fail('scan.mjs does not fall back to ATS API when local parser fails');
}

if (fileExists('providers/local-parser.mjs')) {
  pass('local-parser provider module exists');
} else {
  fail('local-parser provider module is missing');
}

// pipeline.md location column (B1): formatPipelineOffer appends location as a
// 4th pipe-delimited column when present, and degrades to the original 3-column
// form when the ATS exposes no location.
try {
  const { formatPipelineOffer, formatCompensation } = await import(pathToFileURL(join(ROOT, 'scan.mjs')).href);
  const withLoc = formatPipelineOffer({ url: 'https://x/1', company: 'Acme', title: 'SA', location: 'Remote (US)' });
  const noLoc = formatPipelineOffer({ url: 'https://x/2', company: 'BigCo', title: 'PM' });
  const blankLoc = formatPipelineOffer({ url: 'https://x/3', company: 'Co', title: 'Eng', location: '   ' });
  const nonStringLoc = formatPipelineOffer({ url: 'https://x/3b', company: 'Co', title: 'Eng', location: 42 });
  if (
    withLoc === '- [ ] https://x/1 | Acme | SA | Remote (US)' &&
    noLoc === '- [ ] https://x/2 | BigCo | PM' &&
    blankLoc === '- [ ] https://x/3 | Co | Eng' &&
    nonStringLoc === '- [ ] https://x/3b | Co | Eng'
  ) {
    pass('scan.mjs formatPipelineOffer appends location column (degrades to 3 cols when absent / non-string)');
  } else {
    fail(`scan.mjs formatPipelineOffer location column wrong: "${withLoc}" / "${noLoc}" / "${blankLoc}" / "${nonStringLoc}"`);
  }

  // pipeline.md compensation column (B3): formatCompensation renders the parsed
  // {min,max,currency} salary; formatPipelineOffer appends it as the 5th column,
  // forcing the (possibly empty) location cell so comp stays positionally 5th.
  const compRange = formatCompensation({ min: 180000, max: 220000, currency: 'USD' });
  const compSingle = formatCompensation({ min: 150000, max: 150000, currency: 'usd' });
  const compNone = formatCompensation(null);
  const compZeroMin = formatCompensation({ min: 0, max: 200000, currency: '' });
  const withComp = formatPipelineOffer({ url: 'https://x/4', company: 'Acme', title: 'AI Eng', location: 'Remote', salary: { min: 180000, max: 220000, currency: 'USD' } });
  const compNoLoc = formatPipelineOffer({ url: 'https://x/5', company: 'Acme', title: 'AI Eng', salary: { min: 180000, max: 220000, currency: 'USD' } });
  if (
    compRange === '180000-220000 USD' &&
    compSingle === '150000 usd' &&
    compNone === '' &&
    compZeroMin === '200000' &&
    withComp === '- [ ] https://x/4 | Acme | AI Eng | Remote | 180000-220000 USD' &&
    compNoLoc === '- [ ] https://x/5 | Acme | AI Eng |  | 180000-220000 USD'
  ) {
    pass('scan.mjs formatPipelineOffer appends compensation column (forces empty location cell when needed)');
  } else {
    fail(`scan.mjs compensation column wrong: "${compRange}" / "${compSingle}" / "${compNone}" / "${compZeroMin}" / "${withComp}" / "${compNoLoc}"`);
  }
} catch (err) {
  fail(`scan.mjs formatPipelineOffer import failed: ${err.message}`);
}

try {
  const { appendToPipeline } = await import(pathToFileURL(join(ROOT, 'scan.mjs')).href);
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'career-ops-missing-pipeline-'));
  const originalCwd = process.cwd();
  try {
    mkdirSync(join(fixtureRoot, 'data'), { recursive: true });
    process.chdir(fixtureRoot);
    appendToPipeline([{ url: 'https://jobs.example.com/1', company: 'Acme', title: 'Engineer' }]);
    const pipeline = readFileSync(join(fixtureRoot, 'data', 'pipeline.md'), 'utf-8');
    if (
      pipeline.includes('# Pipeline') &&
      pipeline.includes('## Pending') &&
      pipeline.includes('- [ ] https://jobs.example.com/1 | Acme | Engineer')
    ) {
      pass('scan.mjs creates data/pipeline.md before appending offers on fresh installs (#1252)');
    } else {
      fail(`scan.mjs fresh-install pipeline contents wrong: ${JSON.stringify(pipeline)}`);
    }
  } finally {
    process.chdir(originalCwd);
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
} catch (err) {
  fail(`scan.mjs fresh-install pipeline test crashed: ${err.message}`);
}

const scanMode = fileExists('modes/scan.md') ? readFile('modes/scan.md') : '';
if (
  scanMode.includes('local_parser_ok') &&
  (scanMode.includes('No Expensive Scraping Repetition') || scanMode.includes('no repetir scraping caro')) &&
  (scanMode.includes('name not listed in `local_parser_ok`') || scanMode.includes('nombre no listado en `local_parser_ok`'))
) {
  pass('scan.md skips expensive levels after successful local parser');
} else {
  fail('scan.md missing local_parser_ok skip rules for agent scan');
}

if (!fileExists('scripts/parsers/cohere_jobs.py')) {
  pass('Cohere parser example is not bundled as a runtime script');
} else {
  fail('Cohere parser example is still bundled as a runtime script');
}

const portalExample = readFile('templates/portals.example.yml');
if (
  !portalExample.includes('cohere_jobs.py') &&
  portalExample.includes('scripts/parsers/example-js-company-jobs.js') &&
  portalExample.includes('scripts/parsers/example_python_company_jobs.py') &&
  portalExample.includes('already know their target careers URL')
) {
  pass('portals example documents a generic local parser contract');
} else {
  fail('portals example still points at a bundled Cohere parser');
}

// Security hardening: command allowlist, in-repo script containment, careers_url/company validation.
try {
  const localParser = (await import(pathToFileURL(join(ROOT, 'providers/local-parser.mjs')).href)).default;

  if (localParser.detect({ name: 'X', careers_url: 'https://x.co', parser: { command: 'rm' } }) === null) {
    pass('local-parser rejects a non-interpreter command (e.g. rm)');
  } else {
    fail('local-parser should reject a command that is not a whitelisted interpreter or in-repo script');
  }

  if (localParser.detect({ name: 'X', careers_url: 'https://x.co', parser: { command: 'python3', script: '/etc/passwd' } }) === null) {
    pass('local-parser rejects a script outside the project root');
  } else {
    fail('local-parser should reject a script path that escapes the project root');
  }

  const okEntry = localParser.detect({
    name: 'X', careers_url: 'https://x.co',
    parser: { command: 'node', script: 'scan.mjs' },
  });
  if (okEntry && okEntry.url) pass('local-parser accepts a whitelisted interpreter + an in-repo script');
  else fail('local-parser should accept a whitelisted interpreter with an in-repo script');

  let rejectedUrl = false;
  try {
    await localParser.fetch({ name: 'X', careers_url: '--oops', parser: { command: 'python3', args: ['--url', '{careers_url}'] } });
  } catch (e) {
    rejectedUrl = /careers_url/.test(e.message);
  }
  if (rejectedUrl) pass('local-parser rejects a non-URL careers_url before spawning (argument injection guard)');
  else fail('local-parser should reject a careers_url that is not http(s)');

  let rejectedCompany = false;
  try {
    await localParser.fetch({ name: '--rf', careers_url: 'https://x.co', parser: { command: 'python3', args: ['--company', '{company}'] } });
  } catch (e) {
    rejectedCompany = /company/.test(e.message);
  }
  if (rejectedCompany) pass('local-parser rejects a company name that could be read as a flag');
  else fail('local-parser should reject an unsafe company name');

  if (localParser.detect({ name: 'X', careers_url: 'https://x.co', parser: { command: 'node', args: ['-e', 'process.exit(0)'] } }) === null) {
    pass('local-parser rejects inline interpreter code (node -e ...)');
  } else {
    fail('local-parser should reject inline-code flags (-e/-c/--eval)');
  }

  if (localParser.detect({ name: 'X', careers_url: 'https://x.co', parser: { command: 'node', args: ['--eval=globalThis.x=1', 'scan.mjs'] } }) === null) {
    pass('local-parser rejects interpreter options before the script (node --eval=… script)');
  } else {
    fail('local-parser should reject interpreter options preceding the parser script');
  }

  if (localParser.detect({ name: 'Yahoo!', careers_url: 'https://x.co', parser: { command: 'node', script: 'scan.mjs' } })?.url) {
    pass('local-parser accepts a company name with punctuation when {company} is unused');
  } else {
    fail('local-parser should not reject a fixed-script entry over an unused company placeholder');
  }
} catch (e) {
  fail(`local-parser hardening tests crashed: ${e.message}`);
}

// Reverse-scan SSRF guard: a constructed careers_url must resolve to the ATS's own host.
try {
  const { entryOnHost } = await import(pathToFileURL(join(ROOT, 'scan-ats-full.mjs')).href);
  const canonical = entryOnHost('acme', 'https://jobs.lever.co/acme', (h) => h === 'jobs.lever.co');
  const offHost = entryOnHost('acme', 'https://evil.example.com/acme', (h) => h === 'jobs.lever.co');
  if (canonical && canonical.careers_url === 'https://jobs.lever.co/acme' && offHost === null) {
    pass('scan-ats-full entryOnHost keeps canonical ATS hosts and drops others (SSRF guard)');
  } else {
    fail('scan-ats-full entryOnHost should keep canonical hosts and drop non-canonical ones');
  }
} catch (e) {
  fail(`scan-ats-full host-guard test crashed: ${e.message}`);
}

// Reverse-scan date gate (--include-undated) + cap-aware sampling (--shuffle).
try {
  const { classifyPostingDate, sampleCompanies } = await import(pathToFileURL(join(ROOT, 'scan-ats-full.mjs')).href);
  const cutoff = 1_000_000;
  const dateOk =
    classifyPostingDate({ postedAt: 2_000_000 }, cutoff) === 'keep' &&
    classifyPostingDate({ postedAt: 500_000 }, cutoff) === 'stale' &&
    classifyPostingDate({}, cutoff) === 'undated' &&
    classifyPostingDate({ postedAt: null }, cutoff) === 'undated';
  if (dateOk) pass('scan-ats-full classifyPostingDate: fresh→keep, old→stale, no-date→undated (the --include-undated gate)');
  else fail('scan-ats-full classifyPostingDate gate is wrong');

  const list = ['a', 'b', 'c', 'd', 'e'];
  const prefix = sampleCompanies(list, 3, false);
  const all = sampleCompanies(list, 99, false);
  const shuffled = sampleCompanies(list, 3, true);
  const sampleOk =
    JSON.stringify(prefix) === JSON.stringify(['a', 'b', 'c']) &&        // default = alphabetical prefix
    all.length === 5 &&                                                  // limit >= length → all
    shuffled.length === 3 &&                                             // --shuffle still respects the cap
    shuffled.every((x) => list.includes(x)) &&                           // --shuffle preserves membership
    JSON.stringify(list) === JSON.stringify(['a', 'b', 'c', 'd', 'e']);  // never mutates the input
  if (sampleOk) pass('scan-ats-full sampleCompanies: alphabetical prefix by default; capped, membership-preserving, non-mutating on --shuffle');
  else fail('scan-ats-full sampleCompanies behaves wrong');
} catch (e) {
  fail(`scan-ats-full date-gate/sampling test crashed: ${e.message}`);
}

// tracker.mjs delete: removeRowByNum removes the right row, preserves the rest.
try {
  const { removeRowByNum } = await import(pathToFileURL(join(ROOT, 'tracker.mjs')).href);
  const md = [
    '# Applications',
    '',
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    '| 1 | 2026-06-01 | Acme | Dev | 4.0/5 | Evaluated | y | [r1](reports/1.md) | a |',
    '| 2 | 2026-06-02 | Beta | Eng | 3.5/5 | Applied | y | [r2](reports/2.md) | b |',
    '| 3 | 2026-06-03 | Gamma | Lead | 4.5/5 | Interview | y | [r3](reports/3.md) | c |',
    '',
  ].join('\n');
  const r2 = removeRowByNum(md, 2);
  const miss = removeRowByNum(md, 99);
  const ok =
    r2.removed && r2.removedCount === 1 &&
    r2.report === '[r2](reports/2.md)' &&            // report column (index 7) surfaced for orphan note
    !r2.newContent.includes('| 2 |') &&              // the target row is gone
    r2.newContent.includes('| 1 |') && r2.newContent.includes('| 3 |') && // other rows kept
    r2.newContent.includes('# Applications') &&      // non-table line preserved
    r2.newContent.includes('|---|') &&               // separator preserved
    miss.removed === false && miss.newContent === md; // no-op on a missing number
  if (ok) pass('tracker.mjs removeRowByNum: removes the matching row, preserves header/separator/other rows, no-op on miss');
  else fail('tracker.mjs removeRowByNum behaves wrong');
} catch (e) {
  fail(`tracker.mjs removeRowByNum test crashed: ${e.message}`);
}

// ── 10. PORTALS CONFIG VALIDATOR ────────────────────────────────

console.log('\n10. Portals config validator');

try {
  const tmp = mkdtempSync(join(tmpdir(), 'career-ops-portals-validator-'));
  const validPath = join(tmp, 'valid.yml');
  const invalidProviderPath = join(tmp, 'invalid-provider.yml');
  const emptyKeywordPath = join(tmp, 'empty-keyword.yml');
  const duplicateCompanyPath = join(tmp, 'duplicate-company.yml');
  const badContentFilterPath = join(tmp, 'bad-content-filter.yml');

  writeFileSync(validPath, `
title_filter:
  positive: ["AI"]
  negative: ["Intern"]
tracked_companies:
  - name: "Acme"
    careers_url: "https://jobs.lever.co/acme"
`, 'utf-8');

  writeFileSync(invalidProviderPath, `
title_filter:
  positive: ["AI"]
tracked_companies:
  - name: "Acme"
    provider: "missing-provider"
    careers_url: "https://jobs.lever.co/acme"
`, 'utf-8');

  writeFileSync(emptyKeywordPath, `
title_filter:
  positive: ["AI", "   "]
tracked_companies:
  - name: "Acme"
    careers_url: "https://jobs.lever.co/acme"
`, 'utf-8');

  writeFileSync(duplicateCompanyPath, `
title_filter:
  positive: ["AI"]
tracked_companies:
  - name: "Acme"
    careers_url: "https://jobs.lever.co/acme"
  - name: " acme "
    careers_url: "https://jobs.lever.co/acme2"
`, 'utf-8');

  // content_filter with an empty-string keyword must be rejected, same as
  // title/location filters (an empty keyword would match every description).
  writeFileSync(badContentFilterPath, `
title_filter:
  positive: ["AI"]
content_filter:
  positive: ["rust", "   "]
tracked_companies:
  - name: "Acme"
    careers_url: "https://jobs.lever.co/acme"
`, 'utf-8');

  const validResult = run(NODE, ['validate-portals.mjs', '--file', validPath]);
  if (validResult !== null && validResult.includes('0 errors')) {
    pass('validate-portals accepts a minimal valid portals file');
  } else {
    fail('validate-portals should accept a minimal valid portals file');
  }

  const exampleResult = run(NODE, ['validate-portals.mjs', '--file', 'templates/portals.example.yml']);
  if (exampleResult !== null && exampleResult.includes('0 errors')) {
    pass('validate-portals accepts templates/portals.example.yml');
  } else {
    fail('validate-portals should accept templates/portals.example.yml');
  }

  const invalidProviderResult = run(NODE, ['validate-portals.mjs', '--file', invalidProviderPath]);
  if (invalidProviderResult === null) {
    pass('validate-portals rejects unknown explicit providers');
  } else {
    fail('validate-portals should reject unknown explicit providers');
  }

  const emptyKeywordResult = run(NODE, ['validate-portals.mjs', '--file', emptyKeywordPath]);
  if (emptyKeywordResult === null) {
    pass('validate-portals rejects empty title/location keywords');
  } else {
    fail('validate-portals should reject empty title/location keywords');
  }

  const duplicateCompanyResult = run(NODE, ['validate-portals.mjs', '--file', duplicateCompanyPath]);
  if (duplicateCompanyResult !== null && duplicateCompanyResult.includes('1 warning')) {
    pass('validate-portals warns on duplicate enabled company names');
  } else {
    fail('validate-portals should warn on duplicate enabled company names');
  }

  const badContentFilterResult = run(NODE, ['validate-portals.mjs', '--file', badContentFilterPath]);
  if (badContentFilterResult === null) {
    pass('validate-portals rejects empty content_filter keywords');
  } else {
    fail('validate-portals should reject empty content_filter keywords');
  }

  rmSync(tmp, { recursive: true, force: true });
} catch (e) {
  fail(`portals validator tests crashed: ${e.message}`);
}

// ── 10b. PORTAL SLUG VALIDATOR (verify-portals.mjs) ─────────────

console.log('\n10b. Portal slug validator');

try {
  const { deriveSlugCandidates, parseAtsSlug, verifyCompanies } =
    await import(pathToFileURL(join(ROOT, 'verify-portals.mjs')).href);

  const slugs = deriveSlugCandidates('Acme Corp!');
  if (JSON.stringify(slugs) === JSON.stringify(['acmecorp', 'acme-corp', 'acme_corp', 'acme'])) {
    pass('verify-portals derives slug candidates from a company name');
  } else {
    fail(`verify-portals slug candidates wrong: ${JSON.stringify(slugs)}`);
  }

  if (
    parseAtsSlug('https://job-boards.greenhouse.io/acme')?.ats === 'greenhouse' &&
    parseAtsSlug('https://jobs.ashbyhq.com/acme')?.ats === 'ashby' &&
    parseAtsSlug('https://api.lever.co/v0/postings/acme')?.slug === 'acme' &&
    parseAtsSlug('https://openai.com/careers') === null
  ) {
    pass('verify-portals recognizes ATS slugs and skips branded URLs');
  } else {
    fail('verify-portals parseAtsSlug misclassified an ATS or branded URL');
  }

  // Mock fetchJson: 200+jobs → live, 200+empty → empty, otherwise 404 → missing.
  const mockFetch = async (url) => {
    if (url.includes('/boards/live/')) return { jobs: [{}, {}] };
    if (url.includes('/boards/empty/')) return { jobs: [] };
    const err = new Error('HTTP 404'); err.status = 404; throw err;
  };
  const results = await verifyCompanies([
    { name: 'Live', careers_url: 'https://job-boards.greenhouse.io/live' },
    { name: 'Empty', careers_url: 'https://job-boards.greenhouse.io/empty' },
    { name: 'Typo', careers_url: 'https://job-boards.greenhouse.io/nope' },
    { name: 'Branded', careers_url: 'https://acme.com/careers' },
    { name: 'Off', enabled: false, careers_url: 'https://job-boards.greenhouse.io/live' },
  ], { fetchJson: mockFetch });
  const byName = Object.fromEntries(results.map((r) => [r.name, r.status]));
  if (
    results.length === 4 &&
    byName.Live === 'live' && byName.Empty === 'empty' &&
    byName.Typo === 'missing' && byName.Branded === 'skipped'
  ) {
    pass('verify-portals classifies live / empty / unresolved / non-ATS (disabled excluded)');
  } else {
    fail(`verify-portals classification wrong: ${JSON.stringify(byName)} (${results.length} rows)`);
  }
} catch (e) {
  fail(`portal slug validator tests crashed: ${e.message}`);
}

// ── 11. AGENTS.md INTEGRITY ─────────────────────────────────────

console.log('\n11. AGENTS.md integrity');

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

// ── 11. CLI WRAPPER FILE INTEGRITY ──────────────────────────

console.log('\n11. CLI wrapper file integrity');

const cliWrappers = ['CLAUDE.md', 'CODEX.md', 'OPENCODE.md'];
for (const f of cliWrappers) {
  if (!fileExists(f)) {
    fail(`Missing CLI wrapper: ${f}`);
    continue;
  }
  const content = readFile(f);
  if (content.includes('AGENTS.md')) {
    pass(`${f} references AGENTS.md`);
  } else {
    fail(`${f} does NOT reference AGENTS.md`);
  }
}
if (!fileExists('GEMINI.md')) {
  fail('Missing legacy Gemini context guard: GEMINI.md');
} else {
  const geminiContext = readFile('GEMINI.md');
  if (/^@(?:\.\/)?AGENTS\.md/m.test(geminiContext)) {
    fail('GEMINI.md imports AGENTS.md and duplicates Antigravity context');
  } else {
    pass('GEMINI.md is a no-op context guard for Antigravity');
  }
}

const codexWrapper = fileExists('CODEX.md') ? readFile('CODEX.md') : '';
if (/^@(?:\.\/)?AGENTS\.md/m.test(codexWrapper)) {
  pass('CODEX.md imports AGENTS.md as a thin wrapper');
} else {
  fail('CODEX.md is not a thin AGENTS.md wrapper');
}

const codexGuideDoc = fileExists('docs/CODEX.md') ? readFile('docs/CODEX.md') : '';
if (
  /AGENTS\.md/.test(codexGuideDoc) &&
  /CODEX\.md/.test(codexGuideDoc) &&
  /codex exec/.test(codexGuideDoc) &&
  /Codex/i.test(codexGuideDoc)
) {
  pass('docs/CODEX.md is a complete Codex guide');
} else {
  fail('docs/CODEX.md is missing required content');
}

// ── 12. SKILL SYMLINK INTEGRITY ─────────────────────────────

console.log('\n12. Skill symlink integrity');

const canonicalSkill = '.agents/skills/career-ops/SKILL.md';
const symlinks = [
  '.claude/skills/career-ops/SKILL.md',
  '.opencode/skills/career-ops/SKILL.md',
  '.qwen/skills/career-ops/SKILL.md',
  '.antigravitycli/skills/career-ops/SKILL.md',
  '.grok/skills/career-ops/SKILL.md',
];

let canonicalReal = null;
let canonicalContent = null;
try {
  canonicalReal = realpathSync(join(ROOT, canonicalSkill));
  canonicalContent = readFile(canonicalSkill);
  pass(`Canonical skill resolves: ${canonicalSkill}`);
} catch {
  fail(`Canonical skill not found: ${canonicalSkill}`);
}

for (const link of symlinks) {
  let resolved = null;
  try {
    resolved = realpathSync(join(ROOT, link));
    if (resolved !== canonicalReal) {
      const content = readFileSync(resolved, 'utf-8').trim();
      if (content.startsWith('..') && content.split('\n').length === 1) {
        resolved = realpathSync(join(dirname(join(ROOT, link)), content));
      }
    }
  } catch {
    resolved = null;
  }
  if (resolved === null) {
    fail(`Symlink missing: ${link}`);
    continue;
  }
  if (resolved === canonicalReal) {
    pass(`${link} → canonical skill`);
  } else if (canonicalContent !== null && readFile(link) === canonicalContent) {
    pass(`${link} is a materialized copy of canonical skill`);
  } else {
    fail(`${link} resolves to ${resolved}, expected ${canonicalReal} or byte-identical canonical skill copy`);
  }
}

if (
  /Codex/i.test(canonicalContent ?? '') &&
  /`codex`/.test(canonicalContent ?? '') &&
  /`codex exec/.test(canonicalContent ?? '') &&
  /prompt/i.test(canonicalContent ?? '') &&
  /\/career-ops/.test(canonicalContent ?? '')
) {
  pass('career-ops skill router documents the Codex invocation model');
} else {
  fail('career-ops skill router is missing Codex invocation guidance');
}

console.log('\n12c. Codex documentation guidance');

const readmeDoc = readFile('README.md');
if (
  /CODEX\.md/.test(readmeDoc) &&
  /codex exec/.test(readmeDoc) &&
  /Codex/i.test(readmeDoc) &&
  /(slash commands?.*not guaranteed|plain language|prompt)/i.test(readmeDoc)
) {
  pass('README documents CODEX.md and Codex interactive/headless usage');
} else {
  fail('README is missing required Codex usage guidance');
}

const setupDoc = readFile('docs/SETUP.md');
if (
  /codex exec/.test(setupDoc) &&
  /Codex/i.test(setupDoc) &&
  /(slash commands?.*not guaranteed|plain language|prompt)/i.test(setupDoc)
) {
  pass('docs/SETUP.md explains the Codex invocation model');
} else {
  fail('docs/SETUP.md is missing Codex invocation guidance');
}

const agentsDoc = readFile('AGENTS.md');
if (
  /CODEX\.md/.test(agentsDoc) &&
  /codex exec/.test(agentsDoc) &&
  /Codex/i.test(agentsDoc) &&
  /(slash commands?.*not guaranteed|prompt|\/career-ops.*unavailable)/i.test(agentsDoc)
) {
  pass('AGENTS.md includes CODEX.md and Codex-specific command guidance');
} else {
  fail('AGENTS.md is missing CODEX.md or Codex command guidance');
}

console.log('\n12a. Skill entrypoint materialization');

{
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'career-ops-skills-'));
  try {
    const canonicalDir = join(fixtureRoot, '.agents', 'skills', 'career-ops');
    const claudeDir = join(fixtureRoot, '.claude', 'skills', 'career-ops');
    const opencodeDir = join(fixtureRoot, '.opencode', 'skills', 'career-ops');
    mkdirSync(canonicalDir, { recursive: true });
    mkdirSync(claudeDir, { recursive: true });
    mkdirSync(opencodeDir, { recursive: true });

    const fixtureSkill = '---\nname: career-ops\n---\n\n# canonical skill\n';
    const pointer = '../../../.agents/skills/career-ops/SKILL.md';
    writeFileSync(join(canonicalDir, 'SKILL.md'), fixtureSkill);
    writeFileSync(join(claudeDir, 'SKILL.md'), pointer);
    writeFileSync(join(opencodeDir, 'SKILL.md'), pointer);

    const updater = await import(pathToFileURL(join(ROOT, 'update-system.mjs')).href);
    const materialized = updater.materializeSkillEntrypoints(fixtureRoot).sort();
    const expected = [
      '.claude/skills/career-ops/SKILL.md',
      '.opencode/skills/career-ops/SKILL.md',
    ];

    if (JSON.stringify(materialized) === JSON.stringify(expected)) {
      pass('update-system materializes pointer skill entrypoints');
    } else {
      fail(`unexpected materialized skill entrypoints: ${JSON.stringify(materialized)}`);
    }

    const claudeSkill = readFileSync(join(claudeDir, 'SKILL.md'), 'utf-8');
    const opencodeSkill = readFileSync(join(opencodeDir, 'SKILL.md'), 'utf-8');
    if (claudeSkill === fixtureSkill && opencodeSkill === fixtureSkill) {
      pass('materialized skill entrypoints match canonical content');
    } else {
      fail('materialized skill entrypoints do not match canonical content');
    }
  } catch (e) {
    fail(`skill entrypoint materialization test crashed: ${e.message}`);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

console.log('\n12b. Skill entrypoint bootstrap (npx / old releases)');

{
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'career-ops-ensure-skills-'));
  try {
    const canonicalDir = join(fixtureRoot, '.agents', 'skills', 'career-ops');
    const claudeDir = join(fixtureRoot, '.claude', 'skills', 'career-ops');
    mkdirSync(canonicalDir, { recursive: true });
    mkdirSync(claudeDir, { recursive: true });

    const fixtureSkill = '---\nname: career-ops\n---\n\n# canonical skill\n';
    const pointer = '../../../.agents/skills/career-ops/SKILL.md';
    writeFileSync(join(canonicalDir, 'SKILL.md'), fixtureSkill);
    writeFileSync(join(claudeDir, 'SKILL.md'), pointer);

    const skills = await import(pathToFileURL(join(ROOT, 'scaffolder/bin/skill-entrypoints.mjs')).href);
    const touched = skills.ensureSkillEntrypoints(fixtureRoot).sort();
    const expectedTouched = [
      '.antigravitycli/skills/career-ops/SKILL.md',
      '.claude/skills/career-ops/SKILL.md',
      '.grok/skills/career-ops/SKILL.md',
      '.opencode/skills/career-ops/SKILL.md',
      '.qwen/skills/career-ops/SKILL.md',
    ];

    if (JSON.stringify(touched) === JSON.stringify(expectedTouched)) {
      pass('ensureSkillEntrypoints bootstraps all CLI skill entrypoints');
    } else {
      fail(`unexpected bootstrapped skill entrypoints: ${JSON.stringify(touched)}`);
    }

    const grokSkill = readFileSync(join(fixtureRoot, '.grok', 'skills', 'career-ops', 'SKILL.md'), 'utf-8');
    const claudeSkill = readFileSync(join(claudeDir, 'SKILL.md'), 'utf-8');
    if (grokSkill === fixtureSkill && claudeSkill === fixtureSkill) {
      pass('ensureSkillEntrypoints materializes canonical skill content');
    } else {
      fail('bootstrapped skill entrypoints do not match canonical content');
    }
  } catch (e) {
    fail(`skill entrypoint bootstrap test crashed: ${e.message}`);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

{
  // Regression guard for #1245: the self-reexec checkout derives its file list
  // from update-system.mjs's static relative imports, so the parser must catch
  // every relative import/export form and ignore bare/package specifiers.
  try {
    const updater = await import(pathToFileURL(join(ROOT, 'update-system.mjs')).href);
    const sample = [
      "import { a } from './scaffolder/bin/skill-entrypoints.mjs';",
      'import b from "../lib/helper.mjs";',
      "export { c } from './sibling.mjs';",
      "import './side-effect.mjs';",
      "import { readFileSync } from 'node:fs';",
      "import yaml from 'js-yaml';",
    ].join('\n');
    const specs = updater.relativeImportSpecifiers(sample).sort();
    const expected = [
      '../lib/helper.mjs',
      './scaffolder/bin/skill-entrypoints.mjs',
      './sibling.mjs',
      './side-effect.mjs',
    ];
    if (JSON.stringify(specs) === JSON.stringify(expected)) {
      pass('relativeImportSpecifiers extracts relative imports, ignores bare/package (#1245)');
    } else {
      fail(`relativeImportSpecifiers mismatch: got ${JSON.stringify(specs)}`);
    }

    const liveSource = readFileSync(join(ROOT, 'update-system.mjs'), 'utf-8');
    if (updater.relativeImportSpecifiers(liveSource).includes('./scaffolder/bin/skill-entrypoints.mjs')) {
      pass('relativeImportSpecifiers picks up the live skill-entrypoints import (#1245)');
    } else {
      fail('relativeImportSpecifiers missed the live skill-entrypoints import');
    }
  } catch (e) {
    fail(`relativeImportSpecifiers test crashed: ${e.message}`);
  }
}

{
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'career-ops-skills-unreadable-'));
  try {
    const canonicalDir = join(fixtureRoot, '.agents', 'skills', 'career-ops');
    const claudeDir = join(fixtureRoot, '.claude', 'skills', 'career-ops');
    mkdirSync(canonicalDir, { recursive: true });
    mkdirSync(claudeDir, { recursive: true });

    const pointer = '../../../.agents/skills/career-ops/SKILL.md';
    mkdirSync(join(canonicalDir, 'SKILL.md'));
    writeFileSync(join(claudeDir, 'SKILL.md'), pointer);

    const updater = await import(pathToFileURL(join(ROOT, 'update-system.mjs')).href);
    const materialized = updater.materializeSkillEntrypoints(fixtureRoot);
    const claudeSkill = readFileSync(join(claudeDir, 'SKILL.md'), 'utf-8');
    if (materialized.length === 0 && claudeSkill === pointer) {
      pass('update-system skips skill materialization when canonical entrypoint is unreadable');
    } else {
      fail(`unreadable canonical skill unexpectedly materialized: ${JSON.stringify(materialized)}`);
    }
  } catch (e) {
    fail(`unreadable canonical skill test crashed: ${e.message}`);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

{
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'career-ops-skills-entry-dir-'));
  try {
    const canonicalDir = join(fixtureRoot, '.agents', 'skills', 'career-ops');
    const claudeDir = join(fixtureRoot, '.claude', 'skills', 'career-ops');
    const opencodeDir = join(fixtureRoot, '.opencode', 'skills', 'career-ops');
    mkdirSync(canonicalDir, { recursive: true });
    mkdirSync(claudeDir, { recursive: true });
    mkdirSync(opencodeDir, { recursive: true });

    const fixtureSkill = '---\nname: career-ops\n---\n\n# canonical skill\n';
    const pointer = '../../../.agents/skills/career-ops/SKILL.md';
    writeFileSync(join(canonicalDir, 'SKILL.md'), fixtureSkill);
    mkdirSync(join(claudeDir, 'SKILL.md'));
    writeFileSync(join(opencodeDir, 'SKILL.md'), pointer);

    const updater = await import(pathToFileURL(join(ROOT, 'update-system.mjs')).href);
    const materialized = updater.materializeSkillEntrypoints(fixtureRoot);
    const opencodeSkill = readFileSync(join(opencodeDir, 'SKILL.md'), 'utf-8');
    if (JSON.stringify(materialized) === JSON.stringify(['.opencode/skills/career-ops/SKILL.md']) && opencodeSkill === fixtureSkill) {
      pass('update-system skips non-file skill entrypoints while materializing valid pointers');
    } else {
      fail(`non-file skill entrypoint handling was unexpected: ${JSON.stringify(materialized)}`);
    }
  } catch (e) {
    fail(`non-file skill entrypoint test crashed: ${e.message}`);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

console.log('\n12c. Materialized skill index mode');

{
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'career-ops-skill-git-'));
  const gitRun = (args, opts = {}) => execFileSync('git', args, {
    cwd: fixtureRoot,
    encoding: 'utf-8',
    timeout: 30000,
    ...opts,
  }).trim();
  const gitRaw = (args) => execFileSync('git', args, {
    cwd: fixtureRoot,
    encoding: 'utf-8',
    timeout: 30000,
  });

  try {
    const canonicalDir = join(fixtureRoot, '.agents', 'skills', 'career-ops');
    const claudeDir = join(fixtureRoot, '.claude', 'skills', 'career-ops');
    const opencodeDir = join(fixtureRoot, '.opencode', 'skills', 'career-ops');
    mkdirSync(canonicalDir, { recursive: true });
    mkdirSync(claudeDir, { recursive: true });
    mkdirSync(opencodeDir, { recursive: true });

    const fixtureSkill = '---\nname: career-ops\n---\n\n# canonical skill\n';
    const pointer = '../../../.agents/skills/career-ops/SKILL.md';

    gitRun(['init']);
    gitRun(['config', 'core.symlinks', 'false']);
    gitRun(['config', 'user.email', 'test@example.com']);
    gitRun(['config', 'user.name', 'Test User']);

    writeFileSync(join(canonicalDir, 'SKILL.md'), fixtureSkill);
    writeFileSync(join(claudeDir, 'SKILL.md'), pointer);
    writeFileSync(join(opencodeDir, 'SKILL.md'), pointer);
    gitRun(['add', '--', '.agents/skills/career-ops/SKILL.md']);

    const pointerBlob = gitRun(['hash-object', '-w', '--stdin'], { input: pointer });
    gitRun(['update-index', '--add', '--cacheinfo', `120000,${pointerBlob},.claude/skills/career-ops/SKILL.md`]);
    gitRun(['update-index', '--add', '--cacheinfo', `120000,${pointerBlob},.opencode/skills/career-ops/SKILL.md`]);

    const updater = await import(pathToFileURL(join(ROOT, 'update-system.mjs')).href);
    const materialized = updater.materializeSkillEntrypoints(fixtureRoot);
    updater.prepareMaterializedSkillEntrypointsForStage(materialized, fixtureRoot);
    gitRun(['add', '--', '.claude/skills/', '.opencode/skills/']);

    const claudeIndex = gitRun(['ls-files', '-s', '--', '.claude/skills/career-ops/SKILL.md']);
    const opencodeIndex = gitRun(['ls-files', '-s', '--', '.opencode/skills/career-ops/SKILL.md']);
    if (claudeIndex.startsWith('100644 ') && opencodeIndex.startsWith('100644 ')) {
      pass('materialized skill entrypoints stage as regular files, not symlink blobs');
    } else {
      fail(`materialized skill entrypoints staged with wrong modes: ${JSON.stringify([claudeIndex, opencodeIndex])}`);
    }

    const claudeBlob = gitRaw(['show', ':.claude/skills/career-ops/SKILL.md']);
    const opencodeBlob = gitRaw(['show', ':.opencode/skills/career-ops/SKILL.md']);
    if (claudeBlob === fixtureSkill && opencodeBlob === fixtureSkill) {
      pass('materialized skill blobs contain canonical skill content');
    } else {
      fail('materialized skill blobs do not contain canonical skill content');
    }
  } catch (e) {
    fail(`skill entrypoint index-mode test crashed: ${e.message}`);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

// ── 14. VERSION FILE ─────────────────────────────────────────────

console.log('\n14. Version file');

if (fileExists('VERSION')) {
  // VERSION may carry a release-please marker, e.g. "1.9.0 # x-release-please-version".
  // Validate the first whitespace-delimited token, mirroring update-system.mjs parseVersionFile().
  const version = readFile('VERSION').trim().split(/\s+/)[0];
  if (/^\d+\.\d+\.\d+$/.test(version)) {
    pass(`VERSION is valid semver: ${version}`);
  } else {
    fail(`VERSION is not valid semver: "${version}"`);
  }
} else {
  fail('VERSION file missing');
}

// ── 12. ARCHIVE-POSTING ─────────────────────────────────────────

console.log('\n12. archive-posting.mjs');

const todayStr = new Date().toISOString().split('T')[0];

// dry-run: URL-based company detection across each supported ATS
for (const [url, expected] of [
  ['https://boards.greenhouse.io/openai/jobs/123', 'openai'],
  ['https://jobs.ashbyhq.com/ElevenLabs/abc',      'elevenlabs'],
  ['https://jobs.lever.co/retool/xyz',              'retool'],
]) {
  const out = run(NODE, ['archive-posting.mjs', '--dry-run', url]);
  const { hostname } = new URL(url);
  out?.toLowerCase().includes(expected)
    ? pass(`dry-run: company detected from ${hostname}`)
    : fail(`dry-run: company not detected from ${hostname}`);
}

// dry-run: --company / --role overrides win over URL detection
const overrideOut = run(NODE, [
  'archive-posting.mjs', '--dry-run',
  'https://jobs.lever.co/retool/xyz', '--company=Acme', '--role=Staff Engineer',
]);
overrideOut?.includes('Acme') && overrideOut?.includes('staff-engineer')
  ? pass('dry-run: --company and --role overrides respected')
  : fail('dry-run: --company / --role overrides not reflected in output');

// dry-run: output always contains a local:jds/ reference and today's date
const refOut = run(NODE, ['archive-posting.mjs', '--dry-run', 'https://boards.greenhouse.io/openai/jobs/123']);
refOut?.includes('local:jds/') && refOut?.includes(todayStr)
  ? pass('dry-run: local:jds/ reference and date emitted')
  : fail('dry-run: reference or date missing from output');

// argument validation: no args → shows help, exits 0
run(NODE, ['archive-posting.mjs']) !== null
  ? pass('no-args: exits 0 (shows help)')
  : fail('no-args: should exit 0 and print help');

// argument validation: flag without URL → exits non-zero
run(NODE, ['archive-posting.mjs', '--dry-run']) === null
  ? pass('flag-without-url: exits non-zero (URL required)')
  : fail('flag-without-url: should exit non-zero when URL is missing');

// argument validation: --company without URL → exits non-zero
run(NODE, ['archive-posting.mjs', '--company=Acme']) === null
  ? pass('--company without URL: exits non-zero')
  : fail('--company without URL: should exit non-zero');

// live render: gated behind Playwright executable availability
let hasBrowser = false;
try {
  const { chromium } = await import('playwright');
  hasBrowser = existsSync(chromium.executablePath());
} catch { /* playwright not installed */ }

if (!hasBrowser) {
  warn('archive render skipped — no Playwright browser in env');
} else {
  let liveJobUrl = null;
  try {
    const res = await fetch('https://boards-api.greenhouse.io/v1/boards/anthropic/jobs?content=false');
    const { jobs } = await res.json();
    const candidate = jobs?.[0]?.absolute_url ?? null;
    if (candidate) {
      const u = new URL(candidate);
      const allowed = new Set(['boards.greenhouse.io', 'job-boards.greenhouse.io']);
      if (u.protocol === 'https:' && allowed.has(u.hostname)) liveJobUrl = candidate;
    }
  } catch { /* offline — degrade gracefully */ }

  if (!liveJobUrl) {
    warn('archive render skipped — Greenhouse API unreachable');
  } else {
    const JDS_DIR = join(ROOT, 'jds');
    const startedAt = Date.now();
    const archiveOut = run('node', ['archive-posting.mjs', liveJobUrl], { timeout: 60000 });

    if (archiveOut === null) {
      fail('live archive: script exited non-zero on live URL');
    } else {
      pass('live archive: exited 0');

      const recent = existsSync(JDS_DIR)
        ? readdirSync(JDS_DIR)
            .filter(f => f.endsWith('.pdf'))
            .filter(f => statSync(join(JDS_DIR, f)).mtimeMs >= startedAt)
        : [];

      if (recent.length === 0) {
        fail('live archive: no PDF written to jds/ during test run');
      } else {
        const pdf = join(JDS_DIR, recent[0]);
        const { size } = statSync(pdf);
        size > 50 * 1024
          ? pass(`live archive: PDF has real content (${(size / 1024).toFixed(0)} KB)`)
          : fail(`live archive: PDF suspiciously small — likely empty page (${size} bytes)`);
        unlinkSync(pdf);
      }
    }
  }
}

// ── 13. LOCATION FILTER — always_allow tier ───────────────────────

console.log('\n13. Location filter — always_allow tier');

try {
  const {
    buildLocationFilter,
    buildContentFilter,
    shouldDedupScanHistoryRow,
    formatPipelineOffer,
    formatScanHistoryRow,
  } = await import(pathToFileURL(join(ROOT, 'scan.mjs')).href);

  const filter = buildLocationFilter({
    always_allow: ['belgium', 'brussels'],
    allow: ['europe', 'emea', 'remote'],
    block: ['france', 'germany', 'united states'],
  });

  // Case 1: home-region passes regardless of other text
  if (filter('Brussels, Belgium') === true) pass('Brussels, Belgium passes (always_allow hit)');
  else fail('Brussels, Belgium should pass');

  // Case 2: always_allow wins over block (THE motivating case for this tier)
  if (filter('Remote, Belgium or France') === true) pass('Remote, Belgium or France passes (always_allow beats block)');
  else fail('Remote, Belgium or France should pass — always_allow must win over block');

  // Case 3: no always_allow hit, block still rejects
  if (filter('Paris, France') === false) pass('Paris, France is rejected (block still applies)');
  else fail('Paris, France should be rejected');

  // Case 4: empty location → pass (existing semantics, unchanged)
  if (filter('') === true) pass('empty location passes (unchanged semantics)');
  else fail('empty location should pass');

  // Case 5: case-insensitivity
  if (filter('BRUSSELS, BELGIUM') === true) pass('case-insensitive match works');
  else fail('case-insensitive match failed');

  // Case 6: backward compatibility — no always_allow key behaves like stock allow/block
  const stockFilter = buildLocationFilter({
    allow: ['europe', 'remote'],
    block: ['france'],
  });
  if (stockFilter('Remote, Belgium or France') === false) pass('without always_allow, block still wins (backward compatible)');
  else fail('without always_allow, behaviour must match stock allow/block (block wins)');

  // Case 7: null/missing locationFilter → pass-all filter (early-return path)
  const nullFilter = buildLocationFilter(null);
  if (nullFilter('Anywhere on Earth') === true && nullFilter('') === true) {
    pass('null locationFilter returns a pass-all filter (early-return path)');
  } else {
    fail('null locationFilter should return a pass-all filter');
  }

  // Case 8: string-instead-of-array → wrapped to a 1-item list
  const stringFilter = buildLocationFilter({ always_allow: 'belgium', block: ['france'] });
  if (stringFilter('Remote, Belgium or France') === true) {
    pass('always_allow as a bare string is wrapped to a single-item list');
  } else {
    fail('always_allow as a bare string should still work');
  }

  // Case 9: null/non-string items are filtered out (no crash, no false matches)
  const messyFilter = buildLocationFilter({
    always_allow: [null, 'belgium', 42, undefined],
    block: ['france', null, 7],
  });
  if (messyFilter('Brussels, Belgium') === true && messyFilter('Paris, France') === false) {
    pass('non-string entries (null, numbers, undefined) are filtered out without crashing');
  } else {
    fail('mixed-type keyword lists should not crash and should still match string entries');
  }

  // Case 10: all-null/non-string list → empty after normalization (no false rejects)
  const allBadFilter = buildLocationFilter({ block: [null, 42, undefined], allow: ['remote'] });
  if (allBadFilter('Remote') === true) {
    pass('a block list with only non-string entries normalizes to [] (no false rejects)');
  } else {
    fail('non-string-only block list should not cause rejection');
  }

  // Case 11: empty / whitespace-only entries are dropped (would otherwise pass-all via includes(''))
  const emptyKeywordFilter = buildLocationFilter({
    always_allow: ['', '  '],
    allow: ['remote'],
    block: ['france'],
  });
  if (emptyKeywordFilter('Paris, France') === false) {
    pass('empty/whitespace always_allow entries are dropped (no pass-all via includes(""))');
  } else {
    fail('empty always_allow entries should NOT bypass block — would have made the filter pass-all');
  }

  // Case 12: surrounding whitespace is trimmed so the keyword still matches
  const whitespaceFilter = buildLocationFilter({
    always_allow: ['  Belgium  ', '\tBrussels\n'],
    block: ['france'],
  });
  if (whitespaceFilter('Remote, Belgium or France') === true) {
    pass('whitespace-padded keywords still match after trim');
  } else {
    fail('"  Belgium  " should be trimmed and still match "Remote, Belgium or France"');
  }

  // Case 13: whitespace-only location is treated as missing (pass-all-tiers)
  if (filter('   \t  ') === true) pass('whitespace-only location passes (treated as missing)');
  else fail('whitespace-only location should pass');

  // Case 14: non-string location (number/object/null) → pass without throwing
  let crashed = false;
  try {
    const r1 = filter(42);
    const r2 = filter({ city: 'Brussels' });
    const r3 = filter(null);
    const r4 = filter(undefined);
    if (r1 === true && r2 === true && r3 === true && r4 === true) {
      pass('non-string location values (number, object, null, undefined) pass without throwing');
    } else {
      fail(`non-string location results: number=${r1}, object=${r2}, null=${r3}, undefined=${r4}`);
    }
  } catch (e) {
    crashed = true;
    fail(`non-string location crashed: ${e.message}`);
  }

  // Case 15: a malformed location (e.g. legacy object) does NOT bypass block when interpreted naively —
  // the guard returns true (pass) BEFORE block/allow even run, which is correct: scoring/eval happens
  // downstream from the scan filter, so malformed locations should fall through to the manual evaluation
  // step rather than being silently dropped here.
  if (filter(42) === true) pass('non-string locations are passed through to downstream evaluation, not silently dropped');
  else fail('non-string locations should pass through');

  if (
    shouldDedupScanHistoryRow({ firstSeen: '2026-06-01', status: 'added' }, { recheckAfterDays: 30, today: '2026-06-10' }) === true &&
    shouldDedupScanHistoryRow({ firstSeen: '2026-05-01', status: 'added' }, { recheckAfterDays: 30, today: '2026-06-10' }) === false &&
    shouldDedupScanHistoryRow({ firstSeen: '2026-02-31', status: 'added' }, { recheckAfterDays: 30, today: '2026-06-10' }) === true &&
    shouldDedupScanHistoryRow({ firstSeen: '2026-05-01', status: 'skipped_blocked_host' }, { recheckAfterDays: 30, today: '2026-06-10' }) === true &&
    shouldDedupScanHistoryRow({ firstSeen: '2026-05-01', status: 'added' }, { today: '2026-06-10' }) === true &&
    scanScript.includes('Recheck eligible:')
  ) {
    pass('scan-history TTL rechecks old added URLs while permanent statuses stay deduped');
  } else {
    fail('scan-history TTL policy did not match expected recheck/permanent behavior');
  }

  const hostileOffer = {
    url: 'https://jobs.example.com/123|evil\nhttps://evil.example/later',
    source: 'local-parser',
    title: 'Senior Engineer | Growth\n- [ ] https://evil.example/job | EvilCorp | Injected',
    company: '=ACME\\Corp\t| R&D',
    location: '@Remote\nEU',
  };
  const pipelineRow = formatPipelineOffer(hostileOffer);
  const pendingLines = pipelineRow.split('\n').filter(line => /^\s*- \[ \] https?:\/\//.test(line));
  const pipelineFields = pipelineRow.split('|').map(part => part.trim());
  if (
    pendingLines.length === 1 &&
    pipelineFields.length === 4 &&
    pipelineFields[0] === '- [ ] https://jobs.example.com/123%7Cevil' &&
    pipelineFields[3] === '@Remote EU' &&
    !pipelineRow.includes('\n') &&
    !pipelineRow.includes('\t') &&
    !pipelineRow.includes('\\|') &&
    pipelineRow.includes('=ACME\\\\Corp / R&D') &&
    pipelineRow.includes('- \\[ \\] https://evil.example/job / EvilCorp / Injected')
  ) {
    pass('scan pipeline writer preserves row shape (optional location 4th col) without injected checkboxes or extra pipes');
  } else {
    fail(`scan pipeline metadata sanitizer produced unsafe row: ${pipelineRow}`);
  }

  const historyRow = formatScanHistoryRow(hostileOffer, '2026-06-18');
  const historyColumns = historyRow.split('\t');
  if (
    historyColumns.length === 7 &&
    !historyColumns.some(col => /[\r\n\t]/.test(col)) &&
    historyColumns[0] === 'https://jobs.example.com/123|evil' &&
    historyColumns[3].includes('- [ ] https://evil.example/job') &&
    historyColumns[4] === "'=ACME\\Corp | R&D" &&
    historyColumns[6] === "'@Remote EU"
  ) {
    pass('scan-history writer preserves row shape and neutralizes spreadsheet formulas');
  } else {
    fail(`scan-history metadata sanitizer produced unsafe TSV row: ${JSON.stringify(historyColumns)}`);
  }

  // ── content_filter (#734) ──
  // Absent config → all jobs pass.
  const noContentFilter = buildContentFilter(null);
  if (noContentFilter('any description') === true && noContentFilter('') === true) {
    pass('content_filter absent → all jobs pass');
  } else {
    fail('content_filter absent should pass all jobs');
  }

  // Empty / missing description always passes (providers without descriptions
  // must never be silently dropped).
  const cf = buildContentFilter({ positive: ['rust'], negative: ['php'] });
  if (cf('') === true && cf('   ') === true && cf(undefined) === true && cf(null) === true && cf(42) === true) {
    pass('content_filter passes empty/missing/non-string descriptions');
  } else {
    fail('content_filter should pass empty/missing/non-string descriptions');
  }

  // Negative keyword present → reject (even if a positive also matches).
  if (cf('We build in PHP and Rust') === false && cf('Legacy PHP shop') === false) {
    pass('content_filter rejects descriptions containing a negative keyword');
  } else {
    fail('content_filter should reject negative-keyword descriptions');
  }

  // Positive required when positive list is non-empty.
  if (cf('We write everything in Rust') === true && cf('A Python and Go team') === false) {
    pass('content_filter requires a positive keyword when positives are set');
  } else {
    fail('content_filter should require a positive keyword');
  }

  // Positive empty → pass after clearing negatives.
  const negOnly = buildContentFilter({ negative: ['wordpress'] });
  if (negOnly('Modern TypeScript stack') === true && negOnly('WordPress maintenance') === false) {
    pass('content_filter with only negatives blocks them and passes the rest');
  } else {
    fail('content_filter negative-only behavior wrong');
  }

  // Case-insensitive.
  const caseCf = buildContentFilter({ positive: ['Kubernetes'] });
  if (caseCf('deploys on KUBERNETES daily') === true) {
    pass('content_filter matches case-insensitively');
  } else {
    fail('content_filter should be case-insensitive');
  }

} catch (e) {
  fail(`always_allow tests crashed: ${e.message}`);
}

// ── 11b. TITLE FILTER — acronym word boundaries ──────────────────
console.log('\n11b. Title filter — acronym word boundaries');
try {
  const { buildTitleFilter, compileKeyword } = await import(pathToFileURL(join(ROOT, 'scan.mjs')).href);

  // Short all-letter acronyms match on WORD BOUNDARIES, not as substrings.
  const cooFilter = buildTitleFilter({ positive: ['coo'] });
  if (cooFilter('Chief Operating Officer (COO)') === true) pass('"COO" positive matches the standalone token in a title');
  else fail('"COO" should match a title containing the standalone token COO');
  if (cooFilter('Sales Coordinator') === false) pass('"COO" positive does NOT match "Coordinator" (no mid-word match)');
  else fail('"COO" must not match "Coordinator"');

  // An acronym used as a NEGATIVE keyword must not knock out an unrelated word.
  const negFilter = buildTitleFilter({ positive: [], negative: ['coo'] });
  if (negFilter('Marketing Coordinator') === true) pass('negative "COO" does not reject "Coordinator"');
  else fail('negative "COO" wrongly rejected "Coordinator"');
  if (negFilter('Group COO') === false) pass('negative "COO" still rejects a standalone "COO" title');
  else fail('negative "COO" should reject "Group COO"');

  // Multi-word phrases and non-letter keywords keep permissive substring matching.
  const phraseFilter = buildTitleFilter({ positive: ['head of'] });
  if (phraseFilter('Head of Finance & Strategy') === true) pass('multi-word "head of" still matches by substring');
  else fail('"head of" should substring-match "Head of Finance & Strategy"');

  // compileKeyword is exported and directly testable.
  if (compileKeyword('cfo')('group cfo, emea') === true && compileKeyword('cfo')('cfom') === false) {
    pass('compileKeyword("cfo") is word-boundary anchored');
  } else {
    fail('compileKeyword("cfo") boundary behavior wrong');
  }

  // A malformed title_filter (null / numeric / empty entries) must not crash.
  const messyFilter = buildTitleFilter({ positive: ['cfo', null, 123, '', 'head of'] });
  if (messyFilter('Group CFO') === true && messyFilter('Marketing Coordinator') === false) {
    pass('buildTitleFilter ignores non-string/empty keyword entries without crashing');
  } else {
    fail('buildTitleFilter should ignore non-string/empty keyword entries');
  }

  // Whitespace-only keywords must be trimmed away, not compiled into matchers.
  // A bare-spaces negative keyword would otherwise reject any title containing
  // a run of spaces (e.g. "   " matches "Senior   Engineer" via includes()).
  const wsNegFilter = buildTitleFilter({ positive: [], negative: ['   '] });
  if (wsNegFilter('Senior   Engineer') === true) {
    pass('buildTitleFilter drops whitespace-only keywords instead of matching on spaces');
  } else {
    fail('buildTitleFilter should drop whitespace-only keywords');
  }
} catch (e) {
  fail(`title filter acronym tests crashed: ${e.message}`);
}

// ── 12. FOLLOW-UP CADENCE LOGIC ─────────────────────────────────

console.log('\n12. Follow-up cadence logic');

try {
  const cadence = await import(pathToFileURL(join(ROOT, 'followup-cadence.mjs')).href);

  // CLI regression: the import.meta.url guard must still let the module run as a CLI.
  // Data-independent — default mode emits the result as JSON: a `metadata` object when
  // the tracker has applications, or an `{error}` object (exit 1) when it is empty.
  // Empty output would mean the guard wrongly suppressed main().
  let cliOut = '';
  try {
    cliOut = execFileSync(NODE, [join(ROOT, 'followup-cadence.mjs')], { cwd: ROOT, encoding: 'utf-8', timeout: 30000 });
  } catch (cliErr) {
    cliOut = `${cliErr.stdout || ''}`; // exit 1 on an empty tracker is expected; keep stdout
  }
  let cliJson = null;
  try { cliJson = JSON.parse(cliOut.trim()); } catch { /* leave null → fail below */ }
  if (cliJson && typeof cliJson === 'object' && ('metadata' in cliJson || 'error' in cliJson)) {
    pass('CLI still executes under the import.meta.url guard (emits result JSON)');
  } else {
    fail('CLI produced no structured JSON when run directly — import.meta.url guard may be broken');
  }

  // Date helpers
  if (cadence.addDays(cadence.parseDate('2026-05-01'), 7) === '2026-05-08') {
    pass('addDays advances a parsed date by N days (UTC)');
  } else {
    fail(`addDays produced ${cadence.addDays(cadence.parseDate('2026-05-01'), 7)}`);
  }
  if (cadence.daysBetween(cadence.parseDate('2026-05-01'), cadence.parseDate('2026-05-08')) === 7) {
    pass('daysBetween counts whole days between two dates');
  } else {
    fail('daysBetween miscounted');
  }
  if (cadence.parseDate('not-a-date') === null && cadence.parseDate('2026-05-01') instanceof Date) {
    pass('parseDate rejects malformed input and accepts ISO dates');
  } else {
    fail('parseDate validation wrong');
  }

  // parseAppliedDate — extracts the real submission date from notes (the
  // tracker `date` column is the evaluation date), case-insensitive.
  if (cadence.parseAppliedDate('Applied 2026-06-09 via Personio; raised part-time') === '2026-06-09') {
    pass('parseAppliedDate extracts "Applied YYYY-MM-DD" from notes');
  } else {
    fail(`parseAppliedDate got ${JSON.stringify(cadence.parseAppliedDate('Applied 2026-06-09 via Personio; raised part-time'))}`);
  }
  if (cadence.parseAppliedDate('APPLIED 2026-06-17 (German CV; jobId=104170)') === '2026-06-17') {
    pass('parseAppliedDate is case-insensitive (APPLIED)');
  } else {
    fail('parseAppliedDate should match uppercase APPLIED');
  }
  // First "Applied" date wins even when a later status date follows.
  if (cadence.parseAppliedDate('Applied 2026-06-09. No response; discarded 2026-06-18.') === '2026-06-09') {
    pass('parseAppliedDate takes the first applied date, not a later status date');
  } else {
    fail('parseAppliedDate should take the first applied date');
  }
  if (cadence.parseAppliedDate('On-archetype fit; no submission yet') === null && cadence.parseAppliedDate('') === null) {
    pass('parseAppliedDate returns null when notes carry no applied date');
  } else {
    fail('parseAppliedDate should return null without an applied date');
  }
  // "reapplied" must not be mistaken for an applied date (word boundary).
  if (cadence.parseAppliedDate('reapplied 2026-06-09 after rejection') === null) {
    pass('parseAppliedDate does not match inside "reapplied"');
  } else {
    fail('parseAppliedDate should not match the date inside "reapplied"');
  }

  // Status normalization (strips bold + trailing date, lowercases, maps aliases)
  if (cadence.normalizeStatus('**Applied** 2026-05-01') === 'applied') {
    pass('normalizeStatus strips bold + trailing date and lowercases');
  } else {
    fail(`normalizeStatus produced ${cadence.normalizeStatus('**Applied** 2026-05-01')}`);
  }

  const cadenceTmp = mkdtempSync(join(tmpdir(), 'co-cadence-'));
  const profilePath = join(cadenceTmp, 'profile.yml');
  writeFileSync(profilePath, [
    'followup_cadence:',
    '  applied_first_days: 11',
    '  applied_subsequent_days: 5',
    '  applied_max_followups: 4',
    '  responded_initial_days: 2',
    '  responded_subsequent_days: 6',
    '  interview_thankyou_days: 3',
  ].join('\n'));

  const profileCadence = cadence.resolveCadenceConfig({ profilePath });
  if (
    profileCadence.applied_first === 11 &&
    profileCadence.applied_subsequent === 5 &&
    profileCadence.applied_max_followups === 4 &&
    profileCadence.responded_initial === 2 &&
    profileCadence.responded_subsequent === 6 &&
    profileCadence.interview_thankyou === 3
  ) {
    pass('follow-up cadence reads profile.yml overrides');
  } else {
    fail(`profile cadence override failed: ${JSON.stringify(profileCadence)}`);
  }

  const cliCadence = cadence.resolveCadenceConfig({ profilePath, appliedDays: 9 });
  if (cliCadence.applied_first === 9 && cliCadence.applied_subsequent === 5) {
    pass('follow-up cadence CLI override wins over profile applied_first');
  } else {
    fail(`CLI cadence override failed: ${JSON.stringify(cliCadence)}`);
  }

  const malformedProfile = join(cadenceTmp, 'malformed.yml');
  writeFileSync(malformedProfile, 'followup_cadence: [');
  const fallbackCadence = cadence.resolveCadenceConfig({ profilePath: malformedProfile });
  if (fallbackCadence.applied_first === cadence.DEFAULT_CADENCE.applied_first) {
    pass('follow-up cadence ignores malformed optional profile config');
  } else {
    fail(`malformed profile did not fall back to defaults: ${JSON.stringify(fallbackCadence)}`);
  }

  rmSync(cadenceTmp, { recursive: true, force: true });

  // Urgency decision tree (CADENCE defaults: applied_first=7, max_followups=2, responded_initial=1, interview_thankyou=1)
  const urgencyCases = [
    [['applied', 7, null, 0], 'overdue', 'applied past applied_first → overdue'],
    [['applied', 3, null, 0], 'waiting', 'applied within window → waiting'],
    [['applied', 30, null, 2], 'cold', 'applied at max follow-ups → cold'],
    [['responded', 0, null, 0], 'urgent', 'responded before responded_initial → urgent'],
    [['interview', 1, null, 0], 'overdue', 'interview past thank-you window → overdue'],
  ];
  for (const [args, expected, label] of urgencyCases) {
    const got = cadence.computeUrgency(...args);
    if (got === expected) pass(`computeUrgency: ${label}`);
    else fail(`computeUrgency ${label}: expected ${expected}, got ${got}`);
  }

  // Next follow-up date scheduling
  const nextCases = [
    [['applied', '2026-05-01', null, 0], '2026-05-08', 'first applied follow-up = appDate + applied_first'],
    [['applied', '2026-05-01', null, 2], null, 'cold (max follow-ups) → null'],
    [['interview', '2026-05-01', null, 0], '2026-05-02', 'interview = appDate + interview_thankyou'],
  ];
  for (const [args, expected, label] of nextCases) {
    const got = cadence.computeNextFollowupDate(...args);
    if (got === expected) pass(`computeNextFollowupDate: ${label}`);
    else fail(`computeNextFollowupDate ${label}: expected ${expected}, got ${got}`);
  }
} catch (e) {
  fail(`follow-up cadence module crashed: ${e.message}`);
}

// ── 12. PROVIDERS — Workable ────────────────────────────────────────

console.log('\n12. Provider — workable');

try {
  const workable = (await import(pathToFileURL(join(ROOT, 'providers/workable.mjs')).href)).default;
  const { parseWorkableMarkdown } = await import(pathToFileURL(join(ROOT, 'providers/workable.mjs')).href);

  // detect() — auto-detection from careers_url
  if (workable.id === 'workable') pass('workable.id is "workable"');
  else fail(`workable.id is ${JSON.stringify(workable.id)}`);

  const hit = workable.detect({ name: 'TestCo', careers_url: 'https://apply.workable.com/optimile' });
  if (hit && hit.url === 'https://apply.workable.com/optimile/jobs.md') {
    pass('workable.detect() resolves apply.workable.com/<slug> → /jobs.md feed');
  } else {
    fail(`workable.detect() returned ${JSON.stringify(hit)}`);
  }

  const miss = workable.detect({ name: 'TestCo', careers_url: 'https://example.com/careers' });
  if (miss === null) pass('workable.detect() returns null for non-workable URLs');
  else fail(`workable.detect() should return null, got ${JSON.stringify(miss)}`);

  // parse() — markdown table
  const sampleMd = [
    '# Optimile — All Open Positions',
    '',
    '| Title | Department | Location | Type | Salary | Posted | Details |',
    '|---|---|---|---|---|---|---|',
    '| Senior AI PM | Product | Ghent, Belgium | Full-time | — | 2026-04-01 | [View](https://apply.workable.com/optimile/jobs/view/ABC123.md) |',
    '| Tech Lead | Engineering | Remote | Full-time | — | 2026-03-25 | [View](https://apply.workable.com/optimile/jobs/view/DEF456.md) |',
  ].join('\n');

  const jobs = parseWorkableMarkdown(sampleMd, 'Optimile');
  if (jobs.length === 2) pass('parseWorkableMarkdown extracts 2 jobs from 2-row table');
  else fail(`parseWorkableMarkdown returned ${jobs.length} jobs, expected 2`);

  if (jobs[0]?.title === 'Senior AI PM' && jobs[0]?.location === 'Ghent, Belgium' && jobs[0]?.company === 'Optimile') {
    pass('parseWorkableMarkdown extracts title, location, company correctly');
  } else {
    fail(`parseWorkableMarkdown row 0 = ${JSON.stringify(jobs[0])}`);
  }

  if (jobs[0]?.url === 'https://apply.workable.com/optimile/jobs/view/ABC123') {
    pass('parseWorkableMarkdown strips .md suffix from job URL');
  } else {
    fail(`parseWorkableMarkdown should strip .md; got url=${JSON.stringify(jobs[0]?.url)}`);
  }

  // Robustness
  if (parseWorkableMarkdown('', 'X').length === 0) pass('empty input → empty result');
  else fail('empty input should yield empty result');

  if (parseWorkableMarkdown(null, 'X').length === 0) pass('null input → empty result (no crash)');
  else fail('null input should yield empty result without crashing');

  // fetch() reaches the http context on the happy path (allowed hostname).
  await workable.fetch(
    { name: 'Smoke', careers_url: 'https://apply.workable.com/optimile' },
    {
      transport: 'http',
      fetchText: async (url) => {
        if (!url.startsWith('https://apply.workable.com/')) {
          throw new Error('fetchText called with unexpected URL');
        }
        return '| Title | Department | Location | Type | Salary | Posted | Details |\n|---|---|---|---|---|---|---|\n';
      },
      fetchJson: async () => { throw new Error('fetchJson should not be called'); },
    },
  );
  pass('workable.fetch() reaches fetchText on the happy path (allowed hostname)');

  // fetch() rejects an unresolvable careers_url (no apply.workable.com match in URL).
  let rejected = false;
  try {
    await workable.fetch(
      { name: 'BadUrl', careers_url: 'https://evil.com/totally-not-workable' },
      {
        transport: 'http',
        fetchText: async () => { throw new Error('SSRF! should not reach here'); },
        fetchJson: async () => { throw new Error('SSRF! should not reach here'); },
      },
    );
  } catch (e) {
    if (e.message.includes('cannot derive feed URL')) {
      rejected = true;
    } else {
      fail(`workable.fetch() rejected with wrong error: ${e.message}`);
    }
  }
  if (rejected) pass('workable.fetch() rejects unresolvable careers_url before fetch');
  else fail('workable.fetch() should throw cannot-derive-feed-URL for non-Workable URLs');

  // SSRF: malicious URL with apply.workable.com in the PATH (not hostname) must not be detected as Workable.
  // With strict URL parsing, the hostname `evil.example` fails the check and detect() returns null.
  if (workable.detect({ name: 'Spoof', careers_url: 'https://evil.example/apply.workable.com/slug' }) === null) {
    pass('workable.detect() rejects path-spoofed URLs (apply.workable.com in path, not hostname)');
  } else {
    fail('workable.detect() must NOT misdetect URLs that contain apply.workable.com in the path');
  }

  // careers_url with non-string value (e.g. YAML mistake passing a number) → detect() returns null without crashing
  if (workable.detect({ name: 'X', careers_url: 42 }) === null) {
    pass('workable.detect() returns null for non-string careers_url (42)');
  } else {
    fail('workable.detect() should treat non-string careers_url as missing');
  }

  // Workable parser tolerates a title with a stray pipe — URL is extracted from the line, not cols[7]
  const strayPipeMd = [
    '| Title | Department | Location | Type | Salary | Posted | Details |',
    '|---|---|---|---|---|---|---|',
    '| Senior PM (full | part-time) | Product | Remote | Full-time | — | 2026-04-01 | [View](https://apply.workable.com/x/jobs/view/PIPE.md) |',
  ].join('\n');
  const strayJobs = parseWorkableMarkdown(strayPipeMd, 'X');
  if (strayJobs.length === 1 && strayJobs[0].url === 'https://apply.workable.com/x/jobs/view/PIPE') {
    pass('parseWorkableMarkdown extracts URL from line-level regex (survives stray pipes in title)');
  } else {
    fail(`stray-pipe row not handled correctly: ${JSON.stringify(strayJobs)}`);
  }

  // Off-domain [View] link is dropped (URL validation)
  const offDomainMd = [
    '| Title | Department | Location | Type | Salary | Posted | Details |',
    '|---|---|---|---|---|---|---|',
    '| Good Role | Product | Remote | Full-time | — | 2026-04-01 | [View](https://apply.workable.com/x/jobs/view/ABC.md) |',
    '| Evil Role | Product | Remote | Full-time | — | 2026-04-01 | [View](https://evil.example/jobs/view/X) |',
    '| Insecure Role | Product | Remote | Full-time | — | 2026-04-01 | [View](http://apply.workable.com/x/jobs/view/Y.md) |',
  ].join('\n');
  const filteredJobs = parseWorkableMarkdown(offDomainMd, 'X');
  if (filteredJobs.length === 1 && filteredJobs[0].title === 'Good Role') {
    pass('parseWorkableMarkdown drops off-domain and non-https [View] links');
  } else {
    fail(`expected only "Good Role" through, got ${JSON.stringify(filteredJobs.map(j => j.title))}`);
  }

} catch (e) {
  fail(`workable provider tests crashed: ${e.message}`);
}

// ── 13. PROVIDERS — SmartRecruiters ─────────────────────────────────

console.log('\n13. Provider — smartrecruiters');

try {
  const sr = (await import(pathToFileURL(join(ROOT, 'providers/smartrecruiters.mjs')).href)).default;
  const { parseSmartRecruitersResponse } = await import(pathToFileURL(join(ROOT, 'providers/smartrecruiters.mjs')).href);

  if (sr.id === 'smartrecruiters') pass('smartrecruiters.id is "smartrecruiters"');
  else fail(`smartrecruiters.id is ${JSON.stringify(sr.id)}`);

  const hitCareers = sr.detect({ name: 'Adyen', careers_url: 'https://careers.smartrecruiters.com/adyen' });
  if (hitCareers && hitCareers.url.startsWith('https://api.smartrecruiters.com/v1/companies/adyen/postings')) {
    pass('smartrecruiters.detect() resolves careers.smartrecruiters.com/<slug> → api URL');
  } else {
    fail(`smartrecruiters.detect(careers) returned ${JSON.stringify(hitCareers)}`);
  }

  const hitJobs = sr.detect({ name: 'X', careers_url: 'https://jobs.smartrecruiters.com/x' });
  if (hitJobs && hitJobs.url.startsWith('https://api.smartrecruiters.com/v1/companies/x/postings')) {
    pass('smartrecruiters.detect() also handles jobs.smartrecruiters.com');
  } else {
    fail(`smartrecruiters.detect(jobs) returned ${JSON.stringify(hitJobs)}`);
  }

  if (sr.detect({ name: 'X', careers_url: 'https://example.com/careers' }) === null) {
    pass('smartrecruiters.detect() returns null for non-SR URLs');
  } else {
    fail('smartrecruiters.detect() should return null for non-SR URLs');
  }

  // parseSmartRecruitersResponse
  const sample = {
    content: [
      {
        id: 'abc-123',
        name: 'Senior PM',
        ref: 'https://api.smartrecruiters.com/v1/companies/sgs/postings/abc-123',
        location: { fullLocation: 'Geneva, Switzerland', remote: false },
      },
      {
        id: 'def-456',
        name: 'Remote AI Engineer',
        ref: 'https://api.smartrecruiters.com/v1/companies/sgs/postings/def-456',
        location: { city: 'Paris', country: 'France', remote: true },
      },
      {
        id: 'ghi-789',
        name: 'No-ref Role',
        location: { fullLocation: 'Berlin, Germany' },
      },
    ],
  };
  const jobs = parseSmartRecruitersResponse(sample, 'SGS');
  if (jobs.length === 3) pass('parseSmartRecruitersResponse extracts 3 jobs');
  else fail(`parseSmartRecruitersResponse returned ${jobs.length} jobs`);

  if (jobs[0]?.location === 'Geneva, Switzerland' && jobs[0]?.title === 'Senior PM') {
    pass('parseSmartRecruitersResponse uses fullLocation when present');
  } else {
    fail(`row 0 = ${JSON.stringify(jobs[0])}`);
  }

  if (jobs[1]?.location === 'Paris, France, Remote') {
    pass('parseSmartRecruitersResponse builds location from city/country/remote when no fullLocation');
  } else {
    fail(`row 1 location = ${JSON.stringify(jobs[1]?.location)}, expected "Paris, France, Remote"`);
  }

  if (jobs[0]?.url === 'https://jobs.smartrecruiters.com/sgs/postings/abc-123') {
    pass('parseSmartRecruitersResponse rewrites api.smartrecruiters.com → jobs.smartrecruiters.com');
  } else {
    fail(`row 0 url = ${JSON.stringify(jobs[0]?.url)}`);
  }

  if (jobs[2]?.url && jobs[2].url.startsWith('https://jobs.smartrecruiters.com/sgs/ghi-789')) {
    pass('parseSmartRecruitersResponse falls back to synthetic URL when ref is missing');
  } else {
    fail(`row 2 url = ${JSON.stringify(jobs[2]?.url)}`);
  }

  // Empty input safety
  if (parseSmartRecruitersResponse({}, 'X').length === 0) pass('empty {} input → empty result');
  else fail('empty {} input should yield empty result');

  if (parseSmartRecruitersResponse({ content: 'not an array' }, 'X').length === 0) {
    pass('non-array content → empty result (no crash)');
  } else {
    fail('non-array content should yield empty result');
  }

  // careers_url with non-string value → detect() returns null without crashing
  if (sr.detect({ name: 'X', careers_url: { foo: 'bar' } }) === null) {
    pass('smartrecruiters.detect() returns null for non-string careers_url (object)');
  } else {
    fail('smartrecruiters.detect() should treat non-string careers_url as missing');
  }

  // Fallback URL when both ref AND id are missing → empty string (not "undefined" in URL)
  const noRefNoId = parseSmartRecruitersResponse(
    { content: [{ name: 'Stranded Role' }] },
    'X',
  );
  if (noRefNoId.length === 1 && noRefNoId[0].url === '') {
    pass('parseSmartRecruitersResponse returns url="" when both ref and id are missing');
  } else {
    fail(`expected url='' when ref+id both missing, got ${JSON.stringify(noRefNoId[0])}`);
  }

  // SSRF: malicious URL with smartrecruiters hostname in the PATH (not host) must not be detected.
  if (sr.detect({ name: 'Spoof', careers_url: 'https://evil.example/careers.smartrecruiters.com/slug' }) === null) {
    pass('smartrecruiters.detect() rejects path-spoofed URLs');
  } else {
    fail('smartrecruiters.detect() must NOT misdetect path-spoofed URLs');
  }

  // SmartRecruiters: untrusted j.ref host falls through to fallback rather than rewriting
  const bogusRef = parseSmartRecruitersResponse(
    { content: [{ id: 'X1', name: 'Strange Role', ref: 'https://evil.example/v1/companies/x/postings/X1' }] },
    'TestCo',
  );
  if (bogusRef[0]?.url && !bogusRef[0].url.includes('evil.example')) {
    pass('parseSmartRecruitersResponse rejects untrusted j.ref host (falls through to fallback)');
  } else {
    fail(`untrusted j.ref leaked into url: ${JSON.stringify(bogusRef[0]?.url)}`);
  }

  // SmartRecruiters: companyName with spaces/symbols is slugified for the fallback URL
  const slugifiedCompany = parseSmartRecruitersResponse(
    { content: [{ id: 'X2', name: 'Strange Role' }] },
    'My Acme & Co.',
  );
  if (slugifiedCompany[0]?.url === 'https://jobs.smartrecruiters.com/my-acme-co/X2-strange-role') {
    pass('parseSmartRecruitersResponse slugifies the companyName for the fallback URL');
  } else {
    fail(`fallback URL not properly slugified: ${JSON.stringify(slugifiedCompany[0]?.url)}`);
  }

  // Pagination: fetch() loops until an empty page (or short page) is returned
  let pageRequests = 0;
  const pagedJobs = await sr.fetch(
    { name: 'PagedCo', careers_url: 'https://careers.smartrecruiters.com/paged' },
    {
      transport: 'http',
      fetchText: async () => { throw new Error('fetchText should not be called'); },
      fetchJson: async (url) => {
        pageRequests++;
        const offset = parseInt(new URL(url).searchParams.get('offset') || '0', 10);
        if (offset === 0) {
          // Page 1: full page (100 items)
          return { content: Array.from({ length: 100 }, (_, i) => ({ id: `P1-${i}`, name: `Role 1-${i}` })) };
        }
        if (offset === 100) {
          // Page 2: short page (50 items) → loop stops after this
          return { content: Array.from({ length: 50 }, (_, i) => ({ id: `P2-${i}`, name: `Role 2-${i}` })) };
        }
        // Should not be reached because page 2 was short
        return { content: [] };
      },
    },
  );
  if (pageRequests === 2 && pagedJobs.length === 150) {
    pass('smartrecruiters.fetch() paginates and aggregates results (2 pages → 150 total)');
  } else {
    fail(`pagination: pageRequests=${pageRequests}, total=${pagedJobs.length} (expected 2 requests / 150 results)`);
  }

  // Pagination stop condition: empty content terminates the loop
  let emptyPageRequests = 0;
  const emptyJobs = await sr.fetch(
    { name: 'EmptyCo', careers_url: 'https://careers.smartrecruiters.com/empty' },
    {
      transport: 'http',
      fetchText: async () => { throw new Error('fetchText should not be called'); },
      fetchJson: async () => {
        emptyPageRequests++;
        return { content: [] };
      },
    },
  );
  if (emptyPageRequests === 1 && emptyJobs.length === 0) {
    pass('smartrecruiters.fetch() stops on the first empty page');
  } else {
    fail(`empty pagination: requests=${emptyPageRequests}, total=${emptyJobs.length}`);
  }

} catch (e) {
  fail(`smartrecruiters provider tests crashed: ${e.message}`);
}

// ── 14. PROVIDERS — Recruitee ───────────────────────────────────────

console.log('\n14. Provider — recruitee');

try {
  const recruitee = (await import(pathToFileURL(join(ROOT, 'providers/recruitee.mjs')).href)).default;
  const { parseRecruiteeResponse } = await import(pathToFileURL(join(ROOT, 'providers/recruitee.mjs')).href);

  if (recruitee.id === 'recruitee') pass('recruitee.id is "recruitee"');
  else fail(`recruitee.id is ${JSON.stringify(recruitee.id)}`);

  const hit = recruitee.detect({ name: 'Channable', careers_url: 'https://channable.recruitee.com' });
  if (hit && hit.url === 'https://channable.recruitee.com/api/offers/') {
    pass('recruitee.detect() resolves <slug>.recruitee.com → api offers');
  } else {
    fail(`recruitee.detect() returned ${JSON.stringify(hit)}`);
  }

  if (recruitee.detect({ name: 'X', careers_url: 'https://example.com/careers' }) === null) {
    pass('recruitee.detect() returns null for non-recruitee URLs');
  } else {
    fail('recruitee.detect() should return null for non-recruitee URLs');
  }

  // parseRecruiteeResponse
  const sample = {
    offers: [
      { title: 'Senior PM', careers_url: 'https://channable.recruitee.com/o/senior-pm', city: 'Utrecht', country: 'Netherlands', remote: false },
      { title: 'Backend Eng', url: 'https://channable.recruitee.com/o/backend', city: 'Amsterdam', country: 'Netherlands', remote: true },
      { title: 'AI Lead', location: 'Remote, EMEA' },
    ],
  };
  const jobs = parseRecruiteeResponse(sample, 'Channable');
  if (jobs.length === 3) pass('parseRecruiteeResponse extracts 3 offers');
  else fail(`parseRecruiteeResponse returned ${jobs.length} offers`);

  if (jobs[0]?.title === 'Senior PM' && jobs[0]?.company === 'Channable' && jobs[0]?.url === 'https://channable.recruitee.com/o/senior-pm') {
    pass('parseRecruiteeResponse prefers careers_url field over url');
  } else {
    fail(`row 0 = ${JSON.stringify(jobs[0])}`);
  }

  if (jobs[1]?.location === 'Amsterdam, Netherlands, Remote') {
    pass('parseRecruiteeResponse assembles city/country/remote when no location field');
  } else {
    fail(`row 1 location = ${JSON.stringify(jobs[1]?.location)}, expected "Amsterdam, Netherlands, Remote"`);
  }

  if (jobs[2]?.location === 'Remote, EMEA') {
    pass('parseRecruiteeResponse uses explicit location field when present');
  } else {
    fail(`row 2 location = ${JSON.stringify(jobs[2]?.location)}`);
  }

  if (parseRecruiteeResponse({}, 'X').length === 0) pass('empty {} → empty result');
  else fail('empty {} should yield empty result');

  if (parseRecruiteeResponse({ offers: null }, 'X').length === 0) {
    pass('null offers → empty result (no crash)');
  } else {
    fail('null offers should yield empty result');
  }

  // careers_url with non-string value → detect() returns null without crashing
  if (recruitee.detect({ name: 'X', careers_url: null }) === null && recruitee.detect({ name: 'X', careers_url: 7 }) === null) {
    pass('recruitee.detect() returns null for non-string careers_url (null and 7)');
  } else {
    fail('recruitee.detect() should treat non-string careers_url as missing');
  }

  // SSRF: malicious URL with recruitee.com in the PATH (not host) must not be detected.
  if (recruitee.detect({ name: 'Spoof', careers_url: 'https://evil.example/channable.recruitee.com/foo' }) === null) {
    pass('recruitee.detect() rejects path-spoofed URLs');
  } else {
    fail('recruitee.detect() must NOT misdetect path-spoofed URLs');
  }

  // Per-offer URL validation: custom-domain https URLs are KEPT (Recruitee
  // tenants serve postings on their own domain, e.g. careers.hostaway.com);
  // only non-https and malformed/missing URLs are dropped. The per-offer URL
  // is display-only and not host-locked to *.recruitee.com — see #recruitee.
  const offerUrlOffers = parseRecruiteeResponse(
    {
      offers: [
        { title: 'Recruitee domain', careers_url: 'https://channable.recruitee.com/o/good' },
        { title: 'Custom domain', careers_url: 'https://careers.hostaway.com/o/senior-backend' },
        { title: 'Insecure', careers_url: 'http://channable.recruitee.com/o/insecure' },
        { title: 'No URL field' },
      ],
    },
    'Channable',
  );
  if (offerUrlOffers[0]?.url === 'https://channable.recruitee.com/o/good' && offerUrlOffers[1]?.url === 'https://careers.hostaway.com/o/senior-backend' && offerUrlOffers[2]?.url === '' && offerUrlOffers[3]?.url === '') {
    pass('parseRecruiteeResponse keeps custom-domain https URLs, drops non-https and missing');
  } else {
    fail(`URL validation: row0=${JSON.stringify(offerUrlOffers[0]?.url)}, row1=${JSON.stringify(offerUrlOffers[1]?.url)}, row2=${JSON.stringify(offerUrlOffers[2]?.url)}, row3=${JSON.stringify(offerUrlOffers[3]?.url)}`);
  }

} catch (e) {
  fail(`recruitee provider tests crashed: ${e.message}`);
}

// ── 12. TRACKER REPORT LINK NORMALIZATION (#760) ────────────────

console.log('\n12. Tracker report-link normalization');

try {
  const { normalizeReportLink } = await import(pathToFileURL(join(ROOT, 'tracker-links.mjs')).href);
  const repo = '/repo';
  const dataDir = join(repo, 'data');

  // data/ layout: root-relative TSV link → ../reports/...
  const fromTsv = normalizeReportLink('[12](reports/012-acme-2026-01-04.md)', dataDir, repo);
  if (fromTsv === '[12](../reports/012-acme-2026-01-04.md)') {
    pass('data/ layout: root-relative link rewritten to ../reports/...');
  } else {
    fail(`data/ layout normalization wrong: ${fromTsv}`);
  }

  // Idempotent: re-running on an already-normalized link must not double-prefix
  const twice = normalizeReportLink(fromTsv, dataDir, repo);
  if (twice === fromTsv) {
    pass('normalization is idempotent (no double-prefix on re-run)');
  } else {
    fail(`normalization not idempotent: ${twice}`);
  }

  // Root layout: tracker at repo root → link stays reports/...
  const atRoot = normalizeReportLink('[12](reports/012-acme-2026-01-04.md)', repo, repo);
  if (atRoot === '[12](reports/012-acme-2026-01-04.md)') {
    pass('root layout: link stays root-relative reports/...');
  } else {
    fail(`root layout normalization wrong: ${atRoot}`);
  }

  // Non-report links are left untouched — including external URLs that happen
  // to contain an embedded "/reports/" segment (must not be rewritten).
  const other = normalizeReportLink('[site](https://example.com/reports/foo.md)', dataDir, repo);
  if (other === '[site](https://example.com/reports/foo.md)') {
    pass('non-report links (incl. URLs with embedded /reports/) are left untouched');
  } else {
    fail(`non-report link altered: ${other}`);
  }

  const pipelineProcessed = normalizeReportLink('[12](reports/012-acme-2026-01-04.md)', join(repo, 'data'), repo);
  if (pipelineProcessed === '[12](../reports/012-acme-2026-01-04.md)') {
    pass('pipeline processed links are relative to data/pipeline.md (#1126)');
  } else {
    fail(`pipeline processed link normalization wrong (#1126): ${pipelineProcessed}`);
  }

  // End-to-end migration against a fictional fixture tracker (no personal data)
  const tmpDir = mkdtempSync(join(tmpdir(), 'career-ops-migrate-'));
  try {
    mkdirSync(join(tmpDir, 'data'));
    mkdirSync(join(tmpDir, 'reports'));
    writeFileSync(join(tmpDir, 'reports', '012-acme-2026-01-04.md'), '# fixture\n');
    const tracker = join(tmpDir, 'data', 'applications.md');
    writeFileSync(tracker,
      '# Applications Tracker\n\n' +
      '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n' +
      '|---|------|---------|------|-------|--------|-----|--------|-------|\n' +
      '| 12 | 2026-01-04 | Acme | Engineer | 4.2/5 | Evaluated | ✅ | [12](reports/012-acme-2026-01-04.md) | ok |\n');

    // Migrate by pointing the script at the fixture tracker via env override.
    run(NODE, ['merge-tracker.mjs', '--migrate'], { env: { ...process.env, CAREER_OPS_TRACKER: tracker } });
    const after = readFileSync(tracker, 'utf-8');
    if (after.includes('[12](../reports/012-acme-2026-01-04.md)')) {
      pass('migration rewrites fixture tracker links to ../reports/...');
    } else {
      fail('migration did not rewrite fixture tracker link');
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  const { resolveReportPath } = await import(pathToFileURL(join(ROOT, 'followup-cadence.mjs')).href);
  const followupTmp = mkdtempSync(join(tmpdir(), 'career-ops-followup-link-'));
  try {
    mkdirSync(join(followupTmp, 'data'), { recursive: true });
    mkdirSync(join(followupTmp, 'reports'), { recursive: true });
    const reportFile = join(followupTmp, 'reports', '012-acme-2026-01-04.md');
    writeFileSync(reportFile, '# fixture\n');
    const appsFile = join(followupTmp, 'data', 'applications.md');
    const resolved = resolveReportPath('[12](../reports/012-acme-2026-01-04.md)', appsFile, followupTmp);
    if (resolved === 'reports/012-acme-2026-01-04.md') {
      pass('follow-up reportPath is repo-root relative for data/ tracker links (#1126)');
    } else {
      fail(`follow-up reportPath wrong (#1126): ${resolved}`);
    }
    const escaped = resolveReportPath('[99](../../outside.md)', appsFile, followupTmp);
    if (escaped === null) {
      pass('follow-up reportPath rejects links outside reports/ (#1126)');
    } else {
      fail(`follow-up reportPath allowed escaped link (#1126): ${escaped}`);
    }
  } finally {
    rmSync(followupTmp, { recursive: true, force: true });
  }
} catch (e) {
  fail(`tracker-link normalization tests crashed: ${e.message}`);
}

// ── SHARED ROLE MATCHER + DEDUP-TRACKER SAFETY (#947) ───────────
// dedup-tracker.mjs used to ship an older fuzzy role matcher than
// merge-tracker.mjs. That weaker matcher collapsed sibling roles at the same
// company when they shared generic title words such as "Full Stack Engineer",
// and could delete an already-Applied row because data/applications.md is
// normally gitignored. The matcher is now shared, and dedup protects advanced
// application states from fuzzy-only deletion.
console.log('\n🧪 Testing shared role matcher and dedup-tracker safety...');
try {
  const { roleFuzzyMatch } = await import(pathToFileURL(join(ROOT, 'role-matcher.mjs')).href);

  if (!roleFuzzyMatch('Full Stack Engineer, Foundation', 'Full Stack Engineer, Guarded Releases')) {
    pass('role matcher keeps Full Stack Engineer sibling teams distinct (#947)');
  } else {
    fail('role matcher still collapses distinct Full Stack Engineer sibling teams');
  }

  if (!roleFuzzyMatch('Staff Software Engineer, API', 'Staff Software Engineer, SDK')) {
    pass('role matcher keeps short-acronym sibling teams distinct');
  } else {
    fail('role matcher collapsed API and SDK sibling teams');
  }

  if (roleFuzzyMatch('Staff Software Engineer, API', 'Staff Software Engineer, API Platform')) {
    pass('role matcher still uses short specialty acronyms for true overlaps');
  } else {
    fail('role matcher ignored a real short-acronym overlap');
  }

  const dedupTmp = mkdtempSync(join(tmpdir(), 'career-ops-dedup-'));
  try {
    mkdirSync(join(dedupTmp, 'data'));
    const tracker = join(dedupTmp, 'data', 'applications.md');
    writeFileSync(tracker,
      '# Applications Tracker\n\n' +
      '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n' +
      '|---|------|---------|------|-------|--------|-----|--------|-------|\n' +
      '| 21 | 2026-01-08 | Acme | Full Stack Engineer, Foundation | 3.9/5 | Applied | ❌ | [21](../reports/021-foundation.md) | applied sibling |\n' +
      '| 22 | 2026-01-08 | Acme | Full Stack Engineer, Guarded Releases | 4.3/5 | Evaluated | ❌ | [22](../reports/022-guarded.md) | evaluated sibling |\n' +
      '| 23 | 2026-01-08 | Acme | Staff Software Engineer, API | 4.0/5 | Evaluated | ❌ | [23](../reports/023-api.md) | acronym sibling |\n' +
      '| 24 | 2026-01-08 | Acme | Staff Software Engineer, SDK | 4.2/5 | Evaluated | ❌ | [24](../reports/024-sdk.md) | acronym sibling |\n' +
      '| 25 | 2026-01-08 | Acme | Product Engineer, Growth | 3.8/5 | Evaluated | ❌ | [25](../reports/025-growth-old.md) | duplicate old |\n' +
      '| 26 | 2026-01-09 | Acme | Product Engineer, Growth | 4.0/5 | Evaluated | ❌ | [26](../reports/026-growth-new.md) | duplicate new |\n' +
      '| 27 | 2026-01-08 | Acme | Solutions Engineer, Revenue | 3.0/5 | Applied | ❌ | [27](../reports/027-revenue-applied.md) | applied exact-title row |\n' +
      '| 28 | 2026-01-09 | Acme | Solutions Engineer, Revenue | 4.6/5 | Evaluated | ❌ | [28](../reports/028-revenue-eval.md) | evaluated exact-title row |\n' +
      '| 29 | 2026-01-08 | Acme | Data Engineer, Search | 3.1/5 | Applied | ❌ | [29](../reports/029-search-old.md) | malformed duplicate-number old row |\n' +
      '| 29 | 2026-01-09 | Acme | Data Engineer, Search | 4.1/5 | Evaluated | ❌ | [30](../reports/030-search-new.md) | malformed duplicate-number new row |\n');

    const dedupResult = run(NODE, ['dedup-tracker.mjs'], { env: { ...process.env, CAREER_OPS_TRACKER: tracker } });
    if (dedupResult === null) {
      fail('dedup-tracker.mjs crashed during shared role matcher safety test');
    } else {
      const deduped = readFileSync(tracker, 'utf-8');

      if (deduped.includes('Full Stack Engineer, Foundation') && deduped.includes('Full Stack Engineer, Guarded Releases')) {
        pass('dedup-tracker preserves distinct Full Stack Engineer sibling rows');
      } else {
        fail('dedup-tracker removed a distinct Full Stack Engineer sibling row');
      }

      if (deduped.includes('Staff Software Engineer, API') && deduped.includes('Staff Software Engineer, SDK')) {
        pass('dedup-tracker preserves short-acronym sibling rows');
      } else {
        fail('dedup-tracker removed a short-acronym sibling row');
      }

      const growthRows = deduped.split('\n').filter(l => l.includes('Product Engineer, Growth'));
      if (growthRows.length === 1 && growthRows[0].includes('4.0/5')) {
        pass('dedup-tracker still removes a real duplicate evaluated row');
      } else {
        fail(`dedup-tracker duplicate handling broken: ${growthRows.length} Growth rows`);
      }

      const revenueRows = deduped.split('\n').filter(l => l.includes('Solutions Engineer, Revenue'));
      if (revenueRows.length === 2 && revenueRows.some(l => l.includes('Applied'))) {
        pass('dedup-tracker never removes Applied+ rows by fuzzy title match');
      } else {
        fail('dedup-tracker removed an Applied+ row by fuzzy title match');
      }

      const searchRows = deduped.split('\n').filter(l => l.includes('Data Engineer, Search'));
      if (searchRows.length === 1 && searchRows[0].includes('4.1/5') && searchRows[0].includes('Applied')) {
        pass('dedup-tracker handles duplicate tracker numbers using row-local line indexes');
      } else {
        fail(`dedup-tracker duplicate-number handling broken: ${searchRows.length} Search rows`);
      }
    }
  } finally {
    rmSync(dedupTmp, { recursive: true, force: true });
  }
} catch (e) {
  fail(`shared role matcher / dedup safety tests crashed: ${e.message}`);
}

// dedup-tracker / normalize-statuses rebuilt promoted rows with
// `parts.slice(1, -1)`, which assumes the closing `|` produced a trailing empty
// cell. A valid row written WITHOUT a trailing pipe keeps its real last cell
// (the notes) at the end, so the old reconstruction silently dropped the notes
// when promoting a keeper's status during dedup. rebuildRow() now preserves it.
console.log('\n🧪 Testing dedup row rebuild preserves notes on no-trailing-pipe rows...');
try {
  const rebuildTmp = mkdtempSync(join(tmpdir(), 'career-ops-rebuild-'));
  try {
    mkdirSync(join(rebuildTmp, 'data'));
    const tracker = join(rebuildTmp, 'data', 'applications.md');
    // Keeper row #50 has the higher score AND no trailing pipe; dup #51 carries a
    // more-advanced status (both below Applied, so the advanced-status safety
    // guard doesn't block the collapse), so dedup promotes #50's status and
    // rewrites the row — exercising rebuildRow() on a no-trailing-pipe row.
    writeFileSync(tracker,
      '# Applications Tracker\n\n' +
      '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n' +
      '|---|------|---------|------|-------|--------|-----|--------|-------|\n' +
      '| 50 | 2026-02-01 | Globex | Widget Engineer | 4.5/5 | Rejected | ❌ | [50](../reports/050-widget.md) | KEEPER_NOTE_SENTINEL\n' +
      '| 51 | 2026-02-02 | Globex | Widget Engineer | 3.0/5 | Evaluated | ❌ | [51](../reports/051-widget.md) | dup row |\n');

    const r = run(NODE, ['dedup-tracker.mjs'], { env: { ...process.env, CAREER_OPS_TRACKER: tracker } });
    if (r === null) {
      fail('dedup-tracker.mjs crashed during notes-preservation test');
    } else {
      const out = readFileSync(tracker, 'utf-8');
      const keeperRow = out.split('\n').find(l => l.includes('| 50 |'));
      if (keeperRow && keeperRow.includes('KEEPER_NOTE_SENTINEL') && keeperRow.includes('Evaluated')) {
        pass('dedup row rebuild preserves the notes column on rows without a trailing pipe');
      } else {
        fail(`dedup row rebuild dropped notes / status on no-trailing-pipe row: "${keeperRow}"`);
      }
    }
  } finally {
    rmSync(rebuildTmp, { recursive: true, force: true });
  }
} catch (e) {
  fail(`dedup row-rebuild notes test crashed: ${e.message}`);
}

// rebuildRow() is now shared from tracker-utils.mjs (extracted from the two
// copies introduced in #1004). Unit-test the helper contract directly.
console.log('\n🧪 Testing shared tracker-utils rebuildRow()...');
try {
  const { rebuildRow } = await import(pathToFileURL(join(ROOT, 'tracker-utils.mjs')).href);
  const cellsOf = (line) => line.split('|').map(s => s.trim());

  // Trailing-pipe row → unchanged round-trip.
  const withPipe = '| 5 | 2026-02-01 | Acme | Eng | 4.0/5 | Applied | ❌ | [5](r.md) | note |';
  if (rebuildRow(cellsOf(withPipe)) === withPipe) {
    pass('rebuildRow round-trips a row that already has a trailing pipe');
  } else {
    fail(`rebuildRow changed a trailing-pipe row: "${rebuildRow(cellsOf(withPipe))}"`);
  }

  // No-trailing-pipe row → last cell (notes) preserved, trailing pipe added.
  const noPipe = '| 5 | 2026-02-01 | Acme | Eng | 4.0/5 | Applied | ❌ | [5](r.md) | keepme';
  const rebuilt = rebuildRow(cellsOf(noPipe));
  if (rebuilt.includes('keepme') && rebuilt.endsWith('|')) {
    pass('rebuildRow preserves the notes cell on a row without a trailing pipe');
  } else {
    fail(`rebuildRow dropped notes on no-trailing-pipe row: "${rebuilt}"`);
  }

  // Extra column (e.g. a custom Location) → every cell preserved.
  const extra = '| 5 | 2026-02-01 | Acme | Eng | Berlin | 4.0/5 | Applied | ❌ | [5](r.md) | note |';
  const rebuiltExtra = rebuildRow(cellsOf(extra));
  if (rebuiltExtra === extra && rebuiltExtra.includes('Berlin')) {
    pass('rebuildRow preserves extra columns (custom Location)');
  } else {
    fail(`rebuildRow mangled an extra-column row: "${rebuiltExtra}"`);
  }
} catch (e) {
  fail(`tracker-utils rebuildRow unit test crashed: ${e.message}`);
}

// #946/#954 header-name column mapping lived only in merge-tracker; followup-cadence,
// analyze-patterns and dedup-tracker still parsed by fixed index, so an inserted
// Location column mis-parsed (Location read as Score, etc.). The logic is now shared
// in tracker-parse.mjs and all four readers use it.
console.log('\n🧪 Testing shared tracker-parse column mapping...');
try {
  const { resolveColumns, parseTrackerRow, LEGACY_COLMAP } = await import(pathToFileURL(join(ROOT, 'tracker-parse.mjs')).href);

  const withLocation = [
    '| # | Date | Company | Role | Location | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|----------|-------|--------|-----|--------|-------|',
    '| 7 | 2026-06-28 | Acme | Eng | Berlin | 4.5/5 | Applied | ✅ | [7](r.md) | keep |',
  ];
  const cmLoc = resolveColumns(withLocation);
  const rowLoc = parseTrackerRow(withLocation[2], cmLoc);
  if (rowLoc && rowLoc.score === '4.5/5' && rowLoc.status === 'Applied' && rowLoc.location === 'Berlin') {
    pass('tracker-parse maps columns by header — inserted Location column does not shift Score/Status');
  } else {
    fail(`tracker-parse mis-parsed a Location-column row: ${JSON.stringify(rowLoc)}`);
  }

  const legacy = [
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    '| 8 | 2026-06-28 | Beta | PM | 3.0/5 | Evaluated | ❌ | [8](r.md) | n |',
  ];
  const rowLeg = parseTrackerRow(legacy[2], resolveColumns(legacy));
  if (rowLeg && rowLeg.score === '3.0/5' && rowLeg.status === 'Evaluated' && rowLeg.location === undefined) {
    pass('tracker-parse still parses the legacy fixed layout correctly');
  } else {
    fail(`tracker-parse broke the legacy layout: ${JSON.stringify(rowLeg)}`);
  }

  // No header row → falls back to legacy map; header/separator/stray rows → null.
  if (resolveColumns(['| 9 | … |']) === LEGACY_COLMAP &&
      parseTrackerRow(legacy[0], LEGACY_COLMAP) === null &&
      parseTrackerRow(legacy[1], LEGACY_COLMAP) === null &&
      parseTrackerRow('not a table row', LEGACY_COLMAP) === null) {
    pass('tracker-parse falls back to legacy map and rejects header/separator/non-rows');
  } else {
    fail('tracker-parse fallback / non-row rejection wrong');
  }
} catch (e) {
  fail(`tracker-parse unit test crashed: ${e.message}`);
}

// dedup-tracker reads AND writes by column; with a Location column its status
// promotion must target the Status cell, not fixed parts[6].
console.log('\n🧪 Testing dedup-tracker with an inserted Location column...');
try {
  const locTmp = mkdtempSync(join(tmpdir(), 'career-ops-dedup-loc-'));
  try {
    mkdirSync(join(locTmp, 'data'));
    const tracker = join(locTmp, 'data', 'applications.md');
    // Two dup rows (same company+role) with a Location column. Keeper #60 has the
    // higher score but the lower status; dedup must promote its Status cell.
    writeFileSync(tracker,
      '# Applications Tracker\n\n' +
      '| # | Date | Company | Role | Location | Score | Status | PDF | Report | Notes |\n' +
      '|---|------|---------|------|----------|-------|--------|-----|--------|-------|\n' +
      '| 60 | 2026-02-01 | Globex | Widget Engineer | Berlin | 4.5/5 | Rejected | ❌ | [60](r.md) | LOC_SENTINEL |\n' +
      '| 61 | 2026-02-02 | Globex | Widget Engineer | Berlin | 3.0/5 | Evaluated | ❌ | [61](r.md) | dup |\n');

    const r = run(NODE, ['dedup-tracker.mjs'], { env: { ...process.env, CAREER_OPS_TRACKER: tracker } });
    if (r === null) {
      fail('dedup-tracker crashed on a Location-column tracker');
    } else {
      const out = readFileSync(tracker, 'utf-8');
      const keeper = out.split('\n').find(l => l.includes('| 60 |'));
      // Status cell promoted to Evaluated; Location (Berlin) and the score untouched.
      if (keeper && keeper.includes('Berlin') && keeper.includes('4.5/5') && keeper.includes('Evaluated') && keeper.includes('LOC_SENTINEL')) {
        pass('dedup-tracker promotes the Status cell (not a fixed index) on a Location-column tracker');
      } else {
        fail(`dedup-tracker mis-handled a Location-column row: "${keeper}"`);
      }
    }
  } finally {
    rmSync(locTmp, { recursive: true, force: true });
  }
} catch (e) {
  fail(`dedup-tracker Location-column test crashed: ${e.message}`);
}

// ── MERGE-TRACKER FUZZY DEDUP (#751 / #721 family) ──────────────
// roleFuzzyMatch over-matched whenever the token overlap dominated the
// SMALLER side: two distinct roles sharing a long prefix ("Full-Stack
// Engineer 5, AI Insights & Visualizations" vs "Full Stack Engineer 5, Ads
// Reporting") or a brand token (#751: "UberEats Feed" vs "Consumer
// Fulfillment (UberEats)") collapsed onto one tracker row — silently
// dropping evaluations. The ratio now divides by the token UNION (true
// Jaccard): genuine reposts (identical token sets) still score 1.0, while
// distinct specialties fall below the 0.6 threshold.
console.log('\n🧪 Testing merge-tracker fuzzy dedup (distinct roles vs reposts)...');
try {
  const mergeTmp = mkdtempSync(join(tmpdir(), 'career-ops-merge-'));
  try {
    mkdirSync(join(mergeTmp, 'data'));
    mkdirSync(join(mergeTmp, 'reports'));
    const additionsDir = join(mergeTmp, 'additions');
    mkdirSync(additionsDir);
    const tracker = join(mergeTmp, 'data', 'applications.md');
    writeFileSync(tracker,
      '# Applications Tracker\n\n' +
      '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n' +
      '|---|------|---------|------|-------|--------|-----|--------|-------|\n' +
      '| 1 | 2026-01-04 | StreamCo | Full Stack Engineer 5, Ads Reporting | 4.4/5 | Evaluated | ❌ | [1](../reports/001-streamco-2026-01-04.md) | existing |\n' +
      '| 2 | 2026-01-04 | Uber | Senior Software Engineer, Consumer Fulfillment (UberEats) | 4.2/5 | Evaluated | ❌ | [2](../reports/002-uber-2026-01-04.md) | existing |\n');
    for (const n of ['001-streamco-2026-01-04', '002-uber-2026-01-04', '003-streamco-2026-01-05', '004-uber-2026-01-05', '005-streamco-2026-01-06']) {
      writeFileSync(join(mergeTmp, 'reports', `${n}.md`), '# fixture\n');
    }
    // Two DISTINCT roles (long shared prefix / shared brand token) + one true repost (score bump).
    writeFileSync(join(additionsDir, '003-streamco.tsv'),
      '3\t2026-01-05\tStreamCo\tFull-Stack Engineer 5, AI Insights & Visualizations\tEvaluated\t4.6/5\t❌\t[3](reports/003-streamco-2026-01-05.md)\tdistinct role\n');
    writeFileSync(join(additionsDir, '004-uber.tsv'),
      '4\t2026-01-05\tUber\tSenior Software Engineer, UberEats Feed\tEvaluated\t4.1/5\t❌\t[4](reports/004-uber-2026-01-05.md)\tdistinct team (#751)\n');
    writeFileSync(join(additionsDir, '005-streamco.tsv'),
      '5\t2026-01-06\tStreamCo\tFull Stack Engineer 5, Ads Reporting\tEvaluated\t4.5/5\t❌\t[5](reports/005-streamco-2026-01-06.md)\trepost\n');

    const mergeResult = run(NODE, ['merge-tracker.mjs'], { env: { ...process.env, CAREER_OPS_TRACKER: tracker, CAREER_OPS_ADDITIONS: additionsDir } });
    if (mergeResult === null) {
      fail('merge-tracker.mjs crashed during fuzzy dedup regression test');
    } else {
      const merged = readFileSync(tracker, 'utf-8');

      // Distinct role sharing a long prefix must be ADDED, not folded into the existing row.
      if (merged.includes('AI Insights & Visualizations') && merged.includes('Ads Reporting')) {
        pass('distinct roles with shared prefix kept as separate rows');
      } else {
        fail('distinct role with shared prefix was merged away (silent data loss)');
      }

      // #751 repro: different teams under one brand token must both survive.
      if (merged.includes('UberEats Feed') && merged.includes('Consumer Fulfillment')) {
        pass('brand-token roles (#751: UberEats Feed vs Consumer Fulfillment) kept separate');
      } else {
        fail('brand-token roles were deduped (#751 regression)');
      }

      // True repost (identical role tokens) must still UPDATE in place — exactly one row, score bumped.
      const adsRows = merged.split('\n').filter(l => l.includes('Ads Reporting'));
      if (adsRows.length === 1 && adsRows[0].includes('4.5/5')) {
        pass('true repost still updates the existing row in place (4.4 → 4.5, no duplicate)');
      } else {
        fail(`repost handling broken: ${adsRows.length} 'Ads Reporting' rows, expected 1 updated to 4.5/5`);
      }
    }
  } finally {
    rmSync(mergeTmp, { recursive: true, force: true });
  }
} catch (e) {
  fail(`merge-tracker fuzzy dedup tests crashed: ${e.message}`);
}

// ── MERGE-TRACKER REPORT-NUMBER COLLISION (#912) ─────────────────
// The report-number dedup check was not company-guarded: a TSV for NewCo
// with report [1] would find the existing tracker row [1] for OtherCo and
// update it in-place instead of appending NewCo as a new row.
console.log('\n🧪 Testing merge-tracker report-number cross-company collision (#912)...');
try {
  const col912Tmp = mkdtempSync(join(tmpdir(), 'career-ops-merge-912-'));
  try {
    mkdirSync(join(col912Tmp, 'data'));
    mkdirSync(join(col912Tmp, 'reports'));
    const col912Additions = join(col912Tmp, 'additions');
    mkdirSync(col912Additions);

    const col912Tracker = join(col912Tmp, 'data', 'applications.md');
    writeFileSync(col912Tracker,
      '# Applications Tracker\n\n' +
      '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n' +
      '|---|------|---------|------|-------|--------|-----|--------|-------|\n' +
      '| 1 | 2026-01-01 | OtherCo | Staff Engineer | 4.0/5 | Evaluated | ❌ | [1](../reports/001-otherco-2026-01-01.md) | original |\n');
    writeFileSync(join(col912Tmp, 'reports', '001-otherco-2026-01-01.md'), '# fixture\n');
    writeFileSync(join(col912Tmp, 'reports', '001-newco-2026-01-05.md'), '# fixture\n');

    // NewCo TSV also carries report number [1] — cross-company collision
    writeFileSync(join(col912Additions, '001-newco.tsv'),
      '1\t2026-01-05\tNewCo\tNew Role\tEvaluated\t2.7/5\t❌\t[1](reports/001-newco-2026-01-05.md)\tcollision\n');

    const col912Result = run(NODE, ['merge-tracker.mjs'], {
      env: { ...process.env, CAREER_OPS_TRACKER: col912Tracker, CAREER_OPS_ADDITIONS: col912Additions },
    });
    if (col912Result === null) {
      fail('merge-tracker crashed during report-number collision test (#912)');
    } else {
      const col912Merged = readFileSync(col912Tracker, 'utf-8');
      const col912Rows = col912Merged.split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| #') && !l.startsWith('|---'));
      const expectedOtherCoRow = '| 1 | 2026-01-01 | OtherCo | Staff Engineer | 4.0/5 | Evaluated | ❌ | [1](../reports/001-otherco-2026-01-01.md) | original |';

      if (col912Rows.length === 2) {
        pass('report-number collision (#912): merged tracker has exactly 2 rows');
      } else {
        fail(`report-number collision (#912): expected 2 rows, got ${col912Rows.length}`);
      }

      if (col912Rows.some(r => r.trim() === expectedOtherCoRow.trim())) {
        pass('report-number collision (#912): existing OtherCo row left untouched (exact match)');
      } else {
        fail('report-number collision (#912): OtherCo row was overwritten by NewCo addition');
      }

      const expectedNewCoRow = '| 2 | 2026-01-05 | NewCo | New Role | 2.7/5 | Evaluated | ❌ | [1](../reports/001-newco-2026-01-05.md) | collision |';
      if (col912Rows.some(r => r.trim() === expectedNewCoRow.trim())) {
        pass('report-number collision (#912): NewCo appended as a new entry with correct data');
      } else {
        fail('report-number collision (#912): NewCo entry was swallowed or has incorrect data');
      }
    }
  } finally {
    rmSync(col912Tmp, { recursive: true, force: true });
  }
} catch (e) {
  fail(`merge-tracker report-number collision test crashed: ${e.message}`);
}

// ── MERGE-TRACKER CONCURRENT WRITES (#781 follow-up) ─────────────────────
// Report-number reservation is atomic now (#803), but tracker merges are a
// separate read/modify/write step. If two merge-tracker processes read the same
// old applications.md snapshot and then write back independently, one process
// can erase the row added by the other. This fixture gives each process a
// different additions dir and pauses the first process after it has read the
// tracker, making the old race deterministic.
console.log('\n🧪 Testing merge-tracker concurrent writes...');
try {
  const mergeTmp = mkdtempSync(join(tmpdir(), 'career-ops-merge-lock-'));
  /**
   * Spawn one isolated `merge-tracker.mjs` process against the temporary fixture.
   *
   * Each spawned process receives the same tracker path and lock path but a
   * different additions directory. Without serialization, both processes can
   * read the same old tracker and the later write can lose the other row. The
   * first worker also sends an IPC readiness message after reading the tracker
   * and before its test hold, which lets the test launch the second worker at
   * the exact old race point instead of relying on scheduler timing.
   *
   * @param {string} additionsDir - Directory containing this process's TSV row.
   * @param {number} [holdMs=0] - Optional post-read delay injected into the merge.
   * @returns {{ready: Promise<void>, result: Promise<{code:number|null,stdout:string,stderr:string}>}}
   * Worker readiness and final process result promises.
   */
  function spawnMerge(additionsDir, holdMs = 0) {
    let markReady;
    let readyMarked = false;
    const ready = new Promise(resolve => { markReady = resolve; });
    const result = new Promise(resolve => {
      const child = spawn(NODE, ['merge-tracker.mjs'], {
        cwd: ROOT,
        env: {
          ...process.env,
          CAREER_OPS_TRACKER: join(mergeTmp, 'data', 'applications.md'),
          CAREER_OPS_ADDITIONS: additionsDir,
          CAREER_OPS_TRACKER_LOCK: join(mergeTmp, 'career-ops-merge-tracker-fixture.lock'),
          CAREER_OPS_MERGE_HOLD_MS: String(holdMs),
          CAREER_OPS_MERGE_READY_IPC: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      let stdout = '';
      let stderr = '';
      const resolveReady = () => {
        if (readyMarked) return;
        readyMarked = true;
        markReady();
      };
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('message', msg => {
        if (msg?.type === 'merge-tracker-ready') resolveReady();
      });
      child.on('error', err => {
        resolveReady();
        resolve({ code: -1, stdout, stderr: String(err) });
      });
      child.on('close', code => {
        resolveReady();
        resolve({ code, stdout, stderr });
      });
    });
    return { ready, result };
  }

  /**
   * Fail fast when a worker never reaches the deterministic race checkpoint.
   *
   * A missing readiness signal would otherwise hang the test suite. Timing out
   * turns that broken test contract into a normal assertion failure with a clear
   * message.
   *
   * @param {Promise<void>} ready - Worker readiness promise.
   * @param {number} timeoutMs - Maximum milliseconds to wait.
   * @returns {Promise<void>} Resolves when ready arrives before the timeout.
   */
  function waitForReady(ready, timeoutMs) {
    return Promise.race([
      ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('merge worker did not signal readiness')), timeoutMs)),
    ]);
  }

  try {
    mkdirSync(join(mergeTmp, 'data'));
    mkdirSync(join(mergeTmp, 'reports'));
    const additionsA = join(mergeTmp, 'additions-a');
    const additionsB = join(mergeTmp, 'additions-b');
    mkdirSync(additionsA);
    mkdirSync(additionsB);

    writeFileSync(join(mergeTmp, 'data', 'applications.md'),
      '# Applications Tracker\n\n' +
      '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n' +
      '|---|------|---------|------|-------|--------|-----|--------|-------|\n');
    writeFileSync(join(mergeTmp, 'reports', '010-alpha-2026-01-07.md'), '# fixture\n');
    writeFileSync(join(mergeTmp, 'reports', '011-beta-2026-01-07.md'), '# fixture\n');
    writeFileSync(join(additionsA, '010-alpha.tsv'),
      '10\t2026-01-07\tAlpha\tPlatform Engineer\tEvaluated\t4.1/5\t❌\t[10](reports/010-alpha-2026-01-07.md)\tfirst concurrent merge\n');
    writeFileSync(join(additionsB, '011-beta.tsv'),
      '11\t2026-01-07\tBeta\tData Engineer\tEvaluated\t4.2/5\t❌\t[11](reports/011-beta-2026-01-07.md)\tsecond concurrent merge\n');

    const first = spawnMerge(additionsA, 350);
    await waitForReady(first.ready, 2_000);
    const second = spawnMerge(additionsB, 0);
    const [firstResult, secondResult] = await Promise.all([first.result, second.result]);

    if (firstResult.code === 0 && secondResult.code === 0) {
      pass('concurrent merge processes both exited successfully');
    } else {
      fail(`concurrent merge process failed: first=${firstResult.code} second=${secondResult.code} stderr=${firstResult.stderr || secondResult.stderr}`);
    }

    const merged = readFileSync(join(mergeTmp, 'data', 'applications.md'), 'utf-8');
    if (merged.includes('Alpha') && merged.includes('Beta')) {
      pass('concurrent tracker merges preserve rows from both processes');
    } else {
      fail(`concurrent tracker merge lost a row: ${merged}`);
    }
  } finally {
    rmSync(mergeTmp, { recursive: true, force: true });
  }
} catch (e) {
  fail(`merge-tracker concurrent write test crashed: ${e.message}`);
}

// ── 12. COLD-START TRIGGER ──────────────────────────────────────

console.log('\n12. Cold-start trigger (deterministic onboarding state)');

try {
  // Virgin env: none of the 4 user-layer prerequisites present → must onboard.
  const virgin = mkdtempSync(join(tmpdir(), 'co-cold-'));
  const v = JSON.parse(run(NODE, ['doctor.mjs', '--json', '--target', virgin]) || '{}');
  if (
    v.onboardingNeeded === true &&
    Array.isArray(v.missing) &&
    v.missing.length === 4 &&
    Array.isArray(v.warnings)
  ) {
    pass('Virgin env → onboarding triggered (4 prerequisites missing)');
  } else {
    fail(`Virgin env not flagged for onboarding: ${JSON.stringify(v)}`);
  }
  rmSync(virgin, { recursive: true, force: true });

  // Fully provisioned env: all 4 present → must NOT onboard.
  const ready = mkdtempSync(join(tmpdir(), 'co-ready-'));
  mkdirSync(join(ready, 'config'), { recursive: true });
  mkdirSync(join(ready, 'modes'), { recursive: true });
  for (const f of ['cv.md', 'config/profile.yml', 'modes/_profile.md', 'portals.yml']) {
    writeFileSync(join(ready, f), 'x');
  }
  const r = JSON.parse(run(NODE, ['doctor.mjs', '--json', '--target', ready]) || '{}');
  if (r.onboardingNeeded === false && Array.isArray(r.warnings)) {
    pass('Provisioned env → no onboarding');
  } else {
    fail(`Provisioned env falsely flagged for onboarding: ${JSON.stringify(r)}`);
  }
  rmSync(ready, { recursive: true, force: true });

  const claudeDoc = readFile('CLAUDE.md');
  if (
    /node\s+doctor\.mjs\s+--json/.test(claudeDoc) &&
    /"warnings"\s*:\s*\[\.\.\.\]/.test(claudeDoc) &&
    !/Does\s+`cv\.md`\s+exist\?/i.test(claudeDoc)
  ) {
    pass('CLAUDE.md delegates onboarding state to doctor --json');
  } else {
    fail('CLAUDE.md still duplicates onboarding prerequisite checks');
  }
} catch (e) {
  fail(`Cold-start trigger test crashed: ${e.message}`);
}

// ── 15. TRACKER DERIVED INDEX (#918 phase 1) ────────────────────
// applications.md is the source of truth; applications.db is a derived index
// rebuilt from it. Round-trip md → db → md must be lossless for clean input
// (a hard condition from #918 before any phase-2 work), sync must DETECT
// corruption without ever modifying the markdown, and reads must never be
// stale.

console.log('\n15. Tracker derived index (sync/query/export round-trip)');

const sqliteAvailable = run(NODE, ['--no-warnings', '-e', "import('node:sqlite').then(()=>process.exit(0),()=>process.exit(1))"]) !== null;
if (!sqliteAvailable) {
  warn('node:sqlite unavailable (Node < 22.5) — tracker index tests skipped');
} else {
  try {
    const idxTmp = mkdtempSync(join(tmpdir(), 'career-ops-index-'));
    try {
      const md = join(idxTmp, 'applications.md');
      const env = { ...process.env, CAREER_OPS_TRACKER: md };
      const trackerRun = (args) => run(NODE, ['tracker.mjs', ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] });

      // 1. Round trip: clean canonical input must export byte-identical.
      const clean =
        '# Applications Tracker\n\n' +
        '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n' +
        '|---|------|---------|------|-------|--------|-----|--------|-------|\n' +
        '| 2 | 2026-01-05 | Beta | Designer | 4.0/5 | Applied | ✅ | [2](../reports/002-beta-2026-01-05.md) | second |\n' +
        '| 1 | 2026-01-04 | Acme | Engineer | 4.2/5 | Evaluated | ❌ | [1](../reports/001-acme-2026-01-04.md) | first |\n';
      writeFileSync(md, clean);
      if (trackerRun(['sync']) === null) {
        fail('tracker sync crashed on clean fixture');
      } else {
        const exported = trackerRun(['export']);
        if (exported === clean.trim()) {
          pass('round trip md → db → md is lossless on clean input');
        } else {
          fail('round trip is NOT lossless on clean input');
        }
        if (readFileSync(md, 'utf-8') === clean) {
          pass('sync/export never modify the source markdown');
        } else {
          fail('sync/export modified applications.md (source of truth violated)');
        }
      }

      // 2. Corruption is detected and normalized in the index ONLY.
      const corrupted = clean +
        '| 1 | 2026-01-06 | Gamma | PM | — | 3.5/5 | ❌ | 鈥? | drifted |\n'; // dup id + score in status + mojibake
      writeFileSync(md, corrupted);
      if (trackerRun(['sync', '--check']) === null) {
        pass('sync --check exits non-zero when corruption is present');
      } else {
        fail('sync --check did not flag corrupted fixture');
      }
      const queried = JSON.parse(trackerRun(['query', '--company', 'Gamma', '--json']) || '[]');
      if (queried.length === 1 && queried[0].status === 'Evaluated' && queried[0].score === '3.5/5' && queried[0].id === 3) {
        pass('corrupted row is normalized in the index (status/score/id repaired)');
      } else {
        fail(`corrupted row not normalized in index: ${JSON.stringify(queried)}`);
      }
      if (readFileSync(md, 'utf-8') === corrupted) {
        pass('corruption repair never touches the markdown itself');
      } else {
        fail('sync modified the corrupted markdown (must only diagnose)');
      }

      // 3. Staleness: query after an md edit must auto-resync (no stale reads).
      writeFileSync(md, clean +
        '| 3 | 2026-01-07 | Delta | Analyst | 4.5/5 | Applied | ✅ | [3](../reports/003-delta-2026-01-07.md) | new |\n');
      const fresh = JSON.parse(trackerRun(['query', '--company', 'Delta', '--json']) || '[]');
      if (fresh.length === 1) {
        pass('query auto-resyncs when applications.md changed since last sync');
      } else {
        fail('query served a stale index after the markdown changed');
      }

      // 4. Status transitions across syncs accumulate in status_events.
      writeFileSync(md, readFileSync(md, 'utf-8').replace('| 4.0/5 | Applied |', '| 4.0/5 | Interview |'));
      const log = trackerRun(['history', '--id', '2']);
      if (log && log.includes('Applied') && log.includes('Interview')) {
        pass('history records the Applied → Interview transition across syncs');
      } else {
        fail(`history missing status transition: ${log}`);
      }
    } finally {
      rmSync(idxTmp, { recursive: true, force: true });
    }
  } catch (e) {
    fail(`tracker derived-index tests crashed: ${e.message}`);
  }
}

// ── 12b. PLAYWRIGHT MCP DETECTION WARNING (#522) ────────────────

console.log('\n12d. Playwright MCP detection warning');

try {
  const doctorScript = readFile('doctor.mjs');
  if (
    !/Claude Code config/i.test(doctorScript) &&
    /project-level MCP config/i.test(doctorScript) &&
    /\.mcp\.json/.test(doctorScript) &&
    /\.claude\/settings\.json/.test(doctorScript) &&
    /\.claude\/settings\.local\.json/.test(doctorScript)
  ) {
    pass('doctor Playwright MCP guidance is agent-neutral and keeps conservative config detection');
  } else {
    fail('doctor Playwright MCP guidance is still Claude-specific or lost config detection');
  }

  // No project MCP config → doctor surfaces a (non-fatal) warning instead of
  // letting SPA job boards fail silently.
  const noMcp = mkdtempSync(join(tmpdir(), 'co-nomcp-'));
  const a = JSON.parse(run(NODE, ['doctor.mjs', '--json', '--target', noMcp]) || '{}');
  if (Array.isArray(a.warnings) && a.warnings.some((w) => /playwright mcp/i.test(w))) {
    pass('No Playwright MCP config → warning surfaced');
  } else {
    fail(`Expected a Playwright MCP warning, got: ${JSON.stringify(a.warnings)}`);
  }
  rmSync(noMcp, { recursive: true, force: true });

  // A project that registers a Playwright MCP server → no warning.
  const withMcp = mkdtempSync(join(tmpdir(), 'co-mcp-'));
  mkdirSync(join(withMcp, '.claude'), { recursive: true });
  writeFileSync(
    join(withMcp, '.claude', 'settings.json'),
    JSON.stringify({ mcpServers: { playwright: { command: 'npx', args: ['@playwright/mcp', '--headless'] } } }),
  );
  const b = JSON.parse(run(NODE, ['doctor.mjs', '--json', '--target', withMcp]) || '{}');
  if (Array.isArray(b.warnings) && !b.warnings.some((w) => /playwright mcp/i.test(w))) {
    pass('Playwright MCP configured → no warning');
  } else {
    fail(`Did not expect a Playwright MCP warning, got: ${JSON.stringify(b.warnings)}`);
  }
  rmSync(withMcp, { recursive: true, force: true });

  // Local Claude settings should also count as a valid MCP registration.
  const withLocalMcp = mkdtempSync(join(tmpdir(), 'co-local-mcp-'));
  mkdirSync(join(withLocalMcp, '.claude'), { recursive: true });
  writeFileSync(
    join(withLocalMcp, '.claude', 'settings.local.json'),
    JSON.stringify({ mcpServers: { browser: { command: 'npx', args: ['@playwright/mcp'] } } }),
  );
  const c = JSON.parse(run(NODE, ['doctor.mjs', '--json', '--target', withLocalMcp]) || '{}');
  if (Array.isArray(c.warnings) && !c.warnings.some((w) => /playwright mcp/i.test(w))) {
    pass('Playwright MCP configured via .claude/settings.local.json → no warning');
  } else {
    fail(`Did not expect a Playwright MCP warning for settings.local.json, got: ${JSON.stringify(c.warnings)}`);
  }
  rmSync(withLocalMcp, { recursive: true, force: true });
} catch (e) {
  fail(`Playwright MCP detection test crashed: ${e.message}`);
}

const applyModeText = readFile('modes/apply.md');
if (!/Claude can interact/i.test(applyModeText)) {
  pass('apply mode wording is agent-neutral');
} else {
  fail('apply mode still uses Claude-specific wording');
}

// ── 15. PROVIDERS — SolidJobs ─────────────────────────────────────

console.log('\n15. Provider — solidjobs');

try {
  const sj = (await import(pathToFileURL(join(ROOT, 'providers/solidjobs.mjs')).href)).default;

  if (sj.id === 'solidjobs') pass('solidjobs.id is "solidjobs"');
  else fail(`solidjobs.id is ${JSON.stringify(sj.id)}`);

  // detect() matches valid SolidJobs API URL
  const hit = sj.detect({ name: 'SJ', careers_url: 'https://solid.jobs/public-api/offers/it?campaign=career-ops' });
  if (hit && hit.url) pass('solidjobs.detect() matches valid API URL');
  else fail('solidjobs.detect() should match solid.jobs public-api URL');

  // detect() rejects non-SolidJobs URL
  if (sj.detect({ name: 'X', careers_url: 'https://example.com/jobs' }) === null) {
    pass('solidjobs.detect() rejects non-SolidJobs URL');
  } else {
    fail('solidjobs.detect() must reject non-SolidJobs URLs');
  }

  // detect() rejects path-spoofed URL (solid.jobs in path, not hostname)
  if (sj.detect({ name: 'X', careers_url: 'https://evil.example/solid.jobs/public-api/offers/it' }) === null) {
    pass('solidjobs.detect() rejects path-spoofed URLs');
  } else {
    fail('solidjobs.detect() must NOT misdetect URLs with solid.jobs in the path');
  }

  // detect() returns null for non-string careers_url
  if (sj.detect({ name: 'X', careers_url: 42 }) === null) {
    pass('solidjobs.detect() returns null for non-string careers_url (42)');
  } else {
    fail('solidjobs.detect() should treat non-string careers_url as missing');
  }

  // detect() returns null for missing careers_url
  if (sj.detect({ name: 'X' }) === null) {
    pass('solidjobs.detect() returns null for missing careers_url');
  } else {
    fail('solidjobs.detect() should return null when careers_url is missing');
  }

  // fetch() parses { jobs: [...] } response with company from API
  const fakeJobs = {
    jobs: [
      { title: 'Senior Dev', url: 'https://solid.jobs/o/abc123/career-ops', company: 'Acme Corp', locations: ['Warszawa', 'Remote'] },
      { title: 'Junior Dev', url: 'https://solid.jobs/o/def456/career-ops', company: 'Beta Inc', locations: ['Kraków'] },
    ],
  };
  const parsed = await sj.fetch(
    { name: 'SolidJobs IT', careers_url: 'https://solid.jobs/public-api/offers/it?campaign=career-ops' },
    { transport: 'http', fetchJson: async () => fakeJobs, fetchText: async () => '' },
  );
  if (parsed.length === 2) pass('solidjobs.fetch() returns 2 jobs from mock response');
  else fail(`solidjobs.fetch() returned ${parsed.length} jobs, expected 2`);

  if (parsed[0].company === 'Acme Corp') pass('solidjobs.fetch() uses j.company from API response');
  else fail(`solidjobs.fetch() company is ${JSON.stringify(parsed[0].company)}, expected "Acme Corp"`);

  if (parsed[0].location === 'Warszawa, Remote') pass('solidjobs.fetch() joins locations array');
  else fail(`solidjobs.fetch() location is ${JSON.stringify(parsed[0].location)}, expected "Warszawa, Remote"`);

  if (parsed[0].title === 'Senior Dev' && parsed[0].url === 'https://solid.jobs/o/abc123/career-ops') {
    pass('solidjobs.fetch() maps title and url correctly');
  } else {
    fail(`solidjobs.fetch() title/url wrong: ${JSON.stringify(parsed[0])}`);
  }

  // fetch() falls back to entry.name when j.company is missing
  const noCompanyJobs = { jobs: [{ title: 'Tester', url: 'https://solid.jobs/o/xyz/career-ops', locations: [] }] };
  const fallback = await sj.fetch(
    { name: 'SolidJobs IT', careers_url: 'https://solid.jobs/public-api/offers/it?campaign=career-ops' },
    { transport: 'http', fetchJson: async () => noCompanyJobs, fetchText: async () => '' },
  );
  if (fallback[0].company === 'SolidJobs IT') pass('solidjobs.fetch() falls back to entry.name when j.company missing');
  else fail(`solidjobs.fetch() fallback company is ${JSON.stringify(fallback[0].company)}`);

  // fetch() handles empty locations array
  if (fallback[0].location === '') pass('solidjobs.fetch() returns empty string for empty locations array');
  else fail(`solidjobs.fetch() location for empty array is ${JSON.stringify(fallback[0].location)}`);

  // fetch() rejects non-SolidJobs hostname (SSRF)
  let ssrfRejected = false;
  try {
    await sj.fetch(
      { name: 'Evil', careers_url: 'https://evil.com/public-api/offers/it' },
      { transport: 'http', fetchJson: async () => { throw new Error('SSRF! should not reach here'); }, fetchText: async () => '' },
    );
  } catch (e) {
    if (e.message.includes('untrusted hostname')) ssrfRejected = true;
    else fail(`solidjobs.fetch() rejected with wrong error: ${e.message}`);
  }
  if (ssrfRejected) pass('solidjobs.fetch() rejects untrusted hostname (SSRF protection)');
  else fail('solidjobs.fetch() should reject non-solid.jobs hostnames');

  // fetch() throws on missing careers_url
  let missingUrl = false;
  try {
    await sj.fetch(
      { name: 'No URL' },
      { transport: 'http', fetchJson: async () => ({}), fetchText: async () => '' },
    );
  } catch (e) {
    if (e.message.includes('careers_url required')) missingUrl = true;
    else fail(`solidjobs.fetch() missing URL error: ${e.message}`);
  }
  if (missingUrl) pass('solidjobs.fetch() throws on missing careers_url');
  else fail('solidjobs.fetch() should throw when careers_url is missing');

  // fetch() rejects HTTP (non-HTTPS) URL
  let httpRejected = false;
  try {
    await sj.fetch(
      { name: 'HTTP', careers_url: 'http://solid.jobs/public-api/offers/it' },
      { transport: 'http', fetchJson: async () => { throw new Error('should not reach here'); }, fetchText: async () => '' },
    );
  } catch (e) {
    if (e.message.includes('HTTPS')) httpRejected = true;
    else fail(`solidjobs.fetch() HTTP rejection wrong error: ${e.message}`);
  }
  if (httpRejected) pass('solidjobs.fetch() rejects HTTP URLs (HTTPS enforcement)');
  else fail('solidjobs.fetch() should reject non-HTTPS URLs');

  // fetch() rejects malformed/unparseable URL
  let malformedRejected = false;
  try {
    await sj.fetch(
      { name: 'Bad', careers_url: 'not-a-url' },
      { transport: 'http', fetchJson: async () => { throw new Error('should not reach here'); }, fetchText: async () => '' },
    );
  } catch (e) {
    if (e.message.includes('invalid URL')) malformedRejected = true;
    else fail(`solidjobs.fetch() malformed URL wrong error: ${e.message}`);
  }
  if (malformedRejected) pass('solidjobs.fetch() rejects malformed URLs');
  else fail('solidjobs.fetch() should reject unparseable URLs');

  // fetch() throws on unexpected API response (no jobs array)
  const badResponses = [
    [{}, 'empty object'],
    [{ jobs: null }, 'jobs: null'],
    [{ jobs: 'not-array' }, 'jobs: string'],
    [{ offers: [] }, 'wrong key name'],
    [null, 'null response'],
  ];
  for (const [resp, label] of badResponses) {
    let threw = false;
    try {
      await sj.fetch(
        { name: 'SolidJobs IT', careers_url: 'https://solid.jobs/public-api/offers/it?campaign=career-ops' },
        { transport: 'http', fetchJson: async () => resp, fetchText: async () => '' },
      );
    } catch (e) {
      if (e.message.includes('unexpected API response')) threw = true;
      else fail(`solidjobs.fetch() bad response (${label}) wrong error: ${e.message}`);
    }
    if (threw) pass(`solidjobs.fetch() throws on bad API response (${label})`);
    else fail(`solidjobs.fetch() should throw on bad API response (${label})`);
  }

  // fetch() filters out jobs with empty/missing url
  const mixedJobs = {
    jobs: [
      { title: 'Has URL', url: 'https://solid.jobs/o/1/career-ops', company: 'A', locations: [] },
      { title: 'No URL', url: '', company: 'B', locations: [] },
      { title: 'Missing URL', company: 'C', locations: [] },
    ],
  };
  const filtered = await sj.fetch(
    { name: 'SolidJobs IT', careers_url: 'https://solid.jobs/public-api/offers/it?campaign=career-ops' },
    { transport: 'http', fetchJson: async () => mixedJobs, fetchText: async () => '' },
  );
  if (filtered.length === 1 && filtered[0].title === 'Has URL') pass('solidjobs.fetch() filters out jobs with empty/missing url');
  else fail(`solidjobs.fetch() should filter empty URLs, got ${filtered.length} jobs: ${JSON.stringify(filtered)}`);

  // fetch() handles string locations (non-array)
  const stringLocJobs = { jobs: [{ title: 'Dev', url: 'https://solid.jobs/o/2/career-ops', company: 'X', locations: 'Warsaw' }] };
  const strLoc = await sj.fetch(
    { name: 'SolidJobs IT', careers_url: 'https://solid.jobs/public-api/offers/it?campaign=career-ops' },
    { transport: 'http', fetchJson: async () => stringLocJobs, fetchText: async () => '' },
  );
  if (strLoc[0].location === 'Warsaw') pass('solidjobs.fetch() handles string locations');
  else fail(`solidjobs.fetch() string location is ${JSON.stringify(strLoc[0].location)}, expected "Warsaw"`);

  // detect() returns null for valid hostname but wrong path
  if (sj.detect({ name: 'X', careers_url: 'https://solid.jobs/careers' }) === null) {
    pass('solidjobs.detect() rejects solid.jobs URL with wrong path');
  } else {
    fail('solidjobs.detect() should reject solid.jobs URLs not under /public-api/offers/');
  }

  // fetch() passes redirect:'error' to fetchJson
  let capturedOpts = null;
  await sj.fetch(
    { name: 'SolidJobs IT', careers_url: 'https://solid.jobs/public-api/offers/it?campaign=career-ops' },
    { transport: 'http', fetchJson: async (_url, opts) => { capturedOpts = opts; return { jobs: [] }; }, fetchText: async () => '' },
  );
  if (capturedOpts && capturedOpts.redirect === 'error') pass('solidjobs.fetch() passes redirect:"error" to fetchJson');
  else fail(`solidjobs.fetch() should pass redirect:"error", got: ${JSON.stringify(capturedOpts)}`);

  // fetch() tolerates malformed array members without crashing
  const malformedMembers = { jobs: [null, 7, { title: 'OK', url: 'https://solid.jobs/o/3/career-ops', company: 'Z' }] };
  const safeParsed = await sj.fetch(
    { name: 'SolidJobs IT', careers_url: 'https://solid.jobs/public-api/offers/it?campaign=career-ops' },
    { transport: 'http', fetchJson: async () => malformedMembers, fetchText: async () => '' },
  );
  if (safeParsed.length === 1 && safeParsed[0].url === 'https://solid.jobs/o/3/career-ops') {
    pass('solidjobs.fetch() skips malformed jobs members without crashing');
  } else {
    fail(`solidjobs.fetch() malformed members handling failed: ${JSON.stringify(safeParsed)}`);
  }
} catch (e) {
  fail(`solidjobs provider tests crashed: ${e.message}`);
}

// ── 16. SSRF redirect hardening (lever / ashby / workday) ───────
// _http.mjs defaults to redirect:'follow', so a server-side redirect from any
// of these ATS APIs to an internal address is an SSRF vector. Every other GET
// provider passes redirect:'error'; these three were missing it.

console.log('\n16. Provider — SSRF redirect hardening (lever / ashby / workday)');

try {
  const lever = (await import(pathToFileURL(join(ROOT, 'providers/lever.mjs')).href)).default;
  const ashby = (await import(pathToFileURL(join(ROOT, 'providers/ashby.mjs')).href)).default;
  const workday = (await import(pathToFileURL(join(ROOT, 'providers/workday.mjs')).href)).default;

  let leverOpts = null;
  await lever.fetch(
    { name: 'L', careers_url: 'https://jobs.lever.co/example' },
    { transport: 'http', fetchJson: async (_u, opts) => { leverOpts = opts; return []; }, fetchText: async () => '' },
  );
  if (leverOpts && leverOpts.redirect === 'error') pass('lever.fetch() passes redirect:"error"');
  else fail(`lever.fetch() should pass redirect:"error", got ${JSON.stringify(leverOpts)}`);

  let ashbyOpts = null;
  await ashby.fetch(
    { name: 'A', careers_url: 'https://jobs.ashbyhq.com/example' },
    { transport: 'http', fetchJson: async (_u, opts) => { ashbyOpts = opts; return { jobs: [] }; }, fetchText: async () => '' },
  );
  if (ashbyOpts && ashbyOpts.redirect === 'error') pass('ashby.fetch() passes redirect:"error"');
  else fail(`ashby.fetch() should pass redirect:"error", got ${JSON.stringify(ashbyOpts)}`);

  let workdayOpts = null;
  await workday.fetch(
    { name: 'W', careers_url: 'https://example.wd5.myworkdayjobs.com/careers' },
    { transport: 'http', fetchJson: async (_u, opts) => { workdayOpts = opts; return { jobPostings: [] }; }, fetchText: async () => '' },
  );
  if (workdayOpts && workdayOpts.redirect === 'error') pass('workday.fetch() passes redirect:"error"');
  else fail(`workday.fetch() should pass redirect:"error", got ${JSON.stringify(workdayOpts)}`);
} catch (e) {
  fail(`SSRF redirect hardening tests crashed: ${e.message}`);
}

// ── 15. URL REDISCOVERY FALLBACK (--rediscover-404) ─────────────

console.log('\n15. URL rediscovery fallback');

try {
  const { extractCareersUrlDomain, pickRediscoveredUrl } = await import(
    pathToFileURL(join(ROOT, 'scan.mjs')).href
  );

  // extractCareersUrlDomain — pure hostname extraction, null on missing/invalid
  if (extractCareersUrlDomain('https://job-boards.greenhouse.io/anthropic') === 'job-boards.greenhouse.io') {
    pass('extractCareersUrlDomain pulls hostname from a careers URL');
  } else {
    fail('extractCareersUrlDomain failed on a valid URL');
  }
  if (extractCareersUrlDomain(null) === null) {
    pass('extractCareersUrlDomain returns null for missing careers_url');
  } else {
    fail('extractCareersUrlDomain did not return null for null input');
  }
  if (extractCareersUrlDomain('not-a-url') === null) {
    pass('extractCareersUrlDomain returns null for an unparseable URL');
  } else {
    fail('extractCareersUrlDomain did not return null for a bad URL');
  }

  // pickRediscoveredUrl — first search hit whose hostname exactly matches domain
  const domain = 'job-boards.greenhouse.io';
  const hrefs = [
    'https://duckduckgo.com/l/?uddg=ad',          // search-engine chrome / noise
    'https://other-board.lever.co/acme/123',      // wrong domain
    'https://job-boards.greenhouse.io/acme/456',  // first real match
    'https://job-boards.greenhouse.io/acme/789',  // later match
  ];
  if (pickRediscoveredUrl(hrefs, domain) === 'https://job-boards.greenhouse.io/acme/456') {
    pass('pickRediscoveredUrl returns the first same-domain result');
  } else {
    fail(`pickRediscoveredUrl picked the wrong URL: ${pickRediscoveredUrl(hrefs, domain)}`);
  }
  if (pickRediscoveredUrl(['https://elsewhere.com/x'], domain) === null) {
    pass('pickRediscoveredUrl returns null when no result matches the domain');
  } else {
    fail('pickRediscoveredUrl did not return null for no domain match');
  }
  if (pickRediscoveredUrl([], domain) === null) {
    pass('pickRediscoveredUrl returns null for an empty result set');
  } else {
    fail('pickRediscoveredUrl did not return null for empty input');
  }
  // Redirect unwrapping is restricted to real DuckDuckGo hosts: a look-alike
  // host must not get its uddg target unwrapped (and its own hostname does not
  // match the careers domain, so the result is null).
  const lookAlike = `https://evil-duckduckgo.com/l/?uddg=${encodeURIComponent('https://job-boards.greenhouse.io/acme/456')}`;
  if (pickRediscoveredUrl([lookAlike], domain) === null) {
    pass('pickRediscoveredUrl ignores uddg redirects from look-alike hosts');
  } else {
    fail('pickRediscoveredUrl unwrapped a redirect from a look-alike host');
  }
  // DuckDuckGo HTML wraps each result in a /l/?uddg= redirect — must be
  // unwrapped, otherwise every hostname looks like duckduckgo.com and nothing
  // ever matches the careers domain (the fallback would silently never fire).
  const ddg = ['//duckduckgo.com/l/?uddg=' + encodeURIComponent('https://job-boards.greenhouse.io/acme/999')];
  if (pickRediscoveredUrl(ddg, domain) === 'https://job-boards.greenhouse.io/acme/999') {
    pass('pickRediscoveredUrl unwraps DuckDuckGo redirect links');
  } else {
    fail(`pickRediscoveredUrl did not unwrap DDG redirect: ${pickRediscoveredUrl(ddg, domain)}`);
  }
  // A look-alike host that merely contains the domain as a substring must not match.
  if (pickRediscoveredUrl(['https://job-boards.greenhouse.io.attacker.com/x'], domain) === null) {
    pass('pickRediscoveredUrl rejects look-alike hostnames');
  } else {
    fail('pickRediscoveredUrl accepted a look-alike hostname');
  }
} catch (e) {
  fail(`URL rediscovery tests crashed: ${e.message}`);
}

// ── 13. BATCH RATE-LIMIT PAUSE ──────────────────────────────────

console.log('\n13. Batch rate-limit pause');

try {
  const tmp = mkdtempSync(join(tmpdir(), 'co-batch-rate-'));
  const batchDir = join(tmp, 'batch');
  const fakeBin = join(tmp, 'bin');
  mkdirSync(batchDir, { recursive: true });
  mkdirSync(join(tmp, 'reports'), { recursive: true });
  mkdirSync(join(tmp, 'data'), { recursive: true });
  mkdirSync(fakeBin, { recursive: true });

  writeFileSync(join(batchDir, 'batch-runner.sh'), readFileSync(join(ROOT, 'batch/batch-runner.sh'), 'utf-8').replace(/\r\n/g, '\n'));
  if (process.platform === 'win32') {
    try { execFileSync('bash', ['-c', 'chmod +x batch/batch-runner.sh'], { cwd: tmp }); } catch {}
  } else {
    execFileSync('chmod', ['+x', join(batchDir, 'batch-runner.sh')]);
  }
  writeFileSync(join(tmp, 'merge-tracker.mjs'), 'console.log("merge fixture");\n');
  writeFileSync(join(tmp, 'verify-pipeline.mjs'), 'console.log("verify fixture");\n');
  writeFileSync(join(batchDir, 'batch-prompt.md'), 'URL={{URL}}\nJD={{JD_FILE}}\nREPORT={{REPORT_NUM}}\n');
  writeFileSync(join(batchDir, 'batch-input.tsv'), [
    'id\turl\tsource\tnotes',
    '1\thttps://example.com/one\tfixture\t-',
    '2\thttps://example.com/two\tfixture\t-',
    '3\thttps://example.com/three\tfixture\t-',
  ].join('\n') + '\n');
  writeFileSync(join(fakeBin, 'claude'), [
    '#!/usr/bin/env bash',
    'echo "You\\x27ve hit your session limit · resets 12:30pm (Asia/Taipei)"',
    'exit 1',
  ].join('\n') + '\n');
  if (process.platform === 'win32') {
    try { execFileSync('bash', ['-c', 'chmod +x bin/claude'], { cwd: tmp }); } catch {}
  } else {
    execFileSync('chmod', ['+x', join(fakeBin, 'claude')]);
  }

  const env = { ...process.env, PATH: `${fakeBin}${delimiter}${process.env.PATH}` };
  const out = run('bash', [toBashPath(join(batchDir, 'batch-runner.sh')), '--parallel', '1', '--max-retries', '3', '--rate-limit-sleep', '0'], {
    cwd: tmp,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  }) || '';
  const state = readFileSync(join(batchDir, 'batch-state.tsv'), 'utf-8').trim().split('\n');
  const first = state[1]?.split('\t') || [];

  if (state.length === 2 && first[0] === '1' && first[2] === 'paused_rate_limit' && first[8] === '0') {
    pass('session-limit pauses batch without consuming retry budget or scheduling more jobs');
  } else {
    fail(`session-limit pause wrong: lines=${state.length}, first=${JSON.stringify(first)}, out=${JSON.stringify(out.slice(-240))}`);
  }

  writeFileSync(join(batchDir, 'batch-state.tsv'), [
    'id\turl\tstatus\tstarted_at\tcompleted_at\treport_num\tscore\terror\tretries',
    '1\thttps://example.com/one\tpaused_rate_limit\t2026-01-01T00:00:00Z\t2026-01-01T00:00:01Z\t001\t-\tsession-limit; paused\t0',
    '2\thttps://example.com/two\tfailed\t2026-01-01T00:00:00Z\t2026-01-01T00:00:01Z\t002\t-\tworker-crash\t1',
  ].join('\n') + '\n');
  const dry = run('bash', [toBashPath(join(batchDir, 'batch-runner.sh')), '--resume-paused', '--dry-run'], {
    cwd: tmp,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  }) || '';
  if (dry.includes('#1: https://example.com/one') && !dry.includes('#2: https://example.com/two')) {
    pass('--resume-paused dry-run selects paused jobs only');
  } else {
    fail(`--resume-paused selection wrong: ${dry}`);
  }

  rmSync(join(batchDir, 'batch-input.tsv'), { force: true });
  rmSync(join(batchDir, 'batch-prompt.md'), { force: true });
  rmSync(join(fakeBin, 'claude'), { force: true });
  writeFileSync(join(batchDir, 'batch-state.tsv'), [
    'id\turl\tstatus\tstarted_at\tcompleted_at\treport_num\tscore\terror\tretries',
    '1\thttps://example.com/one\tcompleted\t2026-01-01T00:00:00Z\t2026-01-01T00:00:01Z\t001\t4.5\t-\t0',
    '2\thttps://example.com/two\tcompleted\t2026-01-01T00:00:00Z\t2026-01-01T00:00:01Z\t002\tbad);system("oops")\t-\t0',
    '3\thttps://example.com/three\tskipped\t2026-01-01T00:00:00Z\t2026-01-01T00:00:01Z\t003\t3.5\tbelow-min-score\t0',
  ].join('\n') + '\n');
  const statusOnly = run('bash', [toBashPath(join(batchDir, 'batch-runner.sh')), '--status'], {
    cwd: tmp,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  }) || '';
  if (statusOnly.includes('Average score: 4.5/5 (1 scored)') && statusOnly.includes('bad);system("oops")')) {
    pass('--status reads existing state without full batch prerequisites');
  } else {
    fail(`--status prerequisite/score handling wrong: ${statusOnly}`);
  }

  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
} catch (e) {
  fail(`Batch rate-limit pause test crashed: ${e.message}`);
}

// ── 15. BATCH RUNNER MCP ISOLATION (#506) ───────────────────────

console.log('\n15. Batch runner MCP isolation');

try {
  const batchRunner = readFileSync(join(ROOT, 'batch', 'batch-runner.sh'), 'utf-8');
  // Workers must be spawned with --strict-mcp-config so they don't inherit the
  // parent session's MCP servers (e.g. Playwright) and deadlock fighting over a
  // single browser when --parallel > 1 (issue #506).
  const claudeArgsLine = batchRunner
    .split('\n')
    .find(l => l.includes('claude_args=('));
  if (claudeArgsLine && claudeArgsLine.includes('--strict-mcp-config')) {
    pass('batch workers spawn with --strict-mcp-config (no inherited MCP)');
  } else {
    fail('batch-runner.sh worker spawn missing --strict-mcp-config (issue #506 regression)');
  }
} catch (e) {
  fail(`Batch runner MCP isolation test crashed: ${e.message}`);
}

// ── 16. UPDATE-SYSTEM SEMVER PARSING (#923) ─────────────────────

console.log('\n16. update-system SEMVER_RE');

try {
  // Importing must not trigger the CLI (the import.meta.url guard); it
  // exposes SEMVER_RE, which the releases-API fallback uses on release.tag_name.
  const { SEMVER_RE } = await import(pathToFileURL(join(ROOT, 'update-system.mjs')).href);
  const parse = (tag) => String(tag).trim().match(SEMVER_RE)?.[1] ?? null;

  // Release Please tags carry the component prefix (career-ops-v1.9.0); the
  // prefix must be stripped or the releases-API fallback is dead code (#923).
  if (parse('career-ops-v1.9.0') === '1.9.0') {
    pass('SEMVER_RE parses Release Please component-prefixed tag (career-ops-v1.9.0 → 1.9.0)');
  } else {
    fail(`SEMVER_RE failed on career-ops-v1.9.0 (got ${parse('career-ops-v1.9.0')}) — releases-API fallback is dead code (#923)`);
  }

  // No regression on plain tags.
  if (parse('v1.9.0') === '1.9.0' && parse('1.9.0') === '1.9.0') {
    pass('SEMVER_RE still parses plain v-prefixed and bare semver tags');
  } else {
    fail(`SEMVER_RE regressed on plain tags (v1.9.0 → ${parse('v1.9.0')}, 1.9.0 → ${parse('1.9.0')})`);
  }

  // Non-semver input must not match.
  if (parse('career-ops') === null && parse('v1.9') === null) {
    pass('SEMVER_RE rejects non-semver input');
  } else {
    fail(`SEMVER_RE matched non-semver input (career-ops → ${parse('career-ops')}, v1.9 → ${parse('v1.9')})`);
  }
} catch (e) {
  fail(`update-system SEMVER_RE test crashed: ${e.message}`);
}

// ── 17. COVER LETTER GREETING BLOCK ─────────────────────────────

console.log('\n17. Cover letter greeting block');

try {
  const { buildHtml } = await import(pathToFileURL(join(ROOT, 'generate-cover-letter.mjs')).href);

  const basePayload = {
    candidate: { name: 'Jane Doe' },
    letter: {
      role_title: 'Head of Applied AI',
      opening: 'OPENING_MARKER sentence.',
      profile_intro: 'Profile intro.',
    },
  };

  // (a) greeting present → renders <p class="greeting"> above the opening
  const withGreeting = buildHtml({
    ...basePayload,
    letter: { ...basePayload.letter, greeting: 'Dear Hiring Manager,' },
  });
  const greetingTag = '<p class="greeting">Dear Hiring Manager,</p>';
  const greetingIdx = withGreeting.indexOf(greetingTag);
  const openingIdx = withGreeting.indexOf('OPENING_MARKER');
  if (greetingIdx !== -1 && openingIdx !== -1 && greetingIdx < openingIdx) {
    pass('Greeting renders as <p class="greeting"> above the opening');
  } else {
    fail(`Greeting block missing or misordered (greeting=${greetingIdx}, opening=${openingIdx})`);
  }

  // greeting text is HTML-escaped
  const escaped = buildHtml({
    ...basePayload,
    letter: { ...basePayload.letter, greeting: 'Dear <O\'Brien> & "Co",' },
  });
  if (escaped.includes('Dear &lt;O&#39;Brien&gt; &amp; &quot;Co&quot;,') && !escaped.includes('Dear <O\'Brien>')) {
    pass('Greeting text is HTML-escaped');
  } else {
    fail('Greeting text was not HTML-escaped');
  }

  // (b) greeting omitted → no salutation, no leftover token (backward compatible)
  const withoutGreeting = buildHtml(basePayload);
  if (!withoutGreeting.includes('class="greeting"')
      && !withoutGreeting.includes('{{GREETING_BLOCK}}')
      && withoutGreeting.includes('OPENING_MARKER')) {
    pass('Omitted greeting leaves no salutation and no leftover token (backward compatible)');
  } else {
    fail('Omitted greeting did not render cleanly (stray greeting markup or unreplaced token)');
  }
} catch (e) {
  fail(`Cover letter greeting test crashed: ${e.message}`);
}

// ── 18. COVER LETTER SINGLE-PASS SUBSTITUTION ───────────────────

console.log('\n18. Cover letter single-pass substitution');

try {
  const { buildHtml } = await import(pathToFileURL(join(ROOT, 'generate-cover-letter.mjs')).href);

  // A field value that itself contains literal {{TOKEN}} sequences must NOT be
  // re-substituted. The old iterative split/join loop would have blanked these
  // (no footnotes/closing in the payload → replaced with ""). Single-pass leaves
  // them verbatim because replacement output is never re-scanned.
  const injected = buildHtml({
    candidate: { name: 'Jane Doe' },
    letter: {
      role_title: 'Engineer',
      opening: 'See {{FOOTNOTES_BLOCK}} and {{CLOSING_BLOCK}} markers.',
      profile_intro: 'Intro.',
    },
  });

  if (injected.includes('See {{FOOTNOTES_BLOCK}} and {{CLOSING_BLOCK}} markers.')) {
    pass('Field values containing {{TOKEN}} are left literal (single-pass, not re-substituted)');
  } else {
    fail('A field value containing {{TOKEN}} was re-substituted');
  }

  // Known template tokens still resolve, and no unreplaced tokens leak through.
  if (injected.includes('Jane Doe') && !injected.includes('{{NAME}}') && !injected.includes('{{ROLE_TITLE}}')) {
    pass('Known template tokens still substitute under single-pass');
  } else {
    fail('Single-pass substitution left a known token unreplaced');
  }
} catch (e) {
  fail(`Cover letter single-pass substitution test crashed: ${e.message}`);
}

// ── 19. FONT INLINING (#951) ────────────────────────────────────

console.log('\n19. Font inlining (data: URLs, #951)');

try {
  // Importing must not trigger the CLI (the import.meta.url guard); it
  // exposes inlineLocalFonts, which renderHtmlToPdf runs before setContent.
  const { inlineLocalFonts } = await import(pathToFileURL(join(ROOT, 'generate-pdf.mjs')).href);

  // Chromium blocks file:// subresources from setContent() pages (the page
  // stays at about:blank), so ./fonts refs must become data: URLs (#951).
  const fontFile = readdirSync(join(ROOT, 'fonts')).find(f => f.endsWith('.woff2'));
  const inlined = await inlineLocalFonts(
    `<style>@font-face { src: url('./fonts/${fontFile}') format('woff2'); }</style>`
  );
  if (inlined.includes('data:font/woff2;base64,') && !inlined.includes('./fonts/')) {
    pass('local ./fonts references are inlined as data: URLs');
  } else {
    fail('./fonts reference was not inlined as a data: URL — fonts will silently fall back (#951)');
  }

  // A missing font file must not corrupt the HTML or throw.
  const missing = await inlineLocalFonts(`<style>src: url('./fonts/does-not-exist.woff2');</style>`);
  if (missing.includes(`url('./fonts/does-not-exist.woff2')`)) {
    pass('missing font files keep their original reference');
  } else {
    fail('missing font file mangled the url() reference');
  }

  // Traversal outside fonts/ must never be inlined — neither via ".."
  // segments nor via absolute names (resolve() returns those verbatim).
  const traversal = await inlineLocalFonts(`<style>src: url('./fonts/../cv.md');</style>`);
  if (traversal.includes(`url('./fonts/../cv.md')`)) {
    pass('path traversal outside fonts/ is not inlined');
  } else {
    fail('path traversal escaped the fonts/ directory');
  }
  const absolute = await inlineLocalFonts(`<style>src: url('./fonts//etc/passwd');</style>`);
  if (absolute.includes(`url('./fonts//etc/passwd')`)) {
    pass('absolute-path escape (./fonts//etc/passwd) is not inlined');
  } else {
    fail('absolute-path reference escaped the fonts/ directory');
  }
} catch (e) {
  fail(`font inlining test crashed: ${e.message}`);
}

// ── 20. LATEX VALIDATOR I18N ────────────────────────────────────

console.log('\n20. LaTeX validator i18n (localized sections + CJK guard)');

// Run generate-latex.mjs and return its JSON report, capturing stdout even
// when it exits non-zero (validation issues exit 1 but still print the report).
function latexValidate(tex) {
  const dir = mkdtempSync(join(tmpdir(), 'latex-i18n-'));
  const texPath = join(dir, 'cv.tex');
  writeFileSync(texPath, tex, 'utf-8');
  let out;
  try {
    out = execFileSync(NODE, ['generate-latex.mjs', texPath], { cwd: ROOT, encoding: 'utf-8', timeout: 30000 });
  } catch (e) {
    out = (e.stdout || '').toString();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  try { return JSON.parse(out); } catch { return null; }
}

const baseTex = (sectionTitle) => `\\documentclass{article}
\\pdfgentounicode=1
\\begin{document}
\\section{${sectionTitle}}
\\section{Experiencia}
\\section{Proyectos}
\\section{Habilidades}
\\resumeSubheading
\\resumeItem
\\resumeProjectHeading
\\end{document}
`;

try {
  // Localized (Spanish) section titles must not trigger a "Missing section".
  const localized = latexValidate(baseTex('Educación'));
  if (localized && !localized.issues.some((i) => /section/i.test(i))) {
    pass('localized section titles validate (no spurious "Missing section")');
  } else {
    fail(`localized section titles wrongly flagged: ${JSON.stringify(localized && localized.issues)}`);
  }

  // Too few sections must still be flagged.
  const tooFew = latexValidate(`\\documentclass{article}
\\pdfgentounicode=1
\\begin{document}
\\section{Education}
\\resumeSubheading
\\resumeItem
\\resumeProjectHeading
\\end{document}
`);
  if (tooFew && tooFew.issues.some((i) => /at least 4/i.test(i))) {
    pass('fewer than 4 sections is still flagged');
  } else {
    fail('section-count check did not flag a CV with too few sections');
  }

  // CJK content must be rejected with actionable guidance.
  const cjk = latexValidate(baseTex('職務経歴'));
  if (cjk && cjk.issues.some((i) => /CJK/.test(i)) && cjk.valid === false) {
    pass('CJK content is rejected with guidance to use pdf mode');
  } else {
    fail(`CJK content was not rejected with guidance: ${JSON.stringify(cjk && cjk.issues)}`);
  }
} catch (e) {
  fail(`LaTeX validator i18n test crashed: ${e.message}`);
}

// ── 21. CJK CV RENDERING (lang="ja" font fallback) ──────────────

console.log('\n21. CJK CV rendering (lang="ja" font fallback)');

try {
  // The bundled webfonts are Latin-only, so a Japanese CV (html lang="ja")
  // needs a CJK system-font fallback or it renders as tofu (□) in headless
  // Chromium. This mirrors the existing lang="ar" handling.
  const template = readFileSync(join(ROOT, 'templates', 'cv-template.html'), 'utf-8');

  if (/html\[lang="ja"\]\s+body/.test(template)) {
    pass('cv-template.html has a lang="ja" body rule for CJK text');
  } else {
    fail('cv-template.html is missing a lang="ja" font fallback — Japanese CVs render as tofu (□)');
  }

  // The fallback must name a real CJK font family, not just rely on sans-serif
  // (the generic sans-serif has no CJK glyphs on minimal/CI environments).
  const cjkFonts = ['Hiragino Sans', 'Yu Gothic', 'Noto Sans CJK JP', 'Noto Sans JP', 'Meiryo', 'MS PGothic'];
  const jaBlock = template.slice(template.indexOf('html[lang="ja"]'));
  if (cjkFonts.some((f) => jaBlock.includes(f))) {
    pass('lang="ja" rules name a concrete CJK font family');
  } else {
    fail('lang="ja" rules do not name any CJK font family — CJK fallback will not work');
  }
} catch (e) {
  fail(`CJK rendering test crashed: ${e.message}`);
}

// ── 22. PROVIDERS — Jobstreet ──────────────────────────────────────

console.log('\n22. Provider — jobstreet');

try {
  const jobstreet = (await import(pathToFileURL(join(ROOT, 'providers/jobstreet.mjs')).href)).default;
  const { parseJobstreetItem } = await import(pathToFileURL(join(ROOT, 'providers/jobstreet.mjs')).href);

  // id check
  if (jobstreet.id === 'jobstreet') pass('jobstreet.id is "jobstreet"');
  else fail(`jobstreet.id is ${JSON.stringify(jobstreet.id)}`);

  // detect() always returns null (job board, not ATS)
  if (jobstreet.detect({ name: 'X', careers_url: 'https://id.jobstreet.com/jobs' }) === null) {
    pass('jobstreet.detect() returns null — explicit provider only, no URL auto-detection');
  } else {
    fail('jobstreet.detect() should return null for any URL');
  }

  // parseJobstreetItem — valid item
  const sampleItem = {
    id: 123456,
    title: 'Senior Data Scientist',
    branding: { companyName: 'TechCorp Indonesia' },
    location: 'Jakarta Selatan',
    listingDate: '2026-06-15T00:00:00Z',
    jobUrl: '/id/job/123456',
  };
  const parsed = parseJobstreetItem(sampleItem, 'https://id.jobstreet.com', 'FallbackCo');
  if (parsed && parsed.title === 'Senior Data Scientist'
      && parsed.url === 'https://id.jobstreet.com/id/job/123456'
      && parsed.company === 'TechCorp Indonesia'
      && parsed.location === 'Jakarta Selatan'
      && parsed.postedAt != null) {
    pass('parseJobstreetItem extracts title, url, company, location, postedAt correctly');
  } else {
    fail(`parseJobstreetItem returned ${JSON.stringify(parsed)}`);
  }

  // parseJobstreetItem — resolves absolute URL without modification
  const absItem = { id: 1, title: 'Role', jobUrl: 'https://id.jobstreet.com/id/job/999' };
  const absParsed = parseJobstreetItem(absItem, 'https://id.jobstreet.com', 'Co');
  if (absParsed && absParsed.url === 'https://id.jobstreet.com/id/job/999') {
    pass('parseJobstreetItem preserves absolute URLs');
  } else {
    fail(`parseJobstreetItem absolute URL: ${JSON.stringify(absParsed)}`);
  }

  // parseJobstreetItem — rejects items without title
  if (parseJobstreetItem({ jobUrl: '/id/job/1' }, 'https://id.jobstreet.com', 'Co') === null) {
    pass('parseJobstreetItem returns null for items without title');
  } else {
    fail('parseJobstreetItem should return null for title-less items');
  }

  // parseJobstreetItem — rejects items without url
  if (parseJobstreetItem({ title: 'Role' }, 'https://id.jobstreet.com', 'Co') === null) {
    pass('parseJobstreetItem returns null for items without jobUrl');
  } else {
    fail('parseJobstreetItem should return null for URL-less items');
  }

  // parseJobstreetItem — rejects off-domain URLs
  const offDomain = parseJobstreetItem(
    { title: 'Role', jobUrl: 'https://evil.example.com/jobs/1' },
    'https://id.jobstreet.com', 'Co'
  );
  if (offDomain === null) pass('parseJobstreetItem rejects off-domain job URLs');
  else fail(`parseJobstreetItem should reject off-domain URLs, got ${JSON.stringify(offDomain)}`);

  // parseJobstreetItem — handles null/malformed input safely
  if (parseJobstreetItem(null, 'https://id.jobstreet.com', 'Co') === null) pass('parseJobstreetItem(null) → null');
  else fail('parseJobstreetItem(null) should return null');
  if (parseJobstreetItem(7, 'https://id.jobstreet.com', 'Co') === null) pass('parseJobstreetItem(7) → null');
  else fail('parseJobstreetItem(number) should return null');

  // parseJobstreetItem — fallback company when branding is missing
  const noBrand = parseJobstreetItem(
    { id: 1, title: 'Engineer', jobUrl: '/id/job/42' },
    'https://id.jobstreet.com', 'PortalFallback'
  );
  if (noBrand && noBrand.company === 'PortalFallback') {
    pass('parseJobstreetItem uses fallback company when branding is absent');
  } else {
    fail(`parseJobstreetItem fallback company: ${JSON.stringify(noBrand)}`);
  }

  // fetch() — happy path with mock context
  const mockCtx = {
    transport: 'http',
    fetchJson: async (url) => {
      if (!url.startsWith('https://id.jobstreet.com/')) throw new Error('Unexpected URL');
      return {
        data: [
          { id: 1, title: 'AI Engineer', branding: { companyName: 'TestCo' }, location: 'Remote', listingDate: '2026-01-01T00:00:00Z', jobUrl: '/id/job/1' },
        ],
      };
    },
    fetchText: async () => { throw new Error('should not be called'); },
  };
  const jobs = await jobstreet.fetch(
    { name: 'Jobstreet ID', provider: 'jobstreet', searchKeywords: 'AI' },
    mockCtx,
  );
  if (jobs.length === 1 && jobs[0].title === 'AI Engineer') pass('jobstreet.fetch() returns parsed jobs');
  else fail(`jobstreet.fetch() returned ${JSON.stringify(jobs)}`);

  // fetch() — handles empty results
  const emptyCtx = {
    transport: 'http',
    fetchJson: async () => ({ data: [] }),
    fetchText: async () => { throw new Error('should not be called'); },
  };
  const emptyJobs = await jobstreet.fetch(
    { name: 'Jobstreet ID', provider: 'jobstreet', searchKeywords: 'nonexistent' },
    emptyCtx,
  );
  if (emptyJobs.length === 0) pass('jobstreet.fetch() handles empty results');
  else fail(`jobstreet.fetch() should return empty array for no results, got ${emptyJobs.length}`);

  // fetch() — rejects invalid hostname
  let hostRejected = false;
  try {
    await jobstreet.fetch(
      { name: 'Bad', provider: 'jobstreet', api: 'https://evil.example.com/api/search' },
      { transport: 'http', fetchJson: async () => ({}), fetchText: async () => '' },
    );
  } catch (e) {
    if (e.message.includes('untrusted hostname')) hostRejected = true;
    else fail(`jobstreet.fetch() host rejection wrong error: ${e.message}`);
  }
  if (hostRejected) pass('jobstreet.fetch() rejects untrusted hostnames');
  else fail('jobstreet.fetch() should reject non-jobstreet hostnames');

  // fetch() — handles non-array data field
  const badDataCtx = {
    transport: 'http',
    fetchJson: async () => ({ data: null }),
    fetchText: async () => { throw new Error('should not be called'); },
  };
  const badDataJobs = await jobstreet.fetch(
    { name: 'Jobstreet ID', provider: 'jobstreet', searchKeywords: 'test' },
    badDataCtx,
  );
  if (badDataJobs.length === 0) pass('jobstreet.fetch() handles null data field');
  else fail(`jobstreet.fetch() should return empty for null data`);

} catch (e) {
  fail(`jobstreet provider tests crashed: ${e.message}`);
}

// ── 23. PROVIDERS — Glints ─────────────────────────────────────────

console.log('\n23. Provider — glints');

try {
  const glints = (await import(pathToFileURL(join(ROOT, 'providers/glints.mjs')).href)).default;
  const { parseGlintsItem } = await import(pathToFileURL(join(ROOT, 'providers/glints.mjs')).href);

  // id check
  if (glints.id === 'glints') pass('glints.id is "glints"');
  else fail(`glints.id is ${JSON.stringify(glints.id)}`);

  // detect() always returns null (job board, not ATS)
  if (glints.detect({ name: 'X', careers_url: 'https://glints.com/id/jobs' }) === null) {
    pass('glints.detect() returns null — explicit provider only, no URL auto-detection');
  } else {
    fail('glints.detect() should return null for any URL');
  }

  // parseGlintsItem — valid item
  const sampleItem = {
    id: 'abc123',
    title: 'Backend Engineer',
    company: { name: 'StartupCorp' },
    location: 'Jakarta, Indonesia',
    postedAt: '2026-06-10T00:00:00Z',
    url: 'https://glints.com/id/jobs/backend-engineer/abc123',
  };
  const parsed = parseGlintsItem(sampleItem, 'https://glints.com', 'FallbackCo');
  if (parsed && parsed.title === 'Backend Engineer'
      && parsed.url === 'https://glints.com/id/jobs/backend-engineer/abc123'
      && parsed.company === 'StartupCorp'
      && parsed.location === 'Jakarta, Indonesia'
      && parsed.postedAt != null) {
    pass('parseGlintsItem extracts title, url, company, location, postedAt correctly');
  } else {
    fail(`parseGlintsItem returned ${JSON.stringify(parsed)}`);
  }

  // parseGlintsItem — resolves relative URL
  const relItem = { id: 'x', title: 'Dev', url: '/id/jobs/dev/x' };
  const relParsed = parseGlintsItem(relItem, 'https://glints.com', 'Co');
  if (relParsed && relParsed.url === 'https://glints.com/id/jobs/dev/x') {
    pass('parseGlintsItem resolves relative URLs');
  } else {
    fail(`parseGlintsItem relative URL: ${JSON.stringify(relParsed)}`);
  }

  // parseGlintsItem — rejects items without title
  if (parseGlintsItem({ url: 'https://glints.com/job/1' }, 'https://glints.com', 'Co') === null) {
    pass('parseGlintsItem returns null for title-less items');
  } else {
    fail('parseGlintsItem should return null for items without title');
  }

  // parseGlintsItem — rejects items without url
  if (parseGlintsItem({ title: 'Role' }, 'https://glints.com', 'Co') === null) {
    pass('parseGlintsItem returns null for URL-less items');
  } else {
    fail('parseGlintsItem should return null for items without URL');
  }

  // parseGlintsItem — rejects off-domain URLs
  const offDomain = parseGlintsItem(
    { title: 'Role', url: 'https://evil.example.com/jobs/1' },
    'https://glints.com', 'Co'
  );
  if (offDomain === null) pass('parseGlintsItem rejects off-domain URLs');
  else fail(`parseGlintsItem should reject off-domain URLs, got ${JSON.stringify(offDomain)}`);

  // parseGlintsItem — allows subdomains of glints.com
  const subdomainItem = parseGlintsItem(
    { title: 'Role', url: 'https://www.glints.com/id/jobs/role/1' },
    'https://glints.com', 'Co'
  );
  if (subdomainItem && subdomainItem.url === 'https://www.glints.com/id/jobs/role/1') {
    pass('parseGlintsItem accepts www.glints.com subdomain URLs');
  } else {
    fail(`parseGlintsItem subdomain URL rejected: ${JSON.stringify(subdomainItem)}`);
  }

  // parseGlintsItem — handles null/malformed input
  if (parseGlintsItem(null, 'https://glints.com', 'Co') === null) pass('parseGlintsItem(null) → null');
  else fail('parseGlintsItem(null) should return null');
  if (parseGlintsItem(42, 'https://glints.com', 'Co') === null) pass('parseGlintsItem(number) → null');
  else fail('parseGlintsItem(number) should return null');

  // parseGlintsItem — fallback company when company.name is missing
  const noCompany = parseGlintsItem(
    { title: 'Engineer', url: 'https://glints.com/id/jobs/eng/1' },
    'https://glints.com', 'PortalName'
  );
  if (noCompany && noCompany.company === 'PortalName') {
    pass('parseGlintsItem uses fallback company when company.name is absent');
  } else {
    fail(`parseGlintsItem fallback company: ${JSON.stringify(noCompany)}`);
  }

  // fetch() — happy path with mock context
  const mockCtx = {
    transport: 'http',
    fetchJson: async (url, opts) => {
      if (opts?.method !== 'POST') throw new Error('Expected POST');
      const body = JSON.parse(opts.body || '{}');
      if (!body.query) throw new Error('Expected GraphQL query');
      return {
        data: {
          opportunities: {
            data: [
              { title: 'AI PM', company: { name: 'TechCo' }, location: 'Remote', postedAt: '2026-01-01T00:00:00Z', url: 'https://glints.com/id/jobs/ai-pm/1' },
            ],
            totalCount: 1,
          },
        },
      };
    },
    fetchText: async () => { throw new Error('should not be called'); },
  };
  const jobs = await glints.fetch(
    { name: 'Glints ID', provider: 'glints', searchKeywords: 'AI' },
    mockCtx,
  );
  if (jobs.length === 1 && jobs[0].title === 'AI PM') pass('glints.fetch() returns parsed jobs via GraphQL');
  else fail(`glints.fetch() returned ${JSON.stringify(jobs)}`);

  // fetch() — handles empty results
  const emptyCtx = {
    transport: 'http',
    fetchJson: async () => ({ data: { opportunities: { data: [], totalCount: 0 } } }),
    fetchText: async () => { throw new Error('should not be called'); },
  };
  const emptyJobs = await glints.fetch(
    { name: 'Glints ID', provider: 'glints', searchKeywords: 'nonexistent' },
    emptyCtx,
  );
  if (emptyJobs.length === 0) pass('glints.fetch() handles empty results');
  else fail(`glints.fetch() should return empty array for no results, got ${emptyJobs.length}`);

  // fetch() — handles flat opportunities array (alternative response shape)
  const flatCtx = {
    transport: 'http',
    fetchJson: async () => ({
      data: {
        opportunities: [
          { title: 'Dev', company: { name: 'Co' }, location: 'Remote', url: 'https://glints.com/id/jobs/dev/1' },
        ],
      },
    }),
    fetchText: async () => { throw new Error('should not be called'); },
  };
  const flatJobs = await glints.fetch(
    { name: 'Glints ID', provider: 'glints', searchKeywords: 'dev' },
    flatCtx,
  );
  if (flatJobs.length === 1) pass('glints.fetch() handles flat opportunities array response');
  else fail(`glints.fetch() flat array: ${JSON.stringify(flatJobs)}`);

  // fetch() — rejects invalid hostname
  let hostRejected = false;
  try {
    await glints.fetch(
      { name: 'Bad', provider: 'glints', api: 'https://evil.example.com/graphql' },
      { transport: 'http', fetchJson: async () => ({}), fetchText: async () => '' },
    );
  } catch (e) {
    if (e.message.includes('untrusted hostname')) hostRejected = true;
    else fail(`glints.fetch() host rejection wrong error: ${e.message}`);
  }
  if (hostRejected) pass('glints.fetch() rejects untrusted hostnames');
  else fail('glints.fetch() should reject non-glints hostnames');

  // fetch() — throws on missing opportunities in response
  let missingThrew = false;
  try {
    await glints.fetch(
      { name: 'Glints ID', provider: 'glints', searchKeywords: 'test' },
      {
        transport: 'http',
        fetchJson: async () => ({ data: { somethingElse: [] } }),
        fetchText: async () => { throw new Error('should not be called'); },
      },
    );
  } catch (e) {
    if (e.message.includes('unexpected API response')) missingThrew = true;
    else fail(`glints.fetch() missing opportunities wrong error: ${e.message}`);
  }
  if (missingThrew) pass('glints.fetch() throws on unexpected API response shape');
  else fail('glints.fetch() should throw when opportunities is missing');

} catch (e) {
  fail(`glints provider tests crashed: ${e.message}`);
}

console.log('\n25. Provider — arbeitsagentur');

try {
  const aa = (await import(pathToFileURL(join(ROOT, 'providers/arbeitsagentur.mjs')).href)).default;
  const { parseArbeitsagenturConfig, buildLocation, normalizeJob } =
    await import(pathToFileURL(join(ROOT, 'providers/arbeitsagentur.mjs')).href);

  if (aa.id === 'arbeitsagentur') pass('arbeitsagentur.id is "arbeitsagentur"');
  else fail(`arbeitsagentur.id is ${JSON.stringify(aa.id)}`);

  // parseArbeitsagenturConfig — defaults when block is absent
  const def = parseArbeitsagenturConfig({});
  if (def.keywords.length === 0 && def.wo === '' && def.umkreis === 50 && def.days === 30 && def.size === 100 && def.remoteNationwide === false) {
    pass('parseArbeitsagenturConfig applies defaults (umkreis 50, days 30, size 100)');
  } else {
    fail(`parseArbeitsagenturConfig defaults = ${JSON.stringify(def)}`);
  }

  // parseArbeitsagenturConfig — sanitizes keywords and clamps numbers
  const cfg = parseArbeitsagenturConfig({
    arbeitsagentur: { keywords: ['  ML Engineer  ', '', 7, 'NLP'], wo: ' Berlin ', umkreis: 999999, size: 0, days: -3, remoteNationwide: 'yes' },
  });
  if (cfg.keywords.length === 2 && cfg.keywords[0] === 'ML Engineer' && cfg.keywords[1] === 'NLP') {
    pass('parseArbeitsagenturConfig trims keywords and drops empty/non-string entries');
  } else {
    fail(`parseArbeitsagenturConfig keywords = ${JSON.stringify(cfg.keywords)}`);
  }
  if (cfg.wo === 'Berlin' && cfg.umkreis === 1000 && cfg.size === 1 && cfg.days === 1 && cfg.remoteNationwide === false) {
    pass('parseArbeitsagenturConfig clamps umkreis/size/days and treats non-true remoteNationwide as false');
  } else {
    fail(`parseArbeitsagenturConfig sanitized = ${JSON.stringify(cfg)}`);
  }

  // buildLocation — ort/region join, non-DE country appended, DE omitted
  if (buildLocation({ ort: 'Berlin', region: 'Berlin', land: 'Deutschland' }) === 'Berlin, Berlin') {
    pass('buildLocation joins ort/region and omits Germany');
  } else {
    fail(`buildLocation DE = ${JSON.stringify(buildLocation({ ort: 'Berlin', region: 'Berlin', land: 'Deutschland' }))}`);
  }
  if (buildLocation({ ort: 'Wien', land: 'Österreich' }) === 'Wien, Österreich') {
    pass('buildLocation appends non-DE country');
  } else {
    fail(`buildLocation non-DE = ${JSON.stringify(buildLocation({ ort: 'Wien', land: 'Österreich' }))}`);
  }
  if (buildLocation(null) === '' && buildLocation('x') === '') pass('buildLocation returns "" for missing/garbage input');
  else fail('buildLocation should return "" for missing/garbage input');

  // normalizeJob — happy path encodes refnr into the detail URL
  const norm = normalizeJob({ refnr: '10000-123/4 X', titel: '  ML Engineer  ', arbeitgeber: ' ACME ', arbeitsort: { ort: 'Berlin' } });
  if (norm && norm.title === 'ML Engineer' && norm.company === 'ACME'
      && norm.url === 'https://www.arbeitsagentur.de/jobsuche/jobdetail/' + encodeURIComponent('10000-123/4 X')
      && norm.refnr === '10000-123/4 X') {
    pass('normalizeJob trims fields and URL-encodes refnr');
  } else {
    fail(`normalizeJob = ${JSON.stringify(norm)}`);
  }
  if (normalizeJob({ titel: 'No refnr' }) === null && normalizeJob({ refnr: 'x', titel: '' }) === null) {
    pass('normalizeJob returns null without a refnr or title');
  } else {
    fail('normalizeJob should return null when refnr or title is missing');
  }

  // fetch() — nationwide single-keyword pass, dedup across keywords, header sent
  let sentApiKey = null;
  const mkCtx = (byWas) => ({
    fetchJson: async (url, opts) => {
      sentApiKey = opts?.headers?.['X-API-Key'] ?? sentApiKey;
      const was = new URL(url).searchParams.get('was');
      return { stellenangebote: byWas[was] || [] };
    },
  });
  const fetched = await aa.fetch(
    { name: 'AA', arbeitsagentur: { keywords: ['ML', 'NLP'] } },
    mkCtx({
      ML: [{ refnr: 'A', titel: 'ML Engineer', arbeitgeber: 'Co', arbeitsort: { ort: 'Berlin' } }],
      NLP: [
        { refnr: 'A', titel: 'ML Engineer', arbeitgeber: 'Co', arbeitsort: { ort: 'Berlin' } }, // dup refnr
        { refnr: 'B', titel: 'NLP Scientist', arbeitgeber: 'Co', arbeitsort: { ort: 'Köln' } },
      ],
    }),
  );
  if (fetched.length === 2 && !('refnr' in fetched[0])) pass('aa.fetch() dedups by refnr and strips refnr from output');
  else fail(`aa.fetch() returned ${JSON.stringify(fetched)}`);
  if (sentApiKey === 'jobboerse-jobsuche') pass('aa.fetch() sends the X-API-Key header');
  else fail(`aa.fetch() X-API-Key = ${JSON.stringify(sentApiKey)}`);

  // fetch() — remoteNationwide pass keeps only remote-titled wide hits
  let calls = 0;
  const remoteFetched = await aa.fetch(
    { name: 'AA', arbeitsagentur: { keywords: ['ML'], wo: 'Berlin', remoteNationwide: true } },
    {
      fetchJson: async (url) => {
        calls++;
        const hasWo = new URL(url).searchParams.has('wo');
        // Pass A (wo set) → local hit; Pass B (no wo) → one remote-titled, one not.
        return hasWo
          ? { stellenangebote: [{ refnr: 'L', titel: 'ML Engineer', arbeitgeber: 'Co', arbeitsort: { ort: 'Berlin' } }] }
          : { stellenangebote: [
              { refnr: 'R', titel: 'ML Engineer (Remote)', arbeitgeber: 'Co', arbeitsort: { ort: 'Hamburg' } },
              { refnr: 'X', titel: 'Onsite ML Engineer', arbeitgeber: 'Co', arbeitsort: { ort: 'Hamburg' } },
            ] };
      },
    },
  );
  if (calls === 2 && remoteFetched.some(j => j.url.endsWith('R')) && !remoteFetched.some(j => j.url.endsWith('X'))) {
    pass('aa.fetch() remoteNationwide keeps remote-titled wide hits and drops onsite ones');
  } else {
    fail(`aa.fetch() remoteNationwide = ${calls} calls, ${JSON.stringify(remoteFetched.map(j => j.url))}`);
  }

  // parseArbeitsagenturConfig — remoteMatch mode + remoteMaxPages (config-driven remote detection)
  const rcfg = parseArbeitsagenturConfig({ arbeitsagentur: { keywords: ['ML'], remoteMatch: 'filter', remoteMaxPages: 50 } });
  if (rcfg.remoteMatch === 'filter' && rcfg.remoteMaxPages === 20) {
    pass('parseArbeitsagenturConfig parses remoteMatch and clamps remoteMaxPages');
  } else {
    fail(`parseArbeitsagenturConfig remoteMatch/maxPages = ${JSON.stringify({ m: rcfg.remoteMatch, p: rcfg.remoteMaxPages })}`);
  }
  const rdef = parseArbeitsagenturConfig({ arbeitsagentur: { keywords: ['ML'], remoteMatch: 'bogus' } });
  if (rdef.remoteMatch === 'title' && rdef.remoteMaxPages === 1) {
    pass('parseArbeitsagenturConfig defaults remoteMatch to "title" and remoteMaxPages to 1');
  } else {
    fail(`parseArbeitsagenturConfig remote defaults = ${JSON.stringify({ m: rdef.remoteMatch, p: rdef.remoteMaxPages })}`);
  }

  // fetch() — remoteMatch:'filter' uses server-side homeoffice filter, paginates, and tags remote roles
  let usedHomeoffice = false;
  const pagesSeen = new Set();
  const filterFetched = await aa.fetch(
    { name: 'AA', arbeitsagentur: { keywords: ['ML'], wo: 'Berlin', remoteNationwide: true, remoteMatch: 'filter', remoteMaxPages: 5, size: 2 } },
    {
      fetchJson: async (url) => {
        const sp = new URL(url).searchParams;
        if (sp.has('wo')) {
          return { stellenangebote: [{ refnr: 'L', titel: 'ML Engineer', arbeitgeber: 'Co', arbeitsort: { ort: 'Berlin' } }] };
        }
        usedHomeoffice = usedHomeoffice || sp.get('homeoffice') === 'nv_true';
        pagesSeen.add(sp.get('page'));
        return Number(sp.get('page')) === 1
          ? { stellenangebote: [ // full page (== size) → pagination continues
              { refnr: 'R1', titel: 'ML Engineer', arbeitgeber: 'Co', arbeitsort: { ort: 'München' } },
              { refnr: 'R2', titel: 'ML Scientist', arbeitgeber: 'Co', arbeitsort: { ort: 'Stuttgart' } },
            ] }
          : { stellenangebote: [{ refnr: 'R3', titel: 'NLP Engineer', arbeitgeber: 'Co', arbeitsort: { ort: 'Köln' } }] }; // short → stop
      },
    },
  );
  const munich = filterFetched.find(j => j.url.endsWith('R1'));
  if (usedHomeoffice && pagesSeen.has('1') && pagesSeen.has('2') && munich && /Deutschlandweit \(Homeoffice\)/.test(munich.location)) {
    pass('aa.fetch() remoteMatch:filter sends homeoffice=nv_true, paginates, and tags far-city remote roles');
  } else {
    fail(`aa.fetch() filter mode = ${JSON.stringify({ usedHomeoffice, pages: [...pagesSeen], munichLoc: munich?.location })}`);
  }

  // fetch() — no keywords throws; total outage throws (not silent)
  let noKw = false;
  try { await aa.fetch({ name: 'AA', arbeitsagentur: {} }, mkCtx({})); } catch { noKw = true; }
  if (noKw) pass('aa.fetch() throws when no keywords are configured');
  else fail('aa.fetch() should throw without keywords');

  let outage = false;
  try {
    await aa.fetch({ name: 'AA', arbeitsagentur: { keywords: ['ML'] } }, { fetchJson: async () => { throw new Error('HTTP 503'); } });
  } catch { outage = true; }
  if (outage) pass('aa.fetch() throws when every keyword request fails (no silent empty)');
  else fail('aa.fetch() should throw on total outage');

  // fetch() — one keyword answers (empty) while another fails → NOT a total
  // outage; partial success must not throw.
  let partialThrew = false;
  let partial;
  try {
    partial = await aa.fetch(
      { name: 'AA', arbeitsagentur: { keywords: ['OK', 'BAD'] } },
      { fetchJson: async (url) => {
          if (new URL(url).searchParams.get('was') === 'BAD') throw new Error('HTTP 503');
          return { stellenangebote: [] }; // OK answers, just empty
        } },
    );
  } catch { partialThrew = true; }
  if (!partialThrew && Array.isArray(partial) && partial.length === 0) {
    pass('aa.fetch() does not throw when one keyword succeeds empty and another fails');
  } else {
    fail(`aa.fetch() partial-success threw=${partialThrew}, result=${JSON.stringify(partial)}`);
  }

  // fetch() — Pass A succeeds with jobs, optional Pass B fails → Pass A jobs kept.
  const passBFail = await aa.fetch(
    { name: 'AA', arbeitsagentur: { keywords: ['ML'], wo: 'Berlin', remoteNationwide: true } },
    { fetchJson: async (url) => {
        // Pass A (wo set) returns a job; Pass B (no wo) throws.
        if (new URL(url).searchParams.has('wo')) {
          return { stellenangebote: [{ refnr: 'L', titel: 'ML Engineer', arbeitgeber: 'Co', arbeitsort: { ort: 'Berlin' } }] };
        }
        throw new Error('HTTP 503');
      } },
  );
  if (passBFail.length === 1 && passBFail[0].url.endsWith('L')) {
    pass('aa.fetch() preserves primary (Pass A) results when the remote pass (Pass B) fails');
  } else {
    fail(`aa.fetch() Pass B failure dropped primary: ${JSON.stringify(passBFail)}`);
  }

} catch (e) {
  fail(`arbeitsagentur provider tests crashed: ${e.message}`);
}

console.log('\n24. Provider — ibm');

try {
  const ibm = (await import(pathToFileURL(join(ROOT, 'providers/ibm.mjs')).href)).default;
  const { parseIbmResponse, buildPostFilter } = await import(pathToFileURL(join(ROOT, 'providers/ibm.mjs')).href);

  if (ibm.id === 'ibm') pass('ibm.id is "ibm"');
  else fail(`ibm.id is ${JSON.stringify(ibm.id)}`);

  // buildPostFilter — empty config yields no filter terms
  if (buildPostFilter({}).bool.must.length === 0) pass('buildPostFilter({}) → no must terms');
  else fail(`buildPostFilter({}) = ${JSON.stringify(buildPostFilter({}))}`);

  // buildPostFilter — country + categories produce the expected facet terms
  const pf = buildPostFilter({ country: 'Germany', categories: ['Software Engineering', 'Data & Analytics'] });
  const countryTerm = pf.bool.must.find(m => m.term && m.term.field_keyword_05);
  const catTerm = pf.bool.must.find(m => m.bool && m.bool.should);
  if (countryTerm?.term.field_keyword_05 === 'Germany' && catTerm?.bool.should.length === 2) {
    pass('buildPostFilter maps country → field_keyword_05 and categories → field_keyword_08 should[]');
  } else {
    fail(`buildPostFilter facets = ${JSON.stringify(pf)}`);
  }

  // buildPostFilter — sanitizes empty/non-string category entries
  const sanitized = buildPostFilter({ categories: ['Valid', '', '   ', 42, null] });
  const sanitizedShould = sanitized.bool.must.find(m => m.bool && m.bool.should)?.bool.should;
  if (sanitizedShould?.length === 1 && sanitizedShould[0].term.field_keyword_08 === 'Valid') {
    pass('buildPostFilter drops empty/non-string category entries');
  } else {
    fail(`buildPostFilter sanitization = ${JSON.stringify(sanitizedShould)}`);
  }

  // parseIbmResponse — happy path, location assembled from keyword_19 · keyword_17
  const sample = {
    hits: {
      hits: [
        { _source: { title: 'ML Engineer', url: 'https://ibm.com/careers/1', field_keyword_19: 'Berlin, Germany', field_keyword_17: 'Hybrid' } },
        { _source: { title: 'Data Scientist', url: 'https://ibm.com/careers/2', field_keyword_19: 'Remote' } },
      ],
    },
  };
  const jobs = parseIbmResponse(sample);
  if (jobs.length === 2 && jobs[0].company === 'IBM') pass('parseIbmResponse extracts 2 jobs with company "IBM"');
  else fail(`parseIbmResponse returned ${JSON.stringify(jobs)}`);

  if (jobs[0].location === 'Berlin, Germany · Hybrid') pass('parseIbmResponse joins location · work mode');
  else fail(`row 0 location = ${JSON.stringify(jobs[0]?.location)}`);

  if (jobs[1].location === 'Remote') pass('parseIbmResponse omits the separator when work mode is absent');
  else fail(`row 1 location = ${JSON.stringify(jobs[1]?.location)}`);

  // parseIbmResponse — drops title-less, url-less, and non-http(s) entries
  const dirty = parseIbmResponse({
    hits: {
      hits: [
        { _source: { title: '', url: 'https://ibm.com/careers/3' } },
        { _source: { title: 'No URL' } },
        { _source: { title: 'Bad scheme', url: 'ftp://ibm.com/careers/4' } },
        { _source: { title: 'Good', url: 'https://ibm.com/careers/5' } },
      ],
    },
  });
  if (dirty.length === 1 && dirty[0].title === 'Good') pass('parseIbmResponse drops title-less, url-less, and non-http(s) entries');
  else fail(`parseIbmResponse dirty = ${JSON.stringify(dirty)}`);

  // parseIbmResponse — throws on unexpected shape (endpoint drift surfaces loudly)
  let drifted = false;
  try { parseIbmResponse({ results: [] }); } catch { drifted = true; }
  if (drifted) pass('parseIbmResponse throws when hits.hits[] is missing');
  else fail('parseIbmResponse should throw on unexpected API response shape');

  // fetch() — paginates until a short page, via mock ctx
  let calls = 0;
  const mockCtx = {
    fetchJson: async (url, opts) => {
      calls++;
      if (url !== 'https://www-api.ibm.com/search/api/v2') throw new Error(`unexpected url ${url}`);
      if (opts?.method !== 'POST') throw new Error('Expected POST');
      // Page 1: a full page (30 hits) → keep paging; page 2: short page → stop.
      const n = calls === 1 ? 30 : 2;
      const hits = Array.from({ length: n }, (_, i) => ({
        _source: { title: `Role ${calls}-${i}`, url: `https://ibm.com/careers/${calls}-${i}` },
      }));
      return { hits: { hits } };
    },
  };
  const fetched = await ibm.fetch({ name: 'IBM', ibm: { country: 'Germany' } }, mockCtx);
  if (calls === 2 && fetched.length === 32) pass('ibm.fetch() paginates and stops on the first short page');
  else fail(`ibm.fetch() made ${calls} calls, returned ${fetched.length} jobs`);

} catch (e) {
  fail(`ibm provider tests crashed: ${e.message}`);
}

console.log('\n26. Provider — bamboohr');
try {
  const bamboohr = (await import(pathToFileURL(join(ROOT, 'providers/bamboohr.mjs')).href)).default;
  const { parseBambooHRResponse } = await import(pathToFileURL(join(ROOT, 'providers/bamboohr.mjs')).href);

  if (bamboohr.id === 'bamboohr') pass('bamboohr.id is "bamboohr"');
  else fail(`bamboohr.id is ${JSON.stringify(bamboohr.id)}`);

  // detect: <tenant>.bamboohr.com → /careers/list
  const hit = bamboohr.detect({ name: 'Acme', careers_url: 'https://acme.bamboohr.com/careers' });
  if (hit && hit.url === 'https://acme.bamboohr.com/careers/list') {
    pass('bamboohr.detect() resolves <tenant>.bamboohr.com → /careers/list');
  } else {
    fail(`bamboohr.detect() returned ${JSON.stringify(hit)}`);
  }

  // detect: honours an explicit api: URL
  const apiHit = bamboohr.detect({ name: 'Acme', api: 'https://acme.bamboohr.com' });
  if (apiHit && apiHit.url === 'https://acme.bamboohr.com/careers/list') pass('bamboohr.detect() honours explicit api: URL');
  else fail(`bamboohr.detect() api: returned ${JSON.stringify(apiHit)}`);

  // detect: null for non-bamboohr URLs
  if (bamboohr.detect({ name: 'X', careers_url: 'https://example.com/careers' }) === null) {
    pass('bamboohr.detect() returns null for non-bamboohr URLs');
  } else {
    fail('bamboohr.detect() should return null for non-bamboohr URLs');
  }

  // detect: null for non-string careers_url
  if (bamboohr.detect({ name: 'X', careers_url: null }) === null && bamboohr.detect({ name: 'X', careers_url: 7 }) === null) {
    pass('bamboohr.detect() returns null for non-string careers_url (null and 7)');
  } else {
    fail('bamboohr.detect() should treat non-string careers_url as missing');
  }

  // SSRF: bamboohr.com in the PATH (not host) must not be detected.
  if (bamboohr.detect({ name: 'Spoof', careers_url: 'https://evil.example/acme.bamboohr.com/foo' }) === null) {
    pass('bamboohr.detect() rejects path-spoofed URLs');
  } else {
    fail('bamboohr.detect() must reject path-spoofed URLs');
  }

  // parseBambooHRResponse — real BambooHR list shape
  const sample = {
    meta: {},
    result: [
      { id: '15', jobOpeningName: 'IT Security Engineer', location: { city: 'Mayfair', state: 'London, City of' }, isRemote: null },
      { id: 22, jobOpeningName: 'Android Engineer', location: { city: 'Bengaluru', state: 'Karnataka' }, isRemote: 1 },
      { id: '7', jobOpeningName: '', location: { city: 'X' } },          // no title → dropped
      { jobOpeningName: 'No ID Role', location: { city: 'Y' } },          // no id → dropped
      { id: '   ', jobOpeningName: 'Blank ID Role', location: { city: 'Z' } }, // blank/whitespace id → dropped
    ],
  };
  const jobs = parseBambooHRResponse(sample, 'Acme', 'https://acme.bamboohr.com');
  if (jobs.length === 2) pass('parseBambooHRResponse keeps rows with non-empty id + title, drops the rest');
  else fail(`parseBambooHRResponse returned ${jobs.length} jobs (expected 2)`);

  if (!jobs.some(j => j.title === 'Blank ID Role')) pass('parseBambooHRResponse drops blank/whitespace-id rows (no /careers/ URL)');
  else fail('parseBambooHRResponse should drop blank/whitespace-id rows');

  if (jobs[0]?.url === 'https://acme.bamboohr.com/careers/15' && jobs[0]?.company === 'Acme') {
    pass('parseBambooHRResponse builds <origin>/careers/<id> URL');
  } else {
    fail(`parseBambooHRResponse url was ${jobs[0]?.url}`);
  }

  if (jobs[0]?.location === 'Mayfair, London, City of') pass('parseBambooHRResponse joins city + state');
  else fail(`parseBambooHRResponse location[0] was ${JSON.stringify(jobs[0]?.location)}`);

  if (jobs[1]?.location === 'Bengaluru, Karnataka, Remote') pass('parseBambooHRResponse appends Remote when isRemote is set');
  else fail(`parseBambooHRResponse location[1] was ${JSON.stringify(jobs[1]?.location)}`);

  if (jobs[1]?.url === 'https://acme.bamboohr.com/careers/22') pass('parseBambooHRResponse coerces numeric id to URL');
  else fail(`parseBambooHRResponse numeric-id url was ${jobs[1]?.url}`);

  // empty / malformed payloads → []
  if (parseBambooHRResponse({}, 'X', 'https://x.bamboohr.com').length === 0) pass('parseBambooHRResponse empty {} → []');
  else fail('parseBambooHRResponse should return [] for {}');
  if (parseBambooHRResponse({ result: null }, 'X', 'https://x.bamboohr.com').length === 0) pass('parseBambooHRResponse result:null → []');
  else fail('parseBambooHRResponse should return [] for result:null');

  // fetch() — via mock ctx, asserts the resolved URL + SSRF redirect pinning + parsing
  let fetchedUrl = '';
  let fetchedOpts;
  const mockCtx = {
    fetchJson: async (url, opts) => { fetchedUrl = url; fetchedOpts = opts; return sample; },
  };
  const fetched = await bamboohr.fetch({ name: 'Acme', careers_url: 'https://acme.bamboohr.com/careers' }, mockCtx);
  if (fetchedUrl === 'https://acme.bamboohr.com/careers/list' && fetchedOpts?.redirect === 'error' && fetched.length === 2) {
    pass('bamboohr.fetch() calls /careers/list with redirect:error and returns parsed jobs');
  } else {
    fail(`bamboohr.fetch() url=${fetchedUrl} redirect=${JSON.stringify(fetchedOpts)} jobs=${fetched.length}`);
  }

} catch (e) {
  fail(`bamboohr provider tests crashed: ${e.message}`);
}

// ── 27. ATS LIGATURE SUPPRESSION ────────────────────────────────

console.log('\n27. ATS ligature suppression');

try {
  // Headless Chromium substitutes fi/fl/ffi with the Unicode ligature glyphs
  // U+FB01/FB02/FB03 at PDF layout time. PDF text extractors (what ATS reads)
  // decode them back to those codepoints, so "verification" parses as
  // "veriﬁcation" and a literal keyword search misses it. The templates disable
  // common, contextual, and discretionary ligatures in CSS so the output stays
  // font-independent. A live render-and-extract test is font and OS dependent
  // (the bug only appears where a ligature-bearing font is installed), so it is
  // not reliable in CI; this guards the CSS source, which is the fix itself.
  const LIGATURE_TEMPLATES = [
    'cv-template.html',
    'resume-template.html',
    'cover-letter-template.html',
  ];
  const variantRe = /font-variant-ligatures:\s*none/;
  const featureRe = /font-feature-settings:\s*"liga"\s*0\s*,\s*"clig"\s*0\s*,\s*"dlig"\s*0/;

  for (const name of LIGATURE_TEMPLATES) {
    const css = readFileSync(join(ROOT, 'templates', name), 'utf-8');
    if (variantRe.test(css) && featureRe.test(css)) {
      pass(`${name} disables ligatures (font-variant-ligatures + font-feature-settings)`);
    } else {
      fail(`${name} is missing ligature suppression (PDF text extraction would read "veriﬁcation" not "verification")`);
    }
  }
} catch (e) {
  fail(`ATS ligature suppression test crashed: ${e.message}`);
}

// ── 27. Provider — breezy ───────────────────────────────────────
console.log('\n27. Provider — breezy');

try {
  const breezy = (await import(pathToFileURL(join(ROOT, 'providers/breezy.mjs')).href)).default;
  const { parseBreezyResponse } = await import(pathToFileURL(join(ROOT, 'providers/breezy.mjs')).href);

  if (breezy.id === 'breezy') pass('breezy.id is "breezy"');
  else fail(`breezy.id is ${JSON.stringify(breezy.id)}`);

  // detect: careers_url with a path still resolves the tenant /json feed
  const hit = breezy.detect({ name: 'New Incentives', careers_url: 'https://new-incentives.breezy.hr/' });
  if (hit && hit.url === 'https://new-incentives.breezy.hr/json') {
    pass('breezy.detect() resolves <tenant>.breezy.hr → /json feed');
  } else {
    fail(`breezy.detect() returned ${JSON.stringify(hit)}`);
  }

  // detect: explicit api: URL is honoured over careers_url
  const apiHit = breezy.detect({ name: 'X', api: 'https://acme.breezy.hr', careers_url: 'https://example.com' });
  if (apiHit && apiHit.url === 'https://acme.breezy.hr/json') {
    pass('breezy.detect() honours an explicit api: URL');
  } else {
    fail(`breezy.detect() api: → ${JSON.stringify(apiHit)}`);
  }

  if (breezy.detect({ name: 'X', careers_url: 'https://example.com/careers' }) === null) {
    pass('breezy.detect() returns null for non-breezy URLs');
  } else {
    fail('breezy.detect() should return null for non-breezy URLs');
  }

  if (breezy.detect({ name: 'X', careers_url: null }) === null && breezy.detect({ name: 'X', careers_url: 7 }) === null) {
    pass('breezy.detect() returns null for non-string careers_url (null and 7)');
  } else {
    fail('breezy.detect() should treat non-string careers_url as missing');
  }

  // SSRF: breezy.hr in the PATH (not host) must not be detected.
  if (breezy.detect({ name: 'Spoof', careers_url: 'https://evil.example/acme.breezy.hr/json' }) === null) {
    pass('breezy.detect() rejects path-spoofed URLs');
  } else {
    fail('breezy.detect() must NOT misdetect path-spoofed URLs');
  }

  // parseBreezyResponse — top-level array
  const sample = [
    {
      name: 'Assistant Field Manager',
      url: 'https://new-incentives.breezy.hr/p/b8e6-assistant-field-manager',
      published_date: '2026-05-25T14:45:23.799Z',
      location: { name: 'Niger, Sokoto, NG', city: 'Niger', country: { name: 'NG' }, is_remote: false },
    },
    {
      name: 'Remote Backend Engineer',
      url: 'https://new-incentives.breezy.hr/p/aa01-backend',
      location: { city: 'Lagos', state: 'Lagos', country: { name: 'NG' }, is_remote: true },
    },
    { name: 'No URL row', location: { name: 'Remote' } },
    { name: 'Insecure URL', url: 'http://new-incentives.breezy.hr/p/x', location: {} },
  ];
  const jobs = parseBreezyResponse(sample, 'New Incentives');

  if (jobs.length === 2) pass('parseBreezyResponse keeps 2 rows (drops missing/non-https url)');
  else fail(`parseBreezyResponse returned ${jobs.length} rows (expected 2)`);

  if (jobs[0]?.title === 'Assistant Field Manager' && jobs[0]?.company === 'New Incentives' && jobs[0]?.location === 'Niger, Sokoto, NG') {
    pass('parseBreezyResponse prefers ready-made location.name');
  } else {
    fail(`row 0 = ${JSON.stringify(jobs[0])}`);
  }

  if (jobs[0]?.postedAt === Date.parse('2026-05-25T14:45:23.799Z')) {
    pass('parseBreezyResponse parses published_date → postedAt');
  } else {
    fail(`row 0 postedAt = ${JSON.stringify(jobs[0]?.postedAt)}`);
  }

  if (jobs[1]?.location === 'Lagos, Lagos, NG, Remote') {
    pass('parseBreezyResponse assembles city/state/country and appends Remote');
  } else {
    fail(`row 1 location = ${JSON.stringify(jobs[1]?.location)}, expected "Lagos, Lagos, NG, Remote"`);
  }

  if (jobs[1]?.postedAt === undefined) {
    pass('parseBreezyResponse omits postedAt when published_date is absent');
  } else {
    fail(`row 1 postedAt should be undefined, got ${JSON.stringify(jobs[1]?.postedAt)}`);
  }

  if (parseBreezyResponse(null, 'X').length === 0 && parseBreezyResponse({}, 'X').length === 0) {
    pass('non-array payload → empty result (no crash)');
  } else {
    fail('non-array payload should yield empty result');
  }

  // a row already containing "Remote" must not get a duplicate "Remote" suffix
  const noDup = parseBreezyResponse([{ name: 'R', url: 'https://acme.breezy.hr/p/r', location: { name: 'Remote, EMEA', is_remote: true } }], 'X');
  if (noDup[0]?.location === 'Remote, EMEA') pass('parseBreezyResponse does not double-append Remote');
  else fail(`expected "Remote, EMEA", got ${JSON.stringify(noDup[0]?.location)}`);

} catch (e) {
  fail(`breezy provider tests crashed: ${e.message}`);
}

// ── 28. OPTIONAL PROFILE PHOTO (opt-in, DACH/European — #264) ────

console.log('\n28. Optional profile photo (opt-in, DACH/European, #264)');

try {
  const cvTemplate = readFileSync(join(ROOT, 'templates', 'cv-template.html'), 'utf-8');

  // The opt-in photo must exist as a .cv-photo CSS rule.
  if (/\.cv-photo\s*\{/.test(cvTemplate)) {
    pass('cv-template.html defines a .cv-photo rule');
  } else {
    fail('cv-template.html is missing a .cv-photo rule — #264 opt-in photo not wired');
  }

  // It MUST be floated (taken out of normal flow) so a present photo is wrapped
  // by the text beside it (the classic DACH top-corner photo) and an absent one
  // leaves the layout unchanged. Anchor the check to the .cv-photo rule block so
  // it can't accidentally read another rule (e.g. the lang="ar" float:left
  // mirror) via offset slicing.
  const photoRule = cvTemplate.match(/\.cv-photo\s*\{[^}]*\}/);
  if (photoRule && /float:\s*right/.test(photoRule[0])) {
    pass('.cv-photo floats right (text wraps when present; absent ⇒ unchanged layout)');
  } else {
    fail('.cv-photo must float so a present photo sits beside the text and an absent one does not shift the layout (#264)');
  }

  // The photo is an opt-in {{PHOTO}} slot, empty by default. The agent fills it
  // only when config/profile.yml sets candidate.photo; otherwise it stays empty.
  if (cvTemplate.includes('{{PHOTO}}')) {
    pass('cv-template.html exposes a {{PHOTO}} opt-in slot (empty by default)');
  } else {
    fail('cv-template.html is missing the {{PHOTO}} opt-in slot (#264)');
  }

  // The slot MUST sit before the header (outside .header): the float anchors at
  // the top of the page, and removing the line when absent cannot then perturb
  // the header's own structure. Guards against a regression that moves the slot
  // inside .header (which would shift the photoless layout).
  const photoIdx = cvTemplate.indexOf('{{PHOTO}}');
  const headerIdx = cvTemplate.indexOf('<!-- HEADER -->');
  if (photoIdx !== -1 && headerIdx !== -1 && photoIdx < headerIdx) {
    pass('{{PHOTO}} slot precedes the header (outside .header — keeps the photoless layout intact)');
  } else {
    fail('{{PHOTO}} slot must sit before <!-- HEADER --> so an absent photo leaves the header unchanged (#264)');
  }

  // The shipped template must NOT carry an active <img>: photos are opt-in,
  // never the default (recruiters in the US/UK/many markets penalize photos).
  if (!/<img[^>]*class="cv-photo"/.test(cvTemplate)) {
    pass('default template has no active <img class="cv-photo"> (opt-in, not default)');
  } else {
    fail('cv-template.html ships an active photo <img> — photos must be opt-in, never default (#264)');
  }

  // RTL (Arabic) must mirror the photo to the opposite corner, like the other
  // lang="ar" rules in this template.
  if (/html\[lang="ar"\]\s+\.cv-photo/.test(cvTemplate)) {
    pass('lang="ar" mirrors .cv-photo to the opposite corner');
  } else {
    fail('cv-template.html is missing an RTL mirror for .cv-photo (#264)');
  }
} catch (e) {
  fail(`profile photo test crashed: ${e.message}`);
}

// ── 29. CUSTOM INSTRUCTIONS extension point (user-layer, #1198) ────

console.log('\n29. Custom instructions extension point (modes/_custom.md, #1198)');

try {
  // The template MUST ship — it seeds the user file on first run.
  if (existsSync(join(ROOT, 'modes', '_custom.template.md'))) {
    pass('modes/_custom.template.md exists (seed for the user custom-instructions file)');
  } else {
    fail('modes/_custom.template.md is missing — the custom-instructions seed is not shipped (#1198)');
  }

  const updater = readFileSync(join(ROOT, 'update-system.mjs'), 'utf-8');

  // The user file MUST be in USER_PATHS so update-system.mjs never overwrites
  // the user's house rules — that is the whole point of #1198. Anchor to the
  // USER_PATHS array block so a stray match elsewhere can't give a false pass.
  const userBlock = (updater.match(/USER_PATHS\s*=\s*\[([\s\S]*?)\]/) || [, ''])[1];
  if (userBlock.includes("'modes/_custom.md'")) {
    pass('modes/_custom.md is in USER_PATHS (custom rules survive update-system.mjs)');
  } else {
    fail('modes/_custom.md is NOT in USER_PATHS — custom instructions would be wiped on update (#1198)');
  }

  // The template MUST be in SYSTEM_PATHS so updates deliver/refresh it.
  const sysBlock = (updater.match(/SYSTEM_PATHS\s*=\s*\[([\s\S]*?)\]/) || [, ''])[1];
  if (sysBlock.includes("'modes/_custom.template.md'")) {
    pass('modes/_custom.template.md is in SYSTEM_PATHS (shipped + updatable)');
  } else {
    fail('modes/_custom.template.md is NOT in SYSTEM_PATHS — the seed never updates (#1198)');
  }

  // CLAUDE.md MUST route custom rules to the file AND seed it on onboarding.
  const claudeMd = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf-8');
  if (claudeMd.includes('modes/_custom.md') && claudeMd.includes('modes/_custom.template.md')) {
    pass('CLAUDE.md routes custom rules to modes/_custom.md + seeds it from the template');
  } else {
    fail('CLAUDE.md does not reference modes/_custom.md / its template — agents will not use it (#1198)');
  }
} catch (e) {
  fail(`custom instructions test crashed: ${e.message}`);
}

// ── 30. Provider — comeet ───────────────────────────────────────
console.log('\n30. Provider — comeet');

try {
  const comeet = (await import(pathToFileURL(join(ROOT, 'providers/comeet.mjs')).href)).default;
  const { parseComeetResponse } = await import(pathToFileURL(join(ROOT, 'providers/comeet.mjs')).href);

  if (comeet.id === 'comeet') pass('comeet.id is "comeet"');
  else fail(`comeet.id is ${JSON.stringify(comeet.id)}`);

  // detect: explicit api: careers-api URL is honoured (and the secret token is
  // redacted from the informational DetectHit url).
  const apiUrl = 'https://www.comeet.co/careers-api/2.0/company/30.005/positions?token=ABC123';
  const apiHit = comeet.detect({ name: 'Spark Hire', api: apiUrl, careers_url: 'https://www.comeet.com/jobs/spark-hire/30.005' });
  if (apiHit && apiHit.url === 'https://www.comeet.co/careers-api/2.0/company/30.005/positions?token=REDACTED') {
    pass('comeet.detect() resolves an explicit api: URL and redacts the token');
  } else {
    fail(`comeet.detect() api: → ${JSON.stringify(apiHit)}`);
  }

  // the DetectHit url must not leak the real token (it may be logged)
  if (apiHit && !apiHit.url.includes('ABC123')) {
    pass('comeet.detect() does not leak the real token in the DetectHit url');
  } else {
    fail(`comeet.detect() leaked the token: ${JSON.stringify(apiHit)}`);
  }

  // detect: full careers-api URL pasted into careers_url is also accepted
  const cuHit = comeet.detect({ name: 'X', careers_url: apiUrl });
  if (cuHit && cuHit.url === 'https://www.comeet.co/careers-api/2.0/company/30.005/positions?token=REDACTED') {
    pass('comeet.detect() accepts a careers-api URL in careers_url');
  } else {
    fail(`comeet.detect() careers_url → ${JSON.stringify(cuHit)}`);
  }

  // detect: a branded www.comeet.com/jobs page carries no token → not claimed
  if (comeet.detect({ name: 'X', careers_url: 'https://www.comeet.com/jobs/spark-hire/30.005' }) === null) {
    pass('comeet.detect() returns null for a branded careers page (no token)');
  } else {
    fail('comeet.detect() should not claim a tokenless branded careers page');
  }

  if (comeet.detect({ name: 'X', careers_url: 'https://example.com/careers' }) === null) {
    pass('comeet.detect() returns null for non-comeet URLs');
  } else {
    fail('comeet.detect() should return null for non-comeet URLs');
  }

  if (comeet.detect({ name: 'X', careers_url: null }) === null && comeet.detect({ name: 'X', api: 7 }) === null) {
    pass('comeet.detect() returns null for non-string url fields (null and 7)');
  } else {
    fail('comeet.detect() should treat non-string url fields as missing');
  }

  // SSRF: comeet.co in the PATH (not host) must not be detected.
  if (comeet.detect({ name: 'Spoof', api: 'https://evil.example/www.comeet.co/careers-api/2.0/company/x/positions' }) === null) {
    pass('comeet.detect() rejects path-spoofed URLs');
  } else {
    fail('comeet.detect() must NOT misdetect path-spoofed URLs');
  }

  // SSRF: the wrong comeet host (www.comeet.com, the hosted-page origin) is rejected.
  if (comeet.detect({ name: 'Spoof', api: 'https://www.comeet.com/careers-api/2.0/company/x/positions?token=y' }) === null) {
    pass('comeet.detect() pins to www.comeet.co (rejects www.comeet.com)');
  } else {
    fail('comeet.detect() must pin to www.comeet.co');
  }

  // parseComeetResponse — top-level array (real shape, confirmed live)
  const sample = [
    {
      name: 'AI Engineer',
      url_active_page: 'https://www.comeet.com/jobs/spark-hire/30.005/ai-engineer/F1.B67',
      url_comeet_hosted_page: 'https://www.comeet.com/jobs/spark-hire/30.005/ai-engineer/F1.B67',
      time_updated: '2026-06-11T07:49:20Z',
      location: { name: 'Tel Aviv, Israel', is_remote: true },
    },
    {
      name: 'Backend Engineer',
      url_comeet_hosted_page: 'https://www.comeet.com/jobs/spark-hire/30.005/backend/AB.C12',
      location: { name: 'Berlin, Germany', is_remote: false },
    },
    { name: 'No URL row', location: { name: 'Remote' } },
    { name: 'Insecure URL', url_active_page: 'http://www.comeet.com/jobs/x', location: {} },
  ];
  const jobs = parseComeetResponse(sample, 'Spark Hire');

  if (jobs.length === 2) pass('parseComeetResponse keeps 2 rows (drops missing/non-https url)');
  else fail(`parseComeetResponse returned ${jobs.length} rows (expected 2)`);

  if (jobs[0]?.title === 'AI Engineer' && jobs[0]?.company === 'Spark Hire' && jobs[0]?.location === 'Tel Aviv, Israel, Remote') {
    pass('parseComeetResponse maps name/location.name and appends Remote');
  } else {
    fail(`row 0 = ${JSON.stringify(jobs[0])}`);
  }

  if (jobs[0]?.postedAt === Date.parse('2026-06-11T07:49:20Z')) {
    pass('parseComeetResponse parses time_updated → postedAt');
  } else {
    fail(`row 0 postedAt = ${JSON.stringify(jobs[0]?.postedAt)}`);
  }

  if (jobs[1]?.url === 'https://www.comeet.com/jobs/spark-hire/30.005/backend/AB.C12' && jobs[1]?.location === 'Berlin, Germany' && jobs[1]?.postedAt === undefined) {
    pass('parseComeetResponse falls back to url_comeet_hosted_page and omits absent postedAt');
  } else {
    fail(`row 1 = ${JSON.stringify(jobs[1])}`);
  }

  if (parseComeetResponse(null, 'X').length === 0 && parseComeetResponse({}, 'X').length === 0) {
    pass('non-array payload → empty result (no crash)');
  } else {
    fail('non-array payload should yield empty result');
  }

  // a location already containing "Remote" must not get a duplicate suffix
  const noDup = parseComeetResponse([{ name: 'R', url_active_page: 'https://www.comeet.com/jobs/x/r', location: { name: 'Remote, EMEA', is_remote: true } }], 'X');
  if (noDup[0]?.location === 'Remote, EMEA') pass('parseComeetResponse does not double-append Remote');
  else fail(`expected "Remote, EMEA", got ${JSON.stringify(noDup[0]?.location)}`);

  // malformed members (null / non-object / whitespace-only name) must neither
  // throw nor slip through: a row needs a non-empty trimmed title AND a url.
  const dirty = [
    null,
    'not an object',
    42,
    { name: '   ', url_active_page: 'https://www.comeet.com/jobs/x/blank' }, // blank title → dropped
    { name: '  Padded Role  ', url_active_page: 'https://www.comeet.com/jobs/x/p', location: {} }, // trimmed, kept
  ];
  const cleaned = parseComeetResponse(dirty, 'X');
  if (cleaned.length === 1 && cleaned[0].title === 'Padded Role') {
    pass('parseComeetResponse skips null/non-object/blank-title rows and trims the title');
  } else {
    fail(`dirty parse = ${JSON.stringify(cleaned)} (expected 1 row "Padded Role")`);
  }

} catch (e) {
  fail(`comeet provider tests crashed: ${e.message}`);
}

// ── 31. Provider — personio ─────────────────────────────────────
console.log('\n31. Provider — personio');

try {
  const personio = (await import(pathToFileURL(join(ROOT, 'providers/personio.mjs')).href)).default;
  const { parsePersonioXml } = await import(pathToFileURL(join(ROOT, 'providers/personio.mjs')).href);

  if (personio.id === 'personio') pass('personio.id is "personio"');
  else fail(`personio.id is ${JSON.stringify(personio.id)}`);

  // detect: <slug>.jobs.personio.de careers host → /xml feed
  const hit = personio.detect({ name: 'Acme', careers_url: 'https://acme.jobs.personio.de/' });
  if (hit && hit.url === 'https://acme.jobs.personio.de/xml') {
    pass('personio.detect() resolves <slug>.jobs.personio.de → /xml feed');
  } else {
    fail(`personio.detect() returned ${JSON.stringify(hit)}`);
  }

  // detect: the .com TLD variant is also accepted
  const comHit = personio.detect({ name: 'Acme', careers_url: 'https://acme.jobs.personio.com/jobs' });
  if (comHit && comHit.url === 'https://acme.jobs.personio.com/xml') {
    pass('personio.detect() accepts the .com TLD variant');
  } else {
    fail(`personio.detect() .com → ${JSON.stringify(comHit)}`);
  }

  if (personio.detect({ name: 'X', careers_url: 'https://example.com/careers' }) === null) {
    pass('personio.detect() returns null for non-personio URLs');
  } else {
    fail('personio.detect() should return null for non-personio URLs');
  }

  if (personio.detect({ name: 'X', careers_url: null }) === null && personio.detect({ name: 'X', careers_url: 7 }) === null) {
    pass('personio.detect() returns null for non-string careers_url (null and 7)');
  } else {
    fail('personio.detect() should treat non-string careers_url as missing');
  }

  // SSRF: jobs.personio.de in the PATH (not host) must not be detected.
  if (personio.detect({ name: 'Spoof', careers_url: 'https://evil.example/acme.jobs.personio.de/xml' }) === null) {
    pass('personio.detect() rejects path-spoofed URLs');
  } else {
    fail('personio.detect() must NOT misdetect path-spoofed URLs');
  }

  // SSRF: a look-alike host (suffix attack) must be rejected.
  if (personio.detect({ name: 'Spoof', careers_url: 'https://acme.jobs.personio.de.evil.com/xml' }) === null) {
    pass('personio.detect() rejects suffix-spoofed look-alike hosts');
  } else {
    fail('personio.detect() must reject suffix-spoofed hosts');
  }

  // parsePersonioXml — the real <workzag-jobs> shape (confirmed live)
  const HOST = 'acme.jobs.personio.de';
  const sample = `<?xml version="1.0" encoding="UTF-8"?>
<workzag-jobs>
<position>
  <id>1834171</id>
  <office>Munich</office>
  <additionalOffices><office>Berlin</office></additionalOffices>
  <name>Staff Software Engineer, Data &amp; Platform</name>
  <createdAt>2024-11-13T14:10:41+00:00</createdAt>
</position>
<position>
  <id>900100</id>
  <office>Remote</office>
  <name><![CDATA[Senior Engineer (m/f/d)]]></name>
  <createdAt>2025-01-02T09:00:00+00:00</createdAt>
</position>
<position>
  <id>777</id>
  <office>Cologne</office>
  <name></name>
</position>
<position>
  <id>not-a-number</id>
  <office>Hamburg</office>
  <name>Bad ID Role</name>
</position>
</workzag-jobs>`;
  const jobs = parsePersonioXml(sample, 'Acme', HOST);

  if (jobs.length === 2) pass('parsePersonioXml keeps 2 positions (drops empty name + non-numeric id)');
  else fail(`parsePersonioXml returned ${jobs.length} positions (expected 2)`);

  if (jobs[0]?.title === 'Staff Software Engineer, Data & Platform' && jobs[0]?.company === 'Acme') {
    pass('parsePersonioXml decodes &amp; in the title');
  } else {
    fail(`row 0 = ${JSON.stringify(jobs[0])}`);
  }

  if (jobs[0]?.url === 'https://acme.jobs.personio.de/job/1834171') {
    pass('parsePersonioXml builds the job URL from host + numeric id');
  } else {
    fail(`row 0 url = ${JSON.stringify(jobs[0]?.url)}`);
  }

  if (jobs[0]?.location === 'Munich, Berlin') {
    pass('parsePersonioXml joins primary + additionalOffices');
  } else {
    fail(`row 0 location = ${JSON.stringify(jobs[0]?.location)}, expected "Munich, Berlin"`);
  }

  if (jobs[0]?.postedAt === Date.parse('2024-11-13T14:10:41+00:00')) {
    pass('parsePersonioXml parses createdAt → postedAt');
  } else {
    fail(`row 0 postedAt = ${JSON.stringify(jobs[0]?.postedAt)}`);
  }

  if (jobs[1]?.title === 'Senior Engineer (m/f/d)') {
    pass('parsePersonioXml unwraps a CDATA name');
  } else {
    fail(`row 1 title = ${JSON.stringify(jobs[1]?.title)}`);
  }

  if (parsePersonioXml('', 'X', HOST).length === 0 && parsePersonioXml(null, 'X', HOST).length === 0) {
    pass('empty / non-string feed → empty result (no crash)');
  } else {
    fail('empty / non-string feed should yield empty result');
  }

  // Hardening: <jobDescriptions> carries per-section <name>/<value> pairs whose
  // nested <name> must NOT be mistaken for the position's own title; numeric
  // entities decode; an office wrapped in CDATA unwraps.
  const tricky = `<workzag-jobs><position>
    <id>42</id>
    <office><![CDATA[München]]></office>
    <name>Real Title &#38; More</name>
    <jobDescriptions>
      <jobDescription><name>Your tasks</name><value>do things</value></jobDescription>
    </jobDescriptions>
    <createdAt>2025-03-04T00:00:00+00:00</createdAt>
  </position></workzag-jobs>`;
  const tj = parsePersonioXml(tricky, 'Acme', HOST);
  if (tj.length === 1 && tj[0].title === 'Real Title & More') {
    pass('parsePersonioXml ignores nested <jobDescriptions><name> + decodes numeric entity');
  } else {
    fail(`tricky title = ${JSON.stringify(tj[0]?.title)} (len ${tj.length})`);
  }
  if (tj[0]?.location === 'München') {
    pass('parsePersonioXml unwraps a CDATA <office>');
  } else {
    fail(`tricky location = ${JSON.stringify(tj[0]?.location)}`);
  }

  // Hardening: a <jobDescriptions> value carrying a literal "</position>" must
  // not truncate the block split. Stripping descriptions from the whole feed
  // first keeps both positions intact.
  const sneaky = `<workzag-jobs><position>
    <id>1</id><name>First</name>
    <jobDescriptions><jobDescription><name>About</name><value>uses &lt;/position&gt; literally: </position></value></jobDescription></jobDescriptions>
  </position><position>
    <id>2</id><name>Second</name>
  </position></workzag-jobs>`;
  const sj2 = parsePersonioXml(sneaky, 'Acme', HOST);
  if (sj2.length === 2 && sj2[0].title === 'First' && sj2[1].title === 'Second') {
    pass('parsePersonioXml survives a literal </position> inside <jobDescriptions>');
  } else {
    fail(`sneaky parse = ${JSON.stringify(sj2.map(j => j.title))} (len ${sj2.length})`);
  }

  // fetch() passes redirect:'error' to fetchText (SSRF hardening must not regress)
  let capturedOpts = null;
  await personio.fetch(
    { name: 'Acme', careers_url: 'https://acme.jobs.personio.de/' },
    { fetchText: async (_url, opts) => { capturedOpts = opts; return '<workzag-jobs></workzag-jobs>'; } },
  );
  if (capturedOpts && capturedOpts.redirect === 'error') {
    pass('personio.fetch() passes redirect:"error" to fetchText');
  } else {
    fail(`personio.fetch() should pass redirect:"error", got: ${JSON.stringify(capturedOpts)}`);
  }

} catch (e) {
  fail(`personio provider tests crashed: ${e.message}`);
}

// -- 32. Provider - weworkremotely ---------------------------------------
console.log('\n32. Provider - weworkremotely');

try {
  const wwrModule = await import(pathToFileURL(join(ROOT, 'providers/weworkremotely.mjs')).href);
  const weworkremotely = wwrModule.default;
  const { parseWwrFeed } = wwrModule;

  if (weworkremotely.id === 'weworkremotely') pass('weworkremotely.id is "weworkremotely"');
  else fail(`weworkremotely.id is ${JSON.stringify(weworkremotely.id)}`);

  const hit = weworkremotely.detect({ name: 'WWR', provider: 'weworkremotely' });
  if (hit && hit.url === 'https://weworkremotely.com/remote-jobs.rss') {
    pass('weworkremotely.detect() claims explicit provider config');
  } else {
    fail(`weworkremotely.detect() returned ${JSON.stringify(hit)}`);
  }

  if (weworkremotely.detect({ name: 'Remote Board', provider: 'remoteok' }) === null) {
    pass('weworkremotely.detect() ignores other provider ids');
  } else {
    fail('weworkremotely.detect() should only claim provider: weworkremotely');
  }

  const sample = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title><![CDATA[Acme & Co: Staff AI Engineer]]></title>
      <link>https://weworkremotely.com/remote-jobs/acme-staff-ai-engineer</link>
      <pubDate>Thu, 13 Nov 2025 14:10:41 +0000</pubDate>
      <region><![CDATA[Anywhere in the World]]></region>
      <category>Programming</category>
    </item>
    <item>
      <title>Principal Platform Engineer &amp; Tooling</title>
      <link>https://weworkremotely.com/remote-jobs/example-platform-engineer</link>
      <pubDate>Fri, 02 Jan 2026 09:00:00 +0000</pubDate>
      <category>DevOps and Sysadmin</category>
    </item>
    <item>
      <title>Missing Link Inc: Dropped Role</title>
      <pubDate>Fri, 02 Jan 2026 09:00:00 +0000</pubDate>
      <region>USA Only</region>
    </item>
    <item>
      <title>Bad Link Inc: Dropped Role</title>
      <link>/remote-jobs/bad-link</link>
      <region>Europe Only</region>
    </item>
    <item>
      <title>Off Host Inc: Dropped Role</title>
      <link>https://example.com/remote-jobs/off-host</link>
      <region>Internal</region>
    </item>
  </channel>
</rss>`;
  const jobs = parseWwrFeed(sample, 'WWR Board');

  if (jobs.length === 2) pass('parseWwrFeed keeps 2 items (drops missing/relative/off-host links)');
  else fail(`parseWwrFeed returned ${jobs.length} jobs (expected 2)`);

  if (jobs[0]?.company === 'Acme & Co' && jobs[0]?.title === 'Staff AI Engineer') {
    pass('parseWwrFeed splits "Company: Role" titles');
  } else {
    fail(`row 0 title/company = ${JSON.stringify({ title: jobs[0]?.title, company: jobs[0]?.company })}`);
  }

  if (jobs[0]?.url === 'https://weworkremotely.com/remote-jobs/acme-staff-ai-engineer') {
    pass('parseWwrFeed maps <link> to url');
  } else {
    fail(`row 0 url = ${JSON.stringify(jobs[0]?.url)}`);
  }

  if (jobs[0]?.location === 'Anywhere in the World') {
    pass('parseWwrFeed maps <region> to location');
  } else {
    fail(`row 0 location = ${JSON.stringify(jobs[0]?.location)}`);
  }

  if (jobs[0]?.postedAt === Date.parse('Thu, 13 Nov 2025 14:10:41 +0000')) {
    pass('parseWwrFeed parses pubDate -> postedAt');
  } else {
    fail(`row 0 postedAt = ${JSON.stringify(jobs[0]?.postedAt)}`);
  }

  if (jobs[1]?.company === 'WWR Board' && jobs[1]?.title === 'Principal Platform Engineer & Tooling') {
    pass('parseWwrFeed falls back to entry name and decodes entities');
  } else {
    fail(`row 1 = ${JSON.stringify(jobs[1])}`);
  }

  if (jobs[1]?.location === 'DevOps and Sysadmin') {
    pass('parseWwrFeed falls back to <category> when <region> is absent');
  } else {
    fail(`row 1 location = ${JSON.stringify(jobs[1]?.location)}`);
  }

  if (parseWwrFeed('', 'X').length === 0 && parseWwrFeed(null, 'X').length === 0) {
    pass('parseWwrFeed empty / non-string feed -> empty result (no crash)');
  } else {
    fail('parseWwrFeed empty / non-string feed should yield empty result');
  }

  let capturedUrl = null;
  let capturedOpts = null;
  const fetched = await weworkremotely.fetch(
    { name: 'WWR Board', provider: 'weworkremotely' },
    { fetchText: async (url, opts) => { capturedUrl = url; capturedOpts = opts; return sample; } },
  );

  if (capturedUrl === 'https://weworkremotely.com/remote-jobs.rss') {
    pass('weworkremotely.fetch() requests the pinned RSS feed URL');
  } else {
    fail(`weworkremotely.fetch() requested ${JSON.stringify(capturedUrl)}`);
  }

  if (capturedOpts && capturedOpts.redirect === 'error') {
    pass('weworkremotely.fetch() passes redirect:"error" to fetchText');
  } else {
    fail(`weworkremotely.fetch() should pass redirect:"error", got: ${JSON.stringify(capturedOpts)}`);
  }

  if (fetched[0]?.company === 'Acme & Co' && fetched[0]?.title === 'Staff AI Engineer') {
    pass('provider: weworkremotely config returns normalized jobs');
  } else {
    fail(`weworkremotely.fetch() normalized row = ${JSON.stringify(fetched[0])}`);
  }
} catch (e) {
  fail(`weworkremotely provider tests crashed: ${e.message}`);
}

// ── 33. Provider — remotive ─────────────────────────────────────
console.log('\n33. Provider — remotive');

try {
  const remotiveModule = await import(pathToFileURL(join(ROOT, 'providers/remotive.mjs')).href);
  const remotive = remotiveModule.default;

  if (remotive.id === 'remotive') pass('remotive.id is "remotive"');
  else fail(`remotive.id is ${JSON.stringify(remotive.id)}`);

  // Deterministic sample payload — no network. Two valid jobs plus two that must
  // be dropped by the filter (empty title, non-absolute url).
  const sample = {
    jobs: [
      {
        title: 'Staff AI Engineer',
        url: 'https://remotive.com/remote-jobs/acme-staff-ai-engineer',
        company_name: 'Acme Corp',
        candidate_required_location: 'Worldwide',
      },
      {
        title: '  Platform Engineer  ',                 // leading/trailing space → trimmed
        url: '  https://remotive.com/remote-jobs/beta-platform-engineer  ',
        company_name: '',                               // empty → falls back to entry.name
        // candidate_required_location omitted → location ''
      },
      {
        title: '',                                       // dropped: empty title
        url: 'https://remotive.com/remote-jobs/bad-empty-title',
        company_name: 'Bad Co',
      },
      {
        title: 'Relative URL Role',                      // dropped: non-absolute url
        url: '/remote-jobs/relative',
        company_name: 'Rel Co',
      },
    ],
  };

  let capturedUrl = null;
  let capturedOpts = null;
  const fetched = await remotive.fetch(
    { name: 'Remotive Board', provider: 'remotive' },
    { fetchJson: async (url, opts) => { capturedUrl = url; capturedOpts = opts; return sample; } },
  );

  if (capturedUrl === 'https://remotive.com/api/remote-jobs')
    pass('remotive.fetch() requests the board-wide feed URL');
  else fail(`remotive.fetch() requested ${JSON.stringify(capturedUrl)}`);

  if (capturedOpts && capturedOpts.redirect === 'error')
    pass('remotive.fetch() passes redirect:"error" to fetchJson (SSRF guard)');
  else fail(`remotive.fetch() should pass redirect:"error", got: ${JSON.stringify(capturedOpts)}`);

  if (fetched.length === 2)
    pass('remotive.fetch() keeps 2 valid jobs (drops empty-title + non-absolute-url rows)');
  else fail(`remotive.fetch() returned ${fetched.length} jobs (expected 2)`);

  // Normalized shape: exactly { title, url, company, location }.
  if (fetched[0] && Object.keys(fetched[0]).sort().join(',') === 'company,location,title,url')
    pass('remotive.fetch() returns the normalized { title, url, company, location } shape');
  else fail(`remotive.fetch() row 0 keys = ${JSON.stringify(fetched[0] && Object.keys(fetched[0]))}`);

  if (fetched[0]?.title === 'Staff AI Engineer'
      && fetched[0]?.url === 'https://remotive.com/remote-jobs/acme-staff-ai-engineer'
      && fetched[0]?.company === 'Acme Corp'
      && fetched[0]?.location === 'Worldwide')
    pass('remotive.fetch() maps title/url/company_name/candidate_required_location for a full row');
  else fail(`remotive.fetch() row 0 = ${JSON.stringify(fetched[0])}`);

  if (fetched[1]?.title === 'Platform Engineer'
      && fetched[1]?.url === 'https://remotive.com/remote-jobs/beta-platform-engineer')
    pass('remotive.fetch() trims whitespace from title and url');
  else fail(`remotive.fetch() row 1 title/url = ${JSON.stringify({ title: fetched[1]?.title, url: fetched[1]?.url })}`);

  if (fetched[1]?.company === 'Remotive Board')
    pass('remotive.fetch() falls back to entry.name when company_name is empty');
  else fail(`remotive.fetch() row 1 company = ${JSON.stringify(fetched[1]?.company)}`);

  if (fetched[1]?.location === '')
    pass('remotive.fetch() yields empty location when candidate_required_location is absent');
  else fail(`remotive.fetch() row 1 location = ${JSON.stringify(fetched[1]?.location)}`);

  // company default when both company_name and entry.name are missing → 'Remotive'.
  const noName = await remotive.fetch(
    {},
    { fetchJson: async () => ({ jobs: [{ title: 'Role', url: 'https://remotive.com/remote-jobs/x' }] }) },
  );
  if (noName[0]?.company === 'Remotive')
    pass('remotive.fetch() defaults company to "Remotive" when company_name and entry.name are both missing');
  else fail(`remotive.fetch() default company = ${JSON.stringify(noName[0]?.company)}`);

  let badResponseThrew = false;
  try {
    await remotive.fetch(
      { name: 'X', provider: 'remotive' },
      { fetchJson: async () => ({ wrong: true }) },
    );
  } catch (e) {
    badResponseThrew = /unexpected API response/.test(e.message);
  }
  if (badResponseThrew) pass('remotive.fetch() throws on unexpected API response shape');
  else fail('remotive.fetch() should throw when the jobs array is absent');

} catch (e) {
  fail(`remotive provider tests crashed: ${e.message}`);
}

// ── 34. Provider — themuse ─────────────────────────────────────
console.log('\n34. Provider — themuse');

try {
  const museModule = await import(pathToFileURL(join(ROOT, 'providers/themuse.mjs')).href);
  const themuse = museModule.default;
  const { normalizeMuseJob } = museModule;

  if (themuse.id === 'themuse') pass('themuse.id is "themuse"');
  else fail(`themuse.id is ${JSON.stringify(themuse.id)}`);

  // normalizeMuseJob — field mapping
  const job = normalizeMuseJob({
    name: 'Staff AI Engineer',
    refs: { landing_page: 'https://www.themuse.com/jobs/acme/staff-ai-engineer' },
    company: { name: 'Acme Corp' },
    locations: [{ name: 'Remote' }],
  });
  if (job?.title === 'Staff AI Engineer') pass('normalizeMuseJob maps name → title');
  else fail(`normalizeMuseJob title = ${JSON.stringify(job?.title)}`);

  if (job?.url === 'https://www.themuse.com/jobs/acme/staff-ai-engineer')
    pass('normalizeMuseJob maps refs.landing_page → url');
  else fail(`normalizeMuseJob url = ${JSON.stringify(job?.url)}`);

  if (job?.company === 'Acme Corp') pass('normalizeMuseJob maps company.name → company');
  else fail(`normalizeMuseJob company = ${JSON.stringify(job?.company)}`);

  if (job?.location === 'Remote') pass('normalizeMuseJob maps locations[0].name → location');
  else fail(`normalizeMuseJob location = ${JSON.stringify(job?.location)}`);

  // Missing/invalid field handling
  if (normalizeMuseJob({ name: '', refs: { landing_page: 'https://www.themuse.com/jobs/x' }, company: { name: 'X' }, locations: [] }) === null)
    pass('normalizeMuseJob drops entries with empty title');
  else fail('normalizeMuseJob should return null for empty title');

  if (normalizeMuseJob({ name: 'Role', refs: { landing_page: '/relative' }, company: { name: 'X' }, locations: [] }) === null)
    pass('normalizeMuseJob drops entries with a non-absolute landing_page URL');
  else fail('normalizeMuseJob should return null for a relative URL');

  const noLoc = normalizeMuseJob({
    name: 'Role', refs: { landing_page: 'https://www.themuse.com/jobs/x' }, company: { name: 'X' }, locations: [],
  });
  if (noLoc?.location === '') pass('normalizeMuseJob returns empty location when locations array is empty');
  else fail(`normalizeMuseJob location for empty locations = ${JSON.stringify(noLoc?.location)}`);

  const noCompany = normalizeMuseJob({
    name: 'Role', refs: { landing_page: 'https://www.themuse.com/jobs/x' }, company: null, locations: [{ name: 'NYC' }],
  });
  if (noCompany?.company === 'The Muse') pass('normalizeMuseJob falls back to "The Muse" when company.name is missing');
  else fail(`normalizeMuseJob company fallback = ${JSON.stringify(noCompany?.company)}`);

  if (normalizeMuseJob(null) === null && normalizeMuseJob('string') === null)
    pass('normalizeMuseJob returns null for non-object inputs');
  else fail('normalizeMuseJob should return null for null/non-object input');

  // fetch() — mock ctx
  const sampleResults = [
    {
      name: 'Staff AI Engineer',
      refs: { landing_page: 'https://www.themuse.com/jobs/acme/staff-ai-engineer' },
      company: { name: 'Acme Corp' },
      locations: [{ name: 'Remote' }],
    },
    {
      name: 'Platform Engineer',
      refs: { landing_page: 'https://www.themuse.com/jobs/beta/platform-engineer' },
      company: { name: 'Beta Inc' },
      locations: [],
    },
    {
      name: '',
      refs: { landing_page: 'https://www.themuse.com/jobs/bad/role' },
      company: { name: 'Bad Co' },
      locations: [],
    },
  ];

  let capturedUrl = null;
  let capturedOpts = null;
  const fetched = await themuse.fetch(
    { name: 'The Muse Board', provider: 'themuse' },
    {
      fetchJson: async (url, opts) => {
        capturedUrl = url; capturedOpts = opts;
        return { results: sampleResults, page: 0, page_count: 1 };
      },
    },
  );

  if (capturedUrl === 'https://www.themuse.com/api/public/jobs?page=0')
    pass('themuse.fetch() requests the correct API endpoint');
  else fail(`themuse.fetch() requested ${JSON.stringify(capturedUrl)}`);

  if (capturedOpts && capturedOpts.redirect === 'error')
    pass('themuse.fetch() passes redirect:"error" to fetchJson');
  else fail(`themuse.fetch() should pass redirect:"error", got: ${JSON.stringify(capturedOpts)}`);

  if (fetched.length === 2)
    pass('themuse.fetch() normalizes 2 valid jobs (drops the empty-title entry)');
  else fail(`themuse.fetch() returned ${fetched.length} jobs (expected 2)`);

  if (fetched[0]?.title === 'Staff AI Engineer' && fetched[0]?.company === 'Acme Corp')
    pass('themuse.fetch() returns correct title and company for first result');
  else fail(`themuse.fetch() row 0 = ${JSON.stringify(fetched[0])}`);

  // Pagination: page_count > 1 causes all pages to be fetched and aggregated.
  const paginationCalls = [];
  const page1Result = { name: 'Data Engineer', refs: { landing_page: 'https://www.themuse.com/jobs/acme/de' }, company: { name: 'Acme' }, locations: [] };
  const paginatedJobs = await themuse.fetch(
    { name: 'The Muse Board', provider: 'themuse' },
    {
      fetchJson: async (url, opts) => {
        paginationCalls.push(url);
        const page = parseInt(new URL(url).searchParams.get('page') ?? '0', 10);
        if (page === 0) return { results: [sampleResults[0]], page: 0, page_count: 2 };
        return { results: [page1Result], page: 1, page_count: 2 };
      },
    },
  );
  if (paginationCalls.length === 2 &&
      paginationCalls[0] === 'https://www.themuse.com/api/public/jobs?page=0' &&
      paginationCalls[1] === 'https://www.themuse.com/api/public/jobs?page=1')
    pass('themuse.fetch() iterates all pages when page_count > 1');
  else fail(`themuse.fetch() pagination calls = ${JSON.stringify(paginationCalls)}`);

  if (paginatedJobs.length === 2 && paginatedJobs[1]?.title === 'Data Engineer')
    pass('themuse.fetch() aggregates results from all pages');
  else fail(`themuse.fetch() paginated results = ${JSON.stringify(paginatedJobs.map(j => j.title))}`);

  // page_count cap: a huge value must be clamped to 100, not cause unbounded requests.
  let cappedCalls = 0;
  await themuse.fetch(
    { name: 'X', provider: 'themuse' },
    { fetchJson: async () => { cappedCalls++; return { results: [], page: 0, page_count: 99999 }; } },
  );
  if (cappedCalls === 100) pass('themuse.fetch() clamps page_count to 100 (prevents unbounded requests)');
  else fail(`themuse.fetch() made ${cappedCalls} requests for page_count=99999 (expected 100)`);

  // Non-integer page_count must be ignored (NaN passes typeof==='number' but not Number.isInteger).
  let nonIntCalls = 0;
  await themuse.fetch(
    { name: 'X', provider: 'themuse' },
    { fetchJson: async () => { nonIntCalls++; return { results: [], page: 0, page_count: 1.5 }; } },
  );
  if (nonIntCalls === 1) pass('themuse.fetch() ignores non-integer page_count (fetches only page 0)');
  else fail(`themuse.fetch() made ${nonIntCalls} requests for page_count=1.5 (expected 1)`);

  let badResponseThrew = false;
  try {
    await themuse.fetch(
      { name: 'X', provider: 'themuse' },
      { fetchJson: async () => ({ wrong: true }) },
    );
  } catch (e) {
    badResponseThrew = /unexpected API response/.test(e.message);
  }
  if (badResponseThrew) pass('themuse.fetch() throws on unexpected API response shape');
  else fail('themuse.fetch() should throw when results array is absent');

} catch (e) {
  fail(`themuse provider tests crashed: ${e.message}`);
}

// ── 35. Provider — pinpoint ─────────────────────────────────────
console.log('\n35. Provider — pinpoint');

try {
  const pinpointModule = await import(pathToFileURL(join(ROOT, 'providers/pinpoint.mjs')).href);
  const pinpoint = pinpointModule.default;
  const { parsePinpointResponse } = pinpointModule;

  if (pinpoint.id === 'pinpoint') pass('pinpoint.id is "pinpoint"');
  else fail(`pinpoint.id is ${JSON.stringify(pinpoint.id)}`);

  // detect(): <slug>.pinpointhq.com careers_url → postings.json endpoint.
  const hit = pinpoint.detect({ name: 'Pinpoint', careers_url: 'https://workwithus.pinpointhq.com' });
  if (hit && hit.url === 'https://workwithus.pinpointhq.com/postings.json') {
    pass('pinpoint.detect() resolves <slug>.pinpointhq.com → postings.json');
  } else {
    fail(`pinpoint.detect() returned ${JSON.stringify(hit)}`);
  }

  // detect() ignores the path/locale on the careers_url — endpoint is host-rooted.
  const hitWithPath = pinpoint.detect({ name: 'X', careers_url: 'https://acme.pinpointhq.com/en/jobs' });
  if (hitWithPath && hitWithPath.url === 'https://acme.pinpointhq.com/postings.json') {
    pass('pinpoint.detect() ignores careers_url path and roots postings.json at the host');
  } else {
    fail(`pinpoint.detect() with path returned ${JSON.stringify(hitWithPath)}`);
  }

  if (pinpoint.detect({ name: 'X', careers_url: 'https://example.com/careers' }) === null) {
    pass('pinpoint.detect() returns null for non-pinpoint URLs');
  } else {
    fail('pinpoint.detect() should return null for non-pinpoint URLs');
  }

  // careers_url with non-string value → detect() returns null without crashing.
  if (pinpoint.detect({ name: 'X', careers_url: null }) === null && pinpoint.detect({ name: 'X', careers_url: 7 }) === null) {
    pass('pinpoint.detect() returns null for non-string careers_url (null and 7)');
  } else {
    fail('pinpoint.detect() should treat non-string careers_url as missing');
  }

  // SSRF: a URL with pinpointhq.com in the PATH (not host) must not be detected.
  if (pinpoint.detect({ name: 'Spoof', careers_url: 'https://evil.example/acme.pinpointhq.com/foo' }) === null) {
    pass('pinpoint.detect() rejects path-spoofed URLs');
  } else {
    fail('pinpoint.detect() must NOT misdetect path-spoofed URLs');
  }

  // SSRF: non-https careers_url must not be detected.
  if (pinpoint.detect({ name: 'Insecure', careers_url: 'http://acme.pinpointhq.com' }) === null) {
    pass('pinpoint.detect() rejects non-https careers_url');
  } else {
    fail('pinpoint.detect() must reject non-https careers_url');
  }

  // Hostname label must be a valid DNS label — not end (or start) with a hyphen.
  if (pinpoint.detect({ name: 'Trailing', careers_url: 'https://acme-.pinpointhq.com' }) === null
      && pinpoint.detect({ name: 'Leading', careers_url: 'https://-acme.pinpointhq.com' }) === null) {
    pass('pinpoint.detect() rejects tenant labels that start or end with a hyphen');
  } else {
    fail('pinpoint.detect() must reject hyphen-edged tenant labels (e.g. acme-.pinpointhq.com)');
  }

  // A hyphen in the middle of the label is still valid.
  if (pinpoint.detect({ name: 'Mid', careers_url: 'https://acme-co.pinpointhq.com' })?.url
      === 'https://acme-co.pinpointhq.com/postings.json') {
    pass('pinpoint.detect() still accepts internal hyphens (acme-co.pinpointhq.com)');
  } else {
    fail('pinpoint.detect() should accept internal hyphens in the tenant label');
  }

  // parsePinpointResponse — deterministic sample, no network.
  const sample = {
    data: [
      {
        title: 'Senior Product Manager',
        url: 'https://workwithus.pinpointhq.com/en/postings/abc-123',
        location: { id: '283', city: 'London', province: 'London', name: 'Remote' },
      },
      {
        title: '  Backend Engineer  ',                                   // trimmed
        url: '  https://workwithus.pinpointhq.com/en/postings/def-456  ', // trimmed
        location: { city: 'Berlin', province: 'Berlin' },                // no name → assembled
      },
      {
        title: 'No Location Role',
        url: 'https://workwithus.pinpointhq.com/en/postings/ghi-789',
        // location omitted → ''
      },
      { title: '', url: 'https://workwithus.pinpointhq.com/en/postings/jkl' }, // dropped: empty title
      { title: 'Missing URL Role' },                                          // dropped: no url
      { title: 'Relative URL Role', url: '/en/postings/mno' },                // dropped: non-absolute
      { title: 'Insecure URL Role', url: 'http://workwithus.pinpointhq.com/en/postings/pqr' }, // dropped: non-https
    ],
  };
  const jobs = parsePinpointResponse(sample, 'Pinpoint');

  if (jobs.length === 3) pass('parsePinpointResponse keeps 3 valid postings (drops empty-title / no-url / non-absolute / non-https)');
  else fail(`parsePinpointResponse returned ${jobs.length} postings (expected 3)`);

  // Normalized shape: exactly { title, url, company, location }.
  if (jobs[0] && Object.keys(jobs[0]).sort().join(',') === 'company,location,title,url') {
    pass('parsePinpointResponse returns the normalized { title, url, company, location } shape');
  } else {
    fail(`parsePinpointResponse row 0 keys = ${JSON.stringify(jobs[0] && Object.keys(jobs[0]))}`);
  }

  if (jobs[0]?.title === 'Senior Product Manager'
      && jobs[0]?.url === 'https://workwithus.pinpointhq.com/en/postings/abc-123'
      && jobs[0]?.company === 'Pinpoint'
      && jobs[0]?.location === 'Remote') {
    pass('parsePinpointResponse maps title/url, sets company from entry name, prefers location.name');
  } else {
    fail(`parsePinpointResponse row 0 = ${JSON.stringify(jobs[0])}`);
  }

  if (jobs[1]?.title === 'Backend Engineer'
      && jobs[1]?.url === 'https://workwithus.pinpointhq.com/en/postings/def-456') {
    pass('parsePinpointResponse trims whitespace from title and url');
  } else {
    fail(`parsePinpointResponse row 1 title/url = ${JSON.stringify({ title: jobs[1]?.title, url: jobs[1]?.url })}`);
  }

  if (jobs[1]?.location === 'Berlin, Berlin') {
    pass('parsePinpointResponse assembles location from city/province when name is absent');
  } else {
    fail(`parsePinpointResponse row 1 location = ${JSON.stringify(jobs[1]?.location)}, expected "Berlin, Berlin"`);
  }

  if (jobs[2]?.location === '') {
    pass('parsePinpointResponse yields empty location when the location object is absent');
  } else {
    fail(`parsePinpointResponse row 2 location = ${JSON.stringify(jobs[2]?.location)}`);
  }

  if (parsePinpointResponse({}, 'X').length === 0) pass('parsePinpointResponse: empty {} → empty result');
  else fail('parsePinpointResponse: empty {} should yield empty result');

  if (parsePinpointResponse({ data: null }, 'X').length === 0) {
    pass('parsePinpointResponse: null data → empty result (no crash)');
  } else {
    fail('parsePinpointResponse: null data should yield empty result');
  }

  // fetch(): requests the derived postings.json URL and passes the SSRF guard.
  let capturedUrl = null;
  let capturedOpts = null;
  const fetched = await pinpoint.fetch(
    { name: 'Pinpoint', careers_url: 'https://workwithus.pinpointhq.com' },
    { fetchJson: async (url, opts) => { capturedUrl = url; capturedOpts = opts; return sample; } },
  );

  if (capturedUrl === 'https://workwithus.pinpointhq.com/postings.json') {
    pass('pinpoint.fetch() requests the derived postings.json URL');
  } else {
    fail(`pinpoint.fetch() requested ${JSON.stringify(capturedUrl)}`);
  }

  if (capturedOpts && capturedOpts.redirect === 'error') {
    pass('pinpoint.fetch() passes redirect:"error" to fetchJson (SSRF guard)');
  } else {
    fail(`pinpoint.fetch() should pass redirect:"error", got: ${JSON.stringify(capturedOpts)}`);
  }

  if (fetched.length === 3 && fetched[0]?.company === 'Pinpoint') {
    pass('pinpoint.fetch() returns normalized jobs with company from entry name');
  } else {
    fail(`pinpoint.fetch() returned ${fetched.length} jobs, row 0 = ${JSON.stringify(fetched[0])}`);
  }

  // fetch(): a non-pinpoint careers_url cannot derive an endpoint → throws.
  let badEntryThrew = false;
  try {
    await pinpoint.fetch(
      { name: 'X', careers_url: 'https://example.com/careers' },
      { fetchJson: async () => ({ data: [] }) },
    );
  } catch (e) {
    badEntryThrew = /cannot derive API URL/.test(e.message);
  }
  if (badEntryThrew) pass('pinpoint.fetch() throws when the careers_url is not a pinpointhq.com host');
  else fail('pinpoint.fetch() should throw for a non-pinpoint careers_url');

} catch (e) {
  fail(`pinpoint provider tests crashed: ${e.message}`);
}

// ── 36. Provider — arbeitnow ────────────────────────────────────
console.log('\n36. Provider — arbeitnow');

try {
  const arbeitnowModule = await import(pathToFileURL(join(ROOT, 'providers/arbeitnow.mjs')).href);
  const arbeitnow = arbeitnowModule.default;
  const { normalizeArbeitnowJob } = arbeitnowModule;

  if (arbeitnow.id === 'arbeitnow') pass('arbeitnow.id is "arbeitnow"');
  else fail(`arbeitnow.id is ${JSON.stringify(arbeitnow.id)}`);

  // normalizeArbeitnowJob — field mapping.
  const full = normalizeArbeitnowJob(
    { title: '  Staff AI Engineer  ', url: '  https://www.arbeitnow.com/jobs/x1  ', company_name: '  Acme Co  ', location: '  Berlin  ', remote: false, created_at: 1782693032 },
    'Fallback',
  );
  if (full && full.title === 'Staff AI Engineer' && full.url === 'https://www.arbeitnow.com/jobs/x1'
      && full.company === 'Acme Co' && full.location === 'Berlin' && full.postedAt === 1782693032000) {
    pass('normalizeArbeitnowJob maps + trims title/url/company/location and converts created_at seconds → ms');
  } else {
    fail(`normalizeArbeitnowJob full row = ${JSON.stringify(full)}`);
  }

  // remote:true appends "Remote" to the location.
  const remoteJob = normalizeArbeitnowJob({ title: 'R', url: 'https://www.arbeitnow.com/jobs/r', location: 'Munich', remote: true }, 'X');
  if (remoteJob?.location === 'Munich, Remote') pass('normalizeArbeitnowJob appends "Remote" when remote is true');
  else fail(`normalizeArbeitnowJob remote location = ${JSON.stringify(remoteJob?.location)}`);

  // remote-only (no base location) → "Remote".
  const remoteOnly = normalizeArbeitnowJob({ title: 'R', url: 'https://www.arbeitnow.com/jobs/r2', remote: true }, 'X');
  if (remoteOnly?.location === 'Remote') pass('normalizeArbeitnowJob yields "Remote" when remote is true and location is absent');
  else fail(`normalizeArbeitnowJob remote-only location = ${JSON.stringify(remoteOnly?.location)}`);

  // company fallbacks: entry name, then "Arbeitnow".
  const coFromEntry = normalizeArbeitnowJob({ title: 'T', url: 'https://www.arbeitnow.com/jobs/c1', company_name: '' }, 'Entry Name');
  const coDefault = normalizeArbeitnowJob({ title: 'T', url: 'https://www.arbeitnow.com/jobs/c2' });
  if (coFromEntry?.company === 'Entry Name' && coDefault?.company === 'Arbeitnow') {
    pass('normalizeArbeitnowJob falls back company → entry name → "Arbeitnow"');
  } else {
    fail(`normalizeArbeitnowJob company fallbacks = ${JSON.stringify({ a: coFromEntry?.company, b: coDefault?.company })}`);
  }

  // drops: empty title, missing url, non-https url, malformed url, non-object.
  const drops = [
    normalizeArbeitnowJob({ title: '', url: 'https://www.arbeitnow.com/jobs/d1' }),
    normalizeArbeitnowJob({ title: 'No URL' }),
    normalizeArbeitnowJob({ title: 'Insecure', url: 'http://www.arbeitnow.com/jobs/d3' }),
    normalizeArbeitnowJob({ title: 'Relative', url: '/jobs/d4' }),
    normalizeArbeitnowJob({ title: 'Off host', url: 'https://evil.example/jobs/d5' }), // host-lock: external https dropped
    normalizeArbeitnowJob(null),
  ];
  if (drops.every(r => r === null)) pass('normalizeArbeitnowJob drops empty-title / no-url / non-https / relative / off-host / non-object');
  else fail(`normalizeArbeitnowJob drops = ${JSON.stringify(drops)}`);

  // missing created_at → no postedAt key.
  const noDate = normalizeArbeitnowJob({ title: 'T', url: 'https://www.arbeitnow.com/jobs/nd' });
  if (noDate && !('postedAt' in noDate)) pass('normalizeArbeitnowJob omits postedAt when created_at is absent');
  else fail(`normalizeArbeitnowJob postedAt presence = ${JSON.stringify(noDate)}`);

  // fetch(): pagination by self-built ?page=N, stop on a short page.
  const mk = (i) => ({ title: `Role ${i}`, url: `https://www.arbeitnow.com/jobs/x${i}`, company_name: `Co ${i}`, location: 'Berlin', remote: false, created_at: 1782693032 + i });
  const page1 = Array.from({ length: 100 }, (_, i) => mk(i));            // full page → continue
  const page2 = [mk(100), mk(101), { title: '', url: 'https://www.arbeitnow.com/jobs/bad' }]; // short page (3 < 100) → stop; 1 drop
  const requested = [];
  const pagedFetch = async (url, opts) => {
    requested.push({ url, redirect: opts?.redirect });
    const u = new URL(url);
    const page = Number(u.searchParams.get('page'));
    // links.next deliberately points at a featured ?search= URL to prove we DON'T follow it.
    if (page === 1) return { data: page1, links: { next: 'https://www.arbeitnow.com/api/job-board-api?search=foo&page=2' }, meta: {} };
    if (page === 2) return { data: page2, links: { next: null }, meta: {} };
    return { data: [], links: {}, meta: {} };
  };

  const paged = await arbeitnow.fetch({ name: 'Arbeitnow' }, { fetchJson: pagedFetch });

  if (requested.length === 2
      && requested[0].url === 'https://www.arbeitnow.com/api/job-board-api?page=1'
      && requested[1].url === 'https://www.arbeitnow.com/api/job-board-api?page=2') {
    pass('arbeitnow.fetch() builds ?page=N URLs itself (ignores links.next) and stops after the short page');
  } else {
    fail(`arbeitnow.fetch() requested = ${JSON.stringify(requested.map(r => r.url))}`);
  }

  if (requested.every(r => r.redirect === 'error')) pass('arbeitnow.fetch() passes redirect:"error" on every page (SSRF guard)');
  else fail(`arbeitnow.fetch() redirect opts = ${JSON.stringify(requested.map(r => r.redirect))}`);

  if (paged.length === 102) pass('arbeitnow.fetch() aggregates valid jobs across pages (100 + 2, dropping the empty-title row)');
  else fail(`arbeitnow.fetch() returned ${paged.length} jobs (expected 102)`);

  // max_pages cap: only the first page is requested even though it is full.
  const capRequested = [];
  await arbeitnow.fetch(
    { name: 'Arbeitnow', max_pages: 1 },
    { fetchJson: async (url, opts) => { capRequested.push(url); return { data: Array.from({ length: 100 }, (_, i) => mk(i)) }; } },
  );
  if (capRequested.length === 1 && capRequested[0] === 'https://www.arbeitnow.com/api/job-board-api?page=1') {
    pass('arbeitnow.fetch() honors max_pages (stops at the cap even on a full page)');
  } else {
    fail(`arbeitnow.fetch() max_pages:1 requested ${JSON.stringify(capRequested)}`);
  }

  // unexpected API response → throws.
  let badThrew = false;
  try {
    await arbeitnow.fetch({ name: 'X' }, { fetchJson: async () => ({ wrong: true }) });
  } catch (e) {
    badThrew = /unexpected API response/.test(e.message);
  }
  if (badThrew) pass('arbeitnow.fetch() throws on unexpected API response shape');
  else fail('arbeitnow.fetch() should throw when the data array is absent');

} catch (e) {
  fail(`arbeitnow provider tests crashed: ${e.message}`);
}

// ── 37. Provider — rippling ─────────────────────────────────────
console.log('\n37. Provider — rippling');

try {
  const ripplingModule = await import(pathToFileURL(join(ROOT, 'providers/rippling.mjs')).href);
  const rippling = ripplingModule.default;
  const { parseRipplingResponse } = ripplingModule;

  if (rippling.id === 'rippling') pass('rippling.id is "rippling"');
  else fail(`rippling.id is ${JSON.stringify(rippling.id)}`);

  // detect(): ats.rippling.com/<slug>/jobs → board API URL.
  const hit = rippling.detect({ name: 'Acme', careers_url: 'https://ats.rippling.com/acme-corp/jobs' });
  if (hit && hit.url === 'https://api.rippling.com/platform/api/ats/v1/board/acme-corp/jobs') {
    pass('rippling.detect() resolves ats.rippling.com/<slug>/jobs → board API URL');
  } else {
    fail(`rippling.detect() returned ${JSON.stringify(hit)}`);
  }

  // detect() also works when careers_url is just /<slug> (no /jobs suffix).
  const hitNoJobs = rippling.detect({ name: 'X', careers_url: 'https://ats.rippling.com/acme-corp' });
  if (hitNoJobs && hitNoJobs.url === 'https://api.rippling.com/platform/api/ats/v1/board/acme-corp/jobs') {
    pass('rippling.detect() derives the slug from the first path segment (no /jobs needed)');
  } else {
    fail(`rippling.detect() no-/jobs returned ${JSON.stringify(hitNoJobs)}`);
  }

  if (rippling.detect({ name: 'X', careers_url: 'https://example.com/acme/jobs' }) === null) {
    pass('rippling.detect() returns null for non-rippling hosts');
  } else {
    fail('rippling.detect() should return null for non-rippling hosts');
  }

  // careers_url with non-string value → detect() returns null without crashing.
  if (rippling.detect({ name: 'X', careers_url: null }) === null && rippling.detect({ name: 'X', careers_url: 7 }) === null) {
    pass('rippling.detect() returns null for non-string careers_url (null and 7)');
  } else {
    fail('rippling.detect() should treat non-string careers_url as missing');
  }

  // SSRF/format: non-https, empty path (no slug), and host-spoof in the path.
  if (rippling.detect({ name: 'X', careers_url: 'http://ats.rippling.com/acme/jobs' }) === null
      && rippling.detect({ name: 'X', careers_url: 'https://ats.rippling.com/' }) === null
      && rippling.detect({ name: 'X', careers_url: 'https://evil.example/ats.rippling.com/acme/jobs' }) === null) {
    pass('rippling.detect() rejects non-https, empty-path, and path-spoofed URLs');
  } else {
    fail('rippling.detect() must reject non-https / empty-path / path-spoofed URLs');
  }

  // Slug safety: a first segment that is not a clean token (space, dot, hyphen-edged) is rejected.
  if (rippling.detect({ name: 'X', careers_url: 'https://ats.rippling.com/a%20b/jobs' }) === null
      && rippling.detect({ name: 'X', careers_url: 'https://ats.rippling.com/acme.corp/jobs' }) === null
      && rippling.detect({ name: 'X', careers_url: 'https://ats.rippling.com/-acme/jobs' }) === null) {
    pass('rippling.detect() rejects unsafe slugs (space, dot, leading hyphen)');
  } else {
    fail('rippling.detect() must reject unsafe slugs');
  }

  // Internal hyphens are valid.
  if (rippling.detect({ name: 'X', careers_url: 'https://ats.rippling.com/just-appraised-jobs/jobs' })?.url
      === 'https://api.rippling.com/platform/api/ats/v1/board/just-appraised-jobs/jobs') {
    pass('rippling.detect() accepts slugs with internal hyphens');
  } else {
    fail('rippling.detect() should accept internal hyphens in the slug');
  }

  // parseRipplingResponse — deterministic sample (top-level array).
  const sample = [
    { uuid: '1', name: 'Account Executive', url: 'https://ats.rippling.com/acme/jobs/uuid-1', department: { label: 'Sales' }, workLocation: { label: 'Remote (United States)', id: 'x' } },
    { uuid: '2', name: '  ML Engineer  ', url: '  https://ats.rippling.com/acme/jobs/uuid-2  ', workLocation: { label: 'Canada' } },
    { uuid: '3', name: 'String Loc Role', url: 'https://ats.rippling.com/acme/jobs/uuid-3', workLocation: 'New York' }, // workLocation as bare string
    { uuid: '4', name: 'No Loc Role', url: 'https://ats.rippling.com/acme/jobs/uuid-4', workLocation: null },           // null → ''
    { uuid: '5', name: '', url: 'https://ats.rippling.com/acme/jobs/uuid-5' },                                          // drop: empty name
    { uuid: '6', name: 'No URL Role' },                                                                                 // drop: no url
    { uuid: '7', name: 'Insecure', url: 'http://ats.rippling.com/acme/jobs/uuid-7' },                                   // drop: non-https
  ];
  const jobs = parseRipplingResponse(sample, 'Acme');

  if (jobs.length === 4) pass('parseRipplingResponse keeps 4 valid postings (drops empty-name / no-url / non-https)');
  else fail(`parseRipplingResponse returned ${jobs.length} postings (expected 4)`);

  if (jobs[0] && Object.keys(jobs[0]).sort().join(',') === 'company,location,title,url') {
    pass('parseRipplingResponse returns the normalized { title, url, company, location } shape');
  } else {
    fail(`parseRipplingResponse row 0 keys = ${JSON.stringify(jobs[0] && Object.keys(jobs[0]))}`);
  }

  if (jobs[0]?.title === 'Account Executive'
      && jobs[0]?.url === 'https://ats.rippling.com/acme/jobs/uuid-1'
      && jobs[0]?.company === 'Acme'
      && jobs[0]?.location === 'Remote (United States)') {
    pass('parseRipplingResponse maps name→title, url, company from entry name, workLocation.label→location');
  } else {
    fail(`parseRipplingResponse row 0 = ${JSON.stringify(jobs[0])}`);
  }

  if (jobs[1]?.title === 'ML Engineer' && jobs[1]?.url === 'https://ats.rippling.com/acme/jobs/uuid-2') {
    pass('parseRipplingResponse trims whitespace from name and url');
  } else {
    fail(`parseRipplingResponse row 1 title/url = ${JSON.stringify({ title: jobs[1]?.title, url: jobs[1]?.url })}`);
  }

  if (jobs[2]?.location === 'New York' && jobs[3]?.location === '') {
    pass('parseRipplingResponse accepts a bare-string workLocation and yields "" when workLocation is null');
  } else {
    fail(`parseRipplingResponse loc fallbacks = ${JSON.stringify({ str: jobs[2]?.location, none: jobs[3]?.location })}`);
  }

  if (parseRipplingResponse({}, 'X').length === 0 && parseRipplingResponse(null, 'X').length === 0) {
    pass('parseRipplingResponse: non-array input → empty result (no crash)');
  } else {
    fail('parseRipplingResponse should yield empty result for non-array input');
  }

  // Regression: the per-item url is host-locked to ats.rippling.com — an external
  // https URL is dropped, a valid ats.rippling.com posting URL is kept.
  const hostLocked = parseRipplingResponse(
    [
      { name: 'External Host', url: 'https://evil.example/acme/jobs/uuid-x' },
      { name: 'Valid Host', url: 'https://ats.rippling.com/acme/jobs/uuid-9' },
    ],
    'Acme',
  );
  if (hostLocked.length === 1 && hostLocked[0]?.title === 'Valid Host'
      && hostLocked[0]?.url === 'https://ats.rippling.com/acme/jobs/uuid-9') {
    pass('parseRipplingResponse host-locks the posting url to ats.rippling.com (drops external https URLs)');
  } else {
    fail(`parseRipplingResponse host-lock = ${JSON.stringify(hostLocked)}`);
  }

  // fetch(): requests the derived API URL and passes the SSRF guard.
  let capturedUrl = null;
  let capturedOpts = null;
  const fetched = await rippling.fetch(
    { name: 'Acme', careers_url: 'https://ats.rippling.com/acme-corp/jobs' },
    { fetchJson: async (url, opts) => { capturedUrl = url; capturedOpts = opts; return sample; } },
  );

  if (capturedUrl === 'https://api.rippling.com/platform/api/ats/v1/board/acme-corp/jobs') {
    pass('rippling.fetch() requests the derived board API URL');
  } else {
    fail(`rippling.fetch() requested ${JSON.stringify(capturedUrl)}`);
  }

  if (capturedOpts && capturedOpts.redirect === 'error') {
    pass('rippling.fetch() passes redirect:"error" to fetchJson (SSRF guard)');
  } else {
    fail(`rippling.fetch() should pass redirect:"error", got: ${JSON.stringify(capturedOpts)}`);
  }

  if (fetched.length === 4 && fetched[0]?.company === 'Acme') {
    pass('rippling.fetch() returns normalized jobs with company from entry name');
  } else {
    fail(`rippling.fetch() returned ${fetched.length} jobs, row 0 = ${JSON.stringify(fetched[0])}`);
  }

  // fetch(): a non-rippling careers_url cannot derive an endpoint → throws.
  let badEntryThrew = false;
  try {
    await rippling.fetch(
      { name: 'X', careers_url: 'https://example.com/careers' },
      { fetchJson: async () => [] },
    );
  } catch (e) {
    badEntryThrew = /cannot derive API URL/.test(e.message);
  }
  if (badEntryThrew) pass('rippling.fetch() throws when the careers_url is not an ats.rippling.com host');
  else fail('rippling.fetch() should throw for a non-rippling careers_url');

} catch (e) {
  fail(`rippling provider tests crashed: ${e.message}`);
}

// ── 38. Provider — thehub ───────────────────────────────────────
console.log('\n38. Provider — thehub');

try {
  const thehubModule = await import(pathToFileURL(join(ROOT, 'providers/thehub.mjs')).href);
  const thehub = thehubModule.default;
  const { normalizeHubJob } = thehubModule;

  if (thehub.id === 'thehub') pass('thehub.id is "thehub"');
  else fail(`thehub.id is ${JSON.stringify(thehub.id)}`);

  // normalizeHubJob — full mapping.
  const full = normalizeHubJob(
    { title: '  Staff Engineer  ', absoluteJobUrl: 'https://thehub.io/jobs/abc123', company: { name: '  Light  ' }, location: { address: '  London, UK  ' }, publishedAt: '2026-06-02T06:59:54.025Z' },
    'Fallback',
  );
  if (full && full.title === 'Staff Engineer' && full.url === 'https://thehub.io/jobs/abc123'
      && full.company === 'Light' && full.location === 'London, UK'
      && full.postedAt === Date.parse('2026-06-02T06:59:54.025Z')) {
    pass('normalizeHubJob maps title/absoluteJobUrl/company.name/location.address + publishedAt → postedAt');
  } else {
    fail(`normalizeHubJob full row = ${JSON.stringify(full)}`);
  }

  // location assembled from locality/country, "Remote" appended when isRemote.
  const assembled = normalizeHubJob({ title: 'R', absoluteJobUrl: 'https://thehub.io/jobs/r', location: { locality: 'Berlin', country: 'Germany' }, isRemote: true }, 'X');
  if (assembled?.location === 'Berlin, Germany, Remote') pass('normalizeHubJob assembles locality/country and appends "Remote" when isRemote');
  else fail(`normalizeHubJob assembled location = ${JSON.stringify(assembled?.location)}`);

  // company fallbacks: entry name, then "The Hub".
  const coEntry = normalizeHubJob({ title: 'T', absoluteJobUrl: 'https://thehub.io/jobs/c1', company: {} }, 'Entry Name');
  const coDefault = normalizeHubJob({ title: 'T', absoluteJobUrl: 'https://thehub.io/jobs/c2' });
  const coBlank = normalizeHubJob({ title: 'T', absoluteJobUrl: 'https://thehub.io/jobs/c3' }, '   '); // whitespace-only → "The Hub"
  if (coEntry?.company === 'Entry Name' && coDefault?.company === 'The Hub' && coBlank?.company === 'The Hub') {
    pass('normalizeHubJob falls back company → entry name → "The Hub" (whitespace-only entry name ignored)');
  } else {
    fail(`normalizeHubJob company fallbacks = ${JSON.stringify({ a: coEntry?.company, b: coDefault?.company, c: coBlank?.company })}`);
  }

  // postedAt falls back to createdAt; omitted when both absent.
  const fromCreated = normalizeHubJob({ title: 'T', absoluteJobUrl: 'https://thehub.io/jobs/cd', createdAt: '2026-06-01T00:00:00.000Z' });
  const noDate = normalizeHubJob({ title: 'T', absoluteJobUrl: 'https://thehub.io/jobs/nd' });
  if (fromCreated?.postedAt === Date.parse('2026-06-01T00:00:00.000Z') && noDate && !('postedAt' in noDate)) {
    pass('normalizeHubJob falls back to createdAt and omits postedAt when both dates are absent');
  } else {
    fail(`normalizeHubJob date handling = ${JSON.stringify({ created: fromCreated?.postedAt, none: noDate })}`);
  }

  // host-lock + drops: off-host url, non-https url, missing url, empty title, non-object.
  const drops = [
    normalizeHubJob({ title: 'Off host', absoluteJobUrl: 'https://evil.example/jobs/x' }),
    normalizeHubJob({ title: 'Insecure', absoluteJobUrl: 'http://thehub.io/jobs/x' }),
    normalizeHubJob({ title: 'No URL' }),
    normalizeHubJob({ title: '', absoluteJobUrl: 'https://thehub.io/jobs/x' }),
    normalizeHubJob(null),
  ];
  if (drops.every(r => r === null)) {
    pass('normalizeHubJob host-locks absoluteJobUrl to thehub.io and drops off-host/non-https/no-url/empty-title/non-object');
  } else {
    fail(`normalizeHubJob drops = ${JSON.stringify(drops)}`);
  }

  // fetch(): pagination by ?page=N, stop on a short page.
  const mk = (i) => ({ title: `Role ${i}`, absoluteJobUrl: `https://thehub.io/jobs/x${i}`, company: { name: `Co ${i}` }, location: { address: 'Copenhagen, Denmark' }, publishedAt: '2026-06-02T00:00:00.000Z' });
  const hubPage1 = { docs: Array.from({ length: 15 }, (_, i) => mk(i)), page: 1, pages: 3, total: 33, limit: 15 };
  const hubPage2 = { docs: [mk(15), mk(16), { title: '', absoluteJobUrl: 'https://thehub.io/jobs/bad' }], page: 2, pages: 3, limit: 15 }; // short → stop; 1 drop
  const requested = [];
  const pagedFetch = async (url, opts) => {
    requested.push({ url, redirect: opts?.redirect });
    const page = Number(new URL(url).searchParams.get('page'));
    return page === 1 ? hubPage1 : hubPage2;
  };
  const paged = await thehub.fetch({ name: 'The Hub' }, { fetchJson: pagedFetch });

  if (requested.length === 2
      && requested[0].url === 'https://thehub.io/api/jobs?page=1'
      && requested[1].url === 'https://thehub.io/api/jobs?page=2') {
    pass('thehub.fetch() builds ?page=N URLs and stops after the short page');
  } else {
    fail(`thehub.fetch() requested = ${JSON.stringify(requested.map(r => r.url))}`);
  }

  if (requested.every(r => r.redirect === 'error')) pass('thehub.fetch() passes redirect:"error" on every page (SSRF guard)');
  else fail(`thehub.fetch() redirect opts = ${JSON.stringify(requested.map(r => r.redirect))}`);

  if (paged.length === 17) pass('thehub.fetch() aggregates valid jobs across pages (15 + 2, dropping the empty-title row)');
  else fail(`thehub.fetch() returned ${paged.length} jobs (expected 17)`);

  // Stops at the reported total pages even when every page is full.
  const fullReq = [];
  const fullPage = (page) => ({ docs: Array.from({ length: 15 }, (_, i) => mk(page * 100 + i)), page, pages: 2, limit: 15 });
  await thehub.fetch(
    { name: 'The Hub', max_pages: 10 },
    { fetchJson: async (url) => { const p = Number(new URL(url).searchParams.get('page')); fullReq.push(p); return fullPage(p); } },
  );
  if (fullReq.length === 2 && fullReq[0] === 1 && fullReq[1] === 2) {
    pass('thehub.fetch() stops at the reported total pages (pages:2) even with a higher max_pages');
  } else {
    fail(`thehub.fetch() pages-stop requested ${JSON.stringify(fullReq)}`);
  }

  // max_pages cap: only the first page is requested.
  const capReq = [];
  await thehub.fetch(
    { name: 'The Hub', max_pages: 1 },
    { fetchJson: async (url) => { capReq.push(url); return { docs: Array.from({ length: 15 }, (_, i) => mk(i)), page: 1, pages: 67, limit: 15 }; } },
  );
  if (capReq.length === 1 && capReq[0] === 'https://thehub.io/api/jobs?page=1') {
    pass('thehub.fetch() honors max_pages (stops at the cap even on a full page)');
  } else {
    fail(`thehub.fetch() max_pages:1 requested ${JSON.stringify(capReq)}`);
  }

  // A full page with a large `pages` (so neither short-stop nor pages-stop fires)
  // lets us assert the implicit default cap and the hard cap purely on page count.
  const fullDeepPage = (page) => ({ docs: Array.from({ length: 15 }, (_, i) => mk(page * 100 + i)), page, pages: 999, limit: 15 });

  // Default max_pages (no override) → exactly 3 pages.
  const defReq = [];
  await thehub.fetch(
    { name: 'The Hub' },
    { fetchJson: async (url) => { defReq.push(Number(new URL(url).searchParams.get('page'))); return fullDeepPage(defReq.length); } },
  );
  if (defReq.length === 3 && defReq[0] === 1 && defReq[2] === 3) {
    pass('thehub.fetch() defaults to 3 pages when max_pages is not set');
  } else {
    fail(`thehub.fetch() default-cap requested ${JSON.stringify(defReq)} (expected pages 1..3)`);
  }

  // max_pages above the hard cap → clamped to 67 pages.
  const cap67Req = [];
  await thehub.fetch(
    { name: 'The Hub', max_pages: 1000 },
    { fetchJson: async (url) => { cap67Req.push(Number(new URL(url).searchParams.get('page'))); return fullDeepPage(cap67Req.length); } },
  );
  if (cap67Req.length === 67 && cap67Req[0] === 1 && cap67Req[66] === 67) {
    pass('thehub.fetch() clamps max_pages to the hard cap of 67');
  } else {
    fail(`thehub.fetch() hard-cap requested ${cap67Req.length} pages (expected 67)`);
  }

  // unexpected API response → throws.
  let badThrew = false;
  try {
    await thehub.fetch({ name: 'X' }, { fetchJson: async () => ({ wrong: true }) });
  } catch (e) {
    badThrew = /unexpected API response/.test(e.message);
  }
  if (badThrew) pass('thehub.fetch() throws on unexpected API response shape');
  else fail('thehub.fetch() should throw when the docs array is absent');

} catch (e) {
  fail(`thehub provider tests crashed: ${e.message}`);
}

// ── 39. Provider — landingjobs ──────────────────────────────────
console.log('\n39. Provider — landingjobs');

try {
  const ljModule = await import(pathToFileURL(join(ROOT, 'providers/landingjobs.mjs')).href);
  const landingjobs = ljModule.default;
  const { normalizeLandingJob, companyFromUrl } = ljModule;

  if (landingjobs.id === 'landingjobs') pass('landingjobs.id is "landingjobs"');
  else fail(`landingjobs.id is ${JSON.stringify(landingjobs.id)}`);

  // companyFromUrl — humanizes the /at/<slug>/ segment; '' for other shapes.
  if (companyFromUrl('https://landing.jobs/at/damia-group-portugal/some-job') === 'Damia Group Portugal'
      && companyFromUrl('https://landing.jobs/at/inscale/x') === 'Inscale'
      && companyFromUrl('https://landing.jobs/jobs/123') === ''
      && companyFromUrl('not a url') === '') {
    pass('companyFromUrl humanizes the /at/<slug>/ segment and returns "" for other shapes');
  } else {
    fail(`companyFromUrl = ${JSON.stringify([
      companyFromUrl('https://landing.jobs/at/damia-group-portugal/some-job'),
      companyFromUrl('https://landing.jobs/jobs/123'),
    ])}`);
  }

  // normalizeLandingJob — full mapping.
  const full = normalizeLandingJob(
    { title: '  Senior Java Dev  ', url: 'https://landing.jobs/at/inscale/senior-java-dev', locations: [{ city: 'Lisbon', country_code: 'PT' }], remote: false, published_at: '2025-02-26T09:38:38.127Z' },
    'Fallback',
  );
  if (full && full.title === 'Senior Java Dev' && full.url === 'https://landing.jobs/at/inscale/senior-java-dev'
      && full.company === 'Inscale' && full.location === 'Lisbon, PT'
      && full.postedAt === Date.parse('2025-02-26T09:38:38.127Z')) {
    pass('normalizeLandingJob maps title/url, derives company from slug, builds location, parses published_at');
  } else {
    fail(`normalizeLandingJob full row = ${JSON.stringify(full)}`);
  }

  // remote:true appends "Remote".
  const remoteJob = normalizeLandingJob({ title: 'R', url: 'https://landing.jobs/at/acme/r', locations: [{ city: 'Berlin', country_code: 'DE' }], remote: true });
  if (remoteJob?.location === 'Berlin, DE, Remote') pass('normalizeLandingJob appends "Remote" when remote is true');
  else fail(`normalizeLandingJob remote location = ${JSON.stringify(remoteJob?.location)}`);

  // company fallback: url is landing.jobs but not /at/<slug>/ → entry name, then "Landing.jobs".
  const coEntry = normalizeLandingJob({ title: 'T', url: 'https://landing.jobs/jobs/99' }, 'Entry Name');
  const coDefault = normalizeLandingJob({ title: 'T', url: 'https://landing.jobs/jobs/100' });
  const coBlank = normalizeLandingJob({ title: 'T', url: 'https://landing.jobs/jobs/101' }, '   '); // whitespace-only → "Landing.jobs"
  if (coEntry?.company === 'Entry Name' && coDefault?.company === 'Landing.jobs' && coBlank?.company === 'Landing.jobs') {
    pass('normalizeLandingJob falls back company → entry name → "Landing.jobs" (whitespace-only entry name ignored)');
  } else {
    fail(`normalizeLandingJob company fallbacks = ${JSON.stringify({ a: coEntry?.company, b: coDefault?.company, c: coBlank?.company })}`);
  }

  // postedAt falls back to created_at; omitted when both absent.
  const fromCreated = normalizeLandingJob({ title: 'T', url: 'https://landing.jobs/at/acme/cd', created_at: '2025-02-26T08:53:02.254Z' });
  const noDate = normalizeLandingJob({ title: 'T', url: 'https://landing.jobs/at/acme/nd' });
  if (fromCreated?.postedAt === Date.parse('2025-02-26T08:53:02.254Z') && noDate && !('postedAt' in noDate)) {
    pass('normalizeLandingJob falls back to created_at and omits postedAt when both dates are absent');
  } else {
    fail(`normalizeLandingJob date handling = ${JSON.stringify({ created: fromCreated?.postedAt, none: noDate })}`);
  }

  // host-lock + drops: off-host, non-https, missing url, empty title, non-object.
  const drops = [
    normalizeLandingJob({ title: 'Off host', url: 'https://evil.example/at/acme/x' }),
    normalizeLandingJob({ title: 'Insecure', url: 'http://landing.jobs/at/acme/x' }),
    normalizeLandingJob({ title: 'No URL' }),
    normalizeLandingJob({ title: '', url: 'https://landing.jobs/at/acme/x' }),
    normalizeLandingJob(null),
  ];
  if (drops.every(r => r === null)) {
    pass('normalizeLandingJob host-locks url to landing.jobs and drops off-host/non-https/no-url/empty-title/non-object');
  } else {
    fail(`normalizeLandingJob drops = ${JSON.stringify(drops)}`);
  }

  // fetch(): single call to the feed URL, normalized, with the SSRF guard.
  const sample = [
    { title: 'Role A', url: 'https://landing.jobs/at/acme/role-a', locations: [{ city: 'Porto', country_code: 'PT' }], remote: false, published_at: '2025-02-26T09:38:38.127Z' },
    { title: '', url: 'https://landing.jobs/at/acme/bad' }, // dropped: empty title
  ];
  let capturedUrl = null;
  let capturedOpts = null;
  const fetched = await landingjobs.fetch(
    { name: 'Landing.jobs' },
    { fetchJson: async (url, opts) => { capturedUrl = url; capturedOpts = opts; return sample; } },
  );

  if (capturedUrl === 'https://landing.jobs/api/v1/jobs') pass('landingjobs.fetch() requests the v1 feed URL');
  else fail(`landingjobs.fetch() requested ${JSON.stringify(capturedUrl)}`);

  if (capturedOpts && capturedOpts.redirect === 'error') pass('landingjobs.fetch() passes redirect:"error" (SSRF guard)');
  else fail(`landingjobs.fetch() should pass redirect:"error", got: ${JSON.stringify(capturedOpts)}`);

  if (fetched.length === 1 && fetched[0]?.company === 'Acme') {
    pass('landingjobs.fetch() returns normalized jobs (drops the empty-title row, derives company)');
  } else {
    fail(`landingjobs.fetch() returned ${fetched.length} jobs, row 0 = ${JSON.stringify(fetched[0])}`);
  }

  // unexpected (non-array) response → throws.
  let badThrew = false;
  try {
    await landingjobs.fetch({ name: 'X' }, { fetchJson: async () => ({ jobs: [] }) });
  } catch (e) {
    badThrew = /unexpected API response/.test(e.message);
  }
  if (badThrew) pass('landingjobs.fetch() throws on a non-array API response');
  else fail('landingjobs.fetch() should throw when the response is not an array');

} catch (e) {
  fail(`landingjobs provider tests crashed: ${e.message}`);
}
  

// -- 40. Provider - hackernews ---------------------------------------
console.log('\n40. Provider - hackernews');

try {
  const hn = (await import(pathToFileURL(join(ROOT, 'providers/hackernews.mjs')).href)).default;
  const { parseHnComment, resolveLatestThreadId } =
    await import(pathToFileURL(join(ROOT, 'providers/hackernews.mjs')).href);

  // resolveLatestThreadId ─ happy path
  const fakeSearch = {
    hits: [
      { objectID: '99999999', title: 'Ask HN: Who is hiring? (June 2025)' },
      { objectID: '88888888', title: 'Ask HN: Who wants to be hired? (June 2025)' },
    ],
  };
  if (resolveLatestThreadId(fakeSearch) === '99999999') {
    pass('resolveLatestThreadId picks the first matching "Who is hiring?" hit');
  } else {
    fail(`resolveLatestThreadId returned ${resolveLatestThreadId(fakeSearch)}`);
  }

  // resolveLatestThreadId ─ no matching hit
  const noMatch = { hits: [{ objectID: '11111', title: 'Ask HN: Who wants to be hired?' }] };
  if (resolveLatestThreadId(noMatch) === null) {
    pass('resolveLatestThreadId returns null when no thread matches');
  } else {
    fail('resolveLatestThreadId should return null for non-hiring threads');
  }

  // resolveLatestThreadId ─ bad input
  if (resolveLatestThreadId(null) === null && resolveLatestThreadId({}) === null) {
    pass('resolveLatestThreadId handles null / empty input gracefully');
  } else {
    fail('resolveLatestThreadId should return null for bad input');
  }

  // parseHnComment ─ full pipe-delimited format
  const fullFmt = 'Acme Corp | Senior Engineer | Remote | https://acme.com/jobs/123\nWe are hiring…';
  const parsed = parseHnComment(fullFmt, 'https://news.ycombinator.com/item?id=1');
  if (parsed && parsed.company === 'Acme Corp' && parsed.location === 'Remote') {
    pass('parseHnComment extracts company and location from pipe-delimited header');
  } else {
    fail(`parseHnComment pipe format: ${JSON.stringify(parsed)}`);
  }
  if (parsed && parsed.url === 'https://acme.com/jobs/123') {
    pass('parseHnComment extracts URL from comment text');
  } else {
    fail(`parseHnComment url: ${JSON.stringify(parsed?.url)}`);
  }

  // parseHnComment ─ URL in first line stripped from title
  if (parsed && !parsed.title.includes('https://')) {
    pass('parseHnComment strips URLs from the title field');
  } else {
    fail(`parseHnComment title still contains URL: ${JSON.stringify(parsed?.title)}`);
  }

  // parseHnComment ─ free-form (no pipes, no URL in text)
  const freeFmt = 'Looking for a Rails dev, anywhere, part-time.';
  const parsedFree = parseHnComment(freeFmt, 'https://news.ycombinator.com/item?id=1');
  if (parsedFree && parsedFree.title === freeFmt && parsedFree.url === 'https://news.ycombinator.com/item?id=1') {
    pass('parseHnComment handles free-form comment, falls back to thread URL');
  } else {
    fail(`parseHnComment free-form: ${JSON.stringify(parsedFree)}`);
  }
  if (parsedFree && parsedFree.company === '' && parsedFree.location === '') {
    pass('parseHnComment leaves company/location empty for free-form comments');
  } else {
    fail(`parseHnComment free-form company/location: ${JSON.stringify(parsedFree)}`);
  }

  // parseHnComment ─ HTML entities and tags
  const htmlFmt = '<p>Beta &amp; Co | Staff SWE | New York, NY | <a href="https://beta.io/jobs">https://beta.io/jobs</a></p>';
  const parsedHtml = parseHnComment(htmlFmt, '');
  if (parsedHtml && parsedHtml.company === 'Beta & Co') {
    pass('parseHnComment decodes HTML entities (company name)');
  } else {
    fail(`parseHnComment HTML entity decode: ${JSON.stringify(parsedHtml?.company)}`);
  }
  if (parsedHtml && parsedHtml.url === 'https://beta.io/jobs') {
    pass('parseHnComment extracts href URL from anchor tags');
  } else {
    fail(`parseHnComment anchor URL: ${JSON.stringify(parsedHtml?.url)}`);
  }

  // parseHnComment ─ <p> paragraph body must not bleed into location field
  // Real HN posts often have "Company | Role | Location<p>Body text..." where the
  // second <p> paragraph (job description) runs on without a 4th pipe segment.
  // The parser must convert block tags to newlines so parts[2] stays clean.
  const bleedFmt = '<p>Linear | Product Engineer | Remote<p>We are hiring at https://linear.app/careers/pe-2025';
  const parsedBleed = parseHnComment(bleedFmt, 'https://news.ycombinator.com/item?id=1');
  if (parsedBleed && parsedBleed.location === 'Remote') {
    pass('parseHnComment location does not bleed body paragraph text (block tag newline fix)');
  } else {
    fail(`parseHnComment location bleed: ${JSON.stringify(parsedBleed?.location)}`);
  }
  if (parsedBleed && parsedBleed.url === 'https://linear.app/careers/pe-2025') {
    pass('parseHnComment finds URL in body paragraph when absent from header line');
  } else {
    fail(`parseHnComment body-paragraph URL: ${JSON.stringify(parsedBleed?.url)}`);
  }

  // parseHnComment ─ deleted / empty comments return null
  if (parseHnComment('', '') === null && parseHnComment(null, '') === null) {
    pass('parseHnComment returns null for empty / null input');
  } else {
    fail('parseHnComment should return null for empty/null input');
  }

  // provider.fetch() — integration with mock ctx
  const FAKE_THREAD_ID = '42424242';
  const FAKE_THREAD_URL = `https://news.ycombinator.com/item?id=${FAKE_THREAD_ID}`;

  const fakeSearchResp = {
    hits: [{ objectID: FAKE_THREAD_ID, title: 'Ask HN: Who is hiring? (June 2025)' }],
  };
  const fakeItemResp = {
    id: FAKE_THREAD_ID,
    children: [
      {
        objectID: 'c1',
        text: 'Startup XYZ | Backend Engineer | San Francisco | https://xyz.io/careers',
        created_at: '2025-06-01T10:00:00Z',
      },
      { objectID: 'c2', deleted: true, text: '' },      // deleted — should be skipped
      { objectID: 'c3', text: '' },                      // empty — should be skipped
      {
        objectID: 'c4',
        text: 'Freelance gig, no URL here, DM me.',      // no URL — falls back to thread URL
        created_at: '2025-06-01T11:00:00Z',
      },
    ],
  };

  let searchFetched = false;
  let itemFetched = false;
  const mockCtx = {
    async fetchJson(url, _opts) {
      if (url.includes('search_by_date')) { searchFetched = true; return fakeSearchResp; }
      if (url.includes(`/items/${FAKE_THREAD_ID}`)) { itemFetched = true; return fakeItemResp; }
      throw new Error(`hackernews mock: unexpected fetch ${url}`);
    },
  };

  const jobs = await hn.fetch({ name: 'HN Hiring', provider: 'hackernews' }, mockCtx);

  if (searchFetched && itemFetched) {
    pass('hackernews.fetch() calls search API then items API');
  } else {
    fail(`hackernews.fetch() API calls: search=${searchFetched} item=${itemFetched}`);
  }

  if (jobs.length === 2) {
    pass('hackernews.fetch() returns 2 jobs (skips deleted + empty comments)');
  } else {
    fail(`hackernews.fetch() returned ${jobs.length} jobs (expected 2)`);
  }

  if (jobs[0]?.company === 'Startup XYZ' && jobs[0]?.location === 'San Francisco') {
    pass('hackernews.fetch() maps pipe-delimited company and location');
  } else {
    fail(`hackernews.fetch() row 0: ${JSON.stringify(jobs[0])}`);
  }

  if (jobs[0]?.url === 'https://xyz.io/careers') {
    pass('hackernews.fetch() maps job URL from comment text');
  } else {
    fail(`hackernews.fetch() row 0 url: ${JSON.stringify(jobs[0]?.url)}`);
  }

  if (jobs[0]?.postedAt === Date.parse('2025-06-01T10:00:00Z')) {
    pass('hackernews.fetch() parses created_at to postedAt epoch ms');
  } else {
    fail(`hackernews.fetch() postedAt: ${JSON.stringify(jobs[0]?.postedAt)}`);
  }

  if (jobs[1]?.url === FAKE_THREAD_URL) {
    pass('hackernews.fetch() falls back to thread URL for comments with no link');
  } else {
    fail(`hackernews.fetch() fallback url: ${JSON.stringify(jobs[1]?.url)}`);
  }

  // provider.fetch() — throws when no thread found
  let threw = false;
  try {
    await hn.fetch({ name: 'HN' }, {
      async fetchJson() { return { hits: [] }; },
    });
  } catch (e) {
    threw = true;
  }
  if (threw) {
    pass('hackernews.fetch() throws when "Who is hiring?" thread not found');
  } else {
    fail('hackernews.fetch() should throw when no matching thread found');
  }
} catch (e) {
  fail(`hackernews provider tests crashed: ${e.message}`);
}

// -- 40. Provider - himalayas --------------------------------------------
console.log('\n40. Provider - himalayas');

try {
  const himalayasModule = await import(pathToFileURL(join(ROOT, 'providers/himalayas.mjs')).href);
  const himalayas = himalayasModule.default;
  const { parseHimalayasResponse } = himalayasModule;

  if (himalayas.id === 'himalayas') pass('himalayas.id is "himalayas"');
  else fail(`himalayas.id is ${JSON.stringify(himalayas.id)}`);

  const hit = himalayas.detect({ name: 'Himalayas', provider: 'himalayas' });
  if (hit && hit.url === 'https://himalayas.app/jobs/api?limit=50') {
    pass('himalayas.detect() claims explicit provider config');
  } else {
    fail(`himalayas.detect() returned ${JSON.stringify(hit)}`);
  }

  if (himalayas.detect({ name: 'Remote Board', provider: 'remotive' }) === null) {
    pass('himalayas.detect() ignores other provider ids');
  } else {
    fail('himalayas.detect() should only claim provider: himalayas');
  }

  const sample = {
    jobs: [
      {
        title: '  Staff AI Engineer  ',
        companyName: ' Acme Labs ',
        companySlug: 'acme-labs',
        locationRestrictions: ['Worldwide', 'Europe'],
        pubDate: 1782538666,
        applicationLink: 'https://himalayas.app/companies/acme-labs/jobs/staff-ai-engineer',
        guid: 'https://himalayas.app/companies/acme-labs/jobs/staff-ai-engineer-guid',
      },
      {
        title: 'Product Manager',
        companyName: 'Fallback Co',
        companySlug: 'fallback-co',
        locationRestrictions: [],
        pubDate: '2026-01-02T09:00:00Z',
        applicationLink: '',
        guid: 'https://himalayas.app/companies/fallback-co/jobs/product-manager',
      },
      {
        title: 'Missing Link Role',
        companyName: 'Dropped Co',
        locationRestrictions: ['United States'],
      },
      {
        title: 'Off Host Role',
        companyName: 'Bad Co',
        locationRestrictions: ['Remote'],
        applicationLink: 'https://example.com/companies/bad/jobs/off-host',
      },
      {
        title: 'HTTP Role',
        companyName: 'Bad Scheme Co',
        locationRestrictions: ['Remote'],
        applicationLink: 'http://himalayas.app/companies/bad/jobs/http-role',
      },
      {
        title: '   ',
        companyName: 'Blank Title Co',
        locationRestrictions: ['Remote'],
        applicationLink: 'https://himalayas.app/companies/blank/jobs/blank-title',
      },
    ],
  };
  const jobs = parseHimalayasResponse(sample);

  if (jobs.length === 2) pass('parseHimalayasResponse keeps 2 jobs (drops missing/off-host/http/blank-title rows)');
  else fail(`parseHimalayasResponse returned ${jobs.length} jobs (expected 2)`);

  if (jobs[0]?.title === 'Staff AI Engineer' && jobs[0]?.company === 'Acme Labs') {
    pass('parseHimalayasResponse trims title and companyName');
  } else {
    fail(`row 0 title/company = ${JSON.stringify({ title: jobs[0]?.title, company: jobs[0]?.company })}`);
  }

  if (jobs[0]?.location === 'Worldwide, Europe') {
    pass('parseHimalayasResponse joins locationRestrictions');
  } else {
    fail(`row 0 location = ${JSON.stringify(jobs[0]?.location)}`);
  }

  if (jobs[0]?.url === 'https://himalayas.app/companies/acme-labs/jobs/staff-ai-engineer') {
    pass('parseHimalayasResponse maps applicationLink to url');
  } else {
    fail(`row 0 url = ${JSON.stringify(jobs[0]?.url)}`);
  }

  if (jobs[0]?.postedAt === 1782538666 * 1000) {
    pass('parseHimalayasResponse converts epoch seconds pubDate -> postedAt ms');
  } else {
    fail(`row 0 postedAt = ${JSON.stringify(jobs[0]?.postedAt)}`);
  }

  if (jobs[1]?.url === 'https://himalayas.app/companies/fallback-co/jobs/product-manager') {
    pass('parseHimalayasResponse falls back to guid when applicationLink is missing');
  } else {
    fail(`row 1 url = ${JSON.stringify(jobs[1]?.url)}`);
  }

  if (jobs[1]?.postedAt === Date.parse('2026-01-02T09:00:00Z')) {
    pass('parseHimalayasResponse parses string pubDate -> postedAt');
  } else {
    fail(`row 1 postedAt = ${JSON.stringify(jobs[1]?.postedAt)}`);
  }

  if (parseHimalayasResponse({}).length === 0 && parseHimalayasResponse(null).length === 0) {
    pass('parseHimalayasResponse empty / non-object payload -> empty result (no crash)');
  } else {
    fail('parseHimalayasResponse invalid payload should yield empty result');
  }

  let capturedUrl = null;
  let capturedOpts = null;
  const fetched = await himalayas.fetch(
    { name: 'Himalayas', provider: 'himalayas' },
    { fetchJson: async (url, opts) => { capturedUrl = url; capturedOpts = opts; return sample; } },
  );

  if (capturedUrl === 'https://himalayas.app/jobs/api?limit=50') {
    pass('himalayas.fetch() requests the pinned API URL');
  } else {
    fail(`himalayas.fetch() requested ${JSON.stringify(capturedUrl)}`);
  }

  if (capturedOpts && capturedOpts.redirect === 'error') {
    pass('himalayas.fetch() passes redirect:"error" to fetchJson');
  } else {
    fail(`himalayas.fetch() should pass redirect:"error", got: ${JSON.stringify(capturedOpts)}`);
  }

  if (fetched[0]?.company === 'Acme Labs' && fetched[0]?.title === 'Staff AI Engineer') {
    pass('provider: himalayas config returns normalized jobs');
  } else {
    fail(`himalayas.fetch() normalized row = ${JSON.stringify(fetched[0])}`);
  }
} catch (e) {
  fail(`himalayas provider tests crashed: ${e.message}`);
}

// ── 41. Provider — jobicy ───────────────────────────────────────
console.log('\n41. Provider — jobicy');

try {
  const jobicy = (await import(pathToFileURL(join(ROOT, 'providers/jobicy.mjs')).href)).default;
  const { parseJobicyResponse } = await import(pathToFileURL(join(ROOT, 'providers/jobicy.mjs')).href);

  if (jobicy.id === 'jobicy') pass('jobicy.id is "jobicy"');
  else fail(`jobicy.id is ${JSON.stringify(jobicy.id)}`);

  const hit = jobicy.detect({ name: 'Jobicy Board', provider: 'jobicy' });
  if (hit && hit.url === 'https://jobicy.com/api/v2/remote-jobs?count=50') {
    pass('jobicy.detect() claims explicit provider config');
  } else {
    fail(`jobicy.detect() returned ${JSON.stringify(hit)}`);
  }

  if (jobicy.detect({ name: 'Remote Board', provider: 'remoteok' }) === null) {
    pass('jobicy.detect() ignores other provider ids');
  } else {
    fail('jobicy.detect() should only claim provider: jobicy');
  }

  const sample = {
    jobs: [
      {
        jobTitle: 'Senior AI Engineer',
        companyName: 'Acme Corp',
        jobGeo: 'Worldwide',
        url: 'https://jobicy.com/jobs/senior-ai-engineer',
        pubDate: '2026-06-27T10:00:00',
      },
      {
        jobTitle: 'Staff Backend Developer',
        companyName: 'Globex',
        jobGeo: 'Europe',
        url: 'https://jobicy.com/jobs/staff-backend-developer',
        pubDate: '2026-06-25T12:00:00Z',
      },
      {
        jobTitle: 'Role With Missing URL',
        companyName: 'Incomplete',
        jobGeo: 'USA',
        pubDate: '2026-06-24T08:00:00Z',
      },
      {
        jobTitle: 'Role With Invalid URL',
        companyName: 'Invalid',
        url: 'not-a-valid-url',
        jobGeo: 'USA',
      },
      {
        jobTitle: '',
        companyName: 'Empty Title',
        url: 'https://jobicy.com/jobs/empty-title',
        jobGeo: 'USA',
      }
    ]
  };

  const jobs = parseJobicyResponse(sample, 'Jobicy Board');

  if (jobs.length === 2) pass('parseJobicyResponse keeps 2 jobs (drops missing/invalid url and empty title)');
  else fail(`parseJobicyResponse returned ${jobs.length} jobs (expected 2)`);

  if (jobs[0]?.company === 'Acme Corp' && jobs[0]?.title === 'Senior AI Engineer') {
    pass('parseJobicyResponse maps jobTitle -> title, companyName -> company');
  } else {
    fail(`row 0 title/company = ${JSON.stringify({ title: jobs[0]?.title, company: jobs[0]?.company })}`);
  }

  if (jobs[0]?.url === 'https://jobicy.com/jobs/senior-ai-engineer') {
    pass('parseJobicyResponse maps url to url');
  } else {
    fail(`row 0 url = ${JSON.stringify(jobs[0]?.url)}`);
  }

  if (jobs[0]?.location === 'Worldwide') {
    pass('parseJobicyResponse maps jobGeo to location');
  } else {
    fail(`row 0 location = ${JSON.stringify(jobs[0]?.location)}`);
  }

  if (jobs[0]?.postedAt === Date.parse('2026-06-27T10:00:00')) {
    pass('parseJobicyResponse parses pubDate -> postedAt');
  } else {
    fail(`row 0 postedAt = ${JSON.stringify(jobs[0]?.postedAt)}`);
  }

  if (jobs[1]?.company === 'Globex' && jobs[1]?.title === 'Staff Backend Developer') {
    pass('parseJobicyResponse parses second job correctly');
  } else {
    fail(`row 1 = ${JSON.stringify(jobs[1])}`);
  }

  if (parseJobicyResponse('', 'X').length === 0 && parseJobicyResponse(null, 'X').length === 0) {
    pass('parseJobicyResponse empty / non-object payload -> empty result (no crash)');
  } else {
    fail('parseJobicyResponse empty / non-object payload should yield empty result');
  }

  let capturedUrl = null;
  let capturedOpts = null;
  const fetched = await jobicy.fetch(
    { name: 'Jobicy Board', provider: 'jobicy' },
    { fetchJson: async (url, opts) => { capturedUrl = url; capturedOpts = opts; return sample; } },
  );

  if (capturedUrl === 'https://jobicy.com/api/v2/remote-jobs?count=50') {
    pass('jobicy.fetch() requests the pinned JSON feed URL');
  } else {
    fail(`jobicy.fetch() requested ${JSON.stringify(capturedUrl)}`);
  }

  if (capturedOpts && capturedOpts.redirect === 'error') {
    pass('jobicy.fetch() passes redirect:"error" to fetchJson');
  } else {
    fail(`jobicy.fetch() should pass redirect:"error", got: ${JSON.stringify(capturedOpts)}`);
  }

  if (fetched[0]?.company === 'Acme Corp' && fetched[0]?.title === 'Senior AI Engineer') {
    pass('provider: jobicy config returns normalized jobs');
  } else {
    fail(`jobicy.fetch() normalized row = ${JSON.stringify(fetched[0])}`);
  }

} catch (e) {
  fail(`jobicy provider tests crashed: ${e.message}`);
}

// ── 42. PROVIDERS — JustJoin.it ───────────────────────────────────────────

console.log('\n42. Provider — justjoin');

try {
  const jj = (await import(pathToFileURL(join(ROOT, 'providers/justjoin.mjs')).href)).default;
  const { parseJustJoinResponse } = await import(pathToFileURL(join(ROOT, 'providers/justjoin.mjs')).href);

  if (jj.id === 'justjoin') pass('justjoin.id is "justjoin"');
  else fail(`justjoin.id is ${JSON.stringify(jj.id)}`);

  if (jj.detect({ name: 'JustJoin', careers_url: 'https://justjoin.it/job-offers/all-locations' })?.url) {
    pass('justjoin.detect() matches job-offers URL');
  } else {
    fail('justjoin.detect() should match justjoin.it job-offers URL');
  }

  if (jj.detect({ name: 'X', careers_url: 'https://evil.example/justjoin.it/job-offers' }) === null) {
    pass('justjoin.detect() rejects path-spoofed URLs');
  } else {
    fail('justjoin.detect() must reject path-spoofed URLs');
  }

  if (jj.detect({ name: 'X', api: 'https://justjoin.it/api/candidate-api/offers/count' }) === null) {
    pass('justjoin.detect() rejects non-offers API paths');
  } else {
    fail('justjoin.detect() must reject non-offers API paths');
  }

  const fakeResponse = {
    data: [
      {
        slug: 'acme-senior-dev-warsaw-javascript',
        title: 'Senior Developer',
        companyName: 'Acme',
        workplaceType: 'remote',
        locations: [{ city: 'Warszawa' }],
        publishedAt: '2026-06-12T10:00:00.000Z',
      },
      { slug: '', title: 'Missing Slug', companyName: 'Broken' },
      null,
    ],
    meta: { next: { cursor: null } },
  };

  const parsed = parseJustJoinResponse(fakeResponse);
  if (parsed.length === 1) pass('justjoin parser filters malformed rows');
  else fail(`justjoin parser returned ${parsed.length} rows, expected 1`);

  if (parsed[0].title === 'Senior Developer' && parsed[0].url === 'https://justjoin.it/job-offer/acme-senior-dev-warsaw-javascript') {
    pass('justjoin parser maps title and URL');
  } else {
    fail(`justjoin parser mapped title/url incorrectly: ${JSON.stringify(parsed[0])}`);
  }

  if (parsed[0].company === 'Acme' && parsed[0].location === 'remote, Warszawa' && typeof parsed[0].postedAt === 'number') {
    pass('justjoin parser maps company, location, and postedAt');
  } else {
    fail(`justjoin parser mapped fields incorrectly: ${JSON.stringify(parsed[0])}`);
  }

  let capturedUrl = '';
  let capturedOpts = null;
  const fetched = await jj.fetch(
    { name: 'JustJoin', careers_url: 'https://justjoin.it/job-offers/all-locations', max_pages: 1 },
    {
      transport: 'http',
      fetchJson: async (url, opts) => {
        capturedUrl = url;
        capturedOpts = opts;
        return fakeResponse;
      },
      fetchText: async () => '',
    },
  );
  if (fetched.length === 1 && capturedUrl.startsWith('https://justjoin.it/api/candidate-api/offers?')) {
    pass('justjoin.fetch() uses candidate API endpoint');
  } else {
    fail(`justjoin.fetch() endpoint/result wrong: ${capturedUrl} ${JSON.stringify(fetched)}`);
  }

  if (capturedOpts && capturedOpts.redirect === 'error') pass('justjoin.fetch() passes redirect:"error"');
  else fail(`justjoin.fetch() should pass redirect:"error", got ${JSON.stringify(capturedOpts)}`);

  let ssrfRejected = false;
  try {
    await jj.fetch(
      { name: 'Evil', careers_url: 'https://evil.example/job-offers/all-locations' },
      {
        transport: 'http',
        fetchJson: async () => { throw new Error('SSRF! should not reach here'); },
        fetchText: async () => '',
      },
    );
  } catch (e) {
    if (e.message.includes('trusted justjoin.it')) ssrfRejected = true;
  }
  if (ssrfRejected) pass('justjoin.fetch() rejects untrusted host');
  else fail('justjoin.fetch() should reject untrusted host');

  let badShape = false;
  try {
    parseJustJoinResponse({ jobs: [] });
  } catch (e) {
    if (e.message.includes('unexpected API response')) badShape = true;
  }
  if (badShape) pass('justjoin parser throws on bad response shape');
  else fail('justjoin parser should throw on bad response shape');
} catch (e) {
  fail(`justjoin provider tests crashed: ${e.message}`);
}

// ── 43. PROVIDERS — NoFluffJobs ───────────────────────────────────────────

console.log('\n43. Provider — nofluffjobs');

try {
  const nfj = (await import(pathToFileURL(join(ROOT, 'providers/nofluffjobs.mjs')).href)).default;
  const { parseNoFluffJobsResponse } = await import(pathToFileURL(join(ROOT, 'providers/nofluffjobs.mjs')).href);

  if (nfj.id === 'nofluffjobs') pass('nofluffjobs.id is "nofluffjobs"');
  else fail(`nofluffjobs.id is ${JSON.stringify(nfj.id)}`);

  if (nfj.detect({ name: 'NoFluff', careers_url: 'https://nofluffjobs.com/pl' })?.url) {
    pass('nofluffjobs.detect() matches nofluffjobs.com URL');
  } else {
    fail('nofluffjobs.detect() should match nofluffjobs.com URL');
  }

  if (nfj.detect({ name: 'X', careers_url: 'https://evil.example/nofluffjobs.com/pl' }) === null) {
    pass('nofluffjobs.detect() rejects path-spoofed URLs');
  } else {
    fail('nofluffjobs.detect() must reject path-spoofed URLs');
  }

  const fakeResponse = {
    postings: [
      {
        title: 'Frontend Engineer',
        name: 'ExampleCo',
        url: 'frontend-engineer-remote',
        posted: 1781270000000,
        fullyRemote: true,
        location: { places: [{ city: 'Kraków' }] },
      },
      { title: '', name: 'Broken', url: 'missing-title' },
      7,
    ],
    totalPages: 1,
  };

  const parsed = parseNoFluffJobsResponse(fakeResponse);
  if (parsed.length === 1) pass('nofluffjobs parser filters malformed rows');
  else fail(`nofluffjobs parser returned ${parsed.length} rows, expected 1`);

  if (parsed[0].title === 'Frontend Engineer' && parsed[0].url === 'https://nofluffjobs.com/pl/job/frontend-engineer-remote') {
    pass('nofluffjobs parser maps title and URL');
  } else {
    fail(`nofluffjobs parser mapped title/url incorrectly: ${JSON.stringify(parsed[0])}`);
  }

  if (parsed[0].company === 'ExampleCo' && parsed[0].location === 'Remote, Kraków' && parsed[0].postedAt === 1781270000000) {
    pass('nofluffjobs parser maps company, location, and postedAt');
  } else {
    fail(`nofluffjobs parser mapped fields incorrectly: ${JSON.stringify(parsed[0])}`);
  }

  let capturedUrl = '';
  let capturedOpts = null;
  const fetched = await nfj.fetch(
    { name: 'NoFluffJobs', careers_url: 'https://nofluffjobs.com/pl', max_pages: 1 },
    {
      transport: 'http',
      fetchJson: async (url, opts) => {
        capturedUrl = url;
        capturedOpts = opts;
        return fakeResponse;
      },
      fetchText: async () => '',
    },
  );
  if (fetched.length === 1 && capturedUrl.startsWith('https://nofluffjobs.com/api/search/posting?')) {
    pass('nofluffjobs.fetch() uses search posting API endpoint');
  } else {
    fail(`nofluffjobs.fetch() endpoint/result wrong: ${capturedUrl} ${JSON.stringify(fetched)}`);
  }

  if (capturedOpts && capturedOpts.method === 'POST' && capturedOpts.redirect === 'error') {
    pass('nofluffjobs.fetch() uses POST and redirect:"error"');
  } else {
    fail(`nofluffjobs.fetch() should use POST and redirect:"error", got ${JSON.stringify(capturedOpts)}`);
  }

  let ssrfRejected = false;
  try {
    await nfj.fetch({ name: 'Evil', careers_url: 'https://evil.example/pl' }, { transport: 'http', fetchJson: async () => fakeResponse, fetchText: async () => '' });
  } catch (e) {
    if (e.message.includes('trusted nofluffjobs.com')) ssrfRejected = true;
  }
  if (ssrfRejected) pass('nofluffjobs.fetch() rejects untrusted host');
  else fail('nofluffjobs.fetch() should reject untrusted host');

  let badShape = false;
  try {
    parseNoFluffJobsResponse({ jobs: [] });
  } catch (e) {
    if (e.message.includes('unexpected API response')) badShape = true;
  }
  if (badShape) pass('nofluffjobs parser throws on bad response shape');
  else fail('nofluffjobs parser should throw on bad response shape');
} catch (e) {
  fail(`nofluffjobs provider tests crashed: ${e.message}`);
}

// ── 44. openrouter-runner — portals drift guard ─────────────────
console.log('\n44. openrouter-runner — portals drift guard');

try {
  const { parsePortals } = await import(pathToFileURL(join(ROOT, 'openrouter-runner.mjs')).href);
  const exampleYaml = readFileSync(join(ROOT, 'templates/portals.example.yml'), 'utf-8');
  const { companies, titleMatches } = parsePortals(exampleYaml);

  // The no-CLI runner must read the SAME canonical portals schema as scan.mjs
  // (tracked_companies[].api + title_filter.positive/negative). If the schema
  // drifts and the runner stops matching, this fails loudly — instead of the
  // runner silently scanning zero companies (the exact bug this guard prevents).
  if (companies.length > 0) pass(`runner parsePortals extracts ${companies.length} api-companies from the canonical portals schema`);
  else fail('runner parsePortals extracted 0 companies from templates/portals.example.yml — schema drift');

  if (companies.length > 0 && companies.every(c => c.name && c.api)) pass('each extracted company has a name and a JSON api endpoint');
  else fail(`runner companies missing name/api: ${JSON.stringify(companies.slice(0, 3))}`);

  if (titleMatches('AI Engineer') && !titleMatches('Forklift Operator')) {
    pass('runner titleMatches honors title_filter.positive/negative from the canonical schema');
  } else {
    fail(`runner titleMatches drift: "AI Engineer"=${titleMatches('AI Engineer')} "Forklift Operator"=${titleMatches('Forklift Operator')}`);
  }
} catch (e) {
  fail(`openrouter-runner portals drift guard crashed: ${e.message}`);
}

// ── 45. SCAN COOLDOWN FILTER ──────────────────────────────────

console.log('\n45. Scan cooldown filter');
try {
  const { addDays, buildCooldownFilter, shouldDedupScanHistoryRow } = await import(pathToFileURL(join(ROOT, 'scan.mjs')).href);

  // addDays tests
  if (addDays('2026-06-24', 180) === '2026-12-21') {
    pass('addDays computes date correctly (180 days)');
  } else {
    fail(`addDays expected 2026-12-21 but got ${addDays('2026-06-24', 180)}`);
  }

  // shouldDedupScanHistoryRow tests
  const activeCo = shouldDedupScanHistoryRow({ firstSeen: '2026-06-24', status: 'cooldown:CompanyA:2026-12-21' }, { today: '2026-06-25' });
  const expiredCo = shouldDedupScanHistoryRow({ firstSeen: '2026-06-24', status: 'cooldown:CompanyA:2026-12-21' }, { today: '2026-12-22' });
  if (activeCo === true && expiredCo === false) {
    pass('shouldDedupScanHistoryRow dedups active cooldowns and lets expired ones through');
  } else {
    fail(`shouldDedupScanHistoryRow wrong: activeCo=${activeCo}, expiredCo=${expiredCo}`);
  }

  // buildCooldownFilter tests
  const windows = {
    CompanyA: {
      same_role_days: 180,
      cross_role_bucket: 'all_EM_roles',
      applied_to: ['Senior Software Engineer'],
      last_apply_date: '2026-06-01',
    }
  };

  const filterToday = '2026-06-15'; // within 180 days from 2026-06-01 (cooldownUntil = 2026-11-28)
  const filterExpired = '2026-12-01'; // expired
  const filterBoundary = '2026-11-28'; // exactly cooldownUntil

  const cooldownFilterActive = buildCooldownFilter(windows, filterToday);
  const cooldownFilterExpired = buildCooldownFilter(windows, filterExpired);
  const cooldownFilterBoundary = buildCooldownFilter(windows, filterBoundary);

  // Exact/substring role match test
  const jobSameRole = { company: 'Company A', title: 'Senior Software Engineer' };
  const jobSubRole = { company: 'CompanyA Corp', title: 'Lead Senior Software Engineer' };
  const jobOtherRole = { company: 'Company A', title: 'Staff QA Engineer' };
  const jobCrossRole = { company: 'Company A', title: 'Engineering Manager' };

  if (cooldownFilterActive(jobSameRole).skip === true &&
      cooldownFilterActive(jobSubRole).skip === true &&
      cooldownFilterActive(jobOtherRole).skip === false &&
      cooldownFilterActive(jobCrossRole).skip === true) {
    pass('cooldownFilter active skips same role, substring role, and cross role bucket matches');
  } else {
    fail(`cooldownFilter active: sameRole=${cooldownFilterActive(jobSameRole).skip}, subRole=${cooldownFilterActive(jobSubRole).skip}, otherRole=${cooldownFilterActive(jobOtherRole).skip}, crossRole=${cooldownFilterActive(jobCrossRole).skip}`);
  }

  if (cooldownFilterExpired(jobSameRole).skip === false) {
    pass('cooldownFilter does not skip when cooldown window has expired');
  } else {
    fail('cooldownFilter skipped job after expiration');
  }

  // Boundary day test
  if (cooldownFilterBoundary(jobSameRole).skip === false) {
    pass('cooldownFilter does not skip on boundary day (today === cooldownUntil)');
  } else {
    fail('cooldownFilter skipped job on boundary day');
  }

  // Lookalike company test
  const jobLookalikeCompany = { company: 'CompanyAlpha', title: 'Senior Software Engineer' };
  if (cooldownFilterActive(jobLookalikeCompany).skip === false) {
    pass('cooldownFilter does not match lookalike company (CompanyAlpha vs CompanyA)');
  } else {
    fail('cooldownFilter matched lookalike company');
  }

} catch (e) {
  fail(`cooldown filter tests crashed: ${e.message}`);
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
