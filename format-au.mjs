#!/usr/bin/env node
/**
 * format-au.mjs — Australian formatting helpers.
 *
 * Provides deterministic, profile-driven date and phone formatting for
 * Australian application forms. Driven by config/profile.yml:
 *   formatting.date_format   — e.g. "DD/MM/YYYY" (default when AU)
 *   formatting.phone_country — e.g. "+61"
 *
 * Exports:
 *   formatDate(dateStr, fmt?)  → string
 *   formatPhone(phone, country?) → string
 *   isDateField(label)         → boolean
 *   isPhoneField(label)        → boolean
 */

// ── Date formatting ───────────────────────────────────────────────────────────

/**
 * Format a date string into the requested format.
 * Accepts ISO dates (YYYY-MM-DD), Date objects, or existing formatted strings.
 * Falls back to the original string when parsing fails.
 *
 * @param {string|Date} dateInput
 * @param {string} fmt — 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
 * @returns {string}
 */
export function formatDate(dateInput, fmt = 'DD/MM/YYYY') {
  if (!dateInput) return '';

  let d;
  if (dateInput instanceof Date) {
    d = dateInput;
  } else {
    // Try ISO first, then d/m/y variants
    const s = String(dateInput).trim();
    d = new Date(s);
    if (isNaN(d.getTime())) {
      // Try DD/MM/YYYY or D/M/YYYY input
      const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmyMatch) {
        d = new Date(`${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`);
      }
    }
    if (isNaN(d.getTime())) return s; // give up — return original
  }

  const dd   = String(d.getUTCDate()).padStart(2, '0');
  const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getUTCFullYear());

  switch (fmt.toUpperCase()) {
    case 'DD/MM/YYYY': return `${dd}/${mm}/${yyyy}`;
    case 'MM/DD/YYYY': return `${mm}/${dd}/${yyyy}`;
    case 'YYYY-MM-DD': return `${yyyy}-${mm}-${dd}`;
    case 'DD-MM-YYYY': return `${dd}-${mm}-${yyyy}`;
    default:           return `${dd}/${mm}/${yyyy}`;
  }
}

/**
 * Return today's date in the specified format.
 * @param {string} fmt
 * @returns {string}
 */
export function todayFormatted(fmt = 'DD/MM/YYYY') {
  return formatDate(new Date(), fmt);
}

// ── Phone formatting ──────────────────────────────────────────────────────────

/**
 * Normalise a phone number to the E.164-ish format for the given country prefix.
 * For +61 (Australia): strips leading 0 from local numbers and prepends +61.
 * Returns the original string if it cannot be confidently normalised.
 *
 * @param {string} phone
 * @param {string} countryCode — e.g. '+61'
 * @returns {string}
 */
export function formatPhone(phone, countryCode = '+61') {
  if (!phone) return '';

  const s = String(phone).replace(/[\s\-().]/g, '').trim();

  // Already has the correct country code → return as-is (just clean spacing)
  if (s.startsWith(countryCode)) return s;

  // Has a different country code → return as-is (don't reformat)
  if (s.startsWith('+')) return s;

  // AU: leading 0 followed by 9 digits → +61XXXXXXXXX
  if (countryCode === '+61') {
    if (/^0\d{9}$/.test(s)) return '+61' + s.slice(1);
    // 9 digits without leading 0 (rare but handle)
    if (/^\d{9}$/.test(s)) return '+61' + s;
  }

  // US/CA: 10 digits → +1XXXXXXXXXX
  if (countryCode === '+1') {
    if (/^\d{10}$/.test(s)) return '+1' + s;
    if (/^1\d{10}$/.test(s)) return '+' + s;
  }

  // Generic: prepend country code if all digits and length seems right
  if (/^\d{8,12}$/.test(s)) return countryCode + s;

  return phone; // can't safely reformat — return original
}

// ── Label detectors ───────────────────────────────────────────────────────────

const DATE_LABEL_RE  = /\bdate\b|dob\b|birth\b|available.+from|start.+date|end.+date|expiry/i;
const PHONE_LABEL_RE = /\bphone\b|\bmobile\b|\btelephone\b|\bcontact.+number\b/i;

/** True when the field label suggests a date input. */
export function isDateField(label = '') {
  return DATE_LABEL_RE.test(label);
}

/** True when the field label suggests a phone number input. */
export function isPhoneField(label = '') {
  return PHONE_LABEL_RE.test(label);
}
