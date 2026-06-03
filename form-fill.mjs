#!/usr/bin/env node
/**
 * form-fill.mjs — Zero-model-token deterministic Playwright form fill.
 *
 * Applies the results of the three-layer resolver (queue-resolve.mjs) to a live
 * application form: per field it prefers a prepared draft (Layer 1 deterministic,
 * Layer 2 cache-reused, or Layer 3 model-reasoned), and falls back to a live
 * Layer-1 profile rule for any field prepare did not see (e.g. a field the ATS
 * API did not expose). The tailored CV is attached at the resume/CV/attach file
 * input. Anything with no answer — or a sensitive consent field with no standing
 * profile answer — is left blank and flagged for manual completion.
 *
 * Every filled field is labelled in the review summary as deterministic,
 * reused-from-cache, or model-reasoned. A cache answer reused for the FIRST time
 * is surfaced so the user confirms it once.
 *
 * HARD CONSTRAINTS (never relaxed):
 *   - Never locates or clicks a submit button. Submit is the user's action.
 *   - Re-verifies posting liveness on open.
 *   - Leaves the browser open (headed) for manual review + submit.
 *   - Local only: drives a local headed browser; no posting to any ATS.
 *
 * Usage:  node form-fill.mjs <role-id>
 * ATS:    Greenhouse / Lever / Ashby (deterministic). Custom/Workday → prints
 *         instructions to use the agent apply path (same layered principle).
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { chromium } from 'playwright';

import { loadQueue, saveQueue, updateById } from './queue-store.mjs';
import { checkUrlLiveness } from './liveness-browser.mjs';
import {
  matchProfileRule, normLabel, looksLikeVisaSelect, pickVisaOption,
  chooseOptionDeterministic,
} from './field-rules.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

// CSS.escape is browser-only; minimal Node-safe equivalent for #id selectors.
function cssEscape(value) {
  return String(value).replace(/([^\w-])/g, '\\$1');
}

function loadProfile() {
  const path = join(ROOT, 'config', 'profile.yml');
  if (!existsSync(path)) throw new Error('config/profile.yml not found');
  return yaml.load(readFileSync(path, 'utf-8'));
}

const RESUME_RE = /resume|cv\b|curriculum|attach/i;

// ── Per-field resolution ──────────────────────────────────────────────────────

/**
 * Decide the value for a labelled field. Prefers a prepared draft; otherwise a
 * live Layer-1 profile rule. Returns null when nothing deterministic applies.
 * @returns {{ value, widget:'text'|'select', provenance, source, cacheId?, firstUse? } | null}
 */
function resolveField(label, tagName, inputType, liveOptions, profile, role) {
  const key = normLabel(label);
  const draft = role.drafts?.[key];
  if (draft && draft.answer != null && draft.answer !== '') {
    const widget = draft.widget || (tagName === 'select' ? 'select' : 'text');
    return {
      value: draft.answer,
      widget,
      source: draft.source || 'deterministic',
      provenance: provenanceLabel(draft.source, draft.rule, draft.score),
      cacheId: draft.cacheId,
      firstUse: draft.source === 'cache' ? !!draft.firstUse : false,
    };
  }

  // Live Layer-1 fallback (field prepare never saw). When liveOptions is empty
  // (a react-select whose options we don't pre-read), return the raw rule value
  // and let selectReactOption match it by typing to filter.
  if (tagName === 'select') {
    if (looksLikeVisaSelect(label, liveOptions)) {
      const pick = liveOptions.length ? pickVisaOption(liveOptions, role.visa_answer) : role.visa_answer;
      if (pick) return { value: pick, widget: 'select', source: 'deterministic', provenance: 'deterministic:visa', firstUse: false };
      return null;
    }
    const rule = matchProfileRule(label, inputType, profile, role);
    if (rule) {
      const opt = liveOptions.length ? chooseOptionDeterministic(rule.value, liveOptions) : rule.value;
      if (opt) return { value: opt, widget: 'select', source: 'deterministic', provenance: `deterministic:${rule.rule}`, firstUse: false };
    }
    return null;
  }

  const rule = matchProfileRule(label, inputType, profile, role);
  if (rule) return { value: rule.value, widget: 'text', source: 'deterministic', provenance: `deterministic:${rule.rule}`, firstUse: false };
  return null;
}

function provenanceLabel(source, rule, score) {
  if (source === 'cache') return `reused-from-cache${score ? ` (${score})` : ''}`;
  if (source === 'model') return 'model-reasoned';
  return `deterministic${rule ? `:${rule}` : ''}`;
}

// ── react-select widget (Greenhouse multi_value_single_select renders these) ──

// Greenhouse "single select" questions are react-select comboboxes, not native
// <select>. Open the control, then click the option whose text matches. Returns
// true on success. Menu options render in a portal, so we query document-wide.
async function selectReactOption(page, containerHandle, value) {
  const control = await containerHandle.$('.select__control').catch(() => null);
  if (!control) return false;
  await control.click().catch(() => {});
  await page.waitForTimeout(300);

  const target = String(value).toLowerCase().trim();
  let opts = await page.$$('.select__option');

  // exact, then substring-either-way
  for (const o of opts) {
    const t = (await o.innerText().catch(() => '')).trim().toLowerCase();
    if (t === target) { await o.click().catch(() => {}); return true; }
  }
  for (const o of opts) {
    const t = (await o.innerText().catch(() => '')).trim().toLowerCase();
    if (t && (t.includes(target) || target.includes(t))) { await o.click().catch(() => {}); return true; }
  }

  // fallback: type to filter, then take the first option
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

// ── Label-based fill (Greenhouse + Ashby + generic fallback) ───────────────────

async function fillByLabels(page, profile, role) {
  const filled = [];        // { label, value, provenance }
  const manual = [];        // { label, reason }
  const cacheConfirms = []; // { label, value } — first-time cache reuse

  const labels = await page.$$('label');

  for (const labelEl of labels) {
    const labelText = (await labelEl.evaluate((el) => el.innerText).catch(() => '')).trim();
    if (!labelText) continue;

    // Resolve the associated input.
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

    const tagName = await input.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
    const inputType = (await input.getAttribute('type').catch(() => 'text')) || 'text';
    const inputRole = await input.getAttribute('role').catch(() => null);
    const inputClass = (await input.getAttribute('class').catch(() => '')) || '';
    const isReactSelect = tagName !== 'select' && (inputRole === 'combobox' || /select__input/.test(inputClass));

    // File input → resume/CV attach only.
    if (inputType === 'file') {
      if (RESUME_RE.test(labelText)) {
        if (role.cv_pdf && existsSync(join(ROOT, role.cv_pdf))) {
          await input.setInputFiles(join(ROOT, role.cv_pdf)).catch(() => {});
          filled.push({ label: labelText, value: role.cv_pdf, provenance: 'deterministic:cv-attach' });
        } else {
          manual.push({ label: labelText, reason: 'cv_pdf not generated — run /career-ops queue prepare' });
        }
      } else {
        manual.push({ label: labelText, reason: 'file upload (not a resume) — attach manually' });
      }
      continue;
    }

    // Sponsorship checkbox → we do NOT require sponsorship → leave unchecked.
    if (inputType === 'checkbox' && /sponsor/i.test(labelText)) {
      const checked = await input.isChecked().catch(() => false);
      if (checked) await input.uncheck().catch(() => {});
      filled.push({ label: labelText, value: 'unchecked', provenance: 'deterministic:sponsorship' });
      continue;
    }

    const liveOptions = tagName === 'select'
      ? await input.$$eval('option', (els) => els.map((e) => e.textContent.trim())).catch(() => [])
      : [];

    // react-select fields: pass no options — selectReactOption matches the value
    // by typing to filter (drafts already carry the exact option text).
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
      applied = ok || await input.selectOption(r.value).then(() => true).catch(() => false);
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

  return { filled, manual, cacheConfirms };
}

// ── Lever fill (name-attribute form) — draft/rule aware ────────────────────────

async function fillLever(page, profile, role) {
  // Lever uses input[name=...] without robust <label for>. We still honour any
  // prepared drafts by label, then fall back to the known Lever field names.
  const filled = [];
  const manual = [];
  const cacheConfirms = [];

  // 1) Apply any prepared drafts whose normalised label matches a Lever field
  //    we can locate by its visible card label.
  const labelCards = await page.$$('.application-label, label, .application-question .text').catch(() => []);
  for (const el of labelCards) {
    const labelText = (await el.evaluate((n) => n.innerText).catch(() => '')).trim();
    if (!labelText) continue;
    const key = normLabel(labelText);
    const draft = role.drafts?.[key];
    if (!draft) continue;
    const input = await el.evaluateHandle((n) => {
      const root = n.closest('.application-question, li, .form-field') || n.parentElement;
      return root?.querySelector('input:not([type=hidden]), textarea, select') || null;
    }).catch(() => null);
    if (input?.asElement() == null) continue;
    const tag = await input.evaluate((n) => n.tagName.toLowerCase()).catch(() => '');
    if (tag === 'select') {
      const ok = await input.selectOption({ label: draft.answer }).then(() => true).catch(() => false);
      if (!ok) { manual.push({ label: labelText, reason: `no option matches "${draft.answer}"` }); continue; }
    } else {
      await input.fill(String(draft.answer)).catch(() => {});
    }
    filled.push({ label: labelText, value: draft.answer, provenance: provenanceLabel(draft.source, draft.rule, draft.score) });
    if (draft.source === 'cache' && draft.firstUse) cacheConfirms.push({ label: labelText, value: draft.answer });
  }

  // 2) Known fixed Lever fields by name (deterministic from profile).
  const { candidate = {}, application_answers = {} } = profile;
  const nameMap = [
    { names: ['name', 'full_name'], value: candidate.full_name },
    { names: ['email'], value: candidate.email },
    { names: ['phone'], value: candidate.phone },
    { names: ['urls[LinkedIn]', 'urls[Linkedin]', 'linkedin'], value: candidate.linkedin },
    { names: ['urls[GitHub]', 'github'], value: candidate.github },
    { names: ['urls[Portfolio]', 'portfolio', 'website'], value: application_answers.website || candidate.github },
    { names: ['location', 'city'], value: candidate.location },
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

  // 3) Resume upload.
  const resumeInput = await page.$('input[type=file]').catch(() => null);
  if (resumeInput && role.cv_pdf && existsSync(join(ROOT, role.cv_pdf))) {
    await resumeInput.setInputFiles(join(ROOT, role.cv_pdf)).catch(() => {});
    filled.push({ label: 'Resume/CV', value: role.cv_pdf, provenance: 'deterministic:cv-attach' });
  } else if (resumeInput) {
    manual.push({ label: 'Resume/CV', reason: 'cv_pdf not ready' });
  }

  return { filled, manual, cacheConfirms };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const roleId = process.argv[2];
  if (!roleId) {
    console.error('Usage: node form-fill.mjs <role-id>');
    process.exit(1);
  }

  const profile = loadProfile();
  const queue = loadQueue();
  const role = queue.roles.find((r) => r.id === roleId);
  if (!role) { console.error(`Role not found in queue: ${roleId}`); process.exit(1); }

  if (role.ats === 'custom') {
    console.log(`\n${role.company} – ${role.title}`);
    console.log('ATS: custom — use /career-ops apply (the agent apply path applies the same layered principle).');
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

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);

  console.log('Verifying posting is still live…');
  const { result, reason } = await checkUrlLiveness(page, role.url);
  if (result === 'expired') {
    console.log(`❌ Posting appears closed: ${reason}`);
    const q2 = loadQueue();
    updateById(q2, roleId, { status: 'closed', decided_at: new Date().toISOString() });
    saveQueue(q2);
    await browser.close();
    return;
  }
  if (result === 'uncertain') {
    console.log(`⚠️  Liveness uncertain: ${reason}. Proceeding — verify the form is open.`);
  } else {
    console.log('✅ Posting is live.\n');
  }

  await page.goto(role.url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(2_000);

  const applyBtn = await page.$('a:text("Apply"), button:text("Apply"), a:text("Apply now"), button:text("Apply now")').catch(() => null);
  if (applyBtn) { await applyBtn.click().catch(() => {}); await page.waitForTimeout(2_000); }

  console.log('Applying resolved fields (layer-labelled):');

  let result2 = { filled: [], manual: [], cacheConfirms: [] };
  try {
    if (role.ats === 'lever') result2 = await fillLever(page, profile, role);
    else result2 = await fillByLabels(page, profile, role); // greenhouse, ashby, fallback
  } catch (err) {
    console.error(`Fill error: ${err.message}`);
  }

  const { filled, manual, cacheConfirms } = result2;

  // Provenance-labelled review view.
  const tally = { deterministic: 0, 'reused-from-cache': 0, 'model-reasoned': 0 };
  for (const f of filled) {
    const cls = f.provenance.startsWith('reused-from-cache') ? 'reused-from-cache'
      : f.provenance.startsWith('model-reasoned') ? 'model-reasoned' : 'deterministic';
    tally[cls]++;
    const v = String(f.value).replace(/\s+/g, ' ');
    console.log(`  ✅ [${f.provenance}] ${f.label.replace(/\s+/g, ' ').slice(0, 60)}: "${v.slice(0, 50)}${v.length > 50 ? '…' : ''}"`);
  }

  if (cacheConfirms.length > 0) {
    console.log(`\n🟡 First-time cache reuse — confirm these once before submit:`);
    for (const c of cacheConfirms) {
      console.log(`   · ${c.label.replace(/\s+/g, ' ').slice(0, 60)} → "${String(c.value).replace(/\s+/g, ' ').slice(0, 60)}"`);
    }
  }

  if (manual.length > 0) {
    console.log(`\n⚠️  ${manual.length} field(s) left blank for manual completion:`);
    for (const f of manual) console.log(`   · ${f.label.replace(/\s+/g, ' ').slice(0, 60)}: ${f.reason}`);
    const q2 = loadQueue();
    const existing = q2.roles.find((r) => r.id === roleId);
    if (existing) {
      const flags = Array.from(new Set([...(existing.flags || []), 'manual-field']));
      updateById(q2, roleId, { flags });
      saveQueue(q2);
    }
  }

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`Filled ${filled.length}: ${tally.deterministic} deterministic · ${tally['reused-from-cache']} reused-from-cache · ${tally['model-reasoned']} model-reasoned`);
  console.log(`Manual: ${manual.length}`);
  console.log('────────────────────────────────────────────────────────');
  console.log('FORM FILL COMPLETE — BROWSER REMAINS OPEN');
  console.log('Review every field before submitting. Submit is YOUR action —');
  console.log('this script never locates or clicks submit.');
  console.log('────────────────────────────────────────────────────────\n');

  await new Promise(() => {}); // keep the browser visible until the user closes it
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
