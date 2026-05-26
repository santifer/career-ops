#!/usr/bin/env node

/**
 * apply-auto.mjs — Server-side application automation via Playwright
 *
 * Runs entirely on Proxmox (CT 203). No MacBook needed.
 * Fills ATS forms, uploads resume PDF, takes screenshot for review.
 *
 * Usage:
 *   node apply-auto.mjs <url> <pdf-path> [--cover-letter=path] [--submit] [--screenshot=path]
 *
 * Supported platforms:
 *   - Ashby (jobs.ashbyhq.com)
 *   - Greenhouse (boards.greenhouse.io)
 *   - Lever (jobs.lever.co)
 *   - Generic (best-effort field detection)
 *
 * Without --submit, fills the form and pauses for review (takes screenshot).
 * With --submit, clicks the submit button after filling.
 *
 * Requires: playwright installed with chromium browser.
 */

import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Parse CLI args ──────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {};
const positional = [];

for (const arg of args) {
  if (arg.startsWith('--')) {
    const [key, val] = arg.slice(2).split('=');
    flags[key] = val ?? true;
  } else {
    positional.push(arg);
  }
}

const url = positional[0];
const pdfPath = positional[1];
const coverLetterPath = flags['cover-letter'];
const shouldSubmit = flags.submit === true;
const screenshotPath = flags.screenshot || 'output/apply-screenshot.png';
const authStatePath = flags.auth || null; // Path to saved browser state (from browser-login.mjs)

if (!url || !pdfPath) {
  console.error('Usage: node apply-auto.mjs <url> <pdf-path> [--cover-letter=path] [--submit] [--screenshot=path]');
  process.exit(1);
}

if (!existsSync(pdfPath)) {
  console.error(`PDF not found: ${pdfPath}`);
  process.exit(1);
}

// ── Load profile data ───────────────────────────────────────────

async function loadProfile() {
  const profilePath = resolve(__dirname, 'config/profile.yml');
  const raw = await readFile(profilePath, 'utf-8');
  // Simple YAML parser for our flat structure
  const profile = {};
  const lines = raw.split('\n');
  let currentSection = null;

  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue;

    // Top-level key
    const topMatch = line.match(/^(\w[\w_]*)\s*:/);
    if (topMatch && !line.includes('"') && !line.includes("'")) {
      currentSection = topMatch[1];
      profile[currentSection] = {};
      continue;
    }

    // Nested key-value
    const kvMatch = line.match(/^\s+(\w[\w_]*)\s*:\s*"?([^"]*)"?\s*$/);
    if (kvMatch && currentSection) {
      profile[currentSection][kvMatch[1]] = kvMatch[2].replace(/^['"]|['"]$/g, '');
    }
  }

  return profile;
}

// ── Load cover letter text ──────────────────────────────────────

async function loadCoverLetter(path) {
  if (!path || !existsSync(path)) return null;
  const raw = await readFile(path, 'utf-8');
  // Strip markdown header and signature
  const lines = raw.split('\n');
  const bodyLines = [];
  let inBody = false;
  for (const line of lines) {
    if (line.startsWith('---')) {
      if (inBody) break; // end of body
      inBody = true;
      continue;
    }
    if (inBody && !line.startsWith('#') && !line.startsWith('**Patrick')) {
      bodyLines.push(line);
    }
  }
  return bodyLines.join('\n').trim() || raw;
}

// ── Platform detection ──────────────────────────────────────────

function detectPlatform(pageUrl) {
  if (pageUrl.includes('ashbyhq.com')) return 'ashby';
  if (pageUrl.includes('greenhouse.io') || pageUrl.includes('boards.greenhouse')) return 'greenhouse';
  if (pageUrl.includes('lever.co')) return 'lever';
  if (pageUrl.includes('myworkdayjobs.com') || pageUrl.includes('workday.com')) return 'workday';
  if (pageUrl.includes('stripe.com')) return 'stripe';
  return 'generic';
}

// ── Ashby form filler ───────────────────────────────────────────

async function fillAshby(page, profile, pdfPath, coverLetter) {
  const c = profile.candidate || {};
  console.log('🔧 Platform: Ashby');

  // Ashby uses React — no <form> tag. Wait for input fields directly.
  await page.waitForSelector('input[type="text"], input[type="email"]', { timeout: 15000 });
  await page.waitForTimeout(1500); // Let React finish rendering

  // ── Step 1: Upload resume FIRST so Ashby's parser runs ────────
  // Ashby parses uploaded resumes and autofills fields. We upload first,
  // wait for parsing to finish, THEN overwrite with our clean data.
  console.log('  📤 Uploading resume first (Ashby parses and autofills)...');
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    await fileInput.setInputFiles(resolve(pdfPath));
    console.log(`  ✅ Resume uploaded: ${pdfPath}`);
  } else {
    console.log('  ⚠️ No file input found — trying Upload button...');
    const uploadBtn = await page.$('button:has-text("Upload"), label:has-text("Upload")');
    if (uploadBtn) {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5000 }),
        uploadBtn.click(),
      ]);
      await fileChooser.setFiles(resolve(pdfPath));
      console.log(`  ✅ Resume uploaded via file chooser: ${pdfPath}`);
    }
  }

  // Wait for Ashby's resume parser to finish autofilling
  // The banner "Parsing your resume. Autofilling key fields..." disappears when done
  console.log('  ⏳ Waiting for Ashby resume parser to finish...');
  try {
    await page.waitForSelector('text=Parsing your resume', { timeout: 5000 });
    // Now wait for it to disappear (parsing done)
    await page.waitForSelector('text=Parsing your resume', { state: 'hidden', timeout: 15000 });
    console.log('  ✅ Resume parsing complete');
  } catch {
    // Parser banner might not appear or might already be done
    console.log('  ⏩ Resume parser banner not detected — continuing');
  }
  await page.waitForTimeout(1000); // Extra settle time

  // ── Step 2: Fill all text inputs (overwriting parser autofill) ─
  const allInputs = await page.$$('input:not([type="hidden"]):not([type="submit"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])');

  for (const input of allInputs) {
    const label = await getFieldLabel(page, input);
    const placeholder = (await input.getAttribute('placeholder')) || '';
    const type = (await input.getAttribute('type')) || 'text';
    const hint = `${label} ${placeholder}`.toLowerCase();

    if (hint.includes('name') && !hint.includes('linkedin') && !hint.includes('github') && type === 'text' && (hint.includes('type here') || hint.includes('name'))) {
      await input.fill('');
      await input.fill(c.full_name || 'Patrick Moore');
      console.log(`  ✅ Name: ${c.full_name}`);
    } else if (type === 'email' || hint.includes('email') || hint.includes('hello@')) {
      await input.fill('');
      await input.fill(c.email || 'patrick.james.moore@protonmail.com');
      console.log(`  ✅ Email: ${c.email}`);
    } else if (type === 'tel' || hint.includes('phone') || hint.includes('1-415')) {
      await input.fill('');
      await input.fill(c.phone || '303-514-3586');
      console.log(`  ✅ Phone: ${c.phone}`);
    } else if (hint.includes('linkedin')) {
      await input.fill('');
      await input.fill(`https://${c.linkedin || 'linkedin.com/in/patrick-moore-25a13a16'}`);
      console.log(`  ✅ LinkedIn`);
    } else if (hint.includes('github')) {
      await input.fill('');
      await input.fill(`https://${c.github || 'github.com/tricheboars'}`);
      console.log(`  ✅ GitHub`);
    } else if (hint.includes('portfolio')) {
      await input.fill('');
      await input.fill(c.portfolio_url || 'https://moorelab.cloud');
      console.log(`  ✅ Portfolio`);
    }
  }

  // ── Step 3: Location combobox ─────────────────────────────────
  // Ashby uses a combobox. Type slowly, wait for dropdown, pick exact match via evaluate.
  const locationInput = await page.$('input[placeholder*="Start typing"], input[role="combobox"]');
  if (locationInput) {
    await locationInput.click();
    await locationInput.fill('');
    await page.waitForTimeout(300);
    await locationInput.type('Denver, Col', { delay: 100 }); // Type slowly for autocomplete
    await page.waitForTimeout(2000); // Wait for dropdown to populate

    // Use evaluate to find and click the exact Denver option from the dropdown
    const locationSelected = await page.evaluate(() => {
      // Find all role="option" elements
      const options = document.querySelectorAll('[role="option"]');
      for (const opt of options) {
        const text = opt.textContent.trim();
        if (text.startsWith('Denver, Colorado')) {
          opt.click();
          return text;
        }
      }
      // Fallback: find any li or div in a listbox that mentions Denver
      const listItems = document.querySelectorAll('[role="listbox"] > *, ul[class*="dropdown"] > li, div[class*="option"]');
      for (const item of listItems) {
        const text = item.textContent.trim();
        if (text.includes('Denver') && text.includes('Colorado') && text.length < 100) {
          item.click();
          return text;
        }
      }
      return null;
    });

    if (locationSelected) {
      console.log(`  ✅ Location: ${locationSelected}`);
    } else {
      // Last resort: press down arrow + enter to select first suggestion
      await locationInput.press('ArrowDown');
      await page.waitForTimeout(200);
      await locationInput.press('Enter');
      console.log('  ⚠️ Location: Denver (arrow-down + enter fallback)');
    }
  }

  // ── Step 4: Work authorization Yes/No buttons ─────────────────
  // Ashby renders Yes/No as styled <button> elements in question blocks.
  // Strategy: find all Yes/No button PAIRS, then identify which question
  // each pair belongs to by scanning nearby text nodes.
  await page.waitForTimeout(500);

  const buttonsResult = await page.evaluate(() => {
    // Find all button groups that contain exactly Yes + No buttons
    const allButtons = Array.from(document.querySelectorAll('button'));
    const results = { auth: false, sponsor: false };

    // Group buttons by their parent container
    const buttonGroups = new Map();
    for (const btn of allButtons) {
      const text = btn.textContent.trim();
      if (text === 'Yes' || text === 'No') {
        const parent = btn.parentElement;
        if (!buttonGroups.has(parent)) {
          buttonGroups.set(parent, []);
        }
        buttonGroups.get(parent).push(btn);
      }
    }

    // For each Yes/No pair, find the question it belongs to
    const groups = Array.from(buttonGroups.entries());
    for (const [parent, buttons] of groups) {
      const yesBtn = buttons.find(b => b.textContent.trim() === 'Yes');
      const noBtn = buttons.find(b => b.textContent.trim() === 'No');
      if (!yesBtn || !noBtn) continue;

      // Walk up to find nearby question text
      let container = parent;
      let questionText = '';
      for (let i = 0; i < 6; i++) {
        container = container.parentElement;
        if (!container) break;
        questionText = container.textContent || '';
        // Stop walking up once we have enough context to identify the question
        if (questionText.includes('authorized') || questionText.includes('sponsorship')) break;
      }

      if (questionText.includes('legally authorized') && !results.auth) {
        yesBtn.click();
        results.auth = true;
      } else if (questionText.includes('sponsorship') && !results.sponsor) {
        noBtn.click();
        results.sponsor = true;
      }
    }

    return results;
  });

  if (buttonsResult.auth) {
    console.log('  ✅ Work authorization: Yes');
  } else {
    console.log('  ⚠️ Work authorization: Yes button not found');
  }
  if (buttonsResult.sponsor) {
    console.log('  ✅ Sponsorship required: No');
  } else {
    console.log('  ⚠️ Sponsorship: No button not found');
  }

  // ── Step 5: Cover letter / additional info textarea ───────────
  if (coverLetter) {
    const textareas = await page.$$('textarea');
    for (const ta of textareas) {
      const label = await getFieldLabel(page, ta);
      const labelLower = label.toLowerCase();
      if (labelLower.includes('cover') || labelLower.includes('additional') || labelLower.includes('anything else') || labelLower.includes('why')) {
        await ta.fill(coverLetter);
        console.log(`  ✅ Cover letter filled in "${label}"`);
        break;
      }
    }
  }
}

// ── Greenhouse form filler ──────────────────────────────────────

async function fillGreenhouse(page, profile, pdfPath, coverLetter) {
  const c = profile.candidate || {};
  console.log('🔧 Platform: Greenhouse');

  await page.waitForSelector('#first_name, #application_form, form', { timeout: 10000 });
  await page.waitForTimeout(1000);

  // Greenhouse uses specific IDs
  const fieldMap = {
    '#first_name': c.full_name?.split(' ')[0] || 'Patrick',
    '#last_name': c.full_name?.split(' ').pop() || 'Moore',
    '#email': c.email || 'patrick.james.moore@protonmail.com',
    '#phone': c.phone || '303-514-3586',
  };

  for (const [selector, value] of Object.entries(fieldMap)) {
    const field = await page.$(selector);
    if (field) {
      await field.fill(value);
      console.log(`  ✅ ${selector}: ${value}`);
    }
  }

  // Location (City) — Greenhouse autocomplete
  const locationField = await page.$('#candidate-location');
  if (locationField) {
    await locationField.fill('');
    await locationField.type('Denver, CO', { delay: 80 });
    await page.waitForTimeout(1500);
    // Try to click autocomplete suggestion
    const locSuggestion = await page.$('.autocomplete-results li, [class*="suggestion"], [role="option"]');
    if (locSuggestion) {
      await locSuggestion.click();
      console.log('  ✅ Location: Denver, CO (selected from autocomplete)');
    } else {
      console.log('  ✅ Location: Denver, CO (typed)');
    }
  }

  // Resume upload
  const resumeInput = await page.$('#resume, input[type="file"][name*="resume"], input[type="file"]:first-of-type');
  if (resumeInput) {
    await resumeInput.setInputFiles(resolve(pdfPath));
    console.log(`  ✅ Resume uploaded: ${pdfPath}`);
  }

  // Cover letter — Greenhouse has a dedicated file input #cover_letter
  if (coverLetter || coverLetterPath) {
    const coverFileInput = await page.$('#cover_letter, input[type="file"][name*="cover"]');
    if (coverFileInput && coverLetterPath && existsSync(coverLetterPath)) {
      await coverFileInput.setInputFiles(resolve(coverLetterPath));
      console.log('  ✅ Cover letter file uploaded');
    }
  }

  // LinkedIn URL
  const linkedinField = await page.$('input[name*="linkedin"], input[id*="linkedin"]');
  if (linkedinField) {
    await linkedinField.fill(`https://${c.linkedin}`);
    console.log(`  ✅ LinkedIn: ${c.linkedin}`);
  }

  // Website
  const websiteField = await page.$('input[name*="website"], input[id*="website"], input[name*="portfolio"]');
  if (websiteField) {
    await websiteField.fill(c.portfolio_url || 'https://moorelab.cloud');
    console.log(`  ✅ Website: ${c.portfolio_url}`);
  }
}

// ── Stripe (Greenhouse embed) form filler ──────────────────────

async function fillStripe(page, profile, pdfPath, coverLetter) {
  const c = profile.candidate || {};
  console.log('🔧 Platform: Stripe (Greenhouse embed in iframe)');

  // Stripe embeds Greenhouse in an iframe. Find and switch to it.
  let frame = page;
  const ghFrame = page.frames().find(f => f.url().includes('greenhouse.io'));
  if (ghFrame) {
    frame = ghFrame;
    console.log('  🔗 Switched to Greenhouse iframe');
  } else {
    console.log('  ⚠️ No Greenhouse iframe found — trying main page');
  }

  await frame.waitForSelector('#first_name', { timeout: 15000 });
  await frame.waitForTimeout(1000);

  // ── Basic contact fields ──────────────────────────────────────
  const basicFields = {
    '#first_name': c.full_name?.split(' ')[0] || 'Patrick',
    '#last_name': c.full_name?.split(' ').pop() || 'Moore',
    '#email': c.email || 'patrick.james.moore@protonmail.com',
    '#phone': c.phone || '303-514-3586',
  };

  for (const [sel, val] of Object.entries(basicFields)) {
    const field = await frame.$(sel);
    if (field) {
      await field.fill(val);
      console.log(`  ✅ ${sel}: ${val}`);
    }
  }

  // ── Country — text input with autocomplete (not React-Select) ──
  await safeField(frame, async () => {
    const countryInput = await frame.$('#country');
    if (countryInput) {
      await frame.evaluate(() => {
        const el = document.querySelector('#country');
        if (el) el.scrollIntoView({ block: 'center' });
      });
      await frame.waitForTimeout(300);
      await countryInput.evaluate(el => el.focus());
      await countryInput.fill('');
      await countryInput.type('United States', { delay: 50 });
      await frame.waitForTimeout(1000);
      // Click autocomplete suggestion if present
      const suggestion = await frame.$('[role="option"]:has-text("United States"), .autocomplete-results li, li:has-text("United States")');
      if (suggestion) {
        await suggestion.click({ force: true });
      } else {
        await countryInput.press('Enter');
      }
      console.log('  ✅ Country: United States');
    }
  }, 'Country');

  // ── Close any overlays (phone intl-tel-input etc.) ────────────
  await frame.evaluate(() => {
    document.querySelectorAll('.iti__country-list').forEach(dd => dd.style.display = 'none');
    document.querySelectorAll('[class*="select__menu"]').forEach(m => m.remove());
    document.body.click();
  });
  await frame.waitForTimeout(500);

  // ── Location (City) autocomplete ──────────────────────────────
  await safeField(frame, async () => {
    const locationField = await frame.$('#candidate-location');
    if (locationField) {
      await frame.evaluate(() => {
        const el = document.querySelector('#candidate-location');
        if (el) el.scrollIntoView({ block: 'center' });
      });
      await frame.waitForTimeout(300);
      await locationField.evaluate(el => el.focus());
      await locationField.fill('');
      await locationField.type('Denver, CO', { delay: 80 });
      await frame.waitForTimeout(1500);
      const locOption = await frame.$('.autocomplete-results li, [role="option"]:has-text("Denver")');
      if (locOption) {
        await locOption.click({ force: true });
        console.log('  ✅ Location: Denver, CO (autocomplete)');
      } else {
        console.log('  ✅ Location: Denver, CO (typed)');
      }
    }
  }, 'Location');

  // ── Resume upload ─────────────────────────────────────────────
  await safeField(frame, async () => {
    const resumeInput = await frame.$('#resume');
    if (resumeInput) {
      await resumeInput.setInputFiles(resolve(pdfPath));
      console.log(`  ✅ Resume uploaded: ${pdfPath}`);
      await frame.waitForTimeout(1000);
    }
  }, 'Resume');

  // ── Cover letter upload ───────────────────────────────────────
  await safeField(frame, async () => {
    const coverInput = await frame.$('#cover_letter');
    if (coverInput && coverLetterPath && existsSync(coverLetterPath)) {
      await coverInput.setInputFiles(resolve(coverLetterPath));
      console.log('  ✅ Cover letter uploaded');
    }
  }, 'Cover letter');

  // ── Stripe-specific dropdown questions (React-Select) ────────

  // Country of residence (Stripe uses "US" not "United States" in this dropdown)
  await safeField(frame, () => ghSelectDropdown(frame, '#question_65731084', 'US'), 'Country of residence');

  // Eligible to work: check "US" checkbox
  await safeField(frame, async () => {
    const usCheckbox = await frame.$('input[id*="question_65731085"][id*="712517093"]');
    if (usCheckbox) {
      await frame.evaluate(() => {
        const el = document.querySelector('input[id*="question_65731085"][id*="712517093"]');
        if (el) el.scrollIntoView({ block: 'center' });
      });
      await frame.waitForTimeout(300);
      const checked = await usCheckbox.isChecked();
      if (!checked) await usCheckbox.check({ force: true });
      console.log('  ✅ Eligible to work: US (checked)');
    }
  }, 'Work eligibility');

  // Work authorization → Yes
  await safeField(frame, () => ghSelectDropdown(frame, '#question_65731086', 'Yes'), 'Work authorization');

  // Sponsorship → No
  await safeField(frame, () => ghSelectDropdown(frame, '#question_65731087', 'No'), 'Sponsorship');

  // Remote work → Yes
  await safeField(frame, () => ghSelectDropdown(frame, '#question_65731088', 'Yes'), 'Remote work');

  // Previously employed at Stripe → No
  await safeField(frame, () => ghSelectDropdown(frame, '#question_65731089', 'No'), 'Previously at Stripe');

  // Text fields
  await safeField(frame, async () => {
    await ghFillText(frame, '#question_65731090', 'Viecure', 'Current employer');
    await ghFillText(frame, '#question_65731091', 'Security & Reliability Engineer', 'Job title');
    await ghFillText(frame, '#question_65731092', c.education_school || 'University of Denver', 'School');
    await ghFillText(frame, '#question_65731093', c.education_degree || 'Computer Science', 'Degree');
    await ghFillText(frame, '#question_66034237', 'Denver, Colorado', 'US city/state');
  }, 'Text questions');

  // WhatsApp opt-in → No
  await safeField(frame, () => ghSelectDropdown(frame, '#question_65731094', 'No'), 'WhatsApp opt-in');

  // Skip voluntary self-identification
  console.log('  ⏭️  Skipping voluntary self-identification (optional)');
}

// ── Helper: safely fill a text field in Greenhouse ─────────────

async function ghFillText(frame, selector, value, label) {
  const field = await frame.$(selector);
  if (field) {
    await frame.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.scrollIntoView({ block: 'center' });
    }, selector);
    await frame.waitForTimeout(200);
    await field.evaluate(el => el.focus());
    await field.fill(value);
    console.log(`  ✅ ${label}: ${value}`);
  }
}

// ── Helper: wrap a field action in try/catch ───────────────────

async function safeField(frame, fn, label) {
  try {
    await fn();
  } catch (err) {
    console.log(`  ⚠️ ${label}: ${err.message.split('\n')[0]}`);
  }
}

// ── Helper: select a Greenhouse custom dropdown option ─────────

async function ghSelectDropdown(frame, inputSelector, optionText) {
  // Greenhouse uses React-Select for dropdown questions.
  // Raw DOM events (mousedown, click) don't reliably trigger React's event system.
  //
  // Strategy: keyboard-based interaction, which React-Select handles natively.
  //   1. Scroll the field into view
  //   2. Focus the React-Select's internal search input
  //   3. Press ArrowDown to open the menu (or Space)
  //   4. Clear any existing value, type the desired option text to filter
  //   5. Press Enter to select the first filtered match

  // Step 1: Scroll to the field
  const found = await frame.evaluate((sel) => {
    const input = document.querySelector(sel);
    if (!input) return false;
    // Walk up to find the field container
    let el = input;
    for (let i = 0; i < 10; i++) {
      el = el.parentElement;
      if (!el) break;
      if (el.classList.contains('field') || el.classList.contains('field-wrapper')) {
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        return true;
      }
    }
    input.scrollIntoView({ behavior: 'instant', block: 'center' });
    return true;
  }, inputSelector);

  if (!found) {
    console.log(`  ⚠️ ${inputSelector}: not found`);
    return false;
  }

  await frame.waitForTimeout(400);

  // Step 2: Close any open menus first
  await frame.evaluate(() => {
    document.body.click();
  });
  await frame.waitForTimeout(300);

  // Step 3: Focus the input and use keyboard to open + search + select
  // React-Select's search input might be the one with our selector ID,
  // or a sibling input with class select__input
  const inputHandle = await frame.$(inputSelector);
  if (!inputHandle) {
    console.log(`  ⚠️ ${inputSelector}: input element not found`);
    return false;
  }

  // Focus the input — try evaluate first (works even on hidden elements)
  await frame.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      el.focus();
      // Also try focusing the container to make React-Select aware
      const control = el.closest('[class*="select__control"]') ||
                      el.parentElement?.querySelector('[class*="select__control"]');
      if (control) {
        control.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      }
    }
  }, inputSelector);
  await frame.waitForTimeout(300);

  // Press ArrowDown or Space to open the dropdown menu
  await frame.press(inputSelector, 'ArrowDown');
  await frame.waitForTimeout(600);

  // Check if the menu opened (look for scoped options)
  const inputId = inputSelector.replace('#', '');
  let optionCount = await frame.evaluate((id) => {
    return document.querySelectorAll(`[id^="react-select-${id}-option"]`).length;
  }, inputId);

  if (optionCount === 0) {
    // Try clicking the dropdown indicator arrow
    await frame.evaluate((sel) => {
      const input = document.querySelector(sel);
      if (!input) return;
      let el = input;
      for (let i = 0; i < 10; i++) {
        el = el.parentElement;
        if (!el) return;
        const indicator = el.querySelector('[class*="indicatorContainer"], [class*="dropdown-indicator"]');
        if (indicator) {
          indicator.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          indicator.click();
          return;
        }
      }
    }, inputSelector);
    await frame.waitForTimeout(600);
    optionCount = await frame.evaluate((id) => {
      return document.querySelectorAll(`[id^="react-select-${id}-option"]`).length;
    }, inputId);
  }

  if (optionCount > 0) {
    // Menu is open. Type to filter (DON'T use fill() — it resets React-Select).
    // React-Select accepts keystrokes on the focused input for live filtering.
    await frame.type(inputSelector, optionText, { delay: 50 });
    await frame.waitForTimeout(700);

    // Check filtered results — find the best match
    const matchResult = await frame.evaluate(({ id, text }) => {
      const options = Array.from(document.querySelectorAll(`[id^="react-select-${id}-option"]`));
      if (options.length === 0) return { count: 0, first: null, exactIdx: -1 };

      // Look for exact or starts-with match
      const exactIdx = options.findIndex(o => {
        const t = o.textContent.trim();
        return t === text || t.startsWith(text);
      });

      return {
        count: options.length,
        first: options[0]?.textContent.trim(),
        exactIdx,
        exactText: exactIdx >= 0 ? options[exactIdx].textContent.trim() : null,
      };
    }, { id: inputId, text: optionText });

    if (matchResult.count > 0) {
      if (matchResult.exactIdx === 0) {
        // First option is our match — just press Enter
        await frame.press(inputSelector, 'Enter');
        await frame.waitForTimeout(300);
        console.log(`  ✅ ${inputSelector}: ${matchResult.exactText}`);
        return true;
      } else if (matchResult.exactIdx > 0) {
        // Need to ArrowDown to the right option
        for (let i = 0; i < matchResult.exactIdx; i++) {
          await frame.press(inputSelector, 'ArrowDown');
          await frame.waitForTimeout(100);
        }
        await frame.press(inputSelector, 'Enter');
        await frame.waitForTimeout(300);
        console.log(`  ✅ ${inputSelector}: ${matchResult.exactText}`);
        return true;
      } else {
        // No exact match — select first option as best guess
        await frame.press(inputSelector, 'Enter');
        await frame.waitForTimeout(300);
        console.log(`  ⚠️ ${inputSelector}: ${matchResult.first} (closest match for "${optionText}")`);
        return true;
      }
    }
  }

  // Fallback: try using tab/click to dismiss and accept whatever was typed
  try {
    await frame.press(inputSelector, 'Tab');
  } catch {}
  await frame.waitForTimeout(200);
  console.log(`  ⚠️ ${inputSelector}: ${optionText} (keyboard fallback, ${optionCount} options)`);
  return false;
}

// ── Generic form filler (best-effort) ───────────────────────────

async function fillGeneric(page, profile, pdfPath, coverLetter) {
  const c = profile.candidate || {};
  console.log('🔧 Platform: Generic (best-effort)');

  await page.waitForSelector('form, [role="form"], input[type="text"], input[type="email"]', { timeout: 15000 });

  // Find all inputs and match by label/placeholder/name
  const inputs = await page.$$('input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])');

  for (const input of inputs) {
    const label = await getFieldLabel(page, input);
    const placeholder = await input.getAttribute('placeholder') || '';
    const name = await input.getAttribute('name') || '';
    const type = await input.getAttribute('type') || 'text';
    const hint = `${label} ${placeholder} ${name}`.toLowerCase();

    if (type === 'file') {
      await input.setInputFiles(resolve(pdfPath));
      console.log(`  ✅ File uploaded: ${pdfPath}`);
      continue;
    }

    if (hint.includes('first') && hint.includes('name')) {
      await input.fill(c.full_name?.split(' ')[0] || 'Patrick');
      console.log(`  ✅ First name`);
    } else if (hint.includes('last') && hint.includes('name')) {
      await input.fill(c.full_name?.split(' ').pop() || 'Moore');
      console.log(`  ✅ Last name`);
    } else if (hint.includes('full') && hint.includes('name')) {
      await input.fill(c.full_name || 'Patrick Moore');
      console.log(`  ✅ Full name`);
    } else if (type === 'email' || hint.includes('email')) {
      await input.fill(c.email || 'patrick.james.moore@protonmail.com');
      console.log(`  ✅ Email`);
    } else if (type === 'tel' || hint.includes('phone')) {
      await input.fill(c.phone || '303-514-3586');
      console.log(`  ✅ Phone`);
    } else if (hint.includes('linkedin')) {
      await input.fill(`https://${c.linkedin}`);
      console.log(`  ✅ LinkedIn`);
    } else if (hint.includes('github')) {
      await input.fill(`https://${c.github}`);
      console.log(`  ✅ GitHub`);
    } else if (hint.includes('website') || hint.includes('portfolio') || hint.includes('url')) {
      await input.fill(c.portfolio_url || 'https://moorelab.cloud');
      console.log(`  ✅ Website/Portfolio`);
    } else if (hint.includes('location') || hint.includes('city')) {
      await input.fill(c.location || 'Denver, CO');
      console.log(`  ✅ Location`);
    }
  }

  // Cover letter in textarea
  if (coverLetter) {
    const textareas = await page.$$('textarea');
    for (const ta of textareas) {
      const label = await getFieldLabel(page, ta);
      if (label.toLowerCase().includes('cover') || label.toLowerCase().includes('additional') || label.toLowerCase().includes('why')) {
        await ta.fill(coverLetter);
        console.log(`  ✅ Cover letter filled`);
        break;
      }
    }
  }
}

// ── Utility: get label text for a form field ────────────────────

async function getFieldLabel(page, element) {
  try {
    // Try aria-label
    const ariaLabel = await element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // Try associated <label> via id
    const id = await element.getAttribute('id');
    if (id) {
      const label = await page.$(`label[for="${id}"]`);
      if (label) return (await label.textContent()) || '';
    }

    // Try parent label
    const parentLabel = await element.evaluate(el => {
      const label = el.closest('label');
      return label ? label.textContent : '';
    });
    if (parentLabel) return parentLabel;

    // Try preceding sibling or nearby text
    const nearbyText = await element.evaluate(el => {
      const prev = el.previousElementSibling;
      if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'DIV')) {
        return prev.textContent;
      }
      const parent = el.parentElement;
      if (parent) {
        const label = parent.querySelector('label, .label, [class*="label"]');
        if (label) return label.textContent;
      }
      return '';
    });
    return nearbyText || '';
  } catch {
    return '';
  }
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 apply-auto.mjs — Server-side application automation');
  console.log(`📍 URL: ${url}`);
  console.log(`📄 PDF: ${pdfPath}`);
  console.log(`📝 Cover letter: ${coverLetterPath || 'none'}`);
  console.log(`🔒 Submit: ${shouldSubmit ? 'YES' : 'NO (review only)'}`);
  console.log('');

  const profile = await loadProfile();
  const coverLetter = await loadCoverLetter(coverLetterPath);
  const platform = detectPlatform(url);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const contextOptions = {
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  // Load saved auth state (cookies/localStorage from browser-login.mjs)
  if (authStatePath && existsSync(authStatePath)) {
    contextOptions.storageState = authStatePath;
    console.log(`🔑 Auth state loaded: ${authStatePath}`);
  }

  const context = await browser.newContext(contextOptions);

  const page = await context.newPage();

  try {
    console.log(`🌐 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    console.log(`✅ Page loaded: ${await page.title()}`);
    console.log('');

    // Some sites show JD first with an "Apply" button. Click it if no form is visible.
    const hasForm = await page.$('form');
    if (!hasForm) {
      console.log('📋 No form found on page — looking for Apply button...');
      const applyBtn = await page.$('a:has-text("Apply"), button:has-text("Apply"), a[href*="application"], a[href*="apply"]');
      if (applyBtn) {
        const href = await applyBtn.getAttribute('href');
        if (href && (href.startsWith('http') || href.startsWith('/'))) {
          // It's a link — navigate to it
          const applyUrl = href.startsWith('http') ? href : new URL(href, url).toString();
          console.log(`  🔗 Found apply link: ${applyUrl}`);
          await page.goto(applyUrl, { waitUntil: 'networkidle', timeout: 30000 });
        } else {
          // It's a button — click it
          console.log('  🖱️ Clicking Apply button...');
          await applyBtn.click();
          await page.waitForTimeout(3000);
        }
        console.log(`  ✅ Now on: ${await page.title()}`);
        // Re-detect platform after navigation
        const newUrl = page.url();
        const newPlatform = detectPlatform(newUrl);
        if (newPlatform !== platform) {
          console.log(`  🔄 Platform changed: ${platform} → ${newPlatform}`);
        }
      } else {
        console.log('  ⚠️ No Apply button found either. Taking screenshot for manual review.');
      }
    }

    // Fill based on platform (re-detect from current URL)
    const currentPlatform = detectPlatform(page.url());
    // Wait for form to appear after potential navigation
    try {
      await page.waitForSelector('form, [role="form"], input[type="text"], input[type="email"]', { timeout: 10000 });
    } catch {
      console.log('  ⚠️ No form elements found after navigation.');
    }

    switch (currentPlatform) {
      case 'ashby':
        await fillAshby(page, profile, pdfPath, coverLetter);
        break;
      case 'greenhouse':
        await fillGreenhouse(page, profile, pdfPath, coverLetter);
        break;
      case 'stripe':
        await fillStripe(page, profile, pdfPath, coverLetter);
        break;
      case 'lever':
      case 'generic':
      default:
        await fillGeneric(page, profile, pdfPath, coverLetter);
        break;
    }

    // Take screenshot for review
    const ssPath = resolve(__dirname, screenshotPath);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log('');
    console.log(`📸 Screenshot saved: ${ssPath}`);

    // Submit if flagged
    if (shouldSubmit) {
      console.log('');
      console.log('⚠️  Submitting application...');

      // For Stripe/iframe forms, search for the submit button in iframes too
      let submitBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Apply")');

      // Check iframes if not found on main page
      if (!submitBtn) {
        for (const frame of page.frames()) {
          submitBtn = await frame.$('button[type="submit"], input[type="submit"], button:has-text("Submit Application"), button:has-text("Submit"), button:has-text("Apply")');
          if (submitBtn) {
            // Scroll submit button into view
            await frame.evaluate(() => {
              const btn = document.querySelector('button[type="submit"], input[type="submit"]');
              if (btn) btn.scrollIntoView({ block: 'center' });
            });
            await frame.waitForTimeout(500);
            break;
          }
        }
      }

      if (submitBtn) {
        await submitBtn.click({ force: true });
        await page.waitForTimeout(5000);
        const confirmSS = ssPath.replace('.png', '-confirmed.png');
        await page.screenshot({ path: confirmSS, fullPage: true });
        console.log(`✅ Application submitted!`);
        console.log(`📸 Confirmation screenshot: ${confirmSS}`);
      } else {
        console.log('❌ Could not find submit button');
      }
    } else {
      console.log('');
      console.log('⏸️  Form filled but NOT submitted. Review the screenshot.');
      console.log('   Re-run with --submit to submit, or apply manually.');
    }

  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    // Take error screenshot
    try {
      await page.screenshot({ path: resolve(__dirname, 'output/apply-error.png'), fullPage: true });
      console.log('📸 Error screenshot saved to output/apply-error.png');
    } catch {}
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
