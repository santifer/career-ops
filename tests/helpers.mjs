// tests/helpers.mjs — shared assertion helpers + counters for the test suite.
// Moved verbatim from test-all.mjs (issue #1440); no framework by design:
// the suite must run on a fresh clone with only Node.
import { execSync, execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..');   // repo root (tests/ lives one level down)
export const QUICK = process.argv.includes('--quick');
export const NODE = process.execPath;

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
export function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }

/**
 * Record and print one failing test assertion.
 *
 * Failures increment the shared counter that controls the final process exit
 * code, while still allowing later checks to run and show the full problem set.
 *
 * @param {string} msg - Human-readable failure message for the terminal log.
 * @returns {void}
 */
export function fail(msg) { console.log(`  ❌ ${msg}`); failed++; }

/**
 * Record and print one non-fatal warning.
 *
 * Warnings are used for expected local-environment gaps, such as missing user
 * data in a clean repo, where the check should stay visible but not fail CI.
 *
 * @param {string} msg - Human-readable warning message for the terminal log.
 * @returns {void}
 */
export function warn(msg) { console.log(`  ⚠️  ${msg}`); warnings++; }

/** Current counter snapshot. */
export function results() { return { passed, failed, warnings }; }

/**
 * Print the summary line and exit with the suite's exit code.
 * Moved verbatim from the tail of test-all.mjs — output must stay byte-identical.
 */
export function finish() {
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
}

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
export function run(cmd, args = [], opts = {}) {
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
export function fileExists(path) { return existsSync(join(ROOT, path)); }

export const BASH = (() => {
  if (process.platform !== 'win32') return 'bash';
  try {
    execSync('wsl -e bash -c "true"', { stdio: 'ignore' });
    return 'bash';
  } catch {}
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'bash'
  ];
  for (const cmd of candidates) {
    try {
      execSync(`"${cmd}" -c "true"`, { stdio: 'ignore' });
      return cmd;
    } catch {}
  }
  return 'bash';
})();

export function toBashPath(wpath) {
  if (process.platform !== 'win32') return wpath;
  const forwardSlashed = wpath.replace(/\\/g, '/');
  // Try cygpath first: it ships with Git for Windows, which is also what
  // provides `bash` on PATH on most Windows dev machines (see BASH const
  // above). cygpath emits /c/... paths that match Git Bash's mount scheme.
  // wslpath emits /mnt/c/... paths, which only resolve inside WSL's own
  // bash -- if WSL happens to be installed but `bash` on PATH still
  // resolves to Git Bash, a wslpath-first order silently produces a path
  // Git Bash can't find (see #1409). Only fall back to wslpath (and only
  // pay the cost of booting the WSL VM) when cygpath is unavailable.
  try {
    const cygpathCmd = existsSync('C:\\Program Files\\Git\\usr\\bin\\cygpath.exe') ? '"C:\\Program Files\\Git\\usr\\bin\\cygpath.exe"' : 'cygpath';
    const out = execSync(`${cygpathCmd} -u "${forwardSlashed}"`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    if (out) return out;
  } catch {}
  try {
    execSync('wsl -e bash -c "true"', { stdio: 'ignore' });
    const out = execSync(`wsl wslpath -u "${forwardSlashed}"`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    if (out) return out;
  } catch {}
  return wpath.replace(/^[A-Za-z]:/, m => '/' + m[0].toLowerCase()).replace(/\\/g, '/');
}
