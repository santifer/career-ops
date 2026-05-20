/**
 * lib/polish-card-renderer.mjs
 *
 * Renders the polish-status surfaces for the dashboard:
 *   - renderPolishBadge(status)   → small icon for the apply-now row
 *   - renderPolishDcard(status, opts) → rich drawer card with verdict +
 *     per-artifact breakdown + blocking issues + the 4 action buttons
 *
 * Reads pre-loaded polish-status objects from lib/polish-status-loader.mjs.
 * Pure HTML emission; no I/O. Safe to call inline during build-dashboard.
 */

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const VERDICT_TO_TINT = {
  APPROVED:    { bg: '#dcfce7', border: '#86efac', fg: '#166534' },
  NEEDS_HUMAN: { bg: '#fef3c7', border: '#fcd34d', fg: '#92400e' },
  REJECTED:    { bg: '#fee2e2', border: '#fca5a5', fg: '#991b1b' },
  ABANDONED:   { bg: '#e0e7ff', border: '#a5b4fc', fg: '#3730a3' },
  NEVER:       { bg: '#f9fafb', border: '#e5e7eb', fg: '#6b7280' },
};

function tintFor(status) {
  if (!status) return VERDICT_TO_TINT.NEVER;
  if (status.status_icon === '⏸') return VERDICT_TO_TINT.ABANDONED;
  return VERDICT_TO_TINT[status.verdict] || VERDICT_TO_TINT.NEVER;
}

/**
 * Tiny inline icon shown next to the score in the apply-now row.
 *
 * @param {object|null} status — from polish-status-loader.byRowId.get(id)
 * @returns {string} HTML (a span). Always returns something — ⚪ if never polished.
 */
export function renderPolishBadge(status) {
  if (!status || !status.verdict) {
    return `<span class="polish-badge polish-badge--never" title="Polish has never run on this row" aria-label="Polish never run">⚪</span>`;
  }
  const tint = tintFor(status);
  const tooltip = `Polish ${status.status_label}` +
    (status.overall_confidence != null ? ` — confidence ${status.overall_confidence.toFixed(2)}` : '') +
    (status.polished_at_ago ? ` — ${status.polished_at_ago}` : '') +
    ' (click row for detail)';
  return `<span class="polish-badge polish-badge--${status.verdict || 'unknown'}" style="border-color:${tint.border}" title="${esc(tooltip)}" aria-label="${esc(tooltip)}">${status.status_icon}</span>`;
}

/**
 * Rich drawer-card showing the full polish status for one row.
 *
 * @param {object|null} status — from polish-status-loader. If null, renders a
 *                                "never polished" state with a "Run polish" CTA.
 * @param {object} opts
 * @param {string} opts.rowId — row index used for action button targeting
 * @param {string} opts.packSlug — pack directory slug, used for ledger link
 */
export function renderPolishDcard(status, opts = {}) {
  const rowId = opts.rowId || (status && status.row_id) || '';
  const packSlug = opts.packSlug || (status && status.pack_slug) || '';

  if (!status || !status.verdict) {
    // Never-polished state — render minimal info + invite-to-polish
    return `
<div class="dcard dcard--polish dcard--polish-never" style="border-color:${VERDICT_TO_TINT.NEVER.border};background:${VERDICT_TO_TINT.NEVER.bg};margin-bottom:10px">
  <div class="dcard-label" style="color:${VERDICT_TO_TINT.NEVER.fg}">Polish status</div>
  <div style="font-size:13px;color:#374151;margin-top:4px">
    <span style="font-size:16px;vertical-align:middle">⚪</span> &nbsp; Never polished.
    ${packSlug ? `<button type="button" class="polish-action-btn" onclick="event.stopPropagation();runPolishNow('${esc(rowId)}','${esc(packSlug)}')">Run polish now →</button>` : ''}
  </div>
</div>`.trim();
  }

  const tint = tintFor(status);
  const artifacts = status.per_artifact || {};
  const artifactRows = Object.entries(artifacts).map(([name, a]) => {
    const conf = a.confidence != null ? a.confidence.toFixed(2) : '?';
    const status_chip = a.converged
      ? '<span style="color:#16a34a">✓ converged</span>'
      : a.early_abandoned
        ? '<span style="color:#3730a3">⏸ abandoned</span>'
        : '<span style="color:#9ca3af">…not converged</span>';
    return `<tr>
      <td style="padding:3px 8px 3px 0;font-size:12px;color:#374151;font-weight:600">${esc(name)}</td>
      <td style="padding:3px 8px 3px 0;font-size:12px;color:#6b7280">conf ${conf}</td>
      <td style="padding:3px 8px 3px 0;font-size:12px;color:#6b7280">${a.rounds_used || 0} round${a.rounds_used === 1 ? '' : 's'}</td>
      <td style="padding:3px 0;font-size:12px">${status_chip}</td>
    </tr>`;
  }).join('');

  const blockingIssues = Array.isArray(status.blocking_issues) ? status.blocking_issues : [];
  const blockerList = blockingIssues.length
    ? `<details style="margin-top:8px">
         <summary style="cursor:pointer;font-size:12px;font-weight:600;color:${tint.fg}">Blocking issues (${blockingIssues.length})</summary>
         <ul style="margin:6px 0 0;padding-left:20px;font-size:12px;color:#374151">
           ${blockingIssues.map(b => `<li>${esc(b.finding || '(no detail)')}${b.severity ? ` <span style="color:#9ca3af;font-size:10.5px">[${esc(b.severity)}]</span>` : ''}</li>`).join('')}
         </ul>
       </details>`
    : '';

  // Action buttons — only show if there's a pack slug to act on
  const isActionable = status.verdict === 'REJECTED' || status.verdict === 'NEEDS_HUMAN' || status.status_icon === '⏸';
  const actions = (isActionable && packSlug) ? `
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">
      <button type="button" class="polish-action-btn polish-action-btn--rerun" onclick="event.stopPropagation();repolishRow('${esc(rowId)}','${esc(packSlug)}',true)" title="Re-run polish with --no-early-abandon (forces full burn)">Re-polish (force full)</button>
      <button type="button" class="polish-action-btn polish-action-btn--ledger" onclick="event.stopPropagation();openBulletLedger('${esc(packSlug)}')" title="Open the bullet ledger source so you can rewrite the artifact directly">Open bullet ledger</button>
      <button type="button" class="polish-action-btn polish-action-btn--skip" onclick="event.stopPropagation();skipRowFromPolish('${esc(rowId)}','${esc(packSlug)}')" title="Mark this row Discarded — polish couldn't save it and JD-fit isn't there">Skip this row</button>
    </div>` : '';

  const overallConfLabel = status.overall_confidence != null
    ? `conf ${status.overall_confidence.toFixed(2)} / target ${status.target_confidence.toFixed(2)}`
    : '';
  const costLabel = status.cost_usd > 0 ? `$${status.cost_usd.toFixed(2)} spent` : null;
  const ageLabel = status.polished_at_ago || 'unknown age';

  return `
<div class="dcard dcard--polish dcard--polish-${esc(status.verdict || 'unknown').toLowerCase()}" style="border-color:${tint.border};background:${tint.bg};margin-bottom:10px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">
    <div>
      <div class="dcard-label" style="color:${tint.fg}">Polish status</div>
      <div style="font-size:14px;color:${tint.fg};font-weight:700;margin-top:2px">
        ${status.status_icon} &nbsp; ${esc(status.status_label)}
      </div>
    </div>
    <div style="text-align:right;font-size:11px;color:${tint.fg};line-height:1.5">
      <div>${esc(overallConfLabel)}</div>
      <div>${esc(ageLabel)}${costLabel ? ` · ${esc(costLabel)}` : ''}</div>
    </div>
  </div>
  ${Object.keys(artifacts).length > 0 ? `
  <table style="border-collapse:collapse;width:100%;margin-top:4px">
    ${artifactRows}
  </table>` : ''}
  ${blockerList}
  ${actions}
</div>`.trim();
}

/**
 * Render the small CSS rules used by the badge + dcard.
 * Caller should inline this once into the dashboard's <style>.
 */
export function polishCardStyles() {
  return `
/* Polish status — badge + drawer card (2026-05-19) */
.polish-badge {
  display: inline-block;
  font-size: 14px;
  line-height: 1;
  vertical-align: middle;
  margin-left: 5px;
  padding: 0 4px;
  border-radius: 999px;
  border: 1px solid transparent;
}
.dcard--polish .polish-action-btn {
  font-size: 11.5px;
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.5);
  cursor: pointer;
  transition: background .12s ease, border-color .12s ease;
}
.dcard--polish .polish-action-btn:hover { background: white; border-color: var(--text-3); }
.dcard--polish .polish-action-btn:active { transform: translateY(1px); }
.dcard--polish .polish-action-btn--rerun { font-weight: 600; }
`;
}
