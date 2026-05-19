/**
 * sigma-hard-ld-96301d50.test.mjs — Regression test written by SIGMA on 2026-05-19
 * Finding: com.mitchell.career-ops.detector-health.plist: 1 hygiene issue(s)
 * Severity: MED
 * Category: launchd-hygiene
 * File: scripts/launchd/com.mitchell.career-ops.detector-health.plist
 */

// node:test snippet that would catch this regression
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('detector-health plist does not pin a specific node version path', () => {
  const plist = readFileSync(
    'scripts/launchd/com.mitchell.career-ops.detector-health.plist',
    'utf8'
  );
  // Fails on the current buggy file because it contains /.nvm/versions/node/v24.14.0/bin/node
  assert.doesNotMatch(
    plist,
    /\/\.nvm\/versions\/node\/v\d+\.\d+\.\d+\/bin\/node/,
    'plist must not hard-code a pinned nvm node version path'
  );
  // And must invoke node via nvm-exec or a stable shim
  assert.match(
    plist,
    /nvm-exec|\/usr\/local\/bin\/node|\/opt\/homebrew\/bin\/node/,
    'plist should resolve node via nvm-exec or a stable system path'
  );
});