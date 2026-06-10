#!/usr/bin/env node
/**
 * detect-firefox.mjs — Windows Firefox auto-detection utility
 *
 * Checks common Firefox install locations, reads profiles.ini to find the
 * default profile, and prints a ready-to-paste browser.yml config block.
 *
 * Usage: node scripts/detect-firefox.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const FIREFOX_EXE_CANDIDATES = [
  'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
  'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
];

function findFirefoxExe() {
  for (const candidate of FIREFOX_EXE_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function findDefaultProfile() {
  const appData = process.env.APPDATA;
  if (!appData) return null;

  const profilesIni = path.join(appData, 'Mozilla', 'Firefox', 'profiles.ini');
  if (!fs.existsSync(profilesIni)) return null;

  const content = fs.readFileSync(profilesIni, 'utf8');
  // Split on [ProfileN] section headers
  const sections = content.split(/\[Profile\d+\]/g).slice(1);

  let defaultProfile = null;
  let firstProfile   = null;

  for (const section of sections) {
    const pathMatch  = section.match(/^Path=(.+)$/m);
    const isRelative = /IsRelative=1/m.test(section);
    const isDefault  = /Default=1/m.test(section);

    if (!pathMatch) continue;

    let profilePath = pathMatch[1].trim().replace(/\//g, path.sep);
    if (isRelative) {
      profilePath = path.join(appData, 'Mozilla', 'Firefox', profilePath);
    }

    if (!firstProfile) firstProfile = profilePath;
    if (isDefault) {
      defaultProfile = profilePath;
      break;
    }
  }

  return defaultProfile || firstProfile;
}

const exePath     = findFirefoxExe();
const profilePath = findDefaultProfile();

console.log('=== Firefox Auto-Detection Results ===\n');

if (!exePath) {
  console.log('MISS  Firefox executable not found in common locations:');
  for (const c of FIREFOX_EXE_CANDIDATES) console.log(`      ${c}`);
  console.log('\n  If Firefox is installed elsewhere, find it with:');
  console.log('    (Get-Command firefox.exe).Source');
  console.log('  or check Start Menu > Firefox > Properties > Target.\n');
} else {
  console.log(`OK    Firefox: ${exePath}\n`);
}

if (!profilePath) {
  const appData = process.env.APPDATA || '%APPDATA%';
  console.log('MISS  Firefox profile not found.');
  console.log(`      Expected profiles.ini at: ${path.join(appData, 'Mozilla', 'Firefox', 'profiles.ini')}`);
  console.log('      If Firefox has never been launched, open it once first.\n');
} else {
  const exists = fs.existsSync(profilePath);
  console.log(`${exists ? 'OK' : 'WARN'}  Profile: ${profilePath}${exists ? '' : ' (directory not found)'}\n`);
}

if (exePath && profilePath && fs.existsSync(profilePath)) {
  // Escape backslashes for YAML single-quoted strings (single quotes don't need escaping for \)
  const exeYaml     = exePath.replace(/'/g, "''");
  const profileYaml = profilePath.replace(/'/g, "''");

  console.log('─── Paste this into config/browser.yml ─────────────────────────\n');
  console.log(`preferred: firefox

firefox:
  executable_path: '${exeYaml}'
  profile_path:    '${profileYaml}'

extension_autofill: true
`);
  console.log('─────────────────────────────────────────────────────────────────\n');
  console.log('SpeedyApply must be installed in this profile. To verify:');
  console.log('  1. Open Firefox with this profile');
  console.log('  2. Navigate to about:addons');
  console.log('  3. Confirm SpeedyApply is listed and enabled\n');
  console.log('Then run:  node scripts/auto-submit.mjs --semi-auto --limit 1\n');
} else {
  console.log('Resolve the MISS items above, then run this script again.\n');
}

console.log('Note: if launching fails with shell_windows::limited_access_features errors,');
console.log('switch to Chromium (Edge or Chrome) — it is the recommended path.');
console.log('See config/browser.yml.template, or run: node scripts/detect-chromium.mjs\n');
