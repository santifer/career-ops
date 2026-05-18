/**
 * tests/unit/skill-portability.test.mjs
 *
 * 6 unit tests for lib/skill-portability.mjs — all deterministic, no LLM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computePortabilityIndex } from '../../lib/skill-portability.mjs';

test('empty corpus returns all-zero scores and empty skills list', () => {
  const result = computePortabilityIndex({});
  assert.equal(result.finance, 0, 'finance is 0 for empty corpus');
  assert.equal(result.health, 0, 'health is 0 for empty corpus');
  assert.equal(result.legal, 0, 'legal is 0 for empty corpus');
  assert.equal(result.traditional_tech, 0, 'traditional_tech is 0 for empty corpus');
  assert.deepEqual(result.top_transferable_skills, [], 'no transferable skills for empty corpus');
});

test('scores are in 0-100 range for any corpus', () => {
  const corpus = {
    cv: 'python typescript kubernetes docker aws llm machine learning ai nlp data science fintech trading equity ipo healthcare clinical hipaa compliance legal contract regulatory',
    articleDigest: 'shipped ai pipeline for finance banking risk management ehr medical patient',
    storyBank: 'cross-functional stakeholder enterprise saas integration',
  };
  const result = computePortabilityIndex(corpus);
  for (const vertical of ['finance', 'health', 'legal', 'traditional_tech']) {
    assert.ok(result[vertical] >= 0, `${vertical} >= 0`);
    assert.ok(result[vertical] <= 100, `${vertical} <= 100`);
  }
});

test('traditional_tech scores higher than other verticals for a tech-heavy corpus', () => {
  const corpus = {
    cv: [
      'python typescript javascript golang kubernetes docker aws gcp ci/cd devops',
      'distributed systems microservices api design postgresql machine learning llm ai',
      'technical program management tpm engineering management architecture system design',
      'sprint agile scrum ship launch release deployment integration platform',
    ].join(' '),
  };
  const result = computePortabilityIndex(corpus);
  assert.ok(
    result.traditional_tech >= result.finance,
    `traditional_tech (${result.traditional_tech}) should be >= finance (${result.finance})`
  );
  assert.ok(
    result.traditional_tech >= result.health,
    `traditional_tech (${result.traditional_tech}) should be >= health (${result.health})`
  );
  assert.ok(
    result.traditional_tech >= result.legal,
    `traditional_tech (${result.traditional_tech}) should be >= legal (${result.legal})`
  );
});

test('finance-rich corpus yields higher finance score than legal', () => {
  const corpus = {
    cv: 'fintech trading portfolio equity ipo vesting valuation hedge fund asset management banking investment financial model risk management compliance regulatory revenue operations p&l ebitda roi arr mrr financial reporting budgeting forecasting compensation analysis',
  };
  const result = computePortabilityIndex(corpus);
  assert.ok(result.finance > result.legal, `finance (${result.finance}) should exceed legal (${result.legal}) for finance-rich corpus`);
});

test('top_transferable_skills has at most 10 entries and correct shape', () => {
  const corpus = {
    cv: 'python typescript kubernetes docker aws llm machine learning ai nlp data science fintech trading equity healthcare clinical hipaa legal contract regulatory compliance banking investment financial model risk management',
    articleDigest: 'data pipeline automation workflow analytics dashboard',
    storyBank: 'cross-functional stakeholder enterprise saas integration api design',
  };
  const result = computePortabilityIndex(corpus);
  assert.ok(result.top_transferable_skills.length <= 10, 'at most 10 top transferable skills');
  for (const entry of result.top_transferable_skills) {
    assert.ok(typeof entry.skill === 'string' && entry.skill.length > 0, 'skill is a non-empty string');
    assert.ok(['finance', 'health', 'legal', 'traditional_tech'].includes(entry.vertical), `vertical is a known value: ${entry.vertical}`);
    assert.ok(typeof entry.evidence_ref === 'string', 'evidence_ref is a string');
    assert.ok(/occurrence/.test(entry.evidence_ref), 'evidence_ref mentions occurrences');
  }
});

test('result shape has exactly the 5 expected keys', () => {
  const result = computePortabilityIndex({ cv: 'python' });
  const keys = Object.keys(result).sort();
  assert.deepEqual(keys, [
    'finance',
    'health',
    'legal',
    'top_transferable_skills',
    'traditional_tech',
  ]);
});
