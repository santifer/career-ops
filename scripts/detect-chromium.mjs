#!/usr/bin/env node
/**
 * detect-chromium.mjs — Windows Edge/Chrome auto-detection utility
 *
 * Checks common install locations for Microsoft Edge and Google Chrome,
 * finds the default user profile, and prints a ready-to-paste browser.yml
 * config block.
 *
 * Usage: node scripts/detect-chromium.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const EXE_CANDIDATES = [
  { name: 'Edge',   path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
  { name: 'Edge',   path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' },
  { name: 'Chrome', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
  { name: 'Chrome', path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' },
];

const PROFILE_SUBDIRS = {
  Edge:   ['Microsoft', 'Edge', 'User Data', 'Default'],
  Chrome: ['Google', 'Chrome', 'User Data', 'Default'],
};

function findExe() {
  for (const c of EXE_CANDIDATES) {
    if (fs.existsSync(c.path)) return c;
  }
  return null;
}

function findProfile(browserName) {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;
  const profilePath = path.join(localAppData, ...PROFILE_SUBDIRS[browserName]);
  return fs.existsSync(profilePath) ? profilePath : null;
}

const found       = findExe();
const profilePath = found ? findProfile(found.name) : null;

console.log('=== Chromium Browser Auto-Detection Results ===\n');

if (!found) {
  console.log('MISS  No Chromium-based browser found in common locations:');
  for (const c of EXE_CANDIDATES) console.log(`      ${c.path}`);
  console.log('\n  Install Edge or Chrome, then run this script again.\n');
  process.exit(0);
}

console.log(`OK    ${found.name}: ${found.path}\n`);

if (!profilePath) {
  console.log(`MISS  ${found.name} default profile not found.`);
  const localAppData = process.env.LOCALAPPDATA || '%LOCALAPPDATA%';
  console.log(`      Expected: ${path.join(localAppData, ...PROFILE_SUBDIRS[found.name])}`);
  console.log(`      Open ${found.name} at least once to create a profile.\n`);
} else {
  console.log(`OK    Profile: ${profilePath}\n`);
}

if (found && profilePath) {
  const exeYaml     = found.path.replace(/'/g, "''");
  const profileYaml = profilePath.replace(/'/g, "''");

  console.log('─── Paste this into config/browser.yml ─────────────────────────\n');
  console.log(`preferred: chromium

chromium:
  executable_path: '${exeYaml}'
  profile_path:    '${profileYaml}'

extension_autofill: true   # true = wait 5s for SpeedyApply; false = built-in selectors
`);
  console.log('─────────────────────────────────────────────────────────────────\n');
  console.log(`SpeedyApply must be installed in this ${found.name} profile. To verify:`);
  console.log(`  1. Open ${found.name} with this profile`);
  const extPage = found.name === 'Edge' ? 'edge://extensions' : 'chrome://extensions';
  console.log(`  2. Navigate to ${extPage}`);
  console.log('  3. Confirm SpeedyApply is listed and enabled\n');
  console.log('IMPORTANT: Close the browser before running auto-submit.');
  console.log('  Chromium locks the profile directory while it is open.');
  console.log('  Playwright and an open browser cannot share the same profile simultaneously.\n');
  console.log('Then run:  node scripts/auto-submit.mjs --semi-auto --limit 1\n');
} else {
  console.log('Resolve the MISS items above, then run this script again.\n');
}
