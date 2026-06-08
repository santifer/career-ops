import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseLeverWorkerResponse } from '../scripts/adapters/adapter-lever.mjs';

const TS = '2026-06-08T06:00:00.000Z';

function makeWorkerResponse(overrides = {}) {
  return {
    source:  'lever',
    company: 'figma',
    count:   1,
    jobs: [{
      source:           'lever',
      external_id:      'abc-001-figma',
      title:            'Technical Program Manager',
      company:          'figma',
      location:         'Remote',
      url:              'https://jobs.lever.co/figma/abc-001-figma',
      posted_at:        '2026-06-07T09:00:00.000Z',
      ingested_at:      TS,
      state:            'new',
      salary_min:       null,
      salary_max:       null,
      employment_type:  'Full-time',
      remote:           true,
      summary:          'Figma seeks a TPM to lead cross-functional delivery.',
      company_logo_url: null,
      easy_apply:       null,
      score:            null,
      has_connection:   false,
      verified:         true,
    }],
    ...overrides,
  };
}

describe('parseLeverWorkerResponse', () => {

  test('parses a standard Worker response', () => {
    const jobs = parseLeverWorkerResponse(makeWorkerResponse(), 'figma', TS);
    assert.equal(jobs.length, 1);
    const j = jobs[0];
    assert.equal(j.source, 'lever');
    assert.equal(j.external_id, 'abc-001-figma');
    assert.equal(j.title, 'Technical Program Manager');
    assert.equal(j.employment_type, 'Full-time');
    assert.equal(j.remote, true);
    assert.equal(j.verified, true);
    assert.equal(j.state, 'new');
  });

  test('summary truncated to 500 chars', () => {
    const resp = makeWorkerResponse();
    resp.jobs[0].summary = 'x'.repeat(600);
    const [j] = parseLeverWorkerResponse(resp, 'figma', TS);
    assert.ok(j.summary.length <= 500);
    assert.ok(j.summary.endsWith('…'));
  });

  test('null summary stays null', () => {
    const resp = makeWorkerResponse();
    resp.jobs[0].summary = null;
    const [j] = parseLeverWorkerResponse(resp, 'figma', TS);
    assert.equal(j.summary, null);
  });

  test('falls back to companySlug when both job.company and response.company are blank', () => {
    const resp = makeWorkerResponse();
    resp.company = '';
    resp.jobs[0].company = '';
    const [j] = parseLeverWorkerResponse(resp, 'myco', TS);
    assert.equal(j.company, 'myco');
  });

  test('returns empty array for error response', () => {
    assert.deepEqual(parseLeverWorkerResponse({ error: 'not found' }, 'x', TS), []);
  });

  test('returns empty array for null/undefined input', () => {
    assert.deepEqual(parseLeverWorkerResponse(null, 'x', TS), []);
    assert.deepEqual(parseLeverWorkerResponse(undefined, 'x', TS), []);
  });

  test('skips jobs missing required fields (no url)', () => {
    const resp = makeWorkerResponse({ jobs: [{ external_id: '1', title: 'PM', url: '' }] });
    assert.equal(parseLeverWorkerResponse(resp, 'co', TS).length, 0);
  });

  test('remote=true when location contains "Remote"', () => {
    const resp = makeWorkerResponse();
    resp.jobs[0].remote = undefined;
    resp.jobs[0].location = 'Remote - US';
    const [j] = parseLeverWorkerResponse(resp, 'figma', TS);
    assert.equal(j.remote, true);
  });

  test('multi-response fixture: 5 figma jobs (including 1 dedup target)', async () => {
    const fs = await import('node:fs/promises');
    const fixture = JSON.parse(await fs.readFile('fixtures/lever-sample.json', 'utf8'));
    let total = 0;
    for (const resp of fixture) {
      total += parseLeverWorkerResponse(resp, resp.company, TS).length;
    }
    assert.equal(total, 5);
  });

  test('verified is always true (Worker-fetched = API-attested)', () => {
    const resp = makeWorkerResponse();
    resp.jobs[0].verified = false; // should be overridden
    const [j] = parseLeverWorkerResponse(resp, 'figma', TS);
    assert.equal(j.verified, true);
  });

});
