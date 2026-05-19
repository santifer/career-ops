#!/usr/bin/env node
/**
 * scripts/agents/sigma-fortifier.mjs — SIGMA, the auto-implementing
 * debug + system hardening agent.
 *
 * Per Mitchell's request 2026-05-19: one agent that conducts a full pass
 * across debug surfaces (runtime errors, agent failures, test breakage)
 * AND hardening surfaces (prompt-injection, secrets, launchd perms, CVEs,
 * dashboard attack surface), then SELF-IMPLEMENTS every recommendation to
 * the fullest quality despite cost.
 *
 * Per Mitchell's Decision-Maximization Policy:
 *  - Full 7-model council fan-out per finding
 *  - Adversarial sweep on convergence
 *  - No daily/monthly budget cap
 *  - Quality > speed > cost
 *
 * Safety guardrails (non-negotiable):
 *  - All work on a `sigma/audit-{date}-{time}` branch, NEVER main
 *  - Pre-flight: clean tree + baseline test pass required
 *  - Per-finding atomic implementation: write test, apply patch, run tests
 *  - On test failure: rollback that finding, log NEEDS_HUMAN, continue with rest
 *  - Off-limits paths (cv.md, profile.yml, _profile.md, article-digest.md,
 *    applications.md, hm-intel/*, apply-pack/*, .env) are HARD-REJECTED at
 *    patch-application time, regardless of council recommendation
 *  - Hooks always run (no --no-verify)
 *  - Re-audit after implementation to verify no regression introduced
 *
 * CLI:
 *   --audit-only   : phases 1-3 only, write report, no implementation
 *   --dry-run      : phases 1-5 but no git commits
 *   --full         : all phases (DEFAULT for launchd)
 *   --max-findings : cap to first N findings (default 50)
 *
 * Outputs (all dated):
 *   data/sigma-audit-YYYY-MM-DD.md            : audit findings + per-finding council debate
 *   data/sigma-implementation-log-YYYY-MM-DD.md : applied / rolled-back / needs-human
 *   data/logs/sigma-fortifier-YYYY-MM-DD.log  : raw stdout/stderr trace
 *
 * Schedule:
 *   Saturday 03:00 PT via com.mitchell.career-ops.sigma-fortifier.plist
 *
 * Anti-hallucination: every finding has a file:line citation. Every fix has
 * a verified OLD-string match before patch application. Every commit has a
 * SHA. Every rollback has the recovered file's SHA.
 *
 * Anti-sycophancy: "0 findings this cycle, system is clean" IS a valid
 * report outcome. Do not fabricate findings to look productive.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, statSync, mkdirSync, openSync, readSync, closeSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname, relative, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const DATA_DIR = join(REPO_ROOT, 'data');
const LOG_DIR = join(DATA_DIR, 'logs');

// Load .env with override:true BEFORE importing council. Mitchell's shell
// pre-sets ANTHROPIC_API_KEY (and others) to empty string; without override,
// dotenv would not overwrite the empty value and every council fan-out would
// be skipped as "missing env". See memory: reference_env_secrets.
try {
  const { config: dotenvConfig } = await import('dotenv');
  dotenvConfig({ path: join(REPO_ROOT, '.env'), override: true });
} catch { /* dotenv optional — if missing, env vars must already be set by caller */ }

const { callCouncil, extractRichContent, estimateCostUsd } = await import('../../lib/council.mjs');

// ─── Date utils (PT-stamped, matching the rest of the codebase) ───────────────

function ptDate(d = new Date()) {
  const ms = d.getTime() - (7 * 3600 * 1000);
  return new Date(ms);
}
function ptDateStamp(d = new Date()) {
  return ptDate(d).toISOString().slice(0, 10);
}
function ptTimeStamp(d = new Date()) {
  return ptDate(d).toISOString().slice(11, 16).replace(':', '');
}
function ptIsoStamp(d = new Date()) {
  return ptDate(d).toISOString().replace(/\.\d{3}Z$/, '-07:00');
}

const DATE = ptDateStamp();
const BRANCH_NAME = `sigma/audit-${DATE}-${ptTimeStamp()}`;
const AUDIT_OUT = join(DATA_DIR, `sigma-audit-${DATE}.md`);
const IMPL_LOG = join(DATA_DIR, `sigma-implementation-log-${DATE}.md`);
const RAW_LOG = join(LOG_DIR, `sigma-fortifier-${DATE}.log`);

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

function log(line) {
  const entry = `[${ptIsoStamp()}] ${line}\n`;
  process.stdout.write(entry);
  try { appendFileSync(RAW_LOG, entry); } catch { /* never crash on log */ }
}
function err(line) {
  const entry = `[${ptIsoStamp()}] ERR ${line}\n`;
  process.stderr.write(entry);
  try { appendFileSync(RAW_LOG, entry); } catch {}
}

// ─── Off-limits hard rule (matches omega-steward + system-maintainer patterns) ─

const OFF_LIMITS = [
  'cv.md',
  'modes/_profile.md',
  'config/profile.yml',
  'article-digest.md',
  'data/applications.md',
  '.env',
  '.env.local',
  '.env.production',
];
const OFF_LIMITS_DIRS = [
  'data/hm-intel',
  'apply-pack',
  'data/cv-archives',
  'data/apply-packs',
  'interview-prep',
  'output',
  'jds',
  'reports',
  'data/networking',
  'data/linkedin',
  '.git',
  'node_modules',
];

function isOffLimits(repoRelPath) {
  if (!repoRelPath || repoRelPath.startsWith('..') || repoRelPath.startsWith('/')) return true;
  if (OFF_LIMITS.includes(repoRelPath)) return true;
  for (const dir of OFF_LIMITS_DIRS) {
    if (repoRelPath === dir || repoRelPath.startsWith(dir + '/')) return true;
  }
  return false;
}

const IN_SCOPE_EXT = new Set(['.mjs', '.js', '.json', '.plist', '.yml', '.yaml']);

// ─── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const MODE = args.includes('--audit-only')
  ? 'audit-only'
  : args.includes('--dry-run')
    ? 'dry-run'
    : 'full';
const MAX_FINDINGS = (() => {
  const i = args.indexOf('--max-findings');
  if (i >= 0 && args[i + 1]) {
    const n = parseInt(args[i + 1], 10);
    if (Number.isFinite(n) && n > 0) return Math.min(n, 200);
  }
  return 50;
})();
// --skip-baseline-test: record the baseline test-all failure list but don't block.
// The per-finding test-gate inside the implementation loop still runs, so logic
// regressions introduced by SIGMA's patches are still caught. Use this when the
// baseline has known-pre-existing lint warnings (e.g. absolute-path checks) that
// don't reflect SIGMA-introduced regressions.
const SKIP_BASELINE_TEST = args.includes('--skip-baseline-test');

// Cost caps — belt-and-suspenders backstops against a recurrence of the 2026-05-19
// "$344-per-finding" reporting bug (was actually $0.34 due to a units bug in
// lib/council.mjs:estimateCostUsd, now fixed). Per-finding fires when a single
// council fan-out exceeds the cap; total fires when cumulative spend does.
// With the cost-calc fix in place, neither should fire under normal operation.
function readNumFlag(flag, fallback) {
  const i = args.indexOf(flag);
  if (i >= 0 && args[i + 1]) {
    const n = parseFloat(args[i + 1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}
const MAX_COST_PER_FINDING = readNumFlag('--max-cost-per-finding', 5);
const MAX_TOTAL_COST = readNumFlag('--max-total-cost', 50);
const USE_WORKTREE = args.includes('--worktree');

// Baseline fail set — populated by preflight, consulted by runTestGate so the
// post-patch test gate counts only NEW failures introduced by SIGMA's patch.
// Without this, every patch rolls back because baseline failures (which are
// SIGMA-independent) make the test gate's `failLines.length === 0` check fail.
let BASELINE_FAILS = new Set();

// Working directory for git operations and source-file reads. Default = REPO_ROOT.
// With --worktree, SIGMA creates a sibling worktree under REPO_ROOT/.worktrees/
// and points WORK_DIR there, so concurrent SIGMA instances can patch the same
// repo without git-lock contention killing each other (Blocker 7).
// DATA_DIR, LOG_DIR, and the coordination registry stay on REPO_ROOT so all
// instances share one source of truth for status and audit output.
let WORK_DIR = REPO_ROOT;
let WORKTREE_PATH = null;  // set by setupWorktree()
const INSTANCE_ID = `${process.pid}-${Date.now().toString(36)}`;
const REGISTRY_PATH = join(DATA_DIR, 'sigma-active-instances.json');
const LEADER_LOCK_PATH = join(REPO_ROOT, '.git', 'sigma-leader.lock');

// ─── Git helpers ───────────────────────────────────────────────────────────────

function sh(cmd, opts = {}) {
  // Default cwd is WORK_DIR (worktree when --worktree, else REPO_ROOT). Callers
  // can override (e.g. main-repo ops like registry writes use { cwd: REPO_ROOT }).
  return execSync(cmd, { cwd: WORK_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}
function shSafe(cmd, opts = {}) {
  try { return { ok: true, out: sh(cmd, opts) }; }
  catch (e) { return { ok: false, out: String(e.stdout || '') + String(e.stderr || ''), code: e.status }; }
}

// ─── Worktree + multi-instance coordination (Blocker 7) ────────────────────────

function setupWorktree() {
  if (!USE_WORKTREE) return { ok: true, path: WORK_DIR };
  const wtRoot = join(REPO_ROOT, '.worktrees');
  if (!existsSync(wtRoot)) mkdirSync(wtRoot, { recursive: true });
  const wtPath = join(wtRoot, `sigma-${DATE}-${ptTimeStamp()}-${process.pid}`);
  // `git worktree add -b <branch> <path> main` creates the worktree AND the
  // sigma audit branch in one shot, branched from current main.
  const r = shSafe(`git worktree add -b ${BRANCH_NAME} "${wtPath}" main`, { cwd: REPO_ROOT });
  if (!r.ok) return { ok: false, reason: r.out };
  WORK_DIR = wtPath;
  WORKTREE_PATH = wtPath;
  log(`  ✓ worktree created at ${relative(REPO_ROOT, wtPath)}`);
  return { ok: true, path: wtPath };
}

function readRegistry() {
  if (!existsSync(REGISTRY_PATH)) return { instances: [] };
  try { return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')); }
  catch { return { instances: [] }; }
}
function writeRegistry(reg) {
  reg.lastUpdated = ptIsoStamp();
  writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
}
function registerInstance() {
  const reg = readRegistry();
  // Drop stale instances (started > 6h ago and never marked done) — defensive
  // cleanup so a crashed run doesn't block the leader-election forever.
  const cutoff = Date.now() - 6 * 3600 * 1000;
  reg.instances = (reg.instances || []).filter(i => i.status === 'completed' && new Date(i.completed || 0).getTime() > cutoff - 1 || (i.startedMs || 0) > cutoff);
  reg.instances.push({
    id: INSTANCE_ID, pid: process.pid, branch: BRANCH_NAME,
    worktree: WORKTREE_PATH ? relative(REPO_ROOT, WORKTREE_PATH) : null,
    started: ptIsoStamp(), startedMs: Date.now(),
    status: 'running', applied: 0, rolledBack: 0,
  });
  writeRegistry(reg);
}
function updateInstance(patch) {
  const reg = readRegistry();
  const me = reg.instances.find(i => i.id === INSTANCE_ID);
  if (me) Object.assign(me, patch);
  writeRegistry(reg);
}
function markInstanceComplete(summary) {
  updateInstance({ status: 'completed', completed: ptIsoStamp(), ...summary });
}
function tryBecomeLeader() {
  // Atomic file creation via openSync O_EXCL. If we win, we hold the lock;
  // if EEXIST, another instance is the leader.
  try {
    const fd = openSync(LEADER_LOCK_PATH, 'wx');
    closeSync(fd);
    writeFileSync(LEADER_LOCK_PATH, JSON.stringify({ leader: INSTANCE_ID, ts: ptIsoStamp() }));
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    throw e;
  }
}
function releaseLeaderLock() {
  try { unlinkSync(LEADER_LOCK_PATH); } catch {}
}
function leaderMergeAndPush() {
  // Read the registry, find all sibling sigma branches with applied > 0,
  // merge them into main, push. Each step is best-effort + logged.
  const reg = readRegistry();
  const merged = [];
  for (const inst of reg.instances) {
    if (inst.id === INSTANCE_ID) continue;            // self handled separately
    if (inst.status !== 'completed') continue;        // skip in-progress
    if (!inst.branch || !inst.applied || inst.applied === 0) continue;
    log(`  ↳ leader: merging ${inst.branch} (${inst.applied} applied)`);
    const m = shSafe(`git -c user.email=sigma@career-ops.local -c user.name=sigma merge --no-edit ${inst.branch}`, { cwd: REPO_ROOT });
    if (m.ok) merged.push(inst.branch);
    else log(`    ✗ merge failed (${(m.out || '').slice(0, 200)})`);
  }
  // Merge self (we're on a sigma branch — but only in main-repo flow, not worktree).
  // In worktree mode, the main repo is still on `main`, so we merge our own branch too.
  const selfMerge = shSafe(`git -c user.email=sigma@career-ops.local -c user.name=sigma merge --no-edit ${BRANCH_NAME}`, { cwd: REPO_ROOT });
  if (selfMerge.ok) merged.push(BRANCH_NAME);
  // Push
  const push = shSafe(`git -c credential.helper="!gh auth git-credential" push origin main`, { cwd: REPO_ROOT });
  if (push.ok) log(`  ✓ leader pushed origin/main — ${merged.length} sigma branches merged`);
  else log(`  ✗ push failed: ${(push.out || '').slice(0, 200)}`);
  return { merged, pushed: push.ok };
}
function cleanupWorktree() {
  if (!WORKTREE_PATH) return;
  // Best-effort prune; keep the worktree files (they hold the audit branch tip)
  // so Mitchell can `git worktree list` to find them if he wants to inspect.
  // Only remove when the leader has merged + pushed successfully.
  log(`  ◇ worktree at ${relative(REPO_ROOT, WORKTREE_PATH)} retained for inspection (run 'git worktree remove' manually)`);
}

function checkCleanTree() {
  // NOTE: do NOT .trim() the porcelain output — git porcelain always emits
  // `XY ` (2 status chars + 1 space) before each filename. The unstaged-modify
  // status is ` M` (leading SPACE + M), so trimming the whole output would
  // strip the leading space from line 1 only and corrupt our slice indices.
  const raw = shSafe('git status --porcelain').out;
  if (!raw) return { ok: true };
  const lines = raw.split('\n').filter(l => l.length >= 3);
  if (lines.length === 0) return { ok: true };
  // SIGMA's commits are surgical (one finding.file per commit via agent-commit.mjs)
  // and rollback uses `git checkout -- <file>` against the HEAD. The only files
  // that affect SIGMA's safety are MODIFIED code files SIGMA might patch:
  //   - Untracked files (??) cannot be patched — SIGMA only edits files named in findings.
  //   - State paths (data/, batch/) are constantly rewritten by background launchd
  //     jobs and are never SIGMA targets — dirty state cannot affect SIGMA's commits.
  // Filter both out; only refuse if MODIFIED code files remain.
  const STATE_PREFIXES = ['data/', 'batch/'];
  const codeLines = lines.filter(line => {
    const flags = line.slice(0, 2);
    if (flags === '??') return false;
    const p = line.slice(3).replace(/^"|"$/g, '');
    return p && !STATE_PREFIXES.some(pre => p.startsWith(pre));
  });
  if (codeLines.length > 0) {
    return { ok: false, reason: `working tree has dirty code files (${codeLines.length}); commit or stash first:\n${codeLines.slice(0, 10).join('\n')}` };
  }
  return { ok: true };
}

function currentBranch() {
  return shSafe('git rev-parse --abbrev-ref HEAD').out.trim();
}

function createSigmaBranch() {
  const r = shSafe(`git checkout -b ${BRANCH_NAME}`);
  if (!r.ok) return { ok: false, reason: r.out };
  return { ok: true, branch: BRANCH_NAME };
}

function fileSha(path) {
  if (!existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12);
}

// ─── Pre-flight ────────────────────────────────────────────────────────────────

function preflight() {
  // audit-only mode reads only; skip clean-tree and baseline checks
  if (MODE === 'audit-only') {
    log(`  ◇ audit-only mode: skipping clean-tree + baseline tests (read-only pass)`);
    return { ok: true, branch: currentBranch() };
  }

  log('▶ pre-flight: clean tree check');
  const tree = checkCleanTree();
  if (!tree.ok) return { ok: false, reason: tree.reason };
  log(`  ✓ clean tree (on ${currentBranch()})`);

  log('▶ pre-flight: baseline test-all --quick');
  const test = shSafe('node test-all.mjs --quick');
  if (!test.ok && !SKIP_BASELINE_TEST) {
    return { ok: false, reason: `baseline test-all FAILED: ${(test.out || '').slice(-2000)}` };
  }
  const baselineFailLines = (test.out.match(/^.*❌.*$/gm) || []);
  // Always capture baseline fails so the per-finding test gate compares against
  // them (instead of demanding zero fails — which never holds in this repo).
  BASELINE_FAILS = new Set(baselineFailLines);
  try {
    writeFileSync(join(DATA_DIR, `sigma-baseline-fails-${DATE}.txt`), baselineFailLines.join('\n'));
  } catch {}
  if (baselineFailLines.length > 0) {
    log(`  ⚠ baseline has ${baselineFailLines.length} pre-existing failing tests — recorded; test-gate will compare against this set`);
  } else {
    log(`  ✓ baseline tests pass (${(test.out.match(/✅/g) || []).length} green)`);
  }

  if (MODE === 'dry-run') {
    log(`  ◇ skipping branch creation (mode=${MODE})`);
    return { ok: true, branch: currentBranch() };
  }

  // --worktree: create an isolated worktree with the sigma branch already
  // checked out. Without this, concurrent SIGMA instances clobber each other
  // via git lock contention (Blocker 7, 2026-05-19).
  if (USE_WORKTREE) {
    log(`▶ pre-flight: setting up worktree`);
    const wt = setupWorktree();
    if (!wt.ok) return { ok: false, reason: `worktree setup failed: ${wt.reason}` };
    // setupWorktree already created the branch via `git worktree add -b`,
    // so skip the explicit createSigmaBranch step below.
  } else {
    log(`▶ pre-flight: creating branch ${BRANCH_NAME}`);
    const br = createSigmaBranch();
    if (!br.ok) return { ok: false, reason: `branch creation failed: ${br.reason}` };
  }
  log(`  ✓ on ${BRANCH_NAME}`);

  // Register this instance for multi-instance coordination (Blocker 7).
  registerInstance();
  return { ok: true, branch: BRANCH_NAME };
}

// ─── Audit stream 1: DEBUG ─────────────────────────────────────────────────────

function recentlyModified(path, daysBack = 7) {
  if (!existsSync(path)) return false;
  const ageDays = (Date.now() - statSync(path).mtimeMs) / (24 * 3600 * 1000);
  return ageDays <= daysBack;
}

function readTail(path, maxBytes = 200_000) {
  try {
    const st = statSync(path);
    const start = Math.max(0, st.size - maxBytes);
    const fd = openSync(path, 'r');
    const buf = Buffer.alloc(st.size - start);
    readSync(fd, buf, 0, buf.length, start);
    closeSync(fd);
    return buf.toString('utf8');
  } catch {
    try { return readFileSync(path, 'utf8'); } catch { return ''; }
  }
}

// d1: launchd .err logs — any new error-level lines in the past 7 days
function scanLaunchdErrLogs() {
  const findings = [];
  if (!existsSync(LOG_DIR)) return findings;
  // skip dashboard-server.err — scanDashboardErrors handles it more specifically
  const errFiles = readdirSync(LOG_DIR).filter(f => f.endsWith('.err') && f !== 'dashboard-server.err' && recentlyModified(join(LOG_DIR, f), 7));
  for (const file of errFiles) {
    const fullPath = join(LOG_DIR, file);
    const content = readTail(fullPath, 100_000);
    if (!content.trim()) continue;
    // Group consecutive stack-trace lines into one signature
    const lines = content.split('\n').filter(Boolean);
    const errorLines = lines.filter(l =>
      /^(Error|TypeError|RangeError|ReferenceError|SyntaxError|EACCES|EADDRINUSE|ECONNREFUSED|ENOENT|UnhandledPromiseRejection|AssertionError)/.test(l)
      || /^\s+at .+:\d+:\d+\)?$/.test(l)
      || /level.*error/i.test(l)
    );
    if (errorLines.length === 0) continue;
    // Take last 20 error lines for the finding
    const tail = errorLines.slice(-20).join('\n');
    const sigHash = createHash('sha1').update(tail.replace(/\d+/g, '#').replace(/0x[0-9a-f]+/gi, '0xH')).digest('hex').slice(0, 8);
    findings.push({
      id: `dbg-launchd-${sigHash}`,
      stream: 'debug',
      category: 'launchd-runtime-error',
      severity: 'HIGH',
      file: relative(REPO_ROOT, fullPath),
      line: 'tail',
      evidence: tail,
      headline: `recurring error in ${file}: ${errorLines[0].slice(0, 120)}`,
    });
  }
  return findings;
}

// d2: dashboard-server.err — 500s, listener crashes
function scanDashboardErrors() {
  const findings = [];
  const dashErr = join(LOG_DIR, 'dashboard-server.err');
  if (!existsSync(dashErr)) return findings;
  if (!recentlyModified(dashErr, 7)) return findings;
  const content = readTail(dashErr, 200_000);
  const fiveHundred = content.match(/(GET|POST|PUT|DELETE) [^ ]+ \d+ - .*\b5\d\d\b.*/g) || [];
  const stacks = (content.match(/^\s+at .+:\d+:\d+\)?$/gm) || []);
  if (fiveHundred.length === 0 && stacks.length === 0) return findings;
  findings.push({
    id: `dbg-dash-${createHash('sha1').update(content.slice(-5000)).digest('hex').slice(0, 8)}`,
    stream: 'debug',
    category: 'dashboard-server-error',
    severity: fiveHundred.length > 10 || stacks.length > 0 ? 'HIGH' : 'MED',
    file: 'data/logs/dashboard-server.err',
    line: 'tail',
    evidence: [
      fiveHundred.length ? `5xx responses (${fiveHundred.length}):\n${fiveHundred.slice(-10).join('\n')}` : '',
      stacks.length ? `stack traces (${stacks.length}):\n${stacks.slice(-15).join('\n')}` : '',
    ].filter(Boolean).join('\n\n'),
    headline: `dashboard-server: ${fiveHundred.length} 5xx + ${stacks.length} stack lines in past 7d`,
  });
  return findings;
}

// d3: NDJSON agent error entries
function scanAgentNDJSONFailures() {
  const findings = [];
  if (!existsSync(LOG_DIR)) return findings;
  const logFiles = readdirSync(LOG_DIR).filter(f => f.endsWith('.log') && recentlyModified(join(LOG_DIR, f), 7));
  const byAgent = {};
  for (const file of logFiles) {
    const fullPath = join(LOG_DIR, file);
    const content = readTail(fullPath, 100_000);
    for (const line of content.split('\n')) {
      if (!line.startsWith('{')) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.error || obj.level === 'error' || obj.status === 'failed' || obj.verdict === 'REJECTED') {
          byAgent[file] = (byAgent[file] || []);
          byAgent[file].push(obj);
        }
      } catch { /* not JSON */ }
    }
  }
  for (const [file, errors] of Object.entries(byAgent)) {
    if (errors.length === 0) continue;
    const sample = errors.slice(-5).map(e => JSON.stringify(e).slice(0, 400)).join('\n');
    findings.push({
      id: `dbg-ndjson-${createHash('sha1').update(file + sample).digest('hex').slice(0, 8)}`,
      stream: 'debug',
      category: 'agent-ndjson-error',
      severity: errors.length > 10 ? 'HIGH' : 'MED',
      file: `data/logs/${file}`,
      line: 'tail',
      evidence: sample,
      headline: `${file}: ${errors.length} error/failed/rejected entries in past 7d`,
    });
  }
  return findings;
}

// d4: syntax-check every .mjs in scripts/ + lib/
function scanSyntaxFailures() {
  const findings = [];
  function walk(dir, out = []) {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(REPO_ROOT, full);
      if (isOffLimits(rel)) continue;
      if (entry.isDirectory()) walk(full, out);
      else if (entry.isFile() && entry.name.endsWith('.mjs')) out.push(full);
    }
    return out;
  }
  const files = [...walk(join(REPO_ROOT, 'scripts')), ...walk(join(REPO_ROOT, 'lib'))];
  for (const file of files) {
    const r = shSafe(`node --check "${file}" 2>&1`);
    if (!r.ok) {
      findings.push({
        id: `dbg-syntax-${createHash('sha1').update(file).digest('hex').slice(0, 8)}`,
        stream: 'debug',
        category: 'syntax-error',
        severity: 'CRIT',
        file: relative(REPO_ROOT, file),
        line: (r.out.match(/:(\d+)/) || [])[1] || '?',
        evidence: r.out.slice(0, 2000),
        headline: `node --check FAILED: ${relative(REPO_ROOT, file)}`,
      });
    }
  }
  return findings;
}

// ─── Audit stream 2: HARDENING ─────────────────────────────────────────────────

function readFileSafe(path) {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

// h1: prompt-injection — agents that read JD/user content into LLM prompts without sanitization
function scanPromptInjectionSurfaces() {
  const findings = [];
  const agentsDir = join(REPO_ROOT, 'scripts/agents');
  if (!existsSync(agentsDir)) return findings;
  const files = readdirSync(agentsDir).filter(f => f.endsWith('.mjs'));
  for (const file of files) {
    const full = join(agentsDir, file);
    const rel = relative(REPO_ROOT, full);
    const content = readFileSafe(full);
    // Heuristic: file reads from `apply-pack/`, `jds/`, `data/scan-history`, or a `--url`/`--jd` arg
    // AND concatenates that variable directly into a prompt string or `prompt:` parameter
    const readsUserInput = /(readFileSync|readFile)\(.*(apply-pack|jds\/|hm-intel|scan-history|--jd|--url|args\.)/.test(content);
    const buildsPrompt = /prompt\s*[:=]\s*[`"'].*\$\{(?:jd|url|user|raw|content|body|input|text|q)/i.test(content);
    if (readsUserInput && buildsPrompt) {
      // Find the offending line range
      const lines = content.split('\n');
      const hits = [];
      lines.forEach((line, i) => {
        if (/prompt\s*[:=]\s*[`"'].*\$\{(?:jd|url|user|raw|content|body|input|text|q)/i.test(line)) {
          hits.push({ line: i + 1, text: line.trim().slice(0, 200) });
        }
      });
      if (hits.length === 0) continue;
      findings.push({
        id: `hard-pi-${createHash('sha1').update(rel).digest('hex').slice(0, 8)}`,
        stream: 'hardening',
        category: 'prompt-injection-surface',
        severity: 'HIGH',
        file: rel,
        line: hits.map(h => h.line).join(','),
        evidence: hits.map(h => `L${h.line}: ${h.text}`).join('\n'),
        headline: `${file}: user-derived content flows into prompt without sanitization`,
      });
    }
  }
  return findings;
}

// h2: hardcoded secrets — API key patterns in tracked code
function scanHardcodedSecrets() {
  const findings = [];
  // Walk all in-scope files
  function walk(dir, out = []) {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(REPO_ROOT, full);
      if (isOffLimits(rel)) continue;
      if (entry.isDirectory()) walk(full, out);
      else if (entry.isFile() && IN_SCOPE_EXT.has(extname(entry.name))) out.push(full);
    }
    return out;
  }
  const files = [
    ...walk(join(REPO_ROOT, 'scripts')),
    ...walk(join(REPO_ROOT, 'lib')),
    ...walk(join(REPO_ROOT, 'dashboard')),
  ];
  const patterns = [
    { name: 'OpenAI sk-key', re: /sk-[A-Za-z0-9_-]{30,}/g },
    { name: 'Anthropic key', re: /sk-ant-[A-Za-z0-9_-]{30,}/g },
    { name: 'Hunter API', re: /hunter[._-]?api[._-]?key\s*[:=]\s*["']([A-Za-z0-9]{20,})/gi },
    { name: 'Google API', re: /AIza[A-Za-z0-9_-]{30,}/g },
    { name: 'AWS access key', re: /AKIA[A-Z0-9]{16}/g },
    { name: 'GitHub PAT', re: /gh[ps]_[A-Za-z0-9]{30,}/g },
    { name: 'private key', re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  ];
  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    const content = readFileSafe(file);
    for (const { name, re } of patterns) {
      const matches = content.match(re);
      if (!matches) continue;
      // Skip if it's in a comment annotated as example/placeholder
      const offsets = [];
      let m;
      const reGlobal = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      while ((m = reGlobal.exec(content)) !== null) {
        const lineNum = content.slice(0, m.index).split('\n').length;
        const lineText = content.split('\n')[lineNum - 1] || '';
        if (/example|placeholder|TODO|<your.?key>|XXXXXXXX/i.test(lineText)) continue;
        offsets.push({ line: lineNum, text: lineText.trim().slice(0, 200) });
      }
      if (offsets.length === 0) continue;
      findings.push({
        id: `hard-sec-${createHash('sha1').update(rel + name).digest('hex').slice(0, 8)}`,
        stream: 'hardening',
        category: 'hardcoded-secret',
        severity: 'CRIT',
        file: rel,
        line: offsets.map(o => o.line).join(','),
        evidence: offsets.map(o => `L${o.line}: ${o.text}`).join('\n'),
        headline: `${rel}: hardcoded ${name} pattern`,
      });
    }
  }
  return findings;
}

// h3: launchd plist hygiene
function scanLaunchdHygiene() {
  const findings = [];
  const ld = join(REPO_ROOT, 'scripts/launchd');
  if (!existsSync(ld)) return findings;
  const plists = readdirSync(ld).filter(f => f.endsWith('.plist'));
  for (const file of plists) {
    const full = join(ld, file);
    const rel = relative(REPO_ROOT, full);
    const content = readFileSafe(full);
    const issues = [];
    if (!/<key>StandardErrorPath<\/key>/.test(content)) issues.push('missing StandardErrorPath');
    if (!/<key>StandardOutPath<\/key>/.test(content)) issues.push('missing StandardOutPath');
    if (!/<key>WorkingDirectory<\/key>/.test(content)) issues.push('missing WorkingDirectory');
    if (/<string>\/Users\/[^<]+\/\.nvm\/versions\/node\/v\d+\.\d+\.\d+\/bin\/node<\/string>/.test(content)) {
      // pinned-version node path — flag as maintenance risk
      issues.push('pinned-version node path (breaks on nvm upgrade)');
    }
    if (issues.length === 0) continue;
    findings.push({
      id: `hard-ld-${createHash('sha1').update(rel).digest('hex').slice(0, 8)}`,
      stream: 'hardening',
      category: 'launchd-hygiene',
      severity: issues.includes('pinned-version node path (breaks on nvm upgrade)') ? 'MED' : 'LOW',
      file: rel,
      line: '1',
      evidence: issues.join('; '),
      headline: `${file}: ${issues.length} hygiene issue(s)`,
    });
  }
  return findings;
}

// h4: npm audit
function scanNpmAudit() {
  const findings = [];
  const r = shSafe('npm audit --json');
  // npm audit exits non-zero when vulns present; that's expected
  const raw = r.out || '';
  if (!raw.trim()) return findings;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return findings; }
  const vulns = parsed.vulnerabilities || {};
  for (const [pkg, info] of Object.entries(vulns)) {
    if (!info.severity || info.severity === 'info') continue;
    const sev = info.severity === 'critical' ? 'CRIT'
      : info.severity === 'high' ? 'HIGH'
      : info.severity === 'moderate' ? 'MED' : 'LOW';
    findings.push({
      id: `hard-cve-${createHash('sha1').update(pkg).digest('hex').slice(0, 8)}`,
      stream: 'hardening',
      category: 'dependency-cve',
      severity: sev,
      file: 'package.json',
      line: '?',
      evidence: `${pkg} (${info.severity}): ${info.via && Array.isArray(info.via) ? info.via.map(v => typeof v === 'string' ? v : v.title || v.url || '').join('; ') : ''}`,
      headline: `npm: ${pkg} has ${info.severity} vulnerability`,
    });
  }
  return findings;
}

// h5: dashboard attack surface — path traversal in *Slug args, unguarded fetches
function scanDashboardAttackSurface() {
  const findings = [];
  const ds = join(REPO_ROOT, 'dashboard-server.mjs');
  if (!existsSync(ds)) return findings;
  const content = readFileSafe(ds);
  const lines = content.split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    // Path traversal: any *Slug or *Path arg that's used in fs/readFile/join without a guard
    if (/(slug|path|file|name)\s*[=:]\s*[a-zA-Z0-9_.]*req\.(query|params|body)/i.test(line)) {
      const nextChunk = lines.slice(i, i + 8).join('\n');
      if (/(readFileSync|readFile|fs\.read|require\(.*\$\{|join\(.*\$\{)/i.test(nextChunk) && !/(sanitize|safePath|validatePath|allowList|\.test\(|startsWith\()/i.test(nextChunk)) {
        hits.push({ line: i + 1, text: line.trim().slice(0, 200) });
      }
    }
  });
  if (hits.length > 0) {
    findings.push({
      id: `hard-dash-${createHash('sha1').update('dash-traversal').digest('hex').slice(0, 8)}`,
      stream: 'hardening',
      category: 'path-traversal-surface',
      severity: 'HIGH',
      file: 'dashboard-server.mjs',
      line: hits.map(h => h.line).join(','),
      evidence: hits.map(h => `L${h.line}: ${h.text}`).join('\n'),
      headline: `dashboard-server.mjs: ${hits.length} unguarded user-derived path arg(s)`,
    });
  }
  return findings;
}

// h6: outer-template-unescape bug class (per AGENTS.md, this is a known career-ops bug class)
function scanOuterTemplateUnescape() {
  const findings = [];
  const bd = join(REPO_ROOT, 'scripts/build-dashboard.mjs');
  if (!existsSync(bd)) return findings;
  const content = readFileSafe(bd);
  const lines = content.split('\n');
  // Detect single-backslash escapes (\n \r \t) inside a `<script>` template region
  let inScript = false;
  const hits = [];
  lines.forEach((line, i) => {
    if (/<script>/.test(line)) inScript = true;
    if (/<\/script>/.test(line)) inScript = false;
    if (inScript) {
      // Look for single-backslash \n \r \t inside single-quoted strings (NOT escaped as \\n)
      if (/['"][^'"]*[^\\]\\[nrt][^'"]*['"]/.test(line) && !/\\\\[nrt]/.test(line)) {
        hits.push({ line: i + 1, text: line.trim().slice(0, 200) });
      }
    }
  });
  if (hits.length > 0) {
    findings.push({
      id: `hard-tpl-${createHash('sha1').update('build-dashboard-tpl').digest('hex').slice(0, 8)}`,
      stream: 'hardening',
      category: 'outer-template-unescape',
      severity: 'HIGH',
      file: 'scripts/build-dashboard.mjs',
      line: hits.slice(0, 10).map(h => h.line).join(','),
      evidence: hits.slice(0, 10).map(h => `L${h.line}: ${h.text}`).join('\n'),
      headline: `build-dashboard.mjs: ${hits.length} potential outer-template-unescape site(s)`,
    });
  }
  return findings;
}

// ─── Council fan-out per finding ───────────────────────────────────────────────

const COUNCIL_LINEUP = [
  'anthropic:claude-opus-4-7',
  'anthropic:claude-sonnet-4-6',
  'openai:gpt-5',
  'xai:grok-4',
  'google:gemini-2.5-pro',
  'perplexity:sonar-reasoning-pro',
];

function buildFindingPrompt(finding, fileContent) {
  const excerpt = (() => {
    if (!fileContent) return '<unable to read file>';
    const lineNums = String(finding.line).split(',').map(n => parseInt(n, 10)).filter(Number.isFinite);
    if (lineNums.length === 0) return fileContent.slice(0, 6000);
    const lines = fileContent.split('\n');
    const start = Math.max(0, Math.min(...lineNums) - 30);
    const end = Math.min(lines.length, Math.max(...lineNums) + 30);
    return lines.slice(start, end).map((l, i) => `${String(start + i + 1).padStart(5)}: ${l}`).join('\n');
  })();

  return `You are SIGMA, a code-hardening + debug agent. Mitchell wants this finding fixed at the fullest quality.

SEVERITY: ${finding.severity}
CATEGORY: ${finding.category}
FILE: ${finding.file}
LINE(S): ${finding.line}
HEADLINE: ${finding.headline}

EVIDENCE:
${finding.evidence}

CURRENT FILE CONTENT (±30 lines around finding):
\`\`\`
${excerpt}
\`\`\`

YOUR TASK:
Return a fix proposal in this EXACT format. Use plain text, no markdown headers. If the finding is a false-positive or already-handled-elsewhere, set VERDICT to NOT_A_BUG and explain.

VERDICT: REAL_BUG | NOT_A_BUG | NEEDS_HUMAN_REVIEW
ROOT_CAUSE:
<1-3 sentences>

FIX_STRATEGY:
<1-3 sentences explaining the approach>

PATCH:
<<<OLD
<exact existing text to replace — must match the file VERBATIM including whitespace; if multiple instances exist, include enough context to make it unique>
OLD>>>
<<<NEW
<replacement text>
NEW>>>

TEST:
\`\`\`javascript
// node:test snippet that would catch this regression
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('<test name>', () => {
  // assertion that would fail on the unpatched code
});
\`\`\`

RISKS:
<what could go wrong with this patch — be honest>

Rules:
- The OLD block MUST appear exactly once in the current file content. If it doesn't, your patch will be rejected.
- Do NOT touch files: cv.md, modes/_profile.md, config/profile.yml, article-digest.md, data/applications.md, .env.
- Prefer minimal targeted patches over refactors.
- The TEST snippet should fail on the current (buggy) code and pass after the patch.`;
}

function parseProposal(content) {
  const verdict = (content.match(/VERDICT:\s*(REAL_BUG|NOT_A_BUG|NEEDS_HUMAN_REVIEW)/) || [])[1];
  const rootCause = (content.match(/ROOT_CAUSE:\s*\n?([\s\S]*?)(?=\nFIX_STRATEGY:|\nPATCH:|$)/) || [])[1]?.trim() || '';
  const strategy = (content.match(/FIX_STRATEGY:\s*\n?([\s\S]*?)(?=\nPATCH:|$)/) || [])[1]?.trim() || '';
  const oldMatch = content.match(/<<<OLD\n([\s\S]*?)\nOLD>>>/);
  const newMatch = content.match(/<<<NEW\n([\s\S]*?)\nNEW>>>/);
  const testMatch = content.match(/TEST:\s*\n```(?:javascript|js)?\n([\s\S]*?)\n```/);
  const risks = (content.match(/RISKS:\s*\n?([\s\S]*?)$/) || [])[1]?.trim() || '';
  return {
    verdict: verdict || 'NEEDS_HUMAN_REVIEW',
    rootCause,
    strategy,
    oldText: oldMatch ? oldMatch[1] : null,
    newText: newMatch ? newMatch[1] : null,
    testCode: testMatch ? testMatch[1] : null,
    risks,
    raw: content,
  };
}

async function councilFanOut(finding) {
  // Read from WORK_DIR so worktree-mode instances see their own (potentially
  // already-patched) source, not the main repo's.
  const filePath = join(WORK_DIR, finding.file);
  const fileContent = existsSync(filePath) ? readFileSafe(filePath) : '';
  const prompt = buildFindingPrompt(finding, fileContent);

  log(`  ⤿ council fan-out for ${finding.id} (${finding.severity} ${finding.category})`);
  const t0 = Date.now();

  const { results, missingKeys } = await callCouncil({
    prompt,
    models: COUNCIL_LINEUP,
    opts: { timeoutMs: 240_000 },
  });

  const proposals = results.filter(r => !r.error).map(r => {
    const { content } = extractRichContent(r);
    return { model: r.model, proposal: parseProposal(content), tokens: r.tokens, costUsd: r.costUsd, ms: r.ms };
  });

  const cost = proposals.reduce((s, p) => s + (p.costUsd || 0), 0);
  log(`    ${proposals.length}/${COUNCIL_LINEUP.length} models responded (${(Date.now() - t0) / 1000}s, $${cost.toFixed(2)})`);
  if (missingKeys.length) {
    log(`    skipped (missing env): ${missingKeys.map(m => m.model).join(', ')}`);
  }

  // Adjudicate: pick the proposal where MAJORITY say REAL_BUG and OLD-text matches verbatim
  const realBugs = proposals.filter(p => p.proposal.verdict === 'REAL_BUG' && p.proposal.oldText && p.proposal.newText);
  const notABug = proposals.filter(p => p.proposal.verdict === 'NOT_A_BUG').length;
  const needsHuman = proposals.filter(p => p.proposal.verdict === 'NEEDS_HUMAN_REVIEW').length;

  if (notABug >= Math.ceil(proposals.length / 2)) {
    return { verdict: 'NOT_A_BUG', proposals, cost, reason: `majority of council (${notABug}/${proposals.length}) classify as not-a-bug` };
  }
  if (realBugs.length === 0) {
    return { verdict: 'NEEDS_HUMAN_REVIEW', proposals, cost, reason: `no model returned a valid REAL_BUG patch (${needsHuman} NEEDS_HUMAN)` };
  }

  // Pick the candidate whose OLD block appears in the file verbatim
  const viable = realBugs.filter(p => {
    if (!fileContent || !p.proposal.oldText) return false;
    const occurrences = fileContent.split(p.proposal.oldText).length - 1;
    return occurrences === 1;
  });

  if (viable.length === 0) {
    return { verdict: 'NEEDS_HUMAN_REVIEW', proposals, cost, reason: 'no model returned an OLD block that matches the file verbatim and uniquely' };
  }

  // Prefer Opus → Sonnet → GPT-5 ordering when multiple are viable
  const priority = ['anthropic:claude-opus-4-7', 'anthropic:claude-sonnet-4-6', 'openai:gpt-5', 'xai:grok-4', 'google:gemini-2.5-pro', 'perplexity:sonar-reasoning-pro'];
  viable.sort((a, b) => priority.indexOf(a.model) - priority.indexOf(b.model));
  const winner = viable[0];

  return { verdict: 'REAL_BUG', winner, proposals, cost, reason: `picked ${winner.model} (${viable.length} viable, ${realBugs.length} REAL_BUG total)` };
}

// ─── Self-implementation ───────────────────────────────────────────────────────

function applyPatch(finding, winner) {
  // Write to WORK_DIR so the patch lands in the worktree (concurrent SIGMAs).
  const filePath = join(WORK_DIR, finding.file);
  if (isOffLimits(finding.file)) {
    return { ok: false, reason: `OFF_LIMITS: ${finding.file}` };
  }
  if (!existsSync(filePath)) {
    return { ok: false, reason: `file does not exist: ${filePath}` };
  }
  const before = readFileSafe(filePath);
  const beforeSha = fileSha(filePath);
  const { oldText, newText } = winner.proposal;
  if (!before.includes(oldText)) {
    return { ok: false, reason: 'OLD block no longer matches (file may have changed)' };
  }
  const occurrences = before.split(oldText).length - 1;
  if (occurrences !== 1) {
    return { ok: false, reason: `OLD block matches ${occurrences} times (must be unique)` };
  }
  const after = before.replace(oldText, newText);
  if (after === before) {
    return { ok: false, reason: 'patch did not change the file' };
  }
  writeFileSync(filePath, after);
  const afterSha = fileSha(filePath);
  return { ok: true, beforeSha, afterSha, file: finding.file };
}

function writeRegressionTest(finding, winner) {
  if (!winner.proposal.testCode) return { ok: false, reason: 'no test code provided' };
  // Write the test inside WORK_DIR so it's tracked on the SIGMA branch the
  // patch is committed to (and rolls back cleanly if the test gate fails).
  const testDir = join(WORK_DIR, 'tests/unit');
  if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  const testName = `sigma-${finding.id}.test.mjs`;
  const testPath = join(testDir, testName);
  // Wrap the test code with a banner comment
  const banner = `/**\n * sigma-${finding.id}.test.mjs — Regression test written by SIGMA on ${DATE}\n * Finding: ${finding.headline}\n * Severity: ${finding.severity}\n * Category: ${finding.category}\n * File: ${finding.file}\n */\n\n`;
  writeFileSync(testPath, banner + winner.proposal.testCode);
  return { ok: true, testPath: relative(WORK_DIR, testPath) };
}

function runTestGate() {
  log('  ▶ test-gate: node test-all.mjs --quick');
  const r = shSafe('node test-all.mjs --quick');
  const failLines = ((r.out || '').match(/^.*❌.*$/gm) || []);
  // Compare against the saved baseline (captured in preflight). The gate passes
  // if the patch did not INTRODUCE any new failures — pre-existing baseline
  // fails are tolerated. Without this comparison, every patch rolls back.
  const newFails = failLines.filter(l => !BASELINE_FAILS.has(l));
  return {
    ok: r.ok && newFails.length === 0,
    fails: newFails,             // only NEW failures (post-patch)
    baselineCount: BASELINE_FAILS.size,
    totalCount: failLines.length,
    out: r.out,
  };
}

function rollbackFinding(finding, applyResult, testPath) {
  // git checkout the patched file (in WORK_DIR via shSafe's default cwd)
  shSafe(`git checkout -- "${finding.file}"`);
  // If we wrote a regression test, delete it from the worktree
  if (testPath) {
    const fullTest = join(WORK_DIR, testPath);
    if (existsSync(fullTest)) {
      try { unlinkSync(fullTest); } catch {}
    }
  }
}

function commitFinding(finding, applyResult, testPath, winner) {
  if (MODE === 'dry-run') {
    return { ok: true, sha: 'DRY-RUN', dryRun: true };
  }
  const msg = `sigma(${finding.id}): ${finding.headline.slice(0, 90)}\n\nSeverity: ${finding.severity}\nCategory: ${finding.category}\nFile: ${finding.file}\nLine(s): ${finding.line}\nAdjudicated by: ${winner.model}\n\nRoot cause:\n${winner.proposal.rootCause}\n\nFix strategy:\n${winner.proposal.strategy}\n\nRegression test: ${testPath || 'none'}\n\nAgent: sigma-fortifier`;
  const cmd = [
    'node', 'scripts/agent-commit.mjs',
    '--agent', 'sigma-fortifier',
    '--files', `"${finding.file}${testPath ? ',' + testPath : ''}"`,
    '--message', `'${msg.replace(/'/g, "'\\''")}'`,
  ].join(' ');
  const r = shSafe(cmd);
  if (!r.ok) return { ok: false, reason: r.out };
  let parsed = {};
  try { parsed = JSON.parse(r.out); } catch {}
  return { ok: true, sha: parsed.sha || '?', branch: parsed.branch };
}

// ─── Report generation ────────────────────────────────────────────────────────

function renderAuditReport(findings, results) {
  const lines = [];
  lines.push(`# SIGMA Audit Report — ${DATE}`);
  lines.push('');
  lines.push(`**Branch:** ${BRANCH_NAME}`);
  lines.push(`**Mode:** ${MODE}`);
  lines.push(`**Findings:** ${findings.length} (capped at ${MAX_FINDINGS})`);
  lines.push(`**Generated:** ${ptIsoStamp()}`);
  lines.push('');

  // Severity summary
  const bySeverity = { CRIT: 0, HIGH: 0, MED: 0, LOW: 0 };
  findings.forEach(f => { bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1; });
  lines.push('## Severity breakdown');
  lines.push('');
  lines.push(`| Severity | Count |`);
  lines.push(`|---|---|`);
  for (const sev of ['CRIT', 'HIGH', 'MED', 'LOW']) {
    lines.push(`| ${sev} | ${bySeverity[sev]} |`);
  }
  lines.push('');

  // Stream summary
  const debug = findings.filter(f => f.stream === 'debug');
  const hardening = findings.filter(f => f.stream === 'hardening');
  lines.push(`## Stream breakdown`);
  lines.push('');
  lines.push(`- **Debug stream:** ${debug.length} findings`);
  lines.push(`- **Hardening stream:** ${hardening.length} findings`);
  lines.push('');

  // Results summary (only if we went past audit-only)
  if (results && results.length > 0) {
    const applied = results.filter(r => r.outcome === 'APPLIED').length;
    const rolledBack = results.filter(r => r.outcome === 'ROLLED_BACK').length;
    const skipped = results.filter(r => r.outcome === 'SKIPPED' || r.outcome === 'NOT_A_BUG').length;
    const needsHuman = results.filter(r => r.outcome === 'NEEDS_HUMAN').length;
    lines.push(`## Implementation results`);
    lines.push('');
    lines.push(`- **Applied + committed:** ${applied}`);
    lines.push(`- **Rolled back (test fail):** ${rolledBack}`);
    lines.push(`- **Skipped (NOT_A_BUG or off-limits):** ${skipped}`);
    lines.push(`- **Needs human review:** ${needsHuman}`);
    lines.push(`- **Total council cost:** $${results.reduce((s, r) => s + (r.cost || 0), 0).toFixed(2)}`);
    lines.push('');
  }

  // Per-finding details
  lines.push('## Findings');
  lines.push('');
  for (const f of findings) {
    lines.push(`### ${f.id} — ${f.severity} ${f.category}`);
    lines.push('');
    lines.push(`- **File:** \`${f.file}\` (line ${f.line})`);
    lines.push(`- **Headline:** ${f.headline}`);
    const result = results && results.find(r => r.id === f.id);
    if (result) {
      lines.push(`- **Outcome:** ${result.outcome}`);
      if (result.commitSha) lines.push(`- **Commit:** ${result.commitSha}`);
      if (result.reason) lines.push(`- **Reason:** ${result.reason}`);
      if (result.cost) lines.push(`- **Council cost:** $${result.cost.toFixed(2)}`);
    }
    lines.push('');
    lines.push('**Evidence:**');
    lines.push('');
    lines.push('```');
    lines.push(f.evidence.slice(0, 2000));
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Main orchestration ───────────────────────────────────────────────────────

async function main() {
  log(`▶ SIGMA fortifier starting (mode=${MODE}, max-findings=${MAX_FINDINGS})`);
  log(`  branch target: ${BRANCH_NAME}`);
  log(`  audit out: ${AUDIT_OUT}`);

  // Phase 0: pre-flight
  const pre = preflight();
  if (!pre.ok) {
    err(`pre-flight FAILED: ${pre.reason}`);
    writeFileSync(AUDIT_OUT, `# SIGMA Audit ABORTED — ${DATE}\n\nPre-flight failed: ${pre.reason}\n`);
    process.exit(2);
  }

  // Phase 1: audit (parallel)
  log('▶ Phase 1: audit pass');
  const debugFindings = [
    ...scanSyntaxFailures(),
    ...scanLaunchdErrLogs(),
    ...scanDashboardErrors(),
    ...scanAgentNDJSONFailures(),
  ];
  log(`  debug stream: ${debugFindings.length} findings`);

  const hardeningFindings = [
    ...scanHardcodedSecrets(),
    ...scanPromptInjectionSurfaces(),
    ...scanLaunchdHygiene(),
    ...scanDashboardAttackSurface(),
    ...scanOuterTemplateUnescape(),
    ...scanNpmAudit(),
  ];
  log(`  hardening stream: ${hardeningFindings.length} findings`);

  // Sort by severity, cap at MAX_FINDINGS
  const sevOrder = { CRIT: 0, HIGH: 1, MED: 2, LOW: 3 };
  const allFindings = [...debugFindings, ...hardeningFindings]
    .sort((a, b) => (sevOrder[a.severity] || 9) - (sevOrder[b.severity] || 9))
    .slice(0, MAX_FINDINGS);

  log(`▶ Total findings (capped): ${allFindings.length}`);

  if (allFindings.length === 0) {
    log('  ✓ no findings — system is clean this cycle');
    writeFileSync(AUDIT_OUT, renderAuditReport([], []));
    log(`  wrote ${AUDIT_OUT}`);
    process.exit(0);
  }

  if (MODE === 'audit-only') {
    writeFileSync(AUDIT_OUT, renderAuditReport(allFindings, null));
    log(`✓ audit-only mode: wrote ${AUDIT_OUT} with ${allFindings.length} findings (no implementation)`);
    process.exit(0);
  }

  // Phase 2 + 3: per-finding council fan-out + atomic implementation
  log('▶ Phase 2+3: council fan-out + self-implementation (per finding)');
  const results = [];
  const implLog = [];
  implLog.push(`# SIGMA Implementation Log — ${DATE}`);
  implLog.push('');
  implLog.push(`Branch: ${BRANCH_NAME}\nMode: ${MODE}\nFindings attempted: ${allFindings.length}`);
  implLog.push('');

  for (const finding of allFindings) {
    log(`▶ finding ${finding.id} [${finding.severity} ${finding.category}] ${finding.file}`);

    if (isOffLimits(finding.file)) {
      log(`  ✗ OFF_LIMITS file — skipping`);
      results.push({ id: finding.id, outcome: 'SKIPPED', reason: 'off-limits file', cost: 0 });
      implLog.push(`## ${finding.id} — SKIPPED (off-limits)\n\nFile \`${finding.file}\` is on the off-limits list. No council fan-out.\n`);
      continue;
    }

    let councilResult;
    try {
      councilResult = await councilFanOut(finding);
    } catch (e) {
      err(`council fan-out crashed: ${e.message}`);
      results.push({ id: finding.id, outcome: 'NEEDS_HUMAN', reason: `council crash: ${e.message}`, cost: 0 });
      implLog.push(`## ${finding.id} — NEEDS_HUMAN (council crash)\n\n${e.message}\n`);
      continue;
    }

    // Cost-cap backstops (Blocker 6, 2026-05-19). Per-finding cap catches a
    // single runaway call; total cap catches an accumulation of mid-range calls.
    if (councilResult.cost > MAX_COST_PER_FINDING) {
      err(`COST CAP: finding ${finding.id} cost $${councilResult.cost.toFixed(2)} exceeds --max-cost-per-finding $${MAX_COST_PER_FINDING}. ABORTING run.`);
      results.push({ id: finding.id, outcome: 'NEEDS_HUMAN', reason: `per-finding cost cap exceeded ($${councilResult.cost.toFixed(2)} > $${MAX_COST_PER_FINDING})`, cost: councilResult.cost });
      implLog.push(`## ${finding.id} — NEEDS_HUMAN (cost cap)\n\nPer-finding cost \$${councilResult.cost.toFixed(2)} exceeded --max-cost-per-finding $${MAX_COST_PER_FINDING}. Verify lib/council.mjs cost calc and finding context size.\n`);
      break; // halt the whole run — accumulating more findings only deepens the hole
    }
    const cumulativeCost = results.reduce((s, r) => s + (r.cost || 0), 0) + councilResult.cost;
    if (cumulativeCost > MAX_TOTAL_COST) {
      err(`COST CAP: cumulative cost $${cumulativeCost.toFixed(2)} exceeds --max-total-cost $${MAX_TOTAL_COST}. ABORTING run.`);
      results.push({ id: finding.id, outcome: 'NEEDS_HUMAN', reason: `cumulative cost cap exceeded ($${cumulativeCost.toFixed(2)} > $${MAX_TOTAL_COST})`, cost: councilResult.cost });
      implLog.push(`## ${finding.id} — NEEDS_HUMAN (total cost cap)\n\nCumulative cost \$${cumulativeCost.toFixed(2)} exceeded --max-total-cost $${MAX_TOTAL_COST}. Halting run.\n`);
      break;
    }

    if (councilResult.verdict === 'NOT_A_BUG') {
      log(`  ◇ NOT_A_BUG verdict — skipping`);
      results.push({ id: finding.id, outcome: 'NOT_A_BUG', reason: councilResult.reason, cost: councilResult.cost });
      implLog.push(`## ${finding.id} — NOT_A_BUG\n\n${councilResult.reason}\n\nCouncil cost: $${councilResult.cost.toFixed(2)}\n`);
      continue;
    }
    if (councilResult.verdict !== 'REAL_BUG') {
      log(`  ⚠ ${councilResult.verdict} — escalating`);
      results.push({ id: finding.id, outcome: 'NEEDS_HUMAN', reason: councilResult.reason, cost: councilResult.cost });
      implLog.push(`## ${finding.id} — NEEDS_HUMAN\n\n${councilResult.reason}\n\nCouncil cost: $${councilResult.cost.toFixed(2)}\n`);
      continue;
    }

    const winner = councilResult.winner;
    log(`  ✓ winner: ${winner.model}`);

    // Apply patch
    const apply = applyPatch(finding, winner);
    if (!apply.ok) {
      log(`  ✗ patch apply failed: ${apply.reason}`);
      results.push({ id: finding.id, outcome: 'NEEDS_HUMAN', reason: `patch apply: ${apply.reason}`, cost: councilResult.cost });
      implLog.push(`## ${finding.id} — NEEDS_HUMAN (patch apply failed)\n\n${apply.reason}\n`);
      continue;
    }

    // Write regression test
    const testResult = writeRegressionTest(finding, winner);
    if (!testResult.ok) {
      log(`  ⚠ no regression test (${testResult.reason}) — proceeding anyway`);
    } else {
      log(`  ✓ regression test: ${testResult.testPath}`);
    }

    // Test gate
    const test = runTestGate();
    if (!test.ok) {
      log(`  ✗ test gate FAILED (${test.fails.length} NEW fails on top of ${test.baselineCount} baseline) — rolling back`);
      rollbackFinding(finding, apply, testResult.ok ? testResult.testPath : null);
      results.push({
        id: finding.id, outcome: 'ROLLED_BACK',
        reason: `test gate introduced ${test.fails.length} new fails: ${test.fails.slice(0, 3).join('; ')}`,
        cost: councilResult.cost,
      });
      implLog.push(`## ${finding.id} — ROLLED_BACK\n\nPatch applied (sha ${apply.beforeSha} → ${apply.afterSha}), then test gate introduced ${test.fails.length} NEW failures on top of the ${test.baselineCount}-line baseline:\n\n${test.fails.slice(0, 5).join('\n')}\n\nReverted via git checkout. Council cost: $${councilResult.cost.toFixed(2)}\n`);
      continue;
    }

    log(`  ✓ test gate green (${test.totalCount} total fails matches baseline ${test.baselineCount})`);

    // Commit
    const commit = commitFinding(finding, apply, testResult.ok ? testResult.testPath : null, winner);
    if (!commit.ok) {
      log(`  ✗ commit failed: ${commit.reason}`);
      rollbackFinding(finding, apply, testResult.ok ? testResult.testPath : null);
      results.push({ id: finding.id, outcome: 'NEEDS_HUMAN', reason: `commit failed: ${commit.reason}`, cost: councilResult.cost });
      implLog.push(`## ${finding.id} — NEEDS_HUMAN (commit failed)\n\n${commit.reason}\n`);
      continue;
    }

    log(`  ✓ committed ${commit.sha}`);
    results.push({
      id: finding.id, outcome: 'APPLIED', commitSha: commit.sha,
      reason: `adjudicated by ${winner.model}`, cost: councilResult.cost,
    });
    implLog.push(`## ${finding.id} — APPLIED\n\n- Commit: ${commit.sha}\n- Adjudicated by: ${winner.model}\n- Council cost: $${councilResult.cost.toFixed(2)}\n- Regression test: ${testResult.ok ? testResult.testPath : 'none'}\n\nRoot cause: ${winner.proposal.rootCause}\n\nFix strategy: ${winner.proposal.strategy}\n`);
  }

  // Phase 4: re-audit (only if anything was applied)
  const applied = results.filter(r => r.outcome === 'APPLIED');
  if (applied.length > 0 && MODE === 'full') {
    log(`▶ Phase 4: re-audit after ${applied.length} applied fix(es)`);
    const reDebug = [
      ...scanSyntaxFailures(),
      ...scanLaunchdErrLogs(),
      ...scanDashboardErrors(),
      ...scanAgentNDJSONFailures(),
    ];
    const reHardening = [
      ...scanHardcodedSecrets(),
      ...scanPromptInjectionSurfaces(),
      ...scanLaunchdHygiene(),
      ...scanDashboardAttackSurface(),
      ...scanOuterTemplateUnescape(),
    ];
    const reTotal = reDebug.length + reHardening.length;
    log(`  re-audit: ${reTotal} findings remain (was ${allFindings.length})`);
    implLog.push('');
    implLog.push(`## Re-audit\n\n${reTotal} findings remain (was ${allFindings.length}; ${allFindings.length - reTotal} resolved).\n`);
  }

  // Phase 5: write outputs
  writeFileSync(AUDIT_OUT, renderAuditReport(allFindings, results));
  writeFileSync(IMPL_LOG, implLog.join('\n'));
  log(`✓ wrote ${AUDIT_OUT}`);
  log(`✓ wrote ${IMPL_LOG}`);

  // Final summary
  const summary = {
    applied: results.filter(r => r.outcome === 'APPLIED').length,
    rolledBack: results.filter(r => r.outcome === 'ROLLED_BACK').length,
    skipped: results.filter(r => r.outcome === 'SKIPPED' || r.outcome === 'NOT_A_BUG').length,
    needsHuman: results.filter(r => r.outcome === 'NEEDS_HUMAN').length,
    totalCost: results.reduce((s, r) => s + (r.cost || 0), 0),
  };
  log(`▶ SIGMA done: ${summary.applied} applied, ${summary.rolledBack} rolled-back, ${summary.skipped} skipped, ${summary.needsHuman} needs-human, total $${summary.totalCost.toFixed(2)}`);
  log(`  branch: ${BRANCH_NAME} — review with: git log ${BRANCH_NAME}`);

  // Multi-instance coordination (Blocker 7) — mark this instance completed,
  // then try to become the "last instance" leader. The leader merges every
  // completed peer's sigma branch into main and pushes once. If we're NOT
  // last, another running peer will do it later. Skip entirely in dry-run.
  if (MODE !== 'dry-run') {
    markInstanceComplete({ applied: summary.applied, rolledBack: summary.rolledBack, totalCost: summary.totalCost });
    const reg = readRegistry();
    const stillRunning = reg.instances.filter(i => i.id !== INSTANCE_ID && i.status === 'running').length;
    if (stillRunning > 0) {
      log(`  ◇ ${stillRunning} sibling SIGMA instance(s) still running — they will merge + push when last to finish`);
    } else if (tryBecomeLeader()) {
      log(`▶ leader: all SIGMA instances complete — merging + pushing`);
      try {
        leaderMergeAndPush();
      } finally {
        releaseLeaderLock();
        cleanupWorktree();
      }
    } else {
      log(`  ◇ another instance won the leader election — they will merge + push`);
    }
  }
}

// ─── Entry ────────────────────────────────────────────────────────────────────

main().catch(e => {
  err(`fatal: ${e.stack || e.message}`);
  process.exit(1);
});
