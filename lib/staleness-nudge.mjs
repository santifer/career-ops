// lib/staleness-nudge.mjs
//
// Funnel-aware staleness nudge (dashboard-optimization-strategy finding #46).
//
// "You evaluated this 20d ago. Apply within 7d or it goes stale."
//
// Urgency tiers (days since evaluation):
//   ≤ 7d   → fresh
//   8–14d  → cooling
//   15–28d → stale
//   > 28d  → expired
//
// Status rules:
//   'Applied'   → never stale (tracking already complete)
//   'Discarded' → never stale (explicitly de-queued)
//   'SKIP'      → never stale (candidate opted out)
//   'Offer'     → never stale
//   'Rejected'  → never stale
//   Only 'Evaluated' and 'Responded' trigger staleness scoring.
//
// All exports are pure (no I/O).
//
// Row object shape (from lib/parse-applications.mjs):
//   { num, date, company, role, score, status, pdf, reportPath, notes }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_THRESHOLDS = {
  fresh:   [0,  7],   // 0–7 d
  cooling: [8,  14],  // 8–14 d
  stale:   [15, 28],  // 15–28 d
  // > 28 d → expired
};

// Statuses for which staleness is meaningful
const STALENESS_ELIGIBLE = new Set(['Evaluated', 'Responded']);

// Statuses that are always "never stale"
const NEVER_STALE = new Set(['Applied', 'Discarded', 'SKIP', 'Offer', 'Rejected', 'Interview']);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse an ISO-format date string (YYYY-MM-DD) to a Date object.
 * @param {string} dateStr
 * @returns {Date|null}
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Compute days elapsed from `from` to `to` (inclusive-start, exclusive-end).
 * Returns 0 when from and to are the same day.
 * @param {Date} from
 * @param {Date} to
 * @returns {number}
 */
function daysBetween(from, to) {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Given days since eval, return the urgency tier label.
 * @param {number} days
 * @returns {'fresh'|'cooling'|'stale'|'expired'}
 */
function tierFor(days) {
  if (days <= 7)  return 'fresh';
  if (days <= 14) return 'cooling';
  if (days <= 28) return 'stale';
  return 'expired';
}

/**
 * Hours remaining until the row advances to the next tier.
 * Returns 0 if already expired.
 * @param {number} days
 * @returns {number}
 */
function hoursUntilNextTier(days) {
  if (days <= 7)  return (7  - days) * 24 + (24 - (days % 1) * 24);
  if (days <= 14) return (14 - days) * 24 + (24 - (days % 1) * 24);
  if (days <= 28) return (28 - days) * 24 + (24 - (days % 1) * 24);
  return 0;
}

// ---------------------------------------------------------------------------
// scoreStaleness
// ---------------------------------------------------------------------------

/**
 * Score a single row's staleness from its evaluation date and status.
 *
 * @param {{
 *   evalDate: string,        – YYYY-MM-DD evaluation/entry date
 *   status: string,          – canonical status string
 *   currentDate?: Date,      – override for testing (defaults to new Date())
 * }} opts
 * @returns {{
 *   days_since_eval: number|null,
 *   urgency_tier: 'fresh'|'cooling'|'stale'|'expired'|'n/a',
 *   recommended_action: string,
 *   hours_until_next_tier: number
 * }}
 */
export function scoreStaleness({ evalDate, status, currentDate } = {}) {
  const now        = currentDate instanceof Date ? currentDate : new Date();
  const statusStr  = (status || '').trim();

  // Statuses that are never stale
  if (NEVER_STALE.has(statusStr) || !STALENESS_ELIGIBLE.has(statusStr)) {
    return {
      days_since_eval:       null,
      urgency_tier:          'n/a',
      recommended_action:    '',
      hours_until_next_tier: 0,
    };
  }

  const parsed = parseDate(evalDate);
  if (!parsed) {
    return {
      days_since_eval:       null,
      urgency_tier:          'fresh',
      recommended_action:    'Evaluation date missing — verify the row date and apply if fit.',
      hours_until_next_tier: 7 * 24,
    };
  }

  const days = daysBetween(parsed, now);
  const tier = tierFor(days);

  const actions = {
    fresh:   `Applied? Mark it now (${days}d since eval).`,
    cooling: `Apply within ${14 - days}d or this row enters stale territory.`,
    stale:   `Evaluated ${days}d ago — apply now or discard to keep the tracker clean.`,
    expired: `Evaluated ${days}d ago. Apply immediately or mark Discarded.`,
  };

  return {
    days_since_eval:       days,
    urgency_tier:          tier,
    recommended_action:    actions[tier],
    hours_until_next_tier: hoursUntilNextTier(days),
  };
}

// ---------------------------------------------------------------------------
// getStaleRows
// ---------------------------------------------------------------------------

/**
 * Filter and annotate rows that have meaningful staleness.
 *
 * @param {Array<object>} rows – parsed applications.md rows
 * @param {{
 *   minTier?: 'fresh'|'cooling'|'stale'|'expired',   – minimum tier to include (default: 'cooling')
 *   currentDate?: Date,
 *   maxRows?: number,                                  – result cap (default: 50)
 * }} opts
 * @returns {Array<object & { staleness: ReturnType<scoreStaleness> }>}
 */
export function getStaleRows(rows, opts = {}) {
  const minTier    = opts.minTier    || 'cooling';
  const maxRows    = opts.maxRows    || 50;
  const currentDate = opts.currentDate instanceof Date ? opts.currentDate : new Date();

  const TIER_ORDER = { fresh: 0, cooling: 1, stale: 2, expired: 3, 'n/a': -1 };
  const minOrder   = TIER_ORDER[minTier] ?? 1;

  if (!Array.isArray(rows)) return [];

  const annotated = rows
    .map(row => {
      const staleness = scoreStaleness({
        evalDate:    row.date,
        status:      row.status,
        currentDate,
      });
      return { ...row, staleness };
    })
    .filter(row => {
      const order = TIER_ORDER[row.staleness.urgency_tier] ?? -1;
      return order >= minOrder;
    });

  // Sort by most-urgent first (expired → stale → cooling → fresh)
  annotated.sort((a, b) => {
    const ao = TIER_ORDER[a.staleness.urgency_tier] ?? -1;
    const bo = TIER_ORDER[b.staleness.urgency_tier] ?? -1;
    if (bo !== ao) return bo - ao;
    // Within same tier: oldest first
    return (b.staleness.days_since_eval ?? 0) - (a.staleness.days_since_eval ?? 0);
  });

  return annotated.slice(0, maxRows);
}

// ---------------------------------------------------------------------------
// renderStalenessBadge
// ---------------------------------------------------------------------------

/**
 * Build an inline HTML badge for the staleness tier.
 * Suitable for table cell insertion.
 *
 * @param {{
 *   urgency_tier: 'fresh'|'cooling'|'stale'|'expired'|'n/a',
 *   days_since_eval: number|null,
 *   recommended_action: string
 * }} staleness  – output of scoreStaleness()
 * @returns {string}  – HTML fragment
 */
export function renderStalenessBadge(staleness) {
  if (!staleness || staleness.urgency_tier === 'n/a') return '';

  const TIER_STYLE = {
    fresh:   'background:#d1fae5;color:#065f46;border:1px solid #6ee7b7',
    cooling: 'background:#fef3c7;color:#92400e;border:1px solid #fcd34d',
    stale:   'background:#fee2e2;color:#991b1b;border:1px solid #fca5a5',
    expired: 'background:#7f1d1d;color:#fef2f2;border:1px solid #dc2626',
  };

  const style   = TIER_STYLE[staleness.urgency_tier] || TIER_STYLE.stale;
  const daysStr = staleness.days_since_eval !== null
    ? `${staleness.days_since_eval}d`
    : '?d';

  const TIER_LABEL = {
    fresh:   `Fresh (${daysStr})`,
    cooling: `Cooling (${daysStr})`,
    stale:   `Stale (${daysStr})`,
    expired: `Expired (${daysStr})`,
  };

  const label  = TIER_LABEL[staleness.urgency_tier] || daysStr;
  const tipRaw = staleness.recommended_action || '';
  const tip    = tipRaw
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<span
  class="staleness-badge staleness-${staleness.urgency_tier}"
  title="${tip}"
  style="
    display: inline-block;
    padding: 2px 7px;
    border-radius: 10px;
    font-size: var(--text-xs, 11px);
    font-weight: 600;
    white-space: nowrap;
    cursor: default;
    ${style}
  "
>${label}</span>`;
}
