#!/usr/bin/env node
/**
 * login-core.mjs — Login-wall and registration-form classifier (zero cost).
 *
 * Pure function: takes text signals derived from the page DOM and returns a
 * classification of the current page state.  Mirrors the structure of
 * liveness-core.mjs so the same pattern is applied consistently.
 *
 * Results:
 *   'form-visible'      — Application form fields visible; fill can proceed.
 *   'login-wall'        — Sign-in/register wall; need to authenticate first.
 *   'registration-form' — Account-creation form visible; can auto-fill + register.
 *   'confirmation'      — Submission confirmation page detected.
 *   'already-applied'   — Portal indicates the candidate has already applied.
 *   'uncertain'         — Cannot classify; caller should proceed with caution.
 *
 * classifyLoginState({ bodyText, formLabels, buttons, inputCount, textareaCount })
 * classifyConfirmation({ bodyText })
 */

// ── Login-wall signals ────────────────────────────────────────────────────────

const LOGIN_WALL_PATTERNS = [
  /please\s+(sign|log)\s*in/i,
  /you\s+must\s+(sign|log)\s*in/i,
  /sign\s*in\s+to\s+(continue|apply|access)/i,
  /log\s*in\s+to\s+(continue|apply|access)/i,
  /login\s+required/i,
  /authentication\s+required/i,
  /session\s+expired/i,
  /not\s+logged\s+in/i,
  /you\s+are\s+not\s+signed\s+in/i,
];

// Button/link text that indicates a login wall
const LOGIN_BUTTON_PATTERNS = [
  /^sign\s*in$/i,
  /^log\s*in$/i,
  /^login$/i,
];

// ── Registration form signals ─────────────────────────────────────────────────

const REGISTRATION_PAGE_PATTERNS = [
  /create\s+(an?\s+)?account/i,
  /register\s+(for\s+)?(an?\s+)?account/i,
  /sign\s*up\s+(to|for)/i,
  /new\s+(candidate\s+)?account/i,
  /join.*portal/i,
  /get\s+started.*register/i,
];

// Labels typical on a registration form (not an application form)
const REGISTRATION_LABEL_PATTERNS = [
  /confirm\s+password|password\s+confirm/i,
  /create\s+password|new\s+password/i,
  /\bpassword\b/i,
];

// ── Application form signals ──────────────────────────────────────────────────

// Presence of these labels strongly indicates a real application form
const APP_FORM_LABEL_PATTERNS = [
  /cover\s+letter/i,
  /why.*apply|why.*role|why.*company/i,
  /tell\s+us\s+about\s+yourself/i,
  /upload\s+(resume|cv)|attach\s+(resume|cv)/i,
  /work\s+(authoris|authoriz|rights)/i,
  /salary\s+expect/i,
  /notice\s+period/i,
  /start\s+date/i,
  /previous\s+experience/i,
  /selection\s+criteria/i,
];

// ── Confirmation page signals ─────────────────────────────────────────────────

const CONFIRMATION_PATTERNS = [
  /application\s+(has\s+been\s+)?(submitted|received|sent|complete)/i,
  /successfully\s+(applied|submitted|sent)/i,
  /thank\s+you\s+for\s+(applying|your\s+application|submitting)/i,
  /application\s+complete/i,
  /your\s+application\s+is\s+(confirmed|on\s+its\s+way)/i,
  /we.*received\s+your\s+application/i,
  /we.*review\s+your\s+application/i,
];

// Regex to extract a confirmation / reference number from the page
export const CONFIRMATION_NUM_RE =
  /(?:reference|confirmation|application|submission)\s*(?:number|no\.?|#|id|code)[:\s#]*([A-Z0-9][A-Z0-9-]{3,})/i;

// ── Already-applied signals ───────────────────────────────────────────────────

const ALREADY_APPLIED_PATTERNS = [
  /you\s+have\s+already\s+applied/i,
  /already\s+applied\s+to\s+this/i,
  /application\s+already\s+exists/i,
  /duplicate\s+application/i,
  /you.*submitted.*application.*position/i,
];

// ── Helper ────────────────────────────────────────────────────────────────────

function anyMatch(patterns, text = '') {
  return patterns.some((p) => p.test(text));
}

// ── Classifier ────────────────────────────────────────────────────────────────

/**
 * Classify the current page state from DOM-derived signals.
 *
 * @param {object} signals
 * @param {string}   signals.bodyText      — visible inner text of the page body
 * @param {string[]} signals.formLabels    — array of visible label texts
 * @param {string[]} signals.buttons       — array of visible button/link texts
 * @param {number}   signals.inputCount    — count of visible, editable <input> fields
 * @param {number}   signals.textareaCount — count of visible <textarea> fields
 * @returns {{ result: string, reason: string }}
 */
export function classifyLoginState({
  bodyText = '',
  formLabels = [],
  buttons = [],
  inputCount = 0,
  textareaCount = 0,
} = {}) {
  const labelsJoined = formLabels.join('\n');

  // ── Already applied ───────────────────────────────────────────────────────
  if (anyMatch(ALREADY_APPLIED_PATTERNS, bodyText)) {
    return { result: 'already-applied', reason: 'portal indicates prior application' };
  }

  // ── Application form visible ───────────────────────────────────────────────
  // Strong signal: has editable inputs AND at least one application-specific label
  const hasAppLabel = anyMatch(APP_FORM_LABEL_PATTERNS, labelsJoined);
  const hasInputs   = inputCount + textareaCount >= 2;
  if (hasInputs && hasAppLabel) {
    return { result: 'form-visible', reason: 'application form fields detected' };
  }
  // Weaker signal: many editable inputs without known labels — still probably a form
  if (inputCount + textareaCount >= 4) {
    return { result: 'form-visible', reason: `${inputCount + textareaCount} editable inputs — treating as form` };
  }

  // ── Registration form ──────────────────────────────────────────────────────
  const isRegPage  = anyMatch(REGISTRATION_PAGE_PATTERNS, bodyText);
  const hasPassLbl = anyMatch(REGISTRATION_LABEL_PATTERNS, labelsJoined);
  if ((isRegPage || hasPassLbl) && inputCount >= 2) {
    return { result: 'registration-form', reason: 'account creation form detected' };
  }

  // ── Login wall ─────────────────────────────────────────────────────────────
  if (anyMatch(LOGIN_WALL_PATTERNS, bodyText)) {
    return { result: 'login-wall', reason: 'login-required text detected' };
  }
  const hasLoginBtn = buttons.some((b) => anyMatch(LOGIN_BUTTON_PATTERNS, b));
  if (hasLoginBtn && inputCount <= 3) {
    return { result: 'login-wall', reason: 'login button detected with few/no form fields' };
  }

  // ── Application form (fallback: some inputs, no login signals) ─────────────
  if (inputCount + textareaCount >= 2) {
    return { result: 'form-visible', reason: 'editable inputs present (no login signals)' };
  }

  return { result: 'uncertain', reason: 'no clear signals — page may still be loading' };
}

/**
 * Classify whether the page is a post-submission confirmation.
 *
 * @param {object} signals
 * @param {string} signals.bodyText
 * @returns {{ result: 'confirmation' | 'not-confirmation', confirmationNum?: string, reason: string }}
 */
export function classifyConfirmation({ bodyText = '' } = {}) {
  if (anyMatch(CONFIRMATION_PATTERNS, bodyText)) {
    const m = bodyText.match(CONFIRMATION_NUM_RE);
    return {
      result: 'confirmation',
      confirmationNum: m ? m[1] : null,
      reason: 'confirmation text detected',
    };
  }
  return { result: 'not-confirmation', reason: 'no confirmation signals' };
}
