import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fillGreenhouseForm, fillLeverForm, fillWorkdayForm, fillGenericForm, fillForm } from '../scripts/form-fill.mjs';

// ── Mock Playwright page factory ──────────────────────────────────────────────
//
// Simulates a Playwright Page with a set of "present" fields.
// Calls to locator().count() return 1 if the field is in `presentFields`, 0 otherwise.

function makeMockPage(presentFields = new Set()) {
  const filled = {};
  const selected = {};
  const uploaded = {};

  function makeLocator(key, fieldName) {
    return {
      count: async () => (presentFields.has(fieldName) ? 1 : 0),
      fill:  async (val) => { filled[fieldName] = val; },
      selectOption: async (opt) => { selected[fieldName] = typeof opt === 'object' ? opt.label : opt; },
      setInputFiles: async (val) => { uploaded[fieldName] = val; },
      first: function() { return this; },
      locator: function() { return this; },
    };
  }

  const page = {
    locator: (selector) => {
      // Infer field name from selector heuristics
      let fieldName = selector;
      if (/given-name|first_name|id\*.*first/.test(selector))       fieldName = 'first_name';
      else if (/family-name|last_name|id\*.*last/.test(selector))   fieldName = 'last_name';
      else if (/email/.test(selector))                               fieldName = 'email';
      else if (/tel|phone/.test(selector))                           fieldName = 'phone';
      else if (/address-level2|city/.test(selector))                 fieldName = 'city';
      else if (/LinkedIn|linkedin/.test(selector))                   fieldName = 'linkedin';
      else if (/resume/i.test(selector))                             fieldName = 'resume_upload';
      else if (/cover/i.test(selector))                              fieldName = 'cl_upload';
      else if (/authorized to work|authorized to legally work/i.test(selector)) fieldName = 'work_auth';
      else if (/sponsorship|require visa/i.test(selector))           fieldName = 'sponsorship';
      else if (/name.*=.*name|autocomplete.*name/.test(selector))    fieldName = 'name';
      else if (/org|company|current employer/i.test(selector))       fieldName = 'org';
      else if (/legalName.*firstName|First Name/i.test(selector))   fieldName = 'first_name';
      else if (/legalName.*lastName|Last Name/i.test(selector))     fieldName = 'last_name';

      const loc = makeLocator(selector, fieldName);
      // Greenhouse/Lever label-based locators return a chained locator
      loc.locator = () => loc;
      loc.first   = () => loc;
      return loc;
    },
    $: async () => null,
    _filled:   filled,
    _selected: selected,
    _uploaded: uploaded,
  };

  return page;
}

function makePersonal(overrides = {}) {
  return {
    name:    { first: 'Jane', last: 'Doe', full: 'Jane Doe' },
    contact: { email: 'jane@example.com', phone: '+15551234567' },
    location: { city: 'San Francisco', state: 'CA', country: 'US' },
    links:    { linkedin: 'https://linkedin.com/in/janedoe', github: '', portfolio: '' },
    work_auth: { status: 'US Citizen', requires_sponsorship: false },
    experience: { years_total: 8, current_title: 'PM', current_company: 'Acme Inc' },
    resume:  { path: 'C:\\Users\\jane\\resume.pdf' },
    cover_letter: { default_path: '' },
    salary:  { min: 0, max: 0, currency: 'USD' },
    custom:  { how_heard: 'LinkedIn', authorized_to_work: true, veteran_status: 'decline', disability_status: 'decline', race_ethnicity: 'decline', gender: 'decline' },
    ...overrides,
  };
}

// ── FillReport shape ──────────────────────────────────────────────────────────

describe('FillReport shape', () => {

  test('fillGreenhouseForm returns correct shape', async () => {
    const page = makeMockPage(new Set(['first_name', 'last_name', 'email']));
    const report = await fillGreenhouseForm(page, makePersonal(), null);
    assert.ok(typeof report.filled === 'number',  'filled should be number');
    assert.ok(typeof report.total  === 'number',  'total should be number');
    assert.ok(Array.isArray(report.missing_fields), 'missing_fields should be array');
    assert.equal(report.ats, 'greenhouse');
  });

  test('fillLeverForm returns correct shape', async () => {
    const page = makeMockPage(new Set(['name', 'email']));
    const report = await fillLeverForm(page, makePersonal(), null);
    assert.equal(report.ats, 'lever');
    assert.ok(typeof report.filled === 'number');
    assert.ok(Array.isArray(report.missing_fields));
  });

  test('fillWorkdayForm returns correct shape', async () => {
    const page = makeMockPage(new Set(['first_name']));
    const report = await fillWorkdayForm(page, makePersonal(), null);
    assert.equal(report.ats, 'workday');
  });

  test('fillGenericForm returns correct shape', async () => {
    const page = makeMockPage(new Set(['email', 'given_name']));
    const report = await fillGenericForm(page, makePersonal(), null);
    assert.equal(report.ats, 'generic');
  });

});

// ── Field count accuracy ──────────────────────────────────────────────────────

describe('field fill counts', () => {

  test('greenhouse: 3 fields present → filled=3', async () => {
    const page = makeMockPage(new Set(['first_name', 'last_name', 'email']));
    const report = await fillGreenhouseForm(page, makePersonal(), null);
    assert.equal(report.filled, 3, 'exactly 3 present fields should be filled');
  });

  test('greenhouse: 0 fields present → filled=0, all in missing_fields', async () => {
    const page = makeMockPage(new Set());
    const report = await fillGreenhouseForm(page, makePersonal(), null);
    assert.equal(report.filled, 0);
    assert.ok(report.missing_fields.length > 0, 'should list missing fields');
  });

  test('lever: name + email present → filled=2', async () => {
    const page = makeMockPage(new Set(['name', 'email']));
    const report = await fillLeverForm(page, makePersonal(), null);
    assert.equal(report.filled, 2);
  });

  test('missing_fields lists absent fields correctly', async () => {
    const page = makeMockPage(new Set(['email']));
    const report = await fillGreenhouseForm(page, makePersonal(), null);
    assert.ok(report.missing_fields.includes('first_name'), 'first_name should be missing');
    assert.ok(report.missing_fields.includes('last_name'),  'last_name should be missing');
    assert.ok(!report.missing_fields.includes('email'),     'email should NOT be missing');
  });

});

// ── CL fallback behaviour ─────────────────────────────────────────────────────

describe('cover letter fallback', () => {

  test('uses matched clPath when provided', async () => {
    const page = makeMockPage(new Set(['cl_upload']));
    const personal = makePersonal({ cover_letter: { default_path: 'cover-letters/default.txt' } });
    const report = await fillGreenhouseForm(page, personal, 'cover-letters/stripe-cl.txt');
    assert.equal(page._uploaded['cl_upload'], 'cover-letters/stripe-cl.txt');
    assert.equal(report.filled, 1);
  });

  test('falls back to default_path when clPath is null', async () => {
    const page = makeMockPage(new Set(['cl_upload']));
    const personal = makePersonal({ cover_letter: { default_path: 'cover-letters/default.txt' } });
    await fillGreenhouseForm(page, personal, null);
    assert.equal(page._uploaded['cl_upload'], 'cover-letters/default.txt');
  });

  test('skips cl upload when both clPath and default_path are absent', async () => {
    const page = makeMockPage(new Set(['cl_upload']));
    const personal = makePersonal({ cover_letter: { default_path: '' } });
    const report = await fillGreenhouseForm(page, personal, null);
    assert.ok(report.missing_fields.includes('cl_upload'), 'should list cl_upload as missing when no path');
  });

});

// ── ATS dispatcher ────────────────────────────────────────────────────────────

describe('fillForm ATS dispatch', () => {

  test('greenhouse dispatches to fillGreenhouseForm', async () => {
    const page = makeMockPage(new Set(['first_name']));
    const report = await fillForm('greenhouse', page, makePersonal(), null);
    assert.equal(report.ats, 'greenhouse');
  });

  test('lever dispatches to fillLeverForm', async () => {
    const page = makeMockPage(new Set(['name']));
    const report = await fillForm('lever', page, makePersonal(), null);
    assert.equal(report.ats, 'lever');
  });

  test('workday dispatches to fillWorkdayForm', async () => {
    const page = makeMockPage(new Set(['first_name']));
    const report = await fillForm('workday', page, makePersonal(), null);
    assert.equal(report.ats, 'workday');
  });

  test('unknown ATS falls back to fillGenericForm', async () => {
    const page = makeMockPage(new Set(['email']));
    const report = await fillForm('ashby', page, makePersonal(), null);
    assert.equal(report.ats, 'generic');
  });

  test('ashby (not explicitly handled) uses generic', async () => {
    const page = makeMockPage(new Set(['given_name', 'email']));
    const report = await fillForm('ashby', page, makePersonal(), null);
    assert.equal(report.ats, 'generic');
  });

});

// ── No-crash on missing personal sub-keys ────────────────────────────────────

describe('null-safety', () => {

  test('fillGreenhouseForm does not crash when phone is empty string', async () => {
    const page = makeMockPage(new Set(['phone']));
    const personal = makePersonal({ contact: { email: 'j@x.com', phone: '' } });
    const report = await fillGreenhouseForm(page, personal, null);
    // phone field present but value empty → tryFill returns false → missing_fields includes phone
    assert.ok(report.missing_fields.includes('phone'), 'empty phone should not be filled');
  });

  test('fillLeverForm does not crash when links is absent', async () => {
    const page = makeMockPage(new Set(['name', 'email']));
    const personal = makePersonal({ links: undefined });
    await assert.doesNotReject(
      () => fillLeverForm(page, personal, null),
      'should not throw on missing links'
    );
  });

});

// ── fill() uses correct data from personal ────────────────────────────────────

describe('data wiring', () => {

  test('greenhouse first_name is filled with personal.name.first', async () => {
    const page = makeMockPage(new Set(['first_name']));
    await fillGreenhouseForm(page, makePersonal(), null);
    assert.equal(page._filled['first_name'], 'Jane');
  });

  test('greenhouse email is filled with personal.contact.email', async () => {
    const page = makeMockPage(new Set(['email']));
    await fillGreenhouseForm(page, makePersonal(), null);
    assert.equal(page._filled['email'], 'jane@example.com');
  });

  test('lever name is filled with personal.name.full', async () => {
    const page = makeMockPage(new Set(['name']));
    await fillLeverForm(page, makePersonal(), null);
    assert.equal(page._filled['name'], 'Jane Doe');
  });

  test('resume path is passed to file upload', async () => {
    const page = makeMockPage(new Set(['resume_upload']));
    await fillGreenhouseForm(page, makePersonal(), null);
    assert.equal(page._uploaded['resume_upload'], 'C:\\Users\\jane\\resume.pdf');
  });

});
