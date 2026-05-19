/**
 * sigma-hard-ld-3a4e438e.test.mjs — Regression test written by SIGMA on 2026-05-19
 * Finding: com.mitchell.career-ops.buttons-smoke.plist: 1 hygiene issue(s)
 * Severity: MED
 * Category: launchd-hygiene
 * File: scripts/launchd/com.mitchell.career-ops.buttons-smoke.plist
 */

// node:test snippet that would catch this regression
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const plistPath = path.resolve(
  here,
  '../scripts/launchd/com.mitchell.career-ops.buttons-smoke.plist'
);

test('buttons-smoke plist does not pin a versioned nvm node path', () => {
  const contents = readFileSync(plistPath, 'utf8');

  // Fails on the unpatched file because it contains
  // /.nvm/versions/node/v24.14.0/bin/node
  assert.doesNotMatch(
    contents,
    /\.nvm\/versions\/node\/v\d+\.\d+\.\d+\/bin\/node/,
    'plist must not hardcode a version-pinned nvm node binary'
  );

  // And it should still actually invoke node somehow.
  assert.match(contents, /\bnode\b/, 'plist must still invoke node');
});