/**
 * sigma-hard-ld-81170cc7.test.mjs — Regression test written by SIGMA on 2026-05-19
 * Finding: com.mitchell.career-ops.company-pulse.plist: 1 hygiene issue(s)
 * Severity: MED
 * Category: launchd-hygiene
 * File: scripts/launchd/com.mitchell.career-ops.company-pulse.plist
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
  '../scripts/launchd/com.mitchell.career-ops.company-pulse.plist',
);

test('company-pulse launchd plist does not pin a specific nvm node version', () => {
  const xml = readFileSync(plistPath, 'utf8');

  // The bug: a versioned nvm node path like .nvm/versions/node/v24.14.0/bin/node
  const pinnedNvmPath = /\.nvm\/versions\/node\/v\d+\.\d+\.\d+\/bin\/node/;
  assert.ok(
    !pinnedNvmPath.test(xml),
    'plist must not hard-code a specific nvm-managed node version path',
  );

  // Sanity: still actually invokes node somehow
  assert.ok(/\bnode\b/.test(xml), 'plist should still invoke node');
});