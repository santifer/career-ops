#!/usr/bin/env node
/**
 * scripts/agent-commit.mjs — Corpus auto-edit + git audit infrastructure.
 *
 * Per career calibration 2026-05-16: corpus files (cv.md, config/profile.yml,
 * modes/*.md, article-digest.md, interview-prep/*.md, writing-samples/*,
 * data/*-readiness/*, etc.) are fully autonomously editable by agents WITH
 * git as the audit trail. Agents do not require diff approval per file; git
 * log is the safety net. Mitchell can review or revert any change.
 *
 * Outbound actions (sending email/DMs) and cost-ceiling raises still require
 * explicit approval — those are NOT covered by this helper.
 *
 * Usage (called by agents):
 *   node scripts/agent-commit.mjs \
 *     --agent github-readiness \
 *     --files "cv.md,modes/_profile.md" \
 *     --message "Update target archetypes per calibration brief 2026-05-16"
 *
 * Optional flags:
 *   --dry-run             Show what would commit, don't actually commit
 *   --no-skip-empty       Force commit even if staged diff is empty (default: skip)
 *   --branch <name>       Create + commit on a new branch (default: current)
 *
 * Returns:
 *   stdout JSON: { ok, sha, files_changed, message, branch, dry_run }
 *   exit 0 on success or intentional skip (empty diff)
 *   exit 1 on validation failure or git error
 *
 * Hard rules enforced:
 *   - Files must be inside the repo (no traversal)
 *   - No --no-verify (pre-commit hooks run as normal)
 *   - Never targets the santifer upstream (push step is separate)
 *   - Commit message always includes "Agent: <name>" trailer for grep-ability
 *   - --signoff for proper git author attribution
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { resolve, relative, isAbsolute } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(__filename, '../..');

const args = process.argv.slice(2);
function arg(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
}
function flag(name) { return args.includes(name); }

const agentName  = arg('--agent');
const filesRaw   = arg('--files');
const message    = arg('--message');
const dryRun     = flag('--dry-run');
const noSkipEmpty= flag('--no-skip-empty');
const targetBranch = arg('--branch');

function fail(msg, code = 1) {
  console.log(JSON.stringify({ ok: false, error: msg }));
  process.exit(code);
}

if (!agentName) fail('--agent <name> required');
if (!filesRaw)  fail('--files "a.md,b.md" required');
if (!message)   fail('--message "..." required');

// Validate files are inside the repo
const files = filesRaw.split(',').map(s => s.trim()).filter(Boolean);
const repoFiles = [];
for (const f of files) {
  const abs = isAbsolute(f) ? f : resolve(ROOT, f);
  const rel = relative(ROOT, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    fail(`File outside repo: ${f}`);
  }
  if (!existsSync(abs)) {
    fail(`File not found: ${rel}`);
  }
  if (statSync(abs).isDirectory()) {
    fail(`Path is a directory, expected file: ${rel}`);
  }
  repoFiles.push(rel);
}

// Optional: branch handling
if (targetBranch) {
  try {
    execSync(`git checkout -b "${targetBranch}"`, { cwd: ROOT, stdio: 'pipe' });
  } catch (e) {
    // Branch may already exist — try plain checkout
    try {
      execSync(`git checkout "${targetBranch}"`, { cwd: ROOT, stdio: 'pipe' });
    } catch (e2) {
      fail(`Could not switch to branch ${targetBranch}: ${e2.message}`);
    }
  }
}

// Stage only the specified files (NEVER use `git add -A`)
try {
  for (const f of repoFiles) {
    execSync(`git add "${f}"`, { cwd: ROOT, stdio: 'pipe' });
  }
} catch (e) {
  fail(`git add failed: ${e.message}`);
}

// Check if there's actually anything to commit
let stagedDiff;
try {
  stagedDiff = execSync('git diff --cached --shortstat', { cwd: ROOT, encoding: 'utf-8' }).trim();
} catch (e) {
  fail(`git diff failed: ${e.message}`);
}

if (!stagedDiff && !noSkipEmpty) {
  console.log(JSON.stringify({
    ok: true,
    skipped: 'no_changes',
    files_attempted: repoFiles,
    message: 'Nothing to commit — staged diff is empty after add.',
  }));
  process.exit(0);
}

// Compose the commit message
const trailerAgent = `Agent: ${agentName}`;
const trailerCalibration = `Per: career-calibration brief 2026-05-16 (corpus auto-edit authorized)`;
const fullMessage = `${message}\n\n${trailerCalibration}\n${trailerAgent}`;

if (dryRun) {
  console.log(JSON.stringify({
    ok: true,
    dry_run: true,
    files_changed: repoFiles,
    staged_diff: stagedDiff,
    message: fullMessage,
    branch: getBranch(),
  }, null, 2));
  // Unstage so dry-run doesn't leave the index dirty
  try { execSync(`git reset HEAD -- ${repoFiles.map(f => `"${f}"`).join(' ')}`, { cwd: ROOT, stdio: 'pipe' }); } catch {}
  process.exit(0);
}

// Real commit. --signoff for git author attribution; no --no-verify.
const r = spawnSync('git', ['commit', '--signoff', '-m', fullMessage], {
  cwd: ROOT,
  encoding: 'utf-8',
});

if (r.status !== 0) {
  fail(`git commit failed (status ${r.status}): ${(r.stderr || r.stdout || '').slice(0, 500)}`);
}

let sha = '';
try {
  sha = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim();
} catch {}

console.log(JSON.stringify({
  ok: true,
  sha,
  files_changed: repoFiles,
  staged_diff: stagedDiff,
  message: fullMessage,
  branch: getBranch(),
  commit_output: (r.stdout || '').trim().slice(0, 500),
}, null, 2));

function getBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim();
  } catch { return 'unknown'; }
}
