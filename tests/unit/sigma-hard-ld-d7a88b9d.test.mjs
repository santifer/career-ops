/**
 * sigma-hard-ld-d7a88b9d.test.mjs — Regression test written by SIGMA on 2026-05-19
 * Finding: com.mitchell.career-ops.gamma-truth-audit.plist: 1 hygiene issue(s)
 * Severity: MED
 * Category: launchd-hygiene
 * File: scripts/launchd/com.mitchell.career-ops.gamma-truth-audit.plist
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('gamma-truth-audit plist does not pin a versioned nvm node path', () => {
  const plist = readFileSync(
    'scripts/launchd/com.mitchell.career-ops.gamma-truth-audit.plist',
    'utf8'
  );
  // Catches a versioned nvm node binary in the path string
  // (e.g. `.nvm/versions/node/vX.Y.Z/bin/node`)
  const pinned = /\.nvm\/versions\/node\/v\d+\.\d+\.\d+\/bin\/node/;
  assert.ok(
    !pinned.test(plist),
    'plist must not hardcode a versioned nvm node binary path'
  );
});