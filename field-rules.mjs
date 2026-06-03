#!/usr/bin/env node
/**
 * field-rules.mjs — Layer 1: deterministic profile-rule matchers (zero cost).
 *
 * Single source of the exact/keyword field matchers, shared by queue-resolve.mjs
 * (pre-resolve) and form-fill.mjs (live fill fast-path). Each rule maps a
 * question label to a value drawn from config/profile.yml — never a guess. A
 * rule that matches but has no value in the profile returns nothing, so the
 * field falls through to Layer 2 (cache) / Layer 3 (agent).
 *
 * Covers the classic fixed fields (name, email, phone, links, salary,
 * notice/availability, hours) AND the employer-independent custom fields that
 * are answerable straight from the profile (country, residence, relocation,
 * office-days, work-rights free-text, website, verification consent).
 *
 * Visa DROPDOWNS, resume file uploads, and sponsorship checkboxes are widget-
 * special and stay in form-fill.mjs (they need option/file/checkbox handling),
 * driven by role.visa_answer and profile.location — not by this text matcher.
 *
 * Motivational / "why this company/role" questions are deliberately NOT matched
 * here: their answers are employer-specific, so they belong to Layer 3.
 */

export function splitName(fullName = '') {
  const parts = fullName.trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  const first = parts.slice(0, parts.length > 1 ? -1 : undefined).join(' ');
  return { first, last };
}

function nonEmpty(v) {
  return v != null && String(v).trim() !== '' ? String(v).trim() : null;
}

/**
 * Returns { value, rule } for a label, or null when no deterministic rule
 * yields a value. `type` is the input type (text/textarea/select/...).
 */
export function matchProfileRule(label, type, profile, role = {}) {
  const l = String(label).toLowerCase().trim();
  const a = profile.application_answers || {};
  const c = profile.candidate || {};
  const loc = profile.location || {};
  const { first, last } = splitName(c.full_name);
  const isPartTime = role.employment_type === 'part-time';

  // Ordered: most specific first. Each entry's value() may return null to fall
  // through (rule recognised the slot but the profile has no answer for it).
  const rules = [
    // ── Employer-independent custom fields (the ones the old fill left blank) ──
    { id: 'relocation',
      test: /relocat|willing to move|open to (moving|relocat)/,
      value: () => nonEmpty(a.open_to_relocation) },
    { id: 'office_days',
      test: /days?\s*(in|at|per|a)\b.*office|in[-\s]?office|office[-\s]?first|commit to\s*\d|onsite expectation|days in the office/,
      value: () => nonEmpty(a.office_days_commitment) },
    { id: 'residence',
      test: /place of residence|where do you (live|reside)|current (place of )?residence|residential (address|status)|country of residence|which (city|suburb)/,
      value: () => nonEmpty(a.current_residence) || nonEmpty(c.location) },
    { id: 'country',
      test: /^country\b|what country|country you|your country/,
      value: () => nonEmpty(loc.country) },
    { id: 'consent_verification',
      test: /consent.*(verif|background|police|criminal|check)|criminal (history|record|check)|background check|police check|right to work check/,
      value: () => nonEmpty(a.work_rights_consent) },
    { id: 'work_rights_freetext',
      test: /work(ing)? rights|right to work|visa status|what visa|which visa|are you (an? )?(australian )?(citizen|permanent resident|pr\b)|immigration status/,
      value: () => nonEmpty(a.work_rights_freetext),
      // only for free-text — a visa DROPDOWN is handled by form-fill via role.visa_answer
      guard: () => type !== 'select' },
    { id: 'website',
      test: /\bwebsite\b|\bportfolio\b|personal site|web address|personal url/,
      value: () => nonEmpty(a.website) || nonEmpty(c.portfolio_url) || nonEmpty(c.github) },

    // ── Classic fixed fields ──
    { id: 'first_name', test: /\bfirst.?name\b|given.?name\b|preferred first/, value: () => nonEmpty(first) },
    { id: 'last_name', test: /\blast.?name\b|family.?name\b|surname\b/, value: () => nonEmpty(last) },
    { id: 'full_name', test: /^(full.?)?name\*?$/, value: () => nonEmpty(c.full_name) },
    { id: 'email', test: /\bemail\b/, value: () => nonEmpty(c.email) },
    { id: 'phone', test: /\bphone\b|\bmobile\b|\btelephone\b/, value: () => nonEmpty(c.phone) },
    { id: 'linkedin', test: /linkedin/, value: () => nonEmpty(c.linkedin) },
    { id: 'github', test: /github/, value: () => nonEmpty(c.github) },
    { id: 'location', test: /\blocation\b|\bcity\b|where.+based/, value: () => nonEmpty(c.location) },
    { id: 'salary', test: /salary|compensation|pay.+expect|remunerat|package|expected.+(pay|salary)/,
      value: () => nonEmpty(a.salary_range) },
    { id: 'availability', test: /notice.?period|when.+available|availability|start.?date|earliest.?start|when can you start/,
      value: () => isPartTime ? nonEmpty(a.availability_parttime) : nonEmpty(a.notice_period) },
    { id: 'hours', test: /hours?.?(per|a|\/)\s*week|weekly.?hours|hours?.?(expected|available)/,
      value: () => isPartTime ? nonEmpty(String(a.max_hours_per_week_parttime ?? '')) : null },
  ];

  for (const r of rules) {
    if (!r.test.test(l)) continue;
    if (r.guard && !r.guard()) continue;
    const v = r.value();
    if (v) return { value: v, rule: r.id };
    // matched the slot but no profile value → fall through to L2/L3
  }
  return null;
}

// ── Select-option helpers ─────────────────────────────────────────────────────

// True when a select is really a visa/work-rights dropdown (by label or by
// options that name visa types). Such selects are answered from role.visa_answer
// via pickVisaOption, NOT from a free-text profile rule.
export function looksLikeVisaSelect(label = '', options = []) {
  if (/visa|work.?auth|right.?to.?work|residency|citizen/i.test(label)) return true;
  const opts = options.join(' ').toLowerCase();
  return /\bvisa\b|citizen|permanent resident|graduate visa|working holiday/.test(opts);
}

// Choose the dropdown option for a visa answer. Exact, then keyword-subset,
// then 2+ significant-word overlap. Returns the option string or null.
export function pickVisaOption(options, visaAnswer) {
  if (!visaAnswer || !Array.isArray(options)) return null;
  const target = String(visaAnswer).toLowerCase();
  for (const opt of options) if (opt.toLowerCase() === target) return opt;
  const keywords = target.split(/\s+/);
  for (const opt of options) {
    const ol = opt.toLowerCase();
    if (keywords.every((kw) => ol.includes(kw))) return opt;
  }
  for (const opt of options) {
    const ol = opt.toLowerCase();
    const matches = keywords.filter((kw) => kw.length > 3 && ol.includes(kw));
    if (matches.length >= 2) return opt;
  }
  return null;
}

// Deterministically map an intended answer to one of the options — exact, then
// the answer starting with the option as a whole word ("Yes — ..." → "Yes"),
// then whole-word containment. Returns the option string or null. No embeddings
// (form-fill's live path stays token-free); the resolver adds an embedding
// fallback on top of this.
export function chooseOptionDeterministic(answer, options = []) {
  if (answer == null || !Array.isArray(options) || options.length === 0) return null;
  const a = String(answer).toLowerCase().trim();
  for (const opt of options) if (opt.toLowerCase().trim() === a) return opt;
  // option as a leading whole word of the answer
  for (const opt of options) {
    const o = opt.toLowerCase().trim();
    if (new RegExp(`^${o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(a)) return opt;
  }
  // option appears as a whole-word phrase inside the answer
  for (const opt of options) {
    const o = opt.toLowerCase().trim();
    if (o.length >= 3 && new RegExp(`\\b${o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(a)) return opt;
  }
  return null;
}

// Normalised label key used to bridge prepared drafts ↔ live form labels.
export function normLabel(label = '') {
  return String(label)
    .toLowerCase()
    .replace(/\*/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[?:.\s]+$/, '')
    .trim();
}
