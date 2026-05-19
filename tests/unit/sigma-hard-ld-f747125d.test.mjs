/**
 * sigma-hard-ld-f747125d.test.mjs — Regression test written by SIGMA on 2026-05-19
 * Finding: com.mitchell.career-ops.delta-ats-watch.plist: 1 hygiene issue(s)
 * Severity: MED
 * Category: launchd-hygiene
 * File: scripts/launchd/com.mitchell.career-ops.delta-ats-watch.plist
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('delta-ats-watch.plist does not pin an nvm-versioned node binary path', () => {
  const plist = readFileSync(
    'scripts/launchd/com.mitchell.career-ops.delta-ats-watch.plist',
    'utf8'
  );

  // Should not embed a specific nvm node version path — those break on `nvm install`/`nvm uninstall`.
  assert.doesNotMatch(
    plist,
    /\.nvm\/versions\/node\/v\d+\.\d+\.\d+\/bin\/node/,
    'plist pins a specific nvm node version path; will break on nvm upgrade'
  );
});