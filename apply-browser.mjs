#!/usr/bin/env node

/**
 * apply-browser.mjs — Auto-apply to jobs via Playwright browser automation
 *
 * Uses headless Chromium to fill application forms on Greenhouse, Lever, Ashby.
 * Same flow a human would follow: navigate → click Apply → fill form → upload resume → submit.
 *
 * Usage:
 *   node apply-browser.mjs --url <job-url> --resume <path.pdf> [--dry-run]
 *   node apply-browser.mjs --batch <applications.json> [--dry-run]
 *
 * Batch JSON format:
 *   [{ "url": "...", "company": "...", "role": "...", "resumePath": "...", "coverLetter": "..." }]
 */

import { chromium } from 'playwright';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Load profile ────────────────────────────────────────────────
function loadProfile() {
  const p = yaml.load(readFileSync(join(__dirname, 'config/profile.yml'), 'utf-8'));
  const nameParts = p.candidate.full_name.split(' ');
  return {
    firstName: nameParts[0],
    lastName: nameParts.slice(1).join(' '),
    fullName: p.candidate.full_name,
    email: p.candidate.email,
    phone: p.candidate.phone || '',
    linkedin: p.candidate.linkedin ? `https://${p.candidate.linkedin}` : '',
    location: p.candidate.location || '',
    portfolio: p.candidate.portfolio_url || '',
    github: p.candidate.github ? `https://${p.candidate.github}` : '',
    exclusions: (p.exclusions?.companies || []).map(c => c.toLowerCase()),
  };
}

// ── Detect ATS from URL ─────────────────────────────────────────
function detectATS(url) {
  if (url.includes('greenhouse.io')) return 'greenhouse';
  if (url.includes('lever.co')) return 'lever';
  if (url.includes('ashbyhq.com')) return 'ashby';
  if (url.includes('workable.com')) return 'workable';
  return 'unknown';
}

// ── Screenshot helper ───────────────────────────────────────────
async function saveScreenshot(page, name) {
  const dir = join(__dirname, 'logs/screenshots');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}-${Date.now()}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

// ── Smart field filler ──────────────────────────────────────────
async function fillField(page, selector, value, timeout = 5000) {
  try {
    const el = await page.waitForSelector(selector, { timeout });
    if (el) {
      await el.click();
      await el.fill(value);
      return true;
    }
  } catch { return false; }
  return false;
}

async function fillByLabel(page, labelText, value) {
  try {
    const label = await page.getByLabel(labelText, { exact: false });
    if (await label.count() > 0) {
      await label.first().fill(value);
      return true;
    }
  } catch { return false; }
  return false;
}

async function uploadResume(page, resumePath) {
  try {
    // Look for file input (resume/CV upload)
    const fileInputs = await page.locator('input[type="file"]').all();
    for (const input of fileInputs) {
      const accept = await input.getAttribute('accept') || '';
      const name = await input.getAttribute('name') || '';
      const ariaLabel = await input.getAttribute('aria-label') || '';
      const id = await input.getAttribute('id') || '';
      const combined = `${name} ${ariaLabel} ${id} ${accept}`.toLowerCase();

      // Match resume/CV upload fields
      if (combined.includes('resume') || combined.includes('cv') ||
          accept.includes('pdf') || accept.includes('.doc') ||
          fileInputs.length === 1) {
        await input.setInputFiles(resumePath);
        return true;
      }
    }
    // Fallback: just use the first file input
    if (fileInputs.length > 0) {
      await fileInputs[0].setInputFiles(resumePath);
      return true;
    }
  } catch (e) { console.log(`  Resume upload failed: ${e.message}`); }
  return false;
}

// ── Greenhouse form filler ──────────────────────────────────────
async function applyGreenhouse(page, profile, resumePath, coverLetter, dryRun) {
  // Click the Apply button if we're on the job listing page
  try {
    const applyBtn = page.locator('a:has-text("Apply"), button:has-text("Apply")').first();
    if (await applyBtn.isVisible({ timeout: 3000 })) {
      await applyBtn.click();
      await page.waitForTimeout(3000);
    }
  } catch { /* Already on application form */ }

  // Fill standard fields
  await fillByLabel(page, 'First name', profile.firstName) ||
    await fillField(page, '#first_name, input[name="first_name"]', profile.firstName);

  await fillByLabel(page, 'Last name', profile.lastName) ||
    await fillField(page, '#last_name, input[name="last_name"]', profile.lastName);

  await fillByLabel(page, 'Email', profile.email) ||
    await fillField(page, '#email, input[name="email"], input[type="email"]', profile.email);

  await fillByLabel(page, 'Phone', profile.phone) ||
    await fillField(page, '#phone, input[name="phone"], input[type="tel"]', profile.phone);

  // LinkedIn
  await fillByLabel(page, 'LinkedIn', profile.linkedin) ||
    await fillField(page, 'input[name*="linkedin"], input[placeholder*="LinkedIn"]', profile.linkedin);

  // Location
  await fillByLabel(page, 'Location', profile.location) ||
    await fillField(page, 'input[name*="location"]', profile.location);

  // Resume upload
  if (resumePath) {
    await uploadResume(page, resumePath);
  }

  // Cover letter
  if (coverLetter) {
    await fillByLabel(page, 'Cover letter', coverLetter) ||
      await fillField(page, 'textarea[name*="cover"]', coverLetter);
  }

  // Handle common dropdowns (work authorization, etc.)
  try {
    // "Are you legally authorized to work" → Yes
    const authSelects = await page.locator('select').all();
    for (const sel of authSelects) {
      const label = await sel.evaluate(el => {
        const lbl = el.closest('.field')?.querySelector('label')?.textContent || '';
        return lbl.toLowerCase();
      });
      if (label.includes('authorized') || label.includes('authorization') || label.includes('legally')) {
        await sel.selectOption({ label: 'Yes' });
      }
      if (label.includes('sponsorship') || label.includes('visa')) {
        await sel.selectOption({ label: 'No' });
      }
    }
  } catch { /* Optional fields */ }

  // Screenshot before submit
  const ssPath = await saveScreenshot(page, 'greenhouse-pre-submit');

  if (dryRun) {
    return { status: 'dry-run', ats: 'greenhouse', screenshot: ssPath };
  }

  // Submit
  try {
    const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Apply")').first();
    await submitBtn.click();
    await page.waitForTimeout(5000);

    // Check for success signals
    const bodyText = await page.textContent('body');
    const isSuccess = bodyText.toLowerCase().includes('thank') ||
                      bodyText.toLowerCase().includes('submitted') ||
                      bodyText.toLowerCase().includes('received') ||
                      bodyText.toLowerCase().includes('application');

    const ssAfter = await saveScreenshot(page, 'greenhouse-post-submit');
    return {
      status: isSuccess ? 'applied' : 'uncertain',
      ats: 'greenhouse',
      screenshot: ssAfter,
    };
  } catch (e) {
    return { status: 'failed', ats: 'greenhouse', error: e.message, screenshot: ssPath };
  }
}

// ── Lever form filler ───────────────────────────────────────────
async function applyLever(page, profile, resumePath, coverLetter, dryRun) {
  // Click Apply if on listing
  try {
    const applyLink = page.locator('a.postings-btn, a:has-text("Apply")').first();
    if (await applyLink.isVisible({ timeout: 3000 })) {
      await applyLink.click();
      await page.waitForTimeout(3000);
    }
  } catch { }

  // Lever uses simpler form structure
  await fillField(page, 'input[name="name"]', profile.fullName);
  await fillField(page, 'input[name="email"]', profile.email);
  await fillField(page, 'input[name="phone"]', profile.phone);
  await fillField(page, 'input[name="org"]', 'McKesson Corporation');
  await fillField(page, 'input[name*="linkedin"], input[placeholder*="LinkedIn"]', profile.linkedin);

  if (resumePath) await uploadResume(page, resumePath);

  // Additional info / comments
  if (coverLetter) {
    await fillField(page, 'textarea[name="comments"]', coverLetter);
  }

  const ssPath = await saveScreenshot(page, 'lever-pre-submit');

  if (dryRun) {
    return { status: 'dry-run', ats: 'lever', screenshot: ssPath };
  }

  try {
    const submitBtn = page.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Apply")').first();
    await submitBtn.click();
    await page.waitForTimeout(5000);

    const bodyText = await page.textContent('body');
    const isSuccess = bodyText.toLowerCase().includes('thank') ||
                      bodyText.toLowerCase().includes('submitted') ||
                      bodyText.toLowerCase().includes('received');

    const ssAfter = await saveScreenshot(page, 'lever-post-submit');
    return { status: isSuccess ? 'applied' : 'uncertain', ats: 'lever', screenshot: ssAfter };
  } catch (e) {
    return { status: 'failed', ats: 'lever', error: e.message, screenshot: ssPath };
  }
}

// ── Ashby form filler ───────────────────────────────────────────
async function applyAshby(page, profile, resumePath, coverLetter, dryRun) {
  // Click Apply if on listing
  try {
    const applyBtn = page.locator('a:has-text("Apply"), button:has-text("Apply")').first();
    if (await applyBtn.isVisible({ timeout: 3000 })) {
      await applyBtn.click();
      await page.waitForTimeout(3000);
    }
  } catch { }

  // Ashby forms — try both label-based and input-based
  await fillByLabel(page, 'First Name', profile.firstName) ||
    await fillField(page, 'input[name*="first"], input[placeholder*="First"]', profile.firstName);

  await fillByLabel(page, 'Last Name', profile.lastName) ||
    await fillField(page, 'input[name*="last"], input[placeholder*="Last"]', profile.lastName);

  // Some Ashby forms use a single "Name" field
  await fillByLabel(page, 'Full Name', profile.fullName);

  await fillByLabel(page, 'Email', profile.email) ||
    await fillField(page, 'input[type="email"], input[name*="email"]', profile.email);

  await fillByLabel(page, 'Phone', profile.phone) ||
    await fillField(page, 'input[type="tel"], input[name*="phone"]', profile.phone);

  await fillByLabel(page, 'LinkedIn', profile.linkedin) ||
    await fillField(page, 'input[name*="linkedin"], input[placeholder*="LinkedIn"]', profile.linkedin);

  await fillByLabel(page, 'Location', profile.location) ||
    await fillField(page, 'input[name*="location"]', profile.location);

  if (resumePath) await uploadResume(page, resumePath);

  if (coverLetter) {
    await fillByLabel(page, 'Cover Letter', coverLetter) ||
      await fillField(page, 'textarea', coverLetter);
  }

  const ssPath = await saveScreenshot(page, 'ashby-pre-submit');

  if (dryRun) {
    return { status: 'dry-run', ats: 'ashby', screenshot: ssPath };
  }

  try {
    const submitBtn = page.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Apply")').first();
    await submitBtn.click();
    await page.waitForTimeout(5000);

    const bodyText = await page.textContent('body');
    const isSuccess = bodyText.toLowerCase().includes('thank') ||
                      bodyText.toLowerCase().includes('submitted') ||
                      bodyText.toLowerCase().includes('received') ||
                      bodyText.toLowerCase().includes('application');

    const ssAfter = await saveScreenshot(page, 'ashby-post-submit');
    return { status: isSuccess ? 'applied' : 'uncertain', ats: 'ashby', screenshot: ssAfter };
  } catch (e) {
    return { status: 'failed', ats: 'ashby', error: e.message, screenshot: ssPath };
  }
}

// ── Main apply function ─────────────────────────────────────────
export async function applyToJob({ url, resumePath, coverLetter, dryRun = false }) {
  const profile = loadProfile();

  // Check exclusions
  for (const excl of profile.exclusions) {
    if (url.toLowerCase().includes(excl.replace(/\s+/g, ''))) {
      return { status: 'skipped', reason: `Excluded company: ${excl}`, url };
    }
  }

  const ats = detectATS(url);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  let result;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Resolve absolute resume path
    const absResume = resumePath ? resolve(resumePath) : null;

    switch (ats) {
      case 'greenhouse':
        result = await applyGreenhouse(page, profile, absResume, coverLetter, dryRun);
        break;
      case 'lever':
        result = await applyLever(page, profile, absResume, coverLetter, dryRun);
        break;
      case 'ashby':
        result = await applyAshby(page, profile, absResume, coverLetter, dryRun);
        break;
      default:
        result = { status: 'unsupported', ats, error: `Unknown ATS for URL: ${url}` };
    }
  } catch (e) {
    result = { status: 'error', error: e.message };
  } finally {
    await browser.close();
  }

  return { ...result, url };
}

// ── Batch apply ─────────────────────────────────────────────────
export async function applyBatch(applications, dryRun = false) {
  const results = [];
  for (const app of applications) {
    console.log(`  → ${app.company} — ${app.role}`);
    const result = await applyToJob({
      url: app.url,
      resumePath: app.resumePath,
      coverLetter: app.coverLetter,
      dryRun,
    });
    results.push({ ...result, company: app.company, role: app.role });
    // Respectful delay between applications
    if (!dryRun) await new Promise(r => setTimeout(r, 3000));
  }
  return results;
}

// ── CLI ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length > 0) {
  const dryRun = args.includes('--dry-run');
  const urlIdx = args.indexOf('--url');
  const resumeIdx = args.indexOf('--resume');
  const batchIdx = args.indexOf('--batch');

  if (batchIdx !== -1) {
    const apps = JSON.parse(readFileSync(args[batchIdx + 1], 'utf-8'));
    applyBatch(apps, dryRun).then(r => console.log(JSON.stringify(r, null, 2)));
  } else if (urlIdx !== -1) {
    const url = args[urlIdx + 1];
    const resume = resumeIdx !== -1 ? args[resumeIdx + 1] : null;
    applyToJob({ url, resumePath: resume, dryRun }).then(r => console.log(JSON.stringify(r, null, 2)));
  } else {
    console.log('Usage:');
    console.log('  node apply-browser.mjs --url <job-url> [--resume <path.pdf>] [--dry-run]');
    console.log('  node apply-browser.mjs --batch <applications.json> [--dry-run]');
  }
}
