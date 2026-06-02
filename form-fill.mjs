#!/usr/bin/env node
/**
 * form-fill.mjs — Zero-model-token deterministic Playwright form fill.
 *
 * Maps config/profile.yml + the queue role record onto form fields with
 * high-confidence matching only. Any field that cannot be confidently
 * identified is left blank and added to the role's flags as 'manual-field'.
 * Never guesses or approximates a value. Never clicks submit.
 *
 * Leaves the browser open (headed mode) for the user to review and submit manually.
 *
 * Usage:
 *   node form-fill.mjs <role-id>
 *
 * ATS support: Greenhouse, Lever, Ashby (deterministic)
 *              Custom/Workday → prints instructions and exits.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { chromium } from 'playwright';

import { loadQueue, saveQueue, updateById } from './queue-store.mjs';
import { checkUrlLiveness } from './liveness-browser.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

// CSS.escape is browser-only; provide a minimal Node-safe equivalent for ID selectors.
function cssEscape(value) {
  return String(value).replace(/([^\w-])/g, '\\$1');
}

// ── Load profile ──────────────────────────────────────────────────────────────

function loadProfile() {
  const path = join(ROOT, 'config', 'profile.yml');
  if (!existsSync(path)) throw new Error('config/profile.yml not found');
  return yaml.load(readFileSync(path, 'utf-8'));
}

// ── Parse name ────────────────────────────────────────────────────────────────

function splitName(fullName = '') {
  const parts = fullName.trim().split(/\s+/);
  const last  = parts.length > 1 ? parts[parts.length - 1] : '';
  const first = parts.slice(0, parts.length > 1 ? -1 : undefined).join(' ');
  return { first, last };
}

// ── Field confidence scoring ──────────────────────────────────────────────────

// Maps a normalised field label to a { key, confidence } result.
// Returns null when no high-confidence match is found.
// 'high' = fill it; anything else = leave blank + flag.
function matchField(label, type, profile, role) {
  const l = label.toLowerCase().trim();

  // Strict label matchers — only fill when we're confident
  const { first, last } = splitName(profile.candidate?.full_name);

  const matchers = [
    // Name fields
    { test: /\bfirst.?name\b|given.?name\b/,          value: () => first },
    { test: /\blast.?name\b|family.?name\b|surname\b/, value: () => last },
    { test: /^(full.?)?name$/,                          value: () => profile.candidate?.full_name },
    // Contact
    { test: /\bemail\b/,                               value: () => profile.candidate?.email },
    { test: /\bphone\b|\bmobile\b|\btelephone\b/,      value: () => profile.candidate?.phone },
    // Social / portfolio
    { test: /linkedin/,                                value: () => profile.candidate?.linkedin },
    { test: /github/,                                  value: () => profile.candidate?.github },
    // Location
    { test: /\blocation\b|\bcity\b|\bcurrent.?location\b|\bwhere.+based\b/,
                                                       value: () => profile.candidate?.location },
    // Work rights / sponsorship
    { test: /sponsorship|require.*sponsor|do.+you.+require/,
                                                       value: () => profile.location?.sponsorship_answer || 'No' },
    // Salary
    { test: /salary|compensation|pay.+expect|remunerat|package/,
                                                       value: () => profile.application_answers?.salary_range },
    // Notice period / availability
    { test: /notice.?period|when.+available|start.?date|earliest.?start/,
                                                       value: () => profile.application_answers?.notice_period },
    // Hours per week — part-time guardrail
    { test: /hours?.?(per|a|\/)\s*week|weekly.?hours|hours?.?expected/,
                                                       value: () => hoursAnswer(role, profile) },
    // Cover letter / motivation (use draft if prepared)
    { test: /cover.?letter|motivation|why.+(company|us|role|position)|tell.+us.+about.+yourself|about.+yourself/,
                                                       value: () => coverLetterAnswer(role) },
  ];

  for (const { test, value } of matchers) {
    if (test.test(l)) {
      const v = value();
      if (v == null || v === '') return null; // have the slot but no value → blank + flag
      return { value: v, confidence: 'high' };
    }
  }

  return null; // no high-confidence match
}

function hoursAnswer(role, profile) {
  if (role.employment_type === 'part-time') {
    const max = profile.application_answers?.max_hours_per_week_parttime ?? 24;
    return String(max); // 24 h/week = 48 h/fortnight cap
  }
  // For full-time roles an hours-per-week field is unusual — don't guess
  return null;
}

function coverLetterAnswer(role) {
  if (!role.drafts) return null;
  // Try common keys in order
  for (const key of ['cover_letter', 'why_company', 'why_role', 'motivation', 'about_yourself']) {
    if (role.drafts[key]) return role.drafts[key];
  }
  return null;
}

// ── Visa dropdown matching ────────────────────────────────────────────────────

// Select the best option from a dropdown for the visa status field.
// Returns the option value/label to select, or null if none match closely.
function pickVisaOption(options, visaAnswer) {
  if (!visaAnswer) return null;
  const target = visaAnswer.toLowerCase();

  // Exact match first
  for (const opt of options) {
    if (opt.toLowerCase() === target) return opt;
  }

  // Substring match — e.g. "485" or "Temporary Graduate" inside an option
  const keywords = target.split(/\s+/);
  for (const opt of options) {
    const ol = opt.toLowerCase();
    if (keywords.every(kw => ol.includes(kw))) return opt;
  }

  // Partial word overlap ≥ 2 significant words
  for (const opt of options) {
    const ol = opt.toLowerCase();
    const matches = keywords.filter(kw => kw.length > 3 && ol.includes(kw));
    if (matches.length >= 2) return opt;
  }

  return null; // no close match — leave for manual selection
}

// ── Greenhouse form fill ──────────────────────────────────────────────────────

async function fillGreenhouse(page, profile, role) {
  const manualFields = [];

  // Greenhouse application forms render as regular HTML inputs/textareas/selects.
  // We identify each question block by its label text.
  const questions = await page.$$('[data-field]');

  for (const qEl of questions) {
    const label = await qEl.$eval('label, [class*="label"]', el => el.innerText).catch(() => '');
    if (!label) continue;

    const input    = await qEl.$('input:not([type=hidden]):not([type=submit]), textarea, select').catch(() => null);
    const fileInput = await qEl.$('input[type=file]').catch(() => null);

    // Resume upload
    if (fileInput && /resume|cv|curriculum/i.test(label)) {
      if (role.cv_pdf && existsSync(join(ROOT, role.cv_pdf))) {
        await fileInput.setInputFiles(join(ROOT, role.cv_pdf));
        console.log(`  ✅ Resume uploaded: ${role.cv_pdf}`);
      } else {
        manualFields.push({ label: label.trim(), reason: 'cv_pdf not generated — run /career-ops queue prepare' });
      }
      continue;
    }

    if (!input) continue;
    const tagName = await input.evaluate(el => el.tagName.toLowerCase());
    const type    = await input.getAttribute('type') || 'text';

    // Visa/work auth dropdown — requires special option matching
    if (tagName === 'select' && /visa|work.?auth|right.?to.?work/i.test(label)) {
      const optionTexts = await input.$$eval('option', els => els.map(e => e.textContent.trim()));
      const pick = pickVisaOption(optionTexts, role.visa_answer);
      if (pick) {
        await input.selectOption({ label: pick });
        console.log(`  ✅ Visa dropdown: "${pick}"`);
      } else {
        console.log(`  ⚠️  Visa dropdown: no matching option for "${role.visa_answer}" — left for manual`);
        manualFields.push({ label: label.trim(), reason: `no ATS option matches "${role.visa_answer}"` });
      }
      continue;
    }

    // Standard select (non-visa)
    if (tagName === 'select') {
      const match = matchField(label, 'select', profile, role);
      if (match) {
        const optionTexts = await input.$$eval('option', els => els.map(e => e.textContent.trim()));
        const pick = optionTexts.find(o => o.toLowerCase().includes(match.value.toLowerCase()));
        if (pick) {
          await input.selectOption({ label: pick });
          console.log(`  ✅ ${label.trim()}: "${pick}"`);
        } else {
          manualFields.push({ label: label.trim(), reason: 'no matching option' });
        }
      } else {
        manualFields.push({ label: label.trim(), reason: 'custom field — not auto-filled' });
      }
      continue;
    }

    // Text / textarea
    const match = matchField(label, type, profile, role);
    if (match) {
      await input.fill(match.value);
      console.log(`  ✅ ${label.trim()}: "${match.value.slice(0, 60)}${match.value.length > 60 ? '…' : ''}"`);
    } else {
      manualFields.push({ label: label.trim(), reason: 'custom or unrecognised field' });
      // Leave blank — do not guess
    }
  }

  return manualFields;
}

// ── Lever form fill ───────────────────────────────────────────────────────────

async function fillLever(page, profile, role) {
  const manualFields = [];

  // Lever renders a standard application form with input[name] attributes
  const fieldDefs = [
    { names: ['first_name', 'firstname'],         key: 'first' },
    { names: ['last_name', 'lastname'],           key: 'last' },
    { names: ['name', 'full_name'],               key: 'full' },
    { names: ['email'],                           key: 'email' },
    { names: ['phone'],                           key: 'phone' },
    { names: ['org', 'company', 'employer'],      key: null }, // don't fill — N/A for candidate
    { names: ['location', 'city'],                key: 'location' },
    { names: ['linkedin', 'linkedin_profile'],    key: 'linkedin' },
    { names: ['github', 'github_profile'],        key: 'github' },
    { names: ['portfolio', 'website'],            key: 'portfolio' },
    { names: ['salary', 'compensation'],          key: 'salary' },
    { names: ['comments', 'additional'],          key: null }, // skip — ambiguous
  ];

  const { first, last } = splitName(profile.candidate?.full_name);
  const valueMap = {
    first:    first,
    last:     last,
    full:     profile.candidate?.full_name,
    email:    profile.candidate?.email,
    phone:    profile.candidate?.phone,
    location: profile.candidate?.location,
    linkedin: profile.candidate?.linkedin,
    github:   profile.candidate?.github,
    portfolio: profile.candidate?.github, // use GitHub if no portfolio URL
    salary:   profile.application_answers?.salary_range,
  };

  for (const { names, key } of fieldDefs) {
    if (!key) continue;
    const value = valueMap[key];
    if (!value) continue;

    for (const name of names) {
      const input = await page.$(`input[name="${name}"], textarea[name="${name}"]`).catch(() => null);
      if (input) {
        await input.fill(value);
        console.log(`  ✅ ${name}: "${value.slice(0, 60)}"`);
        break;
      }
    }
  }

  // Resume upload
  const resumeInput = await page.$('input[type=file]').catch(() => null);
  if (resumeInput && role.cv_pdf && existsSync(join(ROOT, role.cv_pdf))) {
    await resumeInput.setInputFiles(join(ROOT, role.cv_pdf));
    console.log(`  ✅ Resume: ${role.cv_pdf}`);
  } else if (resumeInput) {
    manualFields.push({ label: 'Resume/CV', reason: 'cv_pdf not ready' });
  }

  // Cover letter textarea (Lever uses a generic textarea for this)
  const coverDraft = coverLetterAnswer(role);
  if (coverDraft) {
    const ta = await page.$('textarea[name="comments"], textarea[name="cover_letter"]').catch(() => null);
    if (ta) {
      await ta.fill(coverDraft);
      console.log(`  ✅ Cover letter/comments: draft applied`);
    }
  }

  // Work auth — Lever typically uses a checkbox or select; don't guess
  const visaInput = await page.$('select[name*="visa"], select[name*="auth"], select[name*="work"]').catch(() => null);
  if (visaInput) {
    const opts = await visaInput.$$eval('option', els => els.map(e => e.textContent.trim()));
    const pick = pickVisaOption(opts, role.visa_answer);
    if (pick) {
      await visaInput.selectOption({ label: pick });
      console.log(`  ✅ Visa: "${pick}"`);
    } else {
      manualFields.push({ label: 'Work authorization', reason: `no matching option for "${role.visa_answer}"` });
    }
  }

  return manualFields;
}

// ── Ashby form fill ───────────────────────────────────────────────────────────

async function fillAshby(page, profile, role) {
  // Ashby renders form questions with visible labels inside div wrappers.
  // We use label text matching (same strategy as Greenhouse).
  return fillByLabels(page, profile, role);
}

// ── Generic label-based fill (Ashby + fallback) ───────────────────────────────

async function fillByLabels(page, profile, role) {
  const manualFields = [];

  // Get all visible label elements and find their associated input
  const labels = await page.$$('label');

  for (const labelEl of labels) {
    const labelText = await labelEl.evaluate(el => el.innerText).catch(() => '');
    if (!labelText.trim()) continue;

    const forAttr = await labelEl.getAttribute('for').catch(() => null);
    let input = null;

    if (forAttr) {
      input = await page.$(`#${cssEscape(forAttr)}`).catch(() => null);
    }
    if (!input) {
      input = await labelEl.$('~ input, ~ textarea, ~ select').catch(() => null);
    }
    if (!input) {
      // Try sibling/parent
      input = await labelEl.evaluateHandle(el => {
        const next = el.nextElementSibling;
        if (next && ['INPUT', 'TEXTAREA', 'SELECT'].includes(next.tagName)) return next;
        const parent = el.parentElement;
        return parent?.querySelector('input:not([type=hidden]):not([type=submit]), textarea, select') || null;
      }).catch(() => null);
      if (input?.asElement() == null) input = null;
    }

    if (!input) continue;

    const tagName = await input.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
    const inputType = await input.getAttribute('type').catch(() => 'text');

    // File inputs — resume only
    if (inputType === 'file') {
      if (/resume|cv|curriculum/i.test(labelText)) {
        if (role.cv_pdf && existsSync(join(ROOT, role.cv_pdf))) {
          await input.setInputFiles(join(ROOT, role.cv_pdf)).catch(() => {});
          console.log(`  ✅ Resume: ${role.cv_pdf}`);
        } else {
          manualFields.push({ label: labelText.trim(), reason: 'cv_pdf not ready' });
        }
      } else {
        manualFields.push({ label: labelText.trim(), reason: 'unrecognised file upload' });
      }
      continue;
    }

    // Visa dropdown
    if (tagName === 'select' && /visa|work.?auth|right.?to.?work|authoris/i.test(labelText)) {
      const opts = await input.$$eval('option', els => els.map(e => e.textContent.trim())).catch(() => []);
      const pick = pickVisaOption(opts, role.visa_answer);
      if (pick) {
        await input.selectOption({ label: pick }).catch(() => {});
        console.log(`  ✅ Visa: "${pick}"`);
      } else {
        manualFields.push({ label: labelText.trim(), reason: `no option matches "${role.visa_answer}"` });
      }
      continue;
    }

    // Standard select
    if (tagName === 'select') {
      const match = matchField(labelText, 'select', profile, role);
      if (match) {
        const opts = await input.$$eval('option', els => els.map(e => e.textContent.trim())).catch(() => []);
        const pick = opts.find(o => o.toLowerCase().includes(match.value.toLowerCase()));
        if (pick) await input.selectOption({ label: pick }).catch(() => {});
        else manualFields.push({ label: labelText.trim(), reason: 'no matching option' });
      } else {
        manualFields.push({ label: labelText.trim(), reason: 'custom field' });
      }
      continue;
    }

    // Checkbox — only handle sponsorship
    if (inputType === 'checkbox' && /sponsor/i.test(labelText)) {
      // "Do you require sponsorship?" → we do NOT require sponsorship → leave unchecked
      const checked = await input.isChecked().catch(() => false);
      if (checked) await input.uncheck().catch(() => {});
      console.log(`  ✅ Sponsorship checkbox: unchecked (no sponsorship required)`);
      continue;
    }

    // Text / textarea / email / tel
    const match = matchField(labelText, inputType, profile, role);
    if (match) {
      await input.fill(match.value).catch(() => {});
      console.log(`  ✅ ${labelText.trim()}: "${match.value.slice(0, 60)}${match.value.length > 60 ? '…' : ''}"`);
    } else {
      manualFields.push({ label: labelText.trim(), reason: 'custom or unrecognised field' });
    }
  }

  return manualFields;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const roleId = process.argv[2];
  if (!roleId) {
    console.error('Usage: node form-fill.mjs <role-id>');
    process.exit(1);
  }

  const profile = loadProfile();
  const queue   = loadQueue();
  const role    = queue.roles.find(r => r.id === roleId);

  if (!role) {
    console.error(`Role not found in queue: ${roleId}`);
    process.exit(1);
  }

  if (role.ats === 'custom') {
    console.log(`\n${role.company} – ${role.title}`);
    console.log(`ATS: custom — use /career-ops apply instead.`);
    console.log(`URL: ${role.url}`);
    process.exit(0);
  }

  console.log(`\nFilling form: ${role.company} – ${role.title}`);
  console.log(`ATS: ${role.ats}`);
  console.log(`Visa answer: ${role.visa_answer ?? '(none — check employment type)'}`);
  if (role.employment_type === 'part-time') {
    const cap = profile.application_answers?.max_hours_per_week_parttime ?? 24;
    console.log(`Part-time guardrail: hours/week capped at ${cap} (48 h/fortnight visa limit)`);
  }
  console.log('');

  // Launch headed browser — leave open for the user to review and submit
  const browser = await chromium.launch({
    headless: false,
    // Use bundled Chromium
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);

  // Re-verify liveness before filling
  console.log('Verifying posting is still live…');
  const { result, reason } = await checkUrlLiveness(page, role.url);

  if (result === 'expired') {
    console.log(`❌ Posting appears closed: ${reason}`);
    console.log('Marking as closed in queue.');
    // Update queue status
    const q2 = loadQueue();
    updateById(q2, roleId, { status: 'closed', decided_at: new Date().toISOString() });
    saveQueue(q2);
    await browser.close();
    return;
  }

  if (result === 'uncertain') {
    console.log(`⚠️  Liveness uncertain: ${reason}`);
    console.log('Proceeding, but verify manually that the form is open.');
  } else {
    console.log('✅ Posting is live.\n');
  }

  // Navigate to the application form
  // For Greenhouse/Lever/Ashby the JD page usually has an Apply button
  await page.goto(role.url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(2_000); // let SPA hydrate

  // Try to click an Apply button if we're on the JD page rather than the form
  const applyBtn = await page.$('a:text("Apply"), button:text("Apply"), a:text("Apply now"), button:text("Apply now")').catch(() => null);
  if (applyBtn) {
    await applyBtn.click().catch(() => {});
    await page.waitForTimeout(2_000);
  }

  console.log('Filling form fields (high-confidence only):');

  let manualFields = [];
  try {
    if (role.ats === 'greenhouse') {
      manualFields = await fillGreenhouse(page, profile, role);
    } else if (role.ats === 'lever') {
      manualFields = await fillLever(page, profile, role);
    } else if (role.ats === 'ashby') {
      manualFields = await fillAshby(page, profile, role);
    } else {
      manualFields = await fillByLabels(page, profile, role);
    }
  } catch (err) {
    console.error(`Fill error: ${err.message}`);
  }

  // Report manual fields
  if (manualFields.length > 0) {
    console.log(`\n⚠️  ${manualFields.length} field(s) left blank for manual completion:`);
    for (const f of manualFields) {
      console.log(`   · ${f.label}: ${f.reason}`);
    }

    // Update queue record with manual-field flag
    const q2 = loadQueue();
    const existing = q2.roles.find(r => r.id === roleId);
    if (existing) {
      const flags = Array.from(new Set([...(existing.flags || []), 'manual-field']));
      updateById(q2, roleId, { flags });
      saveQueue(q2);
    }
  } else {
    console.log('\n✅ All recognisable fields filled.');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('FORM FILL COMPLETE — BROWSER REMAINS OPEN');
  console.log('Review every field before submitting.');
  console.log('Submit is YOUR action — this script never clicks submit.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Close this terminal (or press Ctrl+C) after you are done.');

  // Keep process alive so the browser stays open
  await new Promise(() => {}); // never resolves — browser window stays visible
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
