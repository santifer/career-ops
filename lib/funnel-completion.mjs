// lib/funnel-completion.mjs
//
// Funnel-completion nudge system (dashboard-optimization-strategy finding #25).
//
// The audit found 137 evaluations and 0 Applied rows — a tracking gap, not a
// real zero. This lib detects that gap, surfaces actionable row suggestions,
// renders a dismissible banner, and builds the tracker-update payload for
// one-click "Mark applied" actions (caller handles the actual writeback).
//
// All exports are pure (no I/O). The calling layer (dashboard-server.mjs or
// build-dashboard.mjs) is responsible for reading data/applications.md and
// persisting any updates.
//
// Row object shape (from lib/parse-applications.mjs):
//   { num, date, company, role, score, status, pdf, reportPath, notes }

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES     = new Set(['Evaluated', 'Responded', 'Interview']);
const NEVER_STALE_STATUSES = new Set(['Applied', 'Discarded', 'SKIP', 'Offer', 'Rejected']);

/**
 * Parse an ISO-format date string (YYYY-MM-DD) to a Date object.
 * Returns null when the string is invalid or empty.
 * @param {string} dateStr
 * @returns {Date|null}
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Days elapsed between two Date objects (returns 0 for same day).
 * @param {Date} from
 * @param {Date} to
 * @returns {number}
 */
function daysBetween(from, to) {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// detectFunnelGap
// ---------------------------------------------------------------------------

/**
 * Inspect the tracker row array and detect the evaluated → applied gap.
 *
 * @param {Array<{status: string}>} rows  – parsed applications.md rows
 * @returns {{
 *   has_gap: boolean,
 *   evaluated_count: number,
 *   applied_count: number,
 *   gap_explanation: string,
 *   recommendation: string
 * }}
 */
export function detectFunnelGap(rows) {
  if (!Array.isArray(rows)) {
    return {
      has_gap: false,
      evaluated_count: 0,
      applied_count: 0,
      gap_explanation: 'No rows provided.',
      recommendation: '',
    };
  }

  let evaluated_count = 0;
  let applied_count   = 0;

  for (const row of rows) {
    const s = (row.status || '').trim();
    if (s === 'Evaluated' || s === 'Responded' || s === 'Interview') {
      evaluated_count++;
    }
    if (s === 'Applied') {
      applied_count++;
    }
  }

  const has_gap = evaluated_count > 0 && applied_count === 0;
  const ratio   = applied_count === 0
    ? 0
    : Math.round((applied_count / evaluated_count) * 100);

  const gap_explanation = has_gap
    ? `${evaluated_count} evaluations and 0 marked Applied — applications may have been submitted without updating the tracker.`
    : applied_count === 0 && evaluated_count === 0
      ? 'No evaluated rows found.'
      : `${applied_count} / ${evaluated_count} evaluated rows have been marked Applied (${ratio}%).`;

  const recommendation = has_gap
    ? 'Mark rows as Applied after each submission so your actual application velocity is visible.'
    : applied_count < Math.ceil(evaluated_count * 0.1)
      ? `Apply-rate is below 10% (${applied_count} / ${evaluated_count}). Review the Apply-Now queue and mark submitted rows as Applied.`
      : '';

  return { has_gap, evaluated_count, applied_count, gap_explanation, recommendation };
}

// ---------------------------------------------------------------------------
// getApplyNowSuggestions
// ---------------------------------------------------------------------------

/**
 * Return rows that are candidates for promotion to "Applied" and surface the
 * overall gap action string.
 *
 * @param {Array<object>} rows  – parsed applications.md rows
 * @param {{
 *   scoreThreshold?: number,    – minimum score to surface (default 4.0)
 *   maxSuggestions?: number,    – cap on promote_to_applied list (default 10)
 *   currentDate?: Date,         – for age calculation (default: now)
 *   staleAfterDays?: number,    – days before an Evaluated row is "stale" (default 21)
 * }} opts
 * @returns {{
 *   stale_evaluated: Array<object>,
 *   promote_to_applied: Array<object>,
 *   gap_action: string
 * }}
 */
export function getApplyNowSuggestions(rows, opts = {}) {
  const scoreThreshold = opts.scoreThreshold ?? 4.0;
  const maxSuggestions = opts.maxSuggestions ?? 10;
  const now            = opts.currentDate   instanceof Date ? opts.currentDate : new Date();
  const staleAfterDays = opts.staleAfterDays ?? 21;

  if (!Array.isArray(rows)) {
    return { stale_evaluated: [], promote_to_applied: [], gap_action: '' };
  }

  const stale_evaluated    = [];
  const promote_to_applied = [];

  for (const row of rows) {
    const status = (row.status || '').trim();
    if (!ACTIVE_STATUSES.has(status)) continue;

    const evalDate = parseDate(row.date);
    const daysOld  = evalDate ? daysBetween(evalDate, now) : null;

    const isStale = daysOld !== null && daysOld >= staleAfterDays;
    if (isStale) {
      stale_evaluated.push({ ...row, days_since_eval: daysOld });
    }

    if (row.score >= scoreThreshold) {
      promote_to_applied.push({ ...row, days_since_eval: daysOld });
    }
  }

  // Sort high-score first, then by date ascending (oldest first)
  promote_to_applied.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.days_since_eval ?? 0) - (b.days_since_eval ?? 0);
  });

  const trimmed    = promote_to_applied.slice(0, maxSuggestions);
  const gap_action = trimmed.length > 0
    ? `${trimmed.length} high-score row(s) ready to mark Applied. Start with ${trimmed[0].company} – ${trimmed[0].role}.`
    : stale_evaluated.length > 0
      ? `${stale_evaluated.length} Evaluated row(s) are more than ${staleAfterDays} days old — mark Applied or Discarded.`
      : '';

  return { stale_evaluated, promote_to_applied: trimmed, gap_action };
}

// ---------------------------------------------------------------------------
// renderFunnelNudge
// ---------------------------------------------------------------------------

/**
 * Build a dismissible HTML banner for the dashboard's funnel gap.
 *
 * Uses --accent-bg design token per the dashboard token system.
 * Dismissed state is persisted in localStorage under key
 * 'careerops.funnel-nudge-dismissed'.
 *
 * @param {{
 *   has_gap: boolean,
 *   evaluated_count: number,
 *   applied_count: number,
 *   gap_explanation: string,
 *   recommendation: string
 * }} gap  – output of detectFunnelGap()
 * @returns {string}  – HTML fragment (safe to innerHTML / server-render)
 */
export function renderFunnelNudge(gap) {
  if (!gap || !gap.has_gap) return '';

  const esc = str => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const explanation  = esc(gap.gap_explanation);
  const recomm       = esc(gap.recommendation);
  const evalCount    = Number(gap.evaluated_count) || 0;
  const appliedCount = Number(gap.applied_count)   || 0;

  return `
<div
  id="funnel-nudge"
  role="status"
  aria-live="polite"
  style="
    display: none;
    background: var(--accent-bg, #eff6ff);
    border: 1px solid var(--accent, #3b82f6);
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 12px;
    font-size: var(--text-sm, 13px);
    color: var(--fg, #1e293b);
    position: relative;
  "
>
  <strong>${evalCount} evaluated · ${appliedCount} applied</strong>
  &mdash; ${explanation}
  ${recomm ? `<span style="display:block;margin-top:4px;opacity:0.85">${recomm}</span>` : ''}
  <button
    onclick="
      localStorage.setItem('careerops.funnel-nudge-dismissed','1');
      document.getElementById('funnel-nudge').style.display='none';
    "
    aria-label="Dismiss funnel nudge"
    style="
      position: absolute;
      top: 8px;
      right: 10px;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      color: var(--fg, #1e293b);
      opacity: 0.5;
    "
  >&times;</button>
</div>
<script>
(function () {
  if (!localStorage.getItem('careerops.funnel-nudge-dismissed')) {
    var el = document.getElementById('funnel-nudge');
    if (el) el.style.display = 'block';
  }
})();
</script>`.trim();
}

// ---------------------------------------------------------------------------
// markApplied
// ---------------------------------------------------------------------------

/**
 * Build the tracker-update payload for marking a row as Applied.
 *
 * Returns a plain object that the caller can use to write back to
 * data/applications.md (via dashboard-server.mjs or a CLI script).
 * This function performs NO file I/O.
 *
 * @param {number|string} rowId          – the row's `num` field
 * @param {{
 *   appliedDate?: string,               – YYYY-MM-DD (defaults to today UTC)
 *   note?: string,                      – optional text to append to notes
 *   existingRow?: object,               – the full row object (for validation)
 * }} opts
 * @returns {{
 *   row_id: number,
 *   patch: { status: string, applied_date: string, notes_append: string },
 *   validation: { ok: boolean, reason: string }
 * }}
 */
export function markApplied(rowId, opts = {}) {
  const id          = parseInt(String(rowId), 10);
  const appliedDate = opts.appliedDate || new Date().toISOString().slice(0, 10);
  const noteAppend  = opts.note ? `Applied ${appliedDate}. ${opts.note}` : `Applied ${appliedDate}.`;

  // Validation
  const existing = opts.existingRow || null;
  if (existing) {
    const currentStatus = (existing.status || '').trim();
    if (NEVER_STALE_STATUSES.has(currentStatus) && currentStatus !== 'Discarded') {
      // Applied / Offer / Rejected are terminal — don't overwrite
      if (currentStatus === 'Applied' || currentStatus === 'Offer' || currentStatus === 'Rejected') {
        return {
          row_id: id,
          patch: { status: 'Applied', applied_date: appliedDate, notes_append: noteAppend },
          validation: {
            ok: false,
            reason: `Row ${id} already has status "${currentStatus}" — no update needed.`,
          },
        };
      }
    }
  }

  if (isNaN(id) || id <= 0) {
    return {
      row_id: id,
      patch: { status: 'Applied', applied_date: appliedDate, notes_append: noteAppend },
      validation: { ok: false, reason: `Invalid rowId: "${rowId}".` },
    };
  }

  return {
    row_id: id,
    patch: {
      status:       'Applied',
      applied_date: appliedDate,
      notes_append: noteAppend,
    },
    validation: { ok: true, reason: '' },
  };
}
