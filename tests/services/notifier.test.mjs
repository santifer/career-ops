// tests/services/notifier.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatStart, formatPhaseEnd, formatSuccess, formatFailure } from '../../services/notifier.mjs';

test('formatStart', () => {
  const s = formatStart({ runId: 42, hostname: 'jobs.acme.com' });
  assert.match(s, /🚀.*#42.*jobs\.acme\.com/);
});

test('formatPhaseEnd shows phase + elapsed', () => {
  const s = formatPhaseEnd({ runId: 42, phase: 'resume_compile_end', elapsedMs: 5_320 });
  assert.match(s, /#42/);
  assert.match(s, /resume_compile_end/);
  assert.match(s, /5\.3\s?s/);
});

test('formatSuccess includes score + total + delivery list', () => {
  const s = formatSuccess({ runId: 42, company: 'Acme', role: 'Backend Engineer', score: 92, totalMs: 412_000 });
  assert.match(s, /✅.*#42.*Acme.*Backend/);
  assert.match(s, /92\/100/);
  assert.match(s, /6m 52s|412/);  // either format acceptable
});

test('formatFailure includes phase + truncated error', () => {
  const longErr = 'x'.repeat(500);
  const s = formatFailure({ runId: 42, hostname: 'jobs.acme.com', phase: 'jd_fetch', error: longErr });
  assert.match(s, /❌.*#42.*jobs\.acme\.com/);
  assert.match(s, /jd_fetch/);
  assert.ok(s.length < 500, 'should truncate error to keep message under 500 chars');
});
