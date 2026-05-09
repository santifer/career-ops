// lib/status-key.mjs — single source of truth for the lowercased
// substring-match status ladder used across the dashboard. Imported by
// the build script (server-side) and inlined verbatim into the client
// bundle so all three layers (build, server, browser) stay in sync.
//
// statusKey(s)        → canonical key ('applied', 'interview', …)
// statusBadgeClass(s) → CSS class ('status-applied', …)
//
// The function source is also exported as STATUS_KEY_SOURCE +
// STATUS_BADGE_CLASS_SOURCE so build-dashboard.mjs can inject the exact
// same logic into the inline client script without re-typing it.

export function statusKey(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('applied'))   return 'applied';
  if (s.includes('responded')) return 'responded';
  if (s.includes('interview')) return 'interview';
  if (s.includes('offer'))     return 'offer';
  if (s.includes('reject'))    return 'rejected';
  if (s.includes('discard'))   return 'discarded';
  if (s.includes('skip'))      return 'skip';
  return 'evaluated';
}

export function statusBadgeClass(status) {
  const key = statusKey(status);
  if (key === 'skip')      return 'status-discarded';
  if (key === 'responded') return 'status-evaluated';
  return `status-${key}`;
}

// Source strings used by build-dashboard.mjs to inject the exact same
// implementation into the inline client script. Keeping the function
// body here (not duplicating it as a string) prevents drift.
export const STATUS_KEY_SOURCE          = statusKey.toString();
export const STATUS_BADGE_CLASS_SOURCE  = statusBadgeClass.toString();
