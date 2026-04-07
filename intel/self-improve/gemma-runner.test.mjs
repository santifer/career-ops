import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOllamaUrl,
  buildRequestBody,
  parseOllamaResponse,
  isOllamaAvailable,
} from './gemma-runner.mjs';

describe('buildOllamaUrl', () => {
  it('builds full URL from host and endpoint', () => {
    const url = buildOllamaUrl('http://100.76.84.16:11434', '/api/generate');
    assert.equal(url, 'http://100.76.84.16:11434/api/generate');
  });

  it('uses default host when undefined', () => {
    const url = buildOllamaUrl(undefined, '/api/generate');
    // Should end with the endpoint regardless of which default is used
    assert.ok(url.endsWith('/api/generate'));
    // Should start with http
    assert.ok(url.startsWith('http'));
  });
});

describe('buildRequestBody', () => {
  it('builds body with model and prompt', () => {
    const body = buildRequestBody('gemma4-opus-distill:q8_0', 'Hello');
    assert.equal(body.model, 'gemma4-opus-distill:q8_0');
    assert.equal(body.prompt, 'Hello');
    assert.equal(body.stream, false);
    assert.deepStrictEqual(body.options, {});
  });

  it('includes system prompt when provided', () => {
    const body = buildRequestBody('gemma4', 'Hi', { system: 'You are helpful' });
    assert.equal(body.system, 'You are helpful');
  });

  it('includes temperature in options when provided', () => {
    const body = buildRequestBody('gemma4', 'Hi', { temperature: 0.7 });
    assert.equal(body.options.temperature, 0.7);
  });
});

describe('parseOllamaResponse', () => {
  it('extracts response text from valid JSON', () => {
    const result = parseOllamaResponse({ response: 'Hello', done: true });
    assert.equal(result, 'Hello');
  });

  it('returns empty string for null input', () => {
    const result = parseOllamaResponse(null);
    assert.equal(result, '');
  });
});

describe('isOllamaAvailable', () => {
  it('returns false for unreachable host', async () => {
    const available = await isOllamaAvailable('http://127.0.0.1:99999');
    assert.equal(available, false);
  });
});
