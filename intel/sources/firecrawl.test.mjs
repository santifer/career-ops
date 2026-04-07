import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── helpers ────────────────────────────────────────────────────────────────

let savedEnv;
const ENV_KEY = 'FIRECRAWL_API_KEY';

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

describe('firecrawl.isAvailable', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  it('returns true when FIRECRAWL_API_KEY is set', async () => {
    process.env[ENV_KEY] = 'fc-test-key';
    const { isAvailable } = await import('./firecrawl.mjs');
    assert.equal(isAvailable(), true);
  });

  it('returns false when FIRECRAWL_API_KEY is not set', async () => {
    delete process.env[ENV_KEY];
    const { isAvailable } = await import('./firecrawl.mjs');
    assert.equal(isAvailable(), false);
  });
});

// ─── estimateCost ─────────────────────────────────────────────────────────────

describe('firecrawl.estimateCost', () => {
  it('returns $0.002 for scrape', async () => {
    const { estimateCost } = await import('./firecrawl.mjs');
    assert.equal(estimateCost('scrape'), 0.002);
  });

  it('returns $0.01 for crawl', async () => {
    const { estimateCost } = await import('./firecrawl.mjs');
    assert.equal(estimateCost('crawl'), 0.01);
  });

  it('returns 0 for unknown type', async () => {
    const { estimateCost } = await import('./firecrawl.mjs');
    assert.equal(estimateCost('unknown'), 0);
  });
});

// ─── execute — scrape ────────────────────────────────────────────────────────

describe('firecrawl.execute — scrape', () => {
  beforeEach(saveEnv);

  afterEach(() => {
    restoreEnv();
    globalThis.fetch = undefined;
  });

  it('throws if FIRECRAWL_API_KEY is not set', async () => {
    delete process.env[ENV_KEY];
    const { execute } = await import('./firecrawl.mjs');
    await assert.rejects(
      () => execute({ type: 'scrape', url: 'https://example.com' }),
      /FIRECRAWL_API_KEY/,
    );
  });

  it('calls POST /scrape with correct auth and body', async () => {
    process.env[ENV_KEY] = 'fc-secret';
    const { execute } = await import('./firecrawl.mjs');

    let capturedRequest;
    globalThis.fetch = async (url, opts) => {
      capturedRequest = { url, opts };
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            markdown: '# Job Title\n\nThis is the job description.',
            metadata: {
              title: 'Senior Engineer at Acme',
              sourceURL: 'https://acme.com/jobs/123',
            },
          },
        }),
      };
    };

    try {
      const results = await execute({ type: 'scrape', url: 'https://acme.com/jobs/123' });
      assert.equal(capturedRequest.url, 'https://api.firecrawl.dev/v1/scrape');
      assert.equal(capturedRequest.opts.method, 'POST');
      assert.equal(capturedRequest.opts.headers['Authorization'], 'Bearer fc-secret');
      assert.equal(capturedRequest.opts.headers['Content-Type'], 'application/json');

      const body = JSON.parse(capturedRequest.opts.body);
      assert.equal(body.url, 'https://acme.com/jobs/123');
      assert.deepEqual(body.formats, ['markdown']);
    } finally {
      globalThis.fetch = undefined;
    }
  });

  it('normalizes scrape result correctly', async () => {
    process.env[ENV_KEY] = 'fc-key';
    const { execute } = await import('./firecrawl.mjs');

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          markdown: '# ML Engineer\n\nJoin our team.',
          metadata: {
            title: 'ML Engineer at DeepMind',
            sourceURL: 'https://deepmind.com/jobs/ml',
          },
        },
      }),
    });

    try {
      const results = await execute({ type: 'scrape', url: 'https://deepmind.com/jobs/ml' });
      assert.equal(results.length, 1);
      const r = results[0];
      assert.equal(r.title, 'ML Engineer at DeepMind');
      assert.equal(r.url, 'https://deepmind.com/jobs/ml');
      assert.equal(r.snippet, '# ML Engineer\n\nJoin our team.');
      assert.equal(r.source, 'firecrawl');
      assert.ok(typeof r.metadata === 'object');
    } finally {
      globalThis.fetch = undefined;
    }
  });

  it('returns [] on API error', async () => {
    process.env[ENV_KEY] = 'fc-key';
    const { execute } = await import('./firecrawl.mjs');

    globalThis.fetch = async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' }),
    });

    try {
      const results = await execute({ type: 'scrape', url: 'https://example.com' });
      assert.deepEqual(results, []);
    } finally {
      globalThis.fetch = undefined;
    }
  });

  it('returns [] on network error', async () => {
    process.env[ENV_KEY] = 'fc-key';
    const { execute } = await import('./firecrawl.mjs');

    globalThis.fetch = async () => {
      throw new Error('Network failure');
    };

    try {
      const results = await execute({ type: 'scrape', url: 'https://example.com' });
      assert.deepEqual(results, []);
    } finally {
      globalThis.fetch = undefined;
    }
  });
});

// ─── execute — crawl ─────────────────────────────────────────────────────────

describe('firecrawl.execute — crawl', () => {
  beforeEach(saveEnv);

  afterEach(() => {
    restoreEnv();
    globalThis.fetch = undefined;
  });

  it('starts a crawl job and polls for completion', async () => {
    process.env[ENV_KEY] = 'fc-key';
    const { execute } = await import('./firecrawl.mjs');

    const crawlId = 'crawl-job-abc123';
    let pollCount = 0;

    globalThis.fetch = async (url, opts) => {
      // Initial POST to /crawl
      if (opts && opts.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ success: true, id: crawlId }),
        };
      }

      // GET poll for status
      pollCount++;
      if (pollCount < 2) {
        return {
          ok: true,
          json: async () => ({ status: 'scraping', data: [] }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          status: 'completed',
          data: [
            {
              markdown: '# Job Page',
              metadata: {
                title: 'Jobs at Anthropic',
                sourceURL: 'https://anthropic.com/careers',
              },
            },
          ],
        }),
      };
    };

    try {
      const results = await execute({ type: 'crawl', url: 'https://anthropic.com/careers' });
      assert.ok(results.length >= 1, 'expected at least 1 result');
      const r = results[0];
      assert.equal(r.title, 'Jobs at Anthropic');
      assert.equal(r.url, 'https://anthropic.com/careers');
      assert.equal(r.snippet, '# Job Page');
      assert.equal(r.source, 'firecrawl');
    } finally {
      globalThis.fetch = undefined;
    }
  });

  it('calls POST /crawl with correct body', async () => {
    process.env[ENV_KEY] = 'fc-key';
    const { execute } = await import('./firecrawl.mjs');

    let capturedPostBody;
    globalThis.fetch = async (url, opts) => {
      if (opts && opts.method === 'POST') {
        capturedPostBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({ success: true, id: 'job-123' }),
        };
      }
      return {
        ok: true,
        json: async () => ({ status: 'completed', data: [] }),
      };
    };

    try {
      await execute({ type: 'crawl', url: 'https://example.com/jobs' });
      assert.equal(capturedPostBody.url, 'https://example.com/jobs');
      assert.equal(capturedPostBody.limit, 5);
      assert.deepEqual(capturedPostBody.scrapeOptions, { formats: ['markdown'] });
    } finally {
      globalThis.fetch = undefined;
    }
  });

  it('returns [] when crawl job fails to start', async () => {
    process.env[ENV_KEY] = 'fc-key';
    const { execute } = await import('./firecrawl.mjs');

    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal error' }),
    });

    try {
      const results = await execute({ type: 'crawl', url: 'https://example.com' });
      assert.deepEqual(results, []);
    } finally {
      globalThis.fetch = undefined;
    }
  });

  it('returns [] on network error during crawl', async () => {
    process.env[ENV_KEY] = 'fc-key';
    const { execute } = await import('./firecrawl.mjs');

    globalThis.fetch = async () => {
      throw new Error('Network failure');
    };

    try {
      const results = await execute({ type: 'crawl', url: 'https://example.com' });
      assert.deepEqual(results, []);
    } finally {
      globalThis.fetch = undefined;
    }
  });
});
