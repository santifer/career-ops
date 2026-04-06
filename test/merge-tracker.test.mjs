/**
 * test/merge-tracker.test.mjs — Unit tests for merge-tracker.mjs exported functions
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateStatus, normalizeCompany, roleFuzzyMatch, extractReportNum, parseScore, parseTsvContent } from '../merge-tracker.mjs';

// ---------------------------------------------------------------------------
// validateStatus
// ---------------------------------------------------------------------------
describe('validateStatus', () => {
  test('canonical statuses pass through unchanged', () => {
    assert.equal(validateStatus('Evaluada'), 'Evaluada');
    assert.equal(validateStatus('Aplicado'), 'Aplicado');
    assert.equal(validateStatus('Respondido'), 'Respondido');
    assert.equal(validateStatus('Entrevista'), 'Entrevista');
    assert.equal(validateStatus('Oferta'), 'Oferta');
    assert.equal(validateStatus('Rechazado'), 'Rechazado');
    assert.equal(validateStatus('Descartado'), 'Descartado');
    assert.equal(validateStatus('NO APLICAR'), 'NO APLICAR');
  });

  test('canonical statuses are case-insensitive', () => {
    assert.equal(validateStatus('evaluada'), 'Evaluada');
    assert.equal(validateStatus('APLICADO'), 'Aplicado');
    assert.equal(validateStatus('no aplicar'), 'NO APLICAR');
  });

  test('strips markdown bold before matching', () => {
    assert.equal(validateStatus('**Evaluada**'), 'Evaluada');
    assert.equal(validateStatus('**Rechazado**'), 'Rechazado');
  });

  test('strips trailing dates before matching', () => {
    assert.equal(validateStatus('Aplicado 2026-01-15'), 'Aplicado');
    assert.equal(validateStatus('Rechazado 2026-03-10 notes'), 'Rechazado');
  });

  test('known aliases map to canonical', () => {
    assert.equal(validateStatus('enviada'), 'Aplicado');
    assert.equal(validateStatus('aplicada'), 'Aplicado');
    assert.equal(validateStatus('applied'), 'Aplicado');
    assert.equal(validateStatus('sent'), 'Aplicado');
    assert.equal(validateStatus('cerrada'), 'Descartado');
    assert.equal(validateStatus('descartada'), 'Descartado');
    assert.equal(validateStatus('cancelada'), 'Descartado');
    assert.equal(validateStatus('rechazada'), 'Rechazado');
    assert.equal(validateStatus('no aplicar'), 'NO APLICAR');
    assert.equal(validateStatus('no_aplicar'), 'NO APLICAR');
    assert.equal(validateStatus('skip'), 'NO APLICAR');
    assert.equal(validateStatus('monitor'), 'NO APLICAR');
  });

  test('DUPLICADO variants map to Descartado', () => {
    assert.equal(validateStatus('duplicado'), 'Descartado');
    assert.equal(validateStatus('DUPLICADO #123'), 'Descartado');
    assert.equal(validateStatus('dup'), 'Descartado');
    assert.equal(validateStatus('repost'), 'Descartado');
  });

  test('unknown status defaults to Evaluada', () => {
    assert.equal(validateStatus('something-unknown'), 'Evaluada');
    assert.equal(validateStatus('pending'), 'Evaluada');
  });
});

// ---------------------------------------------------------------------------
// normalizeCompany
// ---------------------------------------------------------------------------
describe('normalizeCompany', () => {
  test('lowercases and strips non-alphanumeric', () => {
    assert.equal(normalizeCompany('OpenAI'), 'openai');
    assert.equal(normalizeCompany('ElevenLabs'), 'elevenlabs');
    assert.equal(normalizeCompany('Arize AI'), 'arizeai');
    assert.equal(normalizeCompany('Ada (Toronto)'), 'adatoronto');
    assert.equal(normalizeCompany('n8n'), 'n8n');
  });

  test('handles punctuation and special chars', () => {
    assert.equal(normalizeCompany('Company, Inc.'), 'companyinc');
    assert.equal(normalizeCompany('A.I. Corp'), 'aicorp');
  });
});

// ---------------------------------------------------------------------------
// roleFuzzyMatch
// ---------------------------------------------------------------------------
describe('roleFuzzyMatch', () => {
  test('exact match returns true', () => {
    assert.ok(roleFuzzyMatch('Senior AI Engineer', 'Senior AI Engineer'));
  });

  test('matches when 2+ significant words overlap', () => {
    // "Product" and "Manager" both len>3 and both in B → 2 overlaps → true
    assert.ok(roleFuzzyMatch('AI Product Manager', 'Technical AI Product Manager'));
    // "Platform" and "Engineer" both len>3 and both in B → 2 overlaps → true
    assert.ok(roleFuzzyMatch('LLMOps Platform Engineer', 'Senior AI Platform Engineer'));
  });

  test('no match when words differ substantially', () => {
    assert.ok(!roleFuzzyMatch('Frontend Developer', 'LLMOps Engineer'));
    assert.ok(!roleFuzzyMatch('Sales Representative', 'Staff AI Engineer'));
  });

  test('short words (<=3 chars) are ignored', () => {
    // "AI" is 2 chars — should be ignored; only long words count
    assert.ok(!roleFuzzyMatch('AI PM', 'AI SRE'));
  });

  test('partial word containment counts', () => {
    // "engineer" contains "engineer" and "platform" contains "platform"
    assert.ok(roleFuzzyMatch('Platform Engineer', 'Senior Platform Engineering Lead'));
  });
});

// ---------------------------------------------------------------------------
// extractReportNum
// ---------------------------------------------------------------------------
describe('extractReportNum', () => {
  test('extracts number from markdown link', () => {
    assert.equal(extractReportNum('[42](reports/042-company-2026-01-01.md)'), 42);
    assert.equal(extractReportNum('[1](reports/001-acme-2026-02-10.md)'), 1);
    assert.equal(extractReportNum('[123](reports/123-test-2026-03-15.md)'), 123);
  });

  test('returns null when no link present', () => {
    assert.equal(extractReportNum('N/A'), null);
    assert.equal(extractReportNum(''), null);
    assert.equal(extractReportNum('❌'), null);
  });
});

// ---------------------------------------------------------------------------
// parseScore
// ---------------------------------------------------------------------------
describe('parseScore', () => {
  test('parses decimal score from X/5 format', () => {
    assert.equal(parseScore('4.2/5'), 4.2);
    assert.equal(parseScore('3.8/5'), 3.8);
    assert.equal(parseScore('5/5'), 5);
    assert.equal(parseScore('1.0/5'), 1.0);
  });

  test('strips markdown bold before parsing', () => {
    assert.equal(parseScore('**4.5/5**'), 4.5);
    assert.equal(parseScore('**3.0**'), 3.0);
  });

  test('returns 0 for N/A or unparseable', () => {
    assert.equal(parseScore('N/A'), 0);
    assert.equal(parseScore('DUP'), 0);
    assert.equal(parseScore(''), 0);
  });
});

// ---------------------------------------------------------------------------
// parseTsvContent — 9-column format (status before score)
// ---------------------------------------------------------------------------
describe('parseTsvContent - 9-col status-before-score', () => {
  test('parses standard 9-column TSV correctly', () => {
    const content = '11\t2026-02-10\tGlean\tAI Solutions Architect\tEvaluada\t4.3/5\t✅\t[11](reports/011-glean-2026-02-10.md)\tStrong match';
    const result = parseTsvContent(content, '001-valid.tsv');
    assert.ok(result !== null);
    assert.equal(result.num, 11);
    assert.equal(result.company, 'Glean');
    assert.equal(result.role, 'AI Solutions Architect');
    assert.equal(result.status, 'Evaluada');
    assert.equal(result.score, '4.3/5');
    assert.equal(result.pdf, '✅');
    assert.equal(result.notes, 'Strong match');
  });

  test('parses TSV with score-before-status column order (auto-detect)', () => {
    const content = '12\t2026-02-12\tArize AI\tML Observability Engineer\t4.1/5\tEvaluada\t✅\t[12](reports/012-arize-2026-02-12.md)\tSwapped columns';
    const result = parseTsvContent(content, '002-swapped.tsv');
    assert.ok(result !== null);
    assert.equal(result.status, 'Evaluada');
    assert.equal(result.score, '4.1/5');
    assert.equal(result.company, 'Arize AI');
  });

  test('returns null for malformed TSV with fewer than 8 fields', () => {
    const content = '1\t2026-01-01\tCompany\tRole';
    const result = parseTsvContent(content, 'bad.tsv');
    assert.equal(result, null);
  });

  test('returns null for invalid entry number', () => {
    const content = 'abc\t2026-01-01\tCompany\tRole\tEvaluada\t3.0/5\t❌\t[0](reports/000.md)\tnotes';
    const result = parseTsvContent(content, 'bad-num.tsv');
    assert.equal(result, null);
  });

  test('returns null for empty content', () => {
    const result = parseTsvContent('', 'empty.tsv');
    assert.equal(result, null);
  });

  test('normalizes alias statuses in TSV', () => {
    const content = '13\t2026-02-15\tAcme\tSenior Engineer\taplicada\t3.5/5\t❌\t[13](reports/013-acme-2026-02-15.md)\tnotes';
    const result = parseTsvContent(content, 'alias.tsv');
    assert.equal(result.status, 'Aplicado');
  });
});

// ---------------------------------------------------------------------------
// parseTsvContent — pipe-delimited format
// ---------------------------------------------------------------------------
describe('parseTsvContent - pipe-delimited', () => {
  test('parses pipe-delimited markdown row', () => {
    const content = '| 15 | 2026-02-20 | Mistral | Staff Engineer | 3.9/5 | Evaluada | ❌ | [15](reports/015-mistral-2026-02-20.md) | Notes here |';
    const result = parseTsvContent(content, 'pipe.tsv');
    assert.ok(result !== null);
    assert.equal(result.num, 15);
    assert.equal(result.company, 'Mistral');
    assert.equal(result.score, '3.9/5');
    assert.equal(result.status, 'Evaluada');
  });

  test('returns null for pipe-delimited with fewer than 8 fields', () => {
    const content = '| 1 | 2026-01-01 | Company |';
    const result = parseTsvContent(content, 'bad-pipe.tsv');
    assert.equal(result, null);
  });
});
