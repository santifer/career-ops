#!/usr/bin/env node
/**
 * form-fill.mjs — Deterministic Playwright form fill with login, multi-page,
 * and confirmation-capture support.
 *
 * Applies the results of the three-layer resolver (queue-resolve.mjs) to a live
 * application form.  Covers Greenhouse, Lever, and Ashby deterministically.
 * Custom/Workday portals are routed to the agent apply path.
 *
 * CAPABILITIES (all additive — manual submit gate stays absolute):
 *   • Persistent browser context per portal host (sessions/cookies survive runs).
 *   • Login-wall detection + deterministic polling loop (script-owned, not agent).
 *   • Auto account creation: fills real PII + unique generated password → clicks
 *     Register → polls until post-login form appears (user resolves email-verify,
 *     CAPTCHA, OTP during the wait).
 *   • Multi-page form navigation: clicks Continue/Next/Save-and-continue; stops
 *     at a review/confirmation summary page or on timeout.
 *   • Denylist: Submit / Submit application / Send application / Confirm and submit
 *     are NEVER clicked under any circumstance.
 *   • EEO/diversity, salary-unit, references, and knockout field rules.
 *   • AU date (DD/MM/YYYY) and phone (+61) formatting.
 *   • Upload verification after setInputFiles.
 *   • Already-applied and role-closed detection → clean skip.
 *   • Confirmation capture: after user submits, polls for confirmation page →
 *     screenshots and extracts reference number into tracker.
 *   • --headless flag for bounded-parallel pre-flight fills from the dashboard.
 *
 * HARD CONSTRAINT (never relaxed):
 *   The FINAL_SUBMIT_DENYLIST buttons are never located or clicked.
 *   The real stop signal is a review/confirmation summary page (entered data
 *   shown, no further editable input fields), whatever its button is labelled.
 *
 * Usage:
 *   node form-fill.mjs <role-id> [--headless]
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import yaml from 'js-yaml';
import { chromium } from 'playwright';

import { loadQueue, saveQueue, updateById, setStatus } from './queue-store.mjs';
import { checkUrlLiveness } from './liveness-browser.mjs';
import {
  matchProfileRule, normLabel, looksLikeVisaSelect, pickVisaOption,
  chooseOptionDeterministic, matchEeoOption, resolveSalaryNumber, detectKnockout,
} from './field-rules.mjs';
import {
  classifyLoginState, classifyConfirmation, CONFIRMATION_NUM_RE,
} from './login-core.mjs';
import { getOrCreateCredentials } from './credentials-store.mjs';
import { formatDate, formatPhone, isDateField, isPhoneField } from './format-au.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

// ── CLI flags ─────────────────────────────────────────────────────────────────

const ROLE_ID   = process.argv[2];
const HEADLESS  = process.argv.includes('--headless');

// ── Selectors / regexes ───────────────────────────────────────────────────────

const RESUME_RE  = /resume|cv\b|curriculum|attach/i;
const COVER_RE   = /cover.?letter/i;
const KSC_RE     = /key.+selection|selection.+criteria|address.+criteria|ksc/i;

// Multi-page nav: buttons we MAY click to advance
const NAV_ALLOWLIST = /^(continue|next|save and continue|save & continue|review|proceed|next step|next page)$/i;

// Final submit: buttons we NEVER click
const FINAL_SUBMIT_DENYLIST = /^(submit|submit application|send application|confirm and submit|submit my application|apply now|submit now)$/i;

// ── Profile loader ─────────────────────────────────────────────────────────────

function loadProfile() {
  const path = join(ROOT, 'config', 'profile.yml');
  if (!existsSync(path)) throw new Error('config/profile.yml not found');
  // js-yaml v4: yaml.load() uses DEFAULT_SAFE_SCHEMA — no arbitrary constructors.
  return yaml.load(readFileSync(path, 'utf-8'));
}

// ── CSS escape (Node-safe) ────────────────────────────────────────────────────

function cssEscape(value) {
  return String(value).replace(/([^\w-])/g, '\\$1');
}

// ── Browser context management ────────────────────────────────────────────────

/**
 * Return a persistent browser context keyed by portal host.
 * Sessions (cookies, local storage) survive across runs.
 */
async function getContext(url, headless) {
  let host = 'generic';
  try { host = new URL(url).hostname.replace(/\./g, '-'); } catch {}

  const profilesDir  = join(ROOT, '.browser-profiles');
  const userDataDir  = join(profilesDir, host);
  mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    viewport: headless ? { width: 1280, height: 900 } : null,
    args: headless ? ['--no-sandbox'] : [],
  });

  return context;
}

// ── Login-state snapshot ───────────────────────────────────────────────────────

async function snapshotLoginState(page) {
  const bodyText = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');

  const formLabels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('label'))
      .map((el) => el.innerText?.trim())
      .filter(Boolean)
  ).catch(() => []);

  const buttons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, a[role=button], input[type=submit]'))
      .map((el) => (el.innerText || el.value || el.getAttribute('aria-label') || '').trim())
      .filter(Boolean)
  ).catch(() => []);

  const editableInputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll(
      'input:not([type=hidden]):not([type=submit]):not([type=button]):not([disabled]):not([readonly]),' +
      'textarea:not([disabled]):not([readonly]),' +
      'select:not([disabled])'
    )).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }).length
  ).catch(() => 0);

  const textareas = await page.evaluate(() =>
    Array.from(document.querySelectorAll('textarea:not([disabled]):not([readonly])'))
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length
  ).catch(() => 0);

  return classifyLoginState({
    bodyText,
    formLabels,
    buttons,
    inputCount:    editableInputs,
    textareaCount: textareas,
  });
}

// ── Account registration fill ─────────────────────────────────────────────────

async function fillRegistrationForm(page, profile, host) {
  const c   = profile.candidate ?? {};
  const fmt = profile.formatting ?? {};

  const { email, password, isNew } = getOrCreateCredentials(host);
  if (isNew) {
    console.log(`  📧 Creating new account: ${email} (password saved to data/portal-credentials.json)`);
  } else {
    console.log(`  🔑 Reusing stored credentials for ${host}`);
  }

  // Fill standard registration fields by label
  const labels = await page.$$('label').catch(() => []);
  for (const labelEl of labels) {
    const text = (await labelEl.evaluate((el) => el.innerText).catch(() => '')).trim();
    if (!text) continue;

    const forAttr = await labelEl.getAttribute('for').catch(() => null);
    let input = null;
    if (forAttr) input = await page.$(`#${cssEscape(forAttr)}`).catch(() => null);
    if (!input)  input = await labelEl.$('~ input, ~ textarea').catch(() => null);
    if (!input)  continue;

    const itype = (await input.getAttribute('type').catch(() => 'text')) || 'text';
    if (itype === 'hidden' || itype === 'submit' || itype === 'button') continue;

    const l = text.toLowerCase();
    let value = null;

    if (/\bpassword\b/.test(l) && !/confirm|repeat/.test(l)) {
      value = password;
    } else if (/confirm.+password|password.+confirm|repeat.+password/.test(l)) {
      value = password;
    } else if (/first.?name|given.?name/.test(l)) {
      const parts = (c.full_name || '').trim().split(/\s+/);
      value = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '';
    } else if (/last.?name|family.?name|surname/.test(l)) {
      const parts = (c.full_name || '').trim().split(/\s+/);
      value = parts.length > 1 ? parts[parts.length - 1] : '';
    } else if (/^(full.?)?name\*?$/.test(l)) {
      value = c.full_name;
    } else if (/\bemail\b/.test(l)) {
      value = email;
    } else if (/\bphone\b|\bmobile\b/.test(l)) {
      value = formatPhone(c.phone, fmt.phone_country || '+61');
    }

    if (value) await input.fill(String(value)).catch(() => {});
  }

  // Click the Register / Sign up / Create account button
  const regBtns = await page.$$('button, input[type=submit], a[role=button]').catch(() => []);
  for (const btn of regBtns) {
    const text = (await btn.innerText().catch(() => '') || await btn.getAttribute('value').catch(() => '') || '').trim();
    if (/^(register|sign\s*up|create\s+account|get\s+started|join|continue)$/i.test(text)) {
      console.log(`  🖱️  Clicking "${text}" to register…`);
      await btn.click().catch(() => {});
      await page.waitForTimeout(3_000);
      return;
    }
  }

  console.log('  ⚠️  Could not find a Register/Sign-up button — fill the form manually in the browser.');
}

// ── Login-wall poll loop ──────────────────────────────────────────────────────

/**
 * Wait for a post-login application form to appear, polling every 3 s.
 * On a login wall, pauses with a user-facing message.
 * On a registration form, auto-fills and clicks Register.
 *
 * @param {Page}   page
 * @param {object} profile
 * @param {string} host
 * @param {number} timeoutMs
 * @returns {Promise<boolean>} true if form became visible within timeout
 */
async function waitForForm(page, profile, host, timeoutMs) {
  const deadline    = Date.now() + timeoutMs;
  const POLL_MS     = 3_000;
  let   notified    = false;
  let   registered  = false;

  while (Date.now() < deadline) {
    const snap = await snapshotLoginState(page);

    if (snap.result === 'form-visible') {
      if (notified) console.log('  ✅ Form now visible — continuing fill.');
      return true;
    }

    if (snap.result === 'already-applied') {
      console.log('  ⏭️  Already applied — skipping.');
      return false;
    }

    if (snap.result === 'registration-form' && !registered) {
      await fillRegistrationForm(page, profile, host);
      registered = true;
      await page.waitForTimeout(POLL_MS);
      continue;
    }

    if (snap.result === 'login-wall' && !notified) {
      const remaining = Math.ceil((deadline - Date.now()) / 60_000);
      console.log(`\n🔐 Login required — please sign in or complete verification in the browser.`);
      console.log(`   Polling every 3 s for up to ${remaining} min.  Press Ctrl+C to abort.\n`);
      notified = true;
    }

    await page.waitForTimeout(POLL_MS);
  }

  console.log('⏱️  Login timeout reached — leaving browser open for manual completion.');
  return false;
}

// ── Review/confirmation page detector ─────────────────────────────────────────

async function isReviewPage(page) {
  // A review/summary page: data shown, no further editable inputs visible
  const editableCount = await page.evaluate(() =>
    Array.from(document.querySelectorAll(
      'input:not([type=hidden]):not([type=submit]):not([type=button]):not([disabled]):not([readonly]),' +
      'textarea:not([disabled]):not([readonly]),' +
      'select:not([disabled])'
    )).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }).length
  ).catch(() => 1); // on error assume not a review page (safer)

  if (editableCount > 0) return false;

  const bodyText = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
  return bodyText.trim().length > 200; // meaningful content but no editable fields
}

// ── Nav button finder (multi-page) ────────────────────────────────────────────

async function findNavButton(page) {
  const btns = await page.$$('button:visible, input[type=submit]:visible').catch(() => []);
  for (const btn of btns) {
    const text = (
      (await btn.innerText().catch(() => '')) ||
      (await btn.getAttribute('value').catch(() => ''))
    ).trim().toLowerCase().replace(/\s+/g, ' ');

    // Never click final-submit buttons
    if (FINAL_SUBMIT_DENYLIST.test(text)) continue;
    // Click allowed nav buttons
    if (NAV_ALLOWLIST.test(text)) return { btn, text };
  }
  return null;
}

// ── Already-applied detection ─────────────────────────────────────────────────

async function checkAlreadyApplied(page) {
  const bodyText = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
  const { result } = classifyLoginState({ bodyText, formLabels: [], buttons: [], inputCount: 1, textareaCount: 0 });
  return result === 'already-applied';
}

// ── Upload verifier ────────────────────────────────────────────────────────────

async function verifyUpload(page, inputEl, filePath) {
  await page.waitForTimeout(800);
  try {
    const fileCount = await inputEl.evaluate((el) => el.files?.length ?? 0);
    if (fileCount === 0) {
      // Also check nearby text for filename confirmation
      const nearby = await inputEl.evaluate((el) =>
        el.closest('div, li, .field')?.innerText ?? ''
      );
      if (!nearby.includes(basename(filePath))) {
        return { ok: false, reason: 'file input shows 0 files after setInputFiles' };
      }
    }
    return { ok: true };
  } catch {
    return { ok: true }; // can't verify → assume ok rather than false-positive
  }
}

function pickUploadDocument(role, labelText, accepted = '') {
  const wantsDocx = accepted.includes('.docx') || accepted.includes('officedocument');
  let docPath = null;
  let docKey  = 'cv_pdf';

  if (COVER_RE.test(labelText) && role.cover_letter_path) {
    docPath = role.cover_letter_path;
    docKey  = 'cover_letter_path';
  } else if (KSC_RE.test(labelText) && role.ksc_path) {
    docPath = role.ksc_path;
    docKey  = 'ksc_path';
  } else if (wantsDocx && role.cv_docx && existsSync(join(ROOT, role.cv_docx))) {
    docPath = role.cv_docx;
    docKey  = 'cv_docx';
  } else if (role.cv_pdf) {
    docPath = role.cv_pdf;
  }

  return { docPath, docKey, wantsDocx };
}

async function attachDocumentInput(page, input, role, labelText, accepted, filled, manual) {
  if (!(RESUME_RE.test(labelText) || COVER_RE.test(labelText) || KSC_RE.test(labelText))) {
    manual.push({ label: labelText, reason: 'file upload (non-CV) — attach manually' });
    return;
  }

  const { docPath, docKey, wantsDocx } = pickUploadDocument(role, labelText, accepted);
  if (!docPath || !existsSync(join(ROOT, docPath))) {
    manual.push({ label: labelText, reason: 'document not generated — run /career-ops queue prepare' });
    return;
  }

  await input.setInputFiles(join(ROOT, docPath)).catch(() => {});
  const verify = await verifyUpload(page, input, join(ROOT, docPath));
  if (!verify.ok) {
    manual.push({ label: labelText, reason: `upload failed: ${verify.reason}` });
    return;
  }

  filled.push({ label: labelText, value: docPath, provenance: 'deterministic:file-attach' });
  if (wantsDocx && docKey === 'cv_pdf') {
    manual.push({ label: labelText, reason: 'field prefers DOCX but only PDF available — verify accepted; run generate-docx.mjs if needed' });
  }
}

async function applyCheckbox(input, labelText, value, provenance, filled, manual) {
  const normalized = String(value ?? '').trim().toLowerCase();
  let shouldCheck = null;
  if (/^(yes|true|1|checked|check|on)$/i.test(normalized)) shouldCheck = true;
  if (/^(no|false|0|unchecked|uncheck|off)$/i.test(normalized)) shouldCheck = false;

  if (shouldCheck == null) {
    manual.push({ label: labelText, reason: `checkbox answer "${value}" is not safely mappable` });
    return;
  }

  const isChecked = await input.isChecked().catch(() => false);
  if (shouldCheck && !isChecked) {
    const ok = await input.check().then(() => true).catch(() => false);
    if (ok) filled.push({ label: labelText, value: 'checked', provenance });
    else manual.push({ label: labelText, reason: 'checkbox check failed' });
  } else if (!shouldCheck && isChecked) {
    const ok = await input.uncheck().then(() => true).catch(() => false);
    if (ok) filled.push({ label: labelText, value: 'unchecked', provenance });
    else manual.push({ label: labelText, reason: 'checkbox uncheck failed' });
  } else {
    filled.push({ label: labelText, value: isChecked ? 'checked' : 'unchecked', provenance });
  }
}

// ── Confirmation capture ───────────────────────────────────────────────────────

/**
 * Poll the page for a submission-confirmation signal.
 * Returns { confirmed, confirmationNum, screenshotPath } or { confirmed: false }.
 */
async function pollForConfirmation(page, role, timeoutMs = 15 * 60 * 1000) {
  const POLL_MS    = 4_000;
  const deadline   = Date.now() + timeoutMs;
  let   alerted    = false;

  while (Date.now() < deadline) {
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    const { result, confirmationNum } = classifyConfirmation({ bodyText });

    if (result === 'confirmation') {
      // Screenshot
      const screenshotDir  = join(ROOT, 'output');
      const screenshotFile = join(screenshotDir, `confirm-${role.id.replace(/:/g, '-')}-${Date.now()}.png`);
      mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({ path: screenshotFile, fullPage: true }).catch(() => {});

      return { confirmed: true, confirmationNum, screenshotPath: screenshotFile };
    }

    if (!alerted) {
      const remainMin = Math.ceil((deadline - Date.now()) / 60_000);
      console.log(`\n📋 Form filled. Review everything, then submit in the browser.`);
      console.log(`   Watching for confirmation (up to ${remainMin} min). Press Ctrl+C to stop.\n`);
      alerted = true;
    }

    await page.waitForTimeout(POLL_MS);
  }

  return { confirmed: false };
}

// ── React-select widget ───────────────────────────────────────────────────────

async function selectReactOption(page, containerHandle, value) {
  const control = await containerHandle.$('.select__control').catch(() => null);
  if (!control) return false;
  await control.click().catch(() => {});
  await page.waitForTimeout(300);

  const target = String(value).toLowerCase().trim();
  let opts = await page.$$('.select__option');

  for (const o of opts) {
    const t = (await o.innerText().catch(() => '')).trim().toLowerCase();
    if (t === target) { await o.click().catch(() => {}); return true; }
  }
  for (const o of opts) {
    const t = (await o.innerText().catch(() => '')).trim().toLowerCase();
    if (t && (t.includes(target) || target.includes(t))) { await o.click().catch(() => {}); return true; }
  }

  const input = await containerHandle.$('input.select__input, input[role=combobox]').catch(() => null);
  if (input) {
    await input.type(String(value).slice(0, 40), { delay: 10 }).catch(() => {});
    await page.waitForTimeout(400);
    opts = await page.$$('.select__option');
    if (opts.length) { await opts[0].click().catch(() => {}); return true; }
  }
  await page.keyboard.press('Escape').catch(() => {});
  return false;
}

// ── Per-field resolution ──────────────────────────────────────────────────────

function provenanceLabel(source, rule, score) {
  if (source === 'cache')  return `reused-from-cache${score ? ` (${score})` : ''}`;
  if (source === 'model')  return 'model-reasoned';
  return `deterministic${rule ? `:${rule}` : ''}`;
}

function resolveField(label, tagName, inputType, liveOptions, profile, role) {
  const key   = normLabel(label);
  const draft = role.drafts?.[key];
  if (draft && draft.answer != null && draft.answer !== '') {
    const widget = draft.widget || (tagName === 'select' ? 'select' : 'text');
    return {
      value:      draft.answer,
      widget,
      source:     draft.source || 'deterministic',
      provenance: provenanceLabel(draft.source, draft.rule, draft.score),
      cacheId:    draft.cacheId,
      firstUse:   draft.source === 'cache' ? !!draft.firstUse : false,
    };
  }

  const fmt    = profile.formatting ?? {};
  const isAU   = fmt.phone_country === '+61' || !fmt.phone_country;

  // Phone: apply AU formatting
  if (isPhoneField(label)) {
    const rule = matchProfileRule(label, inputType, profile, role);
    if (rule) {
      const v = isAU ? formatPhone(rule.value, '+61') : rule.value;
      return { value: v, widget: 'text', source: 'deterministic', provenance: `deterministic:phone`, firstUse: false };
    }
  }

  // Date: apply AU formatting
  if (isDateField(label)) {
    const rule = matchProfileRule(label, inputType, profile, role);
    if (rule) {
      const v = formatDate(rule.value, fmt.date_format || 'DD/MM/YYYY');
      return { value: v, widget: 'text', source: 'deterministic', provenance: `deterministic:date`, firstUse: false };
    }
  }

  // Salary single-number
  if (/salary|compensation|pay.+expect|remunerat|package/i.test(label) && inputType === 'number') {
    const v = resolveSalaryNumber(label, profile, role);
    if (v) return { value: v, widget: 'text', source: 'deterministic', provenance: 'deterministic:salary_num', firstUse: false };
  }

  if (tagName === 'select') {
    // Visa dropdown
    if (looksLikeVisaSelect(label, liveOptions)) {
      const pick = liveOptions.length ? pickVisaOption(liveOptions, role.visa_answer) : role.visa_answer;
      if (pick) return { value: pick, widget: 'select', source: 'deterministic', provenance: 'deterministic:visa', firstUse: false };
      return null;
    }
    // EEO dropdown
    const eeoVal = matchEeoOption(label, liveOptions, profile, false);
    if (eeoVal) return { value: eeoVal, widget: 'select', source: 'deterministic', provenance: 'deterministic:eeo', firstUse: false };

    const rule = matchProfileRule(label, inputType, profile, role);
    if (rule) {
      const opt = liveOptions.length ? chooseOptionDeterministic(rule.value, liveOptions) : rule.value;
      if (opt) return { value: opt, widget: 'select', source: 'deterministic', provenance: `deterministic:${rule.rule}`, firstUse: false };
    }
    return null;
  }

  // EEO free-text
  if (/ethnicit|gender|\bsex\b|disabilit|veteran/i.test(label)) {
    const v = profile?.eeo?.default || 'prefer not to say';
    return { value: v, widget: 'text', source: 'deterministic', provenance: 'deterministic:eeo', firstUse: false };
  }

  // References
  if (/\breferences?\b|\breferees?\b/i.test(label)) {
    const v = profile?.application_answers?.references || profile?.references || 'Available on request';
    return { value: v, widget: 'text', source: 'deterministic', provenance: 'deterministic:references', firstUse: false };
  }

  const rule = matchProfileRule(label, inputType, profile, role);
  if (rule) return { value: rule.value, widget: 'text', source: 'deterministic', provenance: `deterministic:${rule.rule}`, firstUse: false };

  return null;
}

// ── Label-based fill (Greenhouse + Ashby + generic) ────────────────────────────

async function fillByLabels(page, profile, role) {
  const filled       = [];
  const manual       = [];
  const cacheConfirms = [];
  const knockouts    = [];

  const labels = await page.$$('label');

  for (const labelEl of labels) {
    const labelText = (await labelEl.evaluate((el) => el.innerText).catch(() => '')).trim();
    if (!labelText) continue;

    const forAttr = await labelEl.getAttribute('for').catch(() => null);
    let input = null;
    if (forAttr) input = await page.$(`#${cssEscape(forAttr)}`).catch(() => null);
    if (!input) input = await labelEl.$('~ input, ~ textarea, ~ select').catch(() => null);
    if (!input) {
      input = await labelEl.evaluateHandle((el) => {
        const next = el.nextElementSibling;
        if (next && ['INPUT', 'TEXTAREA', 'SELECT'].includes(next.tagName)) return next;
        const parent = el.parentElement;
        return parent?.querySelector('input:not([type=hidden]):not([type=submit]), textarea, select') || null;
      }).catch(() => null);
      if (input?.asElement() == null) input = null;
    }
    if (!input) continue;

    const tagName   = await input.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
    const inputType = (await input.getAttribute('type').catch(() => 'text')) || 'text';
    const inputRole = await input.getAttribute('role').catch(() => null);
    const inputClass = (await input.getAttribute('class').catch(() => '')) || '';
    const isReactSelect = tagName !== 'select' && (inputRole === 'combobox' || /select__input/.test(inputClass));

    // ── File inputs ───────────────────────────────────────────────────────────
    if (inputType === 'file') {
      const accepted = (await input.getAttribute('accept').catch(() => '') || '').toLowerCase();
      await attachDocumentInput(page, input, role, labelText, accepted, filled, manual);
      continue;
    }

    // ── Checkbox handling ─────────────────────────────────────────────────────
    if (inputType === 'checkbox') {
      // Sponsorship checkbox: always uncheck (no sponsorship required)
      if (/sponsor/i.test(labelText)) {
        const checked = await input.isChecked().catch(() => false);
        if (checked) await input.uncheck().catch(() => {});
        filled.push({ label: labelText, value: 'unchecked', provenance: 'deterministic:sponsorship' });
        continue;
      }
      // Other checkboxes: resolve via rules, then use proper check/uncheck
      const r = resolveField(labelText, tagName, inputType, [], profile, role);
      if (r) {
        await applyCheckbox(input, labelText, r.value, r.provenance, filled, manual);
      } else {
        manual.push({ label: labelText, reason: 'checkbox — no standing answer' });
      }
      continue;
    }

    // ── Knockout/screener detection ──────────────────────────────────────────
    const liveOptions = tagName === 'select'
      ? await input.$$eval('option', (els) => els.map((e) => e.textContent.trim())).catch(() => [])
      : [];

    const { isKnockout, reason: koReason } = detectKnockout(labelText, liveOptions);
    if (isKnockout) {
      knockouts.push({ label: labelText, reason: koReason });
      manual.push({ label: labelText, reason: `⛔ KNOCKOUT/SCREENER — answer truthfully: ${koReason}` });
      continue;
    }

    const r = resolveField(labelText, isReactSelect ? 'select' : tagName, inputType,
      liveOptions, profile, role);

    if (!r) {
      manual.push({ label: labelText, reason: 'custom or unrecognised field — no standing answer' });
      continue;
    }

    let applied = false;
    if (isReactSelect) {
      const container = await labelEl.evaluateHandle(
        (el) => el.closest('.select__container') || el.parentElement
      );
      applied = await selectReactOption(page, container.asElement(), r.value);
      if (!applied) { manual.push({ label: labelText, reason: `no option matches "${r.value}"` }); continue; }
    } else if (r.widget === 'select' || tagName === 'select') {
      const ok = await input.selectOption({ label: r.value }).then(() => true).catch(() => false);
      applied  = ok || await input.selectOption(r.value).then(() => true).catch(() => false);
      if (!applied) { manual.push({ label: labelText, reason: `no option matches "${r.value}"` }); continue; }
    } else {
      await input.fill(String(r.value)).catch(() => {});
      applied = true;
    }

    if (applied) {
      filled.push({ label: labelText, value: r.value, provenance: r.provenance });
      if (r.firstUse) cacheConfirms.push({ label: labelText, value: r.value });
    }
  }

  return { filled, manual, cacheConfirms, knockouts };
}

// ── Lever fill (name-attribute form) ─────────────────────────────────────────

async function fillLever(page, profile, role) {
  const filled       = [];
  const manual       = [];
  const cacheConfirms = [];
  const knockouts    = [];

  const labelCards = await page.$$('.application-label, label, .application-question .text').catch(() => []);
  for (const el of labelCards) {
    const labelText = (await el.evaluate((n) => n.innerText).catch(() => '')).trim();
    if (!labelText) continue;
    const key   = normLabel(labelText);
    const draft = role.drafts?.[key];
    if (!draft) continue;
    const input = await el.evaluateHandle((n) => {
      const root = n.closest('.application-question, li, .form-field') || n.parentElement;
      return root?.querySelector('input:not([type=hidden]), textarea, select') || null;
    }).catch(() => null);
    if (input?.asElement() == null) continue;
    const tag = await input.evaluate((n) => n.tagName.toLowerCase()).catch(() => '');
    const inputType = (await input.getAttribute('type').catch(() => 'text')) || 'text';
    if (inputType === 'file') {
      const accepted = (await input.getAttribute('accept').catch(() => '') || '').toLowerCase();
      await attachDocumentInput(page, input, role, labelText, accepted, filled, manual);
      continue;
    }
    if (inputType === 'checkbox') {
      await applyCheckbox(input, labelText, draft.answer, provenanceLabel(draft.source, draft.rule, draft.score), filled, manual);
      continue;
    }
    if (tag === 'select') {
      const ok = await input.selectOption({ label: draft.answer }).then(() => true).catch(() => false);
      if (!ok) { manual.push({ label: labelText, reason: `no option matches "${draft.answer}"` }); continue; }
    } else {
      const ok = await input.fill(String(draft.answer)).then(() => true).catch(() => false);
      if (!ok) { manual.push({ label: labelText, reason: 'text fill failed' }); continue; }
    }
    filled.push({ label: labelText, value: draft.answer, provenance: provenanceLabel(draft.source, draft.rule, draft.score) });
    if (draft.source === 'cache' && draft.firstUse) cacheConfirms.push({ label: labelText, value: draft.answer });
  }

  const { candidate = {}, application_answers = {} } = profile;
  const fmt = profile.formatting ?? {};
  const nameMap = [
    { names: ['name', 'full_name'],  value: candidate.full_name },
    { names: ['email'],              value: candidate.email },
    { names: ['phone'],              value: formatPhone(candidate.phone, fmt.phone_country || '+61') },
    { names: ['urls[LinkedIn]', 'urls[Linkedin]', 'linkedin'], value: candidate.linkedin },
    { names: ['urls[GitHub]', 'github'],  value: candidate.github },
    { names: ['urls[Portfolio]', 'portfolio', 'website'], value: application_answers.website || candidate.github },
    { names: ['location', 'city'],   value: candidate.location },
  ];
  for (const { names, value } of nameMap) {
    if (!value) continue;
    for (const name of names) {
      const input = await page.$(`input[name="${name}"], textarea[name="${name}"]`).catch(() => null);
      if (input) {
        const already = await input.inputValue().catch(() => '');
        if (!already) {
          await input.fill(String(value)).catch(() => {});
          filled.push({ label: name, value, provenance: 'deterministic' });
        }
        break;
      }
    }
  }

  const resumeInput = await page.$('input[type=file]').catch(() => null);
  if (resumeInput) {
    const accepted = (await resumeInput.getAttribute('accept').catch(() => '') || '').toLowerCase();
    await attachDocumentInput(page, resumeInput, role, 'Resume/CV', accepted, filled, manual);
  }

  return { filled, manual, cacheConfirms, knockouts };
}

// ── Multi-page fill loop ──────────────────────────────────────────────────────

async function fillMultiPage(page, profile, role) {
  const allFilled       = [];
  const allManual       = [];
  const allCacheConfirms = [];
  const allKnockouts    = [];
  let pageNum = 0;
  const MAX_PAGES = 15;

  while (pageNum < MAX_PAGES) {
    pageNum++;
    console.log(`  Page ${pageNum}…`);

    // Stop if this is a review/summary page
    if (await isReviewPage(page)) {
      console.log(`  📋 Review/summary page reached — stopping fill. Submit manually.`);
      break;
    }

    // Fill current page
    let pageResult;
    if (role.ats === 'lever') {
      pageResult = await fillLever(page, profile, role);
    } else {
      pageResult = await fillByLabels(page, profile, role);
    }

    allFilled.push(...pageResult.filled);
    allManual.push(...pageResult.manual);
    allCacheConfirms.push(...pageResult.cacheConfirms);
    allKnockouts.push(...pageResult.knockouts);

    // Look for a nav button to advance
    const nav = await findNavButton(page);
    if (!nav) {
      console.log(`  No navigation button — single-page form or last page.`);
      break;
    }

    console.log(`  ➡️  Clicking "${nav.text}"…`);
    await nav.btn.click().catch(() => {});
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(1_500);
  }

  return { filled: allFilled, manual: allManual, cacheConfirms: allCacheConfirms, knockouts: allKnockouts };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!ROLE_ID) {
    console.error('Usage: node form-fill.mjs <role-id> [--headless]');
    process.exit(1);
  }

  const profile = loadProfile();
  const queue   = loadQueue();
  const role    = queue.roles.find((r) => r.id === ROLE_ID);
  if (!role) { console.error(`Role not found in queue: ${ROLE_ID}`); process.exit(1); }

  if (role.ats === 'custom') {
    console.log(`\n${role.company} – ${role.title}`);
    console.log('ATS: custom — use /career-ops apply (agent apply path).');
    console.log(`URL: ${role.url}`);
    process.exit(0);
  }

  console.log(`\nFilling form: ${role.company} – ${role.title}`);
  console.log(`ATS: ${role.ats}  ${HEADLESS ? '(headless)' : '(headed)'}`);
  console.log(`Visa answer: ${role.visa_answer ?? '(none)'}`);
  if (role.employment_type === 'part-time') {
    const cap = profile.application_answers?.max_hours_per_week_parttime ?? 24;
    console.log(`Part-time guardrail: hours/week capped at ${cap}`);
  }
  console.log('');

  let host = 'generic';
  try { host = new URL(role.url).hostname; } catch {}

  const loginTimeout = (profile.automation?.login_timeout_min ?? 10) * 60_000;

  const context = await getContext(role.url, HEADLESS);
  const page    = await context.newPage();
  page.setDefaultTimeout(15_000);

  // ── Liveness check ────────────────────────────────────────────────────────
  console.log('Verifying posting is still live…');
  const { result: liveness, reason: livReason } = await checkUrlLiveness(page, role.url);
  if (liveness === 'expired') {
    console.log(`❌ Posting appears closed: ${livReason}`);
    const q2 = loadQueue();
    updateById(q2, ROLE_ID, { status: 'closed', decided_at: new Date().toISOString() });
    saveQueue(q2);
    await context.close();
    return;
  }
  if (liveness === 'uncertain') {
    console.log(`⚠️  Liveness uncertain: ${livReason}. Proceeding — verify the form is open.`);
  } else {
    console.log('✅ Posting is live.\n');
  }

  await page.goto(role.url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(2_000);

  // ── Already applied? ──────────────────────────────────────────────────────
  if (await checkAlreadyApplied(page)) {
    console.log('⏭️  Already applied to this role — marking skipped.');
    const q2 = loadQueue();
    setStatus(q2, ROLE_ID, 'skipped');
    saveQueue(q2);
    await context.close();
    return;
  }

  // ── Click Apply button ────────────────────────────────────────────────────
  const applyBtn = await page.$('a:text("Apply"), button:text("Apply"), a:text("Apply now"), button:text("Apply now")').catch(() => null);
  if (applyBtn) { await applyBtn.click().catch(() => {}); await page.waitForTimeout(2_000); }

  // ── Login-wall handling ────────────────────────────────────────────────────
  const loginCheck = await snapshotLoginState(page);
  if (loginCheck.result === 'login-wall' || loginCheck.result === 'registration-form') {
    const formAppeared = await waitForForm(page, profile, host, loginTimeout);
    if (!formAppeared) {
      if (HEADLESS) {
        // Headless: exit cleanly so the dashboard parallel pool advances
        console.log('⏱️  Login timeout in headless mode — marking failure and exiting.');
        await context.close();
        process.exit(1);
      }
      // Headed: leave browser open for manual completion
      await new Promise(() => {});
    }
  }

  // ── Fill form (multi-page) ────────────────────────────────────────────────
  console.log('Filling form fields (layer-labelled):');
  const { filled, manual, cacheConfirms, knockouts } = await fillMultiPage(page, profile, role);

  // ── Provenance summary ────────────────────────────────────────────────────
  const tally = { deterministic: 0, 'reused-from-cache': 0, 'model-reasoned': 0 };
  for (const f of filled) {
    const cls = f.provenance.startsWith('reused-from-cache') ? 'reused-from-cache'
              : f.provenance.startsWith('model-reasoned')    ? 'model-reasoned'
              : 'deterministic';
    tally[cls]++;
    const v = String(f.value).replace(/\s+/g, ' ');
    console.log(`  ✅ [${f.provenance}] ${f.label.replace(/\s+/g, ' ').slice(0, 60)}: "${v.slice(0, 50)}${v.length > 50 ? '…' : ''}"`);
  }

  if (cacheConfirms.length > 0) {
    console.log(`\n🟡 First-time cache reuse — confirm once before submit:`);
    for (const c of cacheConfirms) {
      console.log(`   · ${c.label.replace(/\s+/g, ' ').slice(0, 60)} → "${String(c.value).replace(/\s+/g, ' ').slice(0, 60)}"`);
    }
  }

  if (knockouts.length > 0) {
    console.log(`\n⛔ ${knockouts.length} KNOCKOUT/SCREENER field(s) — answer TRUTHFULLY:`);
    for (const k of knockouts) {
      console.log(`   · ${k.label.replace(/\s+/g, ' ').slice(0, 80)}: ${k.reason}`);
    }
  }

  if (manual.length > 0) {
    console.log(`\n⚠️  ${manual.length} field(s) need manual completion:`);
    for (const f of manual) console.log(`   · ${f.label.replace(/\s+/g, ' ').slice(0, 60)}: ${f.reason}`);
    const q2 = loadQueue();
    const existing = q2.roles.find((r) => r.id === ROLE_ID);
    if (existing) {
      const flags = Array.from(new Set([...(existing.flags || []), 'manual-field']));
      updateById(q2, ROLE_ID, { flags });
      saveQueue(q2);
    }
  }

  if (knockouts.length > 0) {
    const q2 = loadQueue();
    const existing = q2.roles.find((r) => r.id === ROLE_ID);
    if (existing) {
      const flags = Array.from(new Set([...(existing.flags || []), 'knockout-flag']));
      updateById(q2, ROLE_ID, { flags });
      saveQueue(q2);
    }
  }

  // Mark status: headed fills are 'filled' (user has live browser), headless are
  // 'prefilled' (DOM state lost on close — user must re-open headed to review).
  const fillStatus = HEADLESS ? 'prefilled' : 'filled';
  const q3 = loadQueue();
  setStatus(q3, ROLE_ID, fillStatus);
  saveQueue(q3);

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`Filled ${filled.length}: ${tally.deterministic} deterministic · ${tally['reused-from-cache']} reused-from-cache · ${tally['model-reasoned']} model-reasoned`);
  console.log(`Manual: ${manual.length}  Knockouts: ${knockouts.length}`);
  console.log('────────────────────────────────────────────────────────');
  console.log('FORM FILL COMPLETE');

  // ── Headless exit: close cleanly so the dashboard parallel pool advances ──
  // Confirmation capture and review are the headed path only.
  if (HEADLESS) {
    console.log('Headless pre-fill done — status set to "prefilled".');
    console.log('Re-open with headed Fill in the dashboard to review before submitting.');
    await context.close();
    process.exit(0);
  }

  console.log('BROWSER REMAINS OPEN — review every field.');
  console.log('Submit is YOUR action — this script never clicks submit.');
  console.log('────────────────────────────────────────────────────────\n');

  // ── Confirmation capture (headed path only) ────────────────────────────────
  // Polls for a submission confirmation page after the user submits manually.
  // Stores the confirmation number on the role but keeps status as "filled"
  // so the dashboard can still write the tracker row via "Mark Submitted".
  const confResult = await pollForConfirmation(page, role);
  if (confResult.confirmed) {
    const num = confResult.confirmationNum ?? 'not captured';
    console.log(`\n🎉 Submission confirmed! Reference: ${num}`);
    console.log(`   Screenshot: ${confResult.screenshotPath}`);

    // Store confirmation metadata but do NOT set status to "submitted" here.
    // That would mark the role as DONE and remove it from the dashboard before
    // writeTrackerTsv runs. Let the dashboard "Mark Submitted" button handle it.
    const q4 = loadQueue();
    updateById(q4, ROLE_ID, {
      confirmation_number: confResult.confirmationNum,
      confirmation_screenshot: confResult.screenshotPath,
    });
    saveQueue(q4);

    console.log(`\n   → Click "Mark Submitted" in the dashboard to sync the tracker.`);
  }

  // Keep browser open so user can review; process blocks until closed manually
  await new Promise(() => {});
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
