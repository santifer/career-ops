#!/usr/bin/env node
/**
 * form-fill.mjs — Playwright form-fill helpers for Greenhouse, Lever, Workday, and generic ATS.
 *
 * Each fill function returns a FillReport:
 *   { filled: number, total: number, missing_fields: string[], ats: string }
 *
 * "filled" = field was present on the page AND we successfully set a value.
 * "missing_fields" = fields we tried but couldn't locate (not present on this particular form).
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Try filling a field by locator. Returns true if found and filled, false if not present.
 * Never throws — a field being absent from the form is expected.
 */
async function tryFill(locator, value) {
  if (!value) return false;
  try {
    const count = await locator.count();
    if (count === 0) return false;
    await locator.first().fill(String(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Try selecting an option in a <select>. Returns true on success.
 * Attempts match by label (visible text), then value attribute.
 */
async function trySelect(locator, label) {
  if (!label) return false;
  try {
    const count = await locator.count();
    if (count === 0) return false;
    try {
      await locator.first().selectOption({ label });
    } catch {
      await locator.first().selectOption(label);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Try uploading a file via input[type="file"]. Returns true on success.
 */
async function tryUpload(locator, filePath) {
  if (!filePath) return false;
  try {
    const count = await locator.count();
    if (count === 0) return false;
    await locator.first().setInputFiles(filePath);
    return true;
  } catch {
    return false;
  }
}

// ── Greenhouse ────────────────────────────────────────────────────────────────

/**
 * Fill a standard Greenhouse application form.
 * @param {import('playwright').Page} page
 * @param {object} personal  Output of loadPersonalInfo()
 * @param {string|null} clPath  Resolved CL file path (or null → personal.cover_letter.default_path)
 * @returns {FillReport}
 */
export async function fillGreenhouseForm(page, personal, clPath = null) {
  const fields = [
    { name: 'first_name',    fn: () => tryFill(page.locator('input[autocomplete="given-name"], input[name="first_name"], input[id*="first"]').first(), personal.name?.first) },
    { name: 'last_name',     fn: () => tryFill(page.locator('input[autocomplete="family-name"], input[name="last_name"], input[id*="last"]').first(), personal.name?.last) },
    { name: 'email',         fn: () => tryFill(page.locator('input[autocomplete="email"], input[type="email"], input[name="email"]').first(), personal.contact?.email) },
    { name: 'phone',         fn: () => tryFill(page.locator('input[autocomplete="tel"], input[type="tel"], input[name="phone"]').first(), personal.contact?.phone) },
    { name: 'city',          fn: () => tryFill(page.locator('input[autocomplete="address-level2"], input[name="city"]').first(), personal.location?.city) },
    { name: 'linkedin',      fn: () => tryFill(
      page.locator('label:has-text("LinkedIn"), label:has-text("linkedin")').locator('xpath=following::input[1]').first(),
      personal.links?.linkedin
    ) },
    { name: 'resume_upload', fn: () => tryUpload(
      page.locator('input[type="file"][aria-label*="resume" i], input[type="file"][name*="resume" i]').first(),
      personal.resume?.path
    ) },
    { name: 'cl_upload', fn: () => {
      const cl = clPath || personal.cover_letter?.default_path;
      return tryUpload(
        page.locator('input[type="file"][aria-label*="cover" i], input[type="file"][name*="cover" i]').first(),
        cl
      );
    } },
    { name: 'work_auth', fn: () => trySelect(
      page.locator('label:has-text("authorized to work"), label:has-text("authorized to legally work")').locator('xpath=following::select[1]').first(),
      personal.custom?.authorized_to_work ? 'Yes' : 'No'
    ) },
    { name: 'sponsorship', fn: () => trySelect(
      page.locator('label:has-text("require sponsorship"), label:has-text("require visa sponsorship")').locator('xpath=following::select[1]').first(),
      personal.work_auth?.requires_sponsorship ? 'Yes' : 'No'
    ) },
  ];

  return _runFields(fields, 'greenhouse');
}

// ── Lever ─────────────────────────────────────────────────────────────────────

/**
 * Fill a standard Lever application form.
 */
export async function fillLeverForm(page, personal, clPath = null) {
  const fields = [
    { name: 'name',          fn: () => tryFill(page.locator('input[name="name"], input[autocomplete="name"]').first(), personal.name?.full) },
    { name: 'email',         fn: () => tryFill(page.locator('input[name="email"], input[type="email"]').first(), personal.contact?.email) },
    { name: 'phone',         fn: () => tryFill(page.locator('input[name="phone"], input[type="tel"]').first(), personal.contact?.phone) },
    { name: 'org',           fn: () => tryFill(page.locator('input[name="org"], input[placeholder*="company" i], input[placeholder*="current employer" i]').first(), personal.experience?.current_company) },
    { name: 'linkedin',      fn: () => tryFill(page.locator('input[name="urls[LinkedIn]"], input[placeholder*="linkedin" i]').first(), personal.links?.linkedin) },
    { name: 'resume_upload', fn: () => tryUpload(
      page.locator('input[type="file"][name="resume"], input[type="file"][aria-label*="resume" i]').first(),
      personal.resume?.path
    ) },
    { name: 'cl_upload', fn: () => {
      const cl = clPath || personal.cover_letter?.default_path;
      return tryUpload(
        page.locator('input[type="file"][name="cover_letter"], input[type="file"][aria-label*="cover" i]').first(),
        cl
      );
    } },
  ];

  return _runFields(fields, 'lever');
}

// ── Workday ───────────────────────────────────────────────────────────────────

/**
 * Fill a Workday application form (best-effort — Workday is multi-step with auth walls).
 * v1: fills the first visible fields only.
 */
export async function fillWorkdayForm(page, personal, clPath = null) {
  const fields = [
    { name: 'first_name', fn: () => tryFill(page.locator('[data-automation-id="legalNameSection_firstName"], input[aria-label*="First Name" i]').first(), personal.name?.first) },
    { name: 'last_name',  fn: () => tryFill(page.locator('[data-automation-id="legalNameSection_lastName"], input[aria-label*="Last Name" i]').first(), personal.name?.last) },
    { name: 'email',      fn: () => tryFill(page.locator('[data-automation-id="email"], input[aria-label*="Email" i]').first(), personal.contact?.email) },
    { name: 'phone',      fn: () => tryFill(page.locator('[data-automation-id="phone"], input[aria-label*="Phone" i]').first(), personal.contact?.phone) },
    { name: 'resume_upload', fn: () => tryUpload(
      page.locator('input[type="file"][aria-label*="resume" i], [data-automation-id*="resume" i] input[type="file"]').first(),
      personal.resume?.path
    ) },
  ];

  return _runFields(fields, 'workday');
}

// ── Generic fallback ──────────────────────────────────────────────────────────

/**
 * Generic fill using common autocomplete attributes.
 * Works as a fallback for any ATS not explicitly handled.
 */
export async function fillGenericForm(page, personal, clPath = null) {
  const fields = [
    { name: 'given_name',  fn: () => tryFill(page.locator('input[autocomplete="given-name"]').first(),  personal.name?.first) },
    { name: 'family_name', fn: () => tryFill(page.locator('input[autocomplete="family-name"]').first(), personal.name?.last) },
    { name: 'email',       fn: () => tryFill(page.locator('input[autocomplete="email"], input[type="email"]').first(), personal.contact?.email) },
    { name: 'tel',         fn: () => tryFill(page.locator('input[autocomplete="tel"], input[type="tel"]').first(), personal.contact?.phone) },
    { name: 'resume_upload', fn: () => tryUpload(
      page.locator('input[type="file"][aria-label*="resume" i]').first(),
      personal.resume?.path
    ) },
  ];

  return _runFields(fields, 'generic');
}

// ── ATS dispatcher ────────────────────────────────────────────────────────────

/**
 * Dispatch to the correct fill function based on detected ATS.
 * Falls back to fillGenericForm for unknown ATS.
 * @param {string} ats  'greenhouse' | 'lever' | 'workday' | 'ashby' | any
 * @param {import('playwright').Page} page
 * @param {object} personal
 * @param {string|null} clPath
 * @returns {FillReport}
 */
export async function fillForm(ats, page, personal, clPath = null) {
  switch (ats) {
    case 'greenhouse': return fillGreenhouseForm(page, personal, clPath);
    case 'lever':      return fillLeverForm(page, personal, clPath);
    case 'workday':    return fillWorkdayForm(page, personal, clPath);
    default:           return fillGenericForm(page, personal, clPath);
  }
}

// ── Internal runner ───────────────────────────────────────────────────────────

async function _runFields(fields, ats) {
  const missing_fields = [];
  let filled = 0;

  for (const { name, fn } of fields) {
    const ok = await fn();
    if (ok) {
      filled++;
    } else {
      missing_fields.push(name);
    }
  }

  return { filled, total: fields.length, missing_fields, ats };
}
