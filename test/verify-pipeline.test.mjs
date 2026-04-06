/**
 * test/verify-pipeline.test.mjs — Unit tests for verify-pipeline.mjs exported functions
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isValidStatus, hasMarkdownBold, hasDateInStatus, isValidScoreFormat, findDuplicates, parseTrackerEntries } from '../verify-pipeline.mjs';

// ---------------------------------------------------------------------------
// isValidStatus
// ---------------------------------------------------------------------------
describe('isValidStatus', () => {
  test('accepts all canonical statuses (lowercase)', () => {
    const canonical = ['evaluada', 'aplicado', 'respondido', 'entrevista', 'oferta', 'rechazado', 'descartado', 'no aplicar'];
    for (const s of canonical) {
      assert.ok(isValidStatus(s), `Expected "${s}" to be valid`);
    }
  });

  test('accepts canonical statuses with proper casing', () => {
    assert.ok(isValidStatus('Evaluada'));
    assert.ok(isValidStatus('NO APLICAR'));
    assert.ok(isValidStatus('Descartado'));
  });

  test('accepts known aliases', () => {
    assert.ok(isValidStatus('enviada'));
    assert.ok(isValidStatus('aplicada'));
    assert.ok(isValidStatus('applied'));
    assert.ok(isValidStatus('sent'));
    assert.ok(isValidStatus('cerrada'));
    assert.ok(isValidStatus('descartada'));
    assert.ok(isValidStatus('cancelada'));
    assert.ok(isValidStatus('rechazada'));
    assert.ok(isValidStatus('no_aplicar'));
    assert.ok(isValidStatus('skip'));
    assert.ok(isValidStatus('monitor'));
  });

  test('strips markdown bold before checking', () => {
    assert.ok(isValidStatus('**Evaluada**'));
    assert.ok(isValidStatus('**Applied**'));
  });

  test('strips trailing dates before checking', () => {
    assert.ok(isValidStatus('Aplicado 2026-01-15'));
    assert.ok(isValidStatus('Rechazado 2026-03-10 extra'));
  });

  test('rejects unknown statuses', () => {
    assert.ok(!isValidStatus('pending'));
    assert.ok(!isValidStatus('unknown'));
    assert.ok(!isValidStatus('in-progress'));
    assert.ok(!isValidStatus(''));
  });
});

// ---------------------------------------------------------------------------
// hasMarkdownBold
// ---------------------------------------------------------------------------
describe('hasMarkdownBold', () => {
  test('returns true when string contains **', () => {
    assert.ok(hasMarkdownBold('**Evaluated**'));
    assert.ok(hasMarkdownBold('4.5/5 **bold**'));
    assert.ok(hasMarkdownBold('**'));
  });

  test('returns false when no ** present', () => {
    assert.ok(!hasMarkdownBold('Evaluated'));
    assert.ok(!hasMarkdownBold('4.5/5'));
    assert.ok(!hasMarkdownBold(''));
  });
});

// ---------------------------------------------------------------------------
// hasDateInStatus
// ---------------------------------------------------------------------------
describe('hasDateInStatus', () => {
  test('detects YYYY-MM-DD date pattern', () => {
    assert.ok(hasDateInStatus('Aplicado 2026-01-15'));
    assert.ok(hasDateInStatus('Rechazado 2026-03-10'));
    assert.ok(hasDateInStatus('2026-02-28'));
  });

  test('returns false for status without date', () => {
    assert.ok(!hasDateInStatus('Evaluada'));
    assert.ok(!hasDateInStatus('NO APLICAR'));
    assert.ok(!hasDateInStatus('Applied'));
  });
});

// ---------------------------------------------------------------------------
// isValidScoreFormat
// ---------------------------------------------------------------------------
describe('isValidScoreFormat', () => {
  test('accepts X/5 and X.X/5 formats', () => {
    assert.ok(isValidScoreFormat('4.2/5'));
    assert.ok(isValidScoreFormat('3.8/5'));
    assert.ok(isValidScoreFormat('5/5'));
    assert.ok(isValidScoreFormat('1.0/5'));
    assert.ok(isValidScoreFormat('4.55/5'));
  });

  test('accepts special values N/A and DUP', () => {
    assert.ok(isValidScoreFormat('N/A'));
    assert.ok(isValidScoreFormat('DUP'));
  });

  test('strips markdown bold before checking', () => {
    assert.ok(isValidScoreFormat('**4.2/5**'));
  });

  test('rejects bare numbers without /5', () => {
    assert.ok(!isValidScoreFormat('4.2'));
    assert.ok(!isValidScoreFormat('3'));
    assert.ok(!isValidScoreFormat(''));
  });

  test('rejects out-of-range-looking formats', () => {
    // Format validation only — doesn't enforce 1-5 range
    assert.ok(isValidScoreFormat('10/5')); // syntactically valid
    assert.ok(!isValidScoreFormat('4.2/10'));
  });
});

// ---------------------------------------------------------------------------
// findDuplicates
// ---------------------------------------------------------------------------
describe('findDuplicates', () => {
  const base = [
    { num: 1, company: 'Anthropic', role: 'Senior AI Engineer', score: '4.5/5', status: 'Evaluated' },
    { num: 2, company: 'OpenAI', role: 'Technical PM', score: '3.8/5', status: 'Applied' },
    { num: 3, company: 'Cohere', role: 'ML Platform Engineer', score: '4.2/5', status: 'Interview' },
  ];

  test('returns empty array when no duplicates', () => {
    const result = findDuplicates(base);
    assert.equal(result.length, 0);
  });

  test('detects exact company+role duplicate', () => {
    const entries = [...base, { num: 4, company: 'Anthropic', role: 'Senior AI Engineer', score: '4.0/5', status: 'Evaluated' }];
    const result = findDuplicates(entries);
    assert.equal(result.length, 1);
    assert.equal(result[0].length, 2);
    assert.equal(result[0][0].company, 'Anthropic');
  });

  test('is case-insensitive for company matching', () => {
    const entries = [...base, { num: 4, company: 'ANTHROPIC', role: 'Senior AI Engineer', score: '4.0/5', status: 'Evaluated' }];
    const result = findDuplicates(entries);
    assert.equal(result.length, 1);
  });

  test('detects multiple duplicate groups', () => {
    const entries = [
      ...base,
      { num: 4, company: 'Anthropic', role: 'Senior AI Engineer', score: '4.0/5', status: 'Evaluated' },
      { num: 5, company: 'OpenAI', role: 'Technical PM', score: '3.5/5', status: 'Discarded' },
    ];
    const result = findDuplicates(entries);
    assert.equal(result.length, 2);
  });

  test('key uses normalized company (strips punctuation)', () => {
    // findDuplicates uses exact normalized key — "Ada Inc." → "adainc" ≠ "ada"
    // so these are NOT detected as duplicates (merge-tracker uses fuzzy for that)
    const entries = [
      { num: 1, company: 'Ada Inc.', role: 'AI Product Manager', score: '4.0/5', status: 'Evaluated' },
      { num: 2, company: 'Ada Corp', role: 'AI Product Manager', score: '3.8/5', status: 'Evaluated' },
    ];
    const result = findDuplicates(entries);
    assert.equal(result.length, 0); // Different normalized names → not a duplicate
  });

  test('detects duplicate when company names normalize identically', () => {
    const entries = [
      { num: 1, company: 'OpenAI', role: 'Senior ML Engineer', score: '4.0/5', status: 'Evaluated' },
      { num: 2, company: 'openai', role: 'Senior ML Engineer', score: '3.8/5', status: 'Evaluated' },
    ];
    const result = findDuplicates(entries);
    assert.equal(result.length, 1);
  });
});

// ---------------------------------------------------------------------------
// parseTrackerEntries
// ---------------------------------------------------------------------------
describe('parseTrackerEntries', () => {
  const sampleContent = `# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-01-10 | Anthropic | Senior AI Engineer | 4.5/5 | Evaluated | ✅ | [1](reports/001-anthropic-2026-01-10.md) | Strong match |
| 2 | 2026-01-12 | OpenAI | Technical PM | 3.8/5 | Applied | ✅ | [2](reports/002-openai-2026-01-12.md) | Good fit |
`;

  test('parses all data rows', () => {
    const entries = parseTrackerEntries(sampleContent);
    assert.equal(entries.length, 2);
  });

  test('correctly maps columns', () => {
    const entries = parseTrackerEntries(sampleContent);
    assert.equal(entries[0].num, 1);
    assert.equal(entries[0].company, 'Anthropic');
    assert.equal(entries[0].role, 'Senior AI Engineer');
    assert.equal(entries[0].score, '4.5/5');
    assert.equal(entries[0].status, 'Evaluated');
  });

  test('skips header and separator rows', () => {
    const entries = parseTrackerEntries(sampleContent);
    // Header row has '#' as num which is NaN, separator has '---'
    assert.ok(entries.every(e => !isNaN(e.num)));
  });

  test('returns empty array for empty content', () => {
    const entries = parseTrackerEntries('');
    assert.equal(entries.length, 0);
  });

  test('returns empty array for content with no pipe rows', () => {
    const entries = parseTrackerEntries('# Just a heading\nSome text\n');
    assert.equal(entries.length, 0);
  });
});
