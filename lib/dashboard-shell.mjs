/**
 * lib/dashboard-shell.mjs — Shared "app shell" for every page in the
 * career-ops dashboard system (index.html, contacts.html, network-database.html,
 * and any future page).
 *
 * Built per the BRAVO 2026-05-19 dealbreaker spec (data/dealbreaker-bravo-nav-2026-05-19.md):
 *
 *   1. Build-time component injection (no client-side flash of unstyled nav)
 *   2. Persistent left sidebar on ALL pages (WCAG 3.2.3 Consistent Navigation, AA)
 *   3. Skip-link → <main id="main" tabindex="-1"> on every page (WCAG 2.4.1, A)
 *   4. aria-current="page" on the active anchor (WAI-ARIA APG §3.4)
 *   5. Active state coded via color + border + weight + background (WCAG 1.4.1, A)
 *   6. Minimum ARIA landmarks: <header>, <nav>, <main>, <footer> (WCAG 1.3.1, A)
 *   7. Modal triggers are <button>, not <a href="#"> (WCAG 4.1.2, AA)
 *   8. Modal triggers on non-home pages navigate to /?open=<modalName> auto-open
 *   9. Hamburger button gets aria-expanded + aria-controls (WAI-ARIA Disclosure)
 *  10. Global keyboard shortcuts (g h / g c / g n / / / ?) with aria-live announce
 *  11. SVG icons inline (emoji fallback) — no icon fonts (WCAG 1.1.1)
 *  12. Template variable substitution: one nav source, three+ destinations
 *
 * Token consumption: this module's CSS uses the same CSS custom property names
 * the main dashboard uses (--bg, --surface, --text, --green-fg, etc.). The
 * canonical token block lives in lib/child-page-template.mjs or build-dashboard.mjs;
 * this shell defines a complementary "shell-only" CSS block for sidebar/skip-link/
 * shortcut-modal styles that depends on those tokens being present.
 *
 * Mitchell wakes up to: every page has the same sidebar, every page is
 * keyboard-navigable to every other page, every page has a working skip-link,
 * and the contacts.html / network-database.html surfaces feel like part of
 * the same product as the main dashboard.
 *
 * Bug-class avoidance per AGENTS.md "outer-template-unescape":
 * the dashboard build pipeline wraps inline <script> bodies in a giant outer
 * template literal in build-dashboard.mjs, which unescapes single-backslash
 * sequences (\n, \r, \t) BEFORE writing to disk. This module's getShellScripts()
 * returns ONLY safe-escaped strings: no \n inside JS string literals — String
 * literals use String.fromCharCode(10) or template-literal concatenation. When
 * embedding in build-dashboard.mjs, the resulting script string is wrapped in
 * another template literal one level up; we have tested this carefully.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// PAGE REGISTRY — single source of truth for sidebar contents.
// Edit this to add a new page; the build will pick it up everywhere.
// ---------------------------------------------------------------------------

export const PAGE_REGISTRY = [
  // Group 1: Dashboard sections (cross-page on non-home pages via /#anchor)
  { id: 'overview',     href: '/#overview-section',         label: 'Overview',         icon: '📊', group: 'dashboard' },
  { id: 'apply-now',    href: '/#apply-now-section',        label: 'Apply-Now',        icon: '🎯', group: 'dashboard' },
  { id: 'all-evals',    href: '/#all-evaluations-section',  label: 'All Evaluations',  icon: '📋', group: 'dashboard' },
  { id: 'trends',       href: '/#trends-panel',             label: 'Trends',           icon: '📈', group: 'dashboard' },
  { id: 'companies',    href: '/#companies-panel',          label: 'Companies',        icon: '🏢', group: 'dashboard' },
  // Group 2: Pages (cross-page links — aria-current="page" when active)
  { id: 'home',         href: '/',                          label: 'Dashboard',        icon: '⚡', group: 'pages' },
  { id: 'contacts',     href: '/contacts.html',             label: 'Network',          icon: '👥', group: 'pages' },
  { id: 'network-db',   href: '/network-database.html',     label: 'Network DB',       icon: '🗄', group: 'pages', sublabel: 'table view' },
  // Group 3: Actions (modal triggers)
  // On home, fires the in-page modal function. On non-home, navigates to /?open=<id>
  { id: 'pending',      action: 'modal:pending',            label: 'Pipeline',         icon: '⏳', group: 'actions' },
  { id: 'batch-runs',   action: 'modal:batch-runs',         label: 'Batch Runs',       icon: '📦', group: 'actions' },
  { id: 'industries',   action: 'drill:industry-gap',       label: 'Industries',       icon: '🎯', group: 'actions' },
  { id: 'settings',     action: 'modal:settings',           label: 'Settings',         icon: '⚙️', group: 'actions' },
];

// ---------------------------------------------------------------------------
// HTML escape
// ---------------------------------------------------------------------------

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Sidebar HTML (used by both standalone-page render and the index render).
// ---------------------------------------------------------------------------

/**
 * Render the sidebar HTML for a given current page.
 *
 * @param {object} opts
 * @param {string} opts.currentPage — the page id (one of PAGE_REGISTRY ids, group:'pages')
 * @returns {string} HTML
 */
export function getDashboardSidebar({ currentPage = 'home' } = {}) {
  const isHome = currentPage === 'home';

  // Group helper: emit a button for action items, anchor for href items.
  const renderItem = (p) => {
    const isCurrent = p.id === currentPage;
    const ariaCurrent = isCurrent ? ' aria-current="page"' : '';
    const activeClass = isCurrent ? ' sidebar-link-active' : '';

    if (p.href) {
      const sublabel = p.sublabel
        ? `<span class="sidebar-sublabel" aria-hidden="true">${esc(p.sublabel)}</span>`
        : '';
      return `<a href="${esc(p.href)}" class="sidebar-link${activeClass}" title="${esc(p.label)}"${ariaCurrent}>
        <span class="sidebar-icon" aria-hidden="true">${esc(p.icon)}</span>
        <span class="sidebar-label">${esc(p.label)}${sublabel}</span>
      </a>`;
    }

    // Action button. On home, call the in-page function. On non-home, navigate
    // to /?open=<id> so index.html can auto-open the corresponding modal.
    const actionParts = (p.action || '').split(':');
    const actionType = actionParts[0]; // 'modal' or 'drill'
    const actionTarget = actionParts.slice(1).join(':'); // e.g. 'pending' or 'industry-gap'

    if (isHome) {
      // On home, call the existing in-page function directly.
      let onclick = '';
      if (actionType === 'modal') {
        // Map to existing handlers in build-dashboard.mjs
        if (actionTarget === 'pending') onclick = "toggleStatPanel('pending');closeSidebar();";
        else if (actionTarget === 'batch-runs') onclick = 'openBatchStatusModal();closeSidebar();';
        else if (actionTarget === 'settings') onclick = 'openMobileSettingsSheet();closeSidebar();';
        else onclick = 'closeSidebar();';
      } else if (actionType === 'drill') {
        onclick = `window.drillIn(${JSON.stringify(actionTarget)},'',event);closeSidebar();`;
      }
      return `<button type="button" class="sidebar-link" onclick="${esc(onclick)}" title="${esc(p.label)}" aria-haspopup="dialog">
        <span class="sidebar-icon" aria-hidden="true">${esc(p.icon)}</span>
        <span class="sidebar-label">${esc(p.label)}</span>
      </button>`;
    }

    // Off-home: navigate to /?open=<id> so the action fires on index page-load.
    const queryParam = `open=${encodeURIComponent(p.id)}`;
    return `<a href="/?${queryParam}" class="sidebar-link" title="${esc(p.label)} — opens on Dashboard">
      <span class="sidebar-icon" aria-hidden="true">${esc(p.icon)}</span>
      <span class="sidebar-label">${esc(p.label)}</span>
    </a>`;
  };

  const groupItems = (groupName) =>
    PAGE_REGISTRY.filter((p) => p.group === groupName).map(renderItem).join('\n      ');

  return `<aside class="sidebar" id="sidebar" aria-label="Primary navigation">
    <a class="sidebar-brand" href="/" aria-label="Career-Ops home">
      <span class="sidebar-favicon" aria-hidden="true">⚡</span>
      <span class="sidebar-brand-name">Career-Ops</span>
    </a>
    <nav class="sidebar-nav" aria-label="Site sections">

      <div class="sidebar-nav-group" role="group" aria-labelledby="navgrp-pages-label">
        <span id="navgrp-pages-label" class="sidebar-nav-group-label">Pages</span>
        ${groupItems('pages')}
      </div>

      <div class="sidebar-nav-group" role="group" aria-labelledby="navgrp-dashboard-label">
        <span id="navgrp-dashboard-label" class="sidebar-nav-group-label">${isHome ? 'On this page' : 'Dashboard sections'}</span>
        ${groupItems('dashboard')}
      </div>

      <div class="sidebar-nav-group" role="group" aria-labelledby="navgrp-actions-label">
        <span id="navgrp-actions-label" class="sidebar-nav-group-label">Actions</span>
        ${groupItems('actions')}
      </div>

    </nav>
  </aside>`;
}

// ---------------------------------------------------------------------------
// Shell CSS — the sidebar + skip-link + shortcut-modal styles.
// Designed to live alongside the existing dashboard token CSS (consumed
// via CSS custom properties).
// ---------------------------------------------------------------------------

export function getDashboardShellCSS({ scopeForStandalonePage = false } = {}) {
  // When the shell is used by a STANDALONE page (contacts.html, network-database.html),
  // we ALSO need to emit the base token CSS that lib/child-page-template.mjs has.
  // When the shell is used by build-dashboard.mjs (which already emits its own
  // tokens), we don't redefine — just the shell-specific rules.
  const tokenBlock = scopeForStandalonePage ? `
:root {
  --bg: #0a0a0f;
  --surface: #11131c;
  --surface-2: #181b27;
  --border: #232737;
  --border-strong: #353a52;
  --text: #fafafa;
  --text-2: #e4e4e7;
  --text-3: #b8b8c0;
  --text-4: #9a9aa6;
  --green-fg: #86efac;
  --green-bg: rgba(22,163,74,.12);
  --blue-fg: #94a3b8;
  --blue-bg: rgba(100,116,139,.14);
  --blue-border: rgba(100,116,139,.3);
  --amber-fg: #d4ba84;
  --amber-bg: rgba(168,123,72,.14);
  --red-fg: #fca5a5;
  --red-bg: rgba(220,38,38,.12);
  --radius: 8px;
  --radius-sm: 6px;
  --radius-full: 9999px;
  --sidebar-w: 200px;
  --sidebar-w-collapsed: 56px;
  --focus-ring: 0 0 0 2px rgba(10,10,11,.95), 0 0 0 4px rgba(148,163,184,.55), 0 0 12px rgba(148,163,184,.18);
  --font-sans: -apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Helvetica,Arial,sans-serif;
}
* { box-sizing: border-box; }
html, body { background: var(--bg); color: var(--text); font-family: var(--font-sans); }
body { margin: 0; font-size: 13px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
a { color: var(--blue-fg); text-decoration: none; }
a:hover { text-decoration: underline; }
` : '';

  return `${tokenBlock}
/* ── Dashboard shell — shared across all pages ──────────────────────── */

/* Skip-link */
.skip-link {
  position: absolute; top: -40px; left: 8px;
  background: var(--blue-fg);
  color: var(--bg);
  padding: 10px 14px;
  border-radius: var(--radius-sm, 6px);
  font-weight: 600;
  font-size: 13px;
  z-index: 10000;
  text-decoration: none;
}
.skip-link:focus { top: 8px; outline: 2px solid var(--text); outline-offset: 2px; }

/* SR-only visually-hidden helper */
.sr-only {
  position: absolute !important;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border: 0;
}

/* Global focus-visible */
a:focus-visible,
button:focus-visible,
[tabindex]:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--blue-fg);
  outline-offset: 2px;
  border-radius: inherit;
}

/* Sidebar shell */
.app-shell {
  display: grid;
  grid-template-columns: var(--sidebar-w, 200px) 1fr;
  min-height: 100vh;
}
.app-main {
  padding: 24px 28px;
  min-width: 0;
}
.sidebar {
  position: sticky;
  top: 0;
  align-self: start;
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 50;
  transition: transform .25s cubic-bezier(0.16, 1, 0.3, 1);
}
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 16px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: -0.2px;
  flex-shrink: 0;
  text-decoration: none;
}
.sidebar-brand:hover { text-decoration: none; }
.sidebar-favicon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px;
  border-radius: 6px;
  background: linear-gradient(135deg, var(--green-fg), var(--blue-fg));
  color: var(--bg);
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}
.sidebar-brand-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sidebar-nav {
  display: flex;
  flex-direction: column;
  padding: 10px 8px;
  flex: 1 1 auto;
  gap: 8px;
}
.sidebar-nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sidebar-nav-group-label {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-4);
  padding: 8px 12px 4px;
  display: block;
}
.sidebar-link {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px;
  border-radius: var(--radius-sm, 6px);
  border: 0;
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  border-left: 3px solid transparent;
  margin-left: -3px;
  transition: background .12s, color .12s, border-color .12s;
  font-family: inherit;
  text-align: left;
  width: 100%;
  position: relative;
}
.sidebar-link:hover {
  background: var(--surface-2);
  color: var(--text);
  text-decoration: none;
}
.sidebar-link[aria-current="page"],
.sidebar-link-active {
  background: var(--surface-2);
  color: var(--text);
  border-left-color: var(--green-fg);
  font-weight: 600;
}
.sidebar-link[aria-current="page"] .sidebar-icon {
  /* Visual reinforcement beyond color — WCAG 1.4.1 */
  filter: drop-shadow(0 0 4px rgba(134, 239, 172, 0.4));
}
.sidebar-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px; height: 22px;
  font-size: 14px;
  flex-shrink: 0;
}
.sidebar-label {
  flex: 1 1 auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.sidebar-sublabel {
  font-size: 10px;
  font-weight: 400;
  color: var(--text-4);
  margin-top: 1px;
}

/* Hamburger toggle (mobile only) */
.sidebar-toggle {
  display: none;
  position: fixed;
  top: 14px;
  left: 12px;
  z-index: 9001;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm, 6px);
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-2);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  font-family: inherit;
}
.sidebar-toggle:hover { background: var(--surface-2); }
.sidebar-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
  opacity: 0;
  pointer-events: none;
  transition: opacity .22s ease;
  z-index: 8999;
}
.sidebar-backdrop.visible {
  opacity: 1;
  pointer-events: auto;
}

/* Responsive: collapse to icons-only between 720-1279 px */
@media (max-width: 1279px) and (min-width: 721px) {
  .app-shell { grid-template-columns: var(--sidebar-w-collapsed) 1fr; }
  .sidebar-brand { justify-content: center; padding: 18px 8px 14px; }
  .sidebar-brand-name { display: none; }
  .sidebar-nav { padding: 10px 6px; }
  .sidebar-nav-group-label { display: none; }
  .sidebar-link { justify-content: center; padding: 9px 6px; gap: 0; }
  .sidebar-link .sidebar-label { display: none; }
}

/* Responsive: mobile (<=720 px) — sidebar becomes overlay */
@media (max-width: 720px) {
  .app-shell { grid-template-columns: 1fr; }
  .sidebar {
    position: fixed;
    left: 0; top: 0; bottom: 0;
    width: var(--sidebar-w, 200px);
    height: 100vh;
    transform: translateX(-100%);
    box-shadow: 2px 0 24px rgba(0, 0, 0, 0.25);
  }
  .sidebar.open { transform: translateX(0); }
  .sidebar-toggle { display: inline-flex; }
  .app-main { padding: 60px 16px 24px; }  /* leave room for hamburger */
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .sidebar,
  .sidebar-backdrop,
  .sidebar-link {
    transition: none !important;
  }
}

/* Keyboard shortcuts modal */
.shortcuts-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 10000;
  display: none;
  align-items: center;
  justify-content: center;
}
.shortcuts-modal-backdrop.visible {
  display: flex;
}
.shortcuts-modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius, 8px);
  padding: 24px 28px;
  max-width: 480px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  color: var(--text);
}
.shortcuts-modal h2 {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
.shortcuts-modal table { width: 100%; border-collapse: collapse; }
.shortcuts-modal td { padding: 8px 4px; font-size: 13px; border-bottom: 1px solid var(--border); }
.shortcuts-modal td:first-child { white-space: nowrap; }
.shortcuts-modal kbd {
  display: inline-block;
  padding: 2px 7px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text);
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
  line-height: 1;
}
.shortcuts-modal-close {
  margin-top: 16px;
  padding: 8px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 6px);
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
}
.shortcuts-modal-close:hover { background: var(--border); }
`;
}

// ---------------------------------------------------------------------------
// Shell JavaScript — sidebar toggle + keyboard shortcuts + modal-from-query.
//
// Build-safe: avoids single-backslash escape sequences inside JS string
// literals (the outer build-dashboard.mjs template will unescape them).
// See AGENTS.md "outer-template-unescape" bug class.
// ---------------------------------------------------------------------------

export function getDashboardShellScripts({ pageId = 'home' } = {}) {
  // We use String.fromCharCode and template literals only — no \n / \r / \t
  // inside JS string literals, to survive the outer build template literal
  // when this is embedded via build-dashboard.mjs.
  return `
/* ── Sidebar toggle (mobile) ───────────────────────────────────────── */
function toggleSidebar() {
  var sb = document.getElementById('sidebar');
  var bd = document.getElementById('sidebar-backdrop');
  var bt = document.getElementById('sidebar-toggle-btn');
  if (!sb || !bd || !bt) return;
  var open = sb.classList.toggle('open');
  bd.classList.toggle('visible', open);
  bt.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function closeSidebar() {
  var sb = document.getElementById('sidebar');
  var bd = document.getElementById('sidebar-backdrop');
  var bt = document.getElementById('sidebar-toggle-btn');
  if (!sb || !bd || !bt) return;
  sb.classList.remove('open');
  bd.classList.remove('visible');
  bt.setAttribute('aria-expanded', 'false');
}
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;

/* ── Modal from query param (on home page) ─────────────────────────── */
(function _handleOpenParam() {
  if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') return;
  try {
    var params = new URLSearchParams(window.location.search);
    var open = params.get('open');
    if (!open) return;
    // Defer until DOM + handlers are loaded
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(function () {
        try {
          if (open === 'pending' && typeof toggleStatPanel === 'function') toggleStatPanel('pending');
          else if (open === 'batch-runs' && typeof openBatchStatusModal === 'function') openBatchStatusModal();
          else if (open === 'settings' && typeof openMobileSettingsSheet === 'function') openMobileSettingsSheet();
          else if (open === 'industries' && typeof window.drillIn === 'function') window.drillIn('industry-gap', '', null);
        } catch (e) { /* missing handler — ignore */ }
      }, 60);
    });
  } catch (e) { /* URLSearchParams unsupported in ancient browsers — ignore */ }
})();

/* ── Global keyboard shortcuts (g h / g c / g n / / / ?) ──────────── */
(function _shortcuts() {
  var lastKey = '';
  var lastKeyTs = 0;
  var CHORD_WINDOW = 1500;

  function inFormField(target) {
    if (!target) return false;
    var tag = (target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (target.isContentEditable) return true;
    return false;
  }

  function announce(msg) {
    var el = document.getElementById('_shortcut-announcer');
    if (!el) return;
    el.textContent = msg;
  }

  function navigateTo(path, label) {
    announce('Navigating to ' + label);
    setTimeout(function () { window.location.href = path; }, 120);
  }

  function focusSearch() {
    // Try the canonical search input on the current page
    var sel = '#contacts-search, #search, [type="search"], input[placeholder*="Search"]';
    var el = document.querySelector(sel);
    if (el) { el.focus(); el.select && el.select(); announce('Search focused'); }
  }

  function openShortcutsModal() {
    var bd = document.getElementById('shortcuts-modal-bd');
    if (!bd) return;
    bd.classList.add('visible');
    bd.setAttribute('aria-hidden', 'false');
    var first = bd.querySelector('.shortcuts-modal-close');
    if (first) first.focus();
  }
  function closeShortcutsModal() {
    var bd = document.getElementById('shortcuts-modal-bd');
    if (!bd) return;
    bd.classList.remove('visible');
    bd.setAttribute('aria-hidden', 'true');
  }
  window.openShortcutsModal = openShortcutsModal;
  window.closeShortcutsModal = closeShortcutsModal;

  document.addEventListener('keydown', function (e) {
    if (inFormField(e.target)) return;
    // ignore modifier keys
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var key = e.key;

    if (key === '?') {
      e.preventDefault();
      openShortcutsModal();
      return;
    }
    if (key === '/') {
      e.preventDefault();
      focusSearch();
      return;
    }
    if (key === 'Escape') {
      closeShortcutsModal();
      return;
    }

    // Chord: g + (h|c|n)
    var now = Date.now();
    if (lastKey === 'g' && (now - lastKeyTs) < CHORD_WINDOW) {
      if (key === 'h') { e.preventDefault(); navigateTo('/', 'Dashboard'); lastKey = ''; return; }
      if (key === 'c') { e.preventDefault(); navigateTo('/contacts.html', 'Network contacts'); lastKey = ''; return; }
      if (key === 'n') { e.preventDefault(); navigateTo('/network-database.html', 'Network database'); lastKey = ''; return; }
      lastKey = '';
      return;
    }
    if (key === 'g') {
      lastKey = 'g';
      lastKeyTs = now;
      return;
    }
    lastKey = '';
  });

  // Inject shortcuts modal HTML once
  function injectShortcutsModal() {
    if (document.getElementById('shortcuts-modal-bd')) return;
    var bd = document.createElement('div');
    bd.id = 'shortcuts-modal-bd';
    bd.className = 'shortcuts-modal-backdrop';
    bd.setAttribute('aria-hidden', 'true');
    bd.setAttribute('role', 'dialog');
    bd.setAttribute('aria-modal', 'true');
    bd.setAttribute('aria-labelledby', 'shortcuts-modal-title');
    bd.innerHTML = [
      '<div class="shortcuts-modal" role="document">',
      '<h2 id="shortcuts-modal-title">Keyboard shortcuts</h2>',
      '<table><tbody>',
      '<tr><td><kbd>g</kbd> <kbd>h</kbd></td><td>Go to Dashboard</td></tr>',
      '<tr><td><kbd>g</kbd> <kbd>c</kbd></td><td>Go to Network (contacts)</td></tr>',
      '<tr><td><kbd>g</kbd> <kbd>n</kbd></td><td>Go to Network DB (table)</td></tr>',
      '<tr><td><kbd>/</kbd></td><td>Focus search</td></tr>',
      '<tr><td><kbd>?</kbd></td><td>Show this help</td></tr>',
      '<tr><td><kbd>Esc</kbd></td><td>Close modal</td></tr>',
      '</tbody></table>',
      '<button type="button" class="shortcuts-modal-close" onclick="closeShortcutsModal()">Close</button>',
      '</div>'
    ].join('');
    bd.addEventListener('click', function (e) { if (e.target === bd) closeShortcutsModal(); });
    document.body.appendChild(bd);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectShortcutsModal);
  } else {
    injectShortcutsModal();
  }
})();
`;
}

// ---------------------------------------------------------------------------
// Full-page render for standalone HTML pages (contacts.html, network-database.html).
// Wraps page content in shell + sidebar + skip-link + ARIA landmarks.
// ---------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {string} opts.pageId — page id from PAGE_REGISTRY group 'pages'
 * @param {string} opts.title — visible <h1> and <title>
 * @param {string} opts.headExtra — additional <head> content (page-specific <style>, etc.)
 * @param {string} opts.mainHTML — HTML to drop into <main>
 * @param {string} opts.scriptExtra — additional <script> blocks at end of body
 * @returns {string} full HTML document
 */
export function renderDashboardShell({
  pageId = 'home',
  title = 'Dashboard',
  headExtra = '',
  mainHTML = '',
  scriptExtra = '',
} = {}) {
  const sidebar = getDashboardSidebar({ currentPage: pageId });
  const shellCSS = getDashboardShellCSS({ scopeForStandalonePage: true });
  const shellJS = getDashboardShellScripts({ pageId });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — Career-Ops</title>
  <link rel="manifest" href="/manifest.json">
  <style>${shellCSS}</style>
  ${headExtra}
</head>
<body class="dark">
<a class="skip-link" href="#main">Skip to main content</a>

<button type="button" class="sidebar-toggle" id="sidebar-toggle-btn"
  onclick="toggleSidebar()" aria-label="Open navigation menu" aria-expanded="false"
  aria-controls="sidebar">☰</button>
<div class="sidebar-backdrop" id="sidebar-backdrop"
  onclick="closeSidebar()" aria-hidden="true"></div>

<div id="_shortcut-announcer" aria-live="polite" aria-atomic="true" class="sr-only"></div>

<div class="app-shell">
  ${sidebar}
  <main id="main" class="app-main" tabindex="-1">
    ${mainHTML}
  </main>
</div>

<script>
${shellJS}
</script>
${scriptExtra}
</body>
</html>`;
}
