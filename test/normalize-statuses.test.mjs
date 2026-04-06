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
    const canonical = ['Evaluada', 'Aplicado', 'Respondido', 'Entrevista', 'Oferta', 'Rechazado', 'Descartado', 'NO APLICAR'];
    for (const s of canonical) {
      const result = normalizeStatus(s);
      assert.equal(result.status, s, `Expected "${s}" to remain unchanged`);
    }
  });

  test('case-insensitive match still returns proper casing', () => {
    assert.equal(normalizeStatus('evaluada').status, 'Evaluada');
    assert.equal(normalizeStatus('APLICADO').status, 'Aplicado');
    assert.equal(normalizeStatus('no aplicar').status, 'NO APLICAR');
  });
});

describe('normalizeStatus - markdown bold stripping', () => {
  test('strips ** and returns canonical', () => {
    assert.equal(normalizeStatus('**Evaluada**').status, 'Evaluada');
    assert.equal(normalizeStatus('**Rechazado**').status, 'Rechazado');
    assert.equal(normalizeStatus('**Applied**').status, 'Aplicado');
  });
});

describe('normalizeStatus - date stripping', () => {
  test('Aplicado with date → Aplicado', () => {
    assert.equal(normalizeStatus('Aplicado 2026-01-15').status, 'Aplicado');
  });

  test('Rechazado with date → Rechazado', () => {
    assert.equal(normalizeStatus('Rechazado 2026-03-10').status, 'Rechazado');
  });
});

describe('normalizeStatus - alias mapping', () => {
  test('enviada → Aplicado', () => {
    assert.equal(normalizeStatus('enviada').status, 'Aplicado');
  });

  test('aplicada → Aplicado', () => {
    assert.equal(normalizeStatus('aplicada').status, 'Aplicado');
  });

  test('applied → Aplicado', () => {
    assert.equal(normalizeStatus('applied').status, 'Aplicado');
  });

  test('sent → Aplicado', () => {
    assert.equal(normalizeStatus('sent').status, 'Aplicado');
  });

  test('cerrada → Descartado', () => {
    assert.equal(normalizeStatus('cerrada').status, 'Descartado');
  });

  test('descartada → Descartado', () => {
    assert.equal(normalizeStatus('descartada').status, 'Descartado');
  });

  test('rechazada → Rechazado', () => {
    assert.equal(normalizeStatus('rechazada').status, 'Rechazado');
  });

  test('no_aplicar → NO APLICAR', () => {
    assert.equal(normalizeStatus('no_aplicar').status, 'NO APLICAR');
  });

  test('no aplicar → NO APLICAR', () => {
    assert.equal(normalizeStatus('no aplicar').status, 'NO APLICAR');
  });

  test('skip → NO APLICAR', () => {
    assert.equal(normalizeStatus('skip').status, 'NO APLICAR');
  });
});

describe('normalizeStatus - DUPLICADO variants', () => {
  test('duplicado → Descartado with moveToNotes', () => {
    const result = normalizeStatus('duplicado');
    assert.equal(result.status, 'Descartado');
    assert.ok(result.moveToNotes);
  });

  test('DUPLICADO #123 → Descartado with moveToNotes', () => {
    const result = normalizeStatus('DUPLICADO #123');
    assert.equal(result.status, 'Descartado');
    assert.ok(result.moveToNotes);
  });

  test('dup → Descartado', () => {
    assert.equal(normalizeStatus('dup').status, 'Descartado');
  });

  test('repost → Descartado', () => {
    const result = normalizeStatus('repost #456');
    assert.equal(result.status, 'Descartado');
    assert.ok(result.moveToNotes);
  });
});

describe('normalizeStatus - other aliases', () => {
  test('condicional → Evaluada', () => {
    assert.equal(normalizeStatus('condicional').status, 'Evaluada');
  });

  test('hold → Evaluada', () => {
    assert.equal(normalizeStatus('hold').status, 'Evaluada');
  });

  test('monitor → Evaluada', () => {
    assert.equal(normalizeStatus('monitor').status, 'Evaluada');
  });

  test('evaluar → Evaluada', () => {
    assert.equal(normalizeStatus('evaluar').status, 'Evaluada');
  });

  test('verificar → Evaluada', () => {
    assert.equal(normalizeStatus('verificar').status, 'Evaluada');
  });

  test('geo blocker → NO APLICAR', () => {
    assert.equal(normalizeStatus('geo blocker').status, 'NO APLICAR');
    assert.equal(normalizeStatus('geo-blocker').status, 'NO APLICAR');
  });

  test('cancelada → Descartado', () => {
    assert.equal(normalizeStatus('cancelada').status, 'Descartado');
  });
});

describe('normalizeStatus - edge cases', () => {
  test('em dash → Descartado', () => {
    assert.equal(normalizeStatus('—').status, 'Descartado');
  });

  test('hyphen → Descartado', () => {
    assert.equal(normalizeStatus('-').status, 'Descartado');
  });

  test('empty string → Descartado', () => {
    assert.equal(normalizeStatus('').status, 'Descartado');
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
