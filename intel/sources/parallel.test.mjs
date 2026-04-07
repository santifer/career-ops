import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execute, estimateCost, isAvailable } from './parallel.mjs';

const SAVED_KEY = process.env.PARALLEL_API_KEY;

afterEach(() => {
  if (SAVED_KEY === undefined) {
    delete process.env.PARALLEL_API_KEY;
  } else {
    process.env.PARALLEL_API_KEY = SAVED_KEY;
  }
  globalThis.fetch = undefined;
});

// ─── isAvailable ────────────────────────────────────────────────────────────

describe('isAvailable', () => {
  it('returns true when PARALLEL_API_KEY is set', () => {
    process.env.PARALLEL_API_KEY = 'test-key';
    assert.equal(isAvailable(), true);
  });

  it('returns false when PARALLEL_API_KEY is not set', () => {
    delete process.env.PARALLEL_API_KEY;
    assert.equal(isAvailable(), false);
  });
});

// ─── estimateCost ───────────────────────────────────────────────────────────

describe('estimateCost', () => {
  it('returns $0.01 for search', () => assert.equal(estimateCost('search'), 0.01));
  it('returns $0.02 for findAll', () => assert.equal(estimateCost('findAll'), 0.02));
  it('returns $0.005 for extract', () => assert.equal(estimateCost('extract'), 0.005));
  it('returns $0.03 for enrich', () => assert.equal(estimateCost('enrich'), 0.03));
  it('returns $0 for unknown', () => assert.equal(estimateCost('unknown'), 0));
});

// ─── execute: throws without API key ────────────────────────────────────────

describe('execute without API key', () => {
  it('throws if PARALLEL_API_KEY is missing', async () => {
    delete process.env.PARALLEL_API_KEY;
    await assert.rejects(
      () => execute({ query: 'test', type: 'search' }),
      /PARALLEL_API_KEY/,
    );
  });
});

// ─── execute: search ────────────────────────────────────────────────────────

describe('execute search', () => {
  beforeEach(() => { process.env.PARALLEL_API_KEY = 'test-key'; });

  it('calls /search and normalizes results', async () => {
    const mockResults = [
      { title: 'Result 1', url: 'https://example.com/1', summary: 'Summary 1' },
      { title: 'Result 2', url: 'https://example.com/2', description: 'Desc 2' },
    ];
    globalThis.fetch = async (url, opts) => {
      assert.ok(url.includes('/search'), `expected /search endpoint, got ${url}`);
      const body = JSON.parse(opts.body);
      assert.equal(body.query, 'AI jobs');
      return { ok: true, json: async () => ({ results: mockResults }) };
    };

    const results = await execute({ query: 'AI jobs', type: 'search' });
    assert.equal(results.length, 2);
    assert.equal(results[0].title, 'Result 1');
    assert.equal(results[0].url, 'https://example.com/1');
    assert.equal(results[0].snippet, 'Summary 1');
    assert.equal(results[0].source, 'parallel');
    assert.equal(results[1].snippet, 'Desc 2');
  });

  it('returns [] on fetch error', async () => {
    globalThis.fetch = async () => { throw new Error('network error'); };
    const results = await execute({ query: 'AI jobs', type: 'search' });
    assert.deepEqual(results, []);
  });

  it('returns [] on non-ok response', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const results = await execute({ query: 'AI jobs', type: 'search' });
    assert.deepEqual(results, []);
  });
});

// ─── execute: findAll ────────────────────────────────────────────────────────

describe('execute findAll', () => {
  beforeEach(() => { process.env.PARALLEL_API_KEY = 'test-key'; });

  it('calls /findAll and normalizes results', async () => {
    const mockResults = [
      { name: 'Company A', url: 'https://a.com', description: 'Great company' },
      { title: 'Company B', url: 'https://b.com', description: 'Another company' },
    ];
    globalThis.fetch = async (url, opts) => {
      assert.ok(url.includes('/findAll'), `expected /findAll endpoint, got ${url}`);
      const body = JSON.parse(opts.body);
      assert.equal(body.max_results, 20);
      return { ok: true, json: async () => ({ results: mockResults }) };
    };

    const results = await execute({ query: 'AI companies', type: 'findAll' });
    assert.equal(results.length, 2);
    assert.equal(results[0].title, 'Company A');
    assert.equal(results[1].title, 'Company B');
    assert.equal(results[0].source, 'parallel');
  });
});

// ─── execute: extract ────────────────────────────────────────────────────────

describe('execute extract', () => {
  beforeEach(() => { process.env.PARALLEL_API_KEY = 'test-key'; });

  it('calls /extract and normalizes results', async () => {
    const mockResults = [
      { title: 'Page 1', url: 'https://x.com/1', content: 'Full content here' },
      { title: 'Page 2', url: 'https://x.com/2', text: 'Text content here' },
    ];
    globalThis.fetch = async (url, opts) => {
      assert.ok(url.includes('/extract'), `expected /extract endpoint, got ${url}`);
      const body = JSON.parse(opts.body);
      assert.deepEqual(body.urls, ['https://x.com/1', 'https://x.com/2']);
      return { ok: true, json: async () => ({ results: mockResults }) };
    };

    const results = await execute({
      query: 'extract',
      type: 'extract',
      urls: ['https://x.com/1', 'https://x.com/2'],
    });
    assert.equal(results.length, 2);
    assert.equal(results[0].snippet, 'Full content here');
    assert.equal(results[1].snippet, 'Text content here');
    assert.equal(results[0].source, 'parallel');
  });
});

// ─── execute: enrich ────────────────────────────────────────────────────────

describe('execute enrich', () => {
  beforeEach(() => { process.env.PARALLEL_API_KEY = 'test-key'; });

  it('calls /findAll/enrich and normalizes results', async () => {
    const mockResults = [
      {
        name: 'Jane Doe',
        url: 'https://linkedin.com/in/janedoe',
        description: 'AI Engineer',
        company: 'Anthropic',
        location: 'SF',
      },
    ];
    globalThis.fetch = async (url, opts) => {
      assert.ok(url.includes('/findAll/enrich'), `expected /findAll/enrich endpoint, got ${url}`);
      const body = JSON.parse(opts.body);
      assert.ok(Array.isArray(body.items));
      return { ok: true, json: async () => ({ results: mockResults }) };
    };

    const results = await execute({
      query: 'enrich',
      type: 'enrich',
      items: [{ name: 'Jane Doe', company: 'Anthropic' }],
      fields: ['email', 'linkedin'],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'Jane Doe');
    assert.equal(results[0].url, 'https://linkedin.com/in/janedoe');
    assert.equal(results[0].snippet, 'AI Engineer');
    assert.equal(results[0].metadata.company, 'Anthropic');
    assert.equal(results[0].source, 'parallel');
  });
});

// ─── execute: unknown type defaults to search ────────────────────────────────

describe('execute unknown type', () => {
  beforeEach(() => { process.env.PARALLEL_API_KEY = 'test-key'; });

  it('defaults to search for unknown type', async () => {
    globalThis.fetch = async (url) => {
      assert.ok(url.includes('/search'), `expected /search for unknown type, got ${url}`);
      return { ok: true, json: async () => ({ results: [] }) };
    };
    const results = await execute({ query: 'test', type: 'bogus' });
    assert.deepEqual(results, []);
  });
});
