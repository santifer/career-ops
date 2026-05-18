/**
 * lib/tpgm-dashboard-widget.mjs — TPgM dashboard widget renderer.
 *
 * Pure-function renderer that returns a self-contained HTML/CSS snippet
 * for the dashboard "TPgM credibility" overview tile. The widget is NEW
 * and importable — wiring it into `scripts/build-dashboard.mjs` is a
 * separate ticket (per the Tier B item #6 task brief, do NOT touch the
 * dashboard builder today).
 *
 * Operationalizes Phase 4 Dimension 4 finding #21: "Radix `<Progress>`
 * ring + lucide-react icon + drill-down drawer with each evidence piece".
 * This widget is the read-only summary tile; the drill-down drawer is a
 * separate component owned by the dashboard route.
 *
 * Design pillar alignment (DESIGN_PRINCIPLES.md):
 *   - Scannability: progress ring + 3 highlight bullets is the entire
 *     payload. No table inside the tile.
 *   - Action proximity: "Open tracker" affordance points to the full
 *     report (scripts/tpgm-tracker.mjs --report) as the deeper view.
 *   - Strengths AND limitations: velocity frame shows momentum AND gap
 *     points remaining — not just a judgment label. Avoids INTJ-T / RSD
 *     sensitivity (calibration brief 2026-05-16 §brand). "Under-built"
 *     framing was a daily negative-identity anchor; replaced with
 *     momentum language that conveys the same information constructively.
 *   - Background transparency: stale-data label appears when the latest
 *     extract is older than 14 days.
 *   - Future-action awareness: the gap-summary line previews the
 *     pm_bridge_weight points available from open courses, with a
 *     velocity projection ("on pace for N by date") in mid bands.
 *
 * Velocity tracking:
 *   - On each render, the current score + date are appended to
 *     `data/tpgm-history.json` (created if missing).
 *   - "+N this week" is diffed against the most recent prior snapshot
 *     that is >= 7 days old. Arrow ▲/▼/▬ reflects the change direction.
 *   - History file writes are best-effort; failures are silently swallowed
 *     so the widget never blocks the dashboard build.
 *
 * Usage:
 *   import { renderTpgmWidget } from '../lib/tpgm-dashboard-widget.mjs';
 *
 *   const html = renderTpgmWidget({
 *     score: 65,
 *     pm_bridge_index: 6.5,
 *     pm_credibility_composite: 71,
 *     highlights: [
 *       { work_item: 'Led Marketplace design review', technical_signal: 'System design' },
 *       { work_item: 'API error taxonomy draft', technical_signal: 'Integration architecture' },
 *     ],
 *     active_courses: [
 *       { name: 'Python Fluency', status: 'in-progress', pm_bridge_weight: 9 },
 *     ],
 *     gap_points_available: 18,
 *     latest_extract_week: '2026-W20',
 *     latest_extract_age_days: 5,
 *   });
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = join(__dirname, '..', 'data', 'tpgm-history.json');

const RING_RADIUS = 32;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Velocity-framed status bands keyed on score range.
 * Fix 1 per UX-eval 2026-05-17: replaces "Under-built — close gaps" with
 * momentum language that respects INTJ-T / RSD sensitivity (calibration
 * brief §brand). Same information, completely different felt sense.
 *
 * @param {number} score  0–100
 * @param {number|null} weeklyDelta  +/- points gained this week, or null
 * @param {number|null} projectedDate  estimated epoch ms when score hits 65, or null
 * @returns {{ label: string, tone: string }}
 */
function scoreBand(score, weeklyDelta = null, projectedDate = null) {
  // Build the "+N this week" suffix when we have a delta
  let velocitySuffix = '';
  if (weeklyDelta !== null) {
    const sign = weeklyDelta > 0 ? '+' : weeklyDelta < 0 ? '' : '+';
    velocitySuffix = ` · ${sign}${weeklyDelta} this week`;
  }

  // Projection suffix: "→ on pace for 65 by MMM YYYY" shown in mid band only
  let paceSuffix = '';
  if (projectedDate && score >= 26 && score < 51) {
    const d = new Date(projectedDate);
    const mon = d.toLocaleString('en-US', { month: 'short' });
    paceSuffix = ` → on pace for 65 by ${mon} ${d.getFullYear()}`;
  }

  if (score >= 76) return { label: `TPgM-credible · sustaining${velocitySuffix}`, tone: 'positive' };
  if (score >= 51) return { label: `TPgM-ready trajectory${velocitySuffix}`, tone: 'caution' };
  if (score >= 26) return { label: `Steady climb${velocitySuffix}${paceSuffix}`, tone: 'neutral' };
  return { label: `Building foundation${velocitySuffix}`, tone: 'attention' };
}

/**
 * Load the tpgm-history.json snapshot array and compute the weekly velocity
 * (points gained/lost vs the most recent snapshot that is >= 7 days old).
 *
 * Also appends the current score + date to the history file (best-effort).
 *
 * @param {number} currentScore
 * @returns {{ weeklyDelta: number|null, projectedDate: number|null }}
 */
function computeVelocityAndPersist(currentScore) {
  let history = [];
  try {
    if (existsSync(HISTORY_PATH)) {
      history = JSON.parse(readFileSync(HISTORY_PATH, 'utf-8'));
      if (!Array.isArray(history)) history = [];
    }
  } catch { history = []; }

  const now = Date.now();
  const todayIso = new Date(now).toISOString().slice(0, 10);

  // Compute velocity: find the most recent snapshot that is >= 7 days old
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  let weeklyDelta = null;
  let projectedDate = null;

  // Work backward from most recent to find a suitable baseline
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    const entryTs = entry.ts || Date.parse(entry.date || '');
    if (!entryTs || isNaN(entryTs)) continue;
    if (now - entryTs >= sevenDaysMs) {
      weeklyDelta = currentScore - (entry.score ?? currentScore);
      // If we have positive velocity, project when score hits 65
      if (weeklyDelta > 0 && currentScore < 65) {
        const pointsNeeded = 65 - currentScore;
        const weeksNeeded = pointsNeeded / weeklyDelta;
        projectedDate = now + weeksNeeded * 7 * 24 * 60 * 60 * 1000;
      }
      break;
    }
  }

  // Append current snapshot if we don't already have one for today
  const lastEntry = history[history.length - 1];
  const lastDate = lastEntry ? (lastEntry.date || '') : '';
  if (lastDate !== todayIso) {
    history.push({ date: todayIso, ts: now, score: currentScore });
    try {
      writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf-8');
    } catch { /* best-effort; never block dashboard build */ }
  }

  return { weeklyDelta, projectedDate };
}

/**
 * Render the TPgM credibility widget HTML snippet.
 *
 * @param {object} input
 * @param {number} input.score                       0–100 TPgM-credibility composite
 * @param {number} [input.pm_bridge_index]           0–10 PM-Bridge index
 * @param {number} [input.pm_credibility_composite]  0–100 PM-credibility composite
 * @param {Array<{work_item: string, technical_signal: string}>} [input.highlights]  Top 3 TPgM evidence highlights from latest extract
 * @param {Array<{name: string, status: string, pm_bridge_weight?: number}>} [input.active_courses]  Active courses for the in-progress list
 * @param {number} [input.gap_points_available]      Sum of pm_bridge_weight of open high-leverage courses
 * @param {string} [input.latest_extract_week]       e.g. "2026-W20"
 * @param {number} [input.latest_extract_age_days]   Days since latest extract; used for staleness label
 * @returns {string} HTML snippet (inline-scoped, no external CSS required)
 */
export function renderTpgmWidget(input = {}) {
  const score = Math.max(0, Math.min(100, Math.round(Number(input.score) || 0)));
  const pmBridge = typeof input.pm_bridge_index === 'number' ? input.pm_bridge_index : null;
  const composite = typeof input.pm_credibility_composite === 'number' ? input.pm_credibility_composite : null;
  const highlights = (input.highlights || []).slice(0, 3);
  const active = (input.active_courses || []).slice(0, 3);
  const gapPoints = typeof input.gap_points_available === 'number' ? input.gap_points_available : null;
  const latestWeek = input.latest_extract_week || null;
  const ageDays = typeof input.latest_extract_age_days === 'number' ? input.latest_extract_age_days : null;
  const stale = ageDays !== null && ageDays > 14;

  // Fix 1: velocity-framed band. Compute weekly delta + projection from history.
  const { weeklyDelta, projectedDate } = computeVelocityAndPersist(score);
  const band = scoreBand(score, weeklyDelta, projectedDate);
  const offset = RING_CIRCUMFERENCE * (1 - score / 100);

  // A11y fix (2026-05-17): tone ring colors kept as SVG strokes (decorative).
  // tone.text was previously hardcoded light-mode hex (#16a34a green, #1d4ed8 blue,
  // #991b1b red) — all fail WCAG AA on dark bg (#11131c). The band label now uses
  // var(--text) via CSS; tone.text is only used in the ring-text overlay which is
  // small (20px) and uses var(--text) per CSS class — so tone.text is no longer
  // injected into CSS. Ring stroke colors are decorative SVG elements (not text),
  // exempt from text contrast requirements, so hardcoded SVG hex values are fine.
  const toneColors = {
    positive: { ring: '#86efac' },   // --green-fg dark-mode value — readable ring stroke
    caution:  { ring: '#d4ba84' },   // --amber-fg dark-mode value
    neutral:  { ring: '#94a3b8' },   // --blue-fg dark-mode value
    attention:{ ring: '#fca5a5' },   // --red-fg dark-mode value
  };
  const tone = toneColors[band.tone];

  // Inline-scoped class names use a unique prefix to avoid collisions with
  // existing dashboard CSS.
  // A11y fix (2026-05-17): all hardcoded light-mode hex values replaced with
  // dashboard CSS custom properties so the widget inherits dark-mode correctly.
  // Contrast before: ring-text / band label used #1d4ed8 on #fff → dark-mode
  // contrast ~1.4:1 (WCAG AA fail). Now uses var(--text) / var(--text-2) /
  // var(--text-3) on var(--surface) background — dark mode ratios below.
  // Layout fix: max-width removed from card; wrapper in build-dashboard.mjs
  // sets max-width:720px matching side-alloc-tile so it spans the full
  // overview column width with no dead space to the right.
  const css = `
.tpgm-w{font-family:var(--font-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);border:1px solid var(--border);border-radius:var(--radius,8px);padding:16px;background:var(--surface);display:flex;flex-direction:column;gap:12px;width:100%}
.tpgm-w__hdr{display:flex;align-items:center;gap:16px}
.tpgm-w__ring{flex:0 0 auto;position:relative;width:80px;height:80px}
.tpgm-w__ring svg{transform:rotate(-90deg)}
.tpgm-w__ring-bg{stroke:var(--border-strong,#353a52);stroke-width:6;fill:none}
.tpgm-w__ring-fg{stroke:${tone.ring};stroke-width:6;fill:none;stroke-linecap:round;transition:stroke-dashoffset .6s ease-out}
.tpgm-w__ring-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;font-weight:600;color:var(--text)}
.tpgm-w__ring-num{font-size:20px;line-height:1}
.tpgm-w__ring-of{font-size:10px;color:var(--text-3);letter-spacing:.04em;text-transform:none}
.tpgm-w__ring-velocity{font-size:10px;color:var(--text-3);letter-spacing:.03em;margin-top:1px}
.tpgm-w__meta{flex:1 1 auto;min-width:0}
.tpgm-w__title{font-size:11px;font-weight:700;color:var(--text-4);text-transform:uppercase;letter-spacing:.06em;margin:0 0 4px}
.tpgm-w__band{font-size:14px;font-weight:600;color:var(--text);margin:0 0 4px}
.tpgm-w__sub{font-size:12px;color:var(--text-3);margin:0;line-height:1.4}
.tpgm-w__row{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--text-2);border-top:1px solid var(--border);padding-top:10px}
.tpgm-w__row strong{color:var(--text)}
.tpgm-w__sect{display:flex;flex-direction:column;gap:6px}
.tpgm-w__sect h4{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-4);margin:0}
.tpgm-w__list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px}
.tpgm-w__list li{font-size:13px;color:var(--text-2);line-height:1.35;padding-left:14px;position:relative}
.tpgm-w__list li::before{content:"";position:absolute;left:0;top:7px;width:6px;height:6px;border-radius:50%;background:${tone.ring}}
.tpgm-w__list em{font-style:normal;color:var(--text-3);font-size:12px}
.tpgm-w__course{display:flex;justify-content:space-between;font-size:13px;color:var(--text-2);gap:8px}
.tpgm-w__course-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpgm-w__chip{flex:0 0 auto;font-size:11px;padding:2px 8px;border-radius:999px;background:var(--surface-2);color:var(--text-3);border:1px solid var(--border);text-transform:capitalize}
.tpgm-w__stale{font-size:11px;color:var(--amber-fg,#d4ba84);background:var(--amber-bg,rgba(168,123,72,.14));padding:2px 8px;border-radius:6px;display:inline-block;margin-top:4px;border:1px solid var(--amber-border,rgba(168,123,72,.3))}
.tpgm-w__empty{font-size:12px;color:var(--text-3);font-style:italic}
`.trim();

  const ringSvg = `<svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
  <circle class="tpgm-w__ring-bg" cx="40" cy="40" r="${RING_RADIUS}"></circle>
  <circle class="tpgm-w__ring-fg" cx="40" cy="40" r="${RING_RADIUS}" stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"></circle>
</svg>`;

  const compositeLine = composite !== null
    ? `<p class="tpgm-w__sub">PM-credibility composite <strong style="color:var(--text)">${composite}/100</strong>${pmBridge !== null ? ` · PM-Bridge index <strong style="color:var(--text)">${pmBridge}/10</strong>` : ''}</p>`
    : pmBridge !== null
      ? `<p class="tpgm-w__sub">PM-Bridge index <strong style="color:var(--text)">${pmBridge}/10</strong></p>`
      : '';

  const staleBadge = stale
    ? `<div class="tpgm-w__stale">Latest extract is ${ageDays} days old — run weekly ingest</div>`
    : '';

  const highlightsHtml = highlights.length
    ? `<ul class="tpgm-w__list">${
        highlights.map(h => `<li>${escapeHtml(h.work_item)}${h.technical_signal ? ` <em>— ${escapeHtml(h.technical_signal)}</em>` : ''}</li>`).join('')
      }</ul>`
    : `<p class="tpgm-w__empty">No TPgM evidence extracted yet. Drop this week's update into <code>data/skill-tracker/${escapeHtml(latestWeek || '{YYYY-Www}')}.md</code> and run <code>npm run skill-ingest:apply</code>.</p>`;

  const coursesHtml = active.length
    ? active.map(c => `<div class="tpgm-w__course">
        <span class="tpgm-w__course-name">${escapeHtml(c.name)}${typeof c.pm_bridge_weight === 'number' ? ` <em style="color:var(--text-3);font-style:normal">· bridge ${c.pm_bridge_weight}/10</em>` : ''}</span>
        <span class="tpgm-w__chip">${escapeHtml(c.status)}</span>
      </div>`).join('')
    : `<p class="tpgm-w__empty">No active courses tracked. Edit <code>data/courses.yml</code> to add one.</p>`;

  const gapLine = gapPoints !== null && gapPoints > 0
    ? `<div class="tpgm-w__row"><span>Open gap points available</span><strong>+${gapPoints}</strong></div>`
    : '';

  const weekLine = latestWeek
    ? `<div class="tpgm-w__row"><span>Latest extract</span><strong>${escapeHtml(latestWeek)}</strong></div>`
    : '';

  return `<style>${css}</style>
<section class="tpgm-w" role="region" aria-label="TPgM credibility tracker">
  <div class="tpgm-w__hdr">
    <div class="tpgm-w__ring">
      ${ringSvg}
      <div class="tpgm-w__ring-text">
        <span class="tpgm-w__ring-num">${score}</span>
        <span class="tpgm-w__ring-of">PM-credibility</span>
        ${weeklyDelta !== null ? `<span class="tpgm-w__ring-velocity">${weeklyDelta > 0 ? '▲' : weeklyDelta < 0 ? '▼' : '▬'}${weeklyDelta > 0 ? '+' : ''}${weeklyDelta}</span>` : ''}
      </div>
    </div>
    <div class="tpgm-w__meta">
      <p class="tpgm-w__title">TPgM credibility</p>
      <p class="tpgm-w__band">${escapeHtml(band.label)}</p>
      ${compositeLine}
      ${staleBadge}
    </div>
  </div>
  <div class="tpgm-w__sect">
    <h4>Top TPgM highlights</h4>
    ${highlightsHtml}
  </div>
  <div class="tpgm-w__sect">
    <h4>Active courses</h4>
    ${coursesHtml}
  </div>
  ${weekLine}
  ${gapLine}
</section>`;
}

export default renderTpgmWidget;
