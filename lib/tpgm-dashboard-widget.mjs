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
 *   - Strengths AND limitations: when score is low, the widget says so —
 *     "score under-built; X gaps open" rather than padding.
 *   - Background transparency: stale-data label appears when the latest
 *     extract is older than 14 days.
 *   - Future-action awareness: the gap-summary line previews the
 *     pm_bridge_weight points available from open courses.
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

function scoreBand(score) {
  if (score >= 80) return { label: 'Ready to claim TPgM', tone: 'positive' };
  if (score >= 65) return { label: 'Approaching threshold', tone: 'caution' };
  if (score >= 40) return { label: 'Building credibility', tone: 'neutral' };
  return { label: 'Under-built — close gaps', tone: 'attention' };
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

  const band = scoreBand(score);
  const offset = RING_CIRCUMFERENCE * (1 - score / 100);

  const toneColors = {
    positive: { ring: '#16a34a', text: '#16a34a' },
    caution:  { ring: '#f59e0b', text: '#b45309' },
    neutral:  { ring: '#3b82f6', text: '#1d4ed8' },
    attention:{ ring: '#dc2626', text: '#991b1b' },
  };
  const tone = toneColors[band.tone];

  // Inline-scoped class names use a unique prefix to avoid collisions with
  // existing dashboard CSS.
  const css = `
.tpgm-w{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;border:1px solid #e5e7eb;border-radius:12px;padding:20px;background:#fff;display:flex;flex-direction:column;gap:14px;max-width:520px}
.tpgm-w__hdr{display:flex;align-items:center;gap:16px}
.tpgm-w__ring{flex:0 0 auto;position:relative;width:80px;height:80px}
.tpgm-w__ring svg{transform:rotate(-90deg)}
.tpgm-w__ring-bg{stroke:#e5e7eb;stroke-width:6;fill:none}
.tpgm-w__ring-fg{stroke:${tone.ring};stroke-width:6;fill:none;stroke-linecap:round;transition:stroke-dashoffset .6s ease-out}
.tpgm-w__ring-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;font-weight:600;color:${tone.text}}
.tpgm-w__ring-num{font-size:20px;line-height:1}
.tpgm-w__ring-of{font-size:10px;color:#6b7280;letter-spacing:.04em}
.tpgm-w__meta{flex:1 1 auto;min-width:0}
.tpgm-w__title{font-size:13px;font-weight:600;color:#111827;text-transform:uppercase;letter-spacing:.04em;margin:0 0 4px}
.tpgm-w__band{font-size:14px;font-weight:600;color:${tone.text};margin:0 0 4px}
.tpgm-w__sub{font-size:12px;color:#6b7280;margin:0;line-height:1.4}
.tpgm-w__row{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:#374151;border-top:1px solid #f3f4f6;padding-top:10px}
.tpgm-w__row strong{color:#111827}
.tpgm-w__sect{display:flex;flex-direction:column;gap:6px}
.tpgm-w__sect h4{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:0}
.tpgm-w__list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px}
.tpgm-w__list li{font-size:13px;color:#1f2937;line-height:1.35;padding-left:14px;position:relative}
.tpgm-w__list li::before{content:"";position:absolute;left:0;top:7px;width:6px;height:6px;border-radius:50%;background:${tone.ring}}
.tpgm-w__list em{font-style:normal;color:#6b7280;font-size:12px}
.tpgm-w__course{display:flex;justify-content:space-between;font-size:13px;color:#1f2937;gap:8px}
.tpgm-w__course-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpgm-w__chip{flex:0 0 auto;font-size:11px;padding:2px 8px;border-radius:999px;background:#f3f4f6;color:#374151;text-transform:capitalize}
.tpgm-w__stale{font-size:11px;color:#92400e;background:#fef3c7;padding:2px 8px;border-radius:6px;display:inline-block;margin-top:4px}
.tpgm-w__empty{font-size:12px;color:#6b7280;font-style:italic}
`.trim();

  const ringSvg = `<svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
  <circle class="tpgm-w__ring-bg" cx="40" cy="40" r="${RING_RADIUS}"></circle>
  <circle class="tpgm-w__ring-fg" cx="40" cy="40" r="${RING_RADIUS}" stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"></circle>
</svg>`;

  const compositeLine = composite !== null
    ? `<p class="tpgm-w__sub">PM-credibility composite <strong style="color:#111827">${composite}/100</strong>${pmBridge !== null ? ` · PM-Bridge index <strong style="color:#111827">${pmBridge}/10</strong>` : ''}</p>`
    : pmBridge !== null
      ? `<p class="tpgm-w__sub">PM-Bridge index <strong style="color:#111827">${pmBridge}/10</strong></p>`
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
        <span class="tpgm-w__course-name">${escapeHtml(c.name)}${typeof c.pm_bridge_weight === 'number' ? ` <em style="color:#6b7280;font-style:normal">· bridge ${c.pm_bridge_weight}/10</em>` : ''}</span>
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
        <span class="tpgm-w__ring-of">OF 100</span>
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
