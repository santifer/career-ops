/**
 * Unit tests for lib/tracker-core.mjs — the pure logic shared by the tracker scripts.
 * Run with: npm test   (uses Node's built-in test runner, no dependencies)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CANONICAL_STATUSES,
  STATUS_RANK,
  statusRank,
  normalizeStatus,
  normalizeCompany,
  normalizeRole,
  roleMatch,
  parseScore,
  parseAppLine,
} from '../lib/tracker-core.mjs';

test('normalizeStatus: canonical statuses pass through unchanged', () => {
  for (const c of CANONICAL_STATUSES) {
    assert.deepEqual(normalizeStatus(c), { status: c });
  }
});

test('normalizeStatus: strips markdown bold and fixes casing', () => {
  assert.deepEqual(normalizeStatus('**aplicado**'), { status: 'Aplicado' });
  assert.deepEqual(normalizeStatus('OFERTA'), { status: 'Oferta' });
});

test('normalizeStatus: DUPLICADO/repost moves original to notes', () => {
  const dup = normalizeStatus('DUPLICADO de #12');
  assert.equal(dup.status, 'Descartado');
  assert.equal(dup.moveToNotes, 'DUPLICADO de #12');

  const rep = normalizeStatus('Repost #45');
  assert.equal(rep.status, 'Descartado');
  assert.equal(rep.moveToNotes, 'Repost #45');
});

test('normalizeStatus: strips trailing dates', () => {
  assert.deepEqual(normalizeStatus('Rechazado 2025-03-01'), { status: 'Rechazado' });
  assert.deepEqual(normalizeStatus('Aplicado 2024'), { status: 'Aplicado' });
});

test('normalizeStatus: feminine and alias variants map to canonical', () => {
  assert.deepEqual(normalizeStatus('Rechazada'), { status: 'Rechazado' });
  assert.deepEqual(normalizeStatus('Descartada'), { status: 'Descartado' });
  assert.deepEqual(normalizeStatus('Cancelada 2025'), { status: 'Descartado' });
  assert.deepEqual(normalizeStatus('enviada'), { status: 'Aplicado' });
  assert.deepEqual(normalizeStatus('applied'), { status: 'Aplicado' });
  assert.deepEqual(normalizeStatus('skip'), { status: 'NO APLICAR' });
});

test('normalizeStatus: holding states collapse to Evaluada', () => {
  for (const s of ['CONDICIONAL', 'HOLD', 'MONITOR', 'EVALUAR', 'Verificar']) {
    assert.deepEqual(normalizeStatus(s), { status: 'Evaluada' });
  }
});

test('normalizeStatus: geo blocker maps to NO APLICAR', () => {
  assert.deepEqual(normalizeStatus('GEO BLOCKER'), { status: 'NO APLICAR' });
  assert.deepEqual(normalizeStatus('geo-blocker'), { status: 'NO APLICAR' });
});

test('normalizeStatus: empty / dash means Descartado', () => {
  assert.deepEqual(normalizeStatus('—'), { status: 'Descartado' });
  assert.deepEqual(normalizeStatus('-'), { status: 'Descartado' });
  assert.deepEqual(normalizeStatus(''), { status: 'Descartado' });
});

test('normalizeStatus: unrecognized status is flagged unknown', () => {
  assert.deepEqual(normalizeStatus('Banana'), { status: null, unknown: true });
});

test('statusRank: known ranks and ordering', () => {
  assert.equal(statusRank('Oferta'), 6);
  assert.equal(statusRank('aplicado'), 3);
  // Active application outranks terminal rejection.
  assert.ok(statusRank('Aplicado') > statusRank('Rechazado'));
  // Case-insensitive.
  assert.equal(statusRank('ENTREVISTA'), STATUS_RANK['entrevista']);
});

test('statusRank: unknown and nullish return -1', () => {
  assert.equal(statusRank('Banana'), -1);
  assert.equal(statusRank(null), -1);
  assert.equal(statusRank(undefined), -1);
});

test('normalizeCompany: lowercases and strips punctuation', () => {
  assert.equal(normalizeCompany('Acme, Inc. (Remote)'), 'acme inc remote');
  assert.equal(normalizeCompany('  Foo   Bar  '), 'foo bar');
});

test('normalizeRole: keeps slashes, drops other punctuation', () => {
  assert.equal(normalizeRole('Senior Frontend/Backend Engineer!'), 'senior frontend/backend engineer');
});

test('roleMatch: matches on >= 2 significant shared words', () => {
  assert.equal(roleMatch('Senior Software Engineer', 'Software Engineer II'), true);
  assert.equal(roleMatch('Backend Engineer', 'Frontend Engineer'), false);
  assert.equal(roleMatch('Product Manager', 'Engineering Manager'), false);
});

test('parseScore: extracts numeric value, handles bold and N/A', () => {
  assert.equal(parseScore('4.25/5'), 4.25);
  assert.equal(parseScore('**3.8**'), 3.8);
  assert.equal(parseScore('N/A'), 0);
  assert.equal(parseScore('DUP'), 0);
});

test('parseAppLine: parses a valid pipe-delimited row', () => {
  const row = '| 7 | 2025-01-02 | Acme | Senior Engineer | 4.25/5 | Aplicado | cv.pdf | report-7.md | great |';
  const app = parseAppLine(row);
  assert.equal(app.num, 7);
  assert.equal(app.company, 'Acme');
  assert.equal(app.role, 'Senior Engineer');
  assert.equal(app.status, 'Aplicado');
  assert.equal(app.notes, 'great');
});

test('parseAppLine: rejects header, separator, and short rows', () => {
  assert.equal(parseAppLine('| # | fecha | empresa | rol | score | status | pdf | report | notas |'), null);
  assert.equal(parseAppLine('| --- | --- | --- |'), null);
  assert.equal(parseAppLine('not a table row'), null);
});

test('parseAppLine: missing notes column defaults to empty string', () => {
  const row = '| 3 | 2025-01-01 | Foo | Dev | 3/5 | Evaluada | x.pdf | r.md |';
  const app = parseAppLine(row);
  assert.equal(app.num, 3);
  assert.equal(app.notes, '');
});
