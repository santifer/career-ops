/**
 * lib/outreach-tracker.mjs — Source of truth for LinkedIn / X / email outreach state.
 *
 * Mirrors the followup-cadence.mjs pattern but scoped to outreach touches
 * (DMs, cold emails, X replies) instead of application follow-ups. Stores
 * one record per contact in data/outreach-state.json (gitignored — personal
 * contact data).
 *
 * Schema (see data/linkedin-followup-strategy-2026-05-15.md §4 for the full
 * design rationale):
 *   {
 *     schema_version: 1,
 *     last_updated:   ISO timestamp,
 *     contacts: [{
 *       contact_id: string,           // LinkedIn URL or "{name}|{company}"
 *       name, company, company_normalized,
 *       title_at_send, contact_type,  // recruiter | sourcer | hm | peer | exec | founder
 *       degree:               1 | 2,
 *       linked_application_id?: string,
 *       touches: [{ ts, channel, template_id, outbound, summary }],
 *       status:               'awaiting_reply' | 'warm' | 'responded' | 'dead',
 *       tier:                 'A' | 'B' | 'C',
 *       next_action?: { strategy_id, strategy_name, due_date, confidence,
 *                       rationale, draft_template_id, consensus_cached_at },
 *       intel?: { x_handle, x_last_post_ts, x_recent_themes,
 *                 linkedin_recent_posts, email_guess, referral }
 *     }]
 *   }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { normalizeCompany } from './linkedin-network.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STATE_PATH = join(ROOT, 'data/outreach-state.json');

export const STATUSES   = ['awaiting_reply', 'warm', 'responded', 'dead'];
// internal_snooze is an outbound bookkeeping touch — it records the snooze
// action in the timeline so the user can see *why* a contact disappeared from
// "due today" without inventing a separate event log.
export const CHANNELS   = ['linkedin_dm', 'email', 'x_dm', 'x_reply', 'discord', 'github', 'in_person', 'internal_snooze'];
export const CONTACT_TYPES = ['sourcer', 'recruiter', 'hm', 'peer', 'exec', 'founder'];
export const TIERS      = ['A', 'B', 'C'];

const EMPTY_STATE = () => ({
  schema_version: 1,
  last_updated:   new Date().toISOString(),
  contacts:       [],
});

let _cache = null;

function load() {
  if (_cache) return _cache;
  if (!existsSync(STATE_PATH)) { _cache = EMPTY_STATE(); return _cache; }
  try {
    const obj = JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
    if (!obj.contacts) obj.contacts = [];
    if (!obj.schema_version) obj.schema_version = 1;
    _cache = obj;
  } catch (err) {
    console.error(`[outreach-tracker] failed to parse ${STATE_PATH}: ${err.message}`);
    _cache = EMPTY_STATE();
  }
  return _cache;
}

function persist(state) {
  state.last_updated = new Date().toISOString();
  if (!existsSync(dirname(STATE_PATH))) mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  _cache = state;
}

function findContact(state, contactId) {
  return state.contacts.find(c => c.contact_id === contactId);
}

// ── Public API ─────────────────────────────────────────────────────────────

export function upsertContact({ contact_id, name, company, title_at_send, contact_type = 'recruiter', degree = 1, linked_application_id, tier = 'B' }) {
  if (!contact_id) throw new Error('contact_id required');
  const state = load();
  let c = findContact(state, contact_id);
  if (!c) {
    c = {
      contact_id,
      name:                  name || '',
      company:               company || '',
      company_normalized:    normalizeCompany(company || ''),
      title_at_send:         title_at_send || '',
      contact_type,
      degree,
      linked_application_id: linked_application_id || null,
      touches:               [],
      status:                'awaiting_reply',
      tier,
      next_action:           null,
      intel:                 {},
    };
    state.contacts.push(c);
  } else {
    if (name)                 c.name = name;
    if (company)              { c.company = company; c.company_normalized = normalizeCompany(company); }
    if (title_at_send)        c.title_at_send = title_at_send;
    if (contact_type)         c.contact_type = contact_type;
    if (degree)               c.degree = degree;
    if (linked_application_id) c.linked_application_id = linked_application_id;
    if (tier)                 c.tier = tier;
  }
  persist(state);
  return c;
}

export function logTouch(contactId, { channel, template_id = null, summary = '', outbound = true, ts = null }) {
  if (!CHANNELS.includes(channel)) throw new Error(`unknown channel: ${channel}. Allowed: ${CHANNELS.join(', ')}`);
  const state = load();
  const c = findContact(state, contactId);
  if (!c) throw new Error(`contact not found: ${contactId} — upsertContact() first`);
  c.touches.push({
    ts:          ts || new Date().toISOString(),
    channel,
    template_id,
    outbound,
    summary,
  });
  // An inbound touch is the contact replying — flip status automatically.
  if (!outbound && c.status === 'awaiting_reply') c.status = 'responded';
  persist(state);
  return c;
}

export function setStatus(contactId, status) {
  if (!STATUSES.includes(status)) throw new Error(`unknown status: ${status}. Allowed: ${STATUSES.join(', ')}`);
  const state = load();
  const c = findContact(state, contactId);
  if (!c) throw new Error(`contact not found: ${contactId}`);
  c.status = status;
  // Clear next_action when contact goes to a terminal state.
  if (status === 'responded' || status === 'dead') c.next_action = null;
  persist(state);
  return c;
}

export function setNextAction(contactId, action) {
  const state = load();
  const c = findContact(state, contactId);
  if (!c) throw new Error(`contact not found: ${contactId}`);
  c.next_action = action;
  // Writing a fresh recommendation clears the cancelled-strategy override —
  // the recommender has spoken, so the new next_action is the active one.
  // Marking next_action_replaced_at preserves the historic strategy_cancelled
  // flag for analytics while telling urgency() the user-facing state is fresh.
  if (action && c.strategy_cancelled) c.next_action_replaced_at = new Date().toISOString();
  persist(state);
  return c;
}

export function setIntel(contactId, intel) {
  const state = load();
  const c = findContact(state, contactId);
  if (!c) throw new Error(`contact not found: ${contactId}`);
  c.intel = { ...(c.intel || {}), ...intel };
  persist(state);
  return c;
}

// ── Escape hatches: snooze + cancel-strategy ───────────────────────────────
// Both fields ride on the contact record itself — no separate table — so the
// existing persist() flow handles them for free. The dashboard surfaces them
// via /api/outreach/snooze and /api/outreach/cancel-strategy.

/**
 * Mark a contact as snoozed until `untilIsoDate`. The contact stays in the
 * tracker but is excluded from due_today/breakup/referrals while snoozed.
 *
 * Idempotency: snoozing an already-snoozed contact OVERRIDES the previous
 * snoozed_until value (later wins). Each snooze adds a fresh internal_snooze
 * touch so the user can scroll the timeline and see when/why each snooze
 * fired. The note in the latest touch is the most recent reason.
 *
 * Returns the updated contact.
 */
export function snoozeContact(contactId, untilIsoDate, note = '') {
  if (!contactId) throw new Error('contact_id required');
  if (!untilIsoDate) throw new Error('untilIsoDate required');
  // Accept either YYYY-MM-DD or full ISO. Promote bare dates to end-of-day
  // local so "snooze 1 day" doesn't expire the same calendar day if the user
  // hits it mid-afternoon.
  let until = untilIsoDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(until)) until = `${until}T23:59:59.999Z`;
  const t = Date.parse(until);
  if (Number.isNaN(t)) throw new Error(`invalid untilIsoDate: ${untilIsoDate}`);
  if (t <= Date.now()) throw new Error(`untilIsoDate must be in the future: ${untilIsoDate}`);

  const state = load();
  const c = findContact(state, contactId);
  if (!c) throw new Error(`contact not found: ${contactId}`);
  c.snoozed_until = until;
  c.snoozed_at = new Date().toISOString();
  // Append a bookkeeping touch so the timeline shows when/why we paused.
  // outbound=true so it doesn't flip the awaiting_reply status to responded.
  c.touches.push({
    ts:          c.snoozed_at,
    channel:     'internal_snooze',
    template_id: null,
    outbound:    true,
    summary:     `[snooze until ${until.slice(0, 10)}]${note ? ' ' + note : ''}`,
  });
  persist(state);
  return c;
}

/**
 * Mark the contact's current recommended strategy as cancelled. The contact
 * stays in the tracker (not marked dead) but `next_action` is preserved in
 * place for audit while `strategy_cancelled` causes buildSummary() to scrub
 * it from the output. When npm run outreach:recommend writes a fresh
 * next_action, set `next_action_replaced_at` to clear the override.
 *
 * Idempotency: cancelling an already-cancelled strategy updates the
 * `cancelled_at` timestamp and `reason` to the most recent call.
 *
 * Returns the updated contact.
 */
export function cancelContactStrategy(contactId, reason = '') {
  if (!contactId) throw new Error('contact_id required');
  const state = load();
  const c = findContact(state, contactId);
  if (!c) throw new Error(`contact not found: ${contactId}`);
  c.strategy_cancelled = true;
  c.strategy_cancelled_at = new Date().toISOString();
  c.strategy_cancelled_reason = reason || '';
  // Clear any "freshness" marker so the next recommender pass replaces it.
  c.next_action_replaced_at = null;
  persist(state);
  return c;
}

/**
 * Wake a snoozed contact early — clears snoozed_until so the contact
 * reappears in due_today on the next /api/outreach call. No-op if the
 * contact wasn't snoozed.
 */
export function wakeContact(contactId) {
  if (!contactId) throw new Error('contact_id required');
  const state = load();
  const c = findContact(state, contactId);
  if (!c) throw new Error(`contact not found: ${contactId}`);
  c.snoozed_until = null;
  c.woken_at = new Date().toISOString();
  persist(state);
  return c;
}

export function getContact(contactId) {
  return findContact(load(), contactId) || null;
}

export function listContacts({ status = null, tier = null, company = null } = {}) {
  const state = load();
  let out = state.contacts;
  if (status)  out = out.filter(c => c.status === status);
  if (tier)    out = out.filter(c => c.tier === tier);
  if (company) {
    const norm = normalizeCompany(company);
    out = out.filter(c => c.company_normalized === norm);
  }
  return out;
}

// ── Cadence math ───────────────────────────────────────────────────────────
// Centralized so heartbeat + dashboard + recommender all agree on "is this
// touch due today, overdue, or fresh."

function daysBetween(isoA, isoB) {
  const a = Date.parse(isoA);
  const b = Date.parse(isoB);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

export function daysSinceLastTouch(contact, now = new Date().toISOString()) {
  if (!contact.touches?.length) return null;
  const last = contact.touches[contact.touches.length - 1].ts;
  return daysBetween(last, now);
}

export function touchCount(contact, { outboundOnly = true } = {}) {
  if (!contact.touches?.length) return 0;
  return outboundOnly
    ? contact.touches.filter(t => t.outbound).length
    : contact.touches.length;
}

// Snooze helper — true if contact.snoozed_until is a valid future ISO date.
// Centralised so urgency() + buildSummary() agree on what "currently snoozed"
// means. Past or invalid snoozed_until values are treated as expired (the
// contact is eligible to reappear in due_today).
export function isCurrentlySnoozed(contact, now = new Date().toISOString()) {
  const until = contact?.snoozed_until;
  if (!until) return false;
  const t = Date.parse(until);
  if (Number.isNaN(t)) return false;
  return t > Date.parse(now);
}

// Urgency classification: drives the heartbeat + dashboard color pills.
//   snoozed         — snoozed_until is in the future (overrides everything except terminal states)
//   no_recommendation — strategy_cancelled=true AND no fresh next_action recommendation since
//   fresh           — no action needed (last touch <3 days OR responded/dead)
//   due_soon        — action recommended in next 24h (next_action.due_date = today or tomorrow)
//   overdue         — next_action.due_date is past
//   breakup         — touch_count ≥ 3 AND days_since_last ≥ 14 (strategy 10 window)
//
// strategy_cancelled semantics: the original next_action stays in storage for
// audit, but a cancelled-and-not-yet-replaced strategy is treated as if no
// next_action exists. next_action_replaced_at acts as the "freshness marker"
// — set by setNextAction() when the recommender writes a new one.
export function urgency(contact, now = new Date().toISOString()) {
  if (contact.status === 'responded' || contact.status === 'dead') return 'fresh';
  // Snooze precedence: a snoozed contact is *intentionally* invisible until
  // the timer expires. Beats every other urgency signal short of terminal.
  if (isCurrentlySnoozed(contact, now)) return 'snoozed';
  // Cancelled-without-replacement: user explicitly opted out of the current
  // recommendation. Don't surface as overdue.
  const cancelledNotReplaced = contact.strategy_cancelled && !contact.next_action_replaced_at;
  if (cancelledNotReplaced) return 'no_recommendation';
  const days = daysSinceLastTouch(contact);
  const touches = touchCount(contact);
  if (touches >= 3 && days !== null && days >= 14) return 'breakup';
  const due = contact.next_action?.due_date;
  if (due) {
    const delta = daysBetween(now.slice(0, 10), due);
    if (delta === null) return 'fresh';
    if (delta < 0)  return 'overdue';
    if (delta <= 1) return 'due_soon';
  }
  return 'fresh';
}

// Convenience filters for surfaces. Snoozed contacts are excluded from every
// "needs attention" bucket — they reappear automatically once snoozed_until
// passes (urgency() rechecks on every call).
export function listDueToday() {
  return listContacts({ status: 'awaiting_reply' })
    .filter(c => !isCurrentlySnoozed(c))
    .filter(c => ['due_soon', 'overdue'].includes(urgency(c)));
}

export function listBreakupWindow() {
  return listContacts({ status: 'awaiting_reply' })
    .filter(c => !isCurrentlySnoozed(c))
    .filter(c => urgency(c) === 'breakup');
}

export function listReferralOpportunities() {
  // 2nd-degree contacts whose company has a 1st-degree silent contact —
  // candidates for Strategy 6 (Referral Activation). The dashboard surfaces
  // these alongside the silent contact for a one-click pivot.
  const state = load();
  const silentCompanies = new Set(
    state.contacts
      .filter(c => c.status === 'awaiting_reply' && c.degree === 1 && !isCurrentlySnoozed(c))
      .map(c => c.company_normalized)
  );
  return state.contacts.filter(c =>
    c.degree === 2 &&
    silentCompanies.has(c.company_normalized) &&
    c.status === 'awaiting_reply' &&
    !isCurrentlySnoozed(c)
  );
}

// Contacts currently snoozed — surfaced as a separate dashboard section so
// the user can see what they've quieted and "wake" any of them early.
export function listSnoozed() {
  return listContacts({ status: 'awaiting_reply' })
    .filter(c => isCurrentlySnoozed(c));
}

// ── Summary for surfaces ───────────────────────────────────────────────────
// Single canonical shape consumed by both the heartbeat email section and
// the dashboard /api/outreach endpoint. Keeps "what's due today" identical
// across surfaces — no risk of the email saying 4 and the dashboard saying 5.

// 2026-05-20 — User-configurable outreach intensity + suppression list.
// Read from data/dashboard-settings.json. Filters apply at summary time so
// the dashboard banner, heartbeat email, and any other consumer see the
// same filtered view. Mitchell's stated requirement: "don't prompt me to
// harass connections."
//
// Three knobs:
//   global_intensity  → if 'gentle' or 'aggressive', it overrides everything.
//                       'normal' = let warm/cold knobs decide.
//   warm_intensity    → applies to 1st-degree contacts (people Mitchell
//                       already knows directly).
//   cold_intensity    → applies to 2nd-degree contacts (warm-intro targets).
//                       Defaults to 'gentle' — cold outreach is the
//                       harassment risk.
//   suppression       → universal blocklist; never surfaced from any list.
//
// Intensity semantics:
//   gentle     → only OVERDUE prompts to warm-tier (tier A OR status=warm).
//                Breakup + referrals dropped (cold-pressure surfaces).
//   normal     → today's default (no extra filter).
//   aggressive → today's default + (future) lukewarm/edge cases.
function _loadOutreachSettings() {
  const fp = join(ROOT, 'data/dashboard-settings.json');
  const fallback = {
    global_intensity: 'normal',
    warm_intensity:   'normal',
    cold_intensity:   'gentle',
    suppression:      [],
  };
  if (!existsSync(fp)) return fallback;
  try {
    const s = JSON.parse(readFileSync(fp, 'utf-8'));
    const o = s.outreach || {};
    return {
      global_intensity: o.global_intensity || 'normal',
      warm_intensity:   o.warm_intensity   || 'normal',
      cold_intensity:   o.cold_intensity   || 'gentle',
      suppression:      Array.isArray(o.suppression) ? o.suppression : [],
    };
  } catch { return fallback; }
}

// Pick the effective intensity for a given contact:
//   - If global_intensity is gentle/aggressive, it overrides per-degree.
//   - Otherwise, degree=1 → warm_intensity, degree=2 → cold_intensity.
function _effectiveIntensityFor(contact, s) {
  if (s.global_intensity === 'gentle' || s.global_intensity === 'aggressive') {
    return s.global_intensity;
  }
  return contact.degree === 2 ? s.cold_intensity : s.warm_intensity;
}

function _isSuppressed(contact, suppression) {
  if (!suppression || !suppression.length) return false;
  const cid = String(contact.contact_id || '').toLowerCase();
  const cname = String(contact.name || '').toLowerCase();
  for (const raw of suppression) {
    const s = String(typeof raw === 'string' ? raw : raw.name || raw.id || '').toLowerCase().trim();
    if (!s) continue;
    if (cid.includes(s) || cname.includes(s)) return true;
  }
  return false;
}

function _applyGentleFilter(contact) {
  // Keep only overdue prompts to warm targets (tier A OR status='warm').
  const due = contact.next_action?.due_date;
  if (!due) return false;
  const days = (Date.now() - Date.parse(due)) / 86400000;
  const isOverdue = days > 0;
  const isWarm = contact.tier === 'A' || contact.status === 'warm';
  return isOverdue && isWarm;
}

export function buildSummary() {
  const all = listContacts();
  const dueTodayRaw = listDueToday();
  const breakupRaw = listBreakupWindow();
  const referralsRaw = listReferralOpportunities();
  const snoozed = listSnoozed();

  const settings = _loadOutreachSettings();

  // Per-contact filter: applies the effective intensity (global override OR
  // warm/cold by degree). Gentle = keep only overdue warm-tier. Normal/aggressive
  // = keep as-is.
  const notSuppressed = (c) => !_isSuppressed(c, settings.suppression);
  const passesIntensity = (c) => {
    const eff = _effectiveIntensityFor(c, settings);
    if (eff === 'gentle') return _applyGentleFilter(c);
    return true; // normal + aggressive pass through
  };

  // Suppression universal; intensity per-list. Breakup + referrals are
  // pure cold-pressure surfaces — if EITHER the global OR cold intensity
  // is gentle, drop them entirely.
  const dueTodayFiltered  = dueTodayRaw.filter(notSuppressed);
  const breakupFiltered   = breakupRaw.filter(notSuppressed);
  const referralsFiltered = referralsRaw.filter(notSuppressed);

  const coldIsGentle = settings.global_intensity === 'gentle' || settings.cold_intensity === 'gentle';

  const dueToday  = dueTodayFiltered.filter(passesIntensity);
  const breakup   = coldIsGentle ? [] : breakupFiltered;
  const referrals = coldIsGentle ? [] : referralsFiltered;

  const suppressedCount =
    (dueTodayRaw.length  - dueTodayFiltered.length) +
    (breakupRaw.length   - breakupFiltered.length) +
    (referralsRaw.length - referralsFiltered.length);
  const dimmedByGentle =
    (dueTodayFiltered.length - dueToday.length) +
    (breakupFiltered.length  - breakup.length) +
    (referralsFiltered.length - referrals.length);

  const byStatus = STATUSES.reduce((acc, s) => {
    acc[s] = all.filter(c => c.status === s).length;
    return acc;
  }, {});

  // Strip next_action on summary output for contacts whose strategy was
  // cancelled and not yet replaced. Original state is preserved in storage;
  // this just keeps cancelled recommendations from leaking into "due today"
  // banners after the user explicitly dismissed them.
  const scrubCancelled = (c) => (c.strategy_cancelled && !c.next_action_replaced_at)
    ? { ...c, next_action: null }
    : c;
  return {
    generated_at: new Date().toISOString(),
    intensity: {
      global: settings.global_intensity,
      warm:   settings.warm_intensity,
      cold:   settings.cold_intensity,
    },
    suppression_count: settings.suppression.length,
    counts: {
      total:       all.length,
      by_status:   byStatus,
      due_today:   dueToday.length,
      breakup:     breakup.length,
      referral_opportunities: referrals.length,
      snoozed:     snoozed.length,
      suppressed:  suppressedCount,
      dimmed_by_gentle: dimmedByGentle,
    },
    due_today:   dueToday.map(scrubCancelled),
    breakup:     breakup.map(scrubCancelled),
    referrals:   referrals.map(scrubCancelled),
    snoozed,
  };
}

// ── Reset for tests / re-seeding ───────────────────────────────────────────
export function _resetCache() {
  _cache = null;
}

// CLI smoke test: node lib/outreach-tracker.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = buildSummary();
  console.log(JSON.stringify(summary, null, 2));
}
