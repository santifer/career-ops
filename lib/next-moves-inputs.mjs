// lib/next-moves-inputs.mjs
// Loads and normalizes career-ops data from disk into the shape that
// lib/next-moves.mjs expects. Side-effecting (file reads). Kept separate
// from the pure scoring lib so tests don't need fixtures.

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { parseApplicationsText } from './parse-applications.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Load all inputs for the next-moves computation.
 * Returns the object shape consumed by computeNextMoves().
 */
export function loadNextMovesInputs() {
  const apps        = loadApps();
  const liveness    = loadLiveness();
  const outreach    = loadOutreachContacts();
  const queue       = loadResearchQueue();
  const throttle    = computeThrottleByCompany(apps);
  const compMax     = computeCompanyMaxScore(apps);
  const packReady   = detectApplyPacksOnDisk(apps);
  const profile     = loadProfile();
  const shipArts    = curateShipArtifactCandidates(apps);

  return {
    apps,
    livenessByRowNum: liveness,
    outreachContacts: outreach,
    queueFiles: queue,
    throttleByCompany: throttle,
    companyMaxScoreBySlug: compMax,
    applyPackReadyByRow: packReady,
    shipArtifactCandidates: shipArts,
    profile,
  };
}

// ── Tracker ───────────────────────────────────────────────────────────────

function loadApps() {
  const fp = join(ROOT, 'data/applications.md');
  if (!existsSync(fp)) return [];
  const raw = readFileSync(fp, 'utf-8');
  const rows = parseApplicationsText(raw);
  return rows.map(r => ({
    ...r,
    slug: slugify(r.company),
    // url is not in the parser output; we infer it from the report path's row if we can.
    url: null,
  }));
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ── Liveness ──────────────────────────────────────────────────────────────

function loadLiveness() {
  const fp = join(ROOT, 'data/liveness-state.json');
  if (!existsSync(fp)) return {};
  try {
    const data = JSON.parse(readFileSync(fp, 'utf-8'));
    const rows = data.rows || {};
    const out = {};
    for (const [num, row] of Object.entries(rows)) {
      out[Number(num)] = {
        status: row.status,
        url: row.url,
        lastChecked: row.lastChecked,
      };
    }
    return out;
  } catch (_) { return {}; }
}

// ── Outreach ──────────────────────────────────────────────────────────────

function loadOutreachContacts() {
  const fp = join(ROOT, 'data/outreach-state.json');
  if (!existsSync(fp)) return [];
  try {
    const data = JSON.parse(readFileSync(fp, 'utf-8'));
    const contacts = Array.isArray(data.contacts) ? data.contacts : [];
    return contacts.map(c => {
      // Last OUTBOUND touch — the relevant one for cadence decay.
      const outbound = (c.touches || []).filter(t => t.outbound !== false && t.channel !== 'internal_snooze');
      const lastTouch = outbound.length ? outbound[outbound.length - 1] : null;
      return {
        name: c.name,
        company_slug: c.company_normalized || slugify(c.company),
        last_touch_iso: lastTouch ? lastTouch.ts : null,
        relationship_strength_0_5: estimateRelationshipStrength(c),
        channel: lastTouch ? lastTouch.channel : 'linkedin_dm',
        contact_type: c.contact_type,
        tier: c.tier,
        status: c.status,
      };
    });
  } catch (_) { return []; }
}

function estimateRelationshipStrength(c) {
  let s = 0;
  // Degree of separation: 1 = direct, 2 = warm-intro, 3+ = cold
  const degree = Number(c.degree) || 3;
  if (degree === 1) s += 3;
  else if (degree === 2) s += 1.5;
  else s += 0.5;
  // Tier (A/B/C/D) — Mitchell's hand-curated weight
  if (c.tier === 'A') s += 1.5;
  else if (c.tier === 'B') s += 1.0;
  else if (c.tier === 'C') s += 0.5;
  // Any inbound touch is a signal of receptivity
  const hasInbound = (c.touches || []).some(t => t.outbound === false);
  if (hasInbound) s += 1.5;
  return Math.max(0, Math.min(5, Math.round(s)));
}

// ── Research queue ────────────────────────────────────────────────────────

function loadResearchQueue() {
  const dir = join(ROOT, 'data/company-research-queue');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const fp = join(dir, f);
      try {
        if (!statSync(fp).isFile()) return null;
        return JSON.parse(readFileSync(fp, 'utf-8'));
      } catch (_) { return null; }
    })
    .filter(Boolean);
}

// ── Throttle ──────────────────────────────────────────────────────────────
//
// v1: simple per-company active-application cap. 1 active is the default;
// OpenAI exception is hard-coded to 2 (per modes/_profile.md §0a). 'active'
// here means status in {Applied, Interview, Responded} — i.e., engaged in
// the funnel but not yet terminal.
//
// For each non-terminal Evaluated row at the company, set status:
//   blocked  → company is already at or over cap
//   defer    → there's a higher-scored sibling Evaluated row at the same co
//   pickone  → first Evaluated row at this company, no actives yet
//   open     → not Evaluated (won't show in apply candidates anyway)

const COMPANY_CAP_OVERRIDES = { openai: 2 };
const DEFAULT_CAP = 1;
function companyCap(slug) { return COMPANY_CAP_OVERRIDES[slug] || DEFAULT_CAP; }

function computeThrottleByCompany(apps) {
  // Count actives per company
  const activeBySlug = {};
  for (const r of apps) {
    if (/^(applied|interview|responded)$/i.test(r.status || '')) {
      activeBySlug[r.slug] = (activeBySlug[r.slug] || 0) + 1;
    }
  }
  const out = {};
  for (const r of apps) {
    if (!/^evaluated$/i.test(r.status || '')) continue;
    const slug = r.slug;
    const active = activeBySlug[slug] || 0;
    const cap = companyCap(slug);
    if (out[slug]) continue; // first row sets the per-company state
    if (active >= cap) {
      out[slug] = { status: 'blocked', count_active: active, cap };
    } else {
      // First Evaluated at this co → pickone
      out[slug] = { status: 'pickone', count_active: active, cap };
    }
  }
  return out;
}

// ── Company max score ─────────────────────────────────────────────────────

function computeCompanyMaxScore(apps) {
  const out = {};
  for (const r of apps) {
    const score = Number(r.score) || 0;
    if (score <= 0) continue;
    if (!out[r.slug] || score > out[r.slug]) out[r.slug] = score;
  }
  return out;
}

// ── Apply pack readiness ──────────────────────────────────────────────────
//
// Heuristic: does output/ contain any file referencing this row's company?
// Cheap glob — for v1 we just match the company name in any output filename.

function detectApplyPacksOnDisk(apps) {
  const out = {};
  const dir = join(ROOT, 'output');
  if (!existsSync(dir)) return out;
  let names = [];
  try { names = readdirSync(dir).map(n => n.toLowerCase()); } catch (_) { return out; }
  for (const r of apps) {
    const slug = r.slug;
    const rowMarker = String(r.num);
    // Match either the slug in filename or the row number
    const hit = names.some(n => n.includes(slug) || n.includes('-' + rowMarker + '-') || n.includes('-' + rowMarker + '.'));
    if (hit) out[r.num] = true;
  }
  return out;
}

// ── Profile ───────────────────────────────────────────────────────────────

function loadProfile() {
  // v1: hard-coded defaults; the deadline matches DEADLINE_ISO in
  // build-dashboard.mjs. Future: parse modes/_profile.md or config/profile.yml.
  return {
    deadline_iso: '2026-09-30',
    response_window_days: 8,
    target_applications_for_offer: 25,
  };
}

// ── Ship artifact candidates ──────────────────────────────────────────────
//
// Hand-curated v1 — these are project-specific recommendations. The CLI
// runner can be edited to add more. Future: scan cv.md for "(learning)"
// tags and tracker notes for blocked-on-X patterns.

function curateShipArtifactCandidates(apps) {
  const candidates = [];

  // Python (learning) tag — count rows where the tracker note flags Python
  // as a soft-gate. From recent tracker notes (e.g. row 2057 Avicado), this
  // is a recurring drag on AI Enablement scores.
  const pythonBlockedCount = apps.filter(r => {
    const n = String(r.notes || '');
    return /\bpython\b[^.]{0,40}\(learning\)/i.test(n)
        || /python\s+port\s+of\s+scan-rss/i.test(n);
  }).length;
  if (pythonBlockedCount >= 3) {
    candidates.push({
      label: 'Ship Python port of scan-rss.mjs (1-2 wk)',
      evidence: 'Unblocks ' + pythonBlockedCount + ' eval(s) currently capped by Python (learning) tag in cv.md',
      cost_hours: 16,
      unblocks_count: pythonBlockedCount,
      cta: { kind: 'note', text: 'Port scan-rss.mjs → Python; commit to mitwilli-create:main' },
    });
  }

  // AEC-adjacency artifact — referenced in Avicado eval as a viable mitigation
  const aecBlockedCount = apps.filter(r => /\bAEC\b/.test(String(r.notes || ''))).length;
  if (aecBlockedCount >= 2) {
    candidates.push({
      label: 'Ship AEC/construction-tech adjacency case study',
      evidence: 'Unblocks ' + aecBlockedCount + ' AEC-domain eval(s) (Avicado, similar). Use Google CorpEng data-center logistics.',
      cost_hours: 10,
      unblocks_count: aecBlockedCount,
      cta: { kind: 'note', text: 'Draft 800-word adjacency case study on storytellermitch.com' },
    });
  }

  return candidates;
}
