import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadBrowserConfig, BrowserConfigError } from '../scripts/load-browser-config.mjs';

const TMP = os.tmpdir();

function writeTmp(name, content) {
  const p = path.join(TMP, `career-ops-${name}`);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// Real paths guaranteed to exist on this machine — used for firefox validation tests
const REAL_EXE     = process.execPath;          // node.exe — definitely exists
const REAL_PROFILE = os.tmpdir();               // tmpdir — definitely exists as a directory

// YAML-safe (single-quoted): backslashes are literal in single-quoted YAML strings
const exeYaml     = REAL_EXE.replace(/'/g, "''");
const profileYaml = REAL_PROFILE.replace(/'/g, "''");

// ── Default config (file absent) ─────────────────────────────────────────────

describe('default config — file absent', () => {

  test('returns preferred: chromium when browser.yml is missing', async () => {
    const cfg = await loadBrowserConfig('/nonexistent/path/browser.yml');
    assert.equal(cfg.preferred, 'chromium');
  });

  test('does not throw when browser.yml is missing', async () => {
    await assert.doesNotReject(() => loadBrowserConfig('/nonexistent/path/browser.yml'));
  });

  test('extension_autofill defaults to false for chromium default', async () => {
    const cfg = await loadBrowserConfig('/nonexistent/path/browser.yml');
    assert.equal(cfg.extension_autofill, false);
  });

});

// ── Chromium config ───────────────────────────────────────────────────────────

describe('chromium config', () => {

  test('parses preferred: chromium without requiring firefox paths', async () => {
    const p = writeTmp('chromium-valid.yml', 'preferred: chromium\n');
    const cfg = await loadBrowserConfig(p);
    assert.equal(cfg.preferred, 'chromium');
  });

  test('chromium config does not error when firefox section is absent', async () => {
    const p = writeTmp('chromium-no-ff.yml', 'preferred: chromium\n');
    await assert.doesNotReject(() => loadBrowserConfig(p));
  });

  test('extension_autofill is false for chromium when not specified', async () => {
    const p = writeTmp('chromium-ext-default.yml', 'preferred: chromium\n');
    const cfg = await loadBrowserConfig(p);
    assert.equal(cfg.extension_autofill, false);
  });

});

// ── Firefox config — validation errors ───────────────────────────────────────

describe('firefox config — validation errors', () => {

  test('throws BrowserConfigError when executable_path is missing', async () => {
    const p = writeTmp('ff-no-exe.yml', [
      'preferred: firefox',
      'firefox:',
      `  profile_path: '${profileYaml}'`,
    ].join('\n') + '\n');
    await assert.rejects(
      () => loadBrowserConfig(p),
      (e) => e instanceof BrowserConfigError && /executable_path/.test(e.message),
    );
  });

  test('throws BrowserConfigError when executable_path does not exist on disk', async () => {
    const p = writeTmp('ff-bad-exe.yml', [
      'preferred: firefox',
      'firefox:',
      "  executable_path: 'C:\\nonexistent\\firefox.exe'",
      `  profile_path: '${profileYaml}'`,
    ].join('\n') + '\n');
    await assert.rejects(
      () => loadBrowserConfig(p),
      (e) => e instanceof BrowserConfigError && /executable_path/.test(e.message),
    );
  });

  test('throws BrowserConfigError when profile_path is missing', async () => {
    const p = writeTmp('ff-no-profile.yml', [
      'preferred: firefox',
      'firefox:',
      `  executable_path: '${exeYaml}'`,
    ].join('\n') + '\n');
    await assert.rejects(
      () => loadBrowserConfig(p),
      (e) => e instanceof BrowserConfigError && /profile_path/.test(e.message),
    );
  });

  test('throws BrowserConfigError when profile_path does not exist on disk', async () => {
    const p = writeTmp('ff-bad-profile.yml', [
      'preferred: firefox',
      'firefox:',
      `  executable_path: '${exeYaml}'`,
      "  profile_path: 'C:\\nonexistent\\profile'",
    ].join('\n') + '\n');
    await assert.rejects(
      () => loadBrowserConfig(p),
      (e) => e instanceof BrowserConfigError && /profile_path/.test(e.message),
    );
  });

});

// ── Firefox config — valid paths ──────────────────────────────────────────────

describe('firefox config — valid paths', () => {

  test('succeeds and returns preferred: firefox when paths exist', async () => {
    const p = writeTmp('ff-valid.yml', [
      'preferred: firefox',
      'firefox:',
      `  executable_path: '${exeYaml}'`,
      `  profile_path: '${profileYaml}'`,
    ].join('\n') + '\n');
    const cfg = await loadBrowserConfig(p);
    assert.equal(cfg.preferred, 'firefox');
  });

  test('extension_autofill defaults to true when preferred: firefox and not specified', async () => {
    const p = writeTmp('ff-no-ext-flag.yml', [
      'preferred: firefox',
      'firefox:',
      `  executable_path: '${exeYaml}'`,
      `  profile_path: '${profileYaml}'`,
    ].join('\n') + '\n');
    const cfg = await loadBrowserConfig(p);
    assert.equal(cfg.extension_autofill, true);
  });

  test('extension_autofill: false can be explicitly set on firefox', async () => {
    const p = writeTmp('ff-ext-false.yml', [
      'preferred: firefox',
      'firefox:',
      `  executable_path: '${exeYaml}'`,
      `  profile_path: '${profileYaml}'`,
      'extension_autofill: false',
    ].join('\n') + '\n');
    const cfg = await loadBrowserConfig(p);
    assert.equal(cfg.extension_autofill, false);
  });

  test('extension_autofill: true explicit still works on firefox', async () => {
    const p = writeTmp('ff-ext-true.yml', [
      'preferred: firefox',
      'firefox:',
      `  executable_path: '${exeYaml}'`,
      `  profile_path: '${profileYaml}'`,
      'extension_autofill: true',
    ].join('\n') + '\n');
    const cfg = await loadBrowserConfig(p);
    assert.equal(cfg.extension_autofill, true);
  });

  test('returned config includes firefox section with the provided paths', async () => {
    const p = writeTmp('ff-paths-present.yml', [
      'preferred: firefox',
      'firefox:',
      `  executable_path: '${exeYaml}'`,
      `  profile_path: '${profileYaml}'`,
    ].join('\n') + '\n');
    const cfg = await loadBrowserConfig(p);
    assert.equal(cfg.firefox.executable_path, REAL_EXE);
    assert.equal(cfg.firefox.profile_path, REAL_PROFILE);
  });

});
