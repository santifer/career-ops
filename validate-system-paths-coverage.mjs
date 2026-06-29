#!/usr/bin/env node

/**
 * validate-system-paths-coverage.mjs — structural coverage check for the
 * auto-updater layer split.
 *
 * Every tracked file in the repo must be covered by either SYSTEM_PATHS
 * (system layer, fetched on `update-system.mjs apply`) or USER_PATHS
 * (user-owned, never touched). Anything else is a coverage gap: it
 * lives in the repo but the auto-updater won't propagate it to
 * clients on `apply`. That breaks them on the next test run.
 *
 * Run: node validate-system-paths-coverage.mjs
 * Exit 0 = clean. Exit 1 = orphan files listed.
 */

import { execFileSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractArrayFromSource } from './update-system.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(ROOT, 'update-system.mjs');

if (!existsSync(sourcePath)) {
  console.error('FAIL: update-system.mjs not found');
  process.exit(1);
}

const source = readFileSync(sourcePath, 'utf-8');

const SYSTEM_PATHS = extractArrayFromSource(source, 'SYSTEM_PATHS');
const USER_PATHS = extractArrayFromSource(source, 'USER_PATHS');

if (SYSTEM_PATHS.length === 0 || USER_PATHS.length === 0) {
  console.error('FAIL: SYSTEM_PATHS or USER_PATHS not found in update-system.mjs');
  process.exit(1);
}
const ALL_PATHS = [...SYSTEM_PATHS, ...USER_PATHS];

const EXCLUDES = [
  '.coderabbit.yaml',
  '.envrc',
  '.gitignore',
  '.release-please-manifest.json',
  'release-please-config.json',
  'renovate.json',
  'flake.lock',
  'flake.nix',
  'batch/logs/.gitkeep',
  'batch/tracker-additions/.gitkeep',
  'interview-prep/.gitkeep',
];

function covered(file) {
  // If explicitly excluded, it is covered
  if (EXCLUDES.includes(file)) return true;

  return ALL_PATHS.some((path) =>
    path.endsWith('/') ? file.startsWith(path) : file === path,
  );
}

if (process.argv.includes('--self-test')) {
  console.log('Running validate-system-paths-coverage.mjs self-tests...');
  
  const assert = (condition, message) => {
    if (!condition) {
      console.error(`FAIL: ${message}`);
      process.exit(1);
    }
  };

  // Test explicitly excluded files
  assert(covered('.gitignore') === true, '.gitignore must be covered (excluded)');
  assert(covered('.coderabbit.yaml') === true, '.coderabbit.yaml must be covered (excluded)');

  // Test exact matches in SYSTEM_PATHS / USER_PATHS
  assert(covered('CLAUDE.md') === true, 'CLAUDE.md must be covered (exact match)');

  // Test directory prefix matches (which end in '/')
  assert(covered('providers/justjoin.mjs') === true, 'providers/justjoin.mjs must be covered (dir prefix match)');

  // Test sibling mismatch (strict prefix match)
  assert(covered('providers-sibling/justjoin.mjs') === false, 'providers-sibling/justjoin.mjs must NOT be covered');

  // Test unrelated file
  assert(covered('untracked-orphan-file-xyz.js') === false, 'untracked-orphan-file-xyz.js must NOT be covered');

  console.log('ALL SELF-TESTS PASSED');
  process.exit(0);
}

let tracked;
try {
  tracked = execFileSync('git', ['ls-files'], {
    cwd: ROOT,
    encoding: 'utf-8',
  })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
} catch (err) {
  console.error('FAIL: git ls-files failed:', err.message);
  process.exit(1);
}

const orphans = tracked.filter((f) => !covered(f));

if (orphans.length > 0) {
  console.error('Coverage gap — tracked files not in SYSTEM_PATHS or USER_PATHS:');
  for (const orphan of orphans) console.error(`  ${orphan}`);
  console.error('');
  console.error('Add each path to update-system.mjs SYSTEM_PATHS (if system layer)');
  console.error('or USER_PATHS (if user-owned), then re-run this check.');
  process.exit(1);
}

console.log(`OK: ${tracked.length} tracked files covered by SYSTEM_PATHS or USER_PATHS`);
process.exit(0);
