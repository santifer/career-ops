import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── helpers ────────────────────────────────────────────────────────────────

let savedEnv;
const ENV_KEY = 'EXA_API_KEY';

function saveEnv() {
  savedEnv = process.env[ENV_KEY];
}

function restoreEnv() {
  if (savedEnv === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = savedEnv;
  }
}

// ─── isAvailable ─────────────────────────────────────────────────────────────

describe('exa.isAvailable', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  it('returns true when EXA_API_KEY is set', async () => {
    process.env[ENV_KEY] = 'test-key';
    const { isAvailable } = await import('./exa.mjs');
    assert.equal(isAvailable(), true);
  });

  it('returns false when EXA_API_KEY is not set', async () => {
    delete process.env[ENV_KEY];
    const { isAvailable } = await import('./exa.mjs');
    assert.equal(isAvailable(), false);
  });
});

// ─── estimateCost ─────────────────────────────────────────────────────────────

describe('exa.estimateCost', () => {
  it('returns $0.005 for search', async () => {
    const { estimateCost } = await import('./exa.mjs');
    assert.equal(estimateCost('search'), 0.005);
  });

  it('returns $0.005 for findSimilar', async () => {
    const { estimateCost } = await import('./exa.mjs');
    assert.equal(estimateCost('findSimilar'), 0.005);
  });

  it('returns $0.002 for getContents', async () => {
    const { estimateCost } = await import('./exa.mjs');
    assert.equal(estimateCost('getContents'), 0.002);
  });

  it('returns 0 for unknown query type', async () => {
    const { estimateCost } = await import('./exa.mjs');
    assert.equal(estimateCost('unknown'), 0);
  });
});

// ─── execute ──────────────────────────────────────────────────────────────────

describe('exa.execute — search', () => {
  beforeEach(saveEnv);

  afterEach(() => {
    restoreEnv();
    globalThis.fetch = undefined;
  });

  it('throws if EXA_API_KEY is not set', async () => {
    delete process.env[ENV_KEY];
    const { execute } = await import('./exa.mjs');
    await assert.rejects(
      () => execute({ type: 'search', query: 'AI engineer jobs' }),
      /EXA_API_KEY/,
    );
  });

  it('calls POST /search with correct body and headers', async () => {
    process.env[ENV_KEY] = 'test-key-123';
    const { execute } = await import('./exa.mjs');

    let capturedRequest;
    globalThis.fetch = async (url, opts) => {
      capturedRequest = { url, opts };
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              title: 'AI Engineer at Stripe',
              url: 'https://stripe.com/jobs/ai-engineer',
              text: 'We are looking for an AI Engineer...',
              score: 0.95,
              publishedDate: '2026-03-01',
              author: null,
            },
          ],
        }),
      };
    };

    try {
      const results = await execute({ type: 'search', query: 'AI engineer jobs' });
      assert.equal(capturedRequest.url, 'https://api.exa.ai/search');
      assert.equal(capturedRequest.opts.method, 'POST');
      assert.equal(capturedRequest.opts.headers['x-api-key'], 'test-key-123');
      assert.equal(capturedRequest.opts.headers['Content-Type'], 'application/json');

      const body = JSON.parse(capturedRequest.opts.body);
      assert.equal(body.query, 'AI engineer jobs');
      assert.equal(body.numResults, 10);
      assert.deepEqual(body.contents, { text: true });
    } finally {
      globalThis.fetch = undefined;
    }
  });

  it('normalizes search results correctly', async () => {
    process.env[ENV_KEY] = 'test-key';
    const { execute } = await import('./exa.mjs');

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            title: 'ML Engineer at Anthropic',
            url: 'https://anthropic.com/jobs/ml',
            text: 'Join Anthropic as an ML Engineer',
            score: 0.9,
            publishedDate: '2026-01-15',
            author: 'Recruiter',
          },
        ],
      }),
    });

    try {
      const results = await execute({ type: 'search', query: 'ML engineer' });
      assert.equal(results.length, 1);
      const r = results[0];
      assert.equal(r.title, 'ML Engineer at Anthropic');
      assert.equal(r.url, 'https://anthropic.com/jobs/ml');
      assert.equal(r.snippet, 'Join Anthropic as an ML Engineer');
      assert.equal(r.source, 'exa');
      assert.equal(r.metadata.score, 0.9);
      assert.equal(r.metadata.publishedDate, '2026-01-15');
      assert.equal(r.metadata.author, 'Recruiter');
    } finally {
      globalThis.fetch = undefined;
    }
  });

  it('uses highlight as snippet when text is missing', async () => {
    process.env[ENV_KEY] = 'test-key';
    const { execute } = await import('./exa.mjs');

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            title: 'Job Post',
            url: 'https://example.com/job',
            text: null,
            highlight: 'Highlighted snippet here',
            score: 0.8,
          },
        ],
      }),
    });

    try {
      const results = await execute({ type: 'search', query: 'test' });
      assert.equal(results[0].snippet, 'Highlighted snippet here');
    } finally {
      globalThis.fetch = undefined;
    }
  });

  it('returns [] on API error (non-ok response)', async () => {
    process.env[ENV_KEY] = 'test-key';
    const { execute } = await import('./exa.mjs');

    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Rate limit exceeded' }),
    });

    try {
      const results = await execute({ type: 'search', query: 'test' });
      assert.deepEqual(results, []);
    } finally {
      globalThis.fetch = undefined;
    }
  });

  it('returns [] on network error', async () => {
    process.env[ENV_KEY] = 'test-key';
    const { execute } = await import('./exa.mjs');

    globalThis.fetch = async () => {
      throw new Error('Network failure');
    };

    try {
      const results = await execute({ type: 'search', query: 'test' });
      assert.deepEqual(results, []);
    } finally {
      globalThis.fetch = undefined;
    }
  });

  it('calls POST /findSimilar for findSimilar type', async () => {
    process.env[ENV_KEY] = 'test-key';
    const { execute } = await import('./exa.mjs');

    let capturedUrl;
    globalThis.fetch = async (url, opts) => {
      capturedUrl = url;
      return {
        ok: true,
        json: async () => ({ results: [] }),
      };
    };

    try {
      await execute({ type: 'findSimilar', query: 'https://stripe.com/jobs/123' });
      assert.equal(capturedUrl, 'https://api.exa.ai/findSimilar');
    } finally {
      globalThis.fetch = undefined;
    }
  });

  it('merges extras into request body', async () => {
    process.env[ENV_KEY] = 'test-key';
    const { execute } = await import('./exa.mjs');

    let capturedBody;
    globalThis.fetch = async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ results: [] }) };
    };

    try {
      await execute({
        type: 'search',
        query: 'AI jobs',
        numResults: 5,
        extras: { category: 'company', useAutoprompt: true },
      });
      assert.equal(capturedBody.numResults, 5);
      assert.equal(capturedBody.category, 'company');
      assert.equal(capturedBody.useAutoprompt, true);
    } finally {
      globalThis.fetch = undefined;
    }
  });
});
