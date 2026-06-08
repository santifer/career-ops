import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseGreenhouseWorkerResponse } from '../scripts/adapters/adapter-greenhouse.mjs';

const TS = '2026-06-08T06:00:00.000Z';

function makeWorkerResponse(overrides = {}) {
  return {
    source:  'greenhouse',
    company: 'stripe',
    count:   1,
    jobs: [{
      source:           'greenhouse',
      external_id:      '5200456001',
      title:            'Senior Program Manager',
      company:          'stripe',
      location:         'Remote',
      url:              'https://job-boards.greenhouse.io/stripe/jobs/5200456001',
      posted_at:        '2026-06-07T10:00:00.000Z',
      ingested_at:      TS,
      state:            'new',
      salary_min:       null,
      salary_max:       null,
      employment_type:  null,
      remote:           true,
      summary:          null,
      company_logo_url: null,
      easy_apply:       null,
      score:            null,
      has_connection:   false,
      verified:         true,
    }],
    ...overrides,
  };
}

describe('parseGreenhouseWorkerResponse', () => {

  test('parses a standard Worker response', () => {
    const jobs = parseGreenhouseWorkerResponse(makeWorkerResponse(), 'stripe', TS);
    assert.equal(jobs.length, 1);
    const j = jobs[0];
    assert.equal(j.source, 'greenhouse');
    assert.equal(j.external_id, '5200456001');
    assert.equal(j.title, 'Senior Program Manager');
    assert.equal(j.company, 'stripe');
    assert.equal(j.location, 'Remote');
    assert.equal(j.remote, true);
    assert.equal(j.verified, true);
    assert.equal(j.state, 'new');
    assert.equal(j.has_connection, false);
  });

  test('stamps ingested_at with provided value', () => {
    const customTs = '2026-06-08T10:00:00.000Z';
    const [j] = parseGreenhouseWorkerResponse(makeWorkerResponse(), 'stripe', customTs);
    assert.equal(j.ingested_at, customTs);
  });

  test('falls back to companySlug when both job.company and response.company are blank', () => {
    const resp = makeWorkerResponse();
    resp.company = '';
    resp.jobs[0].company = '';
    const [j] = parseGreenhouseWorkerResponse(resp, 'mycompany', TS);
    assert.equal(j.company, 'mycompany');
  });

  test('returns empty array for error response', () => {
    assert.deepEqual(parseGreenhouseWorkerResponse({ error: 'not found' }, 'x', TS), []);
  });

  test('returns empty array for null/undefined input', () => {
    assert.deepEqual(parseGreenhouseWorkerResponse(null, 'x', TS), []);
    assert.deepEqual(parseGreenhouseWorkerResponse(undefined, 'x', TS), []);
  });

  test('skips jobs missing required fields', () => {
    const resp = makeWorkerResponse({
      jobs: [
        { external_id: '001', title: 'PM', company: 'stripe', url: '' }, // missing url
        { external_id: '', title: 'PM', company: 'stripe', url: 'https://x.com' }, // missing id
        { external_id: '003', title: '', company: 'stripe', url: 'https://x.com' }, // missing title
      ],
    });
    assert.equal(parseGreenhouseWorkerResponse(resp, 'stripe', TS).length, 0);
  });

  test('handles empty jobs array', () => {
    assert.deepEqual(parseGreenhouseWorkerResponse({ source: 'greenhouse', company: 'stripe', count: 0, jobs: [] }, 'stripe', TS), []);
  });

  test('remote=true when location contains "remote"', () => {
    const resp = makeWorkerResponse();
    resp.jobs[0].remote = undefined;
    resp.jobs[0].location = 'Remote - United States';
    const [j] = parseGreenhouseWorkerResponse(resp, 'stripe', TS);
    assert.equal(j.remote, true);
  });

  test('multi-company fixture: parses both stripe (5 jobs) and anthropic (0 jobs)', async () => {
    const fs = await import('node:fs/promises');
    const fixture = JSON.parse(await fs.readFile('fixtures/greenhouse-sample.json', 'utf8'));
    let total = 0;
    for (const resp of fixture) {
      const jobs = parseGreenhouseWorkerResponse(resp, resp.company, TS);
      total += jobs.length;
    }
    assert.equal(total, 5); // 5 stripe + 0 anthropic
  });

});
