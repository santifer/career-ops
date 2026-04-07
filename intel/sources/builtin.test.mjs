import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execute, estimateCost, isAvailable } from './builtin.mjs';

// ─── isAvailable ────────────────────────────────────────────────────────────

describe('isAvailable', () => {
  it('always returns true', () => {
    assert.equal(isAvailable(), true);
  });
});

// ─── estimateCost ───────────────────────────────────────────────────────────

describe('estimateCost', () => {
  it('always returns $0 regardless of type', () => {
    assert.equal(estimateCost('search'), 0);
    assert.equal(estimateCost('deepsearch'), 0);
    assert.equal(estimateCost('scrape'), 0);
    assert.equal(estimateCost('anything'), 0);
  });
});

// ─── execute ────────────────────────────────────────────────────────────────

describe('execute', () => {
  it('returns a single result with source=builtin', async () => {
    const results = await execute({ query: 'AI jobs', type: 'search' });
    assert.equal(results.length, 1);
    assert.equal(results[0].source, 'builtin');
  });

  it('formats title as [builtin] {type}: {query}', async () => {
    const results = await execute({ query: 'Stripe company intel', type: 'search' });
    assert.equal(results[0].title, '[builtin] search: Stripe company intel');
  });

  it('formats snippet with the query', async () => {
    const results = await execute({ query: 'Stripe company intel', type: 'search' });
    assert.ok(results[0].snippet.includes('Stripe company intel'));
  });

  it('uses WebSearch as suggestedTool for non-scrape types', async () => {
    const results = await execute({ query: 'AI trends', type: 'search' });
    assert.equal(results[0].metadata.suggestedTool, 'WebSearch');
    assert.equal(results[0].metadata.requiresManualExecution, true);
  });

  it('uses WebFetch as suggestedTool for scrape type', async () => {
    const results = await execute({ query: 'https://example.com', type: 'scrape' });
    assert.equal(results[0].metadata.suggestedTool, 'WebFetch');
  });

  it('has empty url', async () => {
    const results = await execute({ query: 'test', type: 'search' });
    assert.equal(results[0].url, '');
  });

  it('defaults type to "search" when not provided', async () => {
    const results = await execute({ query: 'AI trends' });
    assert.equal(results[0].title, '[builtin] search: AI trends');
  });
});
