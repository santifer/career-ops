/**
 * Intelligence Engine — Setup Checker
 *
 * Validates that required config files, APIs, local models,
 * and CLI tools are available before running intel pipelines.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// ─── Known API key environment variables ────────────────────────────────────

const KNOWN_API_KEYS = [
  'EXA_API_KEY',
  'BRIGHTDATA_API_KEY',
  'TAVILY_API_KEY',
  'FIRECRAWL_API_KEY',
  'VALYU_API_KEY',
  'PARALLEL_API_KEY',
];

// ─── File checks ────────────────────────────────────────────────────────────

const REQUIRED_FILES = {
  intelYml:        'config/intel.yml',
  strategyLedger:  'config/strategy-ledger.md',
  voiceProfile:    'config/voice-profile.md',
  outreachMd:      'data/outreach.md',
  prospectsMd:     'data/prospects.md',
  intelligenceMd:  'data/intelligence.md',
};

// ─── Exports ────────────────────────────────────────────────────────────────

/**
 * Check existence of required files, API keys, Gemma 4, and gogcli.
 * @param {string} projectRoot — absolute path to the project root
 * @returns {object} structured status object
 */
export function checkSetup(projectRoot) {
  // File existence checks
  const fileStatus = {};
  for (const [key, relPath] of Object.entries(REQUIRED_FILES)) {
    fileStatus[key] = existsSync(join(projectRoot, relPath));
  }

  // Available API keys
  const availableAPIs = KNOWN_API_KEYS.filter((k) => !!process.env[k]);

  // Gemma 4 via ollama
  let gemmaAvailable = false;
  try {
    const out = execFileSync('ollama', ['list'], { encoding: 'utf-8', timeout: 5000 });
    gemmaAvailable = /gemma4/i.test(out);
  } catch {
    // ollama not installed or not running — silently ignore
  }

  // gogcli
  let gogcliAvailable = false;
  try {
    execFileSync('which', ['gog'], { encoding: 'utf-8', timeout: 3000 });
    gogcliAvailable = true;
  } catch {
    // gog not found — silently ignore
  }

  // Ready = core data files + intel config
  const ready =
    fileStatus.intelYml &&
    fileStatus.outreachMd &&
    fileStatus.prospectsMd &&
    fileStatus.intelligenceMd;

  return {
    ...fileStatus,
    availableAPIs,
    gemmaAvailable,
    gogcliAvailable,
    ready,
  };
}

/**
 * Format a human-readable multiline status report.
 * @param {object} status — output of checkSetup()
 * @returns {string}
 */
export function getSetupStatus(status) {
  const tag = (ok) => (ok ? 'OK' : 'MISSING');

  const lines = [
    '── Intel Engine Setup ──',
    '',
    `  config/intel.yml          ${tag(status.intelYml)}`,
    `  config/strategy-ledger.md ${tag(status.strategyLedger)}`,
    `  config/voice-profile.md   ${tag(status.voiceProfile)}`,
    `  data/outreach.md          ${tag(status.outreachMd)}`,
    `  data/prospects.md         ${tag(status.prospectsMd)}`,
    `  data/intelligence.md      ${tag(status.intelligenceMd)}`,
    '',
    `  APIs: ${status.availableAPIs.length > 0 ? status.availableAPIs.join(', ') : 'none (will use WebSearch + Playwright)'}`,
    `  Gemma 4: ${status.gemmaAvailable ? 'available' : 'not found'}`,
    `  gogcli:  ${status.gogcliAvailable ? 'available' : 'not found'}`,
    '',
    `  Ready: ${status.ready ? 'YES' : 'NO'}`,
  ];

  return lines.join('\n');
}
