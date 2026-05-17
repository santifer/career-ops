/**
 * lib/tpgm-heartbeat-section.mjs — TPgM heartbeat email section renderer.
 *
 * Pure-function renderer that returns an email-safe HTML block for inclusion
 * in next week's heartbeat email. Uses inline styles only, no external CSS,
 * no JavaScript — Gmail / Outlook / iOS Mail compatible.
 *
 * Per Tier B item #6 task brief: DO NOT wire this into scripts/heartbeat.mjs
 * today. This is the importable surface stub only.
 *
 * Operationalizes Phase 4 Dimensions 9 + 10 (weekly cadence + long-arc
 * tracking) — specifically council finding #34 ("Monday MJML 'Weekly
 * growth' section") and #40 ("Monday heartbeat surfaces the 13-week trend
 * snapshot").
 *
 * Design pillars (DESIGN_PRINCIPLES.md):
 *   - Scannability: ≤ 6 lines of text + 1 score + 1 delta.
 *   - Strengths AND limitations: if weekly_delta is negative or zero, the
 *     copy says so directly — no padding.
 *   - Future-action awareness: a single CTA-style "next step" line.
 *
 * Usage:
 *   import { renderTpgmHeartbeatSection } from '../lib/tpgm-heartbeat-section.mjs';
 *
 *   const html = renderTpgmHeartbeatSection({
 *     score: 65,
 *     evidence_count: 4,
 *     weekly_delta: 12,
 *     week: '2026-W20',
 *     next_action: 'Close Python fluency gap — +9 PM-Bridge points available',
 *   });
 */

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function deltaSummary(delta) {
  if (typeof delta !== 'number' || Number.isNaN(delta)) return { label: 'no week-over-week change', color: '#6b7280' };
  if (delta > 0) return { label: `+${delta} this week`, color: '#16a34a' };
  if (delta < 0) return { label: `${delta} this week`, color: '#dc2626' };
  return { label: 'flat this week', color: '#6b7280' };
}

/**
 * Render the TPgM weekly-growth heartbeat email section.
 *
 * @param {object} input
 * @param {number} input.score              0–100 TPgM-credibility composite
 * @param {number} input.evidence_count     Count of TPgM evidence items in the latest week's extract
 * @param {number} input.weekly_delta       Score change vs the prior week (signed integer/float)
 * @param {string} [input.week]             ISO week label (e.g. "2026-W20")
 * @param {string} [input.next_action]      One-line next-step prompt
 * @returns {string} Inline-styled HTML block, safe for email clients
 */
export function renderTpgmHeartbeatSection(input = {}) {
  const score = Math.max(0, Math.min(100, Math.round(Number(input.score) || 0)));
  const evidenceCount = Math.max(0, Math.round(Number(input.evidence_count) || 0));
  const delta = deltaSummary(Number(input.weekly_delta));
  const week = input.week ? escapeHtml(input.week) : null;
  const nextAction = input.next_action ? escapeHtml(input.next_action) : null;

  const headlineColor = score >= 65 ? '#16a34a' : score >= 40 ? '#1d4ed8' : '#b45309';

  const weekTag = week
    ? `<span style="font-size:12px;color:#6b7280;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">Week ${week}</span>`
    : '';

  const nextActionBlock = nextAction
    ? `<tr><td style="padding:10px 16px 14px 16px;font-size:13px;color:#1f2937;line-height:1.45;border-top:1px solid #f3f4f6;">
         <strong style="color:#111827;">Next:</strong> ${nextAction}
       </td></tr>`
    : '';

  // Single table, no nested floats — works in Outlook 2016+, Gmail web/iOS,
  // Apple Mail. Padding rather than margins to maximize compatibility.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;margin:16px 0;max-width:560px;">
  <tr>
    <td style="padding:16px 16px 8px 16px;">
      ${weekTag}
      <div style="font-size:12px;font-weight:600;color:#6b7280;letter-spacing:0.04em;text-transform:uppercase;margin-top:4px;">Weekly growth — TPgM credibility</div>
    </td>
  </tr>
  <tr>
    <td style="padding:0 16px 12px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding-right:18px;font-size:32px;font-weight:700;color:${headlineColor};line-height:1;vertical-align:middle;">
            ${score}<span style="font-size:14px;color:#9ca3af;font-weight:500;margin-left:2px;">/100</span>
          </td>
          <td style="vertical-align:middle;font-size:13px;color:#374151;line-height:1.45;">
            <div style="font-weight:600;color:${delta.color};">${delta.label}</div>
            <div style="color:#6b7280;font-size:12px;margin-top:2px;">${evidenceCount} new TPgM evidence ${evidenceCount === 1 ? 'item' : 'items'} this week</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ${nextActionBlock}
</table>`;
}

export default renderTpgmHeartbeatSection;
