// Unit tests for lib/cron-health.mjs — the silent-failure watchdog.
//
// Tests construct fixture log directories under tmp/, write fake scan-YYYY-MM-DD.log
// files mirroring the real scan-unattended output, then assert getCronHealth()
// classifies each job correctly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { parseLog, getCronHealth } from '../../lib/cron-health.mjs';

function makeFixtureDir() {
  return mkdtempSync(join(tmpdir(), 'cron-health-test-'));
}

const HEALTHY_LOG = `=== scan-unattended starting 2026-05-19T09:00:00Z ===
--- scan.mjs ---
Scanning 92 companies via providers
scan.mjs exit code: 0
--- scan-rss.mjs ---
Scanning 11 RSS/JSON feeds
scan-rss.mjs exit code: 0
--- scan-email.mjs ---
Connecting to Gmail IMAP as mitwilli@gmail.com…
Found 5 unread messages.
scan-email.mjs exit code: 0
=== scan-unattended completed ===
`;

const SCAN_EMAIL_BROKEN_LOG = `=== scan-unattended starting 2026-05-18T09:00:00Z ===
--- scan.mjs ---
Scanning 92 companies via providers
scan.mjs exit code: 0
--- scan-rss.mjs ---
Scanning 11 RSS/JSON feeds
scan-rss.mjs exit code: 0
--- scan-email.mjs ---
STDERR: node:internal/modules/package_json_reader:301
STDERR: Cannot find package 'imapflow' imported from /Users/x/scan-email.mjs
scan-email.mjs exit code: 1
=== scan-unattended completed ===
`;

test('parseLog — extracts exit codes per section', () => {
  const sections = parseLog(HEALTHY_LOG);
  assert.equal(sections['scan.mjs'].exit_code, 0);
  assert.equal(sections['scan-rss.mjs'].exit_code, 0);
  assert.equal(sections['scan-email.mjs'].exit_code, 0);
});

test('parseLog — handles non-zero + null exit codes', () => {
  const sections = parseLog(SCAN_EMAIL_BROKEN_LOG);
  assert.equal(sections['scan.mjs'].exit_code, 0);
  assert.equal(sections['scan-email.mjs'].exit_code, 1);
});

test('getCronHealth — all healthy returns overall=healthy + empty trouble set', () => {
  const dir = makeFixtureDir();
  try {
    writeFileSync(join(dir, 'scan-2026-05-19.log'), HEALTHY_LOG);
    const h = getCronHealth({ today: '2026-05-19', logsDir: dir });
    assert.equal(h.overall, 'healthy');
    for (const j of h.jobs) {
      assert.equal(j.status, 'healthy', `${j.name} should be healthy`);
      assert.equal(j.last_run_exit, 0);
      assert.equal(j.last_success_date, '2026-05-19');
      assert.equal(j.days_since_success, 0);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('getCronHealth — scan-email broken yesterday + healthy 2 days ago → status=failing, days_since_success=2', () => {
  const dir = makeFixtureDir();
  try {
    writeFileSync(join(dir, 'scan-2026-05-17.log'), HEALTHY_LOG.replace('2026-05-19', '2026-05-17'));
    writeFileSync(join(dir, 'scan-2026-05-18.log'), SCAN_EMAIL_BROKEN_LOG);
    const h = getCronHealth({ today: '2026-05-19', logsDir: dir });
    assert.equal(h.overall, 'failing');
    const email = h.jobs.find(j => j.name === 'scan-email.mjs');
    assert.equal(email.status, 'failing');
    assert.equal(email.last_run_exit, 1);
    assert.equal(email.last_run_date, '2026-05-18');
    assert.equal(email.last_success_date, '2026-05-17');
    assert.equal(email.days_since_success, 2);
    // Reason hint should mention imapflow
    assert.ok((email.reason || '').includes('imapflow'), `reason should mention imapflow, got: ${email.reason}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('getCronHealth — no logs at all returns overall=unknown', () => {
  const dir = makeFixtureDir();
  try {
    const h = getCronHealth({ today: '2026-05-19', logsDir: dir });
    assert.equal(h.overall, 'unknown');
    for (const j of h.jobs) {
      assert.equal(j.status, 'unknown');
      assert.equal(j.last_run_date, null);
      assert.equal(j.last_success_date, null);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('getCronHealth — last success 5 days ago + no recent runs → status=stale', () => {
  const dir = makeFixtureDir();
  try {
    writeFileSync(join(dir, 'scan-2026-05-14.log'), HEALTHY_LOG.replace('2026-05-19', '2026-05-14'));
    const h = getCronHealth({ today: '2026-05-19', logsDir: dir });
    assert.equal(h.overall, 'degraded');
    for (const j of h.jobs) {
      assert.equal(j.status, 'stale', `${j.name} should be stale`);
      assert.equal(j.days_since_success, 5);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('getCronHealth — mixed: scan healthy + email failing → overall=failing', () => {
  const dir = makeFixtureDir();
  try {
    writeFileSync(join(dir, 'scan-2026-05-19.log'), SCAN_EMAIL_BROKEN_LOG.replace('2026-05-18', '2026-05-19'));
    const h = getCronHealth({ today: '2026-05-19', logsDir: dir });
    assert.equal(h.overall, 'failing');
    assert.equal(h.jobs.find(j => j.name === 'scan.mjs').status, 'healthy');
    assert.equal(h.jobs.find(j => j.name === 'scan-email.mjs').status, 'failing');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
