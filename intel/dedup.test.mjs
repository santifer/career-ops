import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCompany, normalizeTitle, isDuplicate, dedup } from './dedup.mjs';

describe('normalizeCompany', () => {
  it('lowercases and strips suffixes', () => {
    assert.equal(normalizeCompany('Stripe, Inc.'), 'stripe');
    assert.equal(normalizeCompany('Anthropic Ltd'), 'anthropic');
    assert.equal(normalizeCompany('DeepL GmbH'), 'deepl');
  });

  it('collapses whitespace', () => {
    assert.equal(normalizeCompany('  Open   AI  '), 'openai');
  });

  it('handles edge cases', () => {
    assert.equal(normalizeCompany(''), '');
    assert.equal(normalizeCompany('A'), 'a');
  });
});

describe('normalizeTitle', () => {
  it('strips seniority prefixes', () => {
    assert.equal(normalizeTitle('Senior ML Engineer'), 'ml engineer');
    assert.equal(normalizeTitle('Staff Software Engineer'), 'software engineer');
    assert.equal(normalizeTitle('Principal AI Researcher'), 'ai researcher');
    assert.equal(normalizeTitle('Lead Data Scientist'), 'data scientist');
  });

  it('strips location suffixes', () => {
    assert.equal(normalizeTitle('ML Engineer (Remote)'), 'ml engineer');
    assert.equal(normalizeTitle('AI Engineer - San Francisco'), 'ai engineer');
    assert.equal(normalizeTitle('Engineer, NYC'), 'engineer');
  });

  it('lowercases', () => {
    assert.equal(normalizeTitle('VP of Engineering'), 'vp of engineering');
  });
});

describe('isDuplicate', () => {
  it('detects exact URL match', () => {
    const prospect = { url: 'https://stripe.com/jobs/123', company: 'Stripe', title: 'ML Engineer' };
    const existing = [{ url: 'https://stripe.com/jobs/123', company: 'Stripe Inc', title: 'Senior ML Engineer' }];
    assert.equal(isDuplicate(prospect, existing), true);
  });

  it('detects normalized company+title match', () => {
    const prospect = { url: 'https://a.com/1', company: 'Stripe Inc', title: 'Staff ML Engineer' };
    const existing = [{ url: 'https://b.com/2', company: 'Stripe, Inc.', title: 'Senior ML Engineer' }];
    assert.equal(isDuplicate(prospect, existing), true);
  });

  it('allows different roles at same company', () => {
    const prospect = { url: 'https://a.com/1', company: 'Stripe', title: 'Backend Engineer' };
    const existing = [{ url: 'https://b.com/2', company: 'Stripe', title: 'ML Engineer' }];
    assert.equal(isDuplicate(prospect, existing), false);
  });

  it('allows same role at different company', () => {
    const prospect = { url: 'https://a.com/1', company: 'Stripe', title: 'ML Engineer' };
    const existing = [{ url: 'https://b.com/2', company: 'Anthropic', title: 'ML Engineer' }];
    assert.equal(isDuplicate(prospect, existing), false);
  });
});

describe('dedup', () => {
  it('removes duplicates from a list', () => {
    const items = [
      { url: 'https://a.com/1', company: 'Stripe', title: 'ML Engineer', source: 'linkedin' },
      { url: 'https://b.com/2', company: 'Stripe Inc', title: 'Senior ML Engineer', source: 'indeed' },
    ];
    const result = dedup(items);
    assert.equal(result.length, 1);
    assert.equal(result[0].source, 'linkedin');
  });

  it('keeps first occurrence', () => {
    const items = [
      { url: 'https://a.com/1', company: 'Anthropic', title: 'AI Engineer', source: 'first' },
      { url: 'https://b.com/2', company: 'Anthropic Ltd', title: 'Staff AI Engineer', source: 'second' },
    ];
    const result = dedup(items);
    assert.equal(result.length, 1);
    assert.equal(result[0].source, 'first');
  });

  it('deduplicates against existing entries', () => {
    const items = [
      { url: 'https://a.com/1', company: 'Stripe', title: 'ML Engineer', source: 'new' },
      { url: 'https://c.com/3', company: 'Anthropic', title: 'AI Engineer', source: 'new' },
    ];
    const existing = [
      { url: 'https://b.com/2', company: 'Stripe, Inc.', title: 'Senior ML Engineer' },
    ];
    const result = dedup(items, existing);
    assert.equal(result.length, 1);
    assert.equal(result[0].company, 'Anthropic');
  });

  it('handles empty inputs', () => {
    assert.deepEqual(dedup([]), []);
    assert.deepEqual(dedup([], []), []);
  });
});
