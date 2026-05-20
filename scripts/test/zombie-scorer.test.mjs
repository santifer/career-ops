/**
 * scripts/test/zombie-scorer.test.mjs — Node native test runner (--test)
 *
 * Run: node --test scripts/test/zombie-scorer.test.mjs
 *
 * All fixtures use mocked JD data — no external API calls.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreZombie, ZOMBIE_AGE_THRESHOLD_DAYS, ZOMBIE_AGE_RAMP_DAYS, CLUSTER_MIN_LOCATIONS } from '../../lib/zombie-scorer.mjs';

// ── Helper ─────────────────────────────────────────────────────────────────

function row(overrides = {}) {
  return {
    url:      'https://job-boards.greenhouse.io/example/jobs/1234',
    title:    'Solutions Architect',
    company:  'Example Co',
    location: 'Seattle, WA',
    body:     '',
    ageDays:  0,
    ...overrides,
  };
}

function historyFor(title, company, locations) {
  return locations.map((loc, i) => ({
    url:      `https://example.com/jobs/${i}`,
    title,
    company,
    location: loc,
  }));
}

// ── 1. Brand-new posting → full-eval ──────────────────────────────────────

test('fresh posting (0 days, no signals) → full-eval', () => {
  const result = scoreZombie(row({ ageDays: 0 }), []);
  assert.equal(result.decision, 'full-eval');
  assert.ok(result.composite < 0.3, `expected composite < 0.3, got ${result.composite}`);
  assert.equal(result.breakdown.age, 0);
  assert.equal(result.breakdown.evergreen, 0);
  assert.equal(result.breakdown.cluster, 0);
});

// ── 2. Posting at exactly ZOMBIE_AGE_THRESHOLD_DAYS ───────────────────────

test(`posting at exactly ${ZOMBIE_AGE_THRESHOLD_DAYS}d → cheap-eval (below skip threshold)`, () => {
  const result = scoreZombie(row({ ageDays: ZOMBIE_AGE_THRESHOLD_DAYS }), []);
  // At threshold, age_score transitions — composite = 0.35 × 0.0 (ramp just starting)
  // Anything solely from age at the threshold boundary stays under 0.5
  assert.ok(result.composite < 0.5, `composite should be < 0.5 at exact threshold boundary, got ${result.composite}`);
});

// ── 3. Very old posting (>60d) alone → cheap-eval, not skip ───────────────
// Age alone (0.35 × 1.0 = 0.35) is below the 0.5 skip threshold. Without
// cluster or evergreen, a stale-but-possibly-active role goes to cheap-eval.

test('very old posting (70d) with no other signals → cheap-eval, not skip', () => {
  const result = scoreZombie(row({ ageDays: 70 }), []);
  assert.equal(result.breakdown.age, 1.0);
  assert.equal(result.breakdown.cluster, 0);
  assert.equal(result.breakdown.evergreen, 0);
  assert.ok(result.composite >= 0.3, `expected composite >= 0.3, got ${result.composite}`);
  assert.ok(result.composite < 0.5, `expected composite < 0.5, got ${result.composite}`);
  assert.equal(result.decision, 'cheap-eval');
});

// ── 4. Multi-region cluster (>=4 locations) alone with fresh posting ─────
// Cluster alone: 0.25 × 1.0 = 0.25. Age at 5d: 0.35 × (5/45) ≈ 0.039.
// Composite ≈ 0.289 → full-eval (below 0.3 threshold).
// A very fresh posting with many locations is not obviously zombie — the
// cheap-eval band kicks in only when composite is 0.3–0.5.

test(`cluster at exactly ${CLUSTER_MIN_LOCATIONS} locations, fresh (5d) posting → full-eval`, () => {
  const history = historyFor('Solutions Architect', 'Example Co', [
    'seattle, wa', 'new york, ny', 'chicago, il', 'austin, tx',
  ]);
  const result = scoreZombie(row({ ageDays: 5 }), history);
  assert.equal(result.breakdown.cluster, 1.0);
  // Composite ≈ 0.289: cluster (0.25) + tiny age contribution (~0.039)
  assert.ok(result.composite < 0.3, `expected composite < 0.3, got ${result.composite}`);
  assert.equal(result.decision, 'full-eval');
});

// ── 5. Old + multi-region → skip ─────────────────────────────────────────
// 70d (age=1.0) + 4 locations (cluster=1.0): 0.35 + 0.25 = 0.60 ≥ 0.5 → skip

test('old (70d) + multi-region cluster → skip', () => {
  const history = historyFor('Forward Deployed Engineer', 'Scale AI', [
    'seattle, wa', 'new york, ny', 'chicago, il', 'austin, tx', 'denver, co',
  ]);
  const jd = row({
    title:    'Forward Deployed Engineer',
    company:  'Scale AI',
    ageDays:  70,
  });
  const result = scoreZombie(jd, history);
  assert.equal(result.breakdown.age, 1.0);
  assert.equal(result.breakdown.cluster, 1.0);
  assert.ok(result.composite >= 0.5, `expected composite >= 0.5, got ${result.composite}`);
  assert.equal(result.decision, 'skip');
});

// ── 6. Evergreen language in title → contributes to score ────────────────

test('evergreen keyword "rolling basis" in body → evergreen_score = 1', () => {
  const jd = row({ body: 'We hire on a rolling basis as business needs evolve.' });
  const result = scoreZombie(jd, []);
  assert.equal(result.breakdown.evergreen, 1.0);
});

// ── 7. Moderately old + evergreen + cluster → cheap-eval ────────────────
// 50d age_score: (50-45)/(60-45) = 5/15 ≈ 0.333; weight 0.35 → 0.117
// cluster (4 locs): 1.0; weight 0.25 → 0.25
// evergreen: 1.0; weight 0.10 → 0.10
// composite ≈ 0.467 → cheap-eval (0.3 ≤ c < 0.5). Just below skip.
// Crossing skip requires adding age to reach the ramp ceiling (≥60d) or
// a second evergreen + cluster combo — the threshold protects legit-stale-active roles.

test('moderately old (50d) + evergreen + cluster → cheap-eval', () => {
  const history = historyFor('Applied AI Engineer', 'Acme AI', [
    'remote', 'new york, ny', 'seattle, wa', 'chicago, il',
  ]);
  const jd = row({
    title:   'Applied AI Engineer',
    company: 'Acme AI',
    ageDays: 50,
    body:    'We continuously hire for various positions as we grow.',
  });
  const result = scoreZombie(jd, history);
  assert.ok(result.composite >= 0.3, `expected >= 0.3, got ${result.composite}`);
  assert.ok(result.composite < 0.5, `expected < 0.5, got ${result.composite}`);
  assert.equal(result.decision, 'cheap-eval');
});

// ── 8a. Old (70d) + evergreen + cluster → skip ───────────────────────────
// age(70d)=1.0 → 0.35; cluster → 0.25; evergreen → 0.10; total = 0.70 ≥ 0.5

test('old (70d) + evergreen + cluster → skip', () => {
  const history = historyFor('Applied AI Engineer', 'Acme AI', [
    'remote', 'new york, ny', 'seattle, wa', 'chicago, il',
  ]);
  const jd = row({
    title:   'Applied AI Engineer',
    company: 'Acme AI',
    ageDays: 70,
    body:    'We continuously hire for various positions as we grow.',
  });
  const result = scoreZombie(jd, history);
  assert.ok(result.composite >= 0.5, `expected >= 0.5, got ${result.composite}`);
  assert.equal(result.decision, 'skip');
});

// ── 8. Cluster below threshold (3 locations) → no cluster score ───────────

test('3 locations (below threshold) → cluster = 0', () => {
  const history = historyFor('AI Product Manager', 'Scale AI', [
    'seattle, wa', 'new york, ny', 'austin, tx',
  ]);
  const jd = row({
    title:   'AI Product Manager',
    company: 'Scale AI',
    ageDays: 10,
  });
  const result = scoreZombie(jd, history);
  assert.equal(result.breakdown.cluster, 0);
  assert.equal(result.decision, 'full-eval');
});

// ── 9. Missing ageDays → age_score = 0, doesn't crash ────────────────────

test('missing ageDays (null) → age_score = 0, no crash', () => {
  const jd = { url: 'https://example.com/1', title: 'Staff Engineer', company: 'Co', ageDays: null };
  assert.doesNotThrow(() => {
    const result = scoreZombie(jd, []);
    assert.equal(result.breakdown.age, 0);
    assert.equal(result.decision, 'full-eval');
  });
});

// ── 10. Cross-company title match is excluded from cluster ────────────────
// "Solutions Architect" at "Example Co" should not count locations from
// "Other Corp" in the cluster calculation.

test('cross-company title match is excluded from cluster count', () => {
  const history = [
    { url: 'https://other.com/1', title: 'Solutions Architect', company: 'Other Corp', location: 'nyc' },
    { url: 'https://other.com/2', title: 'Solutions Architect', company: 'Other Corp', location: 'seattle' },
    { url: 'https://other.com/3', title: 'Solutions Architect', company: 'Other Corp', location: 'chicago' },
    { url: 'https://other.com/4', title: 'Solutions Architect', company: 'Other Corp', location: 'austin' },
    { url: 'https://other.com/5', title: 'Solutions Architect', company: 'Other Corp', location: 'denver' },
  ];
  const jd = row({ title: 'Solutions Architect', company: 'Example Co', ageDays: 5 });
  const result = scoreZombie(jd, history);
  assert.equal(result.breakdown.cluster, 0);
});
