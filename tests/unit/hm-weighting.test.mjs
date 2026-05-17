import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreBullet, scoreAndRankBullets, buildLlmPreamble } from '../../lib/hm-weighting.mjs';

// Shared weight override so tests never depend on the file path at test-runner cwd.
const TEST_WEIGHTS = {
  alpha_sim_semantic: 0.6,
  beta_hm_bias: 0.3,
  gamma_ai_risk: 0.1,
  feature_weights: {
    top_third_importance:      { cv_bullet_weight: 1.5 },
    cross_functional_bias:     { story_cross_func_weight: 2.0 },
    anti_jargon:               { max_jargon_score: 0.4 },
    metrics_focus:             { metric_density_target: 0.7 },
    writing_depth_preference:  { sentence_length_target: 18 },
    portfolio_importance:      { portfolio_section_priority: 2.0 },
  },
};

const hmIntel = {
  top_third_priority_keywords: ['shipped', 'launched'],
  anti_jargon_keywords: ['synergy', 'leverage'],
};

test('scoreBullet returns a finite number for a minimal bullet', () => {
  const result = scoreBullet({ text: 'foo' }, {}, {}, { weights: TEST_WEIGHTS });
  assert.equal(typeof result.score, 'number');
  assert.ok(Number.isFinite(result.score));
});

test('scoreBullet score is within plausible bounds for default inputs (sim=0.5, no risk)', () => {
  // With sim=0.5, hm_bias=0, ai_risk=0:
  // score = 0.6*0.5 + 0.3*0 - 0.1*0 = 0.3
  const { score } = scoreBullet({ text: 'foo' }, {}, {}, { weights: TEST_WEIGHTS });
  assert.ok(score >= 0 && score <= 1, `expected score in [0,1], got ${score}`);
});

test('top_third_priority_keyword in bullet text raises score above baseline', () => {
  const base    = scoreBullet({ text: 'coordinated with team on design' }, hmIntel, {}, { weights: TEST_WEIGHTS });
  const boosted = scoreBullet({ text: 'shipped new inference stack' },     hmIntel, {}, { weights: TEST_WEIGHTS });
  assert.ok(
    boosted.score > base.score,
    `expected keyword-matching bullet to score higher (${boosted.score.toFixed(4)} > ${base.score.toFixed(4)})`
  );
});

test('anti_jargon keyword in bullet text decreases score below baseline', () => {
  const base    = scoreBullet({ text: 'drove efficiency across teams' }, hmIntel, {}, { weights: TEST_WEIGHTS });
  const jargon  = scoreBullet({ text: 'leveraged synergy for alignment' }, hmIntel, {}, { weights: TEST_WEIGHTS });
  assert.ok(
    jargon.score < base.score,
    `expected jargon bullet to score lower (${jargon.score.toFixed(4)} < ${base.score.toFixed(4)})`
  );
});

test('ai_risk=100 scores lower than ai_risk=0 on the same text', () => {
  const clean  = scoreBullet({ text: 'shipped API', ai_risk: 0   }, {}, {}, { weights: TEST_WEIGHTS });
  const risky  = scoreBullet({ text: 'shipped API', ai_risk: 100 }, {}, {}, { weights: TEST_WEIGHTS });
  assert.ok(
    clean.score > risky.score,
    `expected ai_risk=0 to score higher (${clean.score.toFixed(4)} > ${risky.score.toFixed(4)})`
  );
  // Gamma=0.1 on 1.0 unit of risk = 0.1 difference
  assert.ok(Math.abs((clean.score - risky.score) - 0.1) < 1e-10);
});

test('scoreAndRankBullets returns at most topN items sorted descending by score', () => {
  const bullets = [
    { text: 'shipped inference stack', tags: ['role:a'], metric_density: 0.8, ai_risk: 5 },
    { text: 'launched developer API', tags: ['role:b'], metric_density: 0.9, ai_risk: 8 },
    { text: 'leveraged synergy',       tags: ['role:c'], metric_density: 0.0, ai_risk: 60 },
    { text: 'built onboarding flow',   tags: ['role:d'], metric_density: 0.3, ai_risk: 15 },
    { text: 'coordinated releases',    tags: ['role:e'], metric_density: 0.2, ai_risk: 20 },
    { text: 'reduced infra cost 30%',  tags: ['role:f'], metric_density: 0.85, ai_risk: 3 },
  ];
  const ranked = scoreAndRankBullets(bullets, hmIntel, {}, { topN: 3, weights: TEST_WEIGHTS });
  assert.ok(ranked.length <= 3, `expected ≤3 items, got ${ranked.length}`);
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(
      ranked[i - 1].score >= ranked[i].score,
      `expected descending order at index ${i}: ${ranked[i-1].score.toFixed(4)} >= ${ranked[i].score.toFixed(4)}`
    );
  }
});

test('scoreAndRankBullets respects role diversity by default', () => {
  // Two bullets with the same role tag — only one should appear in top-2
  const bullets = [
    { text: 'shipped A', tags: ['role:same'], ai_risk: 0 },
    { text: 'shipped B', tags: ['role:same'], ai_risk: 0 },
    { text: 'launched C', tags: ['role:different'], ai_risk: 0 },
  ];
  const ranked = scoreAndRankBullets(bullets, hmIntel, {}, { topN: 2, weights: TEST_WEIGHTS });
  const roleTags = ranked.map(b => (b.tags || []).find(t => t.startsWith('role:')) || '');
  const unique = new Set(roleTags);
  assert.equal(unique.size, roleTags.length, 'expected each role tag to appear at most once in top-N');
});

test('buildLlmPreamble returns a markdown string with one line per bullet', () => {
  const bullets = [
    { text: 'shipped API', cv_ref: 'cv.md:L12', score: 0.7, breakdown: { sim: 0.5, hm_bias: 0.3, ai_risk: 0.05 } },
    { text: 'led cross-functional',      score: 0.6, breakdown: { sim: 0.5, hm_bias: 0.2, ai_risk: 0.10 } },
  ];
  const preamble = buildLlmPreamble(bullets);
  assert.equal(typeof preamble, 'string');
  assert.ok(preamble.includes('## Top deterministically-ranked bullets'));
  // One bullet line per item (lines starting with "- ")
  const bulletLines = preamble.split('\n').filter(l => l.startsWith('- '));
  assert.equal(bulletLines.length, bullets.length, `expected ${bullets.length} bullet lines`);
  // cv_ref attribution appears
  assert.ok(preamble.includes('[cv.md:L12]'));
  // Score annotation appears
  assert.ok(/score \d+\.\d{3}/.test(preamble));
});
