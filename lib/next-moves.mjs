// lib/next-moves.mjs
// "Next Moves" synthesis layer — answers "what should I do next?" by ranking
// concrete actions across the career-ops surface area (apply / follow-up / DM /
// refresh queued research / ship artifact) by expected impact / cost.
//
// Pure function — no I/O. The CLI runner (scripts/compute-next-moves.mjs)
// loads inputs from disk and passes them in, then writes the result.
//
// SCORING MODEL
//   impact (0-1) = quality × leverage × time-sensitivity × confidence
//   cost (hours) = the time Mitchell needs to spend
//   composite    = impact / sqrt(cost + 0.1)  // sub-linear cost penalty so
//                                              // tiny actions don't dominate
//
//   Then we sort descending by composite and keep top N.
//
// MOVE KINDS
//   apply           - Apply to a high-score Evaluated/Responded row
//   follow_up       - Nudge an Applied row past its expected response window
//   dm              - Warm-intro DM via outreach contacts with decayed cadence
//   refresh_research - Click the Refresh button on a queued company section
//   ship_artifact   - Multi-week investment that unblocks multiple evaluations
//
// SKIP LIST
//   Things Mitchell might be tempted to do that score below the threshold or
//   fail a hard gate. Surfaces the *anti-recommendation* explicitly so he
//   doesn't waste cycles on them.

const DEFAULT_TOP_N = 5;
const DEFAULT_SKIP_N = 8;
// Sub-linear cost penalty constant — adding this to cost before sqrt
// prevents zero-cost actions from dominating with composite=inf.
const COST_FLOOR = 0.1;

// ── Public API ────────────────────────────────────────────────────────────

/**
 * @param {Object} i
 * @param {Array}  i.apps              - normalized tracker rows: { num, date, company, role, score, status, notes, url, slug, archetype }
 * @param {Object} i.throttleByCompany - { 'anthropic': { count_active: N, status: 'blocked'|'open'|... } }
 * @param {Object} i.livenessByRowNum  - { 47: { status: 'active'|'expired_discarded'|'expired_needs_review', url } }
 * @param {Array}  i.outreachContacts  - [{ name, company_slug, last_touch_iso, relationship_strength_0_5, channel }]
 * @param {Array}  i.queueFiles        - [{ slug, sections: [{section, ts}], updated_at }]
 * @param {Object} i.companyMaxScoreBySlug - { 'anthropic': 4.65 }
 * @param {Object} i.applyPackReadyByRow - { 47: true } — true if a built apply pack exists on disk
 * @param {Object} i.profile           - { deadline_iso, target_range, throttle_default_max, response_window_days }
 * @param {string} i.todayIso          - YYYY-MM-DD; defaults to today (UTC)
 * @param {number} i.topN              - how many moves to return; default 5
 * @param {number} i.skipN             - how many skip-list items to return; default 8
 * @returns {Object} { generated_at, deadline_stats, top_moves, skip_list, scoring_notes }
 */
export function computeNextMoves(i = {}) {
  const today = i.todayIso || new Date().toISOString().slice(0, 10);
  const todayMs = Date.parse(today + 'T00:00:00Z');
  const deadlineIso = (i.profile && i.profile.deadline_iso) || '2026-09-30';
  const deadlineMs = Date.parse(deadlineIso + 'T23:59:59Z');
  const daysLeft = Math.max(0, Math.round((deadlineMs - todayMs) / 86400000));
  const responseWindowDays = (i.profile && i.profile.response_window_days) || 8;

  const apps = Array.isArray(i.apps) ? i.apps : [];

  // ── Candidate generators ────────────────────────────────────────────────
  const candidates = [];

  candidates.push(...generateApplyMoves(apps, i, { todayMs, responseWindowDays, daysLeft }));
  candidates.push(...generateFollowUpMoves(apps, i, { todayMs, responseWindowDays }));
  candidates.push(...generateDMMoves(i, { todayMs }));
  candidates.push(...generateRefreshMoves(i, { todayMs }));
  candidates.push(...generateShipArtifactMoves(apps, i, { daysLeft }));

  // ── Sort and slice ──────────────────────────────────────────────────────
  candidates.sort((a, b) => b.composite_score - a.composite_score);

  const topN = i.topN || DEFAULT_TOP_N;
  const skipN = i.skipN || DEFAULT_SKIP_N;

  const top_moves = candidates
    .filter(c => !c._skip)
    .slice(0, topN)
    .map((c, idx) => ({ ...c, rank: idx + 1 }));

  // ── Skip list ──────────────────────────────────────────────────────────
  // Surfaces things that LOOK actionable but fail a hard gate or score below
  // the threshold — anti-recommendations.
  const skip_list = generateSkipList(apps, i, candidates).slice(0, skipN);

  // ── Deadline burn-down ─────────────────────────────────────────────────
  const appsApplied = apps.filter(r => /^applied|interview|offer|responded/i.test(r.status || '')).length;
  const appsNeeded = Math.max(0, ((i.profile && i.profile.target_applications_for_offer) || 25) - appsApplied);
  const appsPerWeek = daysLeft > 0 ? (appsNeeded / (daysLeft / 7)).toFixed(1) : '—';

  return {
    generated_at: new Date().toISOString(),
    deadline_stats: {
      deadline_iso: deadlineIso,
      days_left: daysLeft,
      apps_applied: appsApplied,
      apps_needed_estimate: appsNeeded,
      apps_per_week_required: appsPerWeek,
    },
    top_moves,
    skip_list,
    scoring_notes: {
      candidate_count: candidates.length,
      by_kind: countByKind(candidates),
      formula: 'composite = impact_score / sqrt(cost_hours + ' + COST_FLOOR + ')',
    },
  };
}

// ── Candidate generators ──────────────────────────────────────────────────

function generateApplyMoves(apps, i, ctx) {
  const moves = [];
  const throttle = i.throttleByCompany || {};
  const liveness = i.livenessByRowNum || {};
  const packReady = i.applyPackReadyByRow || {};

  for (const r of apps) {
    const score = num(r.score);
    if (score < 4.0) continue;
    if (!/^(evaluated|responded)$/i.test(r.status || '')) continue;

    const slug = (r.slug || (r.company || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
    const t = throttle[slug] || { status: 'open' };
    const lv = liveness[r.num] || { status: 'unknown' };

    // Hard gates
    if (t.status === 'blocked') {
      moves.push(_skipShim('apply', r, 'Company throttle blocked (already at active cap)'));
      continue;
    }
    if (lv.status === 'expired_discarded') {
      moves.push(_skipShim('apply', r, 'Posting expired (per overnight liveness sweep)'));
      continue;
    }

    // Scoring
    const scoreLift = clamp((score - 4.0) / 1.0, 0, 1);          // 4.0→0, 5.0→1
    const throttleMult = t.status === 'pickone' ? 1.0 : t.status === 'defer' ? 0.5 : 0.8;
    const livenessMult = lv.status === 'active' ? 1.0 : lv.status === 'expired_needs_review' ? 0.6 : 0.8;
    const deadlineMult = ctx.daysLeft <= 60 ? 1.2 : ctx.daysLeft <= 120 ? 1.0 : 0.9;
    const responseStatusMult = /responded/i.test(r.status || '') ? 1.3 : 1.0;

    const impact_score = clamp(
      (0.35 + 0.6 * scoreLift) * throttleMult * livenessMult * deadlineMult * responseStatusMult,
      0, 1
    );
    const cost_hours = packReady[r.num] ? 1.0 : 3.0;

    moves.push({
      kind: 'apply',
      label: 'Apply to [' + r.num + '] ' + (r.role || '?') + ' @ ' + (r.company || '?') + ' (' + score.toFixed(1) + ')',
      evidence: _applyEvidence(r, t, lv, packReady[r.num]),
      cost_hours,
      impact_score: round(impact_score, 3),
      composite_score: composite(impact_score, cost_hours),
      signals: [
        { name: 'score', value: score },
        { name: 'status', value: r.status },
        { name: 'throttle', value: t.status },
        { name: 'liveness', value: lv.status },
        { name: 'pack_ready', value: !!packReady[r.num] },
      ],
      cta: { kind: 'open-row-drawer', row_num: r.num, url: r.url || null },
      slug,
      row_num: r.num,
    });
  }
  return moves;
}

function _applyEvidence(r, t, lv, packReady) {
  const bits = [];
  if (/responded/i.test(r.status || '')) bits.push('They’ve responded — momentum');
  if (t.status === 'pickone')            bits.push('Throttle says pick THIS one first');
  else if (t.status === 'defer')          bits.push('Defer — higher-scored sibling open');
  if (lv.status === 'active')             bits.push('Posting verified alive overnight');
  else if (lv.status === 'expired_needs_review') bits.push('Liveness uncertain — verify first');
  bits.push(packReady ? 'Apply pack ready on disk' : 'Pack needs build (~2 extra hrs)');
  return bits.join(' · ');
}

function generateFollowUpMoves(apps, i, ctx) {
  const moves = [];
  for (const r of apps) {
    if (!/^applied$/i.test(r.status || '')) continue;
    const appliedMs = Date.parse((r.date || '') + 'T12:00:00Z');
    if (!appliedMs) continue;
    const daysSince = Math.floor((ctx.todayMs - appliedMs) / 86400000);
    // Sweet spot: 1-2 days BEFORE the company's expected response window closes
    if (daysSince < (ctx.responseWindowDays - 2)) continue;
    if (daysSince > 28) continue; // past graveyard, move on

    const score = num(r.score);
    const urgency = clamp((daysSince - (ctx.responseWindowDays - 2)) / 10, 0, 1);
    const scoreLift = clamp((score - 3.5) / 1.5, 0, 1);

    const impact_score = round(0.35 * scoreLift + 0.25 * urgency + 0.15, 3);
    moves.push({
      kind: 'follow_up',
      label: 'Follow up on [' + r.num + '] ' + (r.role || '?') + ' @ ' + (r.company || '?'),
      evidence: 'Applied ' + daysSince + 'd ago · mean response ' + ctx.responseWindowDays + 'd · sweet spot for nudge',
      cost_hours: 0.25,
      impact_score,
      composite_score: composite(impact_score, 0.25),
      signals: [
        { name: 'days_since_applied', value: daysSince },
        { name: 'score', value: score },
      ],
      cta: { kind: 'open-row-drawer', row_num: r.num },
      row_num: r.num,
    });
  }
  return moves;
}

function generateDMMoves(i, ctx) {
  const moves = [];
  const contacts = Array.isArray(i.outreachContacts) ? i.outreachContacts : [];
  const compMax = i.companyMaxScoreBySlug || {};

  for (const c of contacts) {
    const lastTouchMs = c.last_touch_iso ? Date.parse(c.last_touch_iso) : 0;
    const daysSince = lastTouchMs ? Math.floor((ctx.todayMs - lastTouchMs) / 86400000) : 999;
    // Don't DM more than once per 10 days, don't bother if cold > 90 days
    if (daysSince < 10) continue;
    if (daysSince > 90 && c.relationship_strength_0_5 < 3) continue;

    const slug = (c.company_slug || '').toLowerCase();
    const companyScore = compMax[slug] || 3.0;
    if (companyScore < 3.8) continue; // not worth reaching out for sub-threshold companies

    const strength = clamp(num(c.relationship_strength_0_5, 0) / 5, 0, 1);
    const scoreLift = clamp((companyScore - 3.8) / 1.2, 0, 1);
    const decay = clamp(daysSince / 30, 0, 1); // more urgent the longer it's been

    const impact_score = round(0.3 * strength + 0.35 * scoreLift + 0.15 * decay, 3);
    moves.push({
      kind: 'dm',
      label: 'DM ' + (c.name || 'contact') + ' @ ' + (c.company_slug || '?') + ' (best role ' + companyScore.toFixed(1) + ')',
      evidence: 'Strength ' + (c.relationship_strength_0_5 || 0) + '/5 · last touch ' + (daysSince === 999 ? 'never' : daysSince + 'd ago') + ' · channel ' + (c.channel || 'LinkedIn'),
      cost_hours: 0.5,
      impact_score,
      composite_score: composite(impact_score, 0.5),
      signals: [
        { name: 'days_since_touch', value: daysSince === 999 ? null : daysSince },
        { name: 'relationship', value: c.relationship_strength_0_5 || 0 },
        { name: 'company_max_score', value: companyScore },
      ],
      cta: { kind: 'open-outreach-contact', slug, name: c.name },
      slug,
    });
  }
  return moves;
}

function generateRefreshMoves(i, ctx) {
  const moves = [];
  const queue = Array.isArray(i.queueFiles) ? i.queueFiles : [];
  for (const q of queue) {
    const updatedMs = Date.parse(q.updated_at || '');
    if (!updatedMs) continue;
    const daysSince = Math.floor((ctx.todayMs - updatedMs) / 86400000);
    if (daysSince < 2) continue; // give the worker time to run

    const sectionCount = (q.sections || []).length;
    const impact_score = round(clamp(0.1 + 0.04 * sectionCount + 0.02 * daysSince, 0, 0.5), 3);

    moves.push({
      kind: 'refresh_research',
      label: 'Refresh queued research on ' + (q.slug || '?') + ' (' + sectionCount + ' section' + (sectionCount === 1 ? '' : 's') + ')',
      evidence: 'Queued ' + daysSince + 'd ago — sections: ' + (q.sections || []).map(s => s.section).join(', '),
      cost_hours: 0.05,
      impact_score,
      composite_score: composite(impact_score, 0.05),
      signals: [
        { name: 'days_in_queue', value: daysSince },
        { name: 'section_count', value: sectionCount },
      ],
      cta: { kind: 'open-company-profile', slug: q.slug },
      slug: q.slug,
    });
  }
  return moves;
}

// Hand-curated ship-artifact suggestions. v1 reads them from
// inputs.shipArtifactCandidates if provided; otherwise empty. The CLI runner
// can hard-code a few based on profile state. Not auto-discovered yet.
function generateShipArtifactMoves(apps, i, ctx) {
  const moves = [];
  const candidates = Array.isArray(i.shipArtifactCandidates) ? i.shipArtifactCandidates : [];
  for (const c of candidates) {
    const cost = num(c.cost_hours, 8);
    const unblocks = num(c.unblocks_count, 1);
    const impact_score = round(clamp(0.4 + 0.08 * unblocks, 0, 1), 3);
    moves.push({
      kind: 'ship_artifact',
      label: c.label,
      evidence: c.evidence || ('Unblocks ' + unblocks + ' evaluation(s)'),
      cost_hours: cost,
      impact_score,
      composite_score: composite(impact_score, cost),
      signals: [
        { name: 'unblocks_evaluations', value: unblocks },
        { name: 'cost_hours', value: cost },
      ],
      cta: c.cta || { kind: 'note', text: c.label },
    });
  }
  return moves;
}

// ── Skip list ────────────────────────────────────────────────────────────

function generateSkipList(apps, i, candidates) {
  const skips = [];
  // Apps below threshold that Mitchell might be tempted by
  const subThreshold = apps
    .filter(r => num(r.score) >= 3.5 && num(r.score) < 4.0 && /^evaluated$/i.test(r.status || ''))
    .sort((a, b) => num(b.score) - num(a.score))
    .slice(0, 10);
  for (const r of subThreshold) {
    skips.push({
      kind: 'skip_below_threshold',
      label: '[' + r.num + '] ' + (r.role || '?') + ' @ ' + (r.company || '?') + ' (' + num(r.score).toFixed(1) + '/5)',
      reason: 'Below 4.0 apply floor — return on time is poor vs above-floor surface',
      row_num: r.num,
    });
  }
  // Blocked-by-throttle candidates surfaced upstream
  for (const c of candidates) {
    if (c._skip && c.kind === 'apply') {
      skips.push({
        kind: 'skip_throttle_or_dead',
        label: c.label.replace(/^Apply to /, ''),
        reason: c.evidence,
        row_num: c.row_num,
      });
    }
  }
  return skips;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function _skipShim(kind, r, reason) {
  return {
    _skip: true,
    kind,
    label: 'Apply to [' + r.num + '] ' + (r.role || '?') + ' @ ' + (r.company || '?'),
    evidence: reason,
    row_num: r.num,
  };
}

function composite(impact, cost) {
  return round(impact / Math.sqrt(Math.max(0, cost) + COST_FLOOR), 4);
}

function num(v, dflt = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : dflt;
}

function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

function round(x, places = 3) {
  const m = Math.pow(10, places);
  return Math.round(x * m) / m;
}

function countByKind(arr) {
  const out = {};
  for (const c of arr) { if (!c._skip) out[c.kind] = (out[c.kind] || 0) + 1; }
  return out;
}
