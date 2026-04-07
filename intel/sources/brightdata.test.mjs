import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execute, estimateCost, isAvailable } from './brightdata.mjs';

const SAVED_KEY = process.env.BRIGHTDATA_API_KEY;

afterEach(() => {
  if (SAVED_KEY === undefined) {
    delete process.env.BRIGHTDATA_API_KEY;
  } else {
    process.env.BRIGHTDATA_API_KEY = SAVED_KEY;
  }
  globalThis.fetch = undefined;
});

// ─── isAvailable ────────────────────────────────────────────────────────────

describe('isAvailable', () => {
  it('returns true when BRIGHTDATA_API_KEY is set', () => {
    process.env.BRIGHTDATA_API_KEY = 'test-key';
    assert.equal(isAvailable(), true);
  });

  it('returns false when BRIGHTDATA_API_KEY is not set', () => {
    delete process.env.BRIGHTDATA_API_KEY;
    assert.equal(isAvailable(), false);
  });
});

// ─── estimateCost ───────────────────────────────────────────────────────────

describe('estimateCost', () => {
  it('returns $0.05 for linkedin_profile', () => assert.equal(estimateCost('linkedin_profile'), 0.05));
  it('returns $0.03 for linkedin_jobs', () => assert.equal(estimateCost('linkedin_jobs'), 0.03));
  it('returns $0.01 for scrape', () => assert.equal(estimateCost('scrape'), 0.01));
  it('returns $0 for unknown', () => assert.equal(estimateCost('unknown'), 0));
});

// ─── execute: throws without API key ────────────────────────────────────────

describe('execute without API key', () => {
  it('throws if BRIGHTDATA_API_KEY is missing', async () => {
    delete process.env.BRIGHTDATA_API_KEY;
    await assert.rejects(
      () => execute({ query: 'test', type: 'linkedin_profile', url: 'https://linkedin.com/in/test' }),
      /BRIGHTDATA_API_KEY/,
    );
  });
});

// ─── execute: linkedin_profile ──────────────────────────────────────────────

describe('execute linkedin_profile', () => {
  beforeEach(() => { process.env.BRIGHTDATA_API_KEY = 'test-key'; });

  it('calls trigger endpoint with correct dataset_id and normalizes results', async () => {
    const mockData = [
      {
        name: 'Jane Doe',
        url: 'https://linkedin.com/in/janedoe',
        about: 'AI Engineer at Anthropic',
        title: 'Senior AI Engineer',
        company: 'Anthropic',
        location: 'San Francisco',
        connections: 500,
      },
    ];
    globalThis.fetch = async (url, opts) => {
      assert.ok(url.includes('gd_l1viktl72bvl7bjuj0'), `expected linkedin_profile dataset_id, got ${url}`);
      assert.ok(url.includes('format=json'));
      const body = JSON.parse(opts.body);
      assert.ok(Array.isArray(body), 'body should be an array');
      assert.equal(body[0].url, 'https://linkedin.com/in/janedoe');
      return { ok: true, json: async () => mockData };
    };

    const results = await execute({
      query: 'Jane Doe',
      type: 'linkedin_profile',
      url: 'https://linkedin.com/in/janedoe',
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'Jane Doe');
    assert.equal(results[0].url, 'https://linkedin.com/in/janedoe');
    assert.equal(results[0].snippet, 'AI Engineer at Anthropic');
    assert.equal(results[0].metadata.jobTitle, 'Senior AI Engineer');
    assert.equal(results[0].metadata.company, 'Anthropic');
    assert.equal(results[0].metadata.location, 'San Francisco');
    assert.equal(results[0].metadata.connections, 500);
    assert.equal(results[0].source, 'brightdata');
  });

  it('returns [] on fetch error', async () => {
    globalThis.fetch = async () => { throw new Error('network error'); };
    const results = await execute({
      query: 'Jane Doe',
      type: 'linkedin_profile',
      url: 'https://linkedin.com/in/janedoe',
    });
    assert.deepEqual(results, []);
  });

  it('returns [] on non-ok response', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({}) });
    const results = await execute({
      query: 'Jane Doe',
      type: 'linkedin_profile',
      url: 'https://linkedin.com/in/janedoe',
    });
    assert.deepEqual(results, []);
  });
});

// ─── execute: linkedin_jobs ──────────────────────────────────────────────────

describe('execute linkedin_jobs', () => {
  beforeEach(() => { process.env.BRIGHTDATA_API_KEY = 'test-key'; });

  it('calls trigger endpoint with correct dataset_id and normalizes results', async () => {
    const mockData = [
      {
        title: 'ML Engineer',
        url: 'https://linkedin.com/jobs/view/123',
        description: 'Build ML systems',
        company_name: 'Stripe',
        location: 'Remote',
        salary: '$200k',
        postedDate: '2026-04-01',
      },
    ];
    globalThis.fetch = async (url, opts) => {
      assert.ok(url.includes('gd_l7q7dkf244hwjntr0'), `expected linkedin_jobs dataset_id, got ${url}`);
      const body = JSON.parse(opts.body);
      assert.ok(Array.isArray(body));
      assert.equal(body[0].url, 'https://linkedin.com/jobs/view/123');
      return { ok: true, json: async () => mockData };
    };

    const results = await execute({
      query: 'ML jobs',
      type: 'linkedin_jobs',
      url: 'https://linkedin.com/jobs/view/123',
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'ML Engineer');
    assert.equal(results[0].url, 'https://linkedin.com/jobs/view/123');
    assert.equal(results[0].snippet, 'Build ML systems');
    assert.equal(results[0].metadata.company, 'Stripe');
    assert.equal(results[0].metadata.location, 'Remote');
    assert.equal(results[0].metadata.salary, '$200k');
    assert.equal(results[0].source, 'brightdata');
  });

  it('falls back to job_title if title is missing', async () => {
    const mockData = [
      {
        job_title: 'AI Product Manager',
        url: 'https://linkedin.com/jobs/view/456',
        description: 'Lead AI products',
        company_name: 'OpenAI',
      },
    ];
    globalThis.fetch = async () => ({ ok: true, json: async () => mockData });

    const results = await execute({
      query: 'PM jobs',
      type: 'linkedin_jobs',
      url: 'https://linkedin.com/jobs/view/456',
    });
    assert.equal(results[0].title, 'AI Product Manager');
  });
});
