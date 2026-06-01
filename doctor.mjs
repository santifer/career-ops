#!/usr/bin/env node

/**
 * doctor.mjs — Setup validation for career-ops
 * Checks all prerequisites and prints a pass/fail checklist.
 */

import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const targetIdx = argv.indexOf('--target');
const projectRoot =
  targetIdx !== -1 && argv[targetIdx + 1] ? argv[targetIdx + 1] : __dirname;
const JSON_OUT = argv.includes('--json');

// ANSI colors (only on TTY)
const isTTY = process.stdout.isTTY;
const green = (s) => isTTY ? `\x1b[32m${s}\x1b[0m` : s;
const red = (s) => isTTY ? `\x1b[31m${s}\x1b[0m` : s;
const dim = (s) => isTTY ? `\x1b[2m${s}\x1b[0m` : s;

function checkNodeVersion() {
  const major = parseInt(process.versions.node.split('.')[0]);
  if (major >= 18) {
    return { pass: true, label: `Node.js >= 18 (v${process.versions.node})` };
  }
  return {
    pass: false,
    label: `Node.js >= 18 (found v${process.versions.node})`,
    fix: 'Install Node.js 18 or later from https://nodejs.org',
  };
}

function checkDependencies() {
  if (existsSync(join(projectRoot, 'node_modules'))) {
    return { pass: true, label: 'Dependencies installed' };
  }
  return {
    pass: false,
    label: 'Dependencies not installed',
    fix: 'Run: npm install',
  };
}

async function checkPlaywright() {
  try {
    const { chromium } = await import('playwright');
    const execPath = chromium.executablePath();
    if (existsSync(execPath)) {
      return { pass: true, label: 'Playwright chromium installed' };
    }
    return {
      pass: false,
      label: 'Playwright chromium not installed',
      fix: 'Run: npx playwright install chromium',
    };
  } catch {
    return {
      pass: false,
      label: 'Playwright chromium not installed',
      fix: 'Run: npx playwright install chromium',
    };
  }
}

function checkCv() {
  if (existsSync(join(projectRoot, 'cv.md'))) {
    return { pass: true, label: 'cv.md found' };
  }
  return {
    pass: false,
    label: 'cv.md not found',
    fix: [
      'Create cv.md in the project root with your CV in markdown',
      'See examples/ for reference CVs',
    ],
  };
}

function checkProfile() {
  if (existsSync(join(projectRoot, 'config', 'profile.yml'))) {
    return { pass: true, label: 'config/profile.yml found' };
  }
  return {
    pass: false,
    label: 'config/profile.yml not found',
    fix: [
      'Run: cp config/profile.example.yml config/profile.yml',
      'Then edit it with your details',
    ],
  };
}

function checkProfileMode() {
  if (existsSync(join(projectRoot, 'modes', '_profile.md'))) {
    return { pass: true, label: 'modes/_profile.md found' };
  }
  return {
    pass: false,
    label: 'modes/_profile.md not found',
    fix: [
      'Run: cp modes/_profile.template.md modes/_profile.md',
      'Then customize your archetypes / targeting narrative',
    ],
  };
}

function checkPortals() {
  if (existsSync(join(projectRoot, 'portals.yml'))) {
    return { pass: true, label: 'portals.yml found' };
  }
  return {
    pass: false,
    label: 'portals.yml not found',
    fix: [
      'Run: cp templates/portals.example.yml portals.yml',
      'Then customize with your target companies',
    ],
  };
}

function checkFonts() {
  const fontsDir = join(projectRoot, 'fonts');
  if (!existsSync(fontsDir)) {
    return {
      pass: false,
      label: 'fonts/ directory not found',
      fix: 'The fonts/ directory is required for PDF generation',
    };
  }
  try {
    const files = readdirSync(fontsDir);
    if (files.length === 0) {
      return {
        pass: false,
        label: 'fonts/ directory is empty',
        fix: 'The fonts/ directory must contain font files for PDF generation',
      };
    }
  } catch {
    return {
      pass: false,
      label: 'fonts/ directory not readable',
      fix: 'Check permissions on the fonts/ directory',
    };
  }
  return { pass: true, label: 'Fonts directory ready' };
}

function checkAutoDir(name) {
  const dirPath = join(projectRoot, name);
  if (existsSync(dirPath)) {
    return { pass: true, label: `${name}/ directory ready` };
  }
  try {
    mkdirSync(dirPath, { recursive: true });
    return { pass: true, label: `${name}/ directory ready (auto-created)` };
  } catch {
    return {
      pass: false,
      label: `${name}/ directory could not be created`,
      fix: `Run: mkdir ${name}`,
    };
  }
}

async function main() {
  console.log('\ncareer-ops doctor');
  console.log('================\n');

  const checks = [
    checkNodeVersion(),
    checkDependencies(),
    await checkPlaywright(),
    checkCv(),
    checkProfile(),
    checkProfileMode(),
    checkPortals(),
    checkFonts(),
    checkAutoDir('data'),
    checkAutoDir('output'),
    checkAutoDir('reports'),
  ];

  let failures = 0;

  for (const result of checks) {
    if (result.pass) {
      console.log(`${green('✓')} ${result.label}`);
    } else {
      failures++;
      console.log(`${red('✗')} ${result.label}`);
      const fixes = Array.isArray(result.fix) ? result.fix : [result.fix];
      for (const hint of fixes) {
        console.log(`  ${dim('→ ' + hint)}`);
      }
    }
  }

  console.log('');
  if (failures > 0) {
    console.log(`Result: ${failures} issue${failures === 1 ? '' : 's'} found. Fix them and run \`npm run doctor\` again.`);
    process.exit(1);
  } else {
    console.log('Result: All checks passed. You\'re ready to go! Run `claude` to start.');
    console.log('');
    console.log('Join the community: https://discord.gg/8pRpHETxa4');
    process.exit(0);
  }
}

// Single source of truth for the cold-start state: the same four user-layer
// prerequisites that AGENTS.md "First Run" lists. `--json` turns the trigger into
// a deterministic mechanism the agent runs (instead of re-deriving it from prose),
// and `--target <dir>` lets the test suite point it at a simulated virgin env.
function onboardingState(root) {
  const need = {
    'cv.md': existsSync(join(root, 'cv.md')),
    'config/profile.yml': existsSync(join(root, 'config', 'profile.yml')),
    'modes/_profile.md': existsSync(join(root, 'modes', '_profile.md')),
    'portals.yml': existsSync(join(root, 'portals.yml')),
  };
  const missing = Object.keys(need).filter((k) => !need[k]);
  return { onboardingNeeded: missing.length > 0, missing };
}

if (JSON_OUT) {
  console.log(JSON.stringify(onboardingState(projectRoot)));
  process.exit(0);
} else {
  main().catch((err) => {
    console.error('doctor.mjs failed:', err.message);
    process.exit(1);
  });
}
