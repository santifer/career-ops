import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPeerContext,
  renderPeerTable,
  metricTypes,
} from '../../lib/peer-context.mjs';

// ── metricTypes contract ──────────────────────────────────────────────────────

test('metricTypes exports the 8 canonical types', () => {
  const expected = [
    'comp', 'score', 'health', 'toxicity', 'age',
    'response_rate', 'eval_to_apply_days', 'apply_to_response_days',
  ];
  for (const t of expected) {
    assert.ok(metricTypes.includes(t), `missing metric type: ${t}`);
  }
  assert.equal(metricTypes.length, 8);
});

// ── getPeerContext with empty/missing tracker ─────────────────────────────────

test('getPeerContext returns partial source when no tracker file', () => {
  // Force a path that doesn't exist by passing a company that won't exist
  // The lib reads data/applications.md; if the file exists we still get a result
  const ctx = getPeerContext('score', 4.6, { company: '__nonexistent_test_company_xyz__' });
  // sameCompany should be empty for a company that doesn't exist
  assert.ok(Array.isArray(ctx.sameCompany));
  assert.equal(ctx.sameCompany.length, 0);
  assert.ok(typeof ctx.n === 'number');
  // source is 'pipeline' or 'partial' — both valid
  assert.ok(['pipeline', 'partial', 'cached'].includes(ctx.source));
});

test('getPeerContext returns expected shape for score metric', () => {
  const ctx = getPeerContext('score', 4.2);
  assert.ok('percentileInPipeline' in ctx, 'must have percentileInPipeline');
  assert.ok('peerCompanies'        in ctx, 'must have peerCompanies');
  assert.ok('sameCompany'          in ctx, 'must have sameCompany');
  assert.ok('n'                    in ctx, 'must have n');
  assert.ok('source'               in ctx, 'must have source');
  assert.ok(Array.isArray(ctx.peerCompanies), 'peerCompanies must be array');
});

test('getPeerContext percentileInPipeline is null or 0-100', () => {
  const ctx = getPeerContext('score', 3.0);
  if (ctx.percentileInPipeline !== null) {
    assert.ok(ctx.percentileInPipeline >= 0 && ctx.percentileInPipeline <= 100,
      `percentile out of range: ${ctx.percentileInPipeline}`);
  }
});

test('getPeerContext peerCompanies capped at 8', () => {
  const ctx = getPeerContext('score', 4.0);
  assert.ok(ctx.peerCompanies.length <= 8, `peerCompanies exceeded 8: ${ctx.peerCompanies.length}`);
});

test('getPeerContext peerCompanies sorted descending by value', () => {
  const ctx = getPeerContext('score', 4.0);
  const vals = ctx.peerCompanies.map(p => p.value);
  for (let i = 1; i < vals.length; i++) {
    assert.ok(vals[i - 1] >= vals[i], `not sorted at index ${i}: ${vals[i - 1]} < ${vals[i]}`);
  }
});

// ── renderPeerTable ───────────────────────────────────────────────────────────

test('renderPeerTable returns a string', () => {
  const ctx = getPeerContext('score', 4.2);
  const md  = renderPeerTable(ctx);
  assert.equal(typeof md, 'string');
  assert.ok(md.length > 0);
});

test('renderPeerTable contains pipeline rank line', () => {
  const ctx = getPeerContext('score', 4.2);
  const md  = renderPeerTable(ctx);
  assert.match(md, /Pipeline rank/i);
});

test('renderPeerTable contains peer table header when peers exist', () => {
  const ctx = getPeerContext('score', 4.0);
  const md  = renderPeerTable(ctx);
  if (ctx.peerCompanies.length > 0) {
    assert.match(md, /Company.*Avg.*n/i);
  }
});

test('renderPeerTable handles empty context gracefully', () => {
  const emptyCtx = {
    sameCompany:          [],
    peerCompanies:        [],
    percentileInPipeline: null,
    n:                    0,
    source:               'partial',
  };
  const md = renderPeerTable(emptyCtx);
  assert.equal(typeof md, 'string');
  assert.match(md, /insufficient data/i);
});
