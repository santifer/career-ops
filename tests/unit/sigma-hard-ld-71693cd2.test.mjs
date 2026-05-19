/**
 * sigma-hard-ld-71693cd2.test.mjs — Regression test written by SIGMA on 2026-05-19
 * Finding: com.mitchell.career-ops.audit.plist: 1 hygiene issue(s)
 * Severity: MED
 * Category: launchd-hygiene
 * File: scripts/launchd/com.mitchell.career-ops.audit.plist
 */

// node:test snippet that would catch this regression
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('audit.plist does not pin a versioned nvm node path', () => {
  const plist = readFileSync(
    'scripts/launchd/com.mitchell.career-ops.audit.plist',
    'utf8'
  );

  // Should not contain a hardcoded nvm versioned node path like
  // /.nvm/versions/node/v24.14.0/bin/node
  const pinnedNvmPath = /\/\.nvm\/versions\/node\/v\d+\.\d+\.\d+\/bin\/node/;
  assert.ok(
    !pinnedNvmPath.test(plist),
    'plist must not pin a specific nvm node version path'
  );

  // And it should still invoke node somehow (via shell wrapper or env-resolved path)
  assert.match(plist, /node/, 'plist must still invoke node');
});