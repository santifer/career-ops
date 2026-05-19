/**
 * lib/strategy-recommender.mjs — Picks the next-best outreach strategy.
 *
 * Implements the decision matrix from
 * data/linkedin-followup-strategy-2026-05-15.md §3. Pure function over
 * contact state — same input always returns same output, no side effects.
 *
 * The 10 strategies are the consensus playbook from §2 of the same doc:
 *   1  Timed Second Touch         (day 5-7 new angle)
 *   2  Content Warm-Up            (pre-DM public engagement)
 *   3  Channel Switch             (LinkedIn → email)
 *   4  Value-Give Touch           (share useful resource)
 *   5  Skip-the-Contact Pivot     (find a different person)
 *   6  Referral Activation        (2nd-degree + bonus economics)
 *   7  Pattern Interrupt          (different format / time / framing)
 *   8  Twitter/X Hook             (engage publicly first)
 *   9  Tiered Persistence         (allocate effort by A/B/C tier)
 *  10  Graceful Exit              (breakup DM/email)
 *
 * Phase 4 (multi-LLM consensus) wraps this recommender and overrides the
 * confidence score with cross-provider agreement. Until then, the
 * heuristic confidence below is what's used.
 */

import { touchCount, daysSinceLastTouch } from './outreach-tracker.mjs';

export const STRATEGIES = {
  1:  { name: 'Timed Second Touch',      default_template: 'linkedin_dm_2nd_touch_news_hook' },
  2:  { name: 'Content Warm-Up',         default_template: 'linkedin_engagement_warmup' },
  3:  { name: 'Channel Switch — Email',  default_template: 'email_cold_post_linkedin' },
  4:  { name: 'Value-Give Touch',        default_template: 'linkedin_dm_value_give' },
  5:  { name: 'Skip-the-Contact Pivot',  default_template: 'linkedin_dm_hm_direct' },
  6:  { name: 'Referral Activation',     default_template: 'referral_ask_v1' },
  7:  { name: 'Pattern Interrupt',       default_template: 'linkedin_dm_pattern_interrupt' },
  8:  { name: 'Twitter/X Hook',          default_template: 'x_dm_warmup' },
  9:  { name: 'Tiered Persistence',      default_template: null /* meta-strategy, no template */ },
  10: { name: 'Graceful Exit',           default_template: 'linkedin_dm_breakup' },
};

const SENIOR_CONTACT_TYPES = new Set(['hm', 'exec', 'founder']);

function daysFromNow(daysAhead) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

function hasActiveLinkedInPosts(contact) {
  const posts = contact?.intel?.linkedin_recent_posts || [];
  if (!posts.length) return false;
  // Active = at least one post in the last 14 days.
  const cutoff = Date.now() - 14 * 86400000;
  return posts.some(p => {
    if (!p.ts) return false;
    const t = Date.parse(p.ts);
    return !isNaN(t) && t >= cutoff;
  });
}

function hasRecentXPost(contact, withinDays = 7) {
  const ts = contact?.intel?.x_last_post_ts;
  if (!ts) return false;
  const t = Date.parse(ts);
  if (isNaN(t)) return false;
  return (Date.now() - t) <= withinDays * 86400000;
}

function emailFindable(contact) {
  const e = contact?.intel?.email_guess;
  if (!e) return false;
  // 'high' or 'medium' Hunter pattern confidence counts as findable.
  return e.confidence === 'high' || e.confidence === 'medium';
}

function referralViable(contact) {
  const r = contact?.intel?.referral;
  if (!r) return false;
  const hasBonus = typeof r.bonus_usd === 'number' && r.bonus_usd >= 2000;
  // post_app_eligible can be 'yes' / 'no' / 'unknown'; we treat 'unknown' as
  // viable-with-caveat because the user can ask the employee directly.
  return hasBonus && r.post_app_eligible !== 'no';
}

/**
 * Pure recommender. Returns the suggested next strategy + due date + a
 * heuristic confidence (0-1) + a short rationale. Use this directly, or
 * pass through scripts/recommend-next-action.mjs for multi-LLM consensus.
 *
 * @param {object} contact — full contact record from outreach-tracker.
 * @param {object} [ctx]   — optional context that the contact record doesn't carry.
 * @param {boolean} [ctx.role_still_open] — default true; set false if the JD is dead.
 * @param {boolean} [ctx.hm_identifiable] — for Strategy 5 (skip-the-contact).
 * @param {number}  [ctx.company_size]    — headcount estimate.
 * @returns {{ strategy_id, strategy_name, due_date, confidence, rationale, draft_template_id }}
 */
export function recommend(contact, ctx = {}) {
  if (!contact) throw new Error('contact required');
  const roleOpen     = ctx.role_still_open !== false;
  const hmIdentifiable = !!ctx.hm_identifiable;
  const companySize  = ctx.company_size || null;

  const days    = daysSinceLastTouch(contact);
  const touches = touchCount(contact);

  // Rule 1: Touch ≥ 3 + days ≥ 14 → Graceful Exit. Highest-priority rule
  // because further outreach past this point materially damages the
  // relationship more than silence does.
  if (touches >= 3 && days !== null && days >= 14) {
    return build(10, daysFromNow(0), 0.92,
      `Touch=${touches}, ${days}d silent — past the breakup window. Send the close-loop DM and move on.`);
  }

  // Rule 2: 2nd-degree contact with viable referral → Referral Activation.
  // For 2nd-degree contacts at companies where a referral bonus + post-app
  // eligibility checks out, the referral ask is the structural play —
  // bypasses the cadence question entirely.
  if (contact.degree === 2 && referralViable(contact)) {
    const bonus = contact.intel.referral.bonus_usd;
    const elig = contact.intel.referral.post_app_eligible;
    return build(6, daysFromNow(0), 0.84,
      `2nd-degree, referral bonus $${bonus.toLocaleString()}, post-app eligibility=${elig}. Lead with the referral ask.`);
  }

  // Rule 3: Senior contact + touch = 3 → Pattern Interrupt before exit.
  // Gives one last differentiated shot before Strategy 10 closes the loop.
  if (touches === 3 && SENIOR_CONTACT_TYPES.has(contact.contact_type) && days !== null && days < 14) {
    return build(7, daysFromNow(Math.max(0, 10 - days)), 0.74,
      `Senior contact (${contact.contact_type}), touch 3, ${days}d. One pattern-interrupt before breakup.`);
  }

  // Rule 4: Touch = 1 + 5-7d + role open → Timed Second Touch.
  // The single highest-evidence strategy (3x lift per Jobscan/Phantombuster).
  if (touches === 1 && days !== null && days >= 5 && days <= 7 && roleOpen) {
    return build(1, daysFromNow(0), 0.88,
      `Touch=1, ${days}d, role still open. Second-touch window with a new angle.`);
  }

  // Rule 5: Active LinkedIn posts + touch ≤ 2 → Content Warm-Up first.
  // Don't burn the next DM cold when there's a public engagement layer
  // available that lifts response 3-5x.
  if (touches <= 2 && hasActiveLinkedInPosts(contact)) {
    return build(2, daysFromNow(0), 0.78,
      `Contact posted in last 14 days. Engage publicly on their recent post(s) before re-DMing.`);
  }

  // Rule 6: Touch = 2 + days ≥ 10 + email findable + not sourcer → Channel Switch.
  // Sourcers route cold email to spam at large companies — exclude them.
  if (touches >= 2 && days !== null && days >= 10 && emailFindable(contact) && contact.contact_type !== 'sourcer') {
    return build(3, daysFromNow(0), 0.81,
      `Touch=${touches}, ${days}d, email findable (${contact.intel.email_guess.confidence} confidence). Switch to email.`);
  }

  // Rule 7: Recent X post → X Hook (parallel warm-up layer).
  // Even when LinkedIn isn't responding, X is often a less-crowded channel.
  if (hasRecentXPost(contact) && touches <= 2) {
    return build(8, daysFromNow(0), 0.62,
      `Contact posted on X in last 7 days. Use it as a parallel warm-up channel.`);
  }

  // Rule 8: Original = sourcer + small/mid company + HM identifiable → Skip-the-Contact.
  // FAANG (>1000) excluded — going around a recruiter at scale gets you flagged.
  if (contact.contact_type === 'sourcer' && hmIdentifiable && (companySize === null || companySize < 1000)) {
    return build(5, daysFromNow(0), 0.65,
      `Sourcer at ${companySize ? `~${companySize}-person company` : 'sub-FAANG company'} and HM identifiable. Pivot to hiring manager.`);
  }

  // Rule 9: Touch = 1, days < 5 → wait. Nothing to recommend yet; cadence
  // is too fresh to justify another touch.
  if (touches === 1 && days !== null && days < 5) {
    return build(1, daysFromNow(5 - days), 0.55,
      `Touch=1, ${days}d. Hold until day 5 before second touch.`);
  }

  // Rule 10: Default fallback → graceful exit if past day 14 with 2 touches;
  // else value-give if there's something concrete to share.
  if (touches >= 2 && days !== null && days >= 14) {
    return build(10, daysFromNow(0), 0.60,
      `Touch=${touches}, ${days}d, no specific signal. Graceful exit is safer than another generic touch.`);
  }

  return build(4, daysFromNow(Math.max(0, 7 - (days || 0))), 0.50,
    `No high-confidence rule fired. Value-give touch if something specific is shareable; otherwise wait.`);
}

function build(strategyId, dueDate, confidence, rationale) {
  const s = STRATEGIES[strategyId];
  return {
    strategy_id:       strategyId,
    strategy_name:     s.name,
    due_date:          dueDate,
    confidence,
    rationale,
    draft_template_id: s.default_template,
  };
}

// CLI smoke test: node lib/strategy-recommender.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const sampleContacts = [
    { contact_id: 'a', contact_type: 'recruiter', degree: 1, touches: [{ ts: new Date(Date.now() - 6 * 86400000).toISOString(), outbound: true }] },
    { contact_id: 'b', contact_type: 'sourcer',   degree: 1, touches: [
      { ts: new Date(Date.now() - 20 * 86400000).toISOString(), outbound: true },
      { ts: new Date(Date.now() - 13 * 86400000).toISOString(), outbound: true },
      { ts: new Date(Date.now() - 14 * 86400000).toISOString(), outbound: true },
    ] },
    { contact_id: 'c', contact_type: 'hm',        degree: 1, touches: [{ ts: new Date(Date.now() - 11 * 86400000).toISOString(), outbound: true }, { ts: new Date(Date.now() - 11 * 86400000).toISOString(), outbound: true }], intel: { email_guess: { confidence: 'medium', address: 'x@y.com' } } },
    { contact_id: 'd', contact_type: 'peer',      degree: 2, touches: [{ ts: new Date(Date.now() - 8 * 86400000).toISOString(), outbound: true }], intel: { referral: { bonus_usd: 5000, post_app_eligible: 'unknown' } } },
  ];
  for (const c of sampleContacts) {
    const r = recommend(c, { role_still_open: true, hm_identifiable: true, company_size: 250 });
    console.log(`${c.contact_id} (${c.contact_type}, deg ${c.degree}, ${c.touches.length} touches) → S${r.strategy_id} ${r.strategy_name} [${r.confidence.toFixed(2)}]`);
    console.log(`  ${r.rationale}`);
  }
}
