# Intel Engine Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 7 source modules, orchestrator, Google Workspace bidirectional sync, eval loop wiring, and recurring schedules for the career-ops intelligence engine.

**Architecture:** Hybrid approach — REST APIs for all source modules (Exa, Tavily, Firecrawl, Parallel, Bright Data, Valyu), `gws` CLI for Google push operations, `googleapis` for Gmail/Sheets polling. Central orchestrator connects router → sources → dedup → budget → output.

**Tech Stack:** Node.js ESM (.mjs), node:test + node:assert/strict for tests, fetch API for REST calls, execFileSync for CLI wrappers, YAML config, Markdown data files.

**Spec:** `docs/superpowers/specs/2026-04-07-intel-phase2-design.md`

**Parallelization:** Tasks 1-4 are fully independent (Agents 1-4). Task 5 depends on Tasks 1-2. Task 6 depends on Tasks 3-5.

---

## Task 1: Source Modules A — Exa, Tavily, Firecrawl (Agent 1)

**Files:**
- Create: `intel/sources/exa.mjs`
- Create: `intel/sources/exa.test.mjs`
- Create: `intel/sources/tavily.mjs`
- Create: `intel/sources/tavily.test.mjs`
- Create: `intel/sources/firecrawl.mjs`
- Create: `intel/sources/firecrawl.test.mjs`

All source modules export the same 3-function interface and return normalized results:
```js
{ title: string, url: string, snippet: string, metadata: {}, source: string }
```

### Exa

- [ ] **Step 1: Write exa.mjs test file**

```js
// intel/sources/exa.test.mjs
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execute, estimateCost, isAvailable } from './exa.mjs';

describe('exa source', () => {
  const origEnv = process.env.EXA_API_KEY;

  afterEach(() => {
    if (origEnv !== undefined) process.env.EXA_API_KEY = origEnv;
    else delete process.env.EXA_API_KEY;
  });

  describe('isAvailable', () => {
    it('returns true when EXA_API_KEY is set', () => {
      process.env.EXA_API_KEY = 'test-key';
      assert.equal(isAvailable(), true);
    });

    it('returns false when EXA_API_KEY is missing', () => {
      delete process.env.EXA_API_KEY;
      assert.equal(isAvailable(), false);
    });
  });

  describe('estimateCost', () => {
    it('returns cost for search queries', () => {
      const cost = estimateCost('search');
      assert.equal(typeof cost, 'number');
      assert.ok(cost > 0);
    });

    it('returns cost for findSimilar queries', () => {
      const cost = estimateCost('findSimilar');
      assert.equal(typeof cost, 'number');
      assert.ok(cost > 0);
    });

    it('returns 0 for unknown query types', () => {
      assert.equal(estimateCost('unknown'), 0);
    });
  });

  describe('execute', () => {
    it('throws when API key is missing', async () => {
      delete process.env.EXA_API_KEY;
      await assert.rejects(
        () => execute({ type: 'search', query: 'test' }),
        { message: /EXA_API_KEY/ }
      );
    });

    it('returns normalized results on success', async () => {
      // Mock fetch globally for this test
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          results: [
            { title: 'ML Engineer at Stripe', url: 'https://stripe.com/jobs/1', text: 'Great role' }
          ]
        })
      });

      process.env.EXA_API_KEY = 'test-key';
      try {
        const results = await execute({ type: 'search', query: 'ML Engineer jobs' });
        assert.equal(results.length, 1);
        assert.equal(results[0].title, 'ML Engineer at Stripe');
        assert.equal(results[0].url, 'https://stripe.com/jobs/1');
        assert.equal(results[0].snippet, 'Great role');
        assert.equal(results[0].source, 'exa');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns empty array on API error', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({ ok: false, status: 500, statusText: 'Internal Server Error' });

      process.env.EXA_API_KEY = 'test-key';
      try {
        const results = await execute({ type: 'search', query: 'test' });
        assert.deepEqual(results, []);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test intel/sources/exa.test.mjs`
Expected: FAIL — cannot find module `./exa.mjs`

- [ ] **Step 3: Implement exa.mjs**

```js
// intel/sources/exa.mjs
const BASE_URL = 'https://api.exa.ai';

const COST_TABLE = {
  search: 0.005,        // $5 per 1000 searches
  findSimilar: 0.005,
  getContents: 0.002,   // $2 per 1000
};

export function isAvailable() {
  return !!process.env.EXA_API_KEY;
}

export function estimateCost(queryType) {
  return COST_TABLE[queryType] ?? 0;
}

export async function execute(query) {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) throw new Error('EXA_API_KEY is not set');

  const { type = 'search', ...params } = query;

  const endpoint = type === 'findSimilar' ? '/findSimilar' : '/search';
  const body = {
    query: params.query,
    numResults: params.numResults ?? 10,
    type: params.searchType ?? 'auto',
    contents: { text: true },
    ...params.extras,
  };

  let res;
  try {
    res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return [];
  }

  if (!res.ok) return [];

  const data = await res.json();
  return (data.results || []).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.text || r.highlight || '',
    metadata: {
      score: r.score,
      publishedDate: r.publishedDate,
      author: r.author,
    },
    source: 'exa',
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test intel/sources/exa.test.mjs`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add intel/sources/exa.mjs intel/sources/exa.test.mjs
git commit -m "feat(intel): add Exa source module with REST API integration"
```

### Tavily

- [ ] **Step 6: Write tavily.test.mjs**

```js
// intel/sources/tavily.test.mjs
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execute, estimateCost, isAvailable } from './tavily.mjs';

describe('tavily source', () => {
  const origEnv = process.env.TAVILY_API_KEY;

  afterEach(() => {
    if (origEnv !== undefined) process.env.TAVILY_API_KEY = origEnv;
    else delete process.env.TAVILY_API_KEY;
  });

  describe('isAvailable', () => {
    it('returns true when TAVILY_API_KEY is set', () => {
      process.env.TAVILY_API_KEY = 'test-key';
      assert.equal(isAvailable(), true);
    });

    it('returns false when TAVILY_API_KEY is missing', () => {
      delete process.env.TAVILY_API_KEY;
      assert.equal(isAvailable(), false);
    });
  });

  describe('estimateCost', () => {
    it('returns cost for search', () => {
      assert.ok(estimateCost('search') > 0);
    });

    it('returns cost for extract', () => {
      assert.ok(estimateCost('extract') > 0);
    });
  });

  describe('execute', () => {
    it('throws when API key is missing', async () => {
      delete process.env.TAVILY_API_KEY;
      await assert.rejects(
        () => execute({ type: 'search', query: 'test' }),
        { message: /TAVILY_API_KEY/ }
      );
    });

    it('returns normalized results for search', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          results: [
            { title: 'AI Jobs Board', url: 'https://aijobs.com', content: 'Find AI roles' }
          ]
        })
      });

      process.env.TAVILY_API_KEY = 'test-key';
      try {
        const results = await execute({ type: 'search', query: 'AI jobs' });
        assert.equal(results.length, 1);
        assert.equal(results[0].source, 'tavily');
        assert.equal(results[0].title, 'AI Jobs Board');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns normalized results for extract', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          results: [
            { url: 'https://example.com', raw_content: 'Page content here' }
          ]
        })
      });

      process.env.TAVILY_API_KEY = 'test-key';
      try {
        const results = await execute({ type: 'extract', urls: ['https://example.com'] });
        assert.equal(results.length, 1);
        assert.equal(results[0].snippet, 'Page content here');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `node --test intel/sources/tavily.test.mjs`
Expected: FAIL — cannot find module `./tavily.mjs`

- [ ] **Step 8: Implement tavily.mjs**

```js
// intel/sources/tavily.mjs
const BASE_URL = 'https://api.tavily.com';

const COST_TABLE = {
  search: 0.005,   // ~$5 per 1000 searches
  extract: 0.01,   // ~$10 per 1000 extractions
};

export function isAvailable() {
  return !!process.env.TAVILY_API_KEY;
}

export function estimateCost(queryType) {
  return COST_TABLE[queryType] ?? 0;
}

export async function execute(query) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY is not set');

  const { type = 'search', ...params } = query;

  if (type === 'extract') {
    return executeExtract(apiKey, params);
  }

  return executeSearch(apiKey, params);
}

async function executeSearch(apiKey, params) {
  let res;
  try {
    res = await fetch(`${BASE_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: params.query,
        max_results: params.maxResults ?? 10,
        search_depth: params.depth ?? 'basic',
        include_raw_content: false,
      }),
    });
  } catch {
    return [];
  }

  if (!res.ok) return [];

  const data = await res.json();
  return (data.results || []).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || '',
    metadata: { score: r.score },
    source: 'tavily',
  }));
}

async function executeExtract(apiKey, params) {
  let res;
  try {
    res = await fetch(`${BASE_URL}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        urls: params.urls || [],
      }),
    });
  } catch {
    return [];
  }

  if (!res.ok) return [];

  const data = await res.json();
  return (data.results || []).map((r) => ({
    title: '',
    url: r.url || '',
    snippet: r.raw_content || '',
    metadata: {},
    source: 'tavily',
  }));
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `node --test intel/sources/tavily.test.mjs`
Expected: All tests PASS

- [ ] **Step 10: Commit**

```bash
git add intel/sources/tavily.mjs intel/sources/tavily.test.mjs
git commit -m "feat(intel): add Tavily source module with search + extract"
```

### Firecrawl

- [ ] **Step 11: Write firecrawl.test.mjs**

```js
// intel/sources/firecrawl.test.mjs
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execute, estimateCost, isAvailable } from './firecrawl.mjs';

describe('firecrawl source', () => {
  const origEnv = process.env.FIRECRAWL_API_KEY;

  afterEach(() => {
    if (origEnv !== undefined) process.env.FIRECRAWL_API_KEY = origEnv;
    else delete process.env.FIRECRAWL_API_KEY;
  });

  describe('isAvailable', () => {
    it('returns true when FIRECRAWL_API_KEY is set', () => {
      process.env.FIRECRAWL_API_KEY = 'test-key';
      assert.equal(isAvailable(), true);
    });

    it('returns false when FIRECRAWL_API_KEY is missing', () => {
      delete process.env.FIRECRAWL_API_KEY;
      assert.equal(isAvailable(), false);
    });
  });

  describe('estimateCost', () => {
    it('returns cost for scrape', () => {
      assert.ok(estimateCost('scrape') > 0);
    });

    it('returns cost for crawl', () => {
      assert.ok(estimateCost('crawl') > 0);
    });
  });

  describe('execute', () => {
    it('throws when API key is missing', async () => {
      delete process.env.FIRECRAWL_API_KEY;
      await assert.rejects(
        () => execute({ type: 'scrape', url: 'https://example.com' }),
        { message: /FIRECRAWL_API_KEY/ }
      );
    });

    it('returns normalized result for scrape', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            metadata: { title: 'Job Page', sourceURL: 'https://example.com/jobs/1' },
            markdown: '## Software Engineer\nGreat role at a great company',
          }
        })
      });

      process.env.FIRECRAWL_API_KEY = 'test-key';
      try {
        const results = await execute({ type: 'scrape', url: 'https://example.com/jobs/1' });
        assert.equal(results.length, 1);
        assert.equal(results[0].source, 'firecrawl');
        assert.equal(results[0].title, 'Job Page');
        assert.ok(results[0].snippet.includes('Software Engineer'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
```

- [ ] **Step 12: Run test to verify it fails**

Run: `node --test intel/sources/firecrawl.test.mjs`
Expected: FAIL — cannot find module `./firecrawl.mjs`

- [ ] **Step 13: Implement firecrawl.mjs**

```js
// intel/sources/firecrawl.mjs
const BASE_URL = 'https://api.firecrawl.dev/v1';

const COST_TABLE = {
  scrape: 0.002,   // ~$2 per 1000 pages
  crawl: 0.01,     // ~$10 per 1000 pages (multi-page)
};

export function isAvailable() {
  return !!process.env.FIRECRAWL_API_KEY;
}

export function estimateCost(queryType) {
  return COST_TABLE[queryType] ?? 0;
}

export async function execute(query) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY is not set');

  const { type = 'scrape', url, ...params } = query;

  if (type === 'crawl') {
    return executeCrawl(apiKey, url, params);
  }

  return executeScrape(apiKey, url);
}

async function executeScrape(apiKey, url) {
  let res;
  try {
    res = await fetch(`${BASE_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
      }),
    });
  } catch {
    return [];
  }

  if (!res.ok) return [];

  const data = await res.json();
  if (!data.success || !data.data) return [];

  return [{
    title: data.data.metadata?.title || '',
    url: data.data.metadata?.sourceURL || url,
    snippet: data.data.markdown || '',
    metadata: {
      statusCode: data.data.metadata?.statusCode,
      description: data.data.metadata?.description,
    },
    source: 'firecrawl',
  }];
}

async function executeCrawl(apiKey, url, params) {
  let res;
  try {
    res = await fetch(`${BASE_URL}/crawl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        limit: params.limit ?? 5,
        scrapeOptions: { formats: ['markdown'] },
      }),
    });
  } catch {
    return [];
  }

  if (!res.ok) return [];

  const data = await res.json();
  if (!data.success) return [];

  // Crawl returns an async job — poll for results
  const jobId = data.id;
  if (!jobId) return [];

  // Poll up to 30 seconds
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    let pollRes;
    try {
      pollRes = await fetch(`${BASE_URL}/crawl/${jobId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
    } catch {
      continue;
    }
    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    if (pollData.status === 'completed' && pollData.data) {
      return pollData.data.map((page) => ({
        title: page.metadata?.title || '',
        url: page.metadata?.sourceURL || '',
        snippet: page.markdown || '',
        metadata: {},
        source: 'firecrawl',
      }));
    }
  }

  return [];
}
```

- [ ] **Step 14: Run test to verify it passes**

Run: `node --test intel/sources/firecrawl.test.mjs`
Expected: All tests PASS

- [ ] **Step 15: Commit**

```bash
git add intel/sources/firecrawl.mjs intel/sources/firecrawl.test.mjs
git commit -m "feat(intel): add Firecrawl source module with scrape + crawl"
```

---

## Task 2: Source Modules B — Parallel, Bright Data, Valyu, Built-in (Agent 2)

**Files:**
- Create: `intel/sources/parallel.mjs`
- Create: `intel/sources/parallel.test.mjs`
- Create: `intel/sources/brightdata.mjs`
- Create: `intel/sources/brightdata.test.mjs`
- Create: `intel/sources/valyu.mjs`
- Create: `intel/sources/valyu.test.mjs`
- Create: `intel/sources/builtin.mjs`
- Create: `intel/sources/builtin.test.mjs`

### Parallel

- [ ] **Step 1: Write parallel.test.mjs**

```js
// intel/sources/parallel.test.mjs
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execute, estimateCost, isAvailable } from './parallel.mjs';

describe('parallel source', () => {
  const origEnv = process.env.PARALLEL_API_KEY;

  afterEach(() => {
    if (origEnv !== undefined) process.env.PARALLEL_API_KEY = origEnv;
    else delete process.env.PARALLEL_API_KEY;
  });

  describe('isAvailable', () => {
    it('returns true when PARALLEL_API_KEY is set', () => {
      process.env.PARALLEL_API_KEY = 'test-key';
      assert.equal(isAvailable(), true);
    });

    it('returns false when PARALLEL_API_KEY is missing', () => {
      delete process.env.PARALLEL_API_KEY;
      assert.equal(isAvailable(), false);
    });
  });

  describe('estimateCost', () => {
    it('returns cost for search', () => {
      assert.ok(estimateCost('search') > 0);
    });

    it('returns cost for findAll', () => {
      assert.ok(estimateCost('findAll') > 0);
    });

    it('returns cost for enrich', () => {
      assert.ok(estimateCost('enrich') > 0);
    });
  });

  describe('execute', () => {
    it('throws when API key is missing', async () => {
      delete process.env.PARALLEL_API_KEY;
      await assert.rejects(
        () => execute({ type: 'search', query: 'test' }),
        { message: /PARALLEL_API_KEY/ }
      );
    });

    it('returns normalized results for search', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          results: [
            { title: 'CTO at Acme Corp', url: 'https://linkedin.com/in/jane', summary: 'Experienced leader' }
          ]
        })
      });

      process.env.PARALLEL_API_KEY = 'test-key';
      try {
        const results = await execute({ type: 'search', query: 'CTO at Acme Corp' });
        assert.equal(results.length, 1);
        assert.equal(results[0].source, 'parallel');
        assert.equal(results[0].title, 'CTO at Acme Corp');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns normalized results for findAll', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          results: [
            { name: 'Acme Corp', url: 'https://acme.com', description: 'SaaS company' },
            { name: 'Beta Inc', url: 'https://beta.com', description: 'AI startup' },
          ]
        })
      });

      process.env.PARALLEL_API_KEY = 'test-key';
      try {
        const results = await execute({ type: 'findAll', query: 'AI startups in SF' });
        assert.equal(results.length, 2);
        assert.equal(results[0].title, 'Acme Corp');
        assert.equal(results[1].title, 'Beta Inc');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns normalized results for enrich', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          results: [{
            name: 'Acme Corp',
            url: 'https://acme.com',
            ceo: 'Jane Smith',
            funding: '$50M Series B',
            headcount: 200,
          }]
        })
      });

      process.env.PARALLEL_API_KEY = 'test-key';
      try {
        const results = await execute({
          type: 'enrich',
          items: [{ name: 'Acme Corp', url: 'https://acme.com' }],
          fields: ['ceo', 'funding', 'headcount'],
        });
        assert.equal(results.length, 1);
        assert.equal(results[0].metadata.ceo, 'Jane Smith');
        assert.equal(results[0].metadata.funding, '$50M Series B');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test intel/sources/parallel.test.mjs`
Expected: FAIL — cannot find module `./parallel.mjs`

- [ ] **Step 3: Implement parallel.mjs**

```js
// intel/sources/parallel.mjs
const BASE_URL = 'https://api.parallel.ai/v1beta';

const COST_TABLE = {
  search: 0.01,    // ~$10 per 1000 searches
  findAll: 0.02,   // ~$20 per 1000 structured queries
  extract: 0.005,  // ~$5 per 1000 URL extractions
  enrich: 0.03,    // ~$30 per 1000 enrichments
};

export function isAvailable() {
  return !!process.env.PARALLEL_API_KEY;
}

export function estimateCost(queryType) {
  return COST_TABLE[queryType] ?? 0;
}

export async function execute(query) {
  const apiKey = process.env.PARALLEL_API_KEY;
  if (!apiKey) throw new Error('PARALLEL_API_KEY is not set');

  const { type = 'search', ...params } = query;

  const handlers = { search: execSearch, findAll: execFindAll, extract: execExtract, enrich: execEnrich };
  const handler = handlers[type] || execSearch;
  return handler(apiKey, params);
}

async function apiCall(apiKey, endpoint, body) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  return res.json();
}

async function execSearch(apiKey, params) {
  const data = await apiCall(apiKey, '/search', { query: params.query, max_results: params.maxResults ?? 10 });
  if (!data) return [];
  return (data.results || []).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.summary || r.description || '',
    metadata: { score: r.score },
    source: 'parallel',
  }));
}

async function execFindAll(apiKey, params) {
  const data = await apiCall(apiKey, '/findAll', { query: params.query, max_results: params.maxResults ?? 20 });
  if (!data) return [];
  return (data.results || []).map((r) => ({
    title: r.name || r.title || '',
    url: r.url || '',
    snippet: r.description || '',
    metadata: { ...r },
    source: 'parallel',
  }));
}

async function execExtract(apiKey, params) {
  const data = await apiCall(apiKey, '/extract', { urls: params.urls || [] });
  if (!data) return [];
  return (data.results || []).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || r.text || '',
    metadata: {},
    source: 'parallel',
  }));
}

async function execEnrich(apiKey, params) {
  const data = await apiCall(apiKey, '/findAll/enrich', {
    items: params.items || [],
    fields: params.fields || [],
  });
  if (!data) return [];
  return (data.results || []).map((r) => {
    const { name, url, description, ...meta } = r;
    return {
      title: name || '',
      url: url || '',
      snippet: description || '',
      metadata: meta,
      source: 'parallel',
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test intel/sources/parallel.test.mjs`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add intel/sources/parallel.mjs intel/sources/parallel.test.mjs
git commit -m "feat(intel): add Parallel source module with search, findAll, extract, enrich"
```

### Bright Data

- [ ] **Step 6: Write brightdata.test.mjs**

```js
// intel/sources/brightdata.test.mjs
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execute, estimateCost, isAvailable } from './brightdata.mjs';

describe('brightdata source', () => {
  const origEnv = process.env.BRIGHTDATA_API_KEY;

  afterEach(() => {
    if (origEnv !== undefined) process.env.BRIGHTDATA_API_KEY = origEnv;
    else delete process.env.BRIGHTDATA_API_KEY;
  });

  describe('isAvailable', () => {
    it('returns true when BRIGHTDATA_API_KEY is set', () => {
      process.env.BRIGHTDATA_API_KEY = 'test-key';
      assert.equal(isAvailable(), true);
    });

    it('returns false when missing', () => {
      delete process.env.BRIGHTDATA_API_KEY;
      assert.equal(isAvailable(), false);
    });
  });

  describe('estimateCost', () => {
    it('returns cost for linkedin_profile', () => {
      assert.ok(estimateCost('linkedin_profile') > 0);
    });

    it('returns cost for linkedin_jobs', () => {
      assert.ok(estimateCost('linkedin_jobs') > 0);
    });
  });

  describe('execute', () => {
    it('throws when API key is missing', async () => {
      delete process.env.BRIGHTDATA_API_KEY;
      await assert.rejects(
        () => execute({ type: 'linkedin_profile', url: 'https://linkedin.com/in/test' }),
        { message: /BRIGHTDATA_API_KEY/ }
      );
    });

    it('returns normalized result for linkedin_profile', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ([{
          name: 'Jane Smith',
          title: 'VP Engineering',
          company: 'Acme Corp',
          url: 'https://linkedin.com/in/janesmith',
          about: 'Engineering leader',
        }])
      });

      process.env.BRIGHTDATA_API_KEY = 'test-key';
      try {
        const results = await execute({ type: 'linkedin_profile', url: 'https://linkedin.com/in/janesmith' });
        assert.equal(results.length, 1);
        assert.equal(results[0].source, 'brightdata');
        assert.equal(results[0].title, 'Jane Smith');
        assert.equal(results[0].metadata.jobTitle, 'VP Engineering');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `node --test intel/sources/brightdata.test.mjs`
Expected: FAIL

- [ ] **Step 8: Implement brightdata.mjs**

```js
// intel/sources/brightdata.mjs
const BASE_URL = 'https://api.brightdata.com/datasets/v3';

const COST_TABLE = {
  linkedin_profile: 0.05,  // ~$50 per 1000 profiles
  linkedin_jobs: 0.03,     // ~$30 per 1000 job listings
  scrape: 0.01,            // ~$10 per 1000 pages
};

export function isAvailable() {
  return !!process.env.BRIGHTDATA_API_KEY;
}

export function estimateCost(queryType) {
  return COST_TABLE[queryType] ?? 0;
}

export async function execute(query) {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) throw new Error('BRIGHTDATA_API_KEY is not set');

  const { type = 'linkedin_profile', ...params } = query;

  const datasetId = type === 'linkedin_jobs' ? 'gd_l7q7dkf244hwjntr0' : 'gd_l1viktl72bvl7bjuj0';

  let res;
  try {
    res = await fetch(`${BASE_URL}/trigger?dataset_id=${datasetId}&format=json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify([{ url: params.url }]),
    });
  } catch {
    return [];
  }

  if (!res.ok) return [];

  const data = await res.json();
  const records = Array.isArray(data) ? data : [data];

  if (type === 'linkedin_jobs') {
    return records.map((r) => ({
      title: r.title || r.job_title || '',
      url: r.url || '',
      snippet: r.description || '',
      metadata: {
        company: r.company_name,
        location: r.location,
        salary: r.salary,
        postedDate: r.posted_date,
      },
      source: 'brightdata',
    }));
  }

  // linkedin_profile
  return records.map((r) => ({
    title: r.name || '',
    url: r.url || '',
    snippet: r.about || '',
    metadata: {
      jobTitle: r.title,
      company: r.company,
      location: r.location,
      connections: r.connections,
    },
    source: 'brightdata',
  }));
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `node --test intel/sources/brightdata.test.mjs`
Expected: All tests PASS

- [ ] **Step 10: Commit**

```bash
git add intel/sources/brightdata.mjs intel/sources/brightdata.test.mjs
git commit -m "feat(intel): add Bright Data source module for LinkedIn profiles + jobs"
```

### Valyu

- [ ] **Step 11: Write valyu.test.mjs**

```js
// intel/sources/valyu.test.mjs
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execute, estimateCost, isAvailable } from './valyu.mjs';

describe('valyu source', () => {
  const origEnv = process.env.VALYU_API_KEY;

  afterEach(() => {
    if (origEnv !== undefined) process.env.VALYU_API_KEY = origEnv;
    else delete process.env.VALYU_API_KEY;
  });

  describe('isAvailable', () => {
    it('returns true when VALYU_API_KEY is set', () => {
      process.env.VALYU_API_KEY = 'test-key';
      assert.equal(isAvailable(), true);
    });

    it('returns false when missing', () => {
      delete process.env.VALYU_API_KEY;
      assert.equal(isAvailable(), false);
    });
  });

  describe('estimateCost', () => {
    it('returns cost for deepsearch', () => {
      assert.ok(estimateCost('deepsearch') > 0);
    });
  });

  describe('execute', () => {
    it('throws when API key is missing', async () => {
      delete process.env.VALYU_API_KEY;
      await assert.rejects(
        () => execute({ query: 'test' }),
        { message: /VALYU_API_KEY/ }
      );
    });

    it('returns normalized results', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          results: [
            { title: 'AI Market Report', url: 'https://report.com', content: 'Market growing 40% YoY', source: 'proprietary' }
          ]
        })
      });

      process.env.VALYU_API_KEY = 'test-key';
      try {
        const results = await execute({ query: 'AI hiring trends 2026' });
        assert.equal(results.length, 1);
        assert.equal(results[0].source, 'valyu');
        assert.equal(results[0].title, 'AI Market Report');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
```

- [ ] **Step 12: Run test to verify it fails**

Run: `node --test intel/sources/valyu.test.mjs`
Expected: FAIL

- [ ] **Step 13: Implement valyu.mjs**

```js
// intel/sources/valyu.mjs
const BASE_URL = 'https://api.valyu.network/v1';

const COST_TABLE = {
  deepsearch: 0.02,  // ~$20 per 1000 queries
};

export function isAvailable() {
  return !!process.env.VALYU_API_KEY;
}

export function estimateCost(queryType) {
  return COST_TABLE[queryType] ?? 0;
}

export async function execute(query) {
  const apiKey = process.env.VALYU_API_KEY;
  if (!apiKey) throw new Error('VALYU_API_KEY is not set');

  const { query: searchQuery, ...params } = query;

  let res;
  try {
    res = await fetch(`${BASE_URL}/deepsearch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: searchQuery,
        search_type: params.searchType ?? 'all',
        max_num_results: params.maxResults ?? 10,
      }),
    });
  } catch {
    return [];
  }

  if (!res.ok) return [];

  const data = await res.json();
  return (data.results || []).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || r.text || '',
    metadata: {
      dataSource: r.source,
      relevanceScore: r.relevance_score,
    },
    source: 'valyu',
  }));
}
```

- [ ] **Step 14: Run test to verify it passes**

Run: `node --test intel/sources/valyu.test.mjs`
Expected: All tests PASS

- [ ] **Step 15: Commit**

```bash
git add intel/sources/valyu.mjs intel/sources/valyu.test.mjs
git commit -m "feat(intel): add Valyu source module for deep market research"
```

### Built-in (always-available fallback)

- [ ] **Step 16: Write builtin.test.mjs**

```js
// intel/sources/builtin.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execute, estimateCost, isAvailable } from './builtin.mjs';

describe('builtin source', () => {
  describe('isAvailable', () => {
    it('always returns true', () => {
      assert.equal(isAvailable(), true);
    });
  });

  describe('estimateCost', () => {
    it('always returns 0', () => {
      assert.equal(estimateCost('search'), 0);
      assert.equal(estimateCost('anything'), 0);
    });
  });

  describe('execute', () => {
    it('returns a single result with the query as context', async () => {
      const results = await execute({ query: 'ML Engineer jobs at Stripe' });
      assert.equal(results.length, 1);
      assert.equal(results[0].source, 'builtin');
      assert.ok(results[0].snippet.includes('ML Engineer jobs at Stripe'));
    });
  });
});
```

- [ ] **Step 17: Run test to verify it fails**

Run: `node --test intel/sources/builtin.test.mjs`
Expected: FAIL

- [ ] **Step 18: Implement builtin.mjs**

```js
// intel/sources/builtin.mjs

/**
 * Built-in source — always-available fallback.
 * Returns the query as a structured "task" for Claude to handle
 * via WebSearch/WebFetch when no paid API is available.
 * Cost: $0 (uses Claude's built-in tools).
 */

export function isAvailable() {
  return true;
}

export function estimateCost() {
  return 0;
}

export async function execute(query) {
  const { query: searchQuery, type } = query;

  return [{
    title: `[builtin] ${type || 'search'}: ${searchQuery}`,
    url: '',
    snippet: `Use WebSearch/WebFetch to research: ${searchQuery}`,
    metadata: {
      requiresManualExecution: true,
      suggestedTool: type === 'scrape' ? 'WebFetch' : 'WebSearch',
    },
    source: 'builtin',
  }];
}
```

- [ ] **Step 19: Run test to verify it passes**

Run: `node --test intel/sources/builtin.test.mjs`
Expected: All tests PASS

- [ ] **Step 20: Commit**

```bash
git add intel/sources/builtin.mjs intel/sources/builtin.test.mjs
git commit -m "feat(intel): add built-in fallback source module"
```

---

## Task 3: Google Push Modules (Agent 3)

**Files:**
- Create: `intel/google/sheets-push.mjs`
- Create: `intel/google/sheets-push.test.mjs`
- Create: `intel/google/docs-push.mjs`
- Create: `intel/google/docs-push.test.mjs`
- Create: `intel/google/calendar-push.mjs`
- Create: `intel/google/calendar-push.test.mjs`

All Google push modules use the `gws` CLI via `execFileSync`. They share a helper for running `gws` commands.

### Sheets Push

- [ ] **Step 1: Write sheets-push.test.mjs**

```js
// intel/google/sheets-push.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAppendArgs, buildUpdateArgs, parseTrackerRow } from './sheets-push.mjs';

describe('sheets-push', () => {
  describe('parseTrackerRow', () => {
    it('parses an applications.md row into sheet columns', () => {
      const row = '| 42 | 2026-04-07 | Acme Corp | ML Engineer | 4.2/5 | Evaluated | ✅ | [42](reports/042-acme-corp-2026-04-07.md) | Great fit |';
      const parsed = parseTrackerRow(row);
      assert.equal(parsed.num, '42');
      assert.equal(parsed.date, '2026-04-07');
      assert.equal(parsed.company, 'Acme Corp');
      assert.equal(parsed.role, 'ML Engineer');
      assert.equal(parsed.score, '4.2/5');
      assert.equal(parsed.status, 'Evaluated');
    });

    it('returns null for non-data rows', () => {
      assert.equal(parseTrackerRow('| # | Date | Company |'), null);
      assert.equal(parseTrackerRow('|---|------|---------|'), null);
      assert.equal(parseTrackerRow(''), null);
    });
  });

  describe('buildAppendArgs', () => {
    it('builds gws sheets +append arguments', () => {
      const args = buildAppendArgs('SHEET_ID_123', {
        num: '42', date: '2026-04-07', company: 'Acme Corp',
        role: 'ML Engineer', score: '4.2/5', status: 'Evaluated',
        pdf: '✅', report: '042', notes: 'Great fit',
      });
      assert.ok(args.includes('+append'));
      assert.ok(args.includes('--spreadsheet'));
      assert.ok(args.includes('SHEET_ID_123'));
    });
  });

  describe('buildUpdateArgs', () => {
    it('builds gws sheets +update arguments', () => {
      const args = buildUpdateArgs('SHEET_ID_123', 'A42', { status: 'Applied' });
      assert.ok(args.includes('+update'));
      assert.ok(args.includes('SHEET_ID_123'));
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test intel/google/sheets-push.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement sheets-push.mjs**

```js
// intel/google/sheets-push.mjs
import { execFileSync } from 'node:child_process';

const HEADER_RE = /^\|\s*#\s*\|/;
const SEP_RE = /^\|[\s-:|]+\|$/;

/**
 * Parse a single applications.md table row into structured data.
 * Returns null for header, separator, and empty rows.
 */
export function parseTrackerRow(line) {
  if (!line || HEADER_RE.test(line) || SEP_RE.test(line)) return null;
  const cells = line.split('|').map((c) => c.trim()).filter((c) => c !== '');
  if (cells.length < 8) return null;
  return {
    num: cells[0],
    date: cells[1],
    company: cells[2],
    role: cells[3],
    score: cells[4],
    status: cells[5],
    pdf: cells[6],
    report: cells[7],
    notes: cells[8] || '',
  };
}

/**
 * Build gws CLI args for appending a new row to a Google Sheet.
 */
export function buildAppendArgs(sheetId, row) {
  const values = [row.num, row.date, row.company, row.role, row.score, row.status, row.pdf, row.report, row.notes].join(',');
  return ['sheets', '+append', '--spreadsheet', sheetId, '--range', 'A:I', '--values', values];
}

/**
 * Build gws CLI args for updating a cell range.
 */
export function buildUpdateArgs(sheetId, range, updates) {
  const values = Object.values(updates).join(',');
  return ['sheets', '+update', '--spreadsheet', sheetId, '--range', range, '--values', values];
}

/**
 * Run a gws CLI command. Returns stdout.
 */
function runGws(args) {
  return execFileSync('gws', args, { encoding: 'utf-8', timeout: 15000 });
}

/**
 * Append a new application row to the Google Sheet.
 */
export function appendRow(sheetId, row) {
  const args = buildAppendArgs(sheetId, row);
  return runGws(args);
}

/**
 * Update an existing row's status in the Google Sheet.
 */
export function updateStatus(sheetId, rowNumber, status) {
  // Status is column F (6th column)
  const range = `F${rowNumber}`;
  const args = buildUpdateArgs(sheetId, range, { status });
  return runGws(args);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test intel/google/sheets-push.test.mjs`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add intel/google/sheets-push.mjs intel/google/sheets-push.test.mjs
git commit -m "feat(intel): add Google Sheets push module via gws CLI"
```

### Docs Push

- [ ] **Step 6: Write docs-push.test.mjs**

```js
// intel/google/docs-push.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCreateArgs, formatOutreachDoc } from './docs-push.mjs';

describe('docs-push', () => {
  describe('formatOutreachDoc', () => {
    it('formats an outreach draft as Google Doc content', () => {
      const doc = formatOutreachDoc({
        company: 'Acme Corp',
        role: 'ML Engineer',
        hiringManager: 'Jane Smith',
        draft: 'Hi Jane, I noticed Acme is hiring...',
      });
      assert.ok(doc.includes('Acme Corp'));
      assert.ok(doc.includes('ML Engineer'));
      assert.ok(doc.includes('Hi Jane'));
    });
  });

  describe('buildCreateArgs', () => {
    it('builds gws docs +write arguments', () => {
      const args = buildCreateArgs('FOLDER_ID', 'Outreach - Acme Corp', 'content here');
      assert.ok(args.includes('+write'));
      assert.ok(args.includes('Outreach - Acme Corp'));
    });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `node --test intel/google/docs-push.test.mjs`
Expected: FAIL

- [ ] **Step 8: Implement docs-push.mjs**

```js
// intel/google/docs-push.mjs
import { execFileSync } from 'node:child_process';

/**
 * Format an outreach draft as Google Doc content.
 */
export function formatOutreachDoc({ company, role, hiringManager, draft }) {
  const lines = [
    `Outreach: ${company} — ${role}`,
    '',
    `To: ${hiringManager || 'Hiring Manager'}`,
    '',
    '---',
    '',
    draft,
    '',
    '---',
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
  ];
  return lines.join('\n');
}

/**
 * Build gws CLI args for creating a Google Doc.
 */
export function buildCreateArgs(folderId, title, content) {
  const args = ['docs', '+write', '--title', title, '--content', content];
  if (folderId) args.push('--parent', folderId);
  return args;
}

/**
 * Create a Google Doc with the given content.
 * Returns the document URL from gws output.
 */
export function createDoc(folderId, title, content) {
  const args = buildCreateArgs(folderId, title, content);
  const output = execFileSync('gws', args, { encoding: 'utf-8', timeout: 15000 });
  // gws outputs the doc URL on success
  const urlMatch = output.match(/https:\/\/docs\.google\.com\/\S+/);
  return urlMatch ? urlMatch[0] : output.trim();
}

/**
 * Create an outreach doc from a draft object.
 */
export function pushOutreachDraft(folderId, draft) {
  const title = `Outreach - ${draft.company} - ${draft.role}`;
  const content = formatOutreachDoc(draft);
  return createDoc(folderId, title, content);
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `node --test intel/google/docs-push.test.mjs`
Expected: All tests PASS

- [ ] **Step 10: Commit**

```bash
git add intel/google/docs-push.mjs intel/google/docs-push.test.mjs
git commit -m "feat(intel): add Google Docs push module for outreach drafts"
```

### Calendar Push

- [ ] **Step 11: Write calendar-push.test.mjs**

```js
// intel/google/calendar-push.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildInsertArgs, formatEventDescription } from './calendar-push.mjs';

describe('calendar-push', () => {
  describe('formatEventDescription', () => {
    it('formats interview details for calendar event', () => {
      const desc = formatEventDescription({
        company: 'Acme Corp',
        role: 'ML Engineer',
        score: '4.2/5',
        reportLink: 'reports/042-acme-corp-2026-04-07.md',
        notes: 'Focus on RAG experience',
      });
      assert.ok(desc.includes('Acme Corp'));
      assert.ok(desc.includes('4.2/5'));
      assert.ok(desc.includes('RAG experience'));
    });
  });

  describe('buildInsertArgs', () => {
    it('builds gws calendar +insert arguments', () => {
      const args = buildInsertArgs({
        title: 'Interview: Acme Corp - ML Engineer',
        start: '2026-04-10T10:00:00',
        end: '2026-04-10T11:00:00',
        description: 'Prep notes here',
      });
      assert.ok(args.includes('+insert'));
      assert.ok(args.includes('Interview: Acme Corp - ML Engineer'));
      assert.ok(args.includes('2026-04-10T10:00:00'));
    });
  });
});
```

- [ ] **Step 12: Run test to verify it fails**

Run: `node --test intel/google/calendar-push.test.mjs`
Expected: FAIL

- [ ] **Step 13: Implement calendar-push.mjs**

```js
// intel/google/calendar-push.mjs
import { execFileSync } from 'node:child_process';

/**
 * Format interview prep details as a calendar event description.
 */
export function formatEventDescription({ company, role, score, reportLink, notes }) {
  const lines = [
    `Company: ${company}`,
    `Role: ${role}`,
    `Score: ${score}`,
    '',
    `Report: ${reportLink}`,
    '',
    'Prep Notes:',
    notes || '(none)',
  ];
  return lines.join('\n');
}

/**
 * Build gws CLI args for creating a calendar event.
 */
export function buildInsertArgs({ title, start, end, description, location }) {
  const args = ['calendar', '+insert', '--title', title, '--start', start];
  if (end) args.push('--end', end);
  if (description) args.push('--description', description);
  if (location) args.push('--location', location);
  return args;
}

/**
 * Create an interview calendar event.
 */
export function createInterviewEvent({ company, role, start, durationMinutes = 60, score, reportLink, notes }) {
  const endDate = new Date(new Date(start).getTime() + durationMinutes * 60000);
  const end = endDate.toISOString().replace(/\.\d+Z$/, '');

  const title = `Interview: ${company} - ${role}`;
  const description = formatEventDescription({ company, role, score, reportLink, notes });
  const args = buildInsertArgs({ title, start, end, description });

  return execFileSync('gws', args, { encoding: 'utf-8', timeout: 15000 });
}
```

- [ ] **Step 14: Run test to verify it passes**

Run: `node --test intel/google/calendar-push.test.mjs`
Expected: All tests PASS

- [ ] **Step 15: Commit**

```bash
git add intel/google/calendar-push.mjs intel/google/calendar-push.test.mjs
git commit -m "feat(intel): add Google Calendar push module for interview events"
```

---

## Task 4: Google Poll Modules (Agent 4)

**Files:**
- Create: `intel/google/gmail-watch.mjs`
- Create: `intel/google/gmail-watch.test.mjs`
- Create: `intel/google/sheets-pull.mjs`
- Create: `intel/google/sheets-pull.test.mjs`
- Create: `intel/google/sync.mjs`

### Gmail Watch

- [ ] **Step 1: Write gmail-watch.test.mjs**

```js
// intel/google/gmail-watch.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchesRecruiterPattern, parseGmailMessage, classifyResponse } from './gmail-watch.mjs';

describe('gmail-watch', () => {
  describe('matchesRecruiterPattern', () => {
    it('matches interview-related subjects', () => {
      assert.equal(matchesRecruiterPattern('Interview Invitation - ML Engineer'), true);
      assert.equal(matchesRecruiterPattern('Next Steps with Acme Corp'), true);
      assert.equal(matchesRecruiterPattern('Your Application Update'), true);
    });

    it('rejects unrelated subjects', () => {
      assert.equal(matchesRecruiterPattern('Weekly Newsletter'), false);
      assert.equal(matchesRecruiterPattern('Your order has shipped'), false);
    });

    it('matches with custom patterns', () => {
      const custom = ['offer letter', 'phone screen'];
      assert.equal(matchesRecruiterPattern('Offer Letter - Acme Corp', custom), true);
      assert.equal(matchesRecruiterPattern('Phone Screen Schedule', custom), true);
    });
  });

  describe('classifyResponse', () => {
    it('classifies interview invitations', () => {
      assert.equal(classifyResponse('We would like to schedule an interview'), 'Interview');
    });

    it('classifies rejections', () => {
      assert.equal(classifyResponse('We have decided to move forward with other candidates'), 'Rejected');
    });

    it('classifies offer signals', () => {
      assert.equal(classifyResponse('We are pleased to extend an offer'), 'Offer');
    });

    it('defaults to Responded for ambiguous content', () => {
      assert.equal(classifyResponse('Thank you for your interest'), 'Responded');
    });
  });

  describe('parseGmailMessage', () => {
    it('extracts company from sender domain', () => {
      const msg = {
        from: 'recruiter@acme.com',
        subject: 'Interview Invitation',
        body: 'We want to schedule an interview',
        date: '2026-04-07',
      };
      const parsed = parseGmailMessage(msg);
      assert.equal(parsed.domain, 'acme.com');
      assert.equal(parsed.suggestedStatus, 'Interview');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test intel/google/gmail-watch.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement gmail-watch.mjs**

```js
// intel/google/gmail-watch.mjs
import { execFileSync } from 'node:child_process';

const DEFAULT_PATTERNS = ['interview', 'application', 'next steps', 'offer', 'phone screen', 'recruiter'];

const INTERVIEW_RE = /\b(schedule|interview|meet|call|screen|chat)\b/i;
const REJECTION_RE = /\b(move forward with other|not moving forward|decided not to|unfortunately|regret)\b/i;
const OFFER_RE = /\b(extend (an )?offer|offer letter|compensation package|pleased to offer)\b/i;

/**
 * Check if a subject line matches recruiter patterns.
 */
export function matchesRecruiterPattern(subject, patterns = DEFAULT_PATTERNS) {
  const lower = subject.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

/**
 * Classify a message body into a suggested application status.
 */
export function classifyResponse(body) {
  if (OFFER_RE.test(body)) return 'Offer';
  if (INTERVIEW_RE.test(body)) return 'Interview';
  if (REJECTION_RE.test(body)) return 'Rejected';
  return 'Responded';
}

/**
 * Parse a Gmail message into structured fields.
 */
export function parseGmailMessage(msg) {
  const domain = msg.from ? msg.from.split('@')[1]?.toLowerCase() : '';
  const suggestedStatus = classifyResponse(msg.body || '');
  return {
    from: msg.from,
    domain,
    subject: msg.subject,
    date: msg.date,
    suggestedStatus,
    bodyPreview: (msg.body || '').slice(0, 200),
  };
}

/**
 * Poll Gmail for new messages matching recruiter patterns.
 * Uses gws CLI: gws gmail +list --query "..." --after "date"
 */
export function pollGmail(afterDate, patterns = DEFAULT_PATTERNS) {
  const query = patterns.map((p) => `subject:${p}`).join(' OR ');
  const args = ['gmail', '+list', '--query', `${query} after:${afterDate}`, '--format', 'json'];

  let output;
  try {
    output = execFileSync('gws', args, { encoding: 'utf-8', timeout: 30000 });
  } catch {
    return [];
  }

  let messages;
  try {
    messages = JSON.parse(output);
  } catch {
    return [];
  }

  if (!Array.isArray(messages)) return [];

  return messages
    .filter((msg) => matchesRecruiterPattern(msg.subject || '', patterns))
    .map(parseGmailMessage);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test intel/google/gmail-watch.test.mjs`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add intel/google/gmail-watch.mjs intel/google/gmail-watch.test.mjs
git commit -m "feat(intel): add Gmail watch module for recruiter response detection"
```

### Sheets Pull

- [ ] **Step 6: Write sheets-pull.test.mjs**

```js
// intel/google/sheets-pull.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSheetRow, detectManualEdits, reconcileRow } from './sheets-pull.mjs';

describe('sheets-pull', () => {
  describe('parseSheetRow', () => {
    it('parses a sheet row array into structured data', () => {
      const row = ['42', '2026-04-07', 'Acme Corp', 'ML Engineer', '4.2/5', 'Applied', '✅', '042', 'Updated manually'];
      const parsed = parseSheetRow(row);
      assert.equal(parsed.num, '42');
      assert.equal(parsed.status, 'Applied');
      assert.equal(parsed.notes, 'Updated manually');
    });

    it('returns null for short rows', () => {
      assert.equal(parseSheetRow(['42', '2026-04-07']), null);
    });
  });

  describe('detectManualEdits', () => {
    it('detects status changes between sheet and tracker', () => {
      const sheetRows = [
        { num: '42', status: 'Applied', notes: 'Updated' },
        { num: '43', status: 'Evaluated', notes: '' },
      ];
      const trackerRows = [
        { num: '42', status: 'Evaluated', notes: 'Original' },
        { num: '43', status: 'Evaluated', notes: '' },
      ];
      const edits = detectManualEdits(sheetRows, trackerRows);
      assert.equal(edits.length, 1);
      assert.equal(edits[0].num, '42');
      assert.equal(edits[0].newStatus, 'Applied');
    });

    it('returns empty array when no changes', () => {
      const rows = [{ num: '42', status: 'Evaluated', notes: '' }];
      assert.deepEqual(detectManualEdits(rows, rows), []);
    });
  });

  describe('reconcileRow', () => {
    it('creates an updated row merging sheet changes', () => {
      const tracker = { num: '42', date: '2026-04-07', company: 'Acme', role: 'ML', score: '4.2/5', status: 'Evaluated', pdf: '✅', report: '042', notes: 'Original' };
      const edit = { num: '42', newStatus: 'Applied', newNotes: 'Applied via LinkedIn' };
      const result = reconcileRow(tracker, edit);
      assert.equal(result.status, 'Applied');
      assert.equal(result.notes, 'Applied via LinkedIn');
      assert.equal(result.company, 'Acme'); // unchanged fields preserved
    });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `node --test intel/google/sheets-pull.test.mjs`
Expected: FAIL

- [ ] **Step 8: Implement sheets-pull.mjs**

```js
// intel/google/sheets-pull.mjs
import { execFileSync } from 'node:child_process';

/**
 * Parse a sheet row (array of cell values) into structured data.
 */
export function parseSheetRow(cells) {
  if (!cells || cells.length < 8) return null;
  return {
    num: cells[0],
    date: cells[1],
    company: cells[2],
    role: cells[3],
    score: cells[4],
    status: cells[5],
    pdf: cells[6],
    report: cells[7],
    notes: cells[8] || '',
  };
}

/**
 * Detect manual edits by comparing sheet rows to tracker rows.
 * Returns array of { num, newStatus, newNotes } for changed rows.
 */
export function detectManualEdits(sheetRows, trackerRows) {
  const trackerMap = new Map();
  for (const row of trackerRows) {
    trackerMap.set(row.num, row);
  }

  const edits = [];
  for (const sheetRow of sheetRows) {
    const trackerRow = trackerMap.get(sheetRow.num);
    if (!trackerRow) continue;

    const statusChanged = sheetRow.status !== trackerRow.status;
    const notesChanged = sheetRow.notes !== trackerRow.notes;

    if (statusChanged || notesChanged) {
      edits.push({
        num: sheetRow.num,
        newStatus: statusChanged ? sheetRow.status : trackerRow.status,
        newNotes: notesChanged ? sheetRow.notes : trackerRow.notes,
      });
    }
  }

  return edits;
}

/**
 * Create a reconciled row by applying sheet edits to tracker data.
 */
export function reconcileRow(trackerRow, edit) {
  return {
    ...trackerRow,
    status: edit.newStatus ?? trackerRow.status,
    notes: edit.newNotes ?? trackerRow.notes,
  };
}

/**
 * Read all rows from a Google Sheet. Returns array of row arrays.
 */
export function readSheet(sheetId) {
  let output;
  try {
    output = execFileSync('gws', ['sheets', '+read', '--spreadsheet', sheetId, '--range', 'A:I', '--format', 'json'], {
      encoding: 'utf-8',
      timeout: 15000,
    });
  } catch {
    return [];
  }

  try {
    const data = JSON.parse(output);
    // Skip header row
    return (data.values || data || []).slice(1).map(parseSheetRow).filter(Boolean);
  } catch {
    return [];
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `node --test intel/google/sheets-pull.test.mjs`
Expected: All tests PASS

- [ ] **Step 10: Commit**

```bash
git add intel/google/sheets-pull.mjs intel/google/sheets-pull.test.mjs
git commit -m "feat(intel): add Google Sheets pull module for bidi sync"
```

### Sync Coordinator

- [ ] **Step 11: Write sync.mjs**

```js
// intel/google/sync.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { readSheet, detectManualEdits, reconcileRow } from './sheets-pull.mjs';
import { appendRow, updateStatus, parseTrackerRow } from './sheets-push.mjs';

/**
 * Parse applications.md into structured rows.
 */
export function parseApplicationsMd(content) {
  return content
    .split('\n')
    .map(parseTrackerRow)
    .filter(Boolean);
}

/**
 * Pull manual edits from Google Sheet and apply to applications.md.
 * Returns array of edits applied.
 */
export function pullEdits(sheetId, applicationsMdPath) {
  const sheetRows = readSheet(sheetId);
  if (sheetRows.length === 0) return [];

  const mdContent = readFileSync(applicationsMdPath, 'utf-8');
  const trackerRows = parseApplicationsMd(mdContent);

  const edits = detectManualEdits(sheetRows, trackerRows);
  if (edits.length === 0) return [];

  // Apply edits to applications.md
  let updatedContent = mdContent;
  for (const edit of edits) {
    const tracker = trackerRows.find((r) => r.num === edit.num);
    if (!tracker) continue;
    const reconciled = reconcileRow(tracker, edit);

    // Replace the line in the md content
    const oldLine = mdContent.split('\n').find((l) => {
      const parsed = parseTrackerRow(l);
      return parsed && parsed.num === edit.num;
    });
    if (oldLine) {
      const newLine = `| ${reconciled.num} | ${reconciled.date} | ${reconciled.company} | ${reconciled.role} | ${reconciled.score} | ${reconciled.status} | ${reconciled.pdf} | ${reconciled.report} | ${reconciled.notes} |`;
      updatedContent = updatedContent.replace(oldLine, newLine);
    }
  }

  writeFileSync(applicationsMdPath, updatedContent);
  return edits;
}

/**
 * Push a new evaluation to the Google Sheet.
 */
export function pushNewEvaluation(sheetId, row) {
  return appendRow(sheetId, row);
}

/**
 * Push a status update to the Google Sheet.
 */
export function pushStatusUpdate(sheetId, rowNumber, status) {
  return updateStatus(sheetId, rowNumber, status);
}

/**
 * Full sync cycle: pull edits first, then push any pending changes.
 */
export function syncAll(sheetId, applicationsMdPath) {
  const edits = pullEdits(sheetId, applicationsMdPath);
  return { editsPulled: edits.length };
}
```

- [ ] **Step 12: Commit**

```bash
git add intel/google/sync.mjs
git commit -m "feat(intel): add Google Workspace sync coordinator"
```

---

## Task 5: Orchestrator + Pipeline Functions (Agent 5)

**Depends on:** Tasks 1 and 2 (source modules must exist)

**Files:**
- Create: `intel/orchestrator.mjs`
- Create: `intel/orchestrator.test.mjs`

- [ ] **Step 1: Write orchestrator.test.mjs**

```js
// intel/orchestrator.test.mjs
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeQuery,
  loadSourceModule,
  trySourceChain,
} from './orchestrator.mjs';

describe('orchestrator', () => {
  describe('loadSourceModule', () => {
    it('loads a valid source module', async () => {
      const mod = await loadSourceModule('builtin');
      assert.equal(typeof mod.execute, 'function');
      assert.equal(typeof mod.estimateCost, 'function');
      assert.equal(typeof mod.isAvailable, 'function');
    });

    it('returns null for unknown source', async () => {
      const mod = await loadSourceModule('nonexistent');
      assert.equal(mod, null);
    });
  });

  describe('trySourceChain', () => {
    it('returns results from first available source', async () => {
      const sources = [
        {
          name: 'failing',
          module: {
            isAvailable: () => true,
            estimateCost: () => 0.01,
            execute: async () => { throw new Error('fail'); },
          },
        },
        {
          name: 'succeeding',
          module: {
            isAvailable: () => true,
            estimateCost: () => 0.01,
            execute: async () => [{ title: 'Result', url: 'https://example.com', snippet: 'test', metadata: {}, source: 'test' }],
          },
        },
      ];

      const mockBudget = {
        reserveBudget: () => true,
        commitBudget: () => {},
        releaseBudget: () => {},
      };

      const results = await trySourceChain(sources, { query: 'test' }, mockBudget);
      assert.equal(results.length, 1);
      assert.equal(results[0].title, 'Result');
    });

    it('skips unavailable sources', async () => {
      const sources = [
        {
          name: 'unavailable',
          module: {
            isAvailable: () => false,
            estimateCost: () => 0,
            execute: async () => [],
          },
        },
        {
          name: 'available',
          module: {
            isAvailable: () => true,
            estimateCost: () => 0,
            execute: async () => [{ title: 'Found', url: '', snippet: '', metadata: {}, source: 'test' }],
          },
        },
      ];

      const mockBudget = {
        reserveBudget: () => true,
        commitBudget: () => {},
        releaseBudget: () => {},
      };

      const results = await trySourceChain(sources, { query: 'test' }, mockBudget);
      assert.equal(results.length, 1);
      assert.equal(results[0].title, 'Found');
    });

    it('skips sources when budget is exceeded', async () => {
      const sources = [
        {
          name: 'expensive',
          module: {
            isAvailable: () => true,
            estimateCost: () => 100,
            execute: async () => [{ title: 'Expensive', url: '', snippet: '', metadata: {}, source: 'test' }],
          },
        },
        {
          name: 'free',
          module: {
            isAvailable: () => true,
            estimateCost: () => 0,
            execute: async () => [{ title: 'Free', url: '', snippet: '', metadata: {}, source: 'test' }],
          },
        },
      ];

      const mockBudget = {
        reserveBudget: (source, cost) => cost < 50, // reject expensive
        commitBudget: () => {},
        releaseBudget: () => {},
      };

      const results = await trySourceChain(sources, { query: 'test' }, mockBudget);
      assert.equal(results[0].title, 'Free');
    });
  });

  describe('executeQuery', () => {
    it('returns results for a valid query using builtin fallback', async () => {
      // With no API keys set, should fall through to builtin
      const origKeys = {};
      for (const k of ['EXA_API_KEY', 'TAVILY_API_KEY', 'PARALLEL_API_KEY']) {
        origKeys[k] = process.env[k];
        delete process.env[k];
      }

      try {
        const results = await executeQuery('find ML Engineer jobs', {
          budgets: {},
          usagePath: '/tmp/test-budget.json',
          lockPath: '/tmp/test-budget.lock',
        });
        assert.ok(results.length > 0);
        assert.equal(results[0].source, 'builtin');
      } finally {
        for (const [k, v] of Object.entries(origKeys)) {
          if (v !== undefined) process.env[k] = v;
          else delete process.env[k];
        }
      }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test intel/orchestrator.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement orchestrator.mjs**

```js
// intel/orchestrator.mjs
import { classifyQuery, getRoutingChain } from './router.mjs';
import { dedup } from './dedup.mjs';
import { BudgetTracker } from './budget.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Dynamically load a source module by name.
 * Returns the module or null if not found.
 */
export async function loadSourceModule(name) {
  try {
    return await import(join(__dirname, 'sources', `${name}.mjs`));
  } catch {
    return null;
  }
}

/**
 * Try each source in the chain until one succeeds.
 * Handles budget reservation, execution, and commit/release.
 */
export async function trySourceChain(sources, query, budget) {
  for (const { name, module: mod } of sources) {
    if (!mod.isAvailable()) continue;

    const estimatedCost = mod.estimateCost(query.type || 'search');
    if (!budget.reserveBudget(name, estimatedCost)) continue;

    try {
      const results = await mod.execute(query);
      budget.commitBudget(name, estimatedCost);
      if (results && results.length > 0) return results;
    } catch {
      budget.releaseBudget(name, estimatedCost);
    }
  }

  return [];
}

/**
 * Execute a query through the full pipeline:
 * classify → route → source chain → dedup → return.
 */
export async function executeQuery(query, options = {}) {
  const queryType = classifyQuery(query);
  const chain = getRoutingChain(queryType);

  const budget = new BudgetTracker(
    options.usagePath || join(__dirname, '..', '.intel-budget.json'),
    options.lockPath || join(__dirname, '..', '.intel-budget.lock'),
    options.budgets || {},
  );
  budget.load();

  // Load source modules for each entry in the chain
  const sources = [];
  for (const entry of chain) {
    const mod = await loadSourceModule(entry.source);
    if (mod) sources.push({ name: entry.source, module: mod });
  }

  const results = await trySourceChain(sources, { ...options, query, type: queryType }, budget);

  budget.save();

  // Dedup results
  return dedup(results.map((r) => ({
    ...r,
    company: r.metadata?.company || r.title,
    title: r.title,
  })));
}

/**
 * Run a prospect scan across all configured portals.
 * Checks liveness of discovered URLs and marks dead links as expired.
 */
export async function runProspectScan(config = {}) {
  const keywords = config.keywords || ['AI Engineer', 'ML Engineer', 'Head of AI'];
  const allResults = [];

  for (const keyword of keywords) {
    const results = await executeQuery(`find ${keyword} jobs`, {
      budgets: config.budgets,
      usagePath: config.usagePath,
      lockPath: config.lockPath,
    });
    allResults.push(...results);
  }

  const dedupedResults = dedup(allResults);

  // Liveness check: filter out expired URLs using check-liveness.mjs logic
  if (config.checkLiveness !== false) {
    const { checkUrlLiveness } = await import('../check-liveness-lib.mjs').catch(() => ({ checkUrlLiveness: null }));
    if (checkUrlLiveness) {
      const liveResults = [];
      for (const result of dedupedResults) {
        if (!result.url) { liveResults.push(result); continue; }
        const status = await checkUrlLiveness(result.url);
        if (status.result !== 'expired') liveResults.push(result);
      }
      return liveResults;
    }
  }

  return dedupedResults;
}

/**
 * Run outreach research for a specific company and role.
 */
export async function runOutreachResearch(company, role, options = {}) {
  const personResults = await executeQuery(`find hiring manager for ${role} at ${company}`, options);
  const emailResults = await executeQuery(`find email for hiring manager at ${company}`, options);

  return {
    people: personResults,
    emails: emailResults,
    company,
    role,
  };
}

/**
 * Run company intelligence research.
 */
export async function runCompanyIntel(company, depth = 'quick', options = {}) {
  const query = depth === 'deep'
    ? `deep research analysis ${company} funding team tech stack culture`
    : `tell me about ${company}`;

  return executeQuery(query, options);
}

/**
 * Run market trends scan.
 */
export async function runMarketScan(options = {}) {
  return executeQuery('AI hiring trends salary compensation 2026', options);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test intel/orchestrator.test.mjs`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add intel/orchestrator.mjs intel/orchestrator.test.mjs
git commit -m "feat(intel): add orchestrator with source chain, budget tracking, and pipeline functions"
```

---

## Task 6: Wiring, Config, Docs (Agent 6)

**Depends on:** Tasks 3, 4, and 5

**Files:**
- Create: `intel/wiring.mjs`
- Create: `intel/wiring.test.mjs`
- Modify: `config/intel.example.yml`
- Modify: `config/intel.yml`
- Modify: `intel/engine.mjs`
- Modify: `intel/README.md`
- Modify: `intel/SETUP.md`

### Wiring Module

- [ ] **Step 1: Write wiring.test.mjs**

```js
// intel/wiring.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCalibrationEntry, extractVoicePatterns, diffDrafts } from './wiring.mjs';

describe('wiring', () => {
  describe('buildCalibrationEntry', () => {
    it('creates a calibration log entry from an evaluation', () => {
      const entry = buildCalibrationEntry({
        company: 'Acme Corp',
        role: 'ML Engineer',
        score: 4.2,
        archetype: 'ai-ml-engineer',
        action: 'applied',
        feedback: 'Good fit, salary slightly low',
      });
      assert.equal(entry.company, 'Acme Corp');
      assert.equal(entry.score, '4.2');
      assert.equal(entry.action, 'applied');
      assert.ok(entry.date.match(/^\d{4}-\d{2}-\d{2}$/));
    });
  });

  describe('diffDrafts', () => {
    it('detects changed lines between original and edited', () => {
      const original = 'Hi Jane,\nI noticed your team is growing.\nWould love to connect.';
      const edited = 'Hi Jane,\nI saw your team just raised a Series B.\nWould love to chat.';
      const diff = diffDrafts(original, edited);
      assert.equal(diff.changed, 2);
      assert.equal(diff.unchanged, 1);
    });

    it('returns zero changes for identical drafts', () => {
      const text = 'Same text';
      const diff = diffDrafts(text, text);
      assert.equal(diff.changed, 0);
    });
  });

  describe('extractVoicePatterns', () => {
    it('extracts sentence length preference', () => {
      const patterns = extractVoicePatterns(
        'I noticed your team is growing rapidly. I would be interested in discussing.',
        'Saw your team is growing fast. Keen to chat.'
      );
      assert.equal(patterns.prefersShorterSentences, true);
    });

    it('detects formality reduction', () => {
      const patterns = extractVoicePatterns(
        'I would be most interested in exploring opportunities.',
        'I\'d love to explore opportunities.'
      );
      assert.equal(patterns.prefersInformal, true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test intel/wiring.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement wiring.mjs**

```js
// intel/wiring.mjs
import { readFileSync, appendFileSync } from 'node:fs';

/**
 * Build a calibration log entry from an evaluation result.
 */
export function buildCalibrationEntry({ company, role, score, archetype, action, feedback }) {
  const date = new Date().toISOString().slice(0, 10);
  const delta = feedback || '';
  return {
    date,
    company,
    role,
    score: String(score),
    action: action || '',
    delta,
    lesson: feedback || '',
  };
}

/**
 * Append a calibration entry to the strategy ledger.
 */
export function recordOutcome(ledgerPath, evaluation) {
  const entry = buildCalibrationEntry(evaluation);
  const line = `| ${entry.date} | ${entry.company} | ${entry.role} | ${entry.score} | ${entry.action} | ${entry.delta} | ${entry.lesson} |`;
  appendFileSync(ledgerPath, line + '\n');
  return entry;
}

/**
 * Diff two draft texts and count changed vs unchanged lines.
 */
export function diffDrafts(original, edited) {
  const origLines = original.split('\n');
  const editLines = edited.split('\n');
  const maxLen = Math.max(origLines.length, editLines.length);
  let changed = 0;
  let unchanged = 0;

  for (let i = 0; i < maxLen; i++) {
    if (origLines[i] === editLines[i]) unchanged++;
    else changed++;
  }

  return { changed, unchanged };
}

/**
 * Extract voice/style patterns by comparing original and edited drafts.
 */
export function extractVoicePatterns(original, edited) {
  const origSentences = original.split(/[.!?]+/).filter(Boolean);
  const editSentences = edited.split(/[.!?]+/).filter(Boolean);

  const origAvgLen = origSentences.reduce((s, t) => s + t.trim().length, 0) / (origSentences.length || 1);
  const editAvgLen = editSentences.reduce((s, t) => s + t.trim().length, 0) / (editSentences.length || 1);

  const prefersShorterSentences = editAvgLen < origAvgLen * 0.85;

  // Detect formality: contractions, casual words
  const contractionRe = /\b(I'd|I'm|I've|can't|won't|don't|isn't|wouldn't|couldn't)\b/gi;
  const origContractions = (original.match(contractionRe) || []).length;
  const editContractions = (edited.match(contractionRe) || []).length;
  const prefersInformal = editContractions > origContractions;

  return {
    prefersShorterSentences,
    prefersInformal,
    avgSentenceLength: Math.round(editAvgLen),
  };
}

/**
 * Append voice patterns to the voice profile.
 */
export function updateVoiceProfile(profilePath, patterns) {
  const lines = [
    '',
    `## Update ${new Date().toISOString().slice(0, 10)}`,
    `- Prefers shorter sentences: ${patterns.prefersShorterSentences}`,
    `- Prefers informal tone: ${patterns.prefersInformal}`,
    `- Average sentence length: ${patterns.avgSentenceLength} chars`,
  ];
  appendFileSync(profilePath, lines.join('\n') + '\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test intel/wiring.test.mjs`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add intel/wiring.mjs intel/wiring.test.mjs
git commit -m "feat(intel): add wiring module for eval loop + voice profile learning"
```

### Config Updates

- [ ] **Step 6: Update config/intel.example.yml with Google config**

Add the following after the existing `google:` section in `config/intel.example.yml`:

```yaml
google:
  docs_mcp: true                          # Enable Google Docs MCP server for cover letters & docs
  gogcli: true                            # Enable gogcli for Google Calendar & Contacts
  gws_cli: true                           # Enable gws CLI for push operations
  tracking_sheet_id: ""                   # Google Sheet ID for application tracking
  cover_letter_folder_id: ""              # Google Drive folder for generated docs
  gmail_monitor: true                     # Enable Gmail polling for recruiter responses
  gmail_labels: ["INBOX"]                 # Labels to monitor
  gmail_recruiter_patterns:               # Subject line patterns to match
    - "interview"
    - "application"
    - "next steps"
    - "offer"
```

Apply the same change to `config/intel.yml`.

- [ ] **Step 7: Update intel/engine.mjs to check gws CLI**

Add `gws` CLI check after the existing `gogcli` check (around line 70):

```js
  // gws CLI
  let gwsAvailable = false;
  try {
    execFileSync('which', ['gws'], { encoding: 'utf-8', timeout: 3000 });
    gwsAvailable = true;
  } catch {
    // gws not found
  }
```

Add `gwsAvailable` to the return object and status report.

- [ ] **Step 8: Update intel/README.md**

Add the orchestrator and Google integration to the Architecture section. Add new commands for Google sync. Update the Quick Start to mention `gws` installation.

- [ ] **Step 9: Update intel/SETUP.md**

Add Google Workspace setup instructions:

```markdown
## Google Workspace Setup

### 1. Install gws CLI

```bash
brew install googleworkspace-cli
```

### 2. Authenticate

```bash
gws auth setup
gws auth login
```

### 3. Create tracking spreadsheet

Create a Google Sheet with columns: #, Date, Company, Role, Score, Status, PDF, Report, Notes.
Copy the spreadsheet ID from the URL and add to `config/intel.yml`:

```yaml
google:
  tracking_sheet_id: "your-sheet-id-here"
```

### 4. Create cover letter folder (optional)

Create a folder in Google Drive for generated docs. Copy the folder ID and add to `config/intel.yml`:

```yaml
google:
  cover_letter_folder_id: "your-folder-id-here"
```
```

- [ ] **Step 10: Commit**

```bash
git add config/intel.example.yml config/intel.yml intel/engine.mjs intel/README.md intel/SETUP.md
git commit -m "feat(intel): add Google Workspace config, gws CLI check, and setup docs"
```

### Run All Tests

- [ ] **Step 11: Run the full intel test suite**

Run: `node --test intel/**/*.test.mjs`
Expected: All tests PASS (existing + new)

- [ ] **Step 12: Run the project-wide test suite**

Run: `node test-all.mjs`
Expected: All tests PASS

- [ ] **Step 13: Final commit with all files verified**

```bash
git add -A
git commit -m "feat(intel): complete Phase 2 — source modules, orchestrator, Google bidi sync, wiring"
```
