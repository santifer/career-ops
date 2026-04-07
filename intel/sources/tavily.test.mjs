import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── helpers ────────────────────────────────────────────────────────────────

let savedEnv;
const ENV_KEY = 'TAVILY_API_KEY';

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

describe('tavily.isAvailable', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  it('returns true when TAVILY_API_KEY is set', async () => {
    process.env[ENV_KEY] = 'test-key';
    const { isAvailable } = await import('./tavily.mjs');
    assert.equal(isAvailable(), true);
  });

  it('returns false when TAVILY_API_KEY is not set', async () => {
    delete process.env[ENV_KEY];
    const { isAvailable } = await import('./tavily.mjs');
    assert.equal(isAvailable(), false);
  });
});

// ─── estimateCost ─────────────────────────────────────────────────────────────

describe('tavily.estimateCost', () => {
  it('returns $0.005 for search', async () => {
    const { estimateCost } = await import('./tavily.mjs');
    assert.equal(estimateCost('search'), 0.005);
  });

  it('returns $0.01 for extract', async () => {
    const { estimateCost } = await import('./tavily.mjs');
    assert.equal(estimateCost('extract'), 0.01);
  });

  it('returns 0 for unknown type', async () => {
    const { estimateCost } = await import('./tavily.mjs');
    assert.equal(estimateCost('unknown'), 0);
  });
});

// ─── execute ──────────────────────────────────────────────────────────────────

describe('tavily.execute — search', () => {
  beforeEach(saveEnv);

  afterEach(() => {
    restoreEnv();
    globalThis.fetch = undefined;
  });

  it('throws if TAVILY_API_KEY is not set', async () => {
    delete process.env[ENV_KEY];
    const { execute } = await import('./tavily.mjs');
    await assert.rejects(
      () => execute({ type: 'search', query: 'AI engineer jobs' }),
      /TAVILY_API_KEY/,
    );
  });

  it('calls POST /search with correct body including api_key', async () => {
    process.env[ENV_KEY] = 'tavily-secret';
    const { execute } = await import('./tavily.mjs');

    let capturedRequest;
    globalThis.fetch = async (url, opts) => {
      capturedRequest = { url, opts };
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              title: 'AI Engineer Jobs',
              url: 'https://example.com/jobs',
              content: 'Looking for AI engineers...',
            },
          ],
        }),
      };
    };

    try {
      const results = await execute({ type: 'search', query: 'AI engineer jobs' });
      assert.equal(capturedRequest.url, 'https://api.tavily.com/search');
      assert.equal(capturedRequest.opts.method, 'POST');
      assert.equal(capturedRequest.opts.headers['Content-Type'], 'application/json');

      const body = JSON.parse(capturedRequest.opts.body);
      assert.equal(body.api_key, 'tavily-secret');
      assert.equal(body.query, 'AI engineer jobs');
      assert.equal(body.max_results, 10);
      assert.equal(body.search_depth, 'basic');
      assert.equal(body.include_raw_content, false);
    } finally {
      globalThis.fetch = undefined;
    }
  });

  it('normalizes search results correctly', async () => {
    process.env[ENV_KEY] = 'tavily-key';
    const { execute } = await import('./tavily.mjs');

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            title: 'Senior ML Engineer at OpenAI',
            url: 'https://openai.com/careers/ml-engineer',
            content: 'Join OpenAI as a Senior ML Engineer.',
          },
        ],
      }),
    });

    try {
      const results = await execute({ type: 'search', query: 'ML engineer' });
      assert.equal(results.length, 1);
      const r = results[0];
      assert.equal(r.title, 'Senior ML Engineer at OpenAI');
      assert.equal(r.url, 'https://openai.com/careers/ml-engineer');
      assert.equal(r.snippet, 'Join OpenAI as a Senior ML Engineer.');
      assert.equal(r.source, 'tavily');
      assert.ok(typeof r.metadata === 'object');
    } finally {
      globalThis.fetch = undefined;
    }
  });

  it('returns [] on API error', async () => {
    process.env[ENV_KEY] = 'tavily-key';
    const { execute } = await import('./tavily.mjs');

    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    try {
      const results = await execute({ type: 'search', query: 'test' });
      assert.deepEqual(results, []);
    } finally {
      globalThis.fetch = undefined;
    }
  });

  it('returns [] on network error', async () => {
    process.env[ENV_KEY] = 'tavily-key';
    const { execute } = await import('./tavily.mjs');

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
});

describe('tavily.execute — extract', () => {
  beforeEach(saveEnv);

  afterEach(() => {
    restoreEnv();
    globalThis.fetch = undefined;
  });

  it('calls POST /extract with urls array', async () => {
    process.env[ENV_KEY] = 'tavily-secret';
    const { execute } = await import('./tavily.mjs');

    let capturedRequest;
    globalThis.fetch = async (url, opts) => {
      capturedRequest = { url, opts };
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              url: 'https://example.com/page',
              raw_content: 'Full page content here...',
            },
          ],
        }),
      };
    };

    try {
      const results = await execute({
        type: 'extract',
        urls: ['https://example.com/page'],
      });
      assert.equal(capturedRequest.url, 'https://api.tavily.com/extract');

      const body = JSON.parse(capturedRequest.opts.body);
      assert.deepEqual(body.urls, ['https://example.com/page']);
      assert.equal(body.api_key, 'tavily-secret');
    } finally {
      globalThis.fetch = undefined;
    }
  });

  it('normalizes extract results correctly', async () => {
    process.env[ENV_KEY] = 'tavily-key';
    const { execute } = await import('./tavily.mjs');

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            url: 'https://stripe.com/jobs/backend',
            raw_content: 'We are looking for a backend engineer...',
          },
        ],
      }),
    });

    try {
      const results = await execute({
        type: 'extract',
        urls: ['https://stripe.com/jobs/backend'],
      });
      assert.equal(results.length, 1);
      const r = results[0];
      assert.equal(r.url, 'https://stripe.com/jobs/backend');
      assert.equal(r.snippet, 'We are looking for a backend engineer...');
      assert.equal(r.source, 'tavily');
    } finally {
      globalThis.fetch = undefined;
    }
  });
});
