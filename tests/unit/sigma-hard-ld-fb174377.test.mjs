/**
 * sigma-hard-ld-fb174377.test.mjs — Regression test written by SIGMA on 2026-05-19
 * Finding: com.mitchell.career-ops.batch.plist: 1 hygiene issue(s)
 * Severity: MED
 * Category: launchd-hygiene
 * File: scripts/launchd/com.mitchell.career-ops.batch.plist
 */

// node:test snippet that would catch this regression
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const plistPath = resolve(__dirname, '../scripts/launchd/com.mitchell.career-ops.batch.plist');

test('batch launchd plist does not pin a versioned nvm node path', () => {
  const contents = readFileSync(plistPath, 'utf8');
  // Pinned nvm version paths break on nvm upgrade / prune.
  const pinned = /\/\.nvm\/versions\/node\/v\d+\.\d+\.\d+\/bin\/node/;
  assert.equal(
    pinned.test(contents),
    false,
    'plist contains a version-pinned nvm node path; use nvm.sh sourcing or a stable symlink instead'
  );
  // Sanity: the runner script is still invoked.
  assert.match(contents, /batch-runner-unattended\.mjs/);
});