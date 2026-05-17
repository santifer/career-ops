// tests/unit/funnel-completion.test.mjs
//
// Unit tests for lib/funnel-completion.mjs.
// Run with: node --test tests/unit/funnel-completion.test.mjs

import { test } from 'node:test';
import assert   from 'node:assert/strict';
import {
  detectFunnelGap,
  getApplyNowSuggestions,
  renderFunnelNudge,
  markApplied,
} from '../../lib/funnel-completion.mjs';

// ---------------------------------------------------------------------------
// detectFunnelGap
// ---------------------------------------------------------------------------

test('detectFunnelGap: returns has_gap=true when evaluated > 0 and applied = 0', () => {
  const rows = [
    { status: 'Evaluated' },
    { status: 'Evaluated' },
    { status: 'SKIP' },
  ];
  const result = detectFunnelGap(rows);
  assert.equal(result.has_gap, true);
  assert.equal(result.evaluated_count, 2);
  assert.equal(result.applied_count, 0);
});

test('detectFunnelGap: returns has_gap=false when applied > 0', () => {
  const rows = [
    { status: 'Evaluated' },
    { status: 'Applied' },
  ];
  const result = detectFunnelGap(rows);
  assert.equal(result.has_gap, false);
  assert.equal(result.applied_count, 1);
});

test('detectFunnelGap: counts Responded and Interview as active (eligible) rows', () => {
  const rows = [
    { status: 'Responded' },
    { status: 'Interview' },
  ];
  const result = detectFunnelGap(rows);
  assert.equal(result.evaluated_count, 2);
  assert.equal(result.applied_count, 0);
  assert.equal(result.has_gap, true);
});

test('detectFunnelGap: returns has_gap=false on empty array', () => {
  const result = detectFunnelGap([]);
  assert.equal(result.has_gap, false);
  assert.equal(result.evaluated_count, 0);
});

test('detectFunnelGap: returns has_gap=false when null/undefined input', () => {
  const result = detectFunnelGap(null);
  assert.equal(result.has_gap, false);
});

test('detectFunnelGap: gap_explanation is a non-empty string', () => {
  const rows = [{ status: 'Evaluated' }];
  const result = detectFunnelGap(rows);
  assert.equal(typeof result.gap_explanation, 'string');
  assert.ok(result.gap_explanation.length > 0);
});

// ---------------------------------------------------------------------------
// getApplyNowSuggestions
// ---------------------------------------------------------------------------

test('getApplyNowSuggestions: returns only rows at or above scoreThreshold', () => {
  const rows = [
    { status: 'Evaluated', score: 4.5, company: 'Anthropic', role: 'FDE', date: '2026-05-01' },
    { status: 'Evaluated', score: 3.8, company: 'Adobe',     role: 'SA',  date: '2026-05-01' },
    { status: 'Evaluated', score: 4.1, company: 'OpenAI',    role: 'DE',  date: '2026-05-01' },
  ];
  const result = getApplyNowSuggestions(rows, { scoreThreshold: 4.0 });
  assert.equal(result.promote_to_applied.length, 2);
  assert.ok(result.promote_to_applied.every(r => r.score >= 4.0));
});

test('getApplyNowSuggestions: respects maxSuggestions cap', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    status: 'Evaluated',
    score: 4.5,
    company: `Company${i}`,
    role: 'Role',
    date: '2026-05-01',
  }));
  const result = getApplyNowSuggestions(rows, { maxSuggestions: 5 });
  assert.ok(result.promote_to_applied.length <= 5);
});

test('getApplyNowSuggestions: Applied rows are never surfaced for promotion', () => {
  const rows = [
    { status: 'Applied',   score: 4.9, company: 'Google', role: 'SA',  date: '2026-05-01' },
    { status: 'Evaluated', score: 4.1, company: 'OpenAI', role: 'AE',  date: '2026-05-01' },
  ];
  const result = getApplyNowSuggestions(rows, { scoreThreshold: 4.0 });
  assert.ok(result.promote_to_applied.every(r => r.company !== 'Google'));
  assert.equal(result.promote_to_applied.length, 1);
});

test('getApplyNowSuggestions: stale_evaluated captures rows older than staleAfterDays', () => {
  const fixedNow = new Date('2026-05-17');
  const rows = [
    { status: 'Evaluated', score: 3.5, company: 'OldCo', role: 'Dev', date: '2026-04-01' }, // 46 days
    { status: 'Evaluated', score: 3.5, company: 'NewCo', role: 'Dev', date: '2026-05-15' }, // 2 days
  ];
  const result = getApplyNowSuggestions(rows, { staleAfterDays: 21, currentDate: fixedNow });
  assert.equal(result.stale_evaluated.length, 1);
  assert.equal(result.stale_evaluated[0].company, 'OldCo');
});

test('getApplyNowSuggestions: gap_action is non-empty string when promotable rows exist', () => {
  const rows = [
    { status: 'Evaluated', score: 4.5, company: 'BigCo', role: 'PM', date: '2026-05-10' },
  ];
  const result = getApplyNowSuggestions(rows, { scoreThreshold: 4.0 });
  assert.equal(typeof result.gap_action, 'string');
  assert.ok(result.gap_action.length > 0);
});

test('getApplyNowSuggestions: returns empty lists for empty input', () => {
  const result = getApplyNowSuggestions([]);
  assert.deepEqual(result.promote_to_applied, []);
  assert.deepEqual(result.stale_evaluated, []);
});

// ---------------------------------------------------------------------------
// renderFunnelNudge
// ---------------------------------------------------------------------------

test('renderFunnelNudge: returns empty string when has_gap=false', () => {
  const html = renderFunnelNudge({ has_gap: false });
  assert.equal(html, '');
});

test('renderFunnelNudge: returns non-empty string when has_gap=true', () => {
  const html = renderFunnelNudge({
    has_gap: true,
    evaluated_count: 137,
    applied_count: 0,
    gap_explanation: '137 evaluations and 0 marked Applied.',
    recommendation: 'Mark rows as Applied after submission.',
  });
  assert.ok(html.length > 0);
  assert.ok(html.includes('funnel-nudge'));
  assert.ok(html.includes('137'));
});

test('renderFunnelNudge: HTML contains localStorage dismiss logic', () => {
  const html = renderFunnelNudge({
    has_gap: true,
    evaluated_count: 5,
    applied_count: 0,
    gap_explanation: 'test',
    recommendation: '',
  });
  assert.ok(html.includes('careerops.funnel-nudge-dismissed'));
  assert.ok(html.includes('localStorage'));
});

test('renderFunnelNudge: returns empty string for null input', () => {
  assert.equal(renderFunnelNudge(null), '');
  assert.equal(renderFunnelNudge(undefined), '');
});

// ---------------------------------------------------------------------------
// markApplied
// ---------------------------------------------------------------------------

test('markApplied: returns valid payload for a fresh row', () => {
  const result = markApplied(42, { appliedDate: '2026-05-17' });
  assert.equal(result.row_id, 42);
  assert.equal(result.patch.status, 'Applied');
  assert.equal(result.patch.applied_date, '2026-05-17');
  assert.equal(result.validation.ok, true);
});

test('markApplied: validation fails for invalid rowId', () => {
  const result = markApplied('abc');
  assert.equal(result.validation.ok, false);
  assert.ok(result.validation.reason.length > 0);
});

test('markApplied: notes_append includes the date', () => {
  const result = markApplied(100, { appliedDate: '2026-05-17', note: 'via LinkedIn' });
  assert.ok(result.patch.notes_append.includes('2026-05-17'));
  assert.ok(result.patch.notes_append.includes('via LinkedIn'));
});

test('markApplied: rejects update when row is already Applied', () => {
  const row = { num: 7, status: 'Applied', date: '2026-05-01', company: 'X', role: 'Y' };
  const result = markApplied(7, { existingRow: row });
  assert.equal(result.validation.ok, false);
  assert.ok(result.validation.reason.includes('already has status'));
});

test('markApplied: defaults appliedDate to today (ISO format)', () => {
  const result = markApplied(99);
  assert.ok(result.patch.applied_date.match(/^\d{4}-\d{2}-\d{2}$/), 'applied_date should be YYYY-MM-DD');
  assert.equal(result.validation.ok, true);
});
