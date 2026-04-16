#!/usr/bin/env node

/**
 * diagnose-auto-apply.mjs — Diagnostic tool for auto-apply system
 * 
 * Checks:
 * - File existence and format
 * - Credential validity
 * - Network connectivity
 * - Playwright browser support
 * - Job portal accessibility
 * 
 * Usage:
 *   node diagnose-auto-apply.mjs
 */

import { existsSync, readFileSync } from 'fs';
import yaml from 'js-yaml';
import { chromium } from 'playwright';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';

let passed = 0;
let failed = 0;

function check(name, condition, details = '') {
  if (condition) {
    console.log(`${GREEN}✓${RESET} ${name}`);
    if (details) console.log(`  ${BLUE}${details}${RESET}`);
    passed++;
  } else {
    console.log(`${RED}✗${RESET} ${name}`);
    if (details) console.log(`  ${YELLOW}→ ${details}${RESET}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${BLUE}═══ ${title} ═══${RESET}\n`);
}

async function main() {
  console.log(`\n${BLUE}Auto-Apply Diagnostic Tool${RESET}\n`);

  // 1. File checks
  section('1. Files & Configuration');

  const files = {
    'cv.md': 'Your resume',
    'config/profile.yml': 'Candidate profile',
    'config/credentials.yml': 'Login credentials',
    'data/pipeline.md': 'Job queue',
    'portals.yml': 'Portal configuration'
  };

  for (const [path, desc] of Object.entries(files)) {
    const exists = existsSync(path);
    check(`${path}`, exists, desc);

    if (exists && path.endsWith('.yml')) {
      try {
        yaml.load(readFileSync(path, 'utf8'));
        check(`  └─ Valid YAML`, true, '');
      } catch (e) {
        check(`  └─ Valid YAML`, false, e.message);
      }
    }
  }

  // 2. Profile validation
  section('2. Profile Validation');

  if (existsSync('config/profile.yml')) {
    try {
      const profile = yaml.load(readFileSync('config/profile.yml', 'utf8'));
      const candidate = profile.candidate || {};

      check('full_name', !!candidate.full_name, candidate.full_name || 'Missing');
      check('email', !!candidate.email, candidate.email || 'Missing');
      check('phone', !!candidate.phone, candidate.phone || 'Missing');
      check('location', !!candidate.location, candidate.location || 'Missing');
      check('portfolio_url (optional)', !!candidate.portfolio_url, candidate.portfolio_url || 'Not set');
    } catch (e) {
      check('Profile parsing', false, e.message);
    }
  }

  // 3. Credentials validation
  section('3. Credentials Validation');

  if (existsSync('config/credentials.yml')) {
    try {
      const creds = yaml.load(readFileSync('config/credentials.yml', 'utf8'));

      const ctEmail = creds.computrabajo?.email;
      const ctPass = creds.computrabajo?.password;
      check('Computrabajo email', !!ctEmail, ctEmail ? ctEmail.split('@')[0] + '@...' : 'Missing');
      check('Computrabajo password', !!ctPass, ctPass ? '***' : 'Missing');

      const liEmail = creds.linkedin?.email;
      const liPass = creds.linkedin?.password;
      check('LinkedIn email', !!liEmail, liEmail ? liEmail.split('@')[0] + '@...' : 'Missing');
      check('LinkedIn password', !!liPass, liPass ? '***' : 'Missing');
    } catch (e) {
      check('Credentials parsing', false, e.message);
    }
  } else {
    check('credentials.yml exists', false, 'Create from credentials.example.yml');
  }

  // 4. Pipeline validation
  section('4. Pipeline & Queue');

  if (existsSync('data/pipeline.md')) {
    const content = readFileSync('data/pipeline.md', 'utf8');
    const pendingMatch = content.match(/- \[ \]/g) || [];
    const completedMatch = content.match(/- \[x\]/gi) || [];
    const totalJobs = pendingMatch.length + completedMatch.length;

    check(`Pipeline format`, /^# Job Pipeline|Pendientes|Rechazadas/m.test(content), '');
    check(`Pending jobs`, pendingMatch.length > 0, `${pendingMatch.length} pending`);
    check(`Total tracked`, totalJobs > 0, `${totalJobs} jobs`);
  }

  // 5. Network & Browser
  section('5. Network & Browser Support');

  try {
    const response = await fetch('https://co.computrabajo.com', { timeout: 5000 }).catch(e => null);
    check('Computrabajo accessible', response?.ok || response?.status === 503, `Status: ${response?.status || 'offline'}`);
  } catch (e) {
    check('Computrabajo accessible', false, 'Connection timed out');
  }

  try {
    const response = await fetch('https://linkedin.com', { timeout: 5000 }).catch(e => null);
    check('LinkedIn accessible', response?.ok || response?.status === 503, `Status: ${response?.status || 'offline'}`);
  } catch (e) {
    check('LinkedIn accessible', false, 'Connection timed out');
  }

  // 6. Playwright browser
  section('6. Playwright Browser');

  try {
    const browser = await chromium.launch({ headless: true });
    check('Chromium browser available', true, 'Ready');

    const context = await browser.newContext();
    const page = await context.newPage();
    check('Browser context creation', true, 'Works');

    await browser.close();
  } catch (e) {
    check('Chromium browser available', false, e.message);
    failed++;
  }

  // 7. Selector testing
  section('7. Form Field Detection');

  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Test Computrabajo
    await page.goto('https://co.computrabajo.com', { timeout: 30000 }).catch(() => {});

    const inputs = await page.$$('input[name]');
    const buttons = await page.$$('span[data-href-offer-apply], button:has-text("Aplicar")');

    check('Computrabajo form inputs detected', inputs.length > 0, `${inputs.length || 0} inputs found`);
    check('Computrabajo apply buttons detected', buttons.length > 0, `${buttons.length || 0} buttons found`);

    await browser.close();
  } catch (e) {
    check('Computrabajo page analysis', false, e.message);
  }

  // 8. Git/Repository
  section('8. Repository Status');

  const hasGit = existsSync('.git');
  check('.git folder', hasGit, hasGit ? 'Repository initialized' : 'Not a git repo');

  const hasGitignore = existsSync('.gitignore');
  check('.gitignore exists', hasGitignore, '');

  if (hasGitignore) {
    const gitignore = readFileSync('.gitignore', 'utf8');
    const hasCredentials = /config\/credentials\.yml|credentials\.yml/.test(gitignore);
    check('credentials.yml in .gitignore', hasCredentials, 'Protected from accidental commits');

    const hasOutput = /^output\/|^logs\//.test(gitignore);
    check('output/ in .gitignore', hasOutput, 'Build artifacts protected');
  }

  // 9. Dependencies
  section('9. Node Dependencies');

  try {
    import('js-yaml');
    check('js-yaml', true, 'Installed');
  } catch {
    check('js-yaml', false, 'Run: npm install js-yaml');
  }

  try {
    import('playwright');
    check('playwright', true, 'Installed');
  } catch {
    check('playwright', false, 'Run: npm install playwright');
  }

  // Summary
  section('Summary');

  const total = passed + failed;
  const percentage = Math.round((passed / total) * 100);

  console.log(`Checks passed: ${GREEN}${passed}${RESET}/${total}`);
  console.log(`Checks failed: ${RED}${failed}${RESET}/${total}`);
  console.log(`Overall health: ${percentage >= 80 ? GREEN : percentage >= 50 ? YELLOW : RED}${percentage}%${RESET}\n`);

  if (failed === 0) {
    console.log(`${GREEN}✓ All systems go!${RESET}\n`);
    console.log('You can now run:');
    console.log(`  ${BLUE}node auto-apply.mjs scan bogota${RESET}`);
    console.log(`  ${BLUE}node auto-apply.mjs apply${RESET}`);
    console.log(`  ${BLUE}node auto-apply.mjs loop${RESET}\n`);
  } else {
    console.log(`${YELLOW}⚠ Some checks failed. Please fix the issues above.${RESET}\n`);

    if (!existsSync('config/credentials.yml')) {
      console.log('Quick fix:');
      console.log(`  ${BLUE}cp config/credentials.example.yml config/credentials.yml${RESET}`);
      console.log('  Then edit config/credentials.yml with your login info\n');
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(`${RED}Fatal error:${RESET}`, e.message);
  process.exit(1);
});
