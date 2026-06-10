#!/usr/bin/env node
/**
 * load-browser-config.mjs — Loads and validates config/browser.yml
 *
 * Returns a safe default (chromium, extension autofill off) when the file is absent.
 * Validates that required paths exist on disk when preferred = firefox.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
const DEFAULT_CONFIG_PATH = path.join(ROOT, 'config', 'browser.yml');

export class BrowserConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BrowserConfigError';
  }
}

const DEFAULT_CONFIG = {
  preferred: 'chromium',
  firefox: {},
  chromium: {},
  extension_autofill: false,
};

/**
 * Load and validate config/browser.yml.
 * If the file is absent, returns a safe default (chromium, no extension autofill).
 *
 * @param {string} [configPath]  Override path (useful in tests)
 * @returns {Promise<object>}    Validated config
 * @throws {BrowserConfigError}  If the file exists but has invalid/missing values
 */
export async function loadBrowserConfig(configPath = DEFAULT_CONFIG_PATH) {
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  let yaml;
  try {
    ({ default: yaml } = await import('js-yaml'));
  } catch {
    throw new BrowserConfigError('js-yaml not installed — run: npm install js-yaml');
  }

  let raw;
  try {
    raw = yaml.load(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    throw new BrowserConfigError(`browser.yml parse error: ${e.message}`);
  }

  if (!raw || typeof raw !== 'object') {
    throw new BrowserConfigError('browser.yml is empty or not a YAML object');
  }

  const preferred = raw.preferred || 'chromium';

  // extension_autofill defaults to true when preferred=firefox and not explicitly set
  const extension_autofill =
    raw.extension_autofill !== undefined
      ? Boolean(raw.extension_autofill)
      : preferred === 'firefox';

  const cfg = {
    preferred,
    firefox:  raw.firefox  || {},
    chromium: raw.chromium || {},
    extension_autofill,
  };

  if (cfg.preferred === 'chromium') {
    const exePath = cfg.chromium?.executable_path;
    if (exePath && !fs.existsSync(exePath)) {
      throw new BrowserConfigError(
        `browser.yml: chromium.executable_path not found on disk: ${exePath}\n` +
        '  Run: node scripts/detect-chromium.mjs   to auto-detect the correct path',
      );
    }
    const profilePath = cfg.chromium?.profile_path;
    if (profilePath && !fs.existsSync(profilePath)) {
      throw new BrowserConfigError(
        `browser.yml: chromium.profile_path not found on disk: ${profilePath}\n` +
        '  Run: node scripts/detect-chromium.mjs   to find your profile directory',
      );
    }
  }

  if (cfg.preferred === 'firefox') {
    const exePath = cfg.firefox.executable_path;
    if (!exePath) {
      throw new BrowserConfigError(
        'browser.yml: firefox.executable_path is required when preferred: firefox\n' +
        '  Run: node scripts/detect-firefox.mjs   to find the correct path',
      );
    }
    if (!fs.existsSync(exePath)) {
      throw new BrowserConfigError(
        `browser.yml: firefox.executable_path not found on disk: ${exePath}\n` +
        '  Run: node scripts/detect-firefox.mjs   to auto-detect the correct path',
      );
    }

    const profilePath = cfg.firefox.profile_path;
    if (!profilePath) {
      throw new BrowserConfigError(
        'browser.yml: firefox.profile_path is required when preferred: firefox\n' +
        '  Run: node scripts/detect-firefox.mjs   to find your profile directory',
      );
    }
    if (!fs.existsSync(profilePath)) {
      throw new BrowserConfigError(
        `browser.yml: firefox.profile_path not found on disk: ${profilePath}\n` +
        '  Your Firefox profile may have moved. Run: node scripts/detect-firefox.mjs',
      );
    }
  }

  return cfg;
}
