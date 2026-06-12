/**
 * Unit tests for lib/merge-core.mjs — merge-tracker's TSV/row parsing logic.
 * Run with: npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CANONICAL_STATES,
  validateStatus,
  normalizeCompany,
  roleFuzzyMatch,
  extractReportNum,
  parseScore,
  parseAppLine,
  parseTsvContent,
} from '../lib/merge-core.mjs';

test('validateStatus: canonical pass-through and casing fix', () => {
  for (const c of CANONICAL_STATES) {
    assert.equal(validateStatus(c), c);
  }
  assert.equal(validateStatus('**aplicado**'), 'Aplicado');
});

test('validateStatus: strips trailing ISO date', () => {
  assert.equal(validateStatus('Aplicado 2025-03-01 (via referral)'), 'Aplicado');
});

test('validateStatus: aliases (note merge semantics: monitor -> NO APLICAR)', () => {
  assert.equal(validateStatus('applied'), 'Aplicado');
  assert.equal(validateStatus('cancelada'), 'Descartado');
  assert.equal(validateStatus('monitor'), 'NO APLICAR');
  assert.equal(validateStatus('hold'), 'Evaluada');
});

test('validateStatus: DUPLICADO / repost collapse to Descartado', () => {
  assert.equal(validateStatus('DUPLICADO de #3'), 'Descartado');
  assert.equal(validateStatus('Repost #9'), 'Descartado');
});

test('validateStatus: unknown defaults to Evaluada', () => {
  assert.equal(validateStatus('Banana'), 'Evaluada');
});

test('normalizeCompany: strips ALL non-alphanumerics including spaces', () => {
  assert.equal(normalizeCompany('Acme, Inc. (Remote)'), 'acmeincremote');
});

test('roleFuzzyMatch: >= 2 shared significant words', () => {
  assert.equal(roleFuzzyMatch('Senior Software Engineer', 'Software Engineer II'), true);
  assert.equal(roleFuzzyMatch('Backend Engineer', 'Frontend Designer'), false);
});

test('extractReportNum: pulls number from [NNN], else null', () => {
  assert.equal(extractReportNum('see report [42] here'), 42);
  assert.equal(extractReportNum('no number'), null);
});

test('parseScore: shared with tracker-core', () => {
  assert.equal(parseScore('4.25/5'), 4.25);
  assert.equal(parseScore('N/A'), 0);
});

test('parseAppLine: rejects entry number 0', () => {
  assert.equal(parseAppLine('| 0 | d | c | r | 3/5 | Evaluada | p | rep | n |'), null);
  const ok = parseAppLine('| 5 | d | Acme | Dev | 3/5 | Evaluada | p | rep | n |');
  assert.equal(ok.num, 5);
});

test('parseTsvContent: standard 9-col TSV (status, score)', () => {
  const tsv = '12\t2025-01-02\tAcme\tSenior Engineer\tAplicado\t4.25/5\tcv.pdf\treport-12.md\tnotes';
  const a = parseTsvContent(tsv, 'a.tsv');
  assert.equal(a.num, 12);
  assert.equal(a.company, 'Acme');
  assert.equal(a.status, 'Aplicado');
  assert.equal(a.score, '4.25/5');
});

test('parseTsvContent: swapped columns (score, status) are detected', () => {
  const tsv = '13\t2025-01-02\tFoo\tDev\t4.25/5\tAplicado\tcv.pdf\treport-13.md\tnotes';
  const a = parseTsvContent(tsv, 'b.tsv');
  assert.equal(a.status, 'Aplicado');
  assert.equal(a.score, '4.25/5');
});

test('parseTsvContent: pipe-delimited markdown row', () => {
  const row = '| 14 | 2025-01-02 | Bar | Dev | 3.8/5 | Oferta | cv.pdf | report-14.md | great |';
  const a = parseTsvContent(row, 'c.tsv');
  assert.equal(a.num, 14);
  assert.equal(a.status, 'Oferta');
  assert.equal(a.score, '3.8/5');
});

test('parseTsvContent: empty / too-few-fields / numberless return null', () => {
  assert.equal(parseTsvContent('', 'x.tsv'), null);
  assert.equal(parseTsvContent('1\t2\t3', 'x.tsv'), null);
  assert.equal(parseTsvContent('abc\td\tCo\tRole\tAplicado\t3/5\tp\trep\tn', 'x.tsv'), null);
});
