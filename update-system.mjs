#!/usr/bin/env node

/**
 * update-system.mjs — Safe auto-updater for career-ops
 *
 * Updates ONLY system layer files (modes, scripts, dashboard, templates).
 * NEVER touches user data (cv.md, profile.yml, _profile.md, data/, reports/).
 *
 * Usage:
 *   node update-system.mjs check      # Check if update available
 *   node update-system.mjs apply --reviewed                   # Apply update after review gate
 *   node update-system.mjs apply --reviewed --install-deps    # Optional locked deps install
 *   node update-system.mjs rollback   # Rollback last update
 *   node update-system.mjs dismiss    # Dismiss update check
 *
 * See DATA_CONTRACT.md for the full system/user layer definitions.
 */

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

const CANONICAL_REPO = 'https://github.com/santifer/career-ops.git';
const RAW_VERSION_URL = 'https://raw.githubusercontent.com/santifer/career-ops/main/VERSION';
const RELEASES_API = 'https://api.github.com/repos/santifer/career-ops/releases/latest';
const VERSION_RE = /^\d+\.\d+\.\d+$/;

// System layer paths — ONLY these files get updated
const SYSTEM_PATHS = [
  'AGENTS.md',
  'modes/_shared.md',
  'modes/_profile.template.md',
  'modes/oferta.md',
  'modes/pdf.md',
  'modes/scan.md',
  'modes/batch.md',
  'modes/apply.md',
  'modes/auto-pipeline.md',
  'modes/contacto.md',
  'modes/deep.md',
  'modes/ofertas.md',
  'modes/pipeline.md',
  'modes/project.md',
  'modes/tracker.md',
  'modes/training.md',
  'modes/de/',
  'CLAUDE.md',
  'generate-pdf.mjs',
  'merge-tracker.mjs',
  'verify-pipeline.mjs',
  'dedup-tracker.mjs',
  'normalize-statuses.mjs',
  'cv-sync-check.mjs',
  'update-system.mjs',
  'batch/batch-prompt.md',
  'batch/batch-runner.sh',
  'batch/agent-adapter.example.sh',
  'dashboard/',
  'templates/',
  'fonts/',
  '.claude/skills/',
  'docs/',
  'VERSION',
  'DATA_CONTRACT.md',
  'CONTRIBUTING.md',
  'README.md',
  'LICENSE',
  'CITATION.cff',
  '.github/',
  'package.json',
  'package-lock.json',
];

// User layer paths — NEVER touch these (safety check)
const USER_PATHS = [
  'cv.md',
  'config/profile.yml',
  'modes/_profile.md',
  'portals.yml',
  'article-digest.md',
  'interview-prep/story-bank.md',
  'data/',
  'reports/',
  'output/',
  'jds/',
];

function assertVersion(value, source = 'VERSION') {
  if (!VERSION_RE.test(value)) {
    throw new Error(`Invalid ${source}: expected MAJOR.MINOR.PATCH, got "${value}"`);
  }
  return value;
}

function localVersion() {
  const vPath = join(ROOT, 'VERSION');
  const value = existsSync(vPath) ? readFileSync(vPath, 'utf-8').trim() : '0.0.0';
  return assertVersion(value);
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf-8', timeout: 30000 }).trim();
}

async function confirmReviewedInteractively() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await new Promise((resolve) => {
      rl.question('Type "yes" to confirm you reviewed the incoming update diff: ', resolve);
    });
    return String(answer).trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

// ── CHECK ───────────────────────────────────────────────────────

async function check() {
  // Respect dismiss flag
  if (existsSync(join(ROOT, '.update-dismissed'))) {
    console.log(JSON.stringify({ status: 'dismissed' }));
    return;
  }

  const local = localVersion();
  let remote;

  try {
    const res = await fetch(RAW_VERSION_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    remote = assertVersion((await res.text()).trim(), 'remote VERSION');
  } catch {
    console.log(JSON.stringify({ status: 'offline', local }));
    return;
  }

  if (compareVersions(local, remote) >= 0) {
    console.log(JSON.stringify({ status: 'up-to-date', local, remote }));
    return;
  }

  // Fetch changelog from GitHub releases
  let changelog = '';
  try {
    const res = await fetch(RELEASES_API, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (res.ok) {
      const release = await res.json();
      changelog = release.body || '';
    }
  } catch {
    // No changelog available, that's OK
  }

  console.log(JSON.stringify({
    status: 'update-available',
    local,
    remote,
    changelog: changelog.slice(0, 500),
  }));
}

// ── APPLY ───────────────────────────────────────────────────────

async function apply() {
  const local = localVersion();
  const installDeps = process.argv.includes('--install-deps');
  let reviewed = process.argv.includes('--reviewed');

  if (!reviewed && process.stdin.isTTY && process.stdout.isTTY) {
    console.log('Review gate required before applying system updates.');
    reviewed = await confirmReviewedInteractively();
  }

  if (!reviewed) {
    console.error('Refusing to apply update without review gate.');
    console.error('Review changes first, then run:');
    console.error('  node update-system.mjs apply --reviewed [--install-deps]');
    process.exit(1);
  }

  // Check for lock
  const lockFile = join(ROOT, '.update-lock');
  if (existsSync(lockFile)) {
    console.error('Update already in progress (.update-lock exists). If stuck, delete it manually.');
    process.exit(1);
  }

  // Create lock
  writeFileSync(lockFile, new Date().toISOString());

  try {
    // 1. Backup: create branch
    const backupBranch = `backup-pre-update-${local}`;
    try {
      git('branch', backupBranch);
      console.log(`Backup branch created: ${backupBranch}`);
    } catch {
      console.log(`Backup branch already exists (${backupBranch}), continuing...`);
    }

    // 2. Fetch from canonical repo
    console.log('Fetching latest from upstream...');
    git('fetch', CANONICAL_REPO, 'main');

    // 3. Checkout system files only
    console.log('Updating system files...');
    const updated = [];
    for (const path of SYSTEM_PATHS) {
      try {
        git('checkout', 'FETCH_HEAD', '--', path);
        updated.push(path);
      } catch {
        // File may not exist in remote (new additions), skip
      }
    }

    // 4. Validate: check NO user files were touched
    let userFileTouched = false;
    try {
      const status = git('status', '--porcelain');
      for (const line of status.split('\n')) {
        if (!line.trim()) continue;
        const file = line.slice(3);
        for (const userPath of USER_PATHS) {
          if (file.startsWith(userPath)) {
            console.error(`SAFETY VIOLATION: User file was modified: ${file}`);
            userFileTouched = true;
          }
        }
      }
    } catch {
      // git status failed, skip validation
    }

    if (userFileTouched) {
      console.error('Aborting: user files were touched. Rolling back...');
      for (const path of updated) {
        try {
          git('checkout', 'HEAD', '--', path);
        } catch {
          // Path may have been newly introduced by FETCH_HEAD.
          try {
            git('rm', '-r', '--ignore-unmatch', path);
          } catch {
            // Ignore cleanup failures; we still abort.
          }
        }
      }
      unlinkSync(lockFile);
      process.exit(1);
    }

    // 5. Optional dependency install.
    // Disabled by default so freshly fetched code is never executed automatically.
    if (installDeps) {
      const lockPath = join(ROOT, 'package-lock.json');
      if (existsSync(lockPath)) {
        try {
          execFileSync('npm', ['ci', '--ignore-scripts', '--silent'], {
            cwd: ROOT,
            timeout: 120000,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          console.log('Dependencies installed with npm ci --ignore-scripts');
        } catch {
          console.log('Dependency install failed; run npm ci --ignore-scripts manually');
        }
      } else {
        console.log('Skipping dependency install: package-lock.json not found (lockfile install required)');
      }
    } else {
      console.log('Dependency install skipped by default. Review changes, then run npm ci manually if needed.');
    }

    // 6. Commit the update
    const remote = localVersion(); // Re-read after checkout updated VERSION
    try {
      for (const path of SYSTEM_PATHS) {
        try {
          git('add', '-A', path);
        } catch {
          // Path may not exist in this checkout.
        }
      }
      // If the dismiss marker was removed, stage that deletion explicitly.
      git('add', '-A', '.update-dismissed');
      git('commit', '-m', `chore: auto-update system files to v${remote}`);
    } catch {
      // Nothing to commit (already up to date)
    }

    // 7. Clean up dismiss flag if it exists
    const dismissFile = join(ROOT, '.update-dismissed');
    if (existsSync(dismissFile)) unlinkSync(dismissFile);

    console.log(`\nUpdate complete: v${local} → v${remote}`);
    console.log(`Updated ${updated.length} system paths.`);
    console.log(`Rollback available: node update-system.mjs rollback`);

  } finally {
    // Remove lock
    if (existsSync(lockFile)) unlinkSync(lockFile);
  }
}

// ── ROLLBACK ────────────────────────────────────────────────────

function rollback() {
  const local = localVersion();

  // Find most recent backup branch
  try {
    const branches = git('branch', '--list', 'backup-pre-update-*');
    const branchList = branches.split('\n').map(b => b.trim().replace('* ', '')).filter(Boolean);

    if (branchList.length === 0) {
      console.error('No backup branches found. Nothing to rollback.');
      process.exit(1);
    }

    const latest = branchList[branchList.length - 1];
    console.log(`Rolling back to: ${latest}`);

    // Checkout system files from backup branch
    for (const path of SYSTEM_PATHS) {
      try {
        git('checkout', latest, '--', path);
      } catch {
        // File may not have existed in backup
      }
    }

    for (const path of SYSTEM_PATHS) {
      try {
        git('add', '-A', path);
      } catch {
        // Path may not exist in this checkout.
      }
    }
    git('commit', '-m', `chore: rollback system files from ${latest}`);

    console.log(`Rollback complete. System files restored from ${latest}.`);
    console.log('Your data (CV, profile, tracker, reports) was not affected.');
  } catch (err) {
    console.error('Rollback failed:', err.message);
    process.exit(1);
  }
}

// ── DISMISS ─────────────────────────────────────────────────────

function dismiss() {
  writeFileSync(join(ROOT, '.update-dismissed'), new Date().toISOString());
  console.log('Update check dismissed. Run "node update-system.mjs check" or say "check for updates" to re-enable.');
}

// ── MAIN ────────────────────────────────────────────────────────

const cmd = process.argv[2] || 'check';

switch (cmd) {
  case 'check': await check(); break;
  case 'apply': await apply(); break;
  case 'rollback': rollback(); break;
  case 'dismiss': dismiss(); break;
  default:
    console.log('Usage: node update-system.mjs [check|apply|rollback|dismiss] [--reviewed] [--install-deps]');
    process.exit(1);
}
