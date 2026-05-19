/**
 * sigma-hard-ld-3eeee90d.test.mjs — Regression test written by SIGMA on 2026-05-19
 * Finding: com.mitchell.career-ops.career-library.plist: 1 hygiene issue(s)
 * Severity: MED
 * Category: launchd-hygiene
 * File: scripts/launchd/com.mitchell.career-ops.career-library.plist
 */

// node:test snippet that would catch this regression
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const plistPath = resolve(
  __dirname,
  '../scripts/launchd/com.mitchell.career-ops.career-library.plist'
);

test('career-library plist does not pin a specific nvm node version', () => {
  const contents = readFileSync(plistPath, 'utf8');
  // Pinned paths like /.nvm/versions/node/v24.14.0/bin/node break on nvm upgrade.
  const pinnedNvmNode = /\/\.nvm\/versions\/node\/v\d+\.\d+\.\d+\/bin\/node/;
  assert.ok(
    !pinnedNvmNode.test(contents),
    'plist must not hardcode a pinned nvm node binary path'
  );
  // And it should still actually invoke node somehow.
  assert.ok(/\bnode\b/.test(contents), 'plist must still reference node');
});