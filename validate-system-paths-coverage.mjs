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
 * Complements updater-migration-tests.mjs which checks a HARDCODED
 * list of required paths — that catches drift in known paths, this
 * catches the "we forgot to add the new file" class entirely.
 *
 * Run: node validate-system-paths-coverage.mjs
 * Exit 0 = clean. Exit 1 = orphan files listed.
 */

import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(ROOT, 'update-system.mjs'), 'utf-8');

function extractArray(name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!match) {
    console.error(`FAIL ${name} array not found in update-system.mjs`);
    process.exit(1);
  }
  return Array.from(match[1].matchAll(/'([^']+)'/g), (m) => m[1]);
}

const SYSTEM_PATHS = extractArray('SYSTEM_PATHS');
const USER_PATHS = extractArray('USER_PATHS');
const ALL_PATHS = [...SYSTEM_PATHS, ...USER_PATHS];

function covered(file) {
  return ALL_PATHS.some((path) =>
    path.endsWith('/') ? file.startsWith(path) : file === path,
  );
}

const tracked = execFileSync('git', ['ls-files'], {
  cwd: ROOT,
  encoding: 'utf-8',
})
  .trim()
  .split('\n')
  .filter(Boolean);

const orphans = tracked.filter((f) => !covered(f));

if (orphans.length > 0) {
  console.error('Coverage gap — tracked files not in SYSTEM_PATHS or USER_PATHS:');
  for (const orphan of orphans) console.error(`  ${orphan}`);
  console.error('');
  console.error('Add each path to update-system.mjs SYSTEM_PATHS (if system layer)');
  console.error('or USER_PATHS (if user-owned), then re-run this check.');
  process.exit(1);
}

console.log(`OK ${tracked.length} tracked files covered by SYSTEM_PATHS or USER_PATHS`);
