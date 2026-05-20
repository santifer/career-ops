#!/usr/bin/env node
/**
 * scripts/build-network-database-shell.mjs — patch dashboard/network-database.html
 * to inject the shared sidebar/skip-link/landmarks per the BRAVO 2026-05-19
 * dealbreaker spec.
 *
 * Strategy: network-database.html is hand-written (not output by any generator),
 * its CSS uses a light-theme :root with @media dark override. We don't want to
 * rewrite the page wholesale — we inject the shell skeleton (sidebar + skip-
 * link + ARIA-landmark <main>) AROUND the existing content.
 *
 * Idempotent: detects whether the shell has already been injected (looks for
 * <aside class="sidebar">) and skips if so.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDashboardSidebar, getDashboardShellCSS, getDashboardShellScripts } from '../lib/dashboard-shell.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const targetPath = join(REPO_ROOT, 'dashboard/network-database.html');
if (!existsSync(targetPath)) {
  console.error('[build-network-database-shell] dashboard/network-database.html missing');
  process.exit(1);
}

let html = readFileSync(targetPath, 'utf8');

if (html.includes('class="sidebar" id="sidebar"')) {
  console.log('[build-network-database-shell] shell already injected — skipping');
  process.exit(0);
}

const sidebar = getDashboardSidebar({ currentPage: 'network-db' });
const shellCSS = getDashboardShellCSS({ scopeForStandalonePage: false });
const shellJS = getDashboardShellScripts({ pageId: 'network-db' });

const headerInjection = `
<!-- BRAVO 2026-05-19: shared dashboard shell injection -->
<style>
:root {
  --sidebar-w: 200px;
  --sidebar-w-collapsed: 56px;
  --radius-sm: 6px;
  --radius-full: 9999px;
  --focus-ring: 0 0 0 3px var(--blue-bg);
  --font-sans: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root { --border-strong: #353a52; }
}
@media (prefers-color-scheme: light) {
  :root { --border-strong: #cbd5e1; }
}
body { display: block; }
.netdb-page-wrap {
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  min-height: 100vh;
}
.netdb-page-wrap > main.netdb-content {
  min-width: 0;
  padding: 0;
}
@media (max-width: 1279px) and (min-width: 721px) {
  .netdb-page-wrap { grid-template-columns: var(--sidebar-w-collapsed) 1fr; }
}
@media (max-width: 720px) {
  .netdb-page-wrap { grid-template-columns: 1fr; }
  .netdb-content { padding-top: 60px; }
  /* Network DB hand-written header sits inside .netdb-content; pad left to
     clear the fixed hamburger button (38px button + 12px left offset). */
  .netdb-content > header { padding-left: 62px; }
}
header { background: var(--surface); }
${shellCSS}
</style>
`;

html = html.replace('</head>', headerInjection + '\n</head>');

const bodyOpen = '<body>';
if (!html.includes(bodyOpen)) {
  console.error('[build-network-database-shell] could not find <body> tag');
  process.exit(1);
}

const newBodyOpen = `<body>
<a class="skip-link" href="#main">Skip to main content</a>

<button type="button" class="sidebar-toggle" id="sidebar-toggle-btn"
  onclick="toggleSidebar()" aria-label="Open navigation menu" aria-expanded="false"
  aria-controls="sidebar">☰</button>
<div class="sidebar-backdrop" id="sidebar-backdrop"
  onclick="closeSidebar()" aria-hidden="true"></div>

<div id="_shortcut-announcer" aria-live="polite" aria-atomic="true" class="sr-only"></div>

<div class="netdb-page-wrap">
  ${sidebar}
  <main id="main" class="netdb-content" tabindex="-1">`;

html = html.replace(bodyOpen, newBodyOpen);

const bodyClose = '</body>';
if (!html.includes(bodyClose)) {
  console.error('[build-network-database-shell] could not find </body> tag');
  process.exit(1);
}

const newBodyClose = `  </main>
</div>

<script>
${shellJS}
</script>
</body>`;

html = html.replace(bodyClose, newBodyClose);

html = html.replace(
  /<a href="\/"[^>]*>← dashboard<\/a>/,
  '<!-- ← dashboard link removed; sidebar now provides cross-page nav -->'
);

writeFileSync(targetPath, html);
console.log(`[build-network-database-shell] patched ${targetPath} (${html.length.toLocaleString()} bytes)`);
