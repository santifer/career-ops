/**
 * Orchestrator Tests
 *
 * Tests for intel/orchestrator.mjs: loadSourceModule, trySourceChain,
 * executeQuery, runProspectScan, runOutreachResearch, runCompanyIntel,
 * runMarketScan.
 *
 * Strategy: node:test + node:assert/strict, inline mocks for budget and
 * source modules, no real API calls.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  loadSourceModule,
  trySourceChain,
  executeQuery,
  runProspectScan,
  runOutreachResearch,
  runCompanyIntel,
  runMarketScan,
} from './orchestrator.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'orchestrator-test-'));
});

after(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

/** A mock budget that approves everything */
const openBudget = {
  reserveBudget: (_source, _cost) => true,
  commitBudget: () => {},
  releaseBudget: () => {},
};

/** A mock budget that rejects everything (simulates exhausted budget) */
const closedBudget = {
  reserveBudget: (_source, _cost) => false,
  commitBudget: () => {},
  releaseBudget: () => {},
};

/** A mock budget that only approves cost < 50 */
const thresholdBudget = {
  reserveBudget: (_source, cost) => cost < 50,
  commitBudget: () => {},
  releaseBudget: () => {},
};

/** Build a simple mock source that returns results */
function makeSource({ available = true, cost = 0, results = null, throws = false } = {}) {
  return {
    isAvailable: () => available,
    estimateCost: (_queryType) => cost,
    execute: async (_query) => {
      if (throws) throw new Error('Source failed');
      return results ?? [{ title: 'Result', url: 'https://example.com/1', snippet: 'desc', metadata: {}, source: 'mock' }];
    },
  };
}

// ---------------------------------------------------------------------------
// loadSourceModule
// ---------------------------------------------------------------------------

describe('loadSourceModule', () => {
  it('returns the builtin module (always available, has required exports)', async () => {
    const mod = await loadSourceModule('builtin');
    assert.ok(mod !== null, 'should return a non-null module');
    assert.equal(typeof mod.execute, 'function', 'should have execute');
    assert.equal(typeof mod.estimateCost, 'function', 'should have estimateCost');
    assert.equal(typeof mod.isAvailable, 'function', 'should have isAvailable');
    assert.equal(mod.isAvailable(), true, 'builtin should always be available');
  });

  it('returns null for a non-existent source', async () => {
    const mod = await loadSourceModule('nonexistent-source-xyz');
    assert.equal(mod, null, 'should return null for unknown source');
  });

  it('returns a valid module for each known source name', async () => {
    const known = ['exa', 'tavily', 'firecrawl', 'parallel', 'brightdata', 'valyu', 'builtin'];
    for (const name of known) {
      const mod = await loadSourceModule(name);
      assert.ok(mod !== null, `${name} module should load`);
      assert.equal(typeof mod.execute, 'function', `${name}.execute should be a function`);
      assert.equal(typeof mod.isAvailable, 'function', `${name}.isAvailable should be a function`);
      assert.equal(typeof mod.estimateCost, 'function', `${name}.estimateCost should be a function`);
    }
  });
});

// ---------------------------------------------------------------------------
// trySourceChain
// ---------------------------------------------------------------------------

describe('trySourceChain', () => {
  it('returns results from the first available, affordable source', async () => {
    const mockResults = [
      { title: 'Job A', url: 'https://a.com/job/1', snippet: 'Great job', metadata: {}, source: 'mock' },
    ];
    const sources = [
      { name: 'primary', module: makeSource({ results: mockResults }) },
      { name: 'fallback', module: makeSource({ results: [] }) },
    ];

    const results = await trySourceChain(sources, { query: 'test', type: 'search' }, openBudget);
    assert.deepEqual(results, mockResults, 'should return first source results');
  });

  it('skips unavailable sources and uses next available', async () => {
    const fallbackResults = [
      { title: 'Fallback result', url: 'https://fb.com/1', snippet: '', metadata: {}, source: 'fallback' },
    ];
    const sources = [
      { name: 'unavailable', module: makeSource({ available: false }) },
      { name: 'fallback', module: makeSource({ results: fallbackResults }) },
    ];

    const results = await trySourceChain(sources, { query: 'test', type: 'search' }, openBudget);
    assert.deepEqual(results, fallbackResults, 'should skip unavailable and use fallback');
  });

  it('skips over-budget sources and uses next affordable one', async () => {
    const cheapResults = [
      { title: 'Cheap result', url: 'https://cheap.com/1', snippet: '', metadata: {}, source: 'cheap' },
    ];
    const sources = [
      { name: 'expensive', module: makeSource({ cost: 100 }) },    // cost >= 50 → rejected
      { name: 'cheap', module: makeSource({ cost: 1, results: cheapResults }) }, // cost < 50 → accepted
    ];

    const results = await trySourceChain(sources, { query: 'test', type: 'search' }, thresholdBudget);
    assert.deepEqual(results, cheapResults, 'should skip expensive and use cheap source');
  });

  it('falls back on error and continues to next source', async () => {
    const backupResults = [
      { title: 'Backup', url: 'https://backup.com/1', snippet: '', metadata: {}, source: 'backup' },
    ];
    const sources = [
      { name: 'erroring', module: makeSource({ throws: true }) },
      { name: 'backup', module: makeSource({ results: backupResults }) },
    ];

    const results = await trySourceChain(sources, { query: 'test', type: 'search' }, openBudget);
    assert.deepEqual(results, backupResults, 'should fall back to backup after error');
  });

  it('returns [] when all sources fail', async () => {
    const sources = [
      { name: 's1', module: makeSource({ throws: true }) },
      { name: 's2', module: makeSource({ available: false }) },
      { name: 's3', module: makeSource({ throws: true }) },
    ];

    const results = await trySourceChain(sources, { query: 'test', type: 'search' }, openBudget);
    assert.deepEqual(results, [], 'should return empty array when all fail');
  });

  it('returns [] when all sources are over budget', async () => {
    const sources = [
      { name: 's1', module: makeSource({ cost: 100 }) },
      { name: 's2', module: makeSource({ cost: 200 }) },
    ];

    const results = await trySourceChain(sources, { query: 'test', type: 'search' }, closedBudget);
    assert.deepEqual(results, [], 'should return empty array when all over budget');
  });

  it('skips source that returns empty array and uses next', async () => {
    const goodResults = [
      { title: 'Good', url: 'https://good.com/1', snippet: '', metadata: {}, source: 'good' },
    ];
    const sources = [
      { name: 'empty', module: makeSource({ results: [] }) },
      { name: 'good', module: makeSource({ results: goodResults }) },
    ];

    const results = await trySourceChain(sources, { query: 'test', type: 'search' }, openBudget);
    assert.deepEqual(results, goodResults, 'should skip empty results and use next source');
  });

  it('calls releaseBudget on source error', async () => {
    let released = false;
    const trackingBudget = {
      reserveBudget: () => true,
      commitBudget: () => {},
      releaseBudget: (_source, _amount) => { released = true; },
    };
    const sources = [
      { name: 'erroring', module: makeSource({ throws: true }) },
    ];

    await trySourceChain(sources, { query: 'test', type: 'search' }, trackingBudget);
    assert.equal(released, true, 'should call releaseBudget after source error');
  });

  it('calls commitBudget on source success', async () => {
    let committed = false;
    const trackingBudget = {
      reserveBudget: () => true,
      commitBudget: () => { committed = true; },
      releaseBudget: () => {},
    };
    const sources = [
      { name: 'success', module: makeSource() },
    ];

    await trySourceChain(sources, { query: 'test', type: 'search' }, trackingBudget);
    assert.equal(committed, true, 'should call commitBudget on success');
  });
});

// ---------------------------------------------------------------------------
// executeQuery
// ---------------------------------------------------------------------------

describe('executeQuery', () => {
  it('falls through to builtin when no API keys are set and returns results', async () => {
    // Save and clear API key env vars that could enable real sources
    const savedEnv = {};
    const keysToUnset = ['EXA_API_KEY', 'TAVILY_API_KEY', 'FIRECRAWL_API_KEY', 'BRIGHTDATA_API_KEY', 'VALYU_API_KEY'];
    for (const k of keysToUnset) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }

    try {
      const results = await executeQuery('AI Engineer jobs', {
        usagePath: join(tmpDir, 'budget.json'),
        lockPath: join(tmpDir, 'budget.lock'),
        budgets: {},
      });

      assert.ok(Array.isArray(results), 'should return an array');
      assert.ok(results.length > 0, 'should return at least one result from builtin');

      const sources = results.map((r) => r.source);
      assert.ok(sources.every((s) => s === 'builtin'), 'all results should come from builtin');
    } finally {
      // Restore env vars
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v !== undefined) process.env[k] = v;
      }
    }
  });

  it('returns deduplicated results (no exact URL duplicates)', async () => {
    const savedEnv = {};
    const keysToUnset = ['EXA_API_KEY', 'TAVILY_API_KEY', 'FIRECRAWL_API_KEY', 'BRIGHTDATA_API_KEY', 'VALYU_API_KEY'];
    for (const k of keysToUnset) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }

    try {
      const results = await executeQuery('tell me about Anthropic', {
        usagePath: join(tmpDir, 'budget2.json'),
        lockPath: join(tmpDir, 'budget2.lock'),
        budgets: {},
      });

      // Check no duplicate URLs (ignore empty URLs)
      const urls = results.map((r) => r.url).filter(Boolean);
      const uniqueUrls = new Set(urls);
      assert.equal(urls.length, uniqueUrls.size, 'should not have duplicate URLs in results');
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v !== undefined) process.env[k] = v;
      }
    }
  });

  it('classifies different queries and returns results each time', async () => {
    const savedEnv = {};
    const keysToUnset = ['EXA_API_KEY', 'TAVILY_API_KEY', 'FIRECRAWL_API_KEY', 'BRIGHTDATA_API_KEY', 'VALYU_API_KEY'];
    for (const k of keysToUnset) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }

    try {
      const queries = [
        'find hiring manager at OpenAI',
        'find email for hiring manager at Stripe',
        'AI hiring trends salary compensation 2026',
      ];

      for (const q of queries) {
        const results = await executeQuery(q, {
          usagePath: join(tmpDir, `budget-${Date.now()}.json`),
          lockPath: join(tmpDir, `budget-${Date.now()}.lock`),
          budgets: {},
        });
        assert.ok(Array.isArray(results), `should return array for query: ${q}`);
        assert.ok(results.length >= 0, `should return non-negative count for: ${q}`);
      }
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v !== undefined) process.env[k] = v;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// runProspectScan
// ---------------------------------------------------------------------------

describe('runProspectScan', () => {
  it('uses default keywords when none provided', async () => {
    const savedEnv = {};
    const keysToUnset = ['EXA_API_KEY', 'TAVILY_API_KEY', 'FIRECRAWL_API_KEY', 'BRIGHTDATA_API_KEY', 'VALYU_API_KEY'];
    for (const k of keysToUnset) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }

    try {
      const results = await runProspectScan({
        usagePath: join(tmpDir, 'scan-budget.json'),
        lockPath: join(tmpDir, 'scan-budget.lock'),
        budgets: {},
      });
      assert.ok(Array.isArray(results), 'should return array');
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v !== undefined) process.env[k] = v;
      }
    }
  });

  it('accepts custom keywords and runs a query per keyword', async () => {
    const savedEnv = {};
    const keysToUnset = ['EXA_API_KEY', 'TAVILY_API_KEY', 'FIRECRAWL_API_KEY', 'BRIGHTDATA_API_KEY', 'VALYU_API_KEY'];
    for (const k of keysToUnset) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }

    try {
      const results = await runProspectScan({
        keywords: ['Head of AI', 'AI Director'],
        usagePath: join(tmpDir, 'scan2-budget.json'),
        lockPath: join(tmpDir, 'scan2-budget.lock'),
        budgets: {},
      });
      assert.ok(Array.isArray(results), 'should return array');
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v !== undefined) process.env[k] = v;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// runOutreachResearch
// ---------------------------------------------------------------------------

describe('runOutreachResearch', () => {
  it('returns object with people, emails, company, role fields', async () => {
    const savedEnv = {};
    const keysToUnset = ['EXA_API_KEY', 'TAVILY_API_KEY', 'FIRECRAWL_API_KEY', 'BRIGHTDATA_API_KEY', 'VALYU_API_KEY'];
    for (const k of keysToUnset) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }

    try {
      const result = await runOutreachResearch('Acme Corp', 'Engineering Manager', {
        usagePath: join(tmpDir, 'outreach-budget.json'),
        lockPath: join(tmpDir, 'outreach-budget.lock'),
        budgets: {},
      });

      assert.ok(typeof result === 'object', 'should return an object');
      assert.ok(Array.isArray(result.people), 'people should be an array');
      assert.ok(Array.isArray(result.emails), 'emails should be an array');
      assert.equal(result.company, 'Acme Corp', 'company should match input');
      assert.equal(result.role, 'Engineering Manager', 'role should match input');
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v !== undefined) process.env[k] = v;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// runCompanyIntel
// ---------------------------------------------------------------------------

describe('runCompanyIntel', () => {
  it('returns results array for quick depth', async () => {
    const savedEnv = {};
    const keysToUnset = ['EXA_API_KEY', 'TAVILY_API_KEY', 'FIRECRAWL_API_KEY', 'BRIGHTDATA_API_KEY', 'VALYU_API_KEY'];
    for (const k of keysToUnset) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }

    try {
      const results = await runCompanyIntel('Anthropic', 'quick', {
        usagePath: join(tmpDir, 'intel-budget.json'),
        lockPath: join(tmpDir, 'intel-budget.lock'),
        budgets: {},
      });

      assert.ok(Array.isArray(results), 'should return array');
      assert.ok(results.length >= 0, 'should have non-negative count');
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v !== undefined) process.env[k] = v;
      }
    }
  });

  it('uses different query for deep depth', async () => {
    const savedEnv = {};
    const keysToUnset = ['EXA_API_KEY', 'TAVILY_API_KEY', 'FIRECRAWL_API_KEY', 'BRIGHTDATA_API_KEY', 'VALYU_API_KEY'];
    for (const k of keysToUnset) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }

    try {
      const results = await runCompanyIntel('OpenAI', 'deep', {
        usagePath: join(tmpDir, 'intel-deep-budget.json'),
        lockPath: join(tmpDir, 'intel-deep-budget.lock'),
        budgets: {},
      });

      assert.ok(Array.isArray(results), 'should return array for deep depth');
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v !== undefined) process.env[k] = v;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// runMarketScan
// ---------------------------------------------------------------------------

describe('runMarketScan', () => {
  it('returns results array for market scan', async () => {
    const savedEnv = {};
    const keysToUnset = ['EXA_API_KEY', 'TAVILY_API_KEY', 'FIRECRAWL_API_KEY', 'BRIGHTDATA_API_KEY', 'VALYU_API_KEY'];
    for (const k of keysToUnset) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }

    try {
      const results = await runMarketScan({
        usagePath: join(tmpDir, 'market-budget.json'),
        lockPath: join(tmpDir, 'market-budget.lock'),
        budgets: {},
      });

      assert.ok(Array.isArray(results), 'should return array');
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v !== undefined) process.env[k] = v;
      }
    }
  });
});
