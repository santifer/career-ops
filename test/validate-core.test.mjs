/**
 * Unit tests for lib/validate-core.mjs — verify-pipeline's health-check rules.
 * Run with: npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isCanonicalStatus, isValidScore } from '../lib/validate-core.mjs';

test('isCanonicalStatus: accepts canonical statuses (any case)', () => {
  for (const s of ['Evaluada', 'aplicado', 'OFERTA', 'NO APLICAR']) {
    assert.equal(isCanonicalStatus(s), true);
  }
});

test('isCanonicalStatus: accepts known aliases', () => {
  assert.equal(isCanonicalStatus('applied'), true);
  assert.equal(isCanonicalStatus('cancelada'), true);
  assert.equal(isCanonicalStatus('monitor'), true);
});

test('isCanonicalStatus: ignores bold and trailing date', () => {
  assert.equal(isCanonicalStatus('**Aplicado**'), true);
  assert.equal(isCanonicalStatus('Rechazado 2025-03-01'), true);
});

test('isCanonicalStatus: rejects unknown status', () => {
  assert.equal(isCanonicalStatus('Banana'), false);
  assert.equal(isCanonicalStatus(''), false);
});

test('isValidScore: accepts N.N/5 and sentinels', () => {
  assert.equal(isValidScore('4.25/5'), true);
  assert.equal(isValidScore('3/5'), true);
  assert.equal(isValidScore('**4.0/5**'), true);
  assert.equal(isValidScore('N/A'), true);
  assert.equal(isValidScore('DUP'), true);
});

test('isValidScore: rejects malformed scores', () => {
  assert.equal(isValidScore('4.25'), false);   // missing /5
  assert.equal(isValidScore('5/10'), false);
  assert.equal(isValidScore('great'), false);
});
