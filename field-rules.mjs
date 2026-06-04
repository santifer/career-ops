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

    // ── Salary single-number fields ──────────────────────────────────────────
    // Used when a form expects a numeric value rather than a range string.
    // Unit is inferred from the label; config provides all magnitudes.
    { id: 'salary_thousands',
      test: /salary.*\$k|salary.*thousand|comp.*\$k|k\s*(?:p\.?a\.?|per\s+annum|per\s+year)/,
      value: () => nonEmpty(String(profile?.salary?.thousands ?? '')) },
    { id: 'salary_hourly_pt',
      test: /hourly.+rate|rate.+per.+hour|per\s+hour/,
      value: () => isPartTime
        ? nonEmpty(String(profile?.salary?.hourly_parttime ?? ''))
        : nonEmpty(String(profile?.salary?.hourly_fulltime ?? '')) },
    { id: 'salary_annual',
      test: /^(annual\s+)?salary(\s+expectation)?[*\s]*$|expected.+annual.+salary|total.+compensation/,
      value: () => nonEmpty(String(profile?.salary?.annual ?? '')) },

    // ── References ───────────────────────────────────────────────────────────
    { id: 'references',
      test: /\breferences?\b|\breferees?\b/,
      value: () => nonEmpty(a.references) || nonEmpty(profile?.references) },

    // ── EEO / Diversity (free-text) — default "prefer not to say" ────────────
    // Note: these are free-text fallbacks. Select-based EEO fields are handled
    // by matchEeoOption() below (which picks the closest option).
    { id: 'eeo_gender',
      test: /\bgender\b|\bsex\b/,
      value: () => nonEmpty(profile?.eeo?.default) || 'prefer not to say',
      guard: () => type !== 'select' },  // select variant handled by matchEeoOption
    { id: 'eeo_ethnicity',
      test: /ethnicit|race\b|racial|heritage.*origin|national.*origin|cultural.*background/,
      value: () => nonEmpty(profile?.eeo?.default) || 'prefer not to say',
      guard: () => type !== 'select' },
    { id: 'eeo_disability',
      test: /disabilit|disabled|differently.?abled/,
      value: () => nonEmpty(profile?.eeo?.default) || 'prefer not to say',
      guard: () => type !== 'select' },
    { id: 'eeo_veteran',
      test: /\bveteran\b|\bmilitary\b|\barmed.?service/,
      value: () => nonEmpty(profile?.eeo?.default) || 'prefer not to say',
      guard: () => type !== 'select' },
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

// ── EEO select-option picker ──────────────────────────────────────────────────

const EEO_GENDER_RE     = /\bgender\b|\bsex\b/i;
const EEO_ETHNICITY_RE  = /ethnicit|race\b|racial|heritage.*origin|national.*origin|cultural.*background/i;
const EEO_DISABILITY_RE = /disabilit|disabled|differently.?abled/i;
const EEO_VETERAN_RE    = /\bveteran\b|\bmilitary\b|\barmed.?service/i;

// "Prefer not to say" tokens across common wordings
const DECLINE_TOKENS    = ['prefer not', 'not to say', 'decline', 'not disclose', 'not specify',
                           'i prefer', 'choose not', 'do not wish', 'rather not', 'no answer'];

/**
 * Pick the best EEO select option.
 *
 * Logic:
 *  1. Try to match the profile's specific value (e.g. ethnicity: "Indian").
 *     Only used when the field is MANDATORY (caller passes mandatory=true) AND
 *     the profile has a non-empty specific value. Otherwise always prefer "prefer not to say".
 *  2. Prefer the "prefer not to say" / decline option from the dropdown.
 *  3. If no decline option exists → return null (field falls to Layer 2/3 / manual).
 *
 * @param {string}   label     — field label
 * @param {string[]} options   — visible dropdown options
 * @param {object}   profile   — loaded config/profile.yml
 * @param {boolean}  mandatory — whether the field is marked required
 * @returns {string | null}
 */
export function matchEeoOption(label, options, profile, mandatory = false) {
  if (!Array.isArray(options) || options.length === 0) return null;
  const l = String(label).toLowerCase();

  let specificValue = null;
  if (EEO_GENDER_RE.test(l))    specificValue = profile?.eeo?.gender    || null;
  if (EEO_ETHNICITY_RE.test(l)) specificValue = profile?.eeo?.ethnicity || null;

  // Try specific value only when mandatory AND non-empty in profile
  if (mandatory && specificValue) {
    const matched = chooseOptionDeterministic(specificValue, options);
    if (matched) return matched;
  }

  // Always prefer "prefer not to say"
  const declineOpt = options.find((opt) =>
    DECLINE_TOKENS.some((tok) => opt.toLowerCase().includes(tok))
  );
  if (declineOpt) return declineOpt;

  // No decline option → can't fill safely without guessing
  return null;
}

// ── Salary unit resolver ───────────────────────────────────────────────────────

/**
 * Resolve a single-number salary value from profile, detecting the unit
 * from the field label and whether the role is part-time.
 *
 * @param {string} label     — field label
 * @param {object} profile   — loaded config/profile.yml
 * @param {object} role      — queue role stub (for employment_type)
 * @returns {string | null}
 */
export function resolveSalaryNumber(label, profile, role = {}) {
  const s  = profile?.salary ?? {};
  const l  = String(label).toLowerCase();
  const pt = role.employment_type === 'part-time';

  // Hourly variants
  if (/per\s+hour|hourly|\/hr|\/hour/.test(l)) {
    const v = pt ? s.hourly_parttime : s.hourly_fulltime;
    return v != null && v !== '' ? String(v) : null;
  }
  // $K / thousands variants
  if (/\$k|\bk\s*(p\.?a\.?|per\s+(annum|year))|thousand/.test(l)) {
    return s.thousands != null && s.thousands !== '' ? String(s.thousands) : null;
  }
  // Annual (default for generic "salary" label)
  if (/salary|compensation|pay|remunerat|package/.test(l)) {
    return s.annual != null && s.annual !== '' ? String(s.annual) : null;
  }
  return null;
}

// ── Knockout / screener detector ───────────────────────────────────────────────

const KNOCKOUT_PATTERNS = [
  // Citizenship / clearance hard requirements
  /must\s+(be|hold|have)\s+(a\s+)?(citizen|permanent resident|security clearance|working rights)/i,
  /only.+citizens?|citizen(ship)?.+required/i,
  /require.+(citizen|clearance|australian\s+resident)/i,
  // Experience hard minimums
  /minimum\s+\d+\s+years?\s+experience|at\s+least\s+\d+\s+years?/i,
  // Degree hard requirements
  /must\s+have\s+(a\s+)?(bachelor|master|phd|degree)/i,
  /degree\s+required|tertiary\s+(qualification|degree)\s+required/i,
];

/**
 * Detect whether a label/question text represents a knockout/screener question.
 * These are binary questions where a wrong answer eliminates the candidate.
 *
 * @param {string}   label   — question label
 * @param {string[]} options — dropdown options (if select field)
 * @returns {{ isKnockout: boolean, reason?: string }}
 */
export function detectKnockout(label, options = []) {
  const l = String(label).toLowerCase();

  // Binary Yes/No questions about hard requirements
  const isBinary = options.length > 0 &&
    options.every((o) => /^(yes|no|true|false|i (do|do not)|i (am|am not))$/i.test(o.trim()));

  if (isBinary && KNOCKOUT_PATTERNS.some((p) => p.test(l))) {
    return { isKnockout: true, reason: `binary screener: "${label.slice(0, 80)}"` };
  }

  // Look for explicit minimum-requirement language
  const hasMinReq = KNOCKOUT_PATTERNS.some((p) => p.test(l));
  if (hasMinReq) {
    return { isKnockout: true, reason: `hard requirement detected: "${label.slice(0, 80)}"` };
  }

  return { isKnockout: false };
}

// ── Normalised label key used to bridge prepared drafts ↔ live form labels ────

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
