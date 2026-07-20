/**
 * context-budget.test.mjs — Unit tests for lib/context-budget.mjs
 *
 * Tests:
 *   1. estimateTokens — basic estimation, edge cases
 *   2. compressSharedContext — P0 preservation, P2 removal, priority ordering
 *   3. buildBudgetedPrompt — under budget (no-op), over budget (compress),
 *      noCompress flag
 *   4. Edge cases — empty input, missing optional fields
 *
 * Run: node lib/context-budget.test.mjs
 */

import { estimateTokens, compressSharedContext, buildBudgetedPrompt } from './context-budget.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function ok(label, cond) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL: ${label}`);
  }
}

function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL: ${label}`);
    console.log(`    expected: ${e}`);
    console.log(`    actual:   ${a}`);
  }
}

// ---------------------------------------------------------------------------
// Helper: build a minimal _shared.md stub with known sections
// ---------------------------------------------------------------------------
function makeSharedContent(sections) {
  // sections: { name, body }[]
  const parts = ['<!-- preamble comment -->\n'];
  for (const s of sections) {
    parts.push(`\n## ${s.name}\n\n${s.body || 'Content for ' + s.name + '.'}\n`);
  }
  return parts.join('');
}

// Pre-built shared stubs for common test scenarios
const SHARED_STUB = makeSharedContent([
  { name: 'Sources of Truth (EXCLUSIVE)', body: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5' },
  { name: 'Scoring System', body: 'Score from 1-5 with weighted dimensions.' },
  { name: 'Archetype Detection', body: 'Classify into AI Platform, Agentic, etc.' },
  { name: 'Global Rules', body: 'NEVER: invent experience. ALWAYS: read cv.md.' },
  { name: 'Voice DNA (writing guardrail)', body: 'Anti-AI-slop guardrail. Tier 1 and Tier 2 rules. Longer body to add tokens for testing compression triggers.\n'.repeat(20) },
  { name: 'Writing Style Calibration', body: 'Extract tone, structure, vocabulary. Also fairly long to ensure token counts are high.\n'.repeat(20) },
]);

// ============================================================================
// 1. estimateTokens
// ============================================================================
console.log('\n--- 1. estimateTokens ---');

eq('empty string → 0', estimateTokens(''), 0);
eq('non-string (number) → 0', estimateTokens(123), 0);
eq('non-string (null) → 0', estimateTokens(null), 0);
eq('non-string (undefined) → 0', estimateTokens(undefined), 0);

// "hello world" = 11 chars → 11/4 = 2.75 → ceil = 3
eq('"hello world" → 3', estimateTokens('hello world'), 3);

// 100-char string → 25 tokens
const chars100 = 'a'.repeat(100);
eq('100 chars → 25', estimateTokens(chars100), 25);

// Whitespace collapsing: "a    b" collapses to "a b" (3 effective chars) → same as "a b"
eq('whitespace collapsed: multiple spaces = single space', estimateTokens('a    b'), estimateTokens('a b'));
// Newlines also collapse
eq('whitespace collapsed: newlines = spaces', estimateTokens('a\n\nb'), estimateTokens('a b'));

// Long text: 4000 chars → 1000 tokens
const chars4000 = 'x'.repeat(4000);
eq('4000 chars → 1000', estimateTokens(chars4000), 1000);

// ============================================================================
// 2. compressSharedContext — P0 preservation
// ============================================================================
console.log('\n--- 2. compressSharedContext — P0 preservation ---');

const p0Result = compressSharedContext(SHARED_STUB, 9999);
ok('P0 sections preserved: Scoring System', p0Result.compressed.includes('## Scoring System'));
ok('P0 sections preserved: Archetype Detection', p0Result.compressed.includes('## Archetype Detection'));
ok('P0 sections preserved: Global Rules', p0Result.compressed.includes('## Global Rules'));

// ============================================================================
// 3. compressSharedContext — P2 removal
// ============================================================================
console.log('\n--- 3. compressSharedContext — P2 removal ---');

const p2Result = compressSharedContext(SHARED_STUB, 9999);
ok('P2 removed: Voice DNA', p2Result.removed.includes('Voice DNA (writing guardrail)'));
ok('P2 removed: Writing Style Calibration', p2Result.removed.includes('Writing Style Calibration'));
ok('P2 removed: Sources of Truth', p2Result.removed.includes('Sources of Truth (EXCLUSIVE)'));

// ============================================================================
// 4. compressSharedContext — priority ordering (P2 before P1)
// ============================================================================
console.log('\n--- 4. compressSharedContext — priority ordering ---');

// Build a shared stub that also has a P1 section
const sharedWithP1 = makeSharedContent([
  { name: 'Scoring System', body: 'Core scoring logic.' },
  { name: 'Global Rules', body: 'NEVER/ALWAYS rules.' },
  { name: 'Company Type and Compensation Reliability', body: 'Taxonomy for comp.\n'.repeat(30) },
  { name: 'Voice DNA (writing guardrail)', body: 'Guardrail text.\n'.repeat(30) },
]);

// Small target: should only remove P2 first
const partialResult = compressSharedContext(sharedWithP1, 30);
ok('small target: P2 removed first', partialResult.removed.includes('Voice DNA (writing guardrail)'));
ok('small target: P1 preserved', !partialResult.removed.includes('Company Type and Compensation Reliability'));

// Large target: should remove both P2 and P1
const fullResult = compressSharedContext(sharedWithP1, 9999);
ok('large target: P1 also removed', fullResult.removed.includes('Company Type and Compensation Reliability'));

// ============================================================================
// 5. compressSharedContext — edge cases
// ============================================================================
console.log('\n--- 5. compressSharedContext — edge cases ---');

eq('empty string → no-op', compressSharedContext('', 100), { compressed: '', removed: [] });
eq('zero target → no-op', compressSharedContext(SHARED_STUB, 0), { compressed: SHARED_STUB, removed: [] });
eq('negative target → no-op', compressSharedContext(SHARED_STUB, -1), { compressed: SHARED_STUB, removed: [] });

// ============================================================================
// 6. buildBudgetedPrompt — under budget (no compression)
// ============================================================================
console.log('\n--- 6. buildBudgetedPrompt — under budget ---');

const underBudget = buildBudgetedPrompt({
  sharedContent: SHARED_STUB,
  ofertaContent: 'Evaluate job offers.',
  cvContent: 'Senior Engineer.',
  jdText: 'We are hiring a Senior Engineer.',
  maxTokens: 128000,
  safetyMargin: 8192,
});
ok('under budget: not compressed', !underBudget.budgetReport.compressed);
eq('under budget: removed empty', underBudget.budgetReport.removed, []);
ok('under budget: contextBody contains _shared.md', underBudget.contextBody.includes('SYSTEM CONTEXT'));
ok('under budget: contextBody contains cv.md', underBudget.contextBody.includes('CANDIDATE RESUME'));
ok('under budget: contextBody contains JD', underBudget.contextBody.includes('JOB DESCRIPTION'));

// ============================================================================
// 7. buildBudgetedPrompt — over budget (compression triggered)
// ============================================================================
console.log('\n--- 7. buildBudgetedPrompt — over budget ---');

const overBudget = buildBudgetedPrompt({
  sharedContent: SHARED_STUB,
  ofertaContent: 'Evaluate job offers.',
  cvContent: 'Senior Engineer.',
  jdText: 'We are hiring a Senior Engineer.',
  maxTokens: 400,   // Very tight budget to force compression
  safetyMargin: 100,
});
ok('over budget: compression triggered', overBudget.budgetReport.compressed);
ok('over budget: sections removed', overBudget.budgetReport.removed.length > 0);
ok('over budget: afterTokens < beforeTokens', overBudget.budgetReport.afterTokens < overBudget.budgetReport.beforeTokens);
// P0 sections must still be present
ok('over budget: P0 Scoring System still present', overBudget.contextBody.includes('## Scoring System'));
ok('over budget: P0 Global Rules still present', overBudget.contextBody.includes('## Global Rules'));

// ============================================================================
// 8. buildBudgetedPrompt — noCompress flag
// ============================================================================
console.log('\n--- 8. buildBudgetedPrompt — noCompress flag ---');

const noCompressResult = buildBudgetedPrompt({
  sharedContent: SHARED_STUB,
  ofertaContent: 'Evaluate job offers.',
  cvContent: 'Senior Engineer.',
  jdText: 'We are hiring.',
  maxTokens: 400,
  safetyMargin: 100,
  noCompress: true,
});
ok('noCompress: compression skipped', !noCompressResult.budgetReport.compressed);
eq('noCompress: removed empty', noCompressResult.budgetReport.removed, []);
// With noCompress, all content should be present even though over budget
ok('noCompress: full _shared.md present', noCompressResult.contextBody.includes('Voice DNA'));

// ============================================================================
// 9. buildBudgetedPrompt — optional profile fields
// ============================================================================
console.log('\n--- 9. buildBudgetedPrompt — optional profile fields ---');

// Without profile files (openai-eval.mjs style)
const noProfile = buildBudgetedPrompt({
  sharedContent: SHARED_STUB,
  ofertaContent: 'Evaluate job offers.',
  cvContent: 'Senior Engineer.',
  jdText: 'We are hiring.',
});
ok('no profile: does not crash', typeof noProfile.contextBody === 'string');
ok('no profile: report is valid', typeof noProfile.budgetReport === 'object');

// With profile files (gemini-eval.mjs style)
const withProfile = buildBudgetedPrompt({
  sharedContent: SHARED_STUB,
  ofertaContent: 'Evaluate job offers.',
  cvContent: 'Senior Engineer.',
  profileYml: 'name: Test User\nemail: test@example.com',
  profileContent: '## My Archetypes\nAI Platform expert.',
  jdText: 'We are hiring.',
});
ok('with profile: includes profile.yml', withProfile.contextBody.includes('config/profile.yml'));
ok('with profile: includes _profile.md', withProfile.contextBody.includes('_profile.md'));

// ============================================================================
// 10. buildBudgetedPrompt — contextBody structure
// ============================================================================
console.log('\n--- 10. buildBudgetedPrompt — contextBody structure ---');

const structureResult = buildBudgetedPrompt({
  sharedContent: '## Scoring System\nScore 1-5.',
  ofertaContent: 'Evaluate using Blocks A-G.',
  cvContent: 'Experienced engineer.',
  jdText: 'Hiring an engineer.',
});

// Sections appear in correct order: _shared, oferta, cv, JD
const body = structureResult.contextBody;
const sharedIdx = body.indexOf('SYSTEM CONTEXT');
const ofertaIdx = body.indexOf('EVALUATION MODE');
const cvIdx = body.indexOf('CANDIDATE RESUME');
const jdIdx = body.indexOf('JOB DESCRIPTION');

ok('order: _shared.md before oferta.md', sharedIdx < ofertaIdx);
ok('order: oferta.md before cv.md', ofertaIdx < cvIdx);
ok('order: cv.md before JD', cvIdx < jdIdx);

// ============================================================================
// RESULTS
// ============================================================================
console.log(`\n${'='.repeat(78)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\n  Failed tests:`);
  for (const f of failures) console.log(`    - ${f}`);
}
console.log(`${'='.repeat(78)}`);

process.exit(failed > 0 ? 1 : 0);
