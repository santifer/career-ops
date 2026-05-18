/**
 * lib/company-pulse.mjs — Company-Pulse Pipeline
 *
 * Tracks real-time signal changes at target companies: hiring posts,
 * leader media, team evidence, and delta windows. Routes research
 * through the `/researcher` agent. Cache at data/company-pulse/{slug}.json
 * (tracked in git — corpus knowledge other libs and the heartbeat depend on).
 *
 * Default TTLs:
 *   Apply-Now companies:   24 hours
 *   Evaluated/Responded:   72 hours  (every 3 days)
 *   Inactive/on-demand:    0 (skip unless forced)
 *
 * Exports:
 *   getPulseForCompany(slug, opts)           → Promise<{pulse, refreshedAt, age_hours}>
 *   getDeltasInWindow(slug, hours)           → Array<DeltaItem>
 *   forceRefresh(slug, opts)                 → Promise<{pulse, refreshedAt, age_hours}>
 *   renderPulseCard(pulse)                   → HTML string
 *   renderPulseSummary(deltas)               → markdown string
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = join(__dirname, '..');
const CACHE_DIR  = join(REPO_ROOT, 'data', 'company-pulse');

const DEFAULT_TTL_ACTIVE_MS    = 24 * 60 * 60 * 1000;        // 24h — Apply-Now
const DEFAULT_TTL_EVALUATED_MS = 3  * 24 * 60 * 60 * 1000;   // 72h — Evaluated/Responded

// ── cache helpers ───────────────────────────────────────────────

function cachePath(slug) {
  return join(CACHE_DIR, `${slug}.json`);
}

/**
 * Read cache if fresh; returns null when missing or stale.
 * @param {string} slug
 * @param {number} maxAgeMs
 * @returns {object|null}
 */
export function readPulseCache(slug, maxAgeMs) {
  const p = cachePath(slug);
  if (!existsSync(p)) return null;
  try {
    const entry = JSON.parse(readFileSync(p, 'utf8'));
    const age   = Date.now() - new Date(entry.refreshed_at).getTime();
    if (age > maxAgeMs) return null;
    return entry;
  } catch {
    return null;
  }
}

function writePulseCache(slug, payload) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath(slug), JSON.stringify(payload, null, 2), 'utf8');
}

// ── research prompt ─────────────────────────────────────────────

/**
 * Build the company-pulse researcher prompt.
 * @param {object} p
 * @param {string} p.company        — display name for the research prompt
 * @param {string} p.slug           — kebab slug for internal refs
 * @param {number} p.windowHours    — hours to look back
 * @param {string|null} p.lastPulseIso — ISO timestamp of last successful pulse
 * @param {number} p.budgetUsd
 * @returns {string}
 */
function buildPulsePrompt({ company, slug, windowHours, lastPulseIso, budgetUsd }) {
  const sinceLine = lastPulseIso
    ? `Surface NEW information since ${lastPulseIso}:`
    : 'Surface all available public signals in the window:';

  return `What's pulsing at ${company} in the last ${windowHours} hours?

${sinceLine}
1. **Hiring signals** — "We're hiring" posts from company handle or leaders, engineer/PM posts indicating team priorities, comments under job posts indicating urgency
2. **Leader media** — what the founders/execs/eng-leaders have publicly posted, spoken, or published this window
3. **Team evidence** — public GitHub activity, engineering blog posts, OSS releases, product launches
4. Specifically flag anything that creates LEVERAGE for a candidate (e.g., "they just announced X — your work on X is on-target")

Sources: company handle on X (via Grok x-search), founder/exec handles, engineering blog RSS if available, recent press, LinkedIn posts.

Cite all claims with URLs. Mark confidence. Date-stamp every signal.

Budget: $${budgetUsd} max.
| --fast`;
}

// ── default research client ─────────────────────────────────────

async function defaultResearchClient(prompt) {
  const { Agent } = await import('../lib/_agent-bridge.mjs').catch(() => {
    throw new Error(
      'Agent bridge not available. In production, ensure lib/_agent-bridge.mjs is present. ' +
      'In tests, inject opts.researchClient.'
    );
  });
  return Agent({ subagent_type: 'researcher', prompt });
}

// ── parsePulseReport ────────────────────────────────────────────

/**
 * Extract structured pulse data from a researcher/dealbreaker report.
 * Returns an object matching the pulse schema.
 *
 * @param {string} reportPath
 * @param {string} slug
 * @returns {PulseData}
 */
export function parsePulseReport(reportPath, slug) {
  const now = new Date().toISOString();

  if (!existsSync(reportPath)) {
    return _emptyPulse(slug, now, [`Report not found: ${reportPath}`]);
  }

  const raw = readFileSync(reportPath, 'utf8');

  function extractSection(headingPattern) {
    const re = new RegExp(`^#{1,4}\\s+${headingPattern}`, 'im');
    const m  = re.exec(raw);
    if (!m) return '';
    const rest        = raw.slice(m.index + m[0].length);
    const nextHeading = /^#{1,4}\s/m.exec(rest);
    return nextHeading ? rest.slice(0, nextHeading.index).trim() : rest.trim();
  }

  function parseBullets(text) {
    return text
      .split('\n')
      .filter(l => /^[-*\d]/.test(l.trim()))
      .map(l => l.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(Boolean);
  }

  /**
   * Try to extract structured items from a section.
   * Each item has: kind, ts (ISO or null), actor, text/summary, url, leverage.
   */
  function parseSignalItems(section, defaultKind) {
    const items = [];
    const lines  = parseBullets(section);
    for (const line of lines) {
      // Attempt to extract a URL
      const urlMatch = line.match(/https?:\/\/\S+/);
      // Attempt to extract a date-like string
      const dateMatch = line.match(/\b(202\d-\d{2}-\d{2}|\w+ \d{1,2},?\s+202\d)\b/);
      // Leverage signal: lines containing "leverage" or "on-target"
      const leverageText = /leverage|on.target|relevant|advantage/i.test(line) ? line : '';
      items.push({
        kind:    defaultKind,
        ts:      dateMatch ? parseDateLoose(dateMatch[0]) : null,
        actor:   null, // best-effort; researcher may name actor in text
        text:    line,
        url:     urlMatch ? urlMatch[0].replace(/[.,)>]+$/, '') : null,
        leverage: leverageText,
      });
    }
    return items;
  }

  function parseDateLoose(s) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  const hiringSection  = extractSection('Hiring Signals?');
  const leaderSection  = extractSection('Leader Media');
  const teamSection    = extractSection('Team Evidence');
  const citationSection = extractSection('Citations?');

  const hiring_signals = parseSignalItems(hiringSection, 'hiring_signal');
  const leader_media   = parseSignalItems(leaderSection, 'leader_media');
  const team_evidence  = parseSignalItems(teamSection, 'team_evidence');

  // delta_since_last_pulse: any item flagged with "NEW" or bullet under a "New" heading
  const deltaSection = extractSection('New|Delta|Changes');
  const delta_items  = parseBullets(deltaSection).map(t => ({
    kind:    'delta',
    summary: t,
    url:     (t.match(/https?:\/\/\S+/) || [])[0]?.replace(/[.,)>]+$/, '') ?? null,
  }));

  const citations = parseBullets(citationSection)
    .filter(l => l.includes('http') || l.length > 10)
    .map(l => {
      const urlM = l.match(/https?:\/\/\S+/);
      return { source: l.replace(/https?:\/\/\S+/, '').trim() || l, url: urlM ? urlM[0].replace(/[.,)>]+$/, '') : null };
    });

  return {
    schema_version: '1.0.0',
    company_slug:   slug,
    refreshed_at:   now,
    last_pulse_at:  now,
    hiring_signals,
    leader_media,
    team_evidence,
    delta_since_last_pulse: delta_items,
    citations,
    _parse_warnings: [],
  };
}

function _emptyPulse(slug, now, warnings = []) {
  return {
    schema_version: '1.0.0',
    company_slug:   slug,
    refreshed_at:   now,
    last_pulse_at:  now,
    hiring_signals:          [],
    leader_media:            [],
    team_evidence:           [],
    delta_since_last_pulse:  [],
    citations:               [],
    _parse_warnings:         warnings,
  };
}

// ── getPulseForCompany ──────────────────────────────────────────

/**
 * Get pulse for a company. Checks cache first (unless forceLive),
 * then dispatches researcher agent.
 *
 * @param {string} slug            — kebab company slug (e.g. "anthropic")
 * @param {object} [opts]
 * @param {number}  [opts.maxAgeMs]        — default: 24h (apply-now cadence)
 * @param {boolean} [opts.forceLive]       — skip cache
 * @param {string}  [opts.companyName]     — display name for prompt (defaults to Title-cased slug)
 * @param {number}  [opts.windowHours]     — how far back to search (default 24)
 * @param {Function}[opts.researchClient]  — injectable for tests
 * @param {number}  [opts.budgetUsd]       — per-run budget (default 2)
 * @returns {Promise<{pulse: object, refreshedAt: string, age_hours: number}>}
 */
export async function getPulseForCompany(slug, opts = {}) {
  const {
    maxAgeMs       = DEFAULT_TTL_ACTIVE_MS,
    forceLive      = false,
    cacheOnly      = false,
    companyName    = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    windowHours    = 24,
    researchClient = defaultResearchClient,
    budgetUsd      = 2,
  } = opts;

  // ── 1. Cache hit ──
  if (!forceLive) {
    const cached = readPulseCache(slug, maxAgeMs);
    if (cached) {
      const age_hours = (Date.now() - new Date(cached.refreshed_at).getTime()) / 3600000;
      console.log(`[company-pulse] cache hit for ${slug} (age ${age_hours.toFixed(1)}h)`);
      return { pulse: cached, refreshedAt: cached.refreshed_at, age_hours };
    }
  }

  // ── 1a. cacheOnly mode — DO NOT dispatch researcher; return null. ──
  // Used by build-dashboard.mjs at static build time so we don't burn $$ or
  // hang on the agent bridge when called outside Claude Code agent context.
  if (cacheOnly) {
    return { pulse: null, refreshedAt: null, age_hours: null, source: 'no-cache' };
  }

  // ── 2. Dispatch researcher agent ──
  const lastPulseIso = (() => {
    const p = cachePath(slug);
    if (!existsSync(p)) return null;
    try { return JSON.parse(readFileSync(p, 'utf8')).last_pulse_at ?? null; } catch { return null; }
  })();

  console.log(`[company-pulse] dispatching researcher for ${slug}`);
  const prompt  = buildPulsePrompt({ company: companyName, slug, windowHours, lastPulseIso, budgetUsd });
  const t0      = Date.now();
  const result  = await researchClient(prompt);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[company-pulse] researcher returned in ${elapsed}s — report: ${result.path}`);

  // ── 3. Parse + enrich with metadata ──
  const parsed = parsePulseReport(result.path, slug);
  parsed.elapsed_s     = parseFloat(elapsed);
  parsed.report_path   = result.path;
  parsed.cost_estimate = result.cost_estimate ?? null;

  // ── 4. Write cache ──
  writePulseCache(slug, parsed);

  const age_hours = 0;
  return { pulse: parsed, refreshedAt: parsed.refreshed_at, age_hours };
}

// ── getDeltasInWindow ───────────────────────────────────────────

/**
 * Return new signals since (now - hours) from the cached pulse.
 * Does NOT trigger a refresh; call getPulseForCompany first if freshness matters.
 *
 * @param {string} slug
 * @param {number} [hours] — default 24
 * @returns {Array<DeltaItem>}
 */
export function getDeltasInWindow(slug, hours = 24) {
  const p = cachePath(slug);
  if (!existsSync(p)) return [];
  let pulse;
  try { pulse = JSON.parse(readFileSync(p, 'utf8')); } catch { return []; }

  const windowStart = Date.now() - hours * 3600000;

  const allItems = [
    ...(pulse.hiring_signals || []).map(i => ({ ...i, _source: 'hiring_signals' })),
    ...(pulse.leader_media   || []).map(i => ({ ...i, _source: 'leader_media' })),
    ...(pulse.team_evidence  || []).map(i => ({ ...i, _source: 'team_evidence' })),
    ...(pulse.delta_since_last_pulse || []).map(i => ({ ...i, _source: 'delta' })),
  ];

  return allItems.filter(item => {
    if (!item.ts) return true; // no timestamp = include by default (conservative)
    return new Date(item.ts).getTime() >= windowStart;
  });
}

// ── forceRefresh ────────────────────────────────────────────────

export async function forceRefresh(slug, opts = {}) {
  return getPulseForCompany(slug, { ...opts, forceLive: true });
}

// ── renderPulseCard ─────────────────────────────────────────────

/**
 * Render an HTML card suitable for the company drawer in the dashboard.
 * @param {object} pulse — PulseData from getPulseForCompany
 * @returns {string}
 */
export function renderPulseCard(pulse) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const linkify = (text, url) =>
    url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>` : esc(text);

  function renderItems(items, labelKey = 'text') {
    if (!items?.length) return '<p class="pulse-empty">No signals found</p>';
    return `<ul class="pulse-list">${items.map(i => {
      const ts    = i.ts ? `<time class="pulse-ts">${esc(i.ts.slice(0, 10))}</time> ` : '';
      const actor = i.actor ? `<strong>${esc(i.actor)}</strong>: ` : '';
      const body  = linkify(i[labelKey] || i.summary || '', i.url);
      return `<li class="pulse-item">${ts}${actor}${body}</li>`;
    }).join('')}</ul>`;
  }

  const age_h = ((Date.now() - new Date(pulse.refreshed_at).getTime()) / 3600000).toFixed(1);
  const freshLabel = parseFloat(age_h) < 2 ? 'fresh' : parseFloat(age_h) < 12 ? 'recent' : 'stale';

  return `
<div class="pulse-card" role="region" aria-label="Company Pulse — ${esc(pulse.company_slug)}">
  <header class="pulse-header">
    <span class="pulse-company">${esc(pulse.company_slug.replace(/-/g, ' '))}</span>
    <span class="pulse-freshness pulse-freshness--${esc(freshLabel)}" title="Last refreshed ${esc(pulse.refreshed_at)}">${age_h}h ago</span>
  </header>

  <section class="pulse-section">
    <h4 class="pulse-heading">Hiring Signals</h4>
    ${renderItems(pulse.hiring_signals)}
  </section>

  <section class="pulse-section">
    <h4 class="pulse-heading">Leader Media</h4>
    ${renderItems(pulse.leader_media, 'title')}
  </section>

  <section class="pulse-section">
    <h4 class="pulse-heading">Team Evidence</h4>
    ${renderItems(pulse.team_evidence)}
  </section>

  ${pulse.delta_since_last_pulse?.length ? `
  <section class="pulse-section pulse-deltas">
    <h4 class="pulse-heading">New Since Last Pulse</h4>
    ${renderItems(pulse.delta_since_last_pulse, 'summary')}
  </section>` : ''}
</div>`.trim();
}

// ── renderPulseSummary ──────────────────────────────────────────

/**
 * Render a markdown summary of delta items for the heartbeat email's
 * "📡 Signal Pulse — last 24h" section.
 *
 * @param {Array<DeltaItem>} deltas — from getDeltasInWindow
 * @returns {string}
 */
export function renderPulseSummary(deltas) {
  if (!deltas?.length) return '_No new signals in the last 24h._\n';

  const byKind = {};
  for (const d of deltas) {
    const k = d._source || d.kind || 'signal';
    if (!byKind[k]) byKind[k] = [];
    byKind[k].push(d);
  }

  const kindLabel = {
    hiring_signals: 'Hiring Signals',
    leader_media:   'Leader Media',
    team_evidence:  'Team Evidence',
    delta:          'New Deltas',
    signal:         'Signals',
  };

  const lines = [];
  for (const [kind, items] of Object.entries(byKind)) {
    lines.push(`\n**${kindLabel[kind] || kind}**`);
    for (const item of items) {
      const text  = item.text || item.summary || item.title || '';
      const url   = item.url ? ` — [link](${item.url})` : '';
      const actor = item.actor ? `**${item.actor}**: ` : '';
      lines.push(`- ${actor}${text}${url}`);
    }
  }
  return lines.join('\n') + '\n';
}

// ── Synchronous cached-only read (for static build contexts) ────────────────

/**
 * Synchronous cache read. Returns the cached pulse JSON if present (any age)
 * or null. NEVER dispatches researcher. Use at static build time where you
 * can't `await` (e.g. inside a sync top-level IIFE in build-dashboard.mjs).
 *
 * @param {string} slug
 * @returns {object|null}
 */
export function getCachedPulseSync(slug) {
  try {
    const p = cachePath(slug);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}
