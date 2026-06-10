import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseBrowserMode, parseDebugPort, launchBrowserForMode } from '../scripts/auto-submit.mjs';
import { buildBrowserArgs } from '../scripts/launch-debug-browser.mjs';

// ── parseBrowserMode ──────────────────────────────────────────────────────────

const chromiumWithProfile = { preferred: 'chromium', chromium: { profile_path: '/some/profile', executable_path: '' }, firefox: {} };
const chromiumNoProfile   = { preferred: 'chromium', chromium: { profile_path: '',              executable_path: '' }, firefox: {} };
const firefoxCfg          = { preferred: 'firefox',  chromium: {},                                                     firefox: { profile_path: '/ff' } };

describe('parseBrowserMode', () => {

  test('explicit connect returns connect regardless of config', () => {
    assert.equal(parseBrowserMode('connect', chromiumNoProfile), 'connect');
  });

  test('explicit launch returns launch regardless of config', () => {
    assert.equal(parseBrowserMode('launch', chromiumWithProfile), 'launch');
  });

  test('null + chromium with profile → connect (default for SpeedyApply use case)', () => {
    assert.equal(parseBrowserMode(null, chromiumWithProfile), 'connect');
  });

  test('null + chromium without profile → launch (fresh context, no extensions needed)', () => {
    assert.equal(parseBrowserMode(null, chromiumNoProfile), 'launch');
  });

  test('null + firefox → launch (always persistent context for firefox)', () => {
    assert.equal(parseBrowserMode(null, firefoxCfg), 'launch');
  });

});

// ── parseDebugPort ────────────────────────────────────────────────────────────

describe('parseDebugPort', () => {

  test('parses a valid port string', () => {
    assert.equal(parseDebugPort('9333'), 9333);
  });

  test('returns 9222 when arg is null (default)', () => {
    assert.equal(parseDebugPort(null), 9222);
  });

  test('returns 9222 for non-numeric input', () => {
    assert.equal(parseDebugPort('banana'), 9222);
  });

});

// ── buildBrowserArgs ──────────────────────────────────────────────────────────

describe('buildBrowserArgs', () => {

  test('includes --remote-debugging-port with the given port', () => {
    const args = buildBrowserArgs(9222, '/path/to/profile');
    assert.ok(args.includes('--remote-debugging-port=9222'), 'should include debug port flag');
  });

  test('includes --user-data-dir with the profile path', () => {
    const args = buildBrowserArgs(9333, '/edge/user/profile');
    assert.ok(args.includes('--user-data-dir=/edge/user/profile'), 'should include profile path flag');
  });

  test('includes no-first-run and no-default-browser-check', () => {
    const args = buildBrowserArgs(9222, '/p');
    assert.ok(args.includes('--no-first-run'), 'should suppress first-run dialog');
    assert.ok(args.includes('--no-default-browser-check'), 'should suppress default browser check');
  });

});

// ── launchBrowserForMode — CDP connect failure ────────────────────────────────

describe('launchBrowserForMode — CDP connect failure', () => {

  test('throws with a message pointing to launch-debug-browser.mjs when connect fails', async () => {
    const mockPw = {
      chromium: {
        connectOverCDP: async () => { throw new Error('ECONNREFUSED'); },
      },
    };
    const cfg = { preferred: 'chromium', chromium: { profile_path: '/some/profile', executable_path: '' }, firefox: {} };

    await assert.rejects(
      () => launchBrowserForMode(mockPw, cfg, { browserMode: 'connect', debugPort: 9222 }),
      (e) => /launch-debug-browser/.test(e.message),
    );
  });

  test('error message includes the debug port number', async () => {
    const mockPw = {
      chromium: {
        connectOverCDP: async () => { throw new Error('connection refused'); },
      },
    };
    const cfg = { preferred: 'chromium', chromium: { profile_path: '/profile', executable_path: '' }, firefox: {} };

    await assert.rejects(
      () => launchBrowserForMode(mockPw, cfg, { browserMode: 'connect', debugPort: 9999 }),
      (e) => /9999/.test(e.message),
    );
  });

});
