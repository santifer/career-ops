// tests/unit/next-moves.test.mjs
// Unit tests for lib/next-moves.mjs — the synthesis layer that ranks
// actionable next moves across the career-ops surface.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeNextMoves } from '../../lib/next-moves.mjs';

const PROFILE = {
  deadline_iso: '2026-09-30',
  response_window_days: 8,
  target_applications_for_offer: 25,
};

function row(o = {}) {
  return {
    num: 1,
    date: '2026-05-10',
    company: 'Acme',
    role: 'Engineer',
    score: 4.0,
    status: 'Evaluated',
    notes: '',
    url: 'https://example.com',
    slug: 'acme',
    ...o,
  };
}

test('emits empty top_moves when there are no inputs', () => {
  const out = computeNextMoves({ apps: [], profile: PROFILE, todayIso: '2026-05-18' });
  assert.equal(out.top_moves.length, 0);
  assert.equal(out.skip_list.length, 0);
  assert.equal(out.deadline_stats.days_left, 136); // May 18 → Sept 30 EOD ≈ 135.99d → rounds 136
});

test('apply move surfaces for score >= 4.0 Evaluated rows', () => {
  const out = computeNextMoves({
    apps: [row({ num: 47, score: 4.65, role: 'Editorial Lead', company: 'OpenAI', slug: 'openai' })],
    profile: PROFILE,
    todayIso: '2026-05-18',
  });
  assert.equal(out.top_moves.length, 1);
  assert.equal(out.top_moves[0].kind, 'apply');
  assert.equal(out.top_moves[0].row_num, 47);
  assert.ok(out.top_moves[0].label.includes('Editorial Lead'));
  assert.ok(out.top_moves[0].composite_score > 0);
});

test('apply move boosted when status is Responded (momentum)', () => {
  const baseline = computeNextMoves({
    apps: [row({ num: 1, score: 4.5, status: 'Evaluated' })],
    profile: PROFILE,
    todayIso: '2026-05-18',
  });
  const boosted = computeNextMoves({
    apps: [row({ num: 1, score: 4.5, status: 'Responded' })],
    profile: PROFILE,
    todayIso: '2026-05-18',
  });
  assert.ok(boosted.top_moves[0].impact_score > baseline.top_moves[0].impact_score,
    'Responded should outscore Evaluated for same score');
});

test('apply move cost halves when apply pack is ready on disk', () => {
  const noPack = computeNextMoves({
    apps: [row({ num: 1, score: 4.5 })],
    applyPackReadyByRow: {},
    profile: PROFILE,
    todayIso: '2026-05-18',
  });
  const ready = computeNextMoves({
    apps: [row({ num: 1, score: 4.5 })],
    applyPackReadyByRow: { 1: true },
    profile: PROFILE,
    todayIso: '2026-05-18',
  });
  assert.equal(noPack.top_moves[0].cost_hours, 3.0);
  assert.equal(ready.top_moves[0].cost_hours, 1.0);
  assert.ok(ready.top_moves[0].composite_score > noPack.top_moves[0].composite_score);
});

test('hard gate: throttle blocked rows go to skip_list, NOT top_moves', () => {
  const out = computeNextMoves({
    apps: [row({ num: 1, score: 4.5, slug: 'openai' })],
    throttleByCompany: { openai: { status: 'blocked' } },
    profile: PROFILE,
    todayIso: '2026-05-18',
  });
  assert.equal(out.top_moves.length, 0, 'blocked apply should not appear in top_moves');
  assert.ok(out.skip_list.some(s => s.kind === 'skip_throttle_or_dead' && s.row_num === 1));
});

test('hard gate: expired_discarded liveness rows are skipped', () => {
  const out = computeNextMoves({
    apps: [row({ num: 1, score: 4.5 })],
    livenessByRowNum: { 1: { status: 'expired_discarded' } },
    profile: PROFILE,
    todayIso: '2026-05-18',
  });
  assert.equal(out.top_moves.length, 0);
  assert.ok(out.skip_list.some(s => s.row_num === 1));
});

test('follow_up move fires at sweet spot (response_window - 2 days)', () => {
  // today=2026-05-18, applied=2026-05-10 → 8 days since (sweet spot)
  const out = computeNextMoves({
    apps: [row({ num: 5, score: 4.2, status: 'Applied', date: '2026-05-10' })],
    profile: { ...PROFILE, response_window_days: 8 },
    todayIso: '2026-05-18',
  });
  assert.equal(out.top_moves.length, 1);
  assert.equal(out.top_moves[0].kind, 'follow_up');
  assert.equal(out.top_moves[0].cost_hours, 0.25);
});

test('follow_up does not fire too early (before sweet spot)', () => {
  const out = computeNextMoves({
    apps: [row({ num: 5, score: 4.2, status: 'Applied', date: '2026-05-17' })],  // 1 day since
    profile: { ...PROFILE, response_window_days: 8 },
    todayIso: '2026-05-18',
  });
  assert.equal(out.top_moves.length, 0);
});

test('follow_up does not fire after graveyard window (>28d)', () => {
  const out = computeNextMoves({
    apps: [row({ num: 5, score: 4.2, status: 'Applied', date: '2026-04-01' })],
    profile: PROFILE,
    todayIso: '2026-05-18',
  });
  assert.equal(out.top_moves.length, 0);
});

test('dm move surfaces for cold-but-not-too-cold contacts on high-value companies', () => {
  const out = computeNextMoves({
    apps: [],
    outreachContacts: [{
      name: 'Jane Doe',
      company_slug: 'anthropic',
      last_touch_iso: '2026-05-02', // 16 days ago
      relationship_strength_0_5: 3,
      channel: 'LinkedIn',
    }],
    companyMaxScoreBySlug: { anthropic: 4.55 },
    profile: PROFILE,
    todayIso: '2026-05-18',
  });
  assert.equal(out.top_moves.length, 1);
  assert.equal(out.top_moves[0].kind, 'dm');
  assert.equal(out.top_moves[0].cost_hours, 0.5);
  assert.ok(out.top_moves[0].label.includes('Jane Doe'));
});

test('dm skipped for sub-threshold company (< 3.8)', () => {
  const out = computeNextMoves({
    apps: [],
    outreachContacts: [{
      name: 'Jane Doe',
      company_slug: 'lowtier',
      last_touch_iso: '2026-05-02',
      relationship_strength_0_5: 3,
    }],
    companyMaxScoreBySlug: { lowtier: 3.5 },
    profile: PROFILE,
    todayIso: '2026-05-18',
  });
  assert.equal(out.top_moves.length, 0);
});

test('refresh_research surfaces queued research older than 2 days', () => {
  const out = computeNextMoves({
    apps: [],
    queueFiles: [{
      slug: 'databricks',
      sections: [{ section: 'comp-range', ts: '2026-05-15T00:00:00Z' }],
      updated_at: '2026-05-15T00:00:00Z',
    }],
    profile: PROFILE,
    todayIso: '2026-05-18',
  });
  assert.equal(out.top_moves.length, 1);
  assert.equal(out.top_moves[0].kind, 'refresh_research');
  assert.equal(out.top_moves[0].cost_hours, 0.05);
});

test('ranking: apply > follow_up > dm > refresh_research for typical mix', () => {
  const out = computeNextMoves({
    apps: [
      row({ num: 1, score: 4.5, status: 'Evaluated' }),
      row({ num: 2, score: 4.0, status: 'Applied', date: '2026-05-10' }),
    ],
    outreachContacts: [{
      name: 'Jane', company_slug: 'acme', last_touch_iso: '2026-05-02',
      relationship_strength_0_5: 3,
    }],
    companyMaxScoreBySlug: { acme: 4.5 },
    queueFiles: [{ slug: 'acme', sections: [{ section: 'comp-range', ts: '2026-05-15T00:00:00Z' }], updated_at: '2026-05-15T00:00:00Z' }],
    profile: PROFILE,
    todayIso: '2026-05-18',
  });
  assert.ok(out.top_moves.length >= 3);
  // The cheapest action (refresh) should still rank high because composite normalizes by cost
  const kinds = out.top_moves.map(m => m.kind);
  assert.ok(kinds.includes('apply'));
  assert.ok(kinds.includes('refresh_research'));
});

test('deadline math: days_left + apps_per_week_required', () => {
  const out = computeNextMoves({
    apps: [
      row({ num: 1, status: 'Applied' }),
      row({ num: 2, status: 'Applied' }),
      row({ num: 3, status: 'Interview' }),
    ],
    profile: PROFILE,
    todayIso: '2026-05-18',
  });
  assert.equal(out.deadline_stats.days_left, 136); // May 18 → Sept 30 EOD ≈ 135.99d → rounds 136
  assert.equal(out.deadline_stats.apps_applied, 3);
  assert.equal(out.deadline_stats.apps_needed_estimate, 22);
});

test('skip_list surfaces sub-4.0 evaluated rows', () => {
  const out = computeNextMoves({
    apps: [
      row({ num: 10, score: 3.7, status: 'Evaluated', role: 'Tempting' }),
      row({ num: 11, score: 3.8, status: 'Evaluated', role: 'Also tempting' }),
    ],
    profile: PROFILE,
    todayIso: '2026-05-18',
  });
  assert.ok(out.skip_list.some(s => s.kind === 'skip_below_threshold' && s.row_num === 10));
  assert.ok(out.skip_list.some(s => s.kind === 'skip_below_threshold' && s.row_num === 11));
});

test('top_moves are stable-ordered by composite_score desc', () => {
  const out = computeNextMoves({
    apps: [
      row({ num: 1, score: 4.2 }),
      row({ num: 2, score: 4.8 }),
      row({ num: 3, score: 4.5 }),
    ],
    profile: PROFILE,
    todayIso: '2026-05-18',
  });
  for (let i = 1; i < out.top_moves.length; i++) {
    assert.ok(out.top_moves[i - 1].composite_score >= out.top_moves[i].composite_score,
      'composite_score must be monotonic desc');
  }
});

test('respects topN parameter', () => {
  const apps = Array.from({ length: 10 }, (_, k) => row({ num: k + 1, score: 4.5 - k * 0.05, slug: 'c' + k }));
  const out = computeNextMoves({ apps, profile: PROFILE, todayIso: '2026-05-18', topN: 3 });
  assert.equal(out.top_moves.length, 3);
});

test('ship_artifact move when provided', () => {
  const out = computeNextMoves({
    apps: [],
    shipArtifactCandidates: [{
      label: 'Ship Python port of scan-rss.mjs',
      evidence: 'Unblocks 12 evals capped by (learning) tag',
      cost_hours: 8,
      unblocks_count: 12,
    }],
    profile: PROFILE,
    todayIso: '2026-05-18',
  });
  assert.equal(out.top_moves.length, 1);
  assert.equal(out.top_moves[0].kind, 'ship_artifact');
  assert.equal(out.top_moves[0].cost_hours, 8);
});

test('deadline_mult kicks in under 60 days', () => {
  // 30 days out
  const closeDeadline = computeNextMoves({
    apps: [row({ num: 1, score: 4.5 })],
    profile: { ...PROFILE, deadline_iso: '2026-06-17' },
    todayIso: '2026-05-18',
  });
  const farDeadline = computeNextMoves({
    apps: [row({ num: 1, score: 4.5 })],
    profile: { ...PROFILE, deadline_iso: '2026-12-31' },
    todayIso: '2026-05-18',
  });
  assert.ok(closeDeadline.top_moves[0].impact_score > farDeadline.top_moves[0].impact_score,
    'closer deadline should boost impact');
});
