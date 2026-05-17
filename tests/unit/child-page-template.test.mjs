import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  renderChildPageHTML,
  getChildPageTokens,
  wrapForPDFFlavor,
  fnRef,
  slugify,
} from '../../lib/child-page-template.mjs';

// ---------------------------------------------------------------------------
// getChildPageTokens
// ---------------------------------------------------------------------------

test('getChildPageTokens returns all three required string keys', () => {
  const tokens = getChildPageTokens();
  assert.ok(typeof tokens.tokens === 'string', 'tokens should be a string');
  assert.ok(typeof tokens.dark_mode_block === 'string', 'dark_mode_block should be a string');
  assert.ok(typeof tokens.font_imports === 'string', 'font_imports should be a string');
});

test('tokens CSS block contains all required dashboard-mirror variables', () => {
  const { tokens } = getChildPageTokens();
  const required = [
    '--font-sans',
    '--font-mono',
    '--text-xs', '--text-sm', '--text-base', '--text-lg', '--text-xl',
    '--text-2xl', '--text-3xl', '--text-4xl',
    '--leading-tight', '--leading-normal', '--leading-relaxed',
    '--accent', '--accent-fg', '--accent-bg', '--accent-border',
    '--ring', '--focus-ring',
    '--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-8',
    '--bg', '--surface', '--surface-2',
    '--border', '--border-strong',
    '--text', '--text-2', '--text-3', '--text-4',
    '--green-fg', '--blue-fg', '--red-fg',
  ];
  for (const varName of required) {
    assert.ok(
      tokens.includes(varName),
      `tokens CSS should include ${varName}`
    );
  }
});

test('dark_mode_block overrides the same tokens as light mode', () => {
  const { dark_mode_block } = getChildPageTokens();
  // Must contain prefers-color-scheme: dark media query
  assert.ok(dark_mode_block.includes('prefers-color-scheme: dark'), 'dark block uses @media query');
  // Key dark values from build-dashboard.mjs body.dark (exact hex)
  assert.ok(dark_mode_block.includes('#06070d'), 'dark --bg matches dashboard');
  assert.ok(dark_mode_block.includes('#11131c'), 'dark --surface matches dashboard');
  assert.ok(dark_mode_block.includes('#232737'), 'dark --border matches dashboard');
  assert.ok(dark_mode_block.includes('#e4e4e7'), 'dark --text-2 matches dashboard');
});

test('font_imports contains Inter and JetBrains Mono', () => {
  const { font_imports } = getChildPageTokens();
  assert.ok(font_imports.includes('Inter'), 'font_imports should include Inter');
  assert.ok(font_imports.includes('JetBrains+Mono'), 'font_imports should include JetBrains Mono');
  assert.ok(font_imports.includes('fonts.googleapis.com'), 'font_imports should use Google Fonts');
});

// ---------------------------------------------------------------------------
// renderChildPageHTML structure
// ---------------------------------------------------------------------------

test('renderChildPageHTML returns a valid HTML5 document', () => {
  const html = renderChildPageHTML({
    title: 'Test Page',
    sections: [{ heading: 'Overview', body: '<p>Hello world</p>' }],
  });
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'starts with DOCTYPE');
  assert.ok(html.includes('<html lang="en">'), 'has html tag with lang');
  assert.ok(html.includes('</html>'), 'has closing html tag');
  assert.ok(html.includes('<head>'), 'has head');
  assert.ok(html.includes('<body>'), 'has body');
});

test('renderChildPageHTML embeds title in <title> and <h1>', () => {
  const html = renderChildPageHTML({ title: 'Story: Led Anthropic Integration' });
  assert.ok(
    html.includes('<title>Story: Led Anthropic Integration — Career-Ops</title>'),
    'title tag correct'
  );
  assert.ok(
    html.includes('<h1 class="cp-page-title">Story: Led Anthropic Integration</h1>'),
    'h1 correct'
  );
});

test('renderChildPageHTML renders sections with semantic headings', () => {
  const html = renderChildPageHTML({
    title: 'T',
    sections: [
      { heading: 'First Section', body: 'body one' },
      { heading: 'Second Section', body: 'body two' },
    ],
  });
  assert.ok(html.includes('<h2>First Section</h2>'), 'h2 for first section');
  assert.ok(html.includes('<h2>Second Section</h2>'), 'h2 for second section');
  assert.ok(html.includes('body one'), 'first body present');
  assert.ok(html.includes('body two'), 'second body present');
});

test('renderChildPageHTML wraps table-kind section in .table-scroll', () => {
  const html = renderChildPageHTML({
    title: 'T',
    sections: [
      {
        heading: 'Comparisons',
        body: '<table><tr><td>cell</td></tr></table>',
        kind: 'table',
      },
    ],
  });
  // DASHBOARD_INVARIANTS.md §8a: table-kind must have .table-scroll wrapper
  assert.ok(html.includes('class="table-scroll"'), 'table-scroll wrapper present for table kind');
});

test('renderChildPageHTML renders card-kind section with cp-kind-card class', () => {
  const html = renderChildPageHTML({
    title: 'T',
    sections: [{ heading: 'Card', body: 'card body', kind: 'card' }],
  });
  assert.ok(html.includes('cp-kind-card'), 'card section has cp-kind-card class');
});

test('renderChildPageHTML renders breadcrumbs with links', () => {
  const html = renderChildPageHTML({
    title: 'Story Page',
    breadcrumbs: [
      { label: 'Dashboard', href: '/' },
      { label: 'Row 42', href: '/rows/42' },
    ],
  });
  assert.ok(html.includes('<nav class="cp-breadcrumbs"'), 'breadcrumb nav present');
  assert.ok(html.includes('href="/"'), 'dashboard link present');
  assert.ok(html.includes('href="/rows/42"'), 'row link present');
  assert.ok(html.includes('Story Page'), 'current page in breadcrumbs');
});

test('renderChildPageHTML renders side nav when provided', () => {
  const html = renderChildPageHTML({
    title: 'T',
    side_nav: [
      { label: 'Narrative', href: '#section-0' },
      { label: 'Questions', href: '#section-1' },
    ],
  });
  assert.ok(html.includes('<aside class="cp-side-nav"'), 'side nav present');
  assert.ok(html.includes('#section-0'), 'section-0 link in side nav');
});

test('renderChildPageHTML renders footnotes with jump anchors', () => {
  const html = renderChildPageHTML({
    title: 'T',
    sections: [],
    footnotes: [
      {
        id: 'fn1',
        text: 'Source note one',
        refs: [{ file: 'cv.md', lineStart: 12, lineEnd: 18 }],
      },
      { id: 'fn2', text: 'Note without refs' },
    ],
  });
  assert.ok(html.includes('id="fn-fn1"'), 'fn1 anchor present');
  assert.ok(html.includes('id="fn-fn2"'), 'fn2 anchor present');
  assert.ok(html.includes('cv.md:L12-L18'), 'corpus ref with line range');
  assert.ok(html.includes('Note without refs'), 'footnote without refs renders');
});

test('renderChildPageHTML escapes dangerous input in title and section headings', () => {
  const html = renderChildPageHTML({
    title: '<script>alert("xss")</script>',
    sections: [{ heading: '<b>heading</b>', body: 'safe' }],
  });
  assert.ok(!html.includes('<script>alert'), 'script tag in title is escaped');
  assert.ok(html.includes('&lt;script&gt;'), 'title is HTML-escaped');
  assert.ok(html.includes('&lt;b&gt;heading&lt;/b&gt;'), 'heading is HTML-escaped');
});

test('renderChildPageHTML omits side nav when not provided', () => {
  const html = renderChildPageHTML({ title: 'T', sections: [] });
  assert.ok(!html.includes('<aside class="cp-side-nav"'), 'no side nav when not provided');
  assert.ok(html.includes('no-side-nav'), 'main has no-side-nav class');
});

// ---------------------------------------------------------------------------
// wrapForPDFFlavor
// ---------------------------------------------------------------------------

test('wrapForPDFFlavor injects @page margin CSS into <head>', () => {
  const html = renderChildPageHTML({ title: 'T', sections: [] });
  const pdfHtml = wrapForPDFFlavor(html);
  assert.ok(pdfHtml.includes('@page'), '@page rule injected');
  assert.ok(pdfHtml.includes('0.6in'), 'default margin is 0.6in');
});

test('wrapForPDFFlavor respects custom margin option', () => {
  const html = renderChildPageHTML({ title: 'T', sections: [] });
  const pdfHtml = wrapForPDFFlavor(html, { margin: '1in' });
  assert.ok(pdfHtml.includes('1in'), 'custom margin applied');
  assert.ok(!pdfHtml.includes('@page { margin: 0.6in'), 'default not present when overridden');
});

test('wrapForPDFFlavor adds position:static on breadcrumbs to remove stickiness', () => {
  const html = renderChildPageHTML({ title: 'T', sections: [] });
  const pdfHtml = wrapForPDFFlavor(html);
  assert.ok(pdfHtml.includes('.cp-breadcrumbs { position: static'), 'sticky removed from breadcrumbs');
});

test('wrapForPDFFlavor hides footer in PDF', () => {
  const html = renderChildPageHTML({ title: 'T', sections: [] });
  const pdfHtml = wrapForPDFFlavor(html);
  assert.ok(pdfHtml.includes('.cp-footer { display: none'), 'footer hidden in PDF');
});

test('wrapForPDFFlavor preserves original content untouched', () => {
  const html = renderChildPageHTML({
    title: 'Story Page',
    sections: [{ heading: 'Narrative', body: '<p>My story here</p>' }],
  });
  const pdfHtml = wrapForPDFFlavor(html);
  assert.ok(pdfHtml.includes('My story here'), 'original content preserved');
  assert.ok(pdfHtml.includes('Story Page'), 'title preserved');
});

// ---------------------------------------------------------------------------
// fnRef helper
// ---------------------------------------------------------------------------

test('fnRef generates a superscript anchor linking to footnote', () => {
  const markup = fnRef('fn1', 1);
  assert.ok(markup.includes('href="#fn-fn1"'), 'links to correct footnote anchor');
  assert.ok(markup.includes('[1]'), 'displays footnote number');
  assert.ok(markup.includes('class="cp-fn-ref"'), 'has cp-fn-ref class');
});

test('fnRef escapes dangerous id values', () => {
  const markup = fnRef('"xss&test>', 2);
  assert.ok(!markup.includes('"xss&test>'), 'dangerous characters escaped');
});

// ---------------------------------------------------------------------------
// slugify helper
// ---------------------------------------------------------------------------

test('slugify converts spaces and special chars to hyphens', () => {
  assert.equal(slugify('Story: Led Team'), 'story-led-team');
  assert.equal(slugify('Comp & Equity Analysis'), 'comp-equity-analysis');
  assert.equal(slugify('  leading/trailing  '), 'leading-trailing');
});

test('slugify handles empty / null / undefined input', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify(null), '');
  assert.equal(slugify(undefined), '');
});
