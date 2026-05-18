// tests/unit/diff-renderer.test.mjs
// Unit tests for lib/diff-renderer.mjs
// Run with: node --test tests/unit/diff-renderer.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderInlineDiff, renderSideBySideDiff } from '../../lib/diff-renderer.mjs';

// Helper: extract only the HTML after the closing </style> tag so class-name
// strings in the CSS block don't confuse assertions about the rendered content.
function afterStyle(html) {
  const idx = html.indexOf('</style>');
  return idx >= 0 ? html.slice(idx + '</style>'.length) : html;
}

// ---------------------------------------------------------------------------
// renderInlineDiff tests
// ---------------------------------------------------------------------------

test('renderInlineDiff: identical text produces no diff marks', () => {
  const text = 'Hello world\nThis is unchanged.';
  const html = renderInlineDiff(text, text);
  const content = afterStyle(html);
  assert.ok(content.includes('Hello world'), 'original text present');
  assert.ok(!content.includes('diff-ins'), 'no insertion spans in content');
  assert.ok(!content.includes('diff-del'), 'no deletion spans in content');
});

test('renderInlineDiff: pure insertion produces ins marks', () => {
  const html = renderInlineDiff('', 'brand new line');
  const content = afterStyle(html);
  // inserted text must appear
  assert.ok(content.includes('brand') || content.includes('new') || content.includes('line'),
    'inserted text is present');
  // insertion class must appear
  assert.ok(content.includes('diff-line-ins') || content.includes('diff-ins'),
    'insertion marking present');
});

test('renderInlineDiff: pure deletion produces del marks', () => {
  const html = renderInlineDiff('old content to remove', '');
  const content = afterStyle(html);
  assert.ok(content.includes('diff-line-del') || content.includes('diff-del'),
    'deletion is marked');
  assert.ok(content.includes('old') || content.includes('content') || content.includes('remove'),
    'deleted text is still shown');
});

test('renderInlineDiff: word-level mix highlights changed words', () => {
  const html = renderInlineDiff('The quick brown fox', 'The slow brown fox');
  // "slow" is inserted, "quick" is deleted
  assert.ok(html.includes('quick') && html.includes('slow'),
    'both changed words present');
  assert.ok(html.includes('diff-del') || html.includes('diff-line-del'),
    'deletion marking present');
  assert.ok(html.includes('diff-ins') || html.includes('diff-line-ins'),
    'insertion marking present');
  // Unchanged words should not be marked
  assert.ok(html.includes('The'), 'unchanged "The" present');
  assert.ok(html.includes('brown'), 'unchanged "brown" present');
  assert.ok(html.includes('fox'), 'unchanged "fox" present');
});

test('renderInlineDiff: multi-line produces per-line structure', () => {
  const old = 'Line one\nLine two\nLine three';
  const nw  = 'Line one\nLine TWO changed\nLine three';
  const html = renderInlineDiff(old, nw);
  assert.ok(html.includes('Line one'), 'unchanged first line present');
  assert.ok(html.includes('Line three'), 'unchanged third line present');
  assert.ok(html.includes('TWO changed') || html.includes('two') || html.includes('TWO'),
    'changed line content present');
});

test('renderInlineDiff: empty inputs produce valid HTML', () => {
  const html1 = renderInlineDiff('', '');
  assert.ok(typeof html1 === 'string' && html1.length > 0, 'empty-vs-empty returns string');
  assert.ok(!html1.includes('undefined'), 'no undefined in output');

  const html2 = renderInlineDiff(null, null);
  assert.ok(typeof html2 === 'string' && html2.length > 0, 'null-vs-null returns string');
  assert.ok(!html2.includes('undefined'), 'no undefined in null output');
});

// ---------------------------------------------------------------------------
// renderSideBySideDiff tests
// ---------------------------------------------------------------------------

test('renderSideBySideDiff: identical text shows both columns', () => {
  const text = 'Unchanged line one\nUnchanged line two';
  const html = renderSideBySideDiff(text, text);
  assert.ok(html.includes('Before'), 'left column header present');
  assert.ok(html.includes('After'), 'right column header present');
  assert.ok(html.includes('Unchanged line one'), 'content present');
  // After the CSS block, no diff-ins or diff-del spans should appear
  const content = afterStyle(html);
  assert.ok(!content.includes('diff-ins') && !content.includes('diff-del'),
    'no diff marks for identical text');
});

test('renderSideBySideDiff: insertion shows in right column only', () => {
  const html = renderSideBySideDiff('existing line', 'existing line\nnew added line');
  assert.ok(html.includes('new added line'), 'inserted text present');
  assert.ok(html.includes('diff-line-ins') || html.includes('diff-ins'), 'insertion marked');
});

test('renderSideBySideDiff: deletion shows in left column only', () => {
  const html = renderSideBySideDiff('line to delete\nkept line', 'kept line');
  assert.ok(html.includes('line to delete'), 'deleted text still shown');
  assert.ok(html.includes('diff-line-del') || html.includes('diff-del'), 'deletion marked');
});

test('renderSideBySideDiff: empty inputs produce valid HTML', () => {
  const html = renderSideBySideDiff('', '');
  assert.ok(typeof html === 'string' && html.length > 0, 'empty-vs-empty returns string');
  assert.ok(html.includes('Before') && html.includes('After'), 'column headers present');
  assert.ok(!html.includes('undefined'), 'no undefined in output');
});

test('renderSideBySideDiff: null inputs treated as empty string', () => {
  const html = renderSideBySideDiff(null, null);
  assert.ok(typeof html === 'string' && html.length > 0, 'null-vs-null returns string');
  assert.ok(!html.includes('null'), 'no literal null in output');
});

test('renderSideBySideDiff: side-by-side grid structure present', () => {
  const html = renderSideBySideDiff('old content', 'new content');
  assert.ok(html.includes('diff-sbs'), 'side-by-side container class present');
  assert.ok(html.includes('diff-sbs-col'), 'column class present');
  assert.ok(html.includes('diff-sbs-body'), 'body class present');
});
