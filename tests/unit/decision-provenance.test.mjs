import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getProvenance,
  renderProvenanceCard,
} from '../../lib/decision-provenance.mjs';

// ── getProvenance shape contract ──────────────────────────────────────────────

test('getProvenance returns required shape for non-existent rowId', () => {
  const prov = getProvenance(99999, 'score');
  // All keys must be present
  assert.ok('value'         in prov, 'missing: value');
  assert.ok('computed_at'   in prov, 'missing: computed_at');
  assert.ok('inputs'        in prov, 'missing: inputs');
  assert.ok('gates_passed'  in prov, 'missing: gates_passed');
  assert.ok('gates_failed'  in prov, 'missing: gates_failed');
  assert.ok('corpus_refs'   in prov, 'missing: corpus_refs');
  assert.ok('phase_history' in prov, 'missing: phase_history');
  assert.ok('report_file'   in prov, 'missing: report_file');
  assert.ok('git_log'       in prov, 'missing: git_log');
  assert.ok('weights'       in prov, 'missing: weights');
});

test('getProvenance arrays are arrays', () => {
  const prov = getProvenance(99999, 'score');
  assert.ok(Array.isArray(prov.inputs),        'inputs must be array');
  assert.ok(Array.isArray(prov.gates_passed),  'gates_passed must be array');
  assert.ok(Array.isArray(prov.gates_failed),  'gates_failed must be array');
  assert.ok(Array.isArray(prov.corpus_refs),   'corpus_refs must be array');
  assert.ok(Array.isArray(prov.phase_history), 'phase_history must be array');
  assert.ok(Array.isArray(prov.git_log),       'git_log must be array');
});

test('getProvenance report_file is null for non-existent rowId', () => {
  const prov = getProvenance(99999, 'score');
  assert.equal(prov.report_file, null);
});

test('getProvenance weights is an object (loads from disk or returns {})', () => {
  const prov = getProvenance(99999, 'score');
  assert.ok(typeof prov.weights === 'object' && !Array.isArray(prov.weights));
});

test('getProvenance for real rowId 1 returns non-null report_file if reports exist', () => {
  // Row 1 exists in the main repo; worktree may not have it.
  // We just verify the function does not throw and returns the right shape.
  const prov = getProvenance(1, 'score');
  // report_file is either a path string or null — both valid
  assert.ok(prov.report_file === null || typeof prov.report_file === 'string');
});

// ── renderProvenanceCard ──────────────────────────────────────────────────────

test('renderProvenanceCard returns non-empty HTML string', () => {
  const prov = getProvenance(99999, 'score');
  const html = renderProvenanceCard(prov);
  assert.equal(typeof html, 'string');
  assert.ok(html.length > 50, 'card should have meaningful content');
});

test('renderProvenanceCard contains prov-card class', () => {
  const prov = getProvenance(99999, 'score');
  const html = renderProvenanceCard(prov);
  assert.match(html, /class="prov-card"/);
});

test('renderProvenanceCard uses --text-sm and --text-base tokens', () => {
  const prov = getProvenance(99999, 'score');
  const html = renderProvenanceCard(prov);
  assert.match(html, /--text-sm/,   'must reference --text-sm token');
  assert.match(html, /--text-base/, 'must reference --text-base token');
});

test('renderProvenanceCard escapes HTML entities in values', () => {
  // Craft a prov with a value containing HTML characters
  const prov = {
    value:         '<script>alert(1)</script>',
    computed_at:   '2026-05-16',
    inputs:        ['cv.md:1 & article-digest'],
    gates_passed:  [],
    gates_failed:  [],
    corpus_refs:   [],
    phase_history: [],
    report_file:   null,
    git_log:       [],
    weights:       {},
  };
  const html = renderProvenanceCard(prov);
  assert.ok(!html.includes('<script>'), 'raw <script> must not appear in output');
  assert.match(html, /&lt;script&gt;/);
});

test('renderProvenanceCard contains Inputs and Phase history details sections', () => {
  const prov = getProvenance(99999, 'score');
  const html = renderProvenanceCard(prov);
  assert.match(html, /Inputs/);
  assert.match(html, /Phase history/);
});
