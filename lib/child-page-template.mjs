/**
 * lib/child-page-template.mjs — Universal HTML skeleton + design-system base
 * for EVERY child page in the career-ops dashboard system.
 *
 * All navigable child pages (story, gap-strategy, comp-comparison,
 * equity-calculator popout, peer-context table, decision-provenance card,
 * LLM-evidence detail, network-graph contact card, PDF flavors) use this
 * as their shared base so visual aesthetic stays consistent with the main
 * dashboard.
 *
 * Token philosophy: CSS variables mirror EXACTLY what scripts/build-dashboard.mjs
 * emits at lines 2853-2948 (light :root) and 2949-3000 (body.dark overrides).
 * No new token names are invented — only the dashboard's own names are used,
 * so any future dashboard token update can be reflected here by a single edit
 * to getChildPageTokens().
 *
 * Design principles (per DESIGN_PRINCIPLES.md):
 *   1. Scannability over comprehensiveness — structure first, prose only in body
 *   2. Action proximity — breadcrumb nav at top; footnote jump-links inline
 *   3. Strengths AND limitations — sections can carry any content; caller decides
 *   4. Background transparency — page chrome is minimal, content is foreground
 *   5. Future-action awareness — side_nav surfaced; remix prompts passable via sections
 */

// ---------------------------------------------------------------------------
// Token block — mirrors scripts/build-dashboard.mjs :root (lines 2853-2948)
// and body.dark block (lines 2949-3000) EXACTLY.
// ---------------------------------------------------------------------------

const FONT_IMPORTS_HTML = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">`;

const TOKENS_CSS = `
  /* ── Design tokens — mirrored from scripts/build-dashboard.mjs :root ─── */
  :root {
    --bg: #f8f9fb;
    --surface: #ffffff;
    --surface-2: #f4f4f6;
    --border: #e5e7eb;
    --border-strong: #d1d5db;
    --text: #111827;
    --text-2: #374151;
    --text-3: #6b7280;
    --text-4: #9ca3af;
    --green: #15803d;
    --green-fg: #16a34a;
    --green-fg-dark: #166534;
    --green-bg: #dcfce7;
    --green-border: #86efac;
    --blue: #475c75;
    --blue-fg: #5a76a6;
    --blue-fg-dark: #3d4f6b;
    --blue-bg: #e8edf4;
    --blue-border: #c0cad9;
    --amber: #8a6840;
    --amber-fg: #a87b48;
    --amber-fg-dark: #6b5430;
    --amber-bg: #f4ede1;
    --amber-border: #d8c79f;
    --red: #b91c1c;
    --red-fg: #dc2626;
    --red-fg-dark: #991b1b;
    --red-bg: #fee2e2;
    --red-border: #fca5a5;
    --purple: #5d5670;
    --purple-fg: #847a99;
    --purple-fg-dark: #4f4960;
    --purple-bg: #ecebf0;
    --purple-border: #cac6d4;
    --radius: 8px;
    --radius-sm: 6px;
    --radius-full: 9999px;
    --section-gap: 64px;
    /* Spacing scale — 4px base unit */
    --space-1: 4px;
    --space-2: 8px;
    --space-3: 12px;
    --space-4: 16px;
    --space-5: 24px;
    --space-6: 32px;
    --space-7: 48px;
    --space-8: 64px;
    /* Type scale */
    --fs-badge:   10px;
    --fs-meta:    11px;
    --fs-caption: 12px;
    --fs-body:    13px;
    --fs-h4:      15px;
    --fs-h3:      17px;
    --fs-cost:    22px;
    /* Named aliases used by spec: --text-xs/sm/base/lg/xl/2xl/3xl/4xl */
    --text-xs:  10px;
    --text-sm:  12px;
    --text-base: 13px;
    --text-lg:  15px;
    --text-xl:  17px;
    --text-2xl: 20px;
    --text-3xl: 24px;
    --text-4xl: 30px;
    /* Line-height scale */
    --lh-tight:   1.2;
    --lh-snug:    1.3;
    --lh-normal:  1.4;
    --lh-relaxed: 1.5;
    /* Named aliases used by spec: --leading-tight/normal/relaxed */
    --leading-tight:   1.2;
    --leading-normal:  1.4;
    --leading-relaxed: 1.5;
    /* Shadows */
    --shadow-sm: 0 1px 2px 0 rgba(0,0,0,.05);
    --shadow: 0 1px 3px 0 rgba(0,0,0,.1), 0 1px 2px -1px rgba(0,0,0,.1);
    --shadow-md: 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1);
    --shadow-lg: 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -4px rgba(0,0,0,.1);
    /* Focus rings */
    --ring: 0 0 0 3px rgba(90,118,166,.18);
    --ring-green: 0 0 0 3px rgba(22,163,74,.15);
    --ring-blue: 0 0 0 3px rgba(90,118,166,.18);
    --focus-ring: 0 0 0 3px rgba(90,118,166,.18);
    /* Accent aliases — resolves to blue-fg (editorial restraint per Phase 7) */
    --accent: #5a76a6;
    --accent-fg: #3d4f6b;
    --accent-bg: #e8edf4;
    --accent-border: #c0cad9;
    /* Typography stacks */
    --font-sans: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif;
    --font-ui:   -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif;
    --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    /* Motion */
    --motion-duration: 250ms;
    --motion-duration-fast: 180ms;
    --motion-ease: cubic-bezier(0.4, 0, 0.2, 1);
  }`;

const DARK_MODE_CSS = `
  /* ── Dark mode overrides — mirrored from scripts/build-dashboard.mjs body.dark ─ */
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #06070d;
      --surface: #11131c;
      --surface-2: #181b27;
      --border: #232737;
      --border-strong: #353a52;
      --text: #fafafa;
      --text-2: #e4e4e7;
      --text-3: #b8b8c0;
      --text-4: #9a9aa6;
      --green: #4ade80;
      --green-fg: #86efac;
      --green-fg-dark: #bbf7d0;
      --green-bg: rgba(22,163,74,.12);
      --green-border: rgba(22,163,74,.3);
      --blue: #a4b0c2;
      --blue-fg: #94a3b8;
      --blue-fg-dark: #cbd5e1;
      --blue-bg: rgba(100,116,139,.14);
      --blue-border: rgba(100,116,139,.3);
      --amber: #c2a571;
      --amber-fg: #d4ba84;
      --amber-fg-dark: #e6d4a8;
      --amber-bg: rgba(168,123,72,.14);
      --amber-border: rgba(168,123,72,.3);
      --red: #f87171;
      --red-fg: #fca5a5;
      --red-fg-dark: #fecaca;
      --red-bg: rgba(220,38,38,.12);
      --red-border: rgba(220,38,38,.3);
      --purple: #b3afbf;
      --purple-fg: #a39db5;
      --purple-fg-dark: #cdc8d6;
      --purple-bg: rgba(132,122,153,.14);
      --purple-border: rgba(132,122,153,.3);
      --ring: 0 0 0 2px rgba(10,10,11,.95), 0 0 0 4px rgba(148,163,184,.55), 0 0 12px rgba(148,163,184,.18);
      --ring-green: 0 0 0 2px rgba(10,10,11,.95), 0 0 0 4px rgba(74,222,128,.55), 0 0 12px rgba(74,222,128,.18);
      --ring-blue:  0 0 0 2px rgba(10,10,11,.95), 0 0 0 4px rgba(148,163,184,.55), 0 0 12px rgba(148,163,184,.18);
      --focus-ring: 0 0 0 2px rgba(10,10,11,.95), 0 0 0 4px rgba(148,163,184,.55), 0 0 12px rgba(148,163,184,.18);
      --accent: #94a3b8;
      --accent-fg: #cbd5e1;
      --accent-bg: rgba(100,116,139,.14);
      --accent-border: rgba(100,116,139,.3);
    }
  }`;

const BASE_CSS = `
  /* ── Child page base styles ─────────────────────────────────────────── */
  *, *::before, *::after { box-sizing: border-box; }

  html { font-size: 16px; }

  body {
    margin: 0;
    padding: 0;
    font-family: var(--font-sans);
    font-size: var(--fs-body);
    line-height: var(--lh-relaxed);
    color: var(--text-2);
    background: var(--bg);
    -webkit-font-smoothing: antialiased;
  }

  /* ── Breadcrumb nav ──────────────────────────────────────────────────── */
  .cp-breadcrumbs {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; gap: var(--space-2);
    padding: var(--space-2) var(--space-5);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    font-size: var(--fs-meta);
    color: var(--text-3);
    overflow-x: auto;
    white-space: nowrap;
  }
  .cp-breadcrumbs a {
    color: var(--accent);
    text-decoration: none;
    font-weight: 500;
  }
  .cp-breadcrumbs a:hover { text-decoration: underline; }
  .cp-breadcrumbs a:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: 2px; }
  .cp-breadcrumb-sep { color: var(--text-4); user-select: none; }
  .cp-breadcrumb-current { color: var(--text-2); font-weight: 500; }

  /* ── Page layout ─────────────────────────────────────────────────────── */
  .cp-layout {
    display: flex;
    min-height: calc(100vh - 36px);
  }

  /* Side nav (optional) */
  .cp-side-nav {
    width: 200px;
    flex-shrink: 0;
    padding: var(--space-5) var(--space-4);
    border-right: 1px solid var(--border);
    background: var(--surface);
    position: sticky;
    top: 36px;
    height: calc(100vh - 36px);
    overflow-y: auto;
  }
  .cp-side-nav-heading {
    font-size: var(--fs-meta);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-4);
    margin: 0 0 var(--space-3);
  }
  .cp-side-nav a {
    display: block;
    padding: var(--space-1) var(--space-2);
    font-size: var(--fs-body);
    color: var(--text-3);
    text-decoration: none;
    border-radius: var(--radius-sm);
    margin-bottom: 2px;
    transition: background var(--motion-duration-fast) var(--motion-ease),
                color var(--motion-duration-fast) var(--motion-ease);
  }
  .cp-side-nav a:hover { background: var(--surface-2); color: var(--text-2); }
  .cp-side-nav a:focus-visible { outline: none; box-shadow: var(--focus-ring); }

  /* Main content */
  .cp-main {
    flex: 1;
    min-width: 0;
    padding: var(--space-6) var(--space-6);
    max-width: 900px;
  }
  .cp-main.no-side-nav { max-width: 860px; margin: 0 auto; }

  /* ── Page title ──────────────────────────────────────────────────────── */
  .cp-page-title {
    font-size: var(--text-3xl);
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.01em;
    line-height: var(--lh-tight);
    margin: 0 0 var(--space-5);
  }

  /* ── Sections ────────────────────────────────────────────────────────── */
  .cp-section {
    margin-bottom: var(--space-7);
  }
  .cp-section:last-child { margin-bottom: 0; }

  .cp-section h2 {
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--text);
    margin: 0 0 var(--space-3);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--border);
    letter-spacing: -0.01em;
    line-height: var(--lh-snug, 1.3);
  }

  .cp-section h3 {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--text-2);
    margin: var(--space-4) 0 var(--space-2);
    line-height: var(--lh-snug, 1.3);
  }

  /* Section kinds */
  .cp-section-body { line-height: var(--lh-relaxed); }

  /* card kind */
  .cp-kind-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-4) var(--space-5);
    box-shadow: var(--shadow-sm);
  }

  /* table kind — applies table-scroll wrapper */
  .cp-kind-table .table-scroll {
    overflow-x: auto;
    overflow-y: auto;
    max-height: 520px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }
  .cp-kind-table table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-body);
  }
  .cp-kind-table th {
    position: sticky; top: 0;
    background: var(--surface-2);
    color: var(--text-3);
    font-size: var(--fs-meta);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
    text-align: left;
    white-space: nowrap;
  }
  .cp-kind-table td {
    padding: var(--space-2) var(--space-3);
    color: var(--text-2);
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  .cp-kind-table tr:last-child td { border-bottom: none; }
  .cp-kind-table tr:hover td { background: var(--surface-2); }

  /* list kind */
  .cp-kind-list ul,
  .cp-kind-list ol {
    margin: 0;
    padding-left: var(--space-5);
    color: var(--text-2);
    line-height: var(--lh-relaxed);
  }
  .cp-kind-list li { margin-bottom: var(--space-1); }

  /* embed kind */
  .cp-kind-embed {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--fs-caption);
    color: var(--text-2);
    overflow-x: auto;
    white-space: pre;
    line-height: var(--lh-normal);
  }

  /* ── Footnote inline markers ─────────────────────────────────────────── */
  .cp-fn-ref {
    display: inline;
    font-size: var(--text-xs);
    vertical-align: super;
    line-height: 0;
  }
  .cp-fn-ref a {
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
    padding: 0 1px;
  }
  .cp-fn-ref a:hover { text-decoration: underline; }
  .cp-fn-ref a:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: 2px; }

  /* ── Footnotes section ───────────────────────────────────────────────── */
  .cp-footnotes {
    margin-top: var(--space-8);
    padding-top: var(--space-4);
    border-top: 1px solid var(--border);
  }
  .cp-footnotes-heading {
    font-size: var(--fs-meta);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-4);
    margin: 0 0 var(--space-3);
  }
  .cp-footnotes ol {
    margin: 0;
    padding-left: var(--space-5);
    font-size: var(--fs-caption);
    color: var(--text-3);
    line-height: var(--lh-relaxed);
  }
  .cp-footnotes li { margin-bottom: var(--space-2); }
  .cp-fn-corpus-ref {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--text-4);
    margin-left: var(--space-2);
  }
  .cp-fn-corpus-ref a {
    color: var(--accent);
    text-decoration: none;
  }
  .cp-fn-corpus-ref a:hover { text-decoration: underline; }

  /* ── Footer ──────────────────────────────────────────────────────────── */
  .cp-footer {
    padding: var(--space-4) var(--space-6);
    border-top: 1px solid var(--border);
    font-size: var(--fs-meta);
    color: var(--text-4);
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .cp-footer a { color: var(--text-3); text-decoration: none; }
  .cp-footer a:hover { text-decoration: underline; }

  /* ── Scrollbar styling (dark mode) ───────────────────────────────────── */
  @media (prefers-color-scheme: dark) {
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--border-strong); }
  }

  /* ── Reduced motion ──────────────────────────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition: none !important; animation: none !important; }
  }`;

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------

export function slugify(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// getChildPageTokens — returns the three token strings
// ---------------------------------------------------------------------------

/**
 * Returns the three CSS string components for child page tokens.
 *
 * @returns {{ tokens: string, dark_mode_block: string, font_imports: string }}
 */
export function getChildPageTokens() {
  return {
    tokens: TOKENS_CSS,
    dark_mode_block: DARK_MODE_CSS,
    font_imports: FONT_IMPORTS_HTML,
  };
}

// ---------------------------------------------------------------------------
// renderChildPageHTML — universal HTML skeleton
// ---------------------------------------------------------------------------

/**
 * Renders a full HTML document for a child page.
 *
 * @param {object} opts
 * @param {string} opts.title — Page <title> and h1
 * @param {Array<{heading: string, body: string, kind?: 'card'|'table'|'list'|'embed'}>} opts.sections
 * @param {Array<{id: string, text: string, refs?: Array<{file: string, lineStart?: number, lineEnd?: number}>}>} [opts.footnotes]
 * @param {Array<{label: string, href: string}>} [opts.side_nav]
 * @param {Array<{label: string, href: string}>} [opts.breadcrumbs]
 * @returns {string} Full HTML document
 */
export function renderChildPageHTML({
  title,
  sections = [],
  footnotes = [],
  side_nav = [],
  breadcrumbs = [],
} = {}) {
  const hasSideNav = side_nav.length > 0;

  // Breadcrumb bar
  const breadcrumbHtml = buildBreadcrumbs(breadcrumbs, title);

  // Side nav HTML
  const sideNavHtml = hasSideNav ? buildSideNav(side_nav) : '';

  // Sections HTML
  const sectionsHtml = sections.map((s, i) => buildSection(s, i)).join('\n');

  // Footnotes HTML
  const footnotesHtml = footnotes.length > 0 ? buildFootnotes(footnotes) : '';

  const mainClass = hasSideNav ? 'cp-main' : 'cp-main no-side-nav';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — Career-Ops</title>
  ${FONT_IMPORTS_HTML}
  <style>
${TOKENS_CSS}
${DARK_MODE_CSS}
${BASE_CSS}
  </style>
</head>
<body>
  ${breadcrumbHtml}
  <div class="cp-layout">
    ${sideNavHtml}
    <main class="${mainClass}">
      <h1 class="cp-page-title">${esc(title)}</h1>
      ${sectionsHtml}
      ${footnotesHtml}
    </main>
  </div>
  <footer class="cp-footer">
    <span>Career-Ops</span>
    <span>&middot;</span>
    <a href="/">Dashboard</a>
  </footer>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// wrapForPDFFlavor — print-friendly wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps an HTML string for PDF rendering: adds print-friendly margins,
 * removes interactive affordances (sticky nav, hover states, focus rings),
 * and keeps the visual aesthetic intact.
 *
 * @param {string} html — Full HTML document from renderChildPageHTML
 * @param {object} [opts]
 * @param {string} [opts.margin] — CSS margin string, default '0.6in'
 * @param {string} [opts.format] — 'a4' | 'letter', default 'a4'
 * @returns {string} Print-optimized HTML
 */
export function wrapForPDFFlavor(html, opts = {}) {
  const margin = opts.margin || '0.6in';

  // Inject print CSS into <head> just before </head>
  const printCss = `
  <style>
    /* PDF flavor overrides — print-friendly, removes interactive affordances */
    @page { margin: ${margin}; }
    body { background: #ffffff !important; color: #111827 !important; }
    /* Remove sticky positioning — doesn't make sense in print */
    .cp-breadcrumbs { position: static !important; }
    .cp-side-nav { position: static !important; height: auto !important; }
    /* Remove hover/focus visual states — no interaction in PDF */
    a:hover, button:hover, .cp-kind-table tr:hover td { background: none !important; }
    *:focus-visible { box-shadow: none !important; outline: none !important; }
    /* Page break hints */
    .cp-section { page-break-inside: avoid; }
    .cp-footnotes { page-break-before: avoid; }
    /* Hide footer nav in PDF — add page numbering via @bottom-center if needed */
    .cp-footer { display: none; }
    /* Ensure all text is black for print quality */
    .cp-page-title { color: #111827 !important; }
    .cp-section h2 { color: #111827 !important; border-color: #e5e7eb !important; }
    .cp-section h3 { color: #374151 !important; }
    /* Remove ambient backgrounds */
    .cp-kind-card { box-shadow: none !important; border: 1px solid #e5e7eb !important; }
    .cp-kind-embed { border: 1px solid #e5e7eb !important; }
  </style>`;

  return html.replace('</head>', `${printCss}\n</head>`);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildBreadcrumbs(crumbs, currentTitle) {
  const parts = crumbs.map(
    (c) => `<a href="${esc(c.href)}">${esc(c.label)}</a><span class="cp-breadcrumb-sep">›</span>`
  );
  parts.push(`<span class="cp-breadcrumb-current">${esc(currentTitle)}</span>`);

  return `<nav class="cp-breadcrumbs" aria-label="Breadcrumb">
    ${parts.join('\n    ')}
  </nav>`;
}

function buildSideNav(items) {
  const links = items
    .map((item) => `<a href="${esc(item.href)}">${esc(item.label)}</a>`)
    .join('\n    ');

  return `<aside class="cp-side-nav" aria-label="Page sections">
    <div class="cp-side-nav-heading">On this page</div>
    ${links}
  </aside>`;
}

function buildSection(section, idx) {
  const id = `section-${idx}-${slugify(section.heading || '')}`;
  const kind = section.kind || 'default';
  const kindClass = kind !== 'default' ? ` cp-kind-${kind}` : '';

  let bodyContent = section.body || '';

  // For table kind, wrap in .table-scroll per DASHBOARD_INVARIANTS.md §8a
  if (kind === 'table' && !bodyContent.includes('class="table-scroll"')) {
    bodyContent = `<div class="table-scroll">${bodyContent}</div>`;
  }

  return `<section class="cp-section${kindClass}" id="${id}">
    <h2>${esc(section.heading)}</h2>
    <div class="cp-section-body">${bodyContent}</div>
  </section>`;
}

function buildFootnotes(footnotes) {
  const items = footnotes.map((fn) => {
    const refs = (fn.refs || []).map((r) => {
      const range = r.lineStart
        ? r.lineEnd
          ? `L${r.lineStart}-L${r.lineEnd}`
          : `L${r.lineStart}`
        : '';
      const displayFile = r.file ? `${r.file}${range ? `:${range}` : ''}` : '';
      const href = r.file
        ? `/${r.file}${range ? `#${range}` : ''}`
        : '#';
      return displayFile
        ? `<span class="cp-fn-corpus-ref"><a href="${esc(href)}" target="_blank" rel="noopener">${esc(displayFile)}</a></span>`
        : '';
    }).filter(Boolean).join(' ');

    return `<li id="fn-${esc(fn.id)}">${esc(fn.text)}${refs ? ` ${refs}` : ''}</li>`;
  });

  return `<aside class="cp-footnotes" aria-label="Footnotes">
    <div class="cp-footnotes-heading">Sources &amp; footnotes</div>
    <ol>
      ${items.join('\n      ')}
    </ol>
  </aside>`;
}

/**
 * Render an inline footnote reference marker: [N]
 * Generates a superscript link to #fn-{id}.
 *
 * @param {string|number} id — footnote id
 * @param {number} n — display number
 * @returns {string} HTML span
 */
export function fnRef(id, n) {
  return `<span class="cp-fn-ref"><a href="#fn-${esc(String(id))}" aria-label="Footnote ${n}">[${n}]</a></span>`;
}
