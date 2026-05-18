/**
 * tests/unit/toxicity-composite.test.mjs — Unit tests for lib/toxicity-composite.mjs
 *
 * Per Inventory Document B item #4 (2026-05-18): the composite toxicity score
 * MUST never auto-trash and MUST surface drivers + sources so Mitchell can
 * make tradeoff decisions. These tests lock that contract.
 *
 * Run: node --test tests/unit/toxicity-composite.test.mjs
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { computeToxicityComposite } from '../../lib/toxicity-composite.mjs';

test('computeToxicityComposite returns valid shape for unknown slug', () => {
  const r = computeToxicityComposite('this-company-does-not-exist-zzz');
  assert.equal(r.slug, 'this-company-does-not-exist-zzz');
  assert.equal(typeof r.score, 'number');
  assert.ok(Array.isArray(r.drivers));
  assert.ok(Array.isArray(r.overrides));
  assert.ok(['low', 'med', 'high'].includes(r.confidence));
  assert.equal(r.auto_trash, false);
  assert.ok(r.schema_note.includes('NEVER auto-trash'));
});

test('computeToxicityComposite score is capped at 10', () => {
  const r = computeToxicityComposite('openai'); // known to have many drivers
  assert.ok(r.score >= 0);
  assert.ok(r.score <= 10, `score ${r.score} exceeds 10`);
});

test('computeToxicityComposite NEVER returns auto_trash:true', () => {
  // Cycle through every cached slug
  const slugs = ['anthropic', 'openai', 'mistral-ai', 'cohere', 'cursor-anysphere',
                 'pinecone', 'sierra', 'elevenlabs', 'cognition', 'perplexity',
                 'nonexistent-slug', ''];
  for (const slug of slugs) {
    const r = computeToxicityComposite(slug);
    assert.equal(r.auto_trash, false,
      `auto_trash MUST be false for slug "${slug}" — got ${r.auto_trash}`);
  }
});

test('computeToxicityComposite drivers each carry kind, weight, evidence, source', () => {
  const r = computeToxicityComposite('anthropic');
  for (const d of r.drivers) {
    assert.ok(d.kind, 'driver missing kind');
    assert.equal(typeof d.weight, 'number');
    assert.ok(d.weight > 0);
    assert.ok(typeof d.evidence === 'string' && d.evidence.length > 0,
      'driver missing evidence string');
    assert.ok(typeof d.source === 'string' && d.source.length > 0,
      'driver missing source string');
  }
});

test('computeToxicityComposite confidence reflects driver count', () => {
  const r = computeToxicityComposite('openai');
  if (r.drivers.length >= 3) assert.equal(r.confidence, 'high');
  else if (r.drivers.length === 2) assert.equal(r.confidence, 'med');
  else assert.equal(r.confidence, 'low');
});

test('computeToxicityComposite handles empty slug gracefully', () => {
  const r = computeToxicityComposite('');
  assert.equal(r.slug, '');
  assert.equal(r.score, 0);
  assert.equal(r.drivers.length, 0);
  assert.equal(r.auto_trash, false);
});

test('computeToxicityComposite slug normalizes', () => {
  const r1 = computeToxicityComposite('Anthropic');
  const r2 = computeToxicityComposite('anthropic');
  assert.equal(r1.slug, r2.slug);
  assert.equal(r1.score, r2.score);
});

test('computeToxicityComposite sources_scanned reports inventory honestly', () => {
  const r = computeToxicityComposite('anthropic');
  assert.ok(Array.isArray(r.sources_scanned));
  // anthropic has intel-cache + hm-intel + applications.md, so all three
  assert.ok(r.sources_scanned.includes('intel-cache'));
});

test('computeToxicityComposite weight cap: score never exceeds sum of weights', () => {
  const r = computeToxicityComposite('openai');
  const sumWeights = r.drivers.reduce((a, d) => a + d.weight, 0);
  // Score is capped at 10, so it's either the sum or 10, whichever is smaller
  assert.equal(r.score, Math.min(sumWeights, 10));
});
