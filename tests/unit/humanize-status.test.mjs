import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  humanizeTrackerNote,
  humanizeScoreDelta,
  humanizeGateResult,
  humanizeDecision,
  humanizeLabel,
  humanizeButton,
  humanizeMessage,
  expandJargon,
  gradeLevel,
} from '../../lib/humanize-status.mjs';

// ── humanizeScoreDelta ────────────────────────────────────────────────────────

test('humanizeScoreDelta reports no-change when delta < 0.005', () => {
  const out = humanizeScoreDelta(4.6, 4.6);
  assert.match(out, /held at 4\.6/);
  assert.match(out, /no change/);
});

test('humanizeScoreDelta reports improvement correctly', () => {
  const out = humanizeScoreDelta(3.85, 4.2);
  assert.match(out, /improved/);
  assert.match(out, /3\.9.*4\.2|3\.85.*4\.2/);  // formatted to 1dp
});

test('humanizeScoreDelta labels major boost for >= 0.5 delta', () => {
  const out = humanizeScoreDelta(2.5, 4.3);
  assert.match(out, /major boost/i);
});

test('humanizeScoreDelta reports decline correctly', () => {
  const out = humanizeScoreDelta(4.3, 2.5);
  assert.match(out, /declined/i);
  assert.match(out, /major drop/i);
});

// ── humanizeGateResult ────────────────────────────────────────────────────────

test('humanizeGateResult all-clear with gate count', () => {
  const out = humanizeGateResult({ passed: 6, failed: [], soft: [] });
  assert.match(out, /All 6 gates? clear/);
});

test('humanizeGateResult surfaces hard failures', () => {
  const out = humanizeGateResult({ passed: 0, failed: ['H1', 'H2'], soft: [] });
  assert.match(out, /H1.*H2|H2.*H1/);
  assert.match(out, /blocked/i);
});

test('humanizeGateResult surfaces soft gap alongside clear gates', () => {
  const out = humanizeGateResult({ passed: 6, failed: [], soft: ['external dev-media network'] });
  assert.match(out, /All 6 gates? clear/);
  assert.match(out, /soft gap/i);
  assert.match(out, /dev-media/);
});

test('humanizeGateResult handles mixed hard + soft', () => {
  const out = humanizeGateResult({ passed: 2, failed: ['H3'], soft: ['media reach'] });
  assert.match(out, /H3/);
  assert.match(out, /media reach/);
});

// ── humanizeDecision ──────────────────────────────────────────────────────────

test('humanizeDecision maps APPLY to imperative register', () => {
  const { label, register } = humanizeDecision('APPLY');
  assert.equal(register, 'imperative');
  assert.match(label, /apply/i);
});

test('humanizeDecision maps SKIP to cautionary register', () => {
  const { register } = humanizeDecision('SKIP');
  assert.equal(register, 'cautionary');
});

test('humanizeDecision maps DEFER to recommended register', () => {
  const { register } = humanizeDecision('DEFER');
  assert.equal(register, 'recommended');
});

test('humanizeDecision handles null/undefined gracefully', () => {
  const { label } = humanizeDecision(null);
  assert.ok(label.length > 0);
});

// ── humanizeTrackerNote (integration) ─────────────────────────────────────────

test('humanizeTrackerNote parses the canonical Phase E example', () => {
  const raw = 'Re-evaluated 2026-05-16 (Phase E): score improved from 4.6 to 4.6 (+0.00) (Δ0) · No blocking gates triggered · Decision: Apply';
  const out = humanizeTrackerNote(raw);

  assert.equal(out.indicator, 'green', 'green indicator for Apply at 4.6');
  assert.match(out.headline, /apply/i);
  assert.equal(out.date, '2026-05-16');
  assert.ok(Array.isArray(out.lines), 'lines must be array');
  // Score line should be present
  assert.ok(out.lines.some(l => /held|4\.6/.test(l)), `expected score line, got: ${JSON.stringify(out.lines)}`);
});

test('humanizeTrackerNote parses GATES: [H1,H2] fired pattern', () => {
  const raw = 'RE-EVAL 2026-05-16 (Phase E): 4.3/5→2.5/5 (Δ-1.8) · GATES: [H1, H2, H3, H4] fired → SKIP · Decision: SKIP';
  const out = humanizeTrackerNote(raw);

  assert.equal(out.indicator, 'red');
  assert.match(out.headline, /skip/i);
  assert.ok(out.lines.some(l => /H1/.test(l) || /gate/i.test(l)));
});

test('humanizeTrackerNote returns gray for empty input', () => {
  const out = humanizeTrackerNote('');
  assert.equal(out.indicator, 'gray');
  assert.equal(out.date, undefined);
});

test('humanizeTrackerNote picks up simple re-eval note format', () => {
  const raw = 'Re-eval 2026-05-17 (4.1→4.23). Council 3/3 agreement, HIGH confidence.';
  const out = humanizeTrackerNote(raw);
  assert.equal(out.date, '2026-05-17');
  assert.ok(out.lines.some(l => /4\.1.*4\.23|improved/i.test(l)));
});

// ── humanizeLabel ─────────────────────────────────────────────────────────────

test('humanizeLabel rewrites WHAT FITS to plain English', () => {
  assert.equal(humanizeLabel('WHAT FITS'), 'What matches your background');
});

test("humanizeLabel rewrites WHAT'S MISSING to plain English", () => {
  assert.equal(humanizeLabel("WHAT'S MISSING"), 'Gaps to address');
});

test('humanizeLabel rewrites HM-noticing chance', () => {
  assert.equal(humanizeLabel('HM-noticing chance'), 'Chance a hiring manager will see you');
});

test('humanizeLabel returns unknown labels unchanged', () => {
  assert.equal(humanizeLabel('My custom label'), 'My custom label');
});

// ── humanizeButton ────────────────────────────────────────────────────────────

test('humanizeButton rewrites Apply to Apply now', () => {
  assert.equal(humanizeButton('Apply'), 'Apply now');
});

test('humanizeButton rewrites Skip to Skip this one', () => {
  assert.equal(humanizeButton('Skip'), 'Skip this one');
});

test('humanizeButton rewrites Create materials to Generate apply pack', () => {
  assert.equal(humanizeButton('Create materials'), 'Generate apply pack');
});

test('humanizeButton rewrites Mark Applied to I applied', () => {
  assert.equal(humanizeButton('Mark Applied'), 'I applied');
});

// ── humanizeMessage ───────────────────────────────────────────────────────────

test('humanizeMessage rewrites No recommendation captured', () => {
  const out = humanizeMessage('No recommendation captured.');
  assert.match(out, /No strategy yet/i);
});

test('humanizeMessage rewrites scaffold only', () => {
  assert.match(humanizeMessage('scaffold only'), /Placeholder/i);
});

// ── expandJargon ──────────────────────────────────────────────────────────────

test('expandJargon returns plain displayed text for A2 PgM', () => {
  const { displayed, tooltip } = expandJargon('A2 PgM');
  assert.equal(displayed, 'AI Program Manager');
  assert.ok(tooltip.length > 0);
});

test('expandJargon returns the original term as displayed for unknown terms', () => {
  const { displayed } = expandJargon('some-unknown-key');
  assert.equal(displayed, 'some-unknown-key');
});

// ── gradeLevel ────────────────────────────────────────────────────────────────

test('gradeLevel returns a number between 0 and 20', () => {
  const g = gradeLevel('The quick brown fox jumps over the lazy dog. Simple sentence here.');
  assert.ok(typeof g === 'number');
  assert.ok(g >= 0 && g <= 20);
});

test('gradeLevel returns 0 for empty string', () => {
  assert.equal(gradeLevel(''), 0);
});

test('gradeLevel scores complex jargon higher than plain text', () => {
  const jargon = 'Leverage synergistic cross-functional paradigmatic orchestration methodologies utilizing transformational competencies.';
  const plain  = 'Do your best work. Ask questions. Get things done.';
  const jargonGrade = gradeLevel(jargon);
  const plainGrade  = gradeLevel(plain);
  assert.ok(jargonGrade > plainGrade, `Expected jargon (${jargonGrade}) > plain (${plainGrade})`);
});
