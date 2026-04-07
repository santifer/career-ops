import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLedger,
  addCalibrationEntry,
  promotePrinciple,
  prunePrinciple,
  detectConflicts,
  serializeLedger,
} from './strategy-engine.mjs';

const EMPTY_LEDGER = `# Strategy Ledger
## Guiding Principles (validated, n >= 10, 3+ industries)
## Cautionary Principles (validated, n >= 10, 3+ industries)
## Active Hypotheses (testing, n < 10)
## Calibration Log
| Date | Company | Role | Score | Action | Delta | Lesson |
|------|---------|------|-------|--------|-------|--------|
## Optimization History
| Date | Loop | Pass Rate Before | After | Changes | Approved |
|------|------|-----------------|-------|---------|----------|
`;

describe('parseLedger', () => {
  it('parses empty ledger (all arrays empty)', () => {
    const ledger = parseLedger(EMPTY_LEDGER);
    assert.deepStrictEqual(ledger.guidingPrinciples, []);
    assert.deepStrictEqual(ledger.cautionaryPrinciples, []);
    assert.deepStrictEqual(ledger.hypotheses, []);
    assert.deepStrictEqual(ledger.calibrationLog, []);
    assert.deepStrictEqual(ledger.optimizationHistory, []);
  });

  it('parses guiding principle line format', () => {
    const md = EMPTY_LEDGER.replace(
      '## Guiding Principles (validated, n >= 10, 3+ industries)\n',
      '## Guiding Principles (validated, n >= 10, 3+ industries)\n- Remote-first roles score 15% higher. (n=12, 85% accuracy, industries=AI,fintech,govcon)\n',
    );
    const ledger = parseLedger(md);
    assert.equal(ledger.guidingPrinciples.length, 1);
    const p = ledger.guidingPrinciples[0];
    assert.equal(p.text, 'Remote-first roles score 15% higher.');
    assert.equal(p.n, 12);
    assert.equal(p.accuracy, 85);
    assert.deepStrictEqual(p.industries, ['AI', 'fintech', 'govcon']);
  });

  it('parses calibration log table rows', () => {
    const md = EMPTY_LEDGER.replace(
      '|------|---------|------|-------|--------|-------|--------|\n',
      '|------|---------|------|-------|--------|-------|--------|\n| 2026-04-01 | Acme Corp | ML Engineer | 4.2 | Applied | +0.3 | Strong match on infra |\n',
    );
    const ledger = parseLedger(md);
    assert.equal(ledger.calibrationLog.length, 1);
    const row = ledger.calibrationLog[0];
    assert.equal(row.date, '2026-04-01');
    assert.equal(row.company, 'Acme Corp');
    assert.equal(row.role, 'ML Engineer');
    assert.equal(row.score, '4.2');
    assert.equal(row.action, 'Applied');
    assert.equal(row.delta, '+0.3');
    assert.equal(row.lesson, 'Strong match on infra');
  });
});

describe('addCalibrationEntry', () => {
  it('adds entry to calibration array', () => {
    const ledger = parseLedger(EMPTY_LEDGER);
    const entry = {
      date: '2026-04-06',
      company: 'TechCo',
      role: 'Senior Engineer',
      score: '3.8',
      action: 'SKIP',
      delta: '-0.2',
      lesson: 'Too junior',
    };
    addCalibrationEntry(ledger, entry);
    assert.equal(ledger.calibrationLog.length, 1);
    assert.deepStrictEqual(ledger.calibrationLog[0], entry);
  });
});

describe('promotePrinciple', () => {
  it('moves hypothesis to guiding principle', () => {
    const ledger = parseLedger(EMPTY_LEDGER);
    ledger.hypotheses.push({
      text: 'Series B+ companies respond faster.',
      n: 15,
      accuracy: 80,
      industries: ['AI', 'fintech', 'healthtech'],
    });
    promotePrinciple(ledger, 0, 'guidingPrinciples');
    assert.equal(ledger.hypotheses.length, 0);
    assert.equal(ledger.guidingPrinciples.length, 1);
    assert.equal(ledger.guidingPrinciples[0].text, 'Series B+ companies respond faster.');
  });

  it('requires n>=10 AND 3+ industries (throws insufficient otherwise)', () => {
    const ledger = parseLedger(EMPTY_LEDGER);
    // n too low
    ledger.hypotheses.push({
      text: 'Untested hypothesis.',
      n: 5,
      accuracy: 90,
      industries: ['AI', 'fintech', 'govcon'],
    });
    assert.throws(() => promotePrinciple(ledger, 0, 'guidingPrinciples'), {
      message: /insufficient/,
    });

    // Reset: n ok but industries too few
    ledger.hypotheses[0] = {
      text: 'Narrow hypothesis.',
      n: 15,
      accuracy: 90,
      industries: ['AI', 'fintech'],
    };
    assert.throws(() => promotePrinciple(ledger, 0, 'guidingPrinciples'), {
      message: /insufficient/,
    });
  });
});

describe('prunePrinciple', () => {
  it('demotes guiding principle to hypothesis with trending=demoted', () => {
    const ledger = parseLedger(EMPTY_LEDGER);
    ledger.guidingPrinciples.push({
      text: 'Outdated principle.',
      n: 20,
      accuracy: 55,
      industries: ['AI', 'fintech', 'govcon', 'healthtech'],
    });
    prunePrinciple(ledger, 0, 'guidingPrinciples');
    assert.equal(ledger.guidingPrinciples.length, 0);
    assert.equal(ledger.hypotheses.length, 1);
    assert.equal(ledger.hypotheses[0].text, 'Outdated principle.');
    assert.equal(ledger.hypotheses[0].trending, 'demoted');
  });
});

describe('detectConflicts', () => {
  it('detects conflict: principle mentions hybrid but deal-breaker says remote only', () => {
    const ledger = parseLedger(EMPTY_LEDGER);
    ledger.guidingPrinciples.push({
      text: 'Hybrid roles have better comp packages.',
      n: 12,
      accuracy: 78,
      industries: ['AI', 'fintech', 'govcon'],
    });
    const dealBreakers = ['remote only'];
    const conflicts = detectConflicts(ledger, dealBreakers);
    assert.ok(conflicts.length > 0);
    assert.ok(conflicts[0].principle.toLowerCase().includes('hybrid'));
    assert.ok(conflicts[0].dealBreaker.toLowerCase().includes('remote'));
  });

  it('returns empty when no conflicts', () => {
    const ledger = parseLedger(EMPTY_LEDGER);
    ledger.guidingPrinciples.push({
      text: 'Remote-first roles score higher.',
      n: 12,
      accuracy: 85,
      industries: ['AI', 'fintech', 'govcon'],
    });
    const dealBreakers = ['remote only'];
    const conflicts = detectConflicts(ledger, dealBreakers);
    assert.equal(conflicts.length, 0);
  });
});

describe('serializeLedger', () => {
  it('round-trips: parse → add entry → serialize → re-parse produces same data', () => {
    const ledger = parseLedger(EMPTY_LEDGER);

    // Add a guiding principle
    ledger.guidingPrinciples.push({
      text: 'Remote-first roles score 15% higher.',
      n: 12,
      accuracy: 85,
      industries: ['AI', 'fintech', 'govcon'],
    });

    // Add a calibration entry
    addCalibrationEntry(ledger, {
      date: '2026-04-06',
      company: 'TechCo',
      role: 'Senior Engineer',
      score: '3.8',
      action: 'SKIP',
      delta: '-0.2',
      lesson: 'Too junior',
    });

    // Add a hypothesis
    ledger.hypotheses.push({
      text: 'Startups under 50 people move faster.',
      n: 7,
      accuracy: 71,
      industries: ['AI', 'fintech'],
    });

    const serialized = serializeLedger(ledger);
    const reparsed = parseLedger(serialized);

    assert.equal(reparsed.guidingPrinciples.length, 1);
    assert.equal(reparsed.guidingPrinciples[0].text, 'Remote-first roles score 15% higher.');
    assert.equal(reparsed.guidingPrinciples[0].n, 12);
    assert.equal(reparsed.guidingPrinciples[0].accuracy, 85);
    assert.deepStrictEqual(reparsed.guidingPrinciples[0].industries, ['AI', 'fintech', 'govcon']);

    assert.equal(reparsed.hypotheses.length, 1);
    assert.equal(reparsed.hypotheses[0].text, 'Startups under 50 people move faster.');

    assert.equal(reparsed.calibrationLog.length, 1);
    assert.equal(reparsed.calibrationLog[0].company, 'TechCo');
    assert.equal(reparsed.calibrationLog[0].lesson, 'Too junior');
  });
});
