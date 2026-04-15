#!/usr/bin/env node

/**
 * apply-auto.mjs — Automatic job application workflow
 * 
 * Scans pipeline.md for pending jobs and applies automatically:
 * 1. Detects if already applied (Computrabajo: "Postulado" status)
 * 2. Fills application forms with candidate data
 * 3. Submits applications
 * 4. Detects success (checkmark confirmation)
 * 5. Generates report of all submissions
 * 
 * Usage:
 *   node apply-auto.mjs         # Apply to all pending jobs once
 *   node apply-auto.mjs --loop 5   # Apply every 5 minutes
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import yaml from 'js-yaml';
import { chromium } from 'playwright';

const PROFILE_PATH = 'config/profile.yml';
const CREDENTIALS_PATH = 'config/credentials.yml';
const PIPELINE_PATH = 'data/pipeline.md';
const RESULTS_PATH = 'data/applications-log.md';

let applicationLog = [];

async function login(page, url, credentials) {
  const host = new URL(url).hostname;
  const currentUrl = page.url();

  // LinkedIn login
  if (host.includes('linkedin.com') || currentUrl.includes('linkedin.com')) {
    if (/signin|login/.test(currentUrl) || await page.$('input[name=session_key]')) {
      await page.fill('input[name=session_key]', credentials.linkedin?.email || '').catch(() => {});
      await page.fill('input[name=session_password]', credentials.linkedin?.password || '').catch(() => {});
      await page.click('button[type=submit]').catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      return true;
    }
  }

  // Computrabajo / candidato login
  if (host.includes('computrabajo.com') || currentUrl.includes('computrabajo.com')) {
    const loginTrigger = await page.$('span[data-login-button-desktop], button[data-login-button-desktop], .b_primary_inv');
    if (loginTrigger) {
      await loginTrigger.click().catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    }

    const emailInput = await page.$('input[name=email], input[type=email], input#email');
    const passwordInput = await page.$('input[name=password], input[type=password]');
    if (emailInput && passwordInput) {
      await page.fill('input[name=email], input[type=email], input#email', credentials.computrabajo?.email || '').catch(() => {});
      await page.fill('input[name=password], input[type=password]', credentials.computrabajo?.password || '').catch(() => {});
      await page.click('button[type=submit], input[type=submit]').catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      return true;
    }
  }

  return false;
}

function guessValue(name = '', placeholder = '', candidate = {}) {
  const key = `${name} ${placeholder}`.toLowerCase();
  if (/name|nombre/.test(key)) return candidate.full_name || '';
  if (/email/.test(key)) return candidate.email || '';
  if (/phone|tel[eé]fono|celular|mobile/.test(key)) return candidate.phone || '';
  if (/location|ciudad|city|address|direcci[oó]n/.test(key)) return candidate.location || '';
  if (/linkedin/.test(key)) return candidate.linkedin || '';
  if (/portfolio|website|web|url/.test(key)) return candidate.portfolio_url || '';
  if (/github/.test(key)) return candidate.github || '';
  if (/message|cover|motivation|motivaci[oó]n|por qu[eé]|reason|por que/.test(key)) {
    return `Estoy interesado en esta oportunidad porque se alinea con mi experiencia en desarrollo full stack y automatización.`;
  }
  return '';
}

async function hasAlreadyApplied(page, url) {
  if (url.includes('computrabajo.com')) {
    // Look for "Postulado" status in Computrabajo
    const status = await page.$('div.status_prev p:has-text("Postulado")');
    return !!status;
  }
  if (url.includes('linkedin.com')) {
    // Look for "Already applied" or similar
    const alreadyApplied = await page.$('text=Already applied');
    return !!alreadyApplied;
  }
  return false;
}

async function findAndClickApplyButton(page) {
  const selectors = [
    'span[data-href-offer-apply]',
    'span[data-apply-link]',
    'span[offer-detail-button]',
    'span[href*="/candidate/apply"]',
    'span[href*="candidato.co.computrabajo.com"]',
    'button:has-text("Postúlate")',
    'button:has-text("Postúlate gratis")',
    'button:has-text("Aplicar")',
    'button:has-text("Apply")',
    'a:has-text("Aplicar")',
    'a:has-text("Apply")',
    'a[href*="apply"]',
    'button[class*="apply"]',
    'span:has-text("Aplicar")',
    'span:has-text("Apply")'
  ];

  for (const selector of selectors) {
    const button = await page.$(selector).catch(() => null);
    if (!button) continue;

    const href = await button.getAttribute('href').catch(() => null)
      || await button.getAttribute('data-href-offer-apply').catch(() => null)
      || await button.getAttribute('data-apply-link').catch(() => null)
      || await button.getAttribute('data-href-access').catch(() => null)
      || await button.getAttribute('formaction').catch(() => null);
    if (href && href.startsWith('http')) {
      await page.goto(href, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
      return true;
    }

    await button.click().catch(() => {});
    return true;
  }

  return false;
}

async function fillForm(page, candidate) {
  const fields = await page.$$('input[name], textarea[name], select[name]').catch(() => []);
  const filled = [];

  for (const field of fields) {
    const name = await field.getAttribute('name').catch(() => '');
    const placeholder = await field.getAttribute('placeholder').catch(() => '');
    const type = await field.getAttribute('type').catch(() => 'text');
    const value = guessValue(name, placeholder, candidate);

    if (value && type !== 'file' && type !== 'checkbox' && type !== 'radio') {
      await field.fill(value).catch(() => {});
      filled.push(name);
    }
  }

  return filled;
}

async function submitApplication(page) {
  const submitSelectors = [
    'button:has-text("Enviar")',
    'button:has-text("Submit")',
    'button:has-text("Aplicar")',
    'button[type=submit]',
    'input[type=submit]'
  ];

  for (const selector of submitSelectors) {
    const button = await page.$(selector).catch(() => null);
    if (button) {
      await button.click().catch(() => {});
      return true;
    }
  }
  return false;
}

async function detectSuccess(page) {
  // Computrabajo checkmark
  const checkmark = await page.$('svg.checkmark h1:has-text("¡Aplicaste correctamente!")').catch(() => null);
  if (checkmark) return true;

  // Generic success message
  const successDiv = await page.$('text=Postulado, text=Ya diste el primer paso').catch(() => null);
  if (successDiv) return true;

  // LinkedIn success
  const linkedInSuccess = await page.$('text=Application sent').catch(() => null);
  if (linkedInSuccess) return true;

  return false;
}

async function processJob(job, profile, credentials) {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'es-CO',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', { get: () => ['es-CO', 'es'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    window.navigator.chrome = { runtime: {} };
  });

  const result = {
    url: job.url,
    company: job.company,
    title: job.title,
    status: 'pending',
    timestamp: new Date().toISOString(),
    details: []
  };

  try {
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Check if already applied
    const alreadyApplied = await hasAlreadyApplied(page, job.url);
    if (alreadyApplied) {
      result.status = 'already-applied';
      result.details.push('Already applied to this job');
    } else {
      // Try login if needed on the job page
      await login(page, job.url, credentials).catch(() => {});

      // Find and click apply button
      const foundButton = await findAndClickApplyButton(page);
      if (!foundButton) {
        result.status = 'no-apply-button';
        result.details.push('Could not find apply button');
      } else {
        result.details.push('Found and clicked apply button');
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

        // If the candidate portal requires login after clicking apply, authenticate there too
        await login(page, page.url(), credentials).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

        // Fill form if present
        const formFields = await page.$$('input[name], textarea[name], select[name]').catch(() => []);
        if (formFields.length > 0) {
          const filled = await fillForm(page, profile.candidate || {});
          result.details.push(`Filled ${filled.length} form fields: ${filled.join(', ')}`);
        }

        // Submit
        const submitted = await submitApplication(page);
        if (submitted) {
          result.details.push('Clicked submit button');
          await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

          // Check success
          const success = await detectSuccess(page);
          result.status = success ? 'success' : 'submitted-unverified';
          result.details.push(success ? 'Success confirmed (checkmark found)' : 'Form submitted but success not confirmed');
        } else {
          result.status = 'form-not-submitted';
          result.details.push('Could not find submit button');
        }
      }
    }
  } catch (error) {
    result.status = 'error';
    result.details.push(`Error: ${error.message}`);
  } finally {
    await browser.close();
  }

  return result;
}

function parsePipeline() {
  if (!existsSync(PIPELINE_PATH)) return [];
  const content = readFileSync(PIPELINE_PATH, 'utf8');
  const lines = content.split(/\r?\n/);
  const jobs = [];

  for (const line of lines) {
    const match = line.match(/- \[ \] (https?:\/\/\S+)(?: \| ([^|]+) \| ([^|]+))?/);
    if (match) {
      jobs.push({ url: match[1], company: match[2]?.trim() || '', title: match[3]?.trim() || '' });
    }
  }

  return jobs;
}

async function main() {
  if (!existsSync(PROFILE_PATH) || !existsSync(CREDENTIALS_PATH)) {
    console.error('Error: Missing config/profile.yml or config/credentials.yml');
    process.exit(1);
  }

  const profile = yaml.load(readFileSync(PROFILE_PATH, 'utf8')) || {};
  const credentials = yaml.load(readFileSync(CREDENTIALS_PATH, 'utf8')) || {};

  const jobs = parsePipeline();
  if (!jobs.length) {
    console.log('No pending jobs in pipeline.md');
    return;
  }

  console.log(`Processing ${jobs.length} jobs...`);
  const results = [];

  for (const job of jobs) {
    console.log(`-> ${job.company} | ${job.title}`);
    const result = await processJob(job, profile, credentials);
    results.push(result);

    // Log to file
    const logLine = `**${result.timestamp}** | ${result.company} | ${result.title} | ${result.status} | ${result.details.join(' | ')}\n`;
    appendFileSync(RESULTS_PATH, logLine, 'utf8');
  }

  // Generate summary report
  const report = buildReport(results);
  writeFileSync(RESULTS_PATH, report, 'utf8');
  console.log(`\nReport saved to ${RESULTS_PATH}`);
}

function buildReport(results) {
  const lines = ['# Application Submission Report', '', `Generated: ${new Date().toISOString()}`, ''];
  const statuses = {};

  for (const result of results) {
    statuses[result.status] = (statuses[result.status] || 0) + 1;
    lines.push(`## ${result.company} — ${result.title}`);
    lines.push(`- URL: ${result.url}`);
    lines.push(`- Status: **${result.status}**`);
    lines.push(`- Timestamp: ${result.timestamp}`);
    lines.push('- Details:');
    for (const detail of result.details) {
      lines.push(`  - ${detail}`);
    }
    lines.push('');
  }

  lines.push('## Summary');
  for (const [status, count] of Object.entries(statuses)) {
    lines.push(`- ${status}: ${count}`);
  }

  return lines.join('\n');
}

// Parse command-line arguments
const args = process.argv.slice(2);
if (args.includes('--loop')) {
  const index = args.indexOf('--loop');
  const minutes = parseInt(args[index + 1]) || 5;
  console.log(`Auto-apply loop: every ${minutes} minutes`);
  main();
  setInterval(main, minutes * 60 * 1000);
} else {
  main();
}
