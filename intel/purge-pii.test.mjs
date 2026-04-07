import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findPIITags, isOlderThan, redactPII } from './purge-pii.mjs';

describe('findPIITags', () => {
  it('finds PII tags in markdown', () => {
    const md = `
Some content here.
<!-- PII: John Doe, LinkedIn scrape, 2026-01-15 -->
John's email: john@example.com
Phone: 555-1234
<!-- END PII -->
More content.
<!-- PII: Jane Smith, Company research, 2026-02-20 -->
Jane's details here.
<!-- END PII -->
`;
    const tags = findPIITags(md);
    assert.equal(tags.length, 2);
    assert.deepEqual(tags[0], { name: 'John Doe', source: 'LinkedIn scrape', date: '2026-01-15' });
    assert.deepEqual(tags[1], { name: 'Jane Smith', source: 'Company research', date: '2026-02-20' });
  });

  it('returns empty array for no tags', () => {
    assert.deepEqual(findPIITags('No PII here'), []);
    assert.deepEqual(findPIITags(''), []);
    assert.deepEqual(findPIITags(null), []);
  });
});

describe('isOlderThan', () => {
  it('returns true for dates older than retention days', () => {
    const now = new Date('2026-04-06');
    assert.equal(isOlderThan('2026-01-01', 30, now), true);
    assert.equal(isOlderThan('2025-12-01', 90, now), true);
  });

  it('returns false for recent dates', () => {
    const now = new Date('2026-04-06');
    assert.equal(isOlderThan('2026-04-01', 30, now), false);
    assert.equal(isOlderThan('2026-03-30', 30, now), false);
  });
});

describe('redactPII', () => {
  it('removes content between PII tags for target date', () => {
    const md = `
Before content.
<!-- PII: John Doe, LinkedIn, 2026-01-15 -->
Sensitive info about John.
Email: john@example.com
<!-- END PII -->
Middle content.
<!-- PII: Jane Smith, Research, 2026-02-20 -->
Sensitive info about Jane.
<!-- END PII -->
After content.
`;
    const result = redactPII(md, '2026-01-15');

    // John's block should be redacted
    assert.ok(result.includes('<!-- PII REDACTED: 2026-01-15 -->'));
    assert.ok(!result.includes('john@example.com'));

    // Jane's block should remain
    assert.ok(result.includes('Sensitive info about Jane.'));
    assert.ok(result.includes('<!-- PII: Jane Smith, Research, 2026-02-20 -->'));
  });

  it('handles no matching date', () => {
    const md = `<!-- PII: John, Source, 2026-03-01 -->\nData\n<!-- END PII -->`;
    const result = redactPII(md, '2026-01-01');
    assert.ok(result.includes('Data'));
  });

  it('handles null/empty input', () => {
    assert.equal(redactPII(null, '2026-01-01'), null);
    assert.equal(redactPII('', '2026-01-01'), '');
  });
});
