// tests/unit/staleness-nudge.test.mjs
//
// Unit tests for lib/staleness-nudge.mjs.
// Run with: node --test tests/unit/staleness-nudge.test.mjs

import { test } from 'node:test';
import assert   from 'node:assert/strict';
import {
  scoreStaleness,
  getStaleRows,
  renderStalenessBadge,
} from '../../lib/staleness-nudge.mjs';

// Fixed reference date for deterministic tests
const NOW = new Date('2026-05-17T12:00:00Z');

// ---------------------------------------------------------------------------
// scoreStaleness — tier boundaries
// ---------------------------------------------------------------------------

test('scoreStaleness: 0 days → fresh', () => {
  const r = scoreStaleness({ evalDate: '2026-05-17', status: 'Evaluated', currentDate: NOW });
  assert.equal(r.urgency_tier, 'fresh');
  assert.equal(r.days_since_eval, 0);
});

test('scoreStaleness: 7 days → fresh (boundary)', () => {
  const r = scoreStaleness({ evalDate: '2026-05-10', status: 'Evaluated', currentDate: NOW });
  assert.equal(r.urgency_tier, 'fresh');
  assert.equal(r.days_since_eval, 7);
});

test('scoreStaleness: 8 days → cooling', () => {
  const r = scoreStaleness({ evalDate: '2026-05-09', status: 'Evaluated', currentDate: NOW });
  assert.equal(r.urgency_tier, 'cooling');
  assert.equal(r.days_since_eval, 8);
});

test('scoreStaleness: 14 days → cooling (boundary)', () => {
  const r = scoreStaleness({ evalDate: '2026-05-03', status: 'Evaluated', currentDate: NOW });
  assert.equal(r.urgency_tier, 'cooling');
  assert.equal(r.days_since_eval, 14);
});

test('scoreStaleness: 15 days → stale', () => {
  const r = scoreStaleness({ evalDate: '2026-05-02', status: 'Evaluated', currentDate: NOW });
  assert.equal(r.urgency_tier, 'stale');
  assert.equal(r.days_since_eval, 15);
});

test('scoreStaleness: 28 days → stale (boundary)', () => {
  const r = scoreStaleness({ evalDate: '2026-04-19', status: 'Evaluated', currentDate: NOW });
  assert.equal(r.urgency_tier, 'stale');
  assert.equal(r.days_since_eval, 28);
});

test('scoreStaleness: 29 days → expired', () => {
  const r = scoreStaleness({ evalDate: '2026-04-18', status: 'Evaluated', currentDate: NOW });
  assert.equal(r.urgency_tier, 'expired');
  assert.ok(r.days_since_eval >= 29);
});

test('scoreStaleness: Applied status → n/a (never stale)', () => {
  const r = scoreStaleness({ evalDate: '2026-01-01', status: 'Applied', currentDate: NOW });
  assert.equal(r.urgency_tier, 'n/a');
  assert.equal(r.days_since_eval, null);
  assert.equal(r.recommended_action, '');
});

test('scoreStaleness: Discarded status → n/a (never stale)', () => {
  const r = scoreStaleness({ evalDate: '2026-01-01', status: 'Discarded', currentDate: NOW });
  assert.equal(r.urgency_tier, 'n/a');
});

test('scoreStaleness: SKIP status → n/a (never stale)', () => {
  const r = scoreStaleness({ evalDate: '2026-01-01', status: 'SKIP', currentDate: NOW });
  assert.equal(r.urgency_tier, 'n/a');
});

test('scoreStaleness: Responded status IS eligible for staleness', () => {
  const r = scoreStaleness({ evalDate: '2026-04-01', status: 'Responded', currentDate: NOW });
  assert.ok(r.urgency_tier !== 'n/a');
  assert.ok(r.days_since_eval !== null);
});

test('scoreStaleness: hours_until_next_tier is 0 for expired', () => {
  const r = scoreStaleness({ evalDate: '2026-01-01', status: 'Evaluated', currentDate: NOW });
  assert.equal(r.urgency_tier, 'expired');
  assert.equal(r.hours_until_next_tier, 0);
});

test('scoreStaleness: recommended_action is a non-empty string for active rows', () => {
  const r = scoreStaleness({ evalDate: '2026-05-10', status: 'Evaluated', currentDate: NOW });
  assert.equal(typeof r.recommended_action, 'string');
  assert.ok(r.recommended_action.length > 0);
});

test('scoreStaleness: missing evalDate returns fresh tier with fallback message', () => {
  const r = scoreStaleness({ evalDate: '', status: 'Evaluated', currentDate: NOW });
  assert.equal(r.urgency_tier, 'fresh');
  assert.equal(r.days_since_eval, null);
  assert.ok(r.recommended_action.length > 0);
});

// ---------------------------------------------------------------------------
// getStaleRows
// ---------------------------------------------------------------------------

test('getStaleRows: returns only cooling+ rows by default', () => {
  const rows = [
    { num: 1, status: 'Evaluated', date: '2026-05-17', score: 4.0, company: 'A', role: 'R' }, // fresh
    { num: 2, status: 'Evaluated', date: '2026-05-05', score: 4.0, company: 'B', role: 'R' }, // 12d → cooling
    { num: 3, status: 'Evaluated', date: '2026-04-01', score: 4.0, company: 'C', role: 'R' }, // expired
  ];
  const result = getStaleRows(rows, { currentDate: NOW });
  assert.ok(result.length >= 1);
  assert.ok(result.every(r => r.staleness.urgency_tier !== 'fresh'));
  assert.ok(result.every(r => r.staleness.urgency_tier !== 'n/a'));
});

test('getStaleRows: Applied rows are excluded', () => {
  const rows = [
    { num: 1, status: 'Applied',   date: '2026-01-01', score: 4.5, company: 'A', role: 'R' },
    { num: 2, status: 'Evaluated', date: '2026-05-05', score: 4.0, company: 'B', role: 'R' },
  ];
  const result = getStaleRows(rows, { currentDate: NOW });
  assert.ok(result.every(r => r.company !== 'A'));
});

test('getStaleRows: respects maxRows cap', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({
    num: i, status: 'Evaluated', date: '2026-04-01', score: 4.0,
    company: `Co${i}`, role: 'R',
  }));
  const result = getStaleRows(rows, { currentDate: NOW, maxRows: 5 });
  assert.ok(result.length <= 5);
});

test('getStaleRows: result items have .staleness property', () => {
  const rows = [
    { num: 1, status: 'Evaluated', date: '2026-05-05', score: 4.0, company: 'X', role: 'R' },
  ];
  const result = getStaleRows(rows, { currentDate: NOW });
  if (result.length > 0) {
    assert.ok('staleness' in result[0]);
    assert.ok('urgency_tier' in result[0].staleness);
    assert.ok('days_since_eval' in result[0].staleness);
  }
});

test('getStaleRows: returns empty array for empty input', () => {
  assert.deepEqual(getStaleRows([], { currentDate: NOW }), []);
});

test('getStaleRows: returns empty array for non-array input', () => {
  assert.deepEqual(getStaleRows(null), []);
});

// ---------------------------------------------------------------------------
// renderStalenessBadge
// ---------------------------------------------------------------------------

test('renderStalenessBadge: returns empty string for n/a tier', () => {
  const badge = renderStalenessBadge({ urgency_tier: 'n/a', days_since_eval: null, recommended_action: '' });
  assert.equal(badge, '');
});

test('renderStalenessBadge: returns empty string for null input', () => {
  assert.equal(renderStalenessBadge(null), '');
  assert.equal(renderStalenessBadge(undefined), '');
});

test('renderStalenessBadge: fresh tier badge contains "Fresh"', () => {
  const badge = renderStalenessBadge({ urgency_tier: 'fresh', days_since_eval: 3, recommended_action: 'Apply!' });
  assert.ok(badge.includes('Fresh'));
  assert.ok(badge.includes('3d'));
});

test('renderStalenessBadge: cooling badge has correct tier class', () => {
  const badge = renderStalenessBadge({ urgency_tier: 'cooling', days_since_eval: 10, recommended_action: 'Act soon' });
  assert.ok(badge.includes('staleness-cooling'));
  assert.ok(badge.includes('Cooling'));
});

test('renderStalenessBadge: stale badge renders with red styling', () => {
  const badge = renderStalenessBadge({ urgency_tier: 'stale', days_since_eval: 20, recommended_action: 'Stale!' });
  assert.ok(badge.includes('staleness-stale'));
  assert.ok(badge.includes('Stale'));
});

test('renderStalenessBadge: expired badge renders with darkest styling', () => {
  const badge = renderStalenessBadge({ urgency_tier: 'expired', days_since_eval: 40, recommended_action: 'Too late' });
  assert.ok(badge.includes('staleness-expired'));
  assert.ok(badge.includes('Expired'));
});

test('renderStalenessBadge: recommended_action appears in title attribute (escaped)', () => {
  const action = 'Apply within 7d or it goes stale. "now"';
  const badge = renderStalenessBadge({
    urgency_tier: 'cooling',
    days_since_eval: 9,
    recommended_action: action,
  });
  assert.ok(badge.includes('title='));
  // The double-quote should be escaped as &quot;
  assert.ok(badge.includes('&quot;'));
});

test('renderStalenessBadge: days_since_eval=null shows ? placeholder', () => {
  const badge = renderStalenessBadge({ urgency_tier: 'stale', days_since_eval: null, recommended_action: '' });
  assert.ok(badge.includes('?d'));
});
