/**
 * lib/hm-intel-research.mjs — HM-Intel Research Engine
 *
 * Routes hiring-manager + recruiter research through the `/researcher` agent.
 * Cache lives at data/hm-intel/{company-slug}-{role-slug}.json (tracked in git —
 * this is corpus knowledge that scripts/agents/cv-tailor.mjs and the dashboard
 * drawer depend on). Default TTL: 7 days.
 *
 * Exports:
 *   getHmIntelForRole({rowId, company, role, opts}) → Promise<HmIntelResult>
 *   forceRefresh({rowId, company, role, opts})      → Promise<HmIntelResult>
 *   parseResearcherReport(reportPath)               → HmIntelParsed
 *   renderHmIntelCard(intel)                        → HTML string
 *
 * Opts:
 *   maxAgeMs       number (default 7d)
 *   forceLive      boolean — invalidate cache and re-run
 *   researchClient function — injectable for tests; defaults to Agent invocation
 *   budgetUsd      number (default 3)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = join(__dirname, '..');
const CACHE_DIR  = join(REPO_ROOT, 'data', 'hm-intel');
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── slug helpers ────────────────────────────────────────────────

/**
 * Converts a free-form string to a kebab-case slug safe for filenames.
 * @param {string} s
 * @returns {string}
 */
export function toSlug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cacheKey(company, role) {
  return `${toSlug(company)}-${toSlug(role)}`;
}

function cachePath(company, role) {
  return join(CACHE_DIR, `${cacheKey(company, role)}.json`);
}

// ── research prompt ─────────────────────────────────────────────

/**
 * Build the researcher-agent prompt for a specific role + company.
 * @param {object} p
 * @param {string} p.company
 * @param {string} p.role
 * @param {number} p.budgetUsd
 * @returns {string}
 */
function buildResearchPrompt({ company, role, budgetUsd }) {
  return `Research the hiring manager and recruiter for ${role} at ${company}.

Goals:
1. Identify the specific HM most likely to make the hiring decision (or the HM team-shape if no individual is named publicly).
2. Identify the recruiter or talent partner most likely handling this requisition.
3. For each: their background, what signals they value in candidates, their engagement style, their publicly-stated preferences (LinkedIn posts, podcast interviews, X/Twitter activity, conference talks, blog posts).
4. Predict 5-7 interview questions for this role calibrated to those signals.
5. Identify leverage points specific to this HM (e.g., they've publicly praised X technology — Mitchell uses X heavily).

Sources to search: LinkedIn (web search), X/Twitter (via Grok x-search), GitHub (commit/PR patterns if engineering HM), public podcasts/talks, engineering blogs, recent press coverage.

Cite all claims. Surface confidence levels. Flag stale information.

Output as a structured report with sections: HM Profile · Recruiter Profile · Engagement Style · Predicted Questions · Leverage Points · Citations.

Budget: $${budgetUsd} max.
| --fast`;
}

// ── default research client ─────────────────────────────────────

/**
 * Default researcher invocation via Agent subagent.
 * Returns { path: string } where path is the adjudicated final report.
 * In production this is replaced by the real Agent() call; in tests it
 * is injected via opts.researchClient.
 *
 * @param {string} prompt
 * @returns {Promise<{ path: string, rawText: string }>}
 */
async function defaultResearchClient(prompt) {
  // Dynamic import guard — Agent may not be available in all execution contexts
  // (e.g. unit tests, --check runs). Tests inject opts.researchClient instead.
  const { Agent } = await import('../lib/_agent-bridge.mjs').catch(() => {
    throw new Error(
      'Agent bridge not available. In production, ensure lib/_agent-bridge.mjs is present. ' +
      'In tests, inject opts.researchClient.'
    );
  });
  const result = await Agent({
    subagent_type: 'researcher',
    prompt,
  });
  // researcher returns { path, rawText } by convention
  return result;
}

// ── cache helpers ───────────────────────────────────────────────

/**
 * Read cache entry if it exists and is within maxAgeMs.
 * Returns null if missing or stale.
 * @param {string} company
 * @param {string} role
 * @param {number} maxAgeMs
 * @returns {object|null}
 */
export function readCache(company, role, maxAgeMs) {
  const p = cachePath(company, role);
  if (!existsSync(p)) return null;
  try {
    const entry = JSON.parse(readFileSync(p, 'utf8'));
    const age   = Date.now() - new Date(entry.refreshed_at).getTime();
    if (age > maxAgeMs) return null; // stale
    return entry;
  } catch {
    return null;
  }
}

/**
 * Write a cache entry.
 */
function writeCache(company, role, payload) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath(company, role), JSON.stringify(payload, null, 2), 'utf8');
}

// ── parseResearcherReport ───────────────────────────────────────

/**
 * Extract structured intel from a researcher/dealbreaker adjudicated report.
 * Looks for the canonical section headers produced by the researcher agent.
 *
 * @param {string} reportPath — absolute path to the .md report
 * @returns {HmIntelParsed}
 */
export function parseResearcherReport(reportPath) {
  if (!existsSync(reportPath)) {
    return {
      hm_name: null,
      hm_signals: [],
      recruiter_name: null,
      recruiter_signals: [],
      engagement_style: {},
      leverage_points: [],
      questions_to_expect: [],
      citations: [],
      _parse_warnings: [`Report file not found: ${reportPath}`],
    };
  }

  const raw = readFileSync(reportPath, 'utf8');
  const warnings = [];

  // ── section extractor: grabs all lines under a heading until the next heading ──
  function extractSection(headingPattern) {
    const re = new RegExp(`^#{1,3}\\s+${headingPattern}`, 'im');
    const match = re.exec(raw);
    if (!match) return '';
    const start = match.index + match[0].length;
    const rest  = raw.slice(start);
    // find next heading at same or higher level
    const nextHeading = /^#{1,3}\s/m.exec(rest);
    return nextHeading ? rest.slice(0, nextHeading.index).trim() : rest.trim();
  }

  // ── HM name: look for bolded name in the HM Profile section ──
  const hmSection     = extractSection('HM Profile');
  const hmNameMatch   = hmSection.match(/\*\*([^*]+)\*\*/);
  const hm_name       = hmNameMatch ? hmNameMatch[1].trim() : null;
  if (!hm_name) warnings.push('Could not extract HM name from "HM Profile" section');

  // ── HM signals: bullet points in the HM Profile section ──
  const hm_signals = hmSection
    .split('\n')
    .filter(l => /^[-*]\s/.test(l.trim()))
    .map(l => l.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);

  // ── Recruiter ──
  const recSection     = extractSection('Recruiter Profile');
  const recNameMatch   = recSection.match(/\*\*([^*]+)\*\*/);
  const recruiter_name = recNameMatch ? recNameMatch[1].trim() : null;
  const recruiter_signals = recSection
    .split('\n')
    .filter(l => /^[-*]\s/.test(l.trim()))
    .map(l => l.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);

  // ── Engagement style: key:value pairs ──
  const engSection = extractSection('Engagement Style');
  const engagement_style = {};
  for (const line of engSection.split('\n')) {
    const kv = line.match(/^\*?\*?([^:*]+)\*?\*?:\s*(.+)/);
    if (kv) engagement_style[kv[1].trim().toLowerCase().replace(/\s+/g, '_')] = kv[2].trim();
  }

  // ── Leverage points ──
  const leverageSection = extractSection('Leverage Points');
  const leverage_points = leverageSection
    .split('\n')
    .filter(l => /^[-*\d]/.test(l.trim()))
    .map(l => l.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean);

  // ── Predicted / expected questions ──
  const questionsSection = extractSection('Predicted Questions');
  const questions_to_expect = questionsSection
    .split('\n')
    .filter(l => /^[-*\d]/.test(l.trim()))
    .map(l => l.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean);

  // ── Citations ──
  const citationsSection = extractSection('Citations');
  const citations = citationsSection
    .split('\n')
    .filter(l => l.includes('http') || /^[-*\d]/.test(l.trim()))
    .map(l => l.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean);

  return {
    hm_name,
    hm_signals,
    recruiter_name,
    recruiter_signals,
    engagement_style,
    leverage_points,
    questions_to_expect,
    citations,
    _parse_warnings: warnings,
  };
}

// ── renderHmIntelCard ───────────────────────────────────────────

/**
 * Render an HTML snippet suitable for the dashboard drawer popout.
 * Intentionally dependency-free (no framework imports).
 *
 * @param {object} intel — HmIntelParsed (from parseResearcherReport)
 * @returns {string}
 */
export function renderHmIntelCard(intel) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const listItems = (arr) =>
    arr.length
      ? `<ul class="hm-list">${arr.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`
      : `<p class="hm-empty">None surfaced</p>`;

  const styleKv = Object.entries(intel.engagement_style || {})
    .map(([k, v]) => `<dt>${esc(k.replace(/_/g, ' '))}</dt><dd>${esc(v)}</dd>`)
    .join('');

  return `
<div class="hm-intel-card" role="region" aria-label="HM Intel">
  <section class="hm-section">
    <h4 class="hm-heading">Hiring Manager</h4>
    ${intel.hm_name ? `<p class="hm-name"><strong>${esc(intel.hm_name)}</strong></p>` : ''}
    ${listItems(intel.hm_signals)}
  </section>

  <section class="hm-section">
    <h4 class="hm-heading">Recruiter</h4>
    ${intel.recruiter_name ? `<p class="hm-name"><strong>${esc(intel.recruiter_name)}</strong></p>` : ''}
    ${listItems(intel.recruiter_signals)}
  </section>

  ${styleKv ? `
  <section class="hm-section">
    <h4 class="hm-heading">Engagement Style</h4>
    <dl class="hm-dl">${styleKv}</dl>
  </section>` : ''}

  <section class="hm-section">
    <h4 class="hm-heading">Leverage Points</h4>
    ${listItems(intel.leverage_points)}
  </section>

  <section class="hm-section">
    <h4 class="hm-heading">Predicted Questions</h4>
    ${listItems(intel.questions_to_expect)}
  </section>

  ${intel.citations?.length ? `
  <section class="hm-section hm-citations">
    <h4 class="hm-heading">Sources</h4>
    ${listItems(intel.citations)}
  </section>` : ''}

  ${intel._parse_warnings?.length ? `
  <aside class="hm-warnings" aria-label="Parse warnings">
    ${intel._parse_warnings.map(w => `<p class="hm-warning">${esc(w)}</p>`).join('')}
  </aside>` : ''}
</div>`.trim();
}

// ── getHmIntelForRole ───────────────────────────────────────────

/**
 * Main entry point. Returns cached intel if fresh, else dispatches
 * the researcher agent and writes the result to cache.
 *
 * @param {object} params
 * @param {number}  params.rowId       — applications.md row number (for logging)
 * @param {string}  params.company     — company name (e.g. "ElevenLabs")
 * @param {string}  params.role        — role title (e.g. "Communications Manager")
 * @param {object}  [params.opts]
 * @param {number}  [params.opts.maxAgeMs]        — cache TTL (default 7 days)
 * @param {boolean} [params.opts.forceLive]        — skip cache
 * @param {Function}[params.opts.researchClient]  — injectable for tests
 * @param {number}  [params.opts.budgetUsd]        — per-run budget (default 3)
 * @returns {Promise<{path: string, hmIntel: object, refreshedAt: string, cost_estimate: number|null}>}
 */
export async function getHmIntelForRole({ rowId, company, role, opts = {} }) {
  const {
    maxAgeMs      = DEFAULT_TTL_MS,
    forceLive     = false,
    researchClient = defaultResearchClient,
    budgetUsd     = 3,
  } = opts;

  // ── 1. Cache hit ──
  if (!forceLive) {
    const cached = readCache(company, role, maxAgeMs);
    if (cached) {
      console.log(`[hm-intel] cache hit for ${company}/${role} (age ${Math.round((Date.now() - new Date(cached.refreshed_at).getTime()) / 3600000)}h)`);
      return {
        path:        cachePath(company, role),
        hmIntel:     cached.hmIntel,
        refreshedAt: cached.refreshed_at,
        cost_estimate: cached.cost_estimate ?? null,
      };
    }
  }

  // ── 2. Dispatch researcher agent ──
  console.log(`[hm-intel] dispatching researcher for row ${rowId}: ${company} / ${role}`);
  const prompt  = buildResearchPrompt({ company, role, budgetUsd });
  const t0      = Date.now();
  const result  = await researchClient(prompt);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[hm-intel] researcher returned in ${elapsed}s — report: ${result.path}`);

  // ── 3. Parse the adjudicated report ──
  const parsed = parseResearcherReport(result.path);

  // ── 4. Write cache ──
  const cacheEntry = {
    schema_version: '1.0.0',
    company,
    role,
    row_id:       rowId,
    refreshed_at: new Date().toISOString(),
    elapsed_s:    parseFloat(elapsed),
    cost_estimate: result.cost_estimate ?? null,
    report_path:  result.path,
    hmIntel:      parsed,
  };
  writeCache(company, role, cacheEntry);

  return {
    path:        cachePath(company, role),
    hmIntel:     parsed,
    refreshedAt: cacheEntry.refreshed_at,
    cost_estimate: cacheEntry.cost_estimate,
  };
}

// ── forceRefresh ────────────────────────────────────────────────

/**
 * Invalidate cache and re-run research unconditionally.
 */
export async function forceRefresh({ rowId, company, role, opts = {} }) {
  return getHmIntelForRole({ rowId, company, role, opts: { ...opts, forceLive: true } });
}
