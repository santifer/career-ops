import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CRITERIA,
  buildTestSet,
  scoreEvaluation,
  summarizeResults,
  runIteration,
} from './eval-loop.mjs';

describe('CRITERIA', () => {
  it('is a frozen array of 6 criterion names', () => {
    assert.equal(CRITERIA.length, 6);
    assert.ok(Object.isFrozen(CRITERIA));
  });
});

describe('buildTestSet', () => {
  it('converts calibration entries to test cases, filtering empty actions', () => {
    const calibration = [
      { date: '2026-01-01', company: 'Acme', role: 'CTO', score: '4.2', action: 'Apply', delta: '+0.2', lesson: 'Good fit' },
      { date: '2026-01-02', company: 'Bank', role: 'Analyst', score: '2.0', action: '', delta: '-1.0', lesson: 'Bad fit' },
      { date: '2026-01-03', company: 'Corp', role: 'Eng', score: '3.5', action: 'SKIP', delta: '0', lesson: 'Meh' },
    ];
    const testSet = buildTestSet(calibration);
    assert.equal(testSet.length, 2); // Bank filtered out (empty action)
    assert.equal(testSet[0].company, 'Acme');
    assert.equal(testSet[1].company, 'Corp');
    assert.equal(testSet[0].expectedAction, 'Apply');
  });
});

describe('scoreEvaluation', () => {
  it('perfect eval gives passed=6/6, passRate=1.0', () => {
    const result = scoreEvaluation({
      score: 4.2,
      expectedScore: 4.2,
      dealBreakersFound: true,
      proofPointsCited: true,
      actionMatched: true,
      archetypeCorrect: true,
      signalsReflected: true,
    });
    assert.equal(result.passed, 6);
    assert.equal(result.total, 6);
    assert.equal(result.passRate, 1.0);
    assert.deepStrictEqual(result.failures, []);
  });

  it('score mismatch > 0.5 results in score failure', () => {
    const result = scoreEvaluation({
      score: 4.2,
      expectedScore: 3.0,
      dealBreakersFound: true,
      proofPointsCited: true,
      actionMatched: true,
      archetypeCorrect: true,
      signalsReflected: true,
    });
    assert.ok(result.failures.includes('score'));
    assert.equal(result.passed, 5);
  });
});

describe('summarizeResults', () => {
  it('produces readable text with percentages, kept/discarded counts', () => {
    const iterations = [
      runIteration(1, 0.6, 'Adjusted weights', true),
      runIteration(2, 0.8, 'Added proof points', true),
      runIteration(3, 0.5, 'Bad change', false),
    ];
    const summary = summarizeResults(iterations);
    assert.ok(summary.includes('60.0%'));
    assert.ok(summary.includes('80.0%'));
    assert.ok(summary.includes('50.0%'));
    assert.ok(summary.includes('kept'));
    assert.ok(summary.includes('discarded'));
    assert.ok(summary.includes('Kept: 2'));
    assert.ok(summary.includes('Discarded: 1'));
    assert.ok(summary.includes('Start: 60.0%'));
    assert.ok(summary.includes('Best: 80.0%'));
  });
});
