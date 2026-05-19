/**
 * sigma-hard-ld-b742aa5e.test.mjs — Regression test written by SIGMA on 2026-05-19
 * Finding: com.mitchell.career-ops.builder-log.plist: 1 hygiene issue(s)
 * Severity: MED
 * Category: launchd-hygiene
 * File: scripts/launchd/com.mitchell.career-ops.builder-log.plist
 */

// node:test snippet that would catch this regression
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLIST = resolve(__dirname, '../scripts/launchd/com.mitchell.career-ops.builder-log.plist');

test('builder-log plist does not pin a versioned nvm node binary', () => {
  const xml = readFileSync(PLIST, 'utf8');
  // Should NOT contain a hardcoded nvm version directory like v24.14.0
  assert.equal(
    /\.nvm\/versions\/node\/v\d+\.\d+\.\d+\/bin\/node/.test(xml),
    false,
    'plist still pins a specific nvm Node version path'
  );
  // Should invoke via env (or another version-agnostic mechanism)
  assert.ok(
    xml.includes('/usr/bin/env'),
    'plist should invoke node via /usr/bin/env to stay version-agnostic'
  );
});