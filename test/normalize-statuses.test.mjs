/**
 * test/normalize-statuses.test.mjs — Unit tests for normalize-statuses.mjs exported functions
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStatus } from '../normalize-statuses.mjs';

// ---------------------------------------------------------------------------
// normalizeStatus
// ---------------------------------------------------------------------------
describe('normalizeStatus - already canonical', () => {
  test('returns canonical as-is (no change)', () => {
    const canonical = ['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP'];
    for (const s of canonical) {
      const result = normalizeStatus(s);
      assert.equal(result.status, s, `Expected "${s}" to remain unchanged`);
    }
  });

  test('case-insensitive match still returns proper casing', () => {
    assert.equal(normalizeStatus('evaluada').status, 'Evaluated');
    assert.equal(normalizeStatus('APLICADO').status, 'Applied');
    assert.equal(normalizeStatus('no aplicar').status, 'SKIP');
  });
});

describe('normalizeStatus - markdown bold stripping', () => {
  test('strips ** and returns canonical', () => {
    assert.equal(normalizeStatus('**Evaluada**').status, 'Evaluated');
    assert.equal(normalizeStatus('**Rechazado**').status, 'Rejected');
    assert.equal(normalizeStatus('**Applied**').status, 'Applied');
  });
});

describe('normalizeStatus - date stripping', () => {
  test('Applied with date → Applied', () => {
    assert.equal(normalizeStatus('Applied 2026-01-15').status, 'Applied');
  });

  test('Rechazado with date → Rejected', () => {
    assert.equal(normalizeStatus('Rechazado 2026-03-10').status, 'Rejected');
  });
});

describe('normalizeStatus - alias mapping', () => {
  test('enviada → Applied', () => {
    assert.equal(normalizeStatus('enviada').status, 'Applied');
  });

  test('aplicada → Applied', () => {
    assert.equal(normalizeStatus('aplicada').status, 'Applied');
  });

  test('applied → Applied', () => {
    assert.equal(normalizeStatus('applied').status, 'Applied');
  });

  test('sent → Applied', () => {
    assert.equal(normalizeStatus('sent').status, 'Applied');
  });

  test('cerrada → Discarded', () => {
    assert.equal(normalizeStatus('cerrada').status, 'Discarded');
  });

  test('descartada → Discarded', () => {
    assert.equal(normalizeStatus('descartada').status, 'Discarded');
  });

  test('rechazada → Rejected', () => {
    assert.equal(normalizeStatus('rechazada').status, 'Rejected');
  });

  test('no_aplicar → SKIP', () => {
    assert.equal(normalizeStatus('no_aplicar').status, 'SKIP');
  });

  test('no aplicar → SKIP', () => {
    assert.equal(normalizeStatus('no aplicar').status, 'SKIP');
  });

  test('skip → SKIP', () => {
    assert.equal(normalizeStatus('skip').status, 'SKIP');
  });
});

describe('normalizeStatus - DUPLICADO variants', () => {
  test('duplicado → Discarded with moveToNotes', () => {
    const result = normalizeStatus('duplicado');
    assert.equal(result.status, 'Discarded');
    assert.ok(result.moveToNotes);
  });

  test('DUPLICADO #123 → Discarded with moveToNotes', () => {
    const result = normalizeStatus('DUPLICADO #123');
    assert.equal(result.status, 'Discarded');
    assert.ok(result.moveToNotes);
  });

  test('dup → Discarded', () => {
    assert.equal(normalizeStatus('dup').status, 'Discarded');
  });

  test('repost → Discarded', () => {
    const result = normalizeStatus('repost #456');
    assert.equal(result.status, 'Discarded');
    assert.ok(result.moveToNotes);
  });
});

describe('normalizeStatus - other aliases', () => {
  test('condicional → Evaluated', () => {
    assert.equal(normalizeStatus('condicional').status, 'Evaluated');
  });

  test('hold → Evaluated', () => {
    assert.equal(normalizeStatus('hold').status, 'Evaluated');
  });

  test('monitor → Evaluated', () => {
    assert.equal(normalizeStatus('monitor').status, 'Evaluated');
  });

  test('evaluar → Evaluated', () => {
    assert.equal(normalizeStatus('evaluar').status, 'Evaluated');
  });

  test('verificar → Evaluated', () => {
    assert.equal(normalizeStatus('verificar').status, 'Evaluated');
  });

  test('geo blocker → SKIP', () => {
    assert.equal(normalizeStatus('geo blocker').status, 'SKIP');
    assert.equal(normalizeStatus('geo-blocker').status, 'SKIP');
  });

  test('cancelada → Discarded', () => {
    assert.equal(normalizeStatus('cancelada').status, 'Discarded');
  });
});

describe('normalizeStatus - edge cases', () => {
  test('em dash → Discarded', () => {
    assert.equal(normalizeStatus('—').status, 'Discarded');
  });

  test('hyphen → Discarded', () => {
    assert.equal(normalizeStatus('-').status, 'Discarded');
  });

  test('empty string → Discarded', () => {
    assert.equal(normalizeStatus('').status, 'Discarded');
  });

  test('unknown status → { status: null, unknown: true }', () => {
    const result = normalizeStatus('completely-unknown-value');
    assert.equal(result.status, null);
    assert.ok(result.unknown);
  });

  test('another unknown → flagged', () => {
    const result = normalizeStatus('pending-review');
    assert.equal(result.status, null);
    assert.ok(result.unknown);
  });
});
