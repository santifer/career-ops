/**
 * tests/unit/wealth-ranking.test.mjs
 *
 * Unit tests for lib/wealth-ranking.mjs. Uses real fixture data from the
 * repo (data/overpay-signals/CURRENT.md, data/skill-portability.json) since
 * the module is deterministic and reads only existing files.
 *
 * Run: node --test tests/unit/wealth-ranking.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  rankCompaniesByWealth,
  toSlug,
  scoreEquityStage,
  scoreAiNative,
  scoreSalaryBand,
  scoreIpoTrajectory,
  scoreSkillPortability,
  loadOverpaySignals,
  loadSkillPortabilitySeed,
} from '../../lib/wealth-ranking.mjs';

describe('toSlug', () => {
  test('basic slugification', () => {
    assert.equal(toSlug('Anthropic'), 'anthropic');
    assert.equal(toSlug('Mistral AI'), 'mistral-ai');
    assert.equal(toSlug('Cursor (Anysphere)'), 'cursor-anysphere');
    assert.equal(toSlug('OpenAI'), 'openai');
  });
  test('handles trailing/leading punctuation', () => {
    assert.equal(toSlug('--xAI!!'), 'xai');
  });
});

describe('scoreEquityStage', () => {
  test('Series C/D/E → 30 pts', () => {
    const r = scoreEquityStage('Series D Feb 2026 at $11B (Sequoia)');
    assert.equal(r.points, 30);
    assert.ok(r.why.includes('C/D/E'));
    assert.equal(r.hasData, true);
  });
  test('Series F+ → 25 pts', () => {
    const r = scoreEquityStage('Series G Feb 2026 at $380B');
    assert.equal(r.points, 25);
    assert.equal(r.hasData, true);
  });
  test('late-stage private → 20 pts', () => {
    const r = scoreEquityStage('Late-stage private; $852B mark');
    assert.equal(r.points, 20);
    assert.equal(r.hasData, true);
  });
  test('public → 10 pts', () => {
    const r = scoreEquityStage('Public company NASDAQ listed');
    assert.equal(r.points, 10);
    assert.equal(r.hasData, true);
  });
  test('unknown → 5 pts with hasData=false', () => {
    const r = scoreEquityStage('');
    assert.equal(r.points, 5);
    assert.equal(r.hasData, false);
  });
});

describe('scoreAiNative', () => {
  test('A2 from tier override', () => {
    const r = scoreAiNative('foo', { foo: 'A2' });
    assert.equal(r.points, 25);
    assert.equal(r.hasData, true);
  });
  test('A1 from tier override', () => {
    const r = scoreAiNative('foo', { foo: 'A1' });
    assert.equal(r.points, 25);
  });
  test('B from tier override → 15 pts', () => {
    const r = scoreAiNative('foo', { foo: 'B' });
    assert.equal(r.points, 15);
    assert.equal(r.hasData, true);
  });
  test('intel bridge_to_ai_pm_score ≥ 4 → infers A2', () => {
    const r = scoreAiNative('foo', {}, { bridge_to_ai_pm_score: 5 });
    assert.equal(r.points, 25);
    assert.equal(r.hasData, true);
  });
  test('no signal → 15 pts hasData=false', () => {
    const r = scoreAiNative('foo', {}, null);
    assert.equal(r.points, 15);
    assert.equal(r.hasData, false);
  });
});

describe('scoreSalaryBand', () => {
  test('$500K → 25 pts', () => {
    const r = scoreSalaryBand(500_000);
    assert.equal(r.points, 25);
    assert.equal(r.hasData, true);
  });
  test('$300K → ~10-11 pts', () => {
    const r = scoreSalaryBand(300_000);
    assert.ok(r.points >= 10 && r.points <= 12, `Got ${r.points}`);
    assert.equal(r.hasData, true);
  });
  test('$150K → 0 pts', () => {
    const r = scoreSalaryBand(150_000);
    assert.equal(r.points, 0);
  });
  test('no comp data → 0 pts with hasData=false', () => {
    const r = scoreSalaryBand(0);
    assert.equal(r.points, 0);
    assert.equal(r.hasData, false);
  });
  test('caps at 25 pts even for $1M+', () => {
    const r = scoreSalaryBand(1_500_000);
    assert.equal(r.points, 25);
  });
});

describe('scoreIpoTrajectory', () => {
  test('S-1 filing → 10 pts', () => {
    const r = scoreIpoTrajectory('Q4 2026 IPO filing target; S-1 ready');
    assert.equal(r.points, 10);
  });
  test('banker / IPO target → 7 pts', () => {
    const r = scoreIpoTrajectory('CFO hired (IPO target); banker selection underway');
    assert.equal(r.points, 7);
  });
  test('tender / preferred → 5 pts', () => {
    const r = scoreIpoTrajectory('$6.6B employee tender Oct 2025');
    assert.equal(r.points, 5);
  });
  test('funding round only → 3 pts', () => {
    const r = scoreIpoTrajectory('raised $200M at $14.6B valuation');
    assert.equal(r.points, 3);
  });
  test('no signal → 0 pts', () => {
    const r = scoreIpoTrajectory('');
    assert.equal(r.points, 0);
    assert.equal(r.hasData, false);
  });
});

describe('scoreSkillPortability', () => {
  test('seed map value used directly', () => {
    const r = scoreSkillPortability('anthropic', { anthropic: 10 });
    assert.equal(r.points, 10);
    assert.equal(r.hasData, true);
  });
  test('intel 0-5 scale doubled to 0-10', () => {
    const r = scoreSkillPortability('foo', {}, { skill_portability_score: 4 });
    assert.equal(r.points, 8);
    assert.equal(r.hasData, true);
  });
  test('default 10 pts if no data', () => {
    const r = scoreSkillPortability('foo', {});
    assert.equal(r.points, 10);
    assert.equal(r.hasData, false);
  });
  test('caps at 10', () => {
    const r = scoreSkillPortability('foo', { foo: 99 });
    assert.equal(r.points, 10);
  });
});

describe('loadOverpaySignals (integration)', () => {
  test('reads CURRENT.md and returns map with anthropic', () => {
    const m = loadOverpaySignals();
    assert.ok(m.anthropic, 'should find anthropic block');
    assert.ok(m.anthropic.displayName.toLowerCase().includes('anthropic'));
    assert.ok(m.anthropic.equityText.length > 0);
  });
  test('returns map keyed by slug', () => {
    const m = loadOverpaySignals();
    const slugs = Object.keys(m);
    assert.ok(slugs.length >= 5, `Expected ≥5 companies, got ${slugs.length}`);
    for (const s of slugs) {
      assert.equal(s, toSlug(s), `slug ${s} should be canonical`);
    }
  });
});

describe('loadSkillPortabilitySeed (integration)', () => {
  test('reads data/skill-portability.json companies map', () => {
    const m = loadSkillPortabilitySeed();
    assert.ok(typeof m === 'object');
    if (m.anthropic !== undefined) {
      assert.ok(m.anthropic >= 0 && m.anthropic <= 10);
    }
  });
});

describe('rankCompaniesByWealth (end-to-end)', () => {
  test('returns sorted array with score+drivers per row', () => {
    const ranked = rankCompaniesByWealth(null);
    assert.ok(Array.isArray(ranked));
    assert.ok(ranked.length >= 5, `Expected ≥5 ranked companies, got ${ranked.length}`);
    // Each row has the expected shape.
    for (const r of ranked) {
      assert.equal(typeof r.slug, 'string');
      assert.equal(typeof r.displayName, 'string');
      assert.equal(typeof r.score, 'number');
      assert.ok(r.score >= 0 && r.score <= 100, `score ${r.score} out of [0,100] for ${r.slug}`);
      assert.ok(Array.isArray(r.drivers));
      assert.equal(r.drivers.length, 5, `5 drivers expected for ${r.slug}`);
      assert.equal(typeof r.hasPartialData, 'boolean');
    }
  });
  test('sorted descending by score', () => {
    const ranked = rankCompaniesByWealth(null);
    for (let i = 1; i < ranked.length; i++) {
      assert.ok(ranked[i - 1].score >= ranked[i].score, `Not sorted at i=${i}`);
    }
  });
  test('drivers sum to score', () => {
    const ranked = rankCompaniesByWealth(null);
    for (const r of ranked) {
      const sum = r.drivers.reduce((acc, d) => acc + d.points, 0);
      assert.equal(sum, r.score, `Driver sum mismatch for ${r.slug}: ${sum} ≠ ${r.score}`);
    }
  });
  test('respects tierOverrides', () => {
    const ranked = rankCompaniesByWealth(['anthropic'], { tierOverrides: { anthropic: 'B' } });
    const a = ranked.find((r) => r.slug === 'anthropic');
    assert.ok(a);
    const aiDr = a.drivers.find((d) => d.key === 'ai_native');
    assert.equal(aiDr.points, 15, 'B-tier override should yield 15 pts');
  });
  test('top company score is meaningfully high (>50)', () => {
    const ranked = rankCompaniesByWealth(null);
    assert.ok(ranked[0].score >= 50, `Top score ${ranked[0].score} should be ≥50`);
  });
});
