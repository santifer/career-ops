import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiceJobs, parseDiceSalary } from '../scripts/adapters/adapter-dice.mjs';

describe('parseDiceSalary', () => {

  test('null/undefined → null/null', () => {
    assert.deepEqual(parseDiceSalary(null),      { min: null, max: null });
    assert.deepEqual(parseDiceSalary(undefined), { min: null, max: null });
    assert.deepEqual(parseDiceSalary(''),        { min: null, max: null });
  });

  test('"Depends on Experience" → null/null', () => {
    assert.deepEqual(parseDiceSalary('Depends on Experience'), { min: null, max: null });
  });

  test('"Competitive" → null/null', () => {
    assert.deepEqual(parseDiceSalary('Competitive'), { min: null, max: null });
  });

  test('"$100" → 100/null', () => {
    assert.deepEqual(parseDiceSalary('$100'), { min: 100, max: null });
  });

  test('"USD 121,100.00 - 201,900.00 per year"', () => {
    const r = parseDiceSalary('USD 121,100.00 - 201,900.00 per year');
    assert.equal(r.min, 121100);
    assert.equal(r.max, 201900);
  });

  test('"$130,000 - $160,000 per year"', () => {
    const r = parseDiceSalary('$130,000 - $160,000 per year');
    assert.equal(r.min, 130000);
    assert.equal(r.max, 160000);
  });

  test('"120000" (plain number string)', () => {
    const r = parseDiceSalary('120000');
    assert.equal(r.min, 120000);
    assert.equal(r.max, null);
  });

});

describe('parseDiceJobs', () => {

  const base = {
    id: 'DICE-001',
    title: 'Senior Scrum Master',
    companyName: 'Acme',
    jobLocation: { displayName: 'Dallas, TX' },
    detailsPageUrl: 'https://dice.com/job/001',
    postedDate: '2026-06-04T08:00:00.000Z',
    salary: '$120,000 - $150,000 per year',
    employmentType: 'FULLTIME',
    isRemote: false,
    summary: 'A great job.',
    companyLogoUrl: 'https://logos.dice.com/acme.png',
    easyApply: true,
    score: 0.88,
  };

  test('parses a standard job correctly', () => {
    const [j] = parseDiceJobs([base]);
    assert.equal(j.source, 'dice');
    assert.equal(j.external_id, 'DICE-001');
    assert.equal(j.title, 'Senior Scrum Master');
    assert.equal(j.company, 'Acme');
    assert.equal(j.location, 'Dallas, TX');
    assert.equal(j.url, 'https://dice.com/job/001');
    assert.equal(j.salary_min, 120000);
    assert.equal(j.salary_max, 150000);
    assert.equal(j.employment_type, 'FULLTIME');
    assert.equal(j.remote, false);
    assert.equal(j.easy_apply, true);
    assert.equal(j.score, 0.88);
    assert.equal(j.state, 'new');
    assert.equal(j.has_connection, false);
    assert.equal(j.verified, false);
  });

  test('null jobLocation + isRemote=true → location="Remote"', () => {
    const [j] = parseDiceJobs([{ ...base, jobLocation: null, isRemote: true }]);
    assert.equal(j.location, 'Remote');
    assert.equal(j.remote, true);
  });

  test('"Depends on Experience" salary → null/null', () => {
    const [j] = parseDiceJobs([{ ...base, salary: 'Depends on Experience' }]);
    assert.equal(j.salary_min, null);
    assert.equal(j.salary_max, null);
  });

  test('summary truncated to 500 chars', () => {
    const long = 'x'.repeat(600);
    const [j] = parseDiceJobs([{ ...base, summary: long }]);
    assert.ok(j.summary.length <= 500);
    assert.ok(j.summary.endsWith('…'));
  });

  test('drops jobs with no URL', () => {
    const jobs = parseDiceJobs([{ ...base, detailsPageUrl: '' }]);
    assert.equal(jobs.length, 0);
  });

  test('drops jobs with no id or title', () => {
    assert.equal(parseDiceJobs([{ ...base, id: null }]).length, 0);
    assert.equal(parseDiceJobs([{ ...base, title: null }]).length, 0);
  });

  test('epoch millisecond postedDate parses correctly', () => {
    const epoch = Date.parse('2026-06-04T08:00:00.000Z');
    const [j] = parseDiceJobs([{ ...base, postedDate: epoch }]);
    assert.ok(j.posted_at.startsWith('2026-06-04'));
  });

  test('non-array input returns empty array', () => {
    assert.deepEqual(parseDiceJobs(null), []);
    assert.deepEqual(parseDiceJobs({}), []);
  });

});
