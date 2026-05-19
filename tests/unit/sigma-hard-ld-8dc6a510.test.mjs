/**
 * sigma-hard-ld-8dc6a510.test.mjs — Regression test written by SIGMA on 2026-05-19
 * Finding: com.mitchell.career-ops.community-scan.plist: 1 hygiene issue(s)
 * Severity: MED
 * Category: launchd-hygiene
 * File: scripts/launchd/com.mitchell.career-ops.community-scan.plist
 */

// node:test snippet that would catch this regression
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('community-scan.plist does not pin an nvm-versioned node path', () => {
  const plist = readFileSync(
    'scripts/launchd/com.mitchell.career-ops.community-scan.plist',
    'utf8'
  );

  // Should not contain a hardcoded nvm versioned node binary like
  // /.nvm/versions/node/v24.14.0/bin/node
  const pinnedNvm = /\/\.nvm\/versions\/node\/v\d+\.\d+\.\d+\/bin\/node/;
  assert.ok(
    !pinnedNvm.test(plist),
    'plist must not pin a specific nvm node version (breaks on nvm upgrade)'
  );

  // And it should resolve node via nvm-exec or a stable shim
  assert.ok(
    /nvm-exec|\/usr\/local\/bin\/node|\/opt\/homebrew\/bin\/node/.test(plist),
    'plist should resolve node via nvm-exec or a stable system path'
  );
});