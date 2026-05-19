/**
 * sigma-hard-ld-46398eac.test.mjs — Regression test written by SIGMA on 2026-05-19
 * Finding: com.mitchell.career-ops.delta-full-recalibration.plist: 1 hygiene issue(s)
 * Severity: MED
 * Category: launchd-hygiene
 * File: scripts/launchd/com.mitchell.career-ops.delta-full-recalibration.plist
 */

// node:test snippet that would catch this regression
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('delta-full-recalibration plist does not pin a specific node version path', () => {
  const plistPath = path.resolve(
    'scripts/launchd/com.mitchell.career-ops.delta-full-recalibration.plist'
  );
  const contents = readFileSync(plistPath, 'utf8');

  // Fails on unpatched code: matches /.nvm/versions/node/vX.Y.Z/bin/node
  const pinnedVersionRe = /\/\.nvm\/versions\/node\/v\d+\.\d+\.\d+\/bin\/node/;
  assert.ok(
    !pinnedVersionRe.test(contents),
    'plist should not hardcode a specific nvm node version; use ~/.nvm/alias/default/bin/node instead'
  );

  // Sanity: it should still reference *some* node executable.
  assert.match(contents, /\/bin\/node</, 'plist should still invoke a node binary');
});