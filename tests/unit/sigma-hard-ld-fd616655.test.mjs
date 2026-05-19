/**
 * sigma-hard-ld-fd616655.test.mjs — Regression test written by SIGMA on 2026-05-19
 * Finding: com.mitchell.career-ops.contact-enrichment-audit.plist: 1 hygiene issue(s)
 * Severity: MED
 * Category: launchd-hygiene
 * File: scripts/launchd/com.mitchell.career-ops.contact-enrichment-audit.plist
 */

// node:test snippet that would catch this regression
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('launchd plist does not pin a versioned node binary path', () => {
  const plistPath = path.resolve(
    'scripts/launchd/com.mitchell.career-ops.contact-enrichment-audit.plist'
  );
  const content = fs.readFileSync(plistPath, 'utf8');

  // Must not reference any pinned nvm version directory like
  // /.nvm/versions/node/v24.14.0/bin/node
  const pinnedNvmPath = /\/\.nvm\/versions\/node\/v\d+\.\d+\.\d+\/bin\/node/;
  assert.ok(
    !pinnedNvmPath.test(content),
    `plist still references a version-pinned node binary; ` +
      `nvm upgrades will break this LaunchAgent.`
  );

  // Sanity: still launches node somehow (either via nvm-exec or env).
  assert.match(
    content,
    /(nvm-exec|\/usr\/bin\/env node|\/bin\/zsh)/,
    'plist must still provide a way to invoke node'
  );
});