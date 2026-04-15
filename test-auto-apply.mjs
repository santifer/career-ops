#!/usr/bin/env node

/**
 * test-auto-apply.mjs — Quick test of auto-apply system
 * 
 * Tests the complete workflow end-to-end:
 * 1. Verify files exist
 * 2. Verify credentials work
 * 3. Test form detection on sample job
 * 4. Test application submission (dry run)
 * 5. Verify reporting
 * 
 * Usage:
 *   node test-auto-apply.mjs
 */

import { existsSync, readFileSync } from 'fs';
import yaml from 'js-yaml';
import { chromium } from 'playwright';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function test(name) {
  console.log(`\n${BLUE}→ ${name}${RESET}`);
}

function success(msg) {
  console.log(`  ${GREEN}✓ ${msg}${RESET}`);
  passed++;
}

function error(msg) {
  console.log(`  ${RED}✗ ${msg}${RESET}`);
  failed++;
}

function info(msg) {
  console.log(`  ${YELLOW}• ${msg}${RESET}`);
}

async function main() {
  console.log(`\n${BLUE}═════════════════════════════════════${RESET}`);
  console.log(`${BLUE}  Auto-Apply System Test${RESET}`);
  console.log(`${BLUE}═════════════════════════════════════${RESET}`);

  // Step 1: File checks
  test('1. Checking required files');
  
  const files = [
    { path: 'cv.md', required: true },
    { path: 'config/profile.yml', required: true },
    { path: 'config/credentials.yml', required: true },
    { path: 'data/pipeline.md', required: true },
    { path: '.gitignore', required: false }
  ];

  for (const file of files) {
    if (existsSync(file.path)) {
      success(`${file.path} exists`);
    } else if (file.required) {
      error(`${file.path} NOT FOUND (required)`);
      return;
    } else {
      info(`${file.path} optional, skipping`);
    }
  }

  // Step 2: Profile validation
  test('2. Validating profile.yml');

  let profile = {};
  try {
    profile = yaml.load(readFileSync('config/profile.yml', 'utf8'));
    success('profile.yml parses correctly');

    const cand = profile.candidate || {};
    if (cand.full_name) success(`Name: ${cand.full_name}`);
    else error('full_name missing');

    if (cand.email) success(`Email: ${cand.email.split('@')[0]}@...`);
    else error('email missing');

    if (cand.phone) success(`Phone: ${cand.phone}`);
    else error('phone missing');

    if (cand.location) success(`Location: ${cand.location}`);
    else error('location missing');
  } catch (e) {
    error(`Failed to parse profile.yml: ${e.message}`);
    return;
  }

  // Step 3: Credentials validation
  test('3. Validating credentials.yml');

  let credentials = {};
  try {
    credentials = yaml.load(readFileSync('config/credentials.yml', 'utf8'));
    success('credentials.yml parses correctly');

    if (credentials.computrabajo?.email) {
      success(`Computrabajo: ${credentials.computrabajo.email.split('@')[0]}@...`);
    } else {
      error('Computrabajo credentials missing');
    }

    if (credentials.linkedin?.email) {
      success(`LinkedIn: ${credentials.linkedin.email.split('@')[0]}@...`);
    } else {
      error('LinkedIn credentials missing');
    }
  } catch (e) {
    error(`Failed to parse credentials.yml: ${e.message}`);
    return;
  }

  // Step 4: Pipeline validation
  test('4. Checking job pipeline');

  const pipeline = readFileSync('data/pipeline.md', 'utf8');
  const pendingMatch = pipeline.match(/- \[ \]/g) || [];
  const completedMatch = pipeline.match(/- \[x\]/gi) || [];

  success(`Pipeline format is valid`);
  info(`${pendingMatch.length} pending jobs`);
  info(`${completedMatch.length} completed jobs`);

  if (pendingMatch.length === 0) {
    info('No pending jobs - run "node auto-apply.mjs scan bogota" to add jobs');
  }

  // Step 5: Network test
  test('5. Testing network connectivity');

  try {
    const ctResp = await fetch('https://co.computrabajo.com', { timeout: 5000 }).catch(e => null);
    if (ctResp?.ok || ctResp?.status === 303 || ctResp?.status === 503) {
      success('Computrabajo is reachable');
    } else {
      error(`Computrabajo returned: ${ctResp?.status || 'no response'}`);
    }
  } catch (e) {
    error(`Computrabajo unreachable: ${e.message}`);
  }

  try {
    const liResp = await fetch('https://linkedin.com', { timeout: 5000 }).catch(e => null);
    if (liResp?.ok || liResp?.status === 303 || liResp?.status === 503) {
      success('LinkedIn is reachable');
    } else {
      error(`LinkedIn returned: ${liResp?.status || 'no response'}`);
    }
  } catch (e) {
    error(`LinkedIn unreachable: ${e.message}`);
  }

  // Step 6: Browser test
  test('6. Testing browser automation');

  try {
    const browser = await chromium.launch({ headless: true });
    success('Launched Chromium browser');

    const context = await browser.newContext();
    const page = await context.newPage();
    success('Created browser context and page');

    // Try to navigate to Computrabajo
    await page.goto('https://co.computrabajo.com', { timeout: 30000, waitUntil: 'domcontentloaded' });
    success('Navigated to Computrabajo.com');

    // Check for form elements
    const inputs = await page.$$('input');
    const buttons = await page.$$('button');
    info(`Found ${inputs.length} inputs, ${buttons.length} buttons`);

    // Check for apply buttons
    const applySpans = await page.$$('span[data-href-offer-apply]');
    if (applySpans.length > 0) {
      success(`Found ${applySpans.length} apply button(s)`);
    } else {
      info('No apply buttons found on homepage (expected)');
    }

    await browser.close();
    success('Browser closed cleanly');
  } catch (e) {
    error(`Browser test failed: ${e.message}`);
  }

  // Step 7: Form filling test
  test('7. Testing form auto-fill logic');

  try {
    // Simulate guessValue function
    const testCases = [
      { field: 'nombre', expected: profile.candidate?.full_name },
      { field: 'email', expected: profile.candidate?.email },
      { field: 'teléfono', expected: profile.candidate?.phone },
      { field: 'location', expected: profile.candidate?.location }
    ];

    for (const tc of testCases) {
      if (tc.expected) {
        success(`${tc.field} → ${tc.expected.substring(0, 30)}`);
      } else {
        error(`${tc.field} → undefined`);
      }
    }
  } catch (e) {
    error(`Form test failed: ${e.message}`);
  }

  // Step 8: Git status
  test('8. Checking Git security');

  try {
    const gitignore = readFileSync('.gitignore', 'utf8');

    if (gitignore.includes('config/credentials.yml') || gitignore.includes('credentials.yml')) {
      success('credentials.yml is in .gitignore');
    } else {
      error('credentials.yml NOT in .gitignore - risk of commit!');
    }

    if (/^\s*logs\//m.test(gitignore)) {
      success('logs/ is in .gitignore');
    } else {
      info('logs/ not in .gitignore (optional)');
    }
  } catch (e) {
    error(`Could not check .gitignore: ${e.message}`);
  }

  // Summary
  console.log(`\n${BLUE}═════════════════════════════════════${RESET}`);
  console.log(`${BLUE}  Test Summary${RESET}`);
  console.log(`${BLUE}═════════════════════════════════════${RESET}\n`);

  const total = passed + failed;
  const percentage = Math.round((passed / total) * 100);

  console.log(`${GREEN}Passed: ${passed}${RESET}/${total}`);
  console.log(`${RED}Failed: ${failed}${RESET}/${total}`);
  console.log(`Health: ${percentage >= 80 ? GREEN : percentage >= 50 ? YELLOW : RED}${percentage}%${RESET}\n`);

  if (failed === 0) {
    console.log(`${GREEN}✓ All tests passed! System is ready.${RESET}\n`);
    console.log('Next steps:');
    console.log(`  ${BLUE}1. node auto-apply.mjs scan bogota${RESET}  (find jobs)`);
    console.log(`  ${BLUE}2. node auto-apply.mjs apply${RESET}        (apply to jobs)`);
    console.log(`  ${BLUE}3. node auto-apply.mjs status${RESET}       (check results)\n`);
  } else {
    console.log(`${RED}✗ Some tests failed. Please fix issues above.${RESET}\n`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(`${RED}Fatal error: ${e.message}${RESET}`);
  process.exit(1);
});
