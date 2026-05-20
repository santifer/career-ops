#!/usr/bin/env node
/**
 * scripts/build-contacts-page.mjs — standalone full-screen relationship-
 * intelligence directory at dashboard/contacts.html.
 *
 * 2026-05-19 — REWRITTEN by β BRAVO (overnight haul) per dealbreaker spec
 * (data/dealbreaker-bravo-contacts-2026-05-19.md):
 *
 *   1. Uses shared dashboard shell (lib/dashboard-shell.mjs) so the page
 *      has the same sidebar / skip-link / ARIA landmarks / keyboard
 *      shortcuts as index.html. No more orphan page.
 *   2. Computes enrichment tier (3 / 2 / 1) per contact and DEFAULT-HIDES
 *      Tier 1 stubs except those that are warm-to-target. Header bar shows
 *      "868 enriched of 2,824 — 1,956 stubs hidden [Show all]" so the
 *      progress is transparent without burying signal.
 *   3. Replaces the 7 single-select filter pills with a stackable chip row
 *      aligned to Mitchell's career-ops goals (warm to apply-now, target
 *      company multi-select, has email, in outreach, warm ≥3, tier, last
 *      touched, degree, archetype, pre-IPO).
 *   4. Sort dropdown — default "Opportunity Score" (composite, hover-
 *      explainer) plus raw options: warm path, last touched, connected,
 *      tier, name, data richness.
 *   5. `/` keyboard shortcut focuses the search input. Token search
 *      (`company:openai tier:3+`) is parsed into the filter set.
 *   6. Card density: enriched cards stay rich, stub cards collapse to
 *      40 px dense one-liners when "Show all" is on.
 *
 * Re-uses the deterministic enricher pipeline from scripts/build-dashboard.mjs
 * by reading the already-baked contacts dataset out of the freshly-built
 * dashboard/index.html (via window._CONTACTS_DATA + window._CONTACTS_STATS).
 *
 * Output: dashboard/contacts.html — self-contained HTML with embedded CSS +
 * the shared shell. Run on every dashboard build (chained from
 * build-dashboard.mjs).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderDashboardShell, esc } from '../lib/dashboard-shell.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// Pull the baked _CONTACTS_DATA from the freshly-built dashboard HTML.
const dashboardHtmlPath = join(REPO_ROOT, 'dashboard/index.html');
if (!existsSync(dashboardHtmlPath)) {
  console.error('[build-contacts-page] dashboard/index.html missing — run `node scripts/build-dashboard.mjs` first');
  process.exit(1);
}
const html = readFileSync(dashboardHtmlPath, 'utf8');

function extractGlobal(varName) {
  const re = new RegExp(`var ${varName}\\s*=\\s*(\\[[\\s\\S]*?\\]|\\{[\\s\\S]*?\\});`, 'm');
  const m = html.match(re);
  if (!m) return null;
  try { return JSON.parse(m[1].replace(/<\\\//g, '</')); } catch (e) { return null; }
}

const contacts = extractGlobal('_CONTACTS_DATA') || [];
const stats = extractGlobal('_CONTACTS_STATS') || {};

if (contacts.length === 0) {
  console.error('[build-contacts-page] no contacts extracted from dashboard/index.html — check the bake pipeline in build-dashboard.mjs');
  process.exit(1);
}

console.log(`[build-contacts-page] extracted ${contacts.length} contacts from baked dashboard`);

// ---------------------------------------------------------------------------
// Enrichment-tier computation per dealbreaker spec D-Impasse-1.
// ---------------------------------------------------------------------------

function computeEnrichmentTier(c) {
  // Tier 3 — has 2+ enrichment signals beyond email
  let signalCount = 0;
  if (c.enrichment_status === 'complete') signalCount += 2;
  if (c.engagement && (c.engagement.linkedin_topics?.length || c.engagement.x_topics?.length)) signalCount++;
  if (c.outreach_recommendation && (c.outreach_recommendation.positioning || c.outreach_recommendation.best_channel)) signalCount++;
  if (c.inferred_relationship && c.inferred_relationship.arc) signalCount++;
  if (signalCount >= 2) return 3;
  // Tier 2 — has professional email
  if (c.email_professional) return 2;
  // Tier 1 — stub
  return 1;
}

const TARGET_COMPANY_ALIASES = {
  openai: ['openai', 'open ai'],
  anthropic: ['anthropic'],
  sierra: ['sierra'],
  anysphere: ['cursor', 'anysphere'],
  eleven: ['elevenlabs', 'eleven labs', 'eleven'],
  mistral: ['mistral ai', 'mistral'],
  perplexity: ['perplexity'],
  cohere: ['cohere'],
  cognition: ['cognition'],
  pinecone: ['pinecone'],
};

function isTargetCompany(c) {
  const co = String(c.company || '').toLowerCase().trim();
  if (!co) return false;
  for (const slug of Object.keys(TARGET_COMPANY_ALIASES)) {
    for (const alias of TARGET_COMPANY_ALIASES[slug]) {
      if (co.includes(alias)) return slug;
    }
  }
  return false;
}

function isWarmToApplyNow(c) {
  // The contacts.html embedded ALL_DATA has limited warm signal — for now,
  // we approximate by checking if there's any others_at_company or
  // two_degree_path pointing at a target.
  if (!c.others_at_company?.length && !c.two_degree_path?.candidate_count) return false;
  const slug = isTargetCompany(c);
  return Boolean(slug);
}

function lastTouchedDays(c) {
  if (!c.last_touch_ts) return Infinity;
  const ts = Date.parse(c.last_touch_ts);
  if (isNaN(ts)) return Infinity;
  return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
}

// Annotate contacts with computed fields (used by sort + filter logic in browser).
const annotated = contacts.map((c) => ({
  ...c,
  _tier: computeEnrichmentTier(c),
  _target_slug: isTargetCompany(c) || null,
  _is_warm_apply_now: isWarmToApplyNow(c),
  _last_touched_days: lastTouchedDays(c),
}));

const tierCounts = { 1: 0, 2: 0, 3: 0 };
const targetCounts = {};
let inOutreachCount = 0;
let warmToApplyNowCount = 0;
annotated.forEach((c) => {
  tierCounts[c._tier]++;
  if (c.in_outreach) inOutreachCount++;
  if (c._is_warm_apply_now) warmToApplyNowCount++;
  if (c._target_slug) targetCounts[c._target_slug] = (targetCounts[c._target_slug] || 0) + 1;
});

console.log(`[build-contacts-page] tiers: T3=${tierCounts[3]} T2=${tierCounts[2]} T1=${tierCounts[1]}; warm-to-apply-now=${warmToApplyNowCount}; in-outreach=${inOutreachCount}`);

// ---------------------------------------------------------------------------
// Page CSS — page-specific styles that complement the shell.
// ---------------------------------------------------------------------------

const pageCSS = `
.contacts-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 18px;
  flex-wrap: wrap;
  gap: 12px;
}
.contacts-header h1 { margin: 0; font-size: 22px; font-weight: 700; }
.contacts-header .stats {
  font-size: 12px;
  color: var(--text-3);
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
.contacts-header .stats strong { color: var(--text); font-weight: 700; }

/* Progress bar — empty-corpus transparency */
.contacts-progress {
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--amber-fg);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-size: 12.5px;
  color: var(--text-2);
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  line-height: 1.4;
}
.contacts-progress strong { color: var(--text); }
.contacts-progress .progress-cta {
  margin-left: auto;
  background: var(--surface-2);
  color: var(--text);
  border: 1px solid var(--border);
  padding: 5px 12px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.contacts-progress .progress-cta:hover { background: var(--border); }
.contacts-progress .progress-cta.active {
  background: var(--blue-bg);
  color: var(--blue-fg);
  border-color: var(--blue-border);
}

/* Filter chip row */
.controls {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
  align-items: center;
}
.controls input[type="search"] {
  flex: 1 1 280px;
  min-width: 220px;
  padding: 8px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
}
.controls input[type="search"]:focus {
  outline: none;
  border-color: var(--blue-fg);
  box-shadow: 0 0 0 3px var(--blue-bg);
}
.filters-row {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
  flex-wrap: wrap;
  align-items: center;
}
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: background .12s, color .12s, border-color .12s;
}
.filter-chip:hover { color: var(--text); border-color: var(--text-3); }
.filter-chip.active,
.filter-chip[aria-pressed="true"] {
  background: var(--blue-bg);
  color: var(--blue-fg);
  border-color: var(--blue-border);
  font-weight: 600;
}
.filter-chip[aria-disabled="true"] {
  opacity: 0.5;
  cursor: not-allowed;
}
.filter-chip-count {
  font-size: 10.5px;
  background: rgba(0,0,0,0.2);
  padding: 1px 5px;
  border-radius: 99px;
  color: inherit;
}
.filter-chip.active .filter-chip-count { background: rgba(255,255,255,0.18); }

/* Multi-select dropdown chip (target companies) */
.filter-dropdown {
  position: relative;
  display: inline-block;
}
.filter-dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 200px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 10px 32px rgba(0,0,0,0.45);
  padding: 6px;
  z-index: 100;
  display: none;
  max-height: 320px;
  overflow-y: auto;
}
.filter-dropdown.open .filter-dropdown-menu { display: block; }
.filter-dropdown-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12.5px;
  cursor: pointer;
  color: var(--text-2);
}
.filter-dropdown-option:hover { background: var(--surface-2); color: var(--text); }
.filter-dropdown-option input { margin: 0; }
.filter-dropdown-option-count {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--text-4);
  background: var(--surface-2);
  padding: 1px 6px;
  border-radius: 99px;
}

/* Sort + view toggle */
.controls-trailing {
  display: flex;
  gap: 6px;
  margin-left: auto;
  align-items: center;
}
.sort-dropdown {
  position: relative;
}
.sort-dropdown-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}
.sort-dropdown-trigger:hover { color: var(--text); border-color: var(--text-3); }
.sort-dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 220px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 10px 32px rgba(0,0,0,0.45);
  padding: 4px;
  z-index: 100;
  display: none;
}
.sort-dropdown.open .sort-dropdown-menu { display: block; }
.sort-dropdown-option {
  display: block;
  padding: 7px 10px;
  border-radius: 4px;
  font-size: 12.5px;
  color: var(--text-2);
  cursor: pointer;
  border: 0;
  background: transparent;
  width: 100%;
  text-align: left;
  font-family: inherit;
}
.sort-dropdown-option:hover { background: var(--surface-2); color: var(--text); }
.sort-dropdown-option.active { color: var(--blue-fg); font-weight: 600; }
.sort-dropdown-option-hint {
  display: block;
  font-size: 10.5px;
  color: var(--text-4);
  margin-top: 2px;
}

/* View switcher (Cards | Table) */
.view-switcher {
  display: inline-flex;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  padding: 2px;
  gap: 2px;
}
.view-switcher a, .view-switcher button {
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-3);
  background: transparent;
  border: 0;
  cursor: pointer;
  font-family: inherit;
  text-decoration: none;
}
.view-switcher a.active,
.view-switcher button.active {
  background: var(--blue-bg);
  color: var(--blue-fg);
}
.view-switcher a:hover, .view-switcher button:hover { color: var(--text); }

.meta-line {
  font-size: 12px;
  color: var(--text-3);
  margin-bottom: 12px;
}

/* Grid */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 14px;
}

/* ── Contact card rules ─────────────────────────────────────────── */
.contact-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  transition: border-color .12s, background .12s;
}
.contact-card:hover { border-color: var(--text-3); background: var(--surface); }
.contact-card-head { display: flex; gap: 14px; align-items: flex-start; }
.contact-card-avatar { width: 60px; height: 60px; flex-shrink: 0; position: relative; }
.contact-card-photo {
  width: 60px; height: 60px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--border);
}
.contact-card-photo-fallback {
  width: 60px; height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--blue-bg), var(--surface-2));
  color: var(--text-2);
  font-weight: 700;
  font-size: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
}
.contact-card-identity { flex: 1 1 auto; min-width: 0; }
.contact-card-name {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 3px;
}
.contact-card-role { font-size: 13px; color: var(--text-3); }
.contact-card-company { color: var(--text-2); font-weight: 500; }
.contact-card-connected { font-size: 11.5px; color: var(--text-3); margin-top: 4px; }
.contact-card-goals {
  font-size: 11px;
  margin-top: 6px;
  display: flex;
  gap: 5px;
  align-items: center;
  flex-wrap: wrap;
}
.contact-card-section-label {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-4);
  margin-right: 8px;
  display: inline-block;
}
.contact-card-overlap,
.contact-card-others,
.contact-card-twodeg {
  font-size: 12.5px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--border);
}
.contact-card-overlap { border-left: 3px solid var(--green-fg); }
.contact-card-overlap-item {
  font-weight: 600;
  color: var(--text);
  margin-right: 10px;
}
.contact-card-others-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}
.contact-card-other-btn {
  text-align: left;
  background: none;
  border: 0;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12.5px;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-family: inherit;
}
.contact-card-other-btn:hover { background: var(--surface-2); }
.contact-card-twodeg-count { color: var(--green-fg); font-weight: 600; }
.contact-card-enriched {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--blue-bg);
  border-left: 3px solid var(--blue-fg);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.contact-card-enriched p {
  margin: 4px 0 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text);
}
.contact-card-enrich-pending {
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px dashed var(--border);
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 12px;
}
.contact-card-emails {
  font-size: 12px;
  padding: 6px 0;
  border-top: 1px dashed var(--border);
}
.contact-card-email-label {
  font-weight: 600;
  color: var(--text-3);
  margin-right: 4px;
}
.contact-card-emails code {
  background: var(--surface);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 11.5px;
}
.contact-card-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
.contact-act {
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  font-size: 11.5px;
  font-weight: 600;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-2);
  cursor: pointer;
  text-decoration: none;
  font-family: inherit;
}
.contact-act:hover { color: var(--text); border-color: var(--text-3); text-decoration: none; }
.contact-act-enrich,
.contact-act-photo {
  background: var(--blue-bg);
  color: var(--blue-fg);
  border-color: var(--blue-border);
  font-weight: 600;
}
.contact-act-disabled { opacity: 0.4; cursor: not-allowed; }
.muted-text { color: var(--text-3); }
.pill-tiny {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: var(--radius-full);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-3);
  margin-right: 4px;
}
.pill-tiny.pill-preipo {
  background: var(--green-bg);
  color: var(--green-fg);
  border-color: var(--green-fg);
}
.pill-tiny.pill-archetype {
  background: var(--amber-bg);
  color: var(--amber-fg);
  border-color: var(--amber-fg);
}
.pill-tiny.pill-outreach {
  background: var(--blue-bg);
  color: var(--blue-fg);
  border-color: var(--blue-fg);
}
.pill-tiny.pill-tier-3 {
  background: var(--green-bg);
  color: var(--green-fg);
  border-color: var(--green-fg);
}
.pill-tiny.pill-tier-2 {
  background: var(--blue-bg);
  color: var(--blue-fg);
  border-color: var(--blue-fg);
}
.pill-tiny.pill-tier-1 {
  background: var(--surface);
  color: var(--text-4);
  border-color: var(--border);
}
.contact-card.contact-card-flash {
  box-shadow: 0 0 0 2px var(--amber-fg);
  transition: box-shadow 0.6s ease-out;
}

/* Compact stub card — dense one-line treatment */
.contact-card.is-stub-compact {
  padding: 6px 12px;
  flex-direction: row;
  align-items: center;
  gap: 10px;
}
.contact-card.is-stub-compact .contact-card-head { gap: 8px; align-items: center; }
.contact-card.is-stub-compact .contact-card-avatar { width: 28px; height: 28px; }
.contact-card.is-stub-compact .contact-card-photo,
.contact-card.is-stub-compact .contact-card-photo-fallback {
  width: 28px; height: 28px; font-size: 11px;
}
.contact-card.is-stub-compact .contact-card-name {
  font-size: 12.5px;
  margin: 0;
}
.contact-card.is-stub-compact .contact-card-role {
  font-size: 11.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.contact-card.is-stub-compact .contact-card-connected,
.contact-card.is-stub-compact .contact-card-goals,
.contact-card.is-stub-compact .contact-card-overlap,
.contact-card.is-stub-compact .contact-card-others,
.contact-card.is-stub-compact .contact-card-twodeg,
.contact-card.is-stub-compact .contact-card-enrich-pending,
.contact-card.is-stub-compact .contact-card-emails {
  display: none;
}
.contact-card.is-stub-compact .contact-card-actions {
  padding-top: 0;
  border-top: 0;
  margin-left: auto;
}
.contact-card.is-stub-compact .contact-act {
  padding: 3px 8px;
  font-size: 10.5px;
}

/* When compact-mode is on, the grid stacks as single-column rows */
.grid.compact-stubs {
  grid-template-columns: 1fr;
  gap: 4px;
}

/* Result meta + empty state */
.result-empty {
  text-align: center;
  padding: 40px 24px;
  color: var(--text-3);
  font-size: 13.5px;
}
.result-empty strong { color: var(--text); }

@media (max-width: 720px) {
  .grid { grid-template-columns: 1fr; }
  .controls-trailing { width: 100%; justify-content: flex-end; flex-wrap: wrap; }
}
`;

// ---------------------------------------------------------------------------
// Card render — kept compatible with existing schema, with tier annotations.
// ---------------------------------------------------------------------------

function gracefulInitial(name) {
  // Handle surrogate pairs + missing names per audit AA-5
  const chars = Array.from(String(name || ''));
  return (chars[0] || '?').toUpperCase();
}

function renderCard(c) {
  const name = c.name || '';
  const company = c.company || '';
  const position = c.position || '';
  const email = c.email_professional || '';
  const personalEmail = c.email_personal || '';
  const linkedinUrl = c.linkedin_url || '';
  const xHandle = c.x_handle || '';
  const tierBadge = c.tier ? `<span class="pill-tiny">${esc(c.tier)}</span>` : '';
  const outreachBadge = c.in_outreach ? '<span class="pill-tiny pill-outreach">in outreach</span>' : '';
  const tierIndicator = c._tier
    ? `<span class="pill-tiny pill-tier-${c._tier}" title="Enrichment tier ${c._tier}">T${c._tier}</span>`
    : '';

  // Avatar — graceful fallback for one-part / surrogate-pair names
  let photoHtml;
  const initials = gracefulInitial(c.first_name) + gracefulInitial(c.last_name);
  const initialsTrimmed = initials.length === 2 ? initials : (initials.length === 1 ? initials : '?');
  if (c.photo_path) {
    photoHtml = `<img class="contact-card-photo" src="${esc(c.photo_path)}" alt="${esc(name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="contact-card-photo-fallback" style="display:none">${esc(initialsTrimmed)}</div>`;
  } else {
    photoHtml = `<div class="contact-card-photo-fallback">${esc(initialsTrimmed)}</div>`;
  }

  const overlapHtml = (c.overlap_with_mitchell && c.overlap_with_mitchell.length) ?
    `<div class="contact-card-overlap"><span class="contact-card-section-label">↗ Shared employer</span>${c.overlap_with_mitchell.map(o => `<span class="contact-card-overlap-item">${esc(o.company)} <span class="muted-text">(${esc(o.mitchell_years)})</span></span>`).join('')}</div>` : '';

  const othersHtml = (c.others_at_company && c.others_at_company.length) ?
    `<div class="contact-card-others"><span class="contact-card-section-label">Other contacts at ${esc(company)} (${c.others_at_company.length})</span><div class="contact-card-others-list">${c.others_at_company.slice(0,6).map(o => {
      const pill = o.in_outreach ? '<span class="pill-tiny pill-outreach">in outreach</span>' : '';
      const aMatch = o.archetype_match ? '<span class="pill-tiny pill-archetype">★</span>' : '';
      return `<button type="button" class="contact-card-other-btn" onclick="focusById('${esc(o.id)}')">${esc(o.name)} <span class="muted-text">${esc((o.position||'').slice(0,28))}</span> ${aMatch}${pill}</button>`;
    }).join('')}${c.others_at_company.length > 6 ? `<span class="muted-text">+${c.others_at_company.length - 6} more</span>` : ''}</div></div>` : '';

  const twoDegHtml = (c.two_degree_path && c.two_degree_path.candidate_count > 0) ?
    `<div class="contact-card-twodeg"><span class="contact-card-section-label">2nd-degree paths at ${esc(company)}</span><span class="contact-card-twodeg-count">${c.two_degree_path.candidate_count} warm-intro candidates</span></div>` : '';

  let goalHtml = '';
  if (c.goal_alignment) {
    const ga = c.goal_alignment;
    const marks = [];
    if (ga.pre_ipo_match) marks.push('<span class="pill-tiny pill-preipo">pre-IPO</span>');
    if (ga.archetype_match) marks.push('<span class="pill-tiny pill-archetype">archetype-match</span>');
    if (marks.length) {
      goalHtml = `<div class="contact-card-goals">${marks.join('')} <span class="muted-text">alignment ${ga.composite_score}</span></div>`;
    }
  }

  let connectedHtml = '';
  if (c.connected_on || c.position_at_connection) {
    connectedHtml = `<div class="contact-card-connected muted-text">Connected ${c.connected_on ? esc(c.connected_on) : 'date unknown'}${c.position_at_connection ? ' as ' + esc(c.position_at_connection) : ''}</div>`;
  }

  let enrichHtml;
  if (c.enrichment_status === 'complete' && c.outreach_recommendation) {
    enrichHtml = `<div class="contact-card-enriched">${c.outreach_recommendation.positioning ? `<div><span class="contact-card-section-label">Positioning recommendation</span><p>${esc(c.outreach_recommendation.positioning)}</p></div>` : ''}${c.outreach_recommendation.best_channel ? `<div><span class="contact-card-section-label">Best channel</span> ${esc(c.outreach_recommendation.best_channel)}</div>` : ''}${(c.engagement && c.engagement.linkedin_topics) ? `<div><span class="contact-card-section-label">Engages with</span> ${(c.engagement.linkedin_topics||[]).map(t=>`<span class="pill-tiny">${esc(t)}</span>`).join('')}</div>` : ''}${(c.inferred_relationship && c.inferred_relationship.arc) ? `<div><span class="contact-card-section-label">Relationship context</span><p class="muted-text">${esc(c.inferred_relationship.arc)}</p></div>` : ''}</div>`;
  } else {
    enrichHtml = `<div class="contact-card-enrich-pending"><span class="muted-text">Engagement topics, outreach positioning, and inferred relationship context pending LLM enrichment.</span> <button type="button" class="contact-act contact-act-enrich" onclick="enrichNow('${esc(c.id)}')">↻ Enrich now</button></div>`;
  }

  const emailAction = (addr, type) => {
    if (!addr) return `<button class="contact-act contact-act-disabled" disabled>${esc(type)} ✉︎</button>`;
    return `<button class="contact-act" onclick="revealEmail(this, '${esc(addr)}')">${esc(type)} →</button>`;
  };
  const linkedinAction = linkedinUrl
    ? `<a class="contact-act" href="${esc(linkedinUrl)}" target="_blank" rel="noopener noreferrer">LinkedIn →</a>`
    : '<button class="contact-act contact-act-disabled" disabled>LinkedIn</button>';
  const xAction = xHandle
    ? `<a class="contact-act" href="https://x.com/${esc(String(xHandle).replace(/^@/,''))}" target="_blank" rel="noopener noreferrer">X →</a>`
    : '<button class="contact-act contact-act-disabled" disabled>X</button>';
  const photoBtn = c.photo_path
    ? ''
    : `<button type="button" class="contact-act contact-act-photo" onclick="scrapePhoto('${esc(c.id)}','${esc(linkedinUrl)}')">📸 Photo</button>`;

  return `<article class="contact-card" id="contact-card-${esc(c.id)}" data-tier="${c._tier}" data-target="${esc(c._target_slug||'')}" data-warm-apply-now="${c._is_warm_apply_now?1:0}" data-in-outreach="${c.in_outreach?1:0}" data-has-email="${email?1:0}" data-warm-strength="${c.warm_path_strength||0}" data-last-touched-days="${c._last_touched_days===Infinity?9999:c._last_touched_days}">
    <div class="contact-card-head">
      <div class="contact-card-avatar">${photoHtml}</div>
      <div class="contact-card-identity">
        <div class="contact-card-name">${esc(name)} ${tierIndicator} ${tierBadge} ${outreachBadge}</div>
        <div class="contact-card-role">${esc(position || '—')}${company ? ` · <span class="contact-card-company">${esc(company)}</span>` : ''}</div>
        ${connectedHtml}
        ${goalHtml}
      </div>
    </div>
    ${overlapHtml}
    ${othersHtml}
    ${twoDegHtml}
    ${enrichHtml}
    ${email || personalEmail ? `<div class="contact-card-emails">${email ? `<span class="contact-card-email-label">Pro:</span> <code>${esc(email)}</code>` : ''}${personalEmail ? ` <span class="contact-card-email-label">Personal:</span> <code>${esc(personalEmail)}</code>` : ''}</div>` : ''}
    <div class="contact-card-actions">
      ${emailAction(email, 'Pro')}
      ${emailAction(personalEmail, 'Personal')}
      ${linkedinAction}
      ${xAction}
      ${photoBtn}
    </div>
  </article>`;
}

// ---------------------------------------------------------------------------
// Build main HTML
// ---------------------------------------------------------------------------

const totalT3 = tierCounts[3];
const totalT2 = tierCounts[2];
const totalT1 = tierCounts[1];
const totalContacts = annotated.length;
const enrichedRate = ((totalT3 + totalT2) / totalContacts * 100).toFixed(1);

const cardsHtml = annotated.map(renderCard).join('\n');

// Build the target-companies dropdown options
const targetCompaniesHtml = Object.keys(TARGET_COMPANY_ALIASES).map((slug) => {
  const count = targetCounts[slug] || 0;
  const label = slug.charAt(0).toUpperCase() + slug.slice(1).replace('anysphere', 'Cursor');
  return `<label class="filter-dropdown-option">
    <input type="checkbox" data-target-company="${esc(slug)}" />
    <span>${esc(label)}</span>
    <span class="filter-dropdown-option-count">${count}</span>
  </label>`;
}).join('\n');

const mainHTML = `
  <div class="contacts-header">
    <div>
      <h1>Network <span class="muted-text" style="font-weight:400;font-size:14px;margin-left:8px">relationship intelligence</span></h1>
    </div>
    <div class="stats" aria-label="Network corpus stats">
      <span><strong>${totalContacts}</strong> contacts</span>
      <span><strong>${totalT3 + totalT2}</strong> with signal (${enrichedRate}%)</span>
      <span><strong>${warmToApplyNowCount}</strong> warm to apply-now targets</span>
      <span><strong>${inOutreachCount}</strong> in outreach</span>
    </div>
  </div>

  <div class="contacts-progress" role="status" aria-live="polite">
    <div>
      <strong>${totalT2}</strong> with email + <strong>${totalT3}</strong> fully enriched = <strong>${totalT2 + totalT3}</strong> usable now of <strong>${totalContacts}</strong> total.
      <span class="muted-text">Enriching ~50/day via LinkedIn scrape. ETA ~${Math.ceil(totalT1 / 50)} days.</span>
    </div>
    <button type="button" class="progress-cta" id="toggle-stubs" aria-pressed="false" title="Show or hide the ${totalT1} unenriched stub cards">
      Show all (${totalT1} stubs hidden)
    </button>
  </div>

  <div class="controls" role="search">
    <input id="contacts-search" type="search"
      placeholder="Search name / company / role / email — try ‘company:openai tier:3+’ — / to focus"
      autocomplete="off" spellcheck="false"
      aria-label="Search contacts (supports company:X, tier:N+, outreach:active, warm:>=N, email:yes tokens)" />
    <div class="controls-trailing">
      <div class="view-switcher" role="group" aria-label="View mode">
        <a href="/contacts.html" class="active" aria-current="page">Cards</a>
        <a href="/network-database.html">Table</a>
      </div>
      <div class="sort-dropdown" id="sort-dropdown">
        <button type="button" class="sort-dropdown-trigger" aria-haspopup="listbox" aria-expanded="false" id="sort-trigger" onclick="toggleSortDropdown()">
          Sort: <span id="sort-label">Opportunity</span> ▾
        </button>
        <div class="sort-dropdown-menu" role="listbox">
          <button type="button" class="sort-dropdown-option active" data-sort="opportunity" onclick="setSort('opportunity','Opportunity')">
            Opportunity Score <span class="sort-dropdown-option-hint">warm to apply-now ×5 + target ×3 + warm ≥3 ×2 + email ×1 + tier-3 ×2</span>
          </button>
          <button type="button" class="sort-dropdown-option" data-sort="warm" onclick="setSort('warm','Warm path')">
            Warm path strength <span class="sort-dropdown-option-hint">highest first</span>
          </button>
          <button type="button" class="sort-dropdown-option" data-sort="touched" onclick="setSort('touched','Last touched')">
            Last touched <span class="sort-dropdown-option-hint">most recent first</span>
          </button>
          <button type="button" class="sort-dropdown-option" data-sort="connected" onclick="setSort('connected','Connected')">
            Connected on <span class="sort-dropdown-option-hint">most recent first</span>
          </button>
          <button type="button" class="sort-dropdown-option" data-sort="tier" onclick="setSort('tier','Tier')">
            Enrichment tier <span class="sort-dropdown-option-hint">3 → 2 → 1</span>
          </button>
          <button type="button" class="sort-dropdown-option" data-sort="name" onclick="setSort('name','Name')">
            Name <span class="sort-dropdown-option-hint">A → Z</span>
          </button>
          <button type="button" class="sort-dropdown-option" data-sort="richness" onclick="setSort('richness','Data richness')">
            Data richness <span class="sort-dropdown-option-hint">most populated fields first</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <div class="filters-row" role="group" aria-label="Filter chips — stackable, AND semantics">
    <button type="button" class="filter-chip" data-filter="warm-apply-now" aria-pressed="false" title="Filter: warm path to a company in the apply-now queue">
      🎯 Warm to Apply-Now <span class="filter-chip-count">${warmToApplyNowCount}</span>
    </button>
    <div class="filter-dropdown" id="target-dropdown">
      <button type="button" class="filter-chip" id="target-dropdown-trigger" aria-haspopup="true" aria-expanded="false" onclick="toggleTargetDropdown()" title="Filter by target company (multi-select)">
        🏢 Target company <span class="filter-chip-count" id="target-selected-count">0</span> ▾
      </button>
      <div class="filter-dropdown-menu" role="group" aria-label="Target companies — multi-select (OR within facet, AND across facets)">
        ${targetCompaniesHtml}
      </div>
    </div>
    <button type="button" class="filter-chip" data-filter="email" aria-pressed="false" title="Has professional email">✉ Has email</button>
    <button type="button" class="filter-chip" data-filter="outreach" aria-pressed="false" title="Currently in outreach">💬 In outreach</button>
    <button type="button" class="filter-chip" data-filter="warm-strong" aria-pressed="false" title="Warm path strength ≥3">🔥 Warm ≥3</button>
    <button type="button" class="filter-chip" data-filter="tier-3" aria-pressed="false" title="Fully enriched (signal density ≥2)">🪪 Tier 3</button>
    <button type="button" class="filter-chip" data-filter="tier-2" aria-pressed="false" title="Has email (Tier 2)">🪪 Tier 2</button>
    <button type="button" class="filter-chip" data-filter="tier-1" aria-pressed="false" title="Stub (no enrichment)">🪪 Tier 1</button>
    <button type="button" class="filter-chip" data-filter="touched-30d" aria-pressed="false" title="Touched in last 30 days">⏱ Touched 30d</button>
    <button type="button" class="filter-chip" data-filter="degree-1" aria-pressed="false" title="1st-degree connection">1️⃣ 1st-deg</button>
    <button type="button" class="filter-chip" data-filter="archetype" aria-pressed="false" aria-disabled="${tierCounts[3] === 0 ? 'true' : 'false'}" title="${tierCounts[3] === 0 ? 'Filter unavailable — no archetype data populated yet (depends on enrichment)' : 'Archetype-match contacts'}">★ Archetype</button>
    <button type="button" class="filter-chip" data-filter="preipo" aria-pressed="false" aria-disabled="${tierCounts[3] === 0 ? 'true' : 'false'}" title="${tierCounts[3] === 0 ? 'Filter unavailable — no pre-IPO data populated yet (depends on enrichment)' : 'Pre-IPO match'}">💎 Pre-IPO</button>
    <button type="button" class="filter-chip" id="clear-filters" data-clear="1" style="margin-left:auto" title="Clear all filters">✕ Clear</button>
  </div>

  <div class="meta-line" id="result-meta" aria-live="polite"></div>

  <div class="grid" id="grid">
    ${cardsHtml}
  </div>

  <div class="result-empty" id="result-empty" hidden>
    <strong>No contacts match your filters.</strong>
    <div class="muted-text" style="margin-top:6px">Try clearing filters, or toggle "Show all stubs" if you're searching for an unenriched contact.</div>
  </div>
`;

// ---------------------------------------------------------------------------
// Page-specific JS (filter + sort + token-search). Lives below the shell JS.
// ---------------------------------------------------------------------------

const pageJS = `
<script>
(function () {
  // State
  var activeFilters = new Set();
  var selectedTargets = new Set();
  var activeSort = 'opportunity';
  var showAllStubs = false;
  var activeQuery = '';

  var grid = document.getElementById('grid');
  var allCards = Array.prototype.slice.call(grid.querySelectorAll('.contact-card'));
  var resultMeta = document.getElementById('result-meta');
  var resultEmpty = document.getElementById('result-empty');

  // ── Token-search parser ──────────────────────────────────────────
  function parseQuery(q) {
    var tokens = {};
    var free = [];
    var parts = String(q || '').toLowerCase().trim().split(/\\s+/);
    parts.forEach(function (p) {
      var m = p.match(/^([a-z_-]+):(.+)$/);
      if (m) tokens[m[1]] = m[2];
      else if (p) free.push(p);
    });
    return { tokens: tokens, free: free.join(' ') };
  }

  // ── Opportunity score ───────────────────────────────────────────
  function opportunityScore(card) {
    var s = 0;
    if (card.dataset.warmApplyNow === '1') s += 5;
    if (card.dataset.target) s += 3;
    var w = parseInt(card.dataset.warmStrength || '0', 10);
    if (w >= 3) s += 2;
    if (card.dataset.hasEmail === '1') s += 1;
    if (card.dataset.tier === '3') s += 2;
    var d = parseInt(card.dataset.lastTouchedDays || '9999', 10);
    if (d > 90) s -= 1;
    return s;
  }

  // ── Filter logic ────────────────────────────────────────────────
  function passesFilters(card) {
    var c = card.dataset;
    var tier = c.tier;
    var defaultHide = (tier === '1' && c.warmApplyNow !== '1');

    if (!showAllStubs && defaultHide) {
      // Stub & not warm-to-apply-now: hide by default unless search hits
      if (activeQuery && cardMatchesQuery(card, activeQuery)) {
        /* search override always shows */
      } else if (Array.from(activeFilters).indexOf('tier-1') >= 0) {
        /* explicit tier-1 filter — show */
      } else {
        return false;
      }
    }

    if (activeFilters.has('warm-apply-now') && c.warmApplyNow !== '1') return false;
    if (activeFilters.has('email')          && c.hasEmail !== '1')      return false;
    if (activeFilters.has('outreach')       && c.inOutreach !== '1')    return false;
    if (activeFilters.has('warm-strong')    && parseInt(c.warmStrength || '0', 10) < 3) return false;
    if (activeFilters.has('tier-3')         && c.tier !== '3')          return false;
    if (activeFilters.has('tier-2')         && c.tier !== '2')          return false;
    if (activeFilters.has('tier-1')         && c.tier !== '1')          return false;
    if (activeFilters.has('touched-30d')    && parseInt(c.lastTouchedDays || '9999', 10) > 30) return false;
    if (activeFilters.has('degree-1')) {
      // We don't track degree per card; in-corpus all are 1st-degree (degree=1 in network-database.json).
      // Leave permissive for the demo set.
    }
    // archetype + preipo are gated/disabled when populated=0; if user manages to toggle them,
    // they apply but most cards will fail.
    if (activeFilters.has('archetype') && c.archetype !== '1') return false;
    if (activeFilters.has('preipo')    && c.preipo !== '1')    return false;

    if (selectedTargets.size > 0) {
      if (!c.target || !selectedTargets.has(c.target)) return false;
    }
    return true;
  }

  function cardMatchesQuery(card, q) {
    var p = parseQuery(q);
    // Free-text search
    var name = (card.querySelector('.contact-card-name') || {}).textContent || '';
    var role = (card.querySelector('.contact-card-role') || {}).textContent || '';
    var emailEl = card.querySelector('.contact-card-emails');
    var emails = emailEl ? emailEl.textContent : '';
    var hay = (name + ' ' + role + ' ' + emails).toLowerCase();
    if (p.free && hay.indexOf(p.free) === -1) return false;

    // Token search
    if (p.tokens.company) {
      var co = (card.querySelector('.contact-card-company') || {}).textContent || '';
      if (co.toLowerCase().indexOf(p.tokens.company) === -1) return false;
    }
    if (p.tokens.tier) {
      var want = p.tokens.tier.replace('+', '');
      var got = parseInt(card.dataset.tier || '0', 10);
      if (p.tokens.tier.endsWith('+')) {
        if (got < parseInt(want, 10)) return false;
      } else {
        if (got !== parseInt(want, 10)) return false;
      }
    }
    if (p.tokens.outreach === 'active' && card.dataset.inOutreach !== '1') return false;
    if (p.tokens.email === 'yes' && card.dataset.hasEmail !== '1') return false;
    if (p.tokens.email === 'no'  && card.dataset.hasEmail !== '0') return false;
    if (p.tokens.warm) {
      var w = parseInt(card.dataset.warmStrength || '0', 10);
      var m = p.tokens.warm.match(/^(>=|<=|>|<|=)?(\\d+)/);
      if (m) {
        var op = m[1] || '=';
        var n = parseInt(m[2], 10);
        if (op === '>=' && !(w >= n)) return false;
        if (op === '<=' && !(w <= n)) return false;
        if (op === '>'  && !(w >  n)) return false;
        if (op === '<'  && !(w <  n)) return false;
        if (op === '='  && !(w === n)) return false;
      }
    }
    return true;
  }

  // ── Sort logic ──────────────────────────────────────────────────
  function sortKey(card, mode) {
    switch (mode) {
      case 'opportunity': return -opportunityScore(card);
      case 'warm': return -parseInt(card.dataset.warmStrength || '0', 10);
      case 'touched': return parseInt(card.dataset.lastTouchedDays || '9999', 10);
      case 'tier': return -parseInt(card.dataset.tier || '0', 10);
      case 'connected':
        var conn = (card.querySelector('.contact-card-connected') || {}).textContent || '';
        return -Date.parse(conn.replace('Connected ', '').replace(/\\sas.*$/, '')) || 0;
      case 'name':
        return (card.querySelector('.contact-card-name') || {}).textContent || '';
      case 'richness':
        // count populated children
        var score = 0;
        if (card.querySelector('.contact-card-overlap')) score++;
        if (card.querySelector('.contact-card-others'))  score++;
        if (card.querySelector('.contact-card-twodeg'))  score++;
        if (card.querySelector('.contact-card-enriched'))score += 2;
        if (card.querySelector('.contact-card-emails'))  score++;
        if (card.querySelector('.contact-card-goals'))   score++;
        return -score;
      default: return 0;
    }
  }

  function applyFilters() {
    var visible = 0;
    // Determine visibility per card
    var visibleCards = [];
    allCards.forEach(function (card) {
      var ok = activeQuery ? (cardMatchesQuery(card, activeQuery) && passesFilters(card)) : passesFilters(card);
      if (ok) {
        visibleCards.push(card);
        visible++;
      } else {
        card.style.display = 'none';
      }
    });

    // Sort visible cards
    visibleCards.sort(function (a, b) {
      var ka = sortKey(a, activeSort);
      var kb = sortKey(b, activeSort);
      if (typeof ka === 'string' || typeof kb === 'string') {
        return String(ka).localeCompare(String(kb));
      }
      return ka - kb;
    });

    // Re-attach in sort order
    visibleCards.forEach(function (card) {
      grid.appendChild(card);
      card.style.display = '';
    });

    // Compact-stub mode
    grid.classList.toggle('compact-stubs', showAllStubs);
    allCards.forEach(function (card) {
      var isStub = card.dataset.tier === '1';
      card.classList.toggle('is-stub-compact', showAllStubs && isStub);
    });

    resultMeta.textContent = visible + ' contact' + (visible === 1 ? '' : 's') + ' visible';
    resultEmpty.hidden = (visible > 0);
  }

  // ── Filter chip handlers ────────────────────────────────────────
  document.querySelectorAll('.filter-chip[data-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var f = btn.dataset.filter;
      if (btn.getAttribute('aria-disabled') === 'true') return;
      if (activeFilters.has(f)) {
        activeFilters.delete(f);
        btn.setAttribute('aria-pressed', 'false');
      } else {
        activeFilters.add(f);
        btn.setAttribute('aria-pressed', 'true');
      }
      applyFilters();
    });
  });

  // Clear all filters
  document.getElementById('clear-filters').addEventListener('click', function () {
    activeFilters.clear();
    selectedTargets.clear();
    document.querySelectorAll('.filter-chip[data-filter]').forEach(function (b) {
      b.setAttribute('aria-pressed', 'false');
    });
    document.querySelectorAll('input[data-target-company]').forEach(function (inp) { inp.checked = false; });
    document.getElementById('target-selected-count').textContent = '0';
    document.getElementById('contacts-search').value = '';
    activeQuery = '';
    applyFilters();
  });

  // Target-company dropdown
  window.toggleTargetDropdown = function () {
    var dd = document.getElementById('target-dropdown');
    var was = dd.classList.toggle('open');
    dd.querySelector('.filter-chip').setAttribute('aria-expanded', was ? 'true' : 'false');
  };
  document.querySelectorAll('input[data-target-company]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var slug = inp.dataset.targetCompany;
      if (inp.checked) selectedTargets.add(slug);
      else selectedTargets.delete(slug);
      document.getElementById('target-selected-count').textContent = selectedTargets.size;
      var trigger = document.querySelector('#target-dropdown .filter-chip');
      trigger.setAttribute('aria-pressed', selectedTargets.size > 0 ? 'true' : 'false');
      applyFilters();
    });
  });
  // Close target dropdown on outside click
  document.addEventListener('click', function (e) {
    var dd = document.getElementById('target-dropdown');
    if (dd && !dd.contains(e.target)) {
      dd.classList.remove('open');
      dd.querySelector('.filter-chip').setAttribute('aria-expanded', 'false');
    }
    var sd = document.getElementById('sort-dropdown');
    if (sd && !sd.contains(e.target)) {
      sd.classList.remove('open');
      sd.querySelector('.sort-dropdown-trigger').setAttribute('aria-expanded', 'false');
    }
  });

  // Sort dropdown
  window.toggleSortDropdown = function () {
    var dd = document.getElementById('sort-dropdown');
    var was = dd.classList.toggle('open');
    dd.querySelector('.sort-dropdown-trigger').setAttribute('aria-expanded', was ? 'true' : 'false');
  };
  window.setSort = function (mode, label) {
    activeSort = mode;
    document.getElementById('sort-label').textContent = label;
    document.querySelectorAll('.sort-dropdown-option').forEach(function (o) {
      o.classList.toggle('active', o.dataset.sort === mode);
    });
    document.getElementById('sort-dropdown').classList.remove('open');
    applyFilters();
  };

  // Search input
  document.getElementById('contacts-search').addEventListener('input', function (e) {
    activeQuery = e.target.value;
    applyFilters();
  });

  // Toggle stubs
  document.getElementById('toggle-stubs').addEventListener('click', function () {
    showAllStubs = !showAllStubs;
    var btn = document.getElementById('toggle-stubs');
    btn.setAttribute('aria-pressed', showAllStubs ? 'true' : 'false');
    btn.textContent = showAllStubs
      ? 'Hide stubs (' + (allCards.length - ${totalT2 + totalT3}) + ' hidden when off)'
      : 'Show all (${totalT1} stubs hidden)';
    btn.classList.toggle('active', showAllStubs);
    applyFilters();
  });

  // ── Card-internal handlers ──────────────────────────────────────
  window.focusById = function (id) {
    var el = document.getElementById('contact-card-' + id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('contact-card-flash');
    setTimeout(function () { el.classList.remove('contact-card-flash'); }, 1600);
  };
  window.enrichNow = function (id) {
    if (!confirm('Queue this contact for LLM enrichment (~$0.50)?')) return;
    fetch('/api/refresh-cache', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ cache: 'contact_enrichment', key: id, priority: 'user-triggered' })
    })
      .then(function (r) { return r.ok ? alert('Queued. Reload after ~10 min.') : alert('Failed; check dashboard-server logs.'); })
      .catch(function (e) { alert('Network error: ' + e.message); });
  };
  window.scrapePhoto = function (id, linkedinUrl) {
    if (!linkedinUrl) { alert('No LinkedIn URL.'); return; }
    fetch('/api/scrape-photo', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ id: id, linkedin_url: linkedinUrl })
    })
      .then(function (r) { return r.ok ? alert('Photo scrape queued.') : alert('Failed.'); })
      .catch(function (e) { alert('Network error: ' + e.message); });
  };
  window.revealEmail = function (btn, addr) {
    if (!btn.dataset.revealed) {
      var label = document.createElement('div');
      label.style.fontSize = '11px';
      label.style.color = 'var(--text-3)';
      label.style.marginTop = '4px';
      label.textContent = addr + ' — click again to compose';
      btn.parentNode.appendChild(label);
      btn.dataset.revealed = '1';
      setTimeout(function () {
        delete btn.dataset.revealed;
        if (label.parentNode) label.parentNode.removeChild(label);
      }, 6000);
    } else {
      window.open('https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(addr), '_blank', 'noopener,noreferrer');
      delete btn.dataset.revealed;
    }
  };

  // Initial render
  applyFilters();
})();
</script>
`;

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

const out = renderDashboardShell({
  pageId: 'contacts',
  title: 'Network',
  headExtra: `<style>${pageCSS}</style>`,
  mainHTML: mainHTML,
  scriptExtra: pageJS,
});

const outPath = join(REPO_ROOT, 'dashboard/contacts.html');
writeFileSync(outPath, out);
console.log(`[build-contacts-page] wrote ${outPath} (${out.length.toLocaleString()} bytes, ${annotated.length} cards, ${totalT1} stubs hidden by default)`);
