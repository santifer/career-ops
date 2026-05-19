/**
 * sigma-hard-ld-2853eabe.test.mjs — Regression test written by SIGMA on 2026-05-19
 * Finding: com.mitchell.career-ops.bravo-quick-walk.plist: 1 hygiene issue(s)
 * Severity: MED
 * Category: launchd-hygiene
 * File: scripts/launchd/com.mitchell.career-ops.bravo-quick-walk.plist
 */

// node:test snippet that would catch this regression
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('bravo-quick-walk plist does not pin an nvm-versioned node path', () => {
  const plist = readFileSync(
    'scripts/launchd/com.mitchell.career-ops.bravo-quick-walk.plist',
    'utf8'
  );
  // Any path like /.nvm/versions/node/vX.Y.Z/bin/node is brittle across nvm upgrades.
  const pinned = /\.nvm\/versions\/node\/v\d+\.\d+\.\d+\/bin\/node/;
  assert.ok(
    !pinned.test(plist),
    'plist must not hardcode a pinned nvm node version path; let cron-run.sh resolve node'
  );
});