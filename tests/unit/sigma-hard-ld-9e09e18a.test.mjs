/**
 * sigma-hard-ld-9e09e18a.test.mjs — Regression test written by SIGMA on 2026-05-19
 * Finding: com.mitchell.career-ops.dashboard-server.plist: 1 hygiene issue(s)
 * Severity: MED
 * Category: launchd-hygiene
 * File: scripts/launchd/com.mitchell.career-ops.dashboard-server.plist
 */

// node:test snippet that would catch this regression
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('dashboard-server launchd plist does not pin a specific nvm node version', () => {
  const plist = readFileSync(
    'scripts/launchd/com.mitchell.career-ops.dashboard-server.plist',
    'utf8'
  );
  // Should not reference a versioned nvm node binary like .../node/v24.14.0/bin/node
  const pinnedNvm = /\.nvm\/versions\/node\/v\d+\.\d+\.\d+\/bin\/node/;
  assert.ok(
    !pinnedNvm.test(plist),
    'plist must not hardcode a specific nvm-installed node version path'
  );
  // And must still launch node somehow (either via nvm.sh sourcing or a stable symlink)
  assert.ok(
    /nvm\.sh/.test(plist) || /\/node\/default\/bin\/node/.test(plist),
    'plist must resolve node via nvm.sh or a stable default symlink'
  );
});