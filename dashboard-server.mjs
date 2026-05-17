#!/usr/bin/env node
// dashboard-server.mjs — serves dashboard/index.html + live API endpoints
// Usage: node dashboard-server.mjs [--port=3000]

import { createServer } from 'http';
import { readFileSync, existsSync, statSync, readdirSync, appendFileSync, writeFileSync, renameSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomBytes } from 'crypto';
import { execSync as _execSync } from 'child_process';
import yaml from 'js-yaml';
import { marked } from 'marked';
import { parseApplicationsFile } from './lib/parse-applications.mjs';
import { statusKey, statusBadgeClass } from './lib/status-key.mjs';
import { getCachedUrl } from './lib/resolve-ats-url.mjs';
import {
  buildSummary as buildOutreachSummary,
  getContact as getOutreachContact,
  listContacts as listOutreachContacts,
  upsertContact as upsertOutreachContact,
  logTouch as logOutreachTouch,
  setStatus as setOutreachStatus,
  snoozeContact as snoozeOutreachContact,
  cancelContactStrategy as cancelOutreachStrategy,
  wakeContact as wakeOutreachContact,
  _resetCache as resetOutreachCache,
} from './lib/outreach-tracker.mjs';
import { estimateTTO } from './lib/tto-estimator.mjs';
import { scoreToxicity } from './lib/toxicity-scorer.mjs';

// ── Application enrichment for outreach API ────────────────────────────────
// Join contact.linked_application_id → applications.md row so the dashboard
// can render "→ [#1511] OpenAI Onboarding FDE (4.65)" inline. Cached for 30s
// so 60s dashboard polls don't re-parse the 136-row tracker each time.
let _appsCache = { ts: 0, byNum: new Map() };
function appsByNum() {
  if (Date.now() - _appsCache.ts < 30_000 && _appsCache.byNum.size) return _appsCache.byNum;
  const apps = parseApplicationsFile(join(ROOT, 'data/applications.md'));
  const byNum = new Map();
  for (const a of apps) byNum.set(String(a.num), a);
  _appsCache = { ts: Date.now(), byNum };
  return byNum;
}
function enrichContact(c) {
  if (!c?.linked_application_id) return c;
  const app = appsByNum().get(String(c.linked_application_id));
  if (!app) return c;
  return {
    ...c,
    linked_application: {
      num:     app.num,
      company: app.company,
      role:    app.role,
      score:   app.score,
      status:  app.status,
      report:  app.reportPath || null,
    },
  };
}
function enrichOutreachSummary(summary) {
  return {
    ...summary,
    due_today: (summary.due_today || []).map(enrichContact),
    breakup:   (summary.breakup   || []).map(enrichContact),
    referrals: (summary.referrals || []).map(enrichContact),
    snoozed:   (summary.snoozed   || []).map(enrichContact),
  };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '3000');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

// ── Report summary parser ──────────────────────────────────────

function stripMarkdown(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseReportSummary(reportPath) {
  const empty = { score: null, archetype: null, url: null, legitimacy: null, tldr: null, comp: null, location: null, topEdges: [], topGaps: [] };
  try {
    const abs = join(ROOT, reportPath);
    if (!existsSync(abs)) return empty;
    const text = readFileSync(abs, 'utf8');
    const lines = text.split('\n');

    // Extract header fields
    const scoreMatch   = text.match(/\*\*Score:\*\*\s*([\d.]+)/);
    const archMatch    = text.match(/\*\*Archetype:\*\*\s*([^\n]+)/);
    const urlMatch     = text.match(/\*\*URL:\*\*\s*(https?:\/\/[^\s\n]+)/);
    const legitMatch   = text.match(/\*\*Legitimacy:\*\*\s*([^\n]+)/);

    // Comp: extract from Block A or Block D table rows
    let comp = null;
    const looksLikeComp = (s) => s && !/^\d+\/5\s*$/.test(s) && !/^(value|tier|score)$/i.test(s) &&
      /[\$€£]|\bK\b|\b(TC|base|comp|salary|total comp|OTE|range)\b/i.test(s);
    const labelRe = /^\s*\|\s*\*?\*?\s*(?:Comp(?:ensation)?|Listed Annual Salary|Salary|Posted base salary)\b[^|]*?\|/i;

    const extractCompFromBlock = (blockText) => {
      for (const l of blockText.split('\n')) {
        if (!labelRe.test(l)) continue;
        const cells = l.split('|').map(c => c.replace(/\*\*/g, '').trim()).filter(Boolean);
        for (let ci = 1; ci < cells.length; ci++) {
          if (looksLikeComp(cells[ci])) return cells[ci].slice(0, 120);
        }
      }
      return null;
    };

    const blockAStart = text.search(/^## A\)[^\n]*$/m);
    const blockAEnd   = text.indexOf('\n## ', blockAStart + 1);
    const blockA = blockAStart >= 0 ? text.slice(blockAStart, blockAEnd > 0 ? blockAEnd : blockAStart + 3000) : '';
    if (blockA) comp = extractCompFromBlock(blockA);

    // Fall back to Block D if Block A had no comp row
    if (!comp) {
      const blockDStart = text.search(/^## D\)[^\n]*$/m);
      const blockDEnd   = text.indexOf('\n## ', blockDStart + 1);
      const blockD = blockDStart >= 0 ? text.slice(blockDStart, blockDEnd > 0 ? blockDEnd : blockDStart + 3000) : '';
      if (blockD) comp = extractCompFromBlock(blockD);
    }

    // Location: extract from Block A "Location" / "Remote" / "Locations" row
    let location = null;
    if (blockA) {
      for (const l of blockA.split('\n')) {
        if (!/^\s*\|\s*\*?\*?\s*(?:Location|Remote|Locations?)\b/i.test(l)) continue;
        const cells = l.split('|').map(c => c.replace(/\*\*/g, '').trim()).filter(Boolean);
        if (cells.length > 1) { location = cells[1].slice(0, 200); break; }
      }
    }

    // TL;DR: text after first ## B) or TLDR or Final Recommendation heading
    let tldr = null;
    const tldrSectionIdx = lines.findIndex(l =>
      /^##\s+B\)/.test(l) || /tldr/i.test(l) || /final recommendation/i.test(l)
    );
    if (tldrSectionIdx >= 0) {
      const chunk = lines.slice(tldrSectionIdx + 1, tldrSectionIdx + 30).join(' ');
      const clean = stripMarkdown(chunk);
      tldr = clean.slice(0, 300) || null;
    }

    // Top edges: first 3 bullet lines after ## D)
    const edgeSectionIdx = lines.findIndex(l => /^##\s+D\b/.test(l));
    let topEdges = [];
    if (edgeSectionIdx >= 0) {
      let count = 0;
      for (let i = edgeSectionIdx + 1; i < lines.length && count < 3; i++) {
        const l = lines[i];
        if (/^##/.test(l)) break;
        if (/^[-*]\s+/.test(l) || /^\d+\.\s+/.test(l)) {
          const clean = stripMarkdown(l).slice(0, 120);
          if (clean) { topEdges.push(clean); count++; }
        }
      }
    }

    // Top gaps: first 2 bullet lines after ## E) or ## Gap
    const gapSectionIdx = lines.findIndex(l => /^##\s+E\b/.test(l) || /^##.*gap/i.test(l));
    let topGaps = [];
    if (gapSectionIdx >= 0) {
      let count = 0;
      for (let i = gapSectionIdx + 1; i < lines.length && count < 2; i++) {
        const l = lines[i];
        if (/^##/.test(l)) break;
        if (/^[-*]\s+/.test(l) || /^\d+\.\s+/.test(l)) {
          const clean = stripMarkdown(l).slice(0, 100);
          if (clean) { topGaps.push(clean); count++; }
        }
      }
    }

    const rawUrl = urlMatch ? urlMatch[1].trim() : null;
    return {
      score:      scoreMatch  ? parseFloat(scoreMatch[1])       : null,
      archetype:  archMatch   ? archMatch[1].trim()              : null,
      url:        rawUrl      ? getCachedUrl(rawUrl, ROOT)       : null,
      legitimacy: legitMatch  ? legitMatch[1].trim()             : null,
      tldr,
      comp,
      location,
      topEdges,
      topGaps,
    };
  } catch (_) {
    return empty;
  }
}

// ── Shared parsers ─────────────────────────────────────────────

// parseApplications lives in lib/parse-applications.mjs (single source of
// truth — also used by build-dashboard.mjs). The rest of this file expects
// `r.report` for the report path, but the lib returns `reportPath`; we
// add `report` as an alias here so call sites stay unchanged.
function parseApplications() {
  return parseApplicationsFile(join(ROOT, 'data/applications.md'))
    .map(r => ({ ...r, report: r.reportPath || null }));
}

function parsePipeline() {
  const path = join(ROOT, 'data/pipeline.md');
  if (!existsSync(path)) return { tier1: 0, tier2: 0, tier3: 0, total: 0 };
  const content = readFileSync(path, 'utf8');
  const lines = content.split('\n');
  let tier = 0, t1 = 0, t2 = 0, t3 = 0;
  for (const l of lines) {
    if (l.includes('Tier 1')) tier = 1;
    else if (l.includes('Tier 2')) tier = 2;
    else if (l.includes('Tier 3')) tier = 3;
    if (l.startsWith('- [ ]')) {
      if (tier === 1) t1++;
      else if (tier === 2) t2++;
      else if (tier === 3) t3++;
    }
  }
  return { tier1: t1, tier2: t2, tier3: t3, total: t1 + t2 + t3 };
}

// ── Pipeline preview + spawner for the "Run Batch" / "Process All" buttons ─
// Per-item cost ground truth comes from data/cost-log.tsv ($0.06/eval observed
// for the legacy triage-only path; Tier 5 enrichment economics are richer).
//
// Per-run caps were calibrated against the Tier 5 enrichment economics
// (per-company council intel + contact discovery + outreach drafts + apply-pack
// pre-gen on high-confidence items). The post-calibration ground truth:
//   - Run Batch (default top-5 items, Tier 5):   ~$15-25/run
//   - Process All (~100 items, Tier 5 amortized cache): ~$200-280/run
//   - Overnight auto-run (~5-10 Apply-Now items): ~$15-30/night
//   - Monthly steady-state target: $500/mo (calibration brief 2026-05-16)
//
// All caps overridable via env vars so power-user / interview-week bursts can
// raise the ceiling without code changes.
const COST_PER_TRIAGE_HAIKU      = 0.005;
const COST_PER_TRIAGE_SONNET_JD  = 0.07;   // Tier 5 enriched triage per item
const COST_PER_BATCH_EVAL        = 0.060;
const COST_PER_COMPANY_COUNCIL   = 2.00;   // council-of-models + dealbreaker per unique company
const COST_PER_APPLY_PACK_PREGEN = 2.50;   // build-apply-packs.mjs per high-conf item
const ADVANCE_RATE_ESTIMATE      = 0.50;   // historical: 11–72%; 50% is conservative mid
const HIGH_CONFIDENCE_PREGEN_RATE = 0.20;  // % of items hitting ≥4.5 + high-conf flag
const COMPANY_CACHE_HIT_RATE     = 0.50;   // % of unique companies already cached (30d TTL)

const PER_RUN_CAP_RUN_BATCH    = parseFloat(process.env.PER_RUN_CAP_RUN_BATCH_USD    || '25');
const PER_RUN_CAP_PROCESS_ALL  = parseFloat(process.env.PER_RUN_CAP_PROCESS_ALL_USD  || '250');
const PER_RUN_CAP_APPLY_PACK   = parseFloat(process.env.PER_RUN_CAP_APPLY_PACK_USD   || '5');
const DAILY_CAP_OVERNIGHT      = parseFloat(process.env.DAILY_CAP_OVERNIGHT_USD      || '20');
// Single-row apply-pack estimate (council pricing). build-apply-pack.mjs today
// only scaffolds stubs (~$0), but the prompt assumes it will eventually run
// the council + humanize-check passes — budget for that future state so the
// cap meaningfully gates power-user "regenerate everything" loops.
const COST_PER_APPLY_PACK_USD  = parseFloat(process.env.COST_PER_APPLY_PACK_USD || '2.50');

function countPipelinePending() {
  const fp = join(ROOT, 'data/pipeline.md');
  if (!existsSync(fp)) return 0;
  return readFileSync(fp, 'utf-8').split('\n').filter(l => l.startsWith('- [ ]')).length;
}

function countTriageAdvanceQueued() {
  const fp = join(ROOT, 'batch/triage-advance.tsv');
  if (!existsSync(fp)) return 0;
  return Math.max(0, readFileSync(fp, 'utf-8').split('\n').filter(l => l.trim() && !l.startsWith('#')).length - 1);
}

function getMonthlyBudget() {
  // Calibration 2026-05-16: default raised from $50 to $500 to accommodate
  // Tier 5 nightly enrichment + manual Run Batch + occasional Process All.
  // Override via MONTHLY_BUDGET_USD env if running heavier or lighter.
  return parseFloat(process.env.MONTHLY_BUDGET_USD || '500');
}

function getBurstBudget() {
  // Burst-mode for interview weeks: raise the ceiling temporarily, deduct
  // from next month's cap. Set MONTHLY_BUDGET_USD_BURST=1000 + MONTHLY_BUDGET_BURST_UNTIL=YYYY-MM-DD
  // to activate. Returns 0 if burst is disabled or expired.
  const burst = parseFloat(process.env.MONTHLY_BUDGET_USD_BURST || '0');
  if (!burst) return 0;
  const until = process.env.MONTHLY_BUDGET_BURST_UNTIL;
  if (until && Date.now() > Date.parse(until)) return 0;
  return burst;
}

function getEffectiveMonthlyBudget() {
  return getMonthlyBudget() + getBurstBudget();
}

// ── Recruiter pipeline density (Phase 6, calibration 2026-05-16) ──────────
// Mitchell's <3-month runway means pipeline density matters as much as per-role
// fit. This function computes pipeline-health metrics from the outreach
// tracker. Surfaced via /api/recruiter-pipeline-density for the dashboard
// widget and rolled into the heartbeat email's runway alert section.
const RUNWAY_WEEKS_DEFAULT = parseInt(process.env.RUNWAY_WEEKS || '12');
const PIPELINE_HEALTH_THRESHOLDS = {
  active_healthy:   5,   // 5+ active conversations = healthy
  active_stretched: 3,   // 3-4 active = stretched
  touches_healthy:  10,  // 10+ touches/week = healthy
  touches_stretched: 5,  // 5-9 touches/week = stretched
  response_rate_healthy: 0.30,
};

// Classifies a free-text discard reason into a coarse tag for grouping.
// Lightweight keyword match; refine over time as patterns emerge.
function classifyDiscardReason(reason) {
  const r = String(reason || '').toLowerCase();
  if (/(comp|salary|pay|equity|tc|total comp|base)/.test(r)) return 'comp';
  if (/(location|relocat|remote|on-site|hybrid|commute|city|metro)/.test(r))   return 'geography';
  if (/(culture|toxic|leadership|reorg|layoff|freez|burnout|attrition)/.test(r)) return 'culture';
  if (/(stack|tech|python|ml|skill|requirement|qualification|background)/.test(r)) return 'skill-gap';
  if (/(defense|weapons|surveillance|military|policing|gambling|tobacco|fossil)/.test(r)) return 'ethics';
  if (/(stage|series|funding|valuation|pre-ipo|public|growth)/.test(r))         return 'stage';
  if (/(velocity|slow|process|cycle|hiring freeze|silent|ghost)/.test(r))      return 'velocity';
  if (/(role|title|scope|level|seniority|ic|manager|ladder)/.test(r))          return 'role-shape';
  if (/(brand|mission|fit|interest|inspire|bored|excite)/.test(r))             return 'fit';
  return 'other';
}

function computeRecruiterPipelineDensity() {
  let contacts = [];
  try { contacts = listOutreachContacts(); } catch (e) {
    return { ok: false, error: `outreach tracker unavailable: ${e.message}` };
  }
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 86400000;
  const thirtyDaysAgo = now - 30 * 86400000;

  let active = 0, responded = 0, dead = 0, total = contacts.length;
  let activeByTier = { A: 0, B: 0, C: 0, unspecified: 0 };
  let activeByType = { recruiter: 0, hm: 0, sourcer: 0, peer: 0, exec: 0, founder: 0 };
  let touches7d = 0, touches30d = 0;
  let lastTouchTs = 0;

  for (const c of contacts) {
    if (c.status === 'dead') { dead++; continue; }
    if (c.status === 'awaiting_reply' || c.status === 'warm' || c.status === 'responded') {
      active++;
      const tier = (c.tier || 'unspecified').toUpperCase();
      if (tier === 'A' || tier === 'B' || tier === 'C') activeByTier[tier]++;
      else activeByTier.unspecified++;
      const ct = c.contact_type || 'recruiter';
      if (activeByType[ct] !== undefined) activeByType[ct]++;
    }
    if (c.status === 'responded') responded++;

    // Count touches in time windows
    const touches = Array.isArray(c.touches) ? c.touches : [];
    for (const t of touches) {
      const ts = Date.parse(t.ts);
      if (!isFinite(ts)) continue;
      if (ts >= sevenDaysAgo) touches7d++;
      if (ts >= thirtyDaysAgo) touches30d++;
      if (ts > lastTouchTs) lastTouchTs = ts;
    }
  }

  const responseRate = total > 0 ? Math.round((responded / total) * 100) / 100 : 0;

  // Health verdict
  let health, reasons = [];
  if (active >= PIPELINE_HEALTH_THRESHOLDS.active_healthy &&
      touches7d >= PIPELINE_HEALTH_THRESHOLDS.touches_healthy) {
    health = 'healthy';
    reasons.push(`${active} active conversations + ${touches7d} touches this week`);
  } else if (active >= PIPELINE_HEALTH_THRESHOLDS.active_stretched ||
             touches7d >= PIPELINE_HEALTH_THRESHOLDS.touches_stretched) {
    health = 'stretched';
    if (active < PIPELINE_HEALTH_THRESHOLDS.active_healthy) reasons.push(`only ${active} active conversations (target: ${PIPELINE_HEALTH_THRESHOLDS.active_healthy}+)`);
    if (touches7d < PIPELINE_HEALTH_THRESHOLDS.touches_healthy) reasons.push(`only ${touches7d} touches this week (target: ${PIPELINE_HEALTH_THRESHOLDS.touches_healthy}+)`);
  } else {
    health = 'critical';
    reasons.push(`${active} active conversations + ${touches7d} touches this week — both below stretched thresholds`);
  }

  // Runway alert: given Mitchell's runway, project whether pipeline can land an offer in time
  const runwayWeeks = RUNWAY_WEEKS_DEFAULT;
  const daysSinceLastTouch = lastTouchTs ? Math.round((now - lastTouchTs) / 86400000) : null;
  const runwayAlert = (health === 'critical')
    ? `🚨 Pipeline below threshold for ${runwayWeeks}-week runway. Increase outreach velocity to ${PIPELINE_HEALTH_THRESHOLDS.touches_healthy}+ touches/week immediately.`
    : (health === 'stretched')
      ? `⚠️  Pipeline stretched for ${runwayWeeks}-week runway. Add ${Math.max(0, PIPELINE_HEALTH_THRESHOLDS.active_healthy - active)} more active conversations and ${Math.max(0, PIPELINE_HEALTH_THRESHOLDS.touches_healthy - touches7d)} more touches this week.`
      : `✅ Pipeline density adequate for ${runwayWeeks}-week runway.`;

  return {
    ok: true,
    runway_weeks: runwayWeeks,
    health,
    health_reasons: reasons,
    runway_alert: runwayAlert,
    contacts: {
      total,
      active,
      responded,
      dead,
      response_rate: responseRate,
      active_by_tier: activeByTier,
      active_by_type: activeByType,
    },
    velocity: {
      touches_last_7d:  touches7d,
      touches_last_30d: touches30d,
      days_since_last_touch: daysSinceLastTouch,
    },
    thresholds: PIPELINE_HEALTH_THRESHOLDS,
    computed_at: new Date().toISOString(),
  };
}

// ── Runway detail (calibration 2026-05-17, click-through on runway widget) ─
// Click-through detail payload for the sidebar runway widget. Composes:
//   - active_conversations: contacts with status != dead, sorted by recency
//   - recent_touches_7d:    all touches in the last 7 days (most recent first)
//   - response_rate_trend:  this-7d vs last-30d outbound→response ratio
//   - who_to_contact_next:  ranked recommendations (tier-A unresponded >
//                           tier-B unresponded > tier-A with prior response > …),
//                           capped at 5 items
// Returned by GET /api/runway-detail and consumed by openRunwayDetailModal().
function computeRunwayDetail() {
  let contacts = [];
  try { contacts = listOutreachContacts(); } catch (e) {
    return { ok: false, error: `outreach tracker unavailable: ${e.message}` };
  }
  // Pull the high-level density verdict as the runway header summary.
  const density = computeRecruiterPipelineDensity();
  const now = Date.now();
  const sevenDaysAgo  = now - 7  * 86400000;
  const thirtyDaysAgo = now - 30 * 86400000;
  const lastSevenDaysAgo = now - 14 * 86400000; // for outbound-vs-response delta

  // ── Active conversations (everything not dead, sorted by recency) ──
  const activeConversations = contacts
    .filter(c => c.status !== 'dead')
    .map(c => {
      const touches = Array.isArray(c.touches) ? c.touches : [];
      const last = touches.length ? touches[touches.length - 1] : null;
      const lastTs = last ? Date.parse(last.ts) : 0;
      const days = lastTs ? Math.round((now - lastTs) / 86400000) : null;
      return {
        contact_id: c.contact_id,
        name: c.name || '',
        company: c.company || '',
        role_title: c.title_at_send || '',
        tier: c.tier || 'B',
        contact_type: c.contact_type || '',
        channel: last ? last.channel : '',
        status: c.status,
        last_touch_iso: last ? last.ts : null,
        days_since: days,
        next_action: c.next_action || null,
      };
    })
    .sort((a, b) => {
      // Most recent touch first; nulls last.
      const ta = a.last_touch_iso ? Date.parse(a.last_touch_iso) : 0;
      const tb = b.last_touch_iso ? Date.parse(b.last_touch_iso) : 0;
      return tb - ta;
    });

  // ── Recent touches (last 7d) — flat list across contacts ──
  const recentTouches = [];
  for (const c of contacts) {
    const touches = Array.isArray(c.touches) ? c.touches : [];
    for (const t of touches) {
      const ts = Date.parse(t.ts);
      if (!isFinite(ts) || ts < sevenDaysAgo) continue;
      recentTouches.push({
        ts_iso: t.ts,
        channel: t.channel || '',
        contact_name: c.name || '',
        company: c.company || '',
        outbound: t.outbound !== false,
        summary: (t.summary || '').slice(0, 240),
      });
    }
  }
  recentTouches.sort((a, b) => Date.parse(b.ts_iso) - Date.parse(a.ts_iso));

  // ── Response rate trend (this 7d vs last 30d) ──
  let out7  = 0, res7  = 0;
  let out30 = 0, res30 = 0;
  for (const c of contacts) {
    const touches = Array.isArray(c.touches) ? c.touches : [];
    for (const t of touches) {
      const ts = Date.parse(t.ts);
      if (!isFinite(ts)) continue;
      const outbound = t.outbound !== false;
      if (ts >= sevenDaysAgo) {
        if (outbound) out7++;
        else res7++;
      }
      if (ts >= thirtyDaysAgo) {
        if (outbound) out30++;
        else res30++;
      }
    }
  }
  const rate7  = out7  > 0 ? +(res7  / out7).toFixed(2)  : 0;
  const rate30 = out30 > 0 ? +(res30 / out30).toFixed(2) : 0;
  const delta = rate7 > rate30 ? 'up' : rate7 < rate30 ? 'down' : 'flat';

  // ── Who to contact next — tier × silence × prior-engagement ranking ──
  // Rank rule per task spec:
  //   tier-A unresponded > tier-B unresponded > tier-A with prior response >
  //   tier-B with prior response > tier-C unresponded > tier-C responded
  // Within tier+status group: oldest-silent first (longest gap = most urgent).
  // Snoozed contacts excluded. Cap at 5.
  function tierWeight(t) {
    if (t === 'A') return 3;
    if (t === 'B') return 2;
    return 1; // C / unspecified
  }
  function statusBucket(c) {
    // unresponded = awaiting_reply or warm (we wrote and they haven't)
    // responded   = already replied; lower urgency to re-engage
    if (c.status === 'responded') return 0;
    if (c.status === 'awaiting_reply' || c.status === 'warm') return 1;
    return -1; // dead etc.
  }
  function isSnoozed(c) {
    if (!c.snoozed_until) return false;
    const t = Date.parse(c.snoozed_until);
    return isFinite(t) && t > now;
  }
  const candidates = contacts
    .filter(c => c.status !== 'dead')
    .filter(c => !isSnoozed(c))
    .map(c => {
      const touches = Array.isArray(c.touches) ? c.touches : [];
      const last = touches.length ? touches[touches.length - 1] : null;
      const lastTs = last ? Date.parse(last.ts) : 0;
      const daysSilent = lastTs ? Math.round((now - lastTs) / 86400000) : 999;
      const tw = tierWeight((c.tier || 'B').toUpperCase());
      const sb = statusBucket(c);
      return { c, daysSilent, tw, sb };
    })
    .filter(x => x.sb >= 0);

  candidates.sort((a, b) => {
    // Unresponded tier-A first (sb=1 + tw=3), then unresponded tier-B (sb=1 + tw=2),
    // then responded tier-A (sb=0 + tw=3) — combined ordering key
    // We rank by (sb*10 + tw) descending, then days silent descending.
    const ka = a.sb * 10 + a.tw;
    const kb = b.sb * 10 + b.tw;
    if (kb !== ka) return kb - ka;
    return b.daysSilent - a.daysSilent;
  });

  const whoNext = candidates.slice(0, 5).map(({ c, daysSilent }) => {
    let rationale;
    const tier = (c.tier || 'B').toUpperCase();
    if (c.status === 'awaiting_reply' || c.status === 'warm') {
      rationale = `Tier-${tier} ${c.contact_type || 'contact'} · ${daysSilent}d silent · awaiting reply`;
    } else if (c.status === 'responded') {
      rationale = `Tier-${tier} responded · ${daysSilent}d since last touch · keep warm`;
    } else {
      rationale = `Tier-${tier} ${c.contact_type || 'contact'} · ${daysSilent}d silent`;
    }
    // Suggest channel: existing next_action channel if present, else best guess
    let suggestedChannel = c.next_action?.draft_template_id?.startsWith('email_') ? 'email'
      : (c.intel?.email_guess?.confidence === 'high' ? 'email' : 'linkedin_dm');
    return {
      contact_id: c.contact_id,
      name: c.name || '',
      company: c.company || '',
      role_title: c.title_at_send || '',
      tier,
      rationale,
      suggested_channel: suggestedChannel,
      next_action: c.next_action || null,
      days_since: daysSilent,
    };
  });

  return {
    ok: true,
    runway_weeks: density.runway_weeks ?? RUNWAY_WEEKS_DEFAULT,
    health: density.health || 'unknown',
    health_reason: Array.isArray(density.health_reasons)
      ? density.health_reasons.join(' · ')
      : (density.runway_alert || ''),
    active_conversations:    activeConversations,
    recent_touches_7d:       recentTouches,
    response_rate_trend: {
      this_7d:  { outbound: out7,  responses: res7,  rate: rate7  },
      last_30d: { outbound: out30, responses: res30, rate: rate30 },
      delta,
    },
    who_to_contact_next: whoNext,
    generated_at: new Date().toISOString(),
  };
}

function getRolling30dSpend() {
  const fp = join(ROOT, 'data/cost-log.tsv');
  if (!existsSync(fp)) return 0;
  const cutoff = Date.now() - 30 * 86400000;
  let total = 0;
  const lines = readFileSync(fp, 'utf-8').split('\n').filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('date\t')) continue;
    const cols = line.split('\t');
    // Two formats observed: long TSV (date, batch_id, requests, ... cost_usd, model) AND
    // short append (date, iso_ts, cost_usd, label). Detect by column count.
    let dateStr, cost;
    if (cols.length >= 9) {
      dateStr = cols[0]; cost = parseFloat(cols[7]);
    } else if (cols.length >= 4) {
      dateStr = cols[0]; cost = parseFloat(cols[2]);
    } else continue;
    if (!isFinite(cost)) continue;
    const t = Date.parse(dateStr);
    if (isNaN(t) || t < cutoff) continue;
    total += cost;
  }
  return total;
}

function buildPipelinePreview() {
  const pending = countPipelinePending();
  const queued  = countTriageAdvanceQueued();
  const monthlyBudget   = getMonthlyBudget();
  const burstBudget     = getBurstBudget();
  const effectiveBudget = monthlyBudget + burstBudget;
  const spent30d        = getRolling30dSpend();
  const headroom        = Math.max(0, effectiveBudget - spent30d);

  // ── Legacy estimate (Haiku triage + Sonnet batch eval) ──
  // Still accurate for the currently-deployed pipeline. Tier 5 enrichment
  // economics layer in once Phases 2-3 ship — see process_all.tier5_estimate.
  const triageCost     = pending * COST_PER_TRIAGE_HAIKU;
  const batchEvalCount = queued + Math.round(pending * ADVANCE_RATE_ESTIMATE);
  const batchCost      = batchEvalCount * COST_PER_BATCH_EVAL;
  const processAllCost = triageCost + batchCost;
  const runBatchCost   = queued * COST_PER_BATCH_EVAL;

  // ── Tier 5 estimate (post-Phase-3) ──
  // For Process All: every advanced item gets JD-enriched triage, ~60% of
  // items dedupe to unique companies (each company gets council intel with
  // 50% cache hit rate), top-20% high-confidence items get apply-pack pre-gen.
  const tier5UniqueCompaniesEstimate = Math.max(1, Math.round(batchEvalCount * 0.60));
  const tier5CompaniesCouncilCost    = tier5UniqueCompaniesEstimate * COST_PER_COMPANY_COUNCIL * (1 - COMPANY_CACHE_HIT_RATE);
  const tier5TriageEnrichedCost      = batchEvalCount * COST_PER_TRIAGE_SONNET_JD;
  const tier5ApplyPackCost           = Math.round(batchEvalCount * HIGH_CONFIDENCE_PREGEN_RATE) * COST_PER_APPLY_PACK_PREGEN;
  const tier5ProcessAllCost          = tier5TriageEnrichedCost + tier5CompaniesCouncilCost + tier5ApplyPackCost;

  const tier5RunBatchUniqueCompanies = Math.max(1, Math.round(queued * 0.60));
  const tier5RunBatchCost = (queued * COST_PER_TRIAGE_SONNET_JD)
                          + (tier5RunBatchUniqueCompanies * COST_PER_COMPANY_COUNCIL * (1 - COMPANY_CACHE_HIT_RATE))
                          + (Math.round(queued * HIGH_CONFIDENCE_PREGEN_RATE) * COST_PER_APPLY_PACK_PREGEN);

  return {
    pending_pipeline:    pending,
    queued_for_batch:    queued,
    monthly_budget_usd:  monthlyBudget,
    burst_budget_usd:    burstBudget,
    effective_budget_usd: effectiveBudget,
    spent_30d_usd:       Math.round(spent30d * 100) / 100,
    headroom_usd:        Math.round(headroom * 100) / 100,
    per_run_caps: {
      run_batch_usd:    PER_RUN_CAP_RUN_BATCH,
      process_all_usd:  PER_RUN_CAP_PROCESS_ALL,
      overnight_usd:    DAILY_CAP_OVERNIGHT,
    },
    process_all: {
      triage_count:       pending,
      triage_cost_usd:    Math.round(triageCost * 1000) / 1000,
      batch_eval_count:   batchEvalCount,
      batch_eval_cost_usd:Math.round(batchCost * 100) / 100,
      total_cost_usd:     Math.round(processAllCost * 100) / 100,
      assumed_advance_rate: ADVANCE_RATE_ESTIMATE,
      exceeds_budget:     (spent30d + processAllCost) > effectiveBudget,
      exceeds_per_run_cap: processAllCost > PER_RUN_CAP_PROCESS_ALL,
      recommended_cap_usd: Math.ceil((spent30d + processAllCost) * 1.1),
      tier5_estimate: {
        unique_companies:        tier5UniqueCompaniesEstimate,
        triage_enriched_cost_usd: Math.round(tier5TriageEnrichedCost * 100) / 100,
        company_council_cost_usd: Math.round(tier5CompaniesCouncilCost * 100) / 100,
        apply_pack_pregen_cost_usd: Math.round(tier5ApplyPackCost * 100) / 100,
        total_cost_usd:           Math.round(tier5ProcessAllCost * 100) / 100,
        assumed_cache_hit_rate:   COMPANY_CACHE_HIT_RATE,
        exceeds_per_run_cap:      tier5ProcessAllCost > PER_RUN_CAP_PROCESS_ALL,
      },
    },
    run_batch: {
      eval_count:         queued,
      total_cost_usd:     Math.round(runBatchCost * 100) / 100,
      exceeds_budget:     (spent30d + runBatchCost) > effectiveBudget,
      exceeds_per_run_cap: runBatchCost > PER_RUN_CAP_RUN_BATCH,
      tier5_estimate: {
        unique_companies:   tier5RunBatchUniqueCompanies,
        total_cost_usd:     Math.round(tier5RunBatchCost * 100) / 100,
        exceeds_per_run_cap: tier5RunBatchCost > PER_RUN_CAP_RUN_BATCH,
      },
    },
    per_item_rates: {
      triage_haiku:        COST_PER_TRIAGE_HAIKU,
      triage_sonnet_jd:    COST_PER_TRIAGE_SONNET_JD,
      batch_sonnet:        COST_PER_BATCH_EVAL,
      company_council:     COST_PER_COMPANY_COUNCIL,
      apply_pack_pregen:   COST_PER_APPLY_PACK_PREGEN,
      source:              'data/cost-log.tsv observed average + calibration brief 2026-05-16',
    },
  };
}

function loadPipelineProcessState() {
  const fp = join(ROOT, 'data/pipeline-process-state.json');
  if (!existsSync(fp)) return { jobs: {} };
  try { return JSON.parse(readFileSync(fp, 'utf-8')); }
  catch { return { jobs: {} }; }
}

// ── Per-company preview for the Process All 2-phase modal ─────────
// Surfaces the per-company table the user inspects BEFORE confirming
// the orchestrator run. Each row carries enough signal for triage:
// score, TTO weeks, toxicity verdict, cache-hit, cost estimate.
// Reads:
//   - data/apply-now-queue.json (canonical Apply-Now ranking)
//   - data/company-intel-cache/{slug}/intel-*.json (cache-hit detection)
//   - data/excluded-companies.json (auto-trash list)
// Uses estimateTTO()/scoreToxicity() libs for the per-row metrics.
// Cost estimate per company uses the same Tier 5 economics as
// buildPipelinePreview() so the per-row totals reconcile.
function _slugifyCompanyForIntel(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function loadExcludedCompanySlugs() {
  try {
    const fp = join(ROOT, 'data/excluded-companies.json');
    if (!existsSync(fp)) return new Set();
    const data = JSON.parse(readFileSync(fp, 'utf-8'));
    const slugs = new Set();
    for (const cat of Object.values(data?.categories || {})) {
      for (const c of (cat.companies || [])) slugs.add(_slugifyCompanyForIntel(c));
      for (const [primary, aliases] of Object.entries(cat.aliases || {})) {
        slugs.add(_slugifyCompanyForIntel(primary));
        for (const a of (aliases || [])) slugs.add(_slugifyCompanyForIntel(a));
      }
    }
    return slugs;
  } catch {
    return new Set();
  }
}

function loadApplyNowQueueRanked() {
  try {
    const fp = join(ROOT, 'data/apply-now-queue.json');
    if (!existsSync(fp)) return [];
    const data = JSON.parse(readFileSync(fp, 'utf-8'));
    return Array.isArray(data?.ranked) ? data.ranked : [];
  } catch {
    return [];
  }
}

function loadCompanyIntelCacheState(slug) {
  // Cache is considered a "hit" if a non-empty intel-YYYY-MM-DD.json
  // file exists in data/company-intel-cache/{slug}/ within the 30d TTL
  // window the orchestrator uses (matches scripts/process-all-council-intel.mjs).
  const TTL_MS = 30 * 24 * 60 * 60 * 1000;
  try {
    const dir = join(ROOT, 'data/company-intel-cache', slug);
    if (!existsSync(dir)) return { hit: false, last_intel_date: null, age_days: null };
    const files = readdirSync(dir).filter(f => /^intel-\d{4}-\d{2}-\d{2}\.json$/.test(f));
    if (!files.length) return { hit: false, last_intel_date: null, age_days: null };
    files.sort();
    const latest = files[files.length - 1];
    const m = latest.match(/intel-(\d{4}-\d{2}-\d{2})\.json$/);
    const date = m ? m[1] : null;
    const age = date ? Math.floor((Date.now() - Date.parse(date + 'T00:00:00Z')) / 86_400_000) : null;
    const fresh = age != null && age * 86_400_000 < TTL_MS;
    return { hit: fresh, last_intel_date: date, age_days: age };
  } catch {
    return { hit: false, last_intel_date: null, age_days: null };
  }
}

function buildPerCompanyPipelinePreview() {
  // Group the Apply-Now queue by unique company → one row per company.
  // High-water score wins for the per-row badge so the most attractive
  // role per company is what the user sees.
  const ranked = loadApplyNowQueueRanked();
  const excluded = loadExcludedCompanySlugs();
  const byCompany = new Map();
  for (const r of ranked) {
    if (!r?.company) continue;
    const slug = _slugifyCompanyForIntel(r.company);
    if (!slug) continue;
    const prior = byCompany.get(slug);
    const score = (typeof r.eval_score === 'number') ? r.eval_score : null;
    if (!prior) {
      byCompany.set(slug, {
        slug,
        company: r.company,
        top_role: r.role || null,
        top_role_num: r.num || null,
        top_role_score: score,
        role_count: 1,
      });
    } else {
      prior.role_count += 1;
      if (score != null && (prior.top_role_score == null || score > prior.top_role_score)) {
        prior.top_role = r.role || prior.top_role;
        prior.top_role_num = r.num || prior.top_role_num;
        prior.top_role_score = score;
      }
    }
  }

  // Per-row enrichment: TTO + toxicity + cache state + cost estimate.
  // Each Tier-5 unique-company cost = council intel × (1 - cache_hit) +
  // (highscore-pack pre-gen if score ≥ 4.5).
  //
  // Bug fix 2026-05-17: toxicity was previously sourced from scoreToxicity(name)
  // which reads data/toxicity-signals/{slug}.json (almost always empty in
  // steady state). Real toxicity verdicts live in the cached intel files at
  // data/company-intel-cache/{slug}/intel-{date}.json under .toxicity_score
  // (populated by scripts/process-all-council-intel.mjs). New strategy: read
  // from cache first, fall back to scoreToxicity() only if no cache.
  const rows = [];
  for (const meta of byCompany.values()) {
    const ttoRaw = (() => { try { return estimateTTO(meta.company); } catch { return null; } })();
    const cache  = loadCompanyIntelCacheState(meta.slug);
    let tox = null;
    if (cache.hit && cache.last_intel_date) {
      try {
        const intelFp = join(ROOT, 'data/company-intel-cache', meta.slug, `intel-${cache.last_intel_date}.json`);
        if (existsSync(intelFp)) {
          const cached = JSON.parse(readFileSync(intelFp, 'utf-8'));
          tox = cached?.toxicity_score || null;
        }
      } catch { /* fall through to empty-signals score */ }
    }
    if (!tox) {
      tox = (() => { try { return scoreToxicity(meta.company); } catch { return null; } })();
    }
    const isExcluded = excluded.has(meta.slug);

    // Cost: zero if excluded (orchestrator auto-trashes), else council cost
    // (skipped on cache hit) + optional apply-pack pre-gen for high-score rows.
    let cost = 0;
    if (!isExcluded) {
      if (!cache.hit) cost += COST_PER_COMPANY_COUNCIL;
      if (meta.top_role_score != null && meta.top_role_score >= 4.5) cost += COST_PER_APPLY_PACK_PREGEN;
    }

    rows.push({
      slug:             meta.slug,
      company:          meta.company,
      top_role:         meta.top_role,
      top_role_num:     meta.top_role_num,
      top_role_score:   meta.top_role_score,
      role_count:       meta.role_count,
      tto_weeks:        ttoRaw?.weeks_estimate ?? null,
      tto_tier:         ttoRaw?.velocity_tier  ?? null,
      tto_confidence:   ttoRaw?.confidence     ?? null,
      toxicity_verdict: tox?.verdict           ?? null,
      toxicity_score:   tox?.score             ?? null,
      toxicity_emoji:   tox?.verdict_emoji     ?? null,
      cache_hit:        cache.hit,
      last_intel_date:  cache.last_intel_date,
      cache_age_days:   cache.age_days,
      excluded:         isExcluded,
      cost_estimate_usd: Math.round(cost * 100) / 100,
    });
  }

  // Sort: actionable rows first (highest score), excluded sink to bottom.
  rows.sort((a, b) => {
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
    const aS = a.top_role_score ?? -1;
    const bS = b.top_role_score ?? -1;
    if (aS !== bS) return bS - aS;
    return (a.company || '').localeCompare(b.company || '');
  });

  const totalCost = rows.reduce((s, r) => s + (r.cost_estimate_usd || 0), 0);
  return {
    companies:           rows,
    total_companies:     rows.length,
    actionable_count:    rows.filter(r => !r.excluded).length,
    excluded_count:      rows.filter(r =>  r.excluded).length,
    cache_hit_count:     rows.filter(r => r.cache_hit && !r.excluded).length,
    total_cost_estimate_usd: Math.round(totalCost * 100) / 100,
    source:              'data/apply-now-queue.json + data/company-intel-cache/ + estimateTTO + scoreToxicity',
    schema_note:         'Per-company Tier-5 economics — council cost suppressed on cache hit; apply-pack pre-gen added for score≥4.5.',
  };
}

function spawnProcessAll({ sendEmail, force, companies }) {
  // Cap enforcement (calibration 2026-05-16): refuse to spawn if per-run cap
  // or monthly budget exceeded. `force: true` overrides — for the user-explicit
  // "I know what I'm doing, fire it anyway" path.
  if (!force) {
    const preview = buildPipelinePreview();
    if (preview.process_all.exceeds_per_run_cap) {
      return {
        ok: false,
        error: `Process All estimate $${preview.process_all.total_cost_usd} exceeds per-run cap $${PER_RUN_CAP_PROCESS_ALL}. Pass force:true to override, or raise PER_RUN_CAP_PROCESS_ALL_USD env.`,
        cap_exceeded: 'per_run',
        estimated_cost_usd: preview.process_all.total_cost_usd,
        cap_usd: PER_RUN_CAP_PROCESS_ALL,
      };
    }
    if (preview.process_all.exceeds_budget) {
      return {
        ok: false,
        error: `Process All would push 30d spend ($${preview.spent_30d_usd} + $${preview.process_all.total_cost_usd}) past effective monthly budget $${preview.effective_budget_usd}. Activate burst mode (MONTHLY_BUDGET_USD_BURST + MONTHLY_BUDGET_BURST_UNTIL) or pass force:true.`,
        cap_exceeded: 'monthly',
        estimated_cost_usd: preview.process_all.total_cost_usd,
        spent_30d_usd: preview.spent_30d_usd,
        effective_budget_usd: preview.effective_budget_usd,
      };
    }
  }

  // Generate the job ID server-side so we can return it immediately to the UI
  const jobId = 'proc-' + Date.now().toString(36) + '-' + randomBytes(3).toString('hex');
  const logPath = `/tmp/process-all-${jobId}.log`;
  const args = [join(ROOT, 'scripts/process-all-pipeline.mjs'), `--job-id=${jobId}`];
  if (sendEmail) args.push('--send-email');
  if (force) args.push('--cap-override');
  // Optional company subset (Task 2 — 2-phase modal). Pass through to the
  // orchestrator as a comma-separated list. Sanitized: only letters / digits /
  // hyphen / underscore / comma / space allowed so a malicious payload can't
  // inject extra args. Defense-in-depth — the orchestrator also slugifies.
  if (Array.isArray(companies) && companies.length) {
    const safe = companies
      .map(c => String(c || '').trim())
      .filter(c => c && /^[A-Za-z0-9 _.\-]+$/.test(c))
      .slice(0, 200); // hard cap so a runaway client can't blow the arg list
    if (safe.length) args.push(`--companies=${safe.join(',')}`);
  }
  try {
    // Lazy import to avoid pulling child_process when no one calls this endpoint
    import('child_process').then(({ spawn }) => {
      const proc = spawn('node', args, {
        cwd: ROOT,
        env: process.env,
        stdio: ['ignore', 'ignore', 'ignore'],
        detached: true,
      });
      proc.unref();
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
  // Initialize the state row optimistically — the orchestrator will overwrite
  const state = loadPipelineProcessState();
  state.jobs[jobId] = {
    jobId,
    type:        'process-all',
    status:      'queued',
    started_at:  new Date().toISOString(),
    send_email:  sendEmail,
    log_path:    logPath,
  };
  try {
    if (!existsSync(join(ROOT, 'data'))) mkdirSync(join(ROOT, 'data'), { recursive: true });
    writeFileSync(join(ROOT, 'data/pipeline-process-state.json'), JSON.stringify(state, null, 2));
  } catch {}
  return { ok: true, jobId, log_path: logPath, status_url: `/api/pipeline/job-status?job_id=${jobId}` };
}

function spawnBatchOnly({ sendEmail, force }) {
  // Cap enforcement (calibration 2026-05-16): refuse to spawn if per-run cap
  // ($25 default) or monthly budget exceeded. `force: true` overrides.
  if (!force) {
    const preview = buildPipelinePreview();
    if (preview.run_batch.exceeds_per_run_cap) {
      return {
        ok: false,
        error: `Run Batch estimate $${preview.run_batch.total_cost_usd} exceeds per-run cap $${PER_RUN_CAP_RUN_BATCH}. Pass force:true to override, or raise PER_RUN_CAP_RUN_BATCH_USD env.`,
        cap_exceeded: 'per_run',
        estimated_cost_usd: preview.run_batch.total_cost_usd,
        cap_usd: PER_RUN_CAP_RUN_BATCH,
      };
    }
    if (preview.run_batch.exceeds_budget) {
      return {
        ok: false,
        error: `Run Batch would push 30d spend ($${preview.spent_30d_usd} + $${preview.run_batch.total_cost_usd}) past effective monthly budget $${preview.effective_budget_usd}. Activate burst mode or pass force:true.`,
        cap_exceeded: 'monthly',
        estimated_cost_usd: preview.run_batch.total_cost_usd,
        spent_30d_usd: preview.spent_30d_usd,
        effective_budget_usd: preview.effective_budget_usd,
      };
    }
  }

  const jobId = 'batch-' + Date.now().toString(36) + '-' + randomBytes(3).toString('hex');
  const logPath = `/tmp/batch-only-${jobId}.log`;
  try {
    import('child_process').then(({ spawn }) => {
      // Run batch + rebuild + (optional) email in sequence via a shell pipe
      const cmd = [
        `node "${join(ROOT, 'batch-runner-batches.mjs')}" run`,
        `node "${join(ROOT, 'scripts/build-dashboard.mjs')}"`,
        sendEmail ? `node "${join(ROOT, 'scripts/heartbeat.mjs')}" --send` : 'echo "(email skipped)"',
      ].join(' && ');
      const proc = spawn('bash', ['-c', `(${cmd}) > "${logPath}" 2>&1`], {
        cwd: ROOT,
        env: process.env,
        stdio: ['ignore', 'ignore', 'ignore'],
        detached: true,
      });
      proc.unref();
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const state = loadPipelineProcessState();
  state.jobs[jobId] = {
    jobId,
    type:        'batch-only',
    status:      'queued',
    started_at:  new Date().toISOString(),
    send_email:  sendEmail,
    log_path:    logPath,
  };
  try {
    if (!existsSync(join(ROOT, 'data'))) mkdirSync(join(ROOT, 'data'), { recursive: true });
    writeFileSync(join(ROOT, 'data/pipeline-process-state.json'), JSON.stringify(state, null, 2));
  } catch {}
  return { ok: true, jobId, log_path: logPath, status_url: `/api/pipeline/job-status?job_id=${jobId}` };
}

function parseBatch() {
  const statePath = join(ROOT, 'batch/batch-state.tsv');
  const inputPath = join(ROOT, 'batch/batch-input.tsv');
  const batch = { completed: 0, failed: 0, total: 0, runs: 0, recent: [] };

  if (existsSync(statePath)) {
    const lines = readFileSync(statePath, 'utf8').split('\n')
      .filter(l => l.trim() && !l.startsWith('id'));
    const startedAts = [];
    for (const l of lines) {
      const [id, url, status, started, completed, report] = l.split('\t');
      if (status === 'completed') {
        batch.completed++;
        batch.recent.push({ id, url, report, completed });
      }
      if (status === 'failed') batch.failed++;
      if (started) startedAts.push(started);
    }
    batch.recent = batch.recent.slice(-10).reverse();
    // Count distinct runs via 15-min gap heuristic on started_at (matches detailBatches).
    const GAP_MS = 15 * 60 * 1000;
    startedAts.sort();
    let prev = 0;
    for (const s of startedAts) {
      const ts = new Date(s).getTime();
      if (!batch.runs || (ts - prev) > GAP_MS) batch.runs++;
      prev = ts;
    }
  }
  if (existsSync(inputPath)) {
    batch.total = readFileSync(inputPath, 'utf8').split('\n')
      .filter(l => l.trim() && !l.startsWith('id')).length;
  }
  return batch;
}

function parseScanHistory() {
  const path = join(ROOT, 'data/scan-history.tsv');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n')
    .filter(l => l.trim() && !l.startsWith('url'))
    .map(l => {
      const [url, first_seen, portal, title, company, status] = l.split('\t');
      return { url, first_seen, portal, title, company, status };
    });
}

// ── Summary stats (30s poll) ───────────────────────────────────

function computeStats() {
  const apps = parseApplications();
  const pipeline = parsePipeline();
  const batch = parseBatch();
  const scanned = parseScanHistory();

  const companies = new Set(apps.map(a => a.company));
  const applyNow = apps.filter(a =>
    a.score >= 4.0 && ['Evaluated','Applied','Interview','Offer'].includes(a.status)
  ).length;
  const applied = apps.filter(a => ['Applied','Interview','Offer'].includes(a.status)).length;

  return {
    applyNow,
    totalEvals: apps.length,
    applied,
    pipelinePending: pipeline.total,
    companies: companies.size,
    scanned: scanned.length,
    batch,
    lastUpdated: new Date().toISOString(),
  };
}

// ── Detail endpoints (on-demand) ───────────────────────────────

function detailApplyNow() {
  const apps = parseApplications();
  const rows = apps
    .filter(a => a.score >= 4.0 && ['Evaluated','Applied','Interview','Offer'].includes(a.status))
    .sort((a, b) => b.score - a.score)
    .slice(0, 200)
    .map(r => ({ ...r, reportSummary: r.report ? parseReportSummary(r.report) : {} }));
  return { title: 'Apply-Now Queue (≥ 4.0)', rows };
}

function detailEvaluations() {
  const apps = parseApplications();
  const buckets = { '4.5+': 0, '4.0–4.4': 0, '3.5–3.9': 0, '3.0–3.4': 0, '<3.0': 0 };
  for (const a of apps) {
    if (a.score >= 4.5) buckets['4.5+']++;
    else if (a.score >= 4.0) buckets['4.0–4.4']++;
    else if (a.score >= 3.5) buckets['3.5–3.9']++;
    else if (a.score >= 3.0) buckets['3.0–3.4']++;
    else buckets['<3.0']++;
  }
  const allSorted = [...apps].sort((a, b) => b.num - a.num).slice(0, 200)
    .map(r => ({ ...r, reportSummary: r.report ? parseReportSummary(r.report) : {} }));
  const recent = allSorted.slice(0, 20);
  const byStatus = {};
  for (const a of apps) byStatus[a.status] = (byStatus[a.status] || 0) + 1;
  return { title: 'All Evaluations', buckets, byStatus, recent, rows: allSorted, total: apps.length };
}

function detailApplied() {
  const apps = parseApplications();
  const today = new Date();
  const rows = apps
    .filter(a => ['Applied','Interview','Offer','Responded'].includes(a.status))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(r => {
      const appDate = new Date(r.date);
      const daysSince = isNaN(appDate) ? null : Math.floor((today - appDate) / 86400000);
      return { ...r, daysSince };
    });
  return { title: 'Applied / In Process', rows };
}

function detailPending() {
  const batch = parseBatch();
  const pct = batch.total > 0 ? Math.round((batch.completed / batch.total) * 100) : 0;

  // Load discard log so we can flag URLs already discarded/rejected
  const discardLog = loadDiscardLog();
  const discardedUrls = new Set(discardLog.map(e => e.url).filter(Boolean));

  const pipelinePath = join(ROOT, 'data/pipeline.md');
  const items = [];
  const today = new Date();
  if (existsSync(pipelinePath)) {
    const content = readFileSync(pipelinePath, 'utf8');
    const lines = content.split('\n');
    let currentTier = null;
    for (const l of lines) {
      if (/Tier\s*1/i.test(l)) { currentTier = 'T1'; continue; }
      if (/Tier\s*2/i.test(l)) { currentTier = 'T2'; continue; }
      if (/Tier\s*3/i.test(l)) { currentTier = 'T3'; continue; }
      if (!l.startsWith('- [ ]') || items.length >= 500) continue;
      const rest = l.replace(/^- \[ \]\s*/, '').trim();
      const parts = rest.split('|').map(p => p.trim());
      const url      = parts[0] || '';
      const company  = parts[1] || '';
      const role     = parts[2] || '';
      const dateStr  = parts[3] || '';
      const platform = detectPlatform(url);
      const dateAdded = dateStr || null;
      let daysInQueue = null;
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d)) daysInQueue = Math.max(0, Math.floor((today - d) / 86400000));
      }
      items.push({ platform, url, company, role, tier: currentTier, dateAdded, daysInQueue,
        alreadyDiscarded: discardedUrls.has(url) });
    }
  }

  // Group by platform
  const counts = {};
  for (const item of items) {
    counts[item.platform] = (counts[item.platform] || 0) + 1;
  }
  const PLATFORM_ORDER = ['LinkedIn', 'Greenhouse', 'Ashby', 'Lever', 'Workday', 'Amazon', 'iCIMS', 'Wellfound', 'HN / YC', 'Other'];
  const tiers = PLATFORM_ORDER
    .filter(p => counts[p])
    .map(p => ({ label: p, count: counts[p] }));

  return {
    title: 'Pipeline Pending',
    tiers,
    total: items.length,
    items,
    batch: { ...batch, pct },
  };
}

function detectPlatform(url) {
  if (!url) return 'Other';
  if (url.includes('linkedin.com'))         return 'LinkedIn';
  if (url.includes('ashbyhq.com'))          return 'Ashby';
  if (url.includes('greenhouse.io'))        return 'Greenhouse';
  if (url.includes('lever.co'))             return 'Lever';
  if (url.includes('myworkdayjobs.com'))    return 'Workday';
  if (url.includes('amazon.jobs') || url.includes('amazonjobs.com')) return 'Amazon';
  if (url.includes('icims.com'))            return 'iCIMS';
  if (url.includes('wellfound.com') || url.includes('angel.co')) return 'Wellfound';
  if (url.includes('ycombinator.com') || url.includes('news.ycombinator.com')) return 'HN / YC';
  return 'Other';
}

function detailCompanies() {
  // 1. Apps grouped by company
  const apps = parseApplications();
  const appByCompany = {};
  for (const a of apps) {
    if (!a.company) continue;
    if (!appByCompany[a.company]) appByCompany[a.company] = { evals: 0, applyNow: 0, totalScore: 0, bestScore: 0, bestRole: '', statuses: {} };
    const c = appByCompany[a.company];
    c.evals++;
    c.totalScore += a.score || 0;
    if ((a.score || 0) > c.bestScore) { c.bestScore = a.score || 0; c.bestRole = a.role || ''; }
    if ((a.score || 0) >= 4.0 && ['Evaluated','Applied','Interview','Offer','Responded'].includes(a.status)) c.applyNow++;
    c.statuses[a.status] = (c.statuses[a.status] || 0) + 1;
  }

  // 2. Scan history grouped by company (last_seen + roles count + first portal seen)
  const scans = parseScanHistory();
  const scanByCompany = {};
  for (const s of scans) {
    if (!s.company) continue;
    if (!scanByCompany[s.company]) scanByCompany[s.company] = { lastScanned: '', portal: '', count: 0 };
    const sc = scanByCompany[s.company];
    sc.count++;
    if ((s.first_seen || '') > sc.lastScanned) sc.lastScanned = s.first_seen || '';
    if (!sc.portal && s.portal) sc.portal = s.portal;
  }

  // 3. portals.yml — enabled tracked companies + portal type
  const portalByCompany = {};
  let trackedTotal = 0;
  try {
    const portalsPath = join(ROOT, 'portals.yml');
    if (existsSync(portalsPath)) {
      const cfg = yaml.load(readFileSync(portalsPath, 'utf8'));
      for (const tc of (cfg?.tracked_companies || [])) {
        if (tc.enabled === false) continue;
        trackedTotal++;
        const api = (tc.api || '') + ' ' + (tc.careers_url || '');
        let portal = '';
        if (api.includes('greenhouse')) portal = 'greenhouse';
        else if (api.includes('ashby')) portal = 'ashby';
        else if (api.includes('lever.co')) portal = 'lever';
        else if (api.includes('workday') || api.includes('myworkdayjobs')) portal = 'workday';
        else if (tc.careers_url) portal = 'web';
        if (tc.name) portalByCompany[tc.name] = portal;
      }
    }
  } catch (err) {
    console.error('[detailCompanies] portals.yml parse error:', err.message);
  }

  // 4. Merge: union of (portal companies, app companies, scan companies)
  const allNames = new Set([
    ...Object.keys(portalByCompany),
    ...Object.keys(appByCompany),
    ...Object.keys(scanByCompany),
  ]);

  const todayMs = Date.now();
  const rows = [];
  for (const name of allNames) {
    if (!name) continue;
    const a = appByCompany[name] || { evals: 0, applyNow: 0, totalScore: 0, bestScore: 0, bestRole: '' };
    const s = scanByCompany[name] || { lastScanned: '', portal: '', count: 0 };
    const portal = portalByCompany[name] || s.portal || '';
    const lastScanned = s.lastScanned || '';
    let daysSinceScan = null;
    if (lastScanned) {
      const ms = todayMs - new Date(lastScanned).getTime();
      if (!isNaN(ms)) daysSinceScan = Math.floor(ms / 86400000);
    }
    rows.push({
      company:       name,
      portal,
      evals:         a.evals,
      applyNow:      a.applyNow,
      lastScanned,
      daysSinceScan,
      rolesFound:    s.count,
      avgScore:      a.evals ? Math.round((a.totalScore / a.evals) * 10) / 10 : 0,
      bestScore:     a.bestScore,
      bestRole:      a.bestRole,
      tracked:       portalByCompany[name] !== undefined,
    });
  }
  rows.sort((x, y) =>
    (y.evals - x.evals) ||
    (y.applyNow - x.applyNow) ||
    (y.rolesFound - x.rolesFound) ||
    x.company.localeCompare(y.company)
  );

  // 5. Bucket counts
  const trackedNow = trackedTotal || rows.filter(r => r.tracked).length;
  const withEvals  = rows.filter(r => r.evals > 0).length;
  const inApplyNow = rows.filter(r => r.applyNow > 0).length;
  const inactive   = rows.filter(r => r.tracked && (r.daysSinceScan == null || r.daysSinceScan > 30)).length;

  return {
    title: 'Companies Tracked',
    buckets: {
      'Total tracked':    trackedNow,
      'With evals':       withEvals,
      'In Apply-Now':     inApplyNow,
      'Inactive (>30d)':  inactive,
    },
    rows,
    total: rows.length,
  };
}

// Group batch-state rows into runs using a gap heuristic on started_at.
// Two consecutive rows (sorted by started_at asc) belong to the same run when
// the gap between starts is ≤ BATCH_RUN_GAP_MIN minutes (default 15).
function detailBatches() {
  const statePath = join(ROOT, 'batch/batch-state.tsv');
  if (!existsSync(statePath)) return { title: 'Batch History', total: 0, batches: [] };

  // Score column in batch-state.tsv is unpopulated (`-`); reach into applications.md.
  const scoreByReportNum = {};
  for (const a of parseApplications()) {
    const n = parseInt(a.num, 10);
    if (!isNaN(n) && a.score) scoreByReportNum[String(n)] = a.score;
  }

  const GAP_MIN = parseInt(process.env.BATCH_RUN_GAP_MIN || '15', 10);
  const GAP_MS  = GAP_MIN * 60 * 1000;

  const rows = readFileSync(statePath, 'utf8').split('\n')
    .filter(l => l.trim() && !l.startsWith('id'))
    .map(l => {
      const [id, url, status, started_at, completed_at, report_num, score, error, retries] = l.split('\t');
      return { id: parseInt(id) || 0, url: url || '', status: status || '', started_at: started_at || '', completed_at: completed_at || '', report_num: report_num || '', error: error !== '-' ? error : null, retries: parseInt(retries) || 0 };
    })
    .filter(r => r.started_at);

  rows.sort((a, b) => a.started_at.localeCompare(b.started_at));

  const groups = [];
  let prevStartMs = 0;
  for (const r of rows) {
    const ts = new Date(r.started_at).getTime();
    if (!groups.length || (ts - prevStartMs) > GAP_MS) groups.push({ rows: [] });
    groups[groups.length - 1].rows.push(r);
    prevStartMs = ts;
  }

  const batches = groups.map(g => {
    const startedAts   = g.rows.map(r => r.started_at).filter(Boolean).sort();
    const completedAts = g.rows.map(r => r.completed_at).filter(Boolean).sort();
    const startedAt    = startedAts[0] || null;
    const completedAt  = completedAts[completedAts.length - 1] || null;
    const durationMs   = (startedAt && completedAt) ? (new Date(completedAt) - new Date(startedAt)) : null;
    const completed = g.rows.filter(r => r.status === 'completed').length;
    const failed    = g.rows.filter(r => r.status === 'failed').length;
    const running   = g.rows.filter(r => r.status === 'running').length;
    const pending   = g.rows.filter(r => !['completed','failed','running'].includes(r.status)).length;

    const scores = g.rows
      .filter(r => r.status === 'completed' && r.report_num && r.report_num !== '-')
      .map(r => scoreByReportNum[String(parseInt(r.report_num, 10))])
      .filter(s => typeof s === 'number' && !isNaN(s) && s > 0);
    const avgScore = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;

    return {
      batch_id: startedAt,
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: durationMs,
      total: g.rows.length,
      completed, failed, running, pending,
      avgScore,
      reports: g.rows
        .filter(r => r.status === 'completed' && r.report_num && r.report_num !== '-')
        .map(r => ({ id: r.id, report_num: r.report_num, url: r.url, score: scoreByReportNum[String(parseInt(r.report_num, 10))] || null })),
    };
  });

  batches.sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));
  return { title: 'Batch History', total: batches.length, batches: batches.slice(0, 10) };
}

function detailScanned() {
  const items = parseScanHistory();
  const total = items.length;
  const todayMs = Date.now();
  const dayMs = 86400000;

  // Bucket counts (24h / 7d / 30d / all-time)
  let last24h = 0, last7d = 0, last30d = 0;
  for (const i of items) {
    const t = new Date(i.first_seen || '').getTime();
    if (isNaN(t)) continue;
    const age = todayMs - t;
    if (age <= dayMs) last24h++;
    if (age <= 7 * dayMs) last7d++;
    if (age <= 30 * dayMs) last30d++;
  }

  // Daily counts for last 30 days (chronological asc, zero-fill missing dates)
  const byDate = {};
  for (const i of items) {
    const d = (i.first_seen || '').slice(0, 10);
    if (!d) continue;
    byDate[d] = (byDate[d] || 0) + 1;
  }
  const daily = [];
  const start = new Date(todayMs - 29 * dayMs);
  for (let i = 0; i < 30; i++) {
    const dt = new Date(start.getTime() + i * dayMs);
    const key = dt.toISOString().slice(0, 10);
    daily.push({ date: key, count: byDate[key] || 0 });
  }

  // Recent scan events: aggregate (date, company, portal) → new_roles_found
  const eventsMap = new Map();
  for (const i of items) {
    const date = (i.first_seen || '').slice(0, 10);
    if (!date) continue;
    const key = `${date}|${i.company || ''}|${i.portal || ''}`;
    if (!eventsMap.has(key)) {
      eventsMap.set(key, { timestamp: date, company: i.company || '', portal: i.portal || '', newRolesFound: 0, status: 'success' });
    }
    eventsMap.get(key).newRolesFound++;
  }
  const recent = [...eventsMap.values()]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || a.company.localeCompare(b.company))
    .slice(0, 200);

  // Per-portal breakdown still useful for dashboard tooltips
  const byPortal = {};
  for (const i of items) {
    byPortal[i.portal || 'unknown'] = (byPortal[i.portal || 'unknown'] || 0) + 1;
  }

  return {
    title: 'URLs Scanned',
    total,
    buckets: {
      'Last 24h': last24h,
      'Last 7d':  last7d,
      'Last 30d': last30d,
      'All time': total,
    },
    daily,
    recent,
    byPortal,
  };
}

function batchLive() {
  const statePath = join(ROOT, 'batch/batch-state.tsv');
  const inputPath = join(ROOT, 'batch/batch-input.tsv');
  const triagePath = join(ROOT, 'batch/triage-advance.tsv');

  const stateRows = [];
  let total = 0;

  if (existsSync(statePath)) {
    const lines = readFileSync(statePath, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('id'));
    for (const l of lines) {
      const [id, url, status, started_at, completed_at, report_num, score, error, retries] = l.split('\t');
      let company = 'Unknown';
      try {
        const h = new URL(url || '').hostname.replace(/^www\./, '');
        if ((url || '').includes('greenhouse.io')) company = 'Greenhouse';
        else if ((url || '').includes('ashbyhq.com')) company = 'Ashby';
        else if ((url || '').includes('lever.co')) company = 'Lever';
        else company = h.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      } catch (_) {}
      stateRows.push({ id: parseInt(id) || 0, url: url || '', status: status || 'pending', started_at, completed_at, report_num, score: score !== '-' ? score : null, error: error !== '-' ? error : null, retries: parseInt(retries) || 0, company });
    }
  }

  if (existsSync(inputPath)) {
    total = readFileSync(inputPath, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('id')).length;
  }

  const completed = stateRows.filter(r => r.status === 'completed').length;
  const failed = stateRows.filter(r => r.status === 'failed').length;
  const running = stateRows.filter(r => r.status === 'running').length;
  const pending = total - completed - failed - running;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Triage advance queue
  const triageItems = [];
  if (existsSync(triagePath)) {
    const lines = readFileSync(triagePath, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('url'));
    for (const l of lines) {
      const [url, tier, score, archetype, reason] = l.split('\t');
      triageItems.push({ url, tier, score, archetype, reason });
    }
  }

  // Sort: running first, then completed by time desc, then failed, then pending
  const sorted = [
    ...stateRows.filter(r => r.status === 'running').sort((a, b) => (b.started_at || '').localeCompare(a.started_at || '')),
    ...stateRows.filter(r => r.status === 'completed').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')),
    ...stateRows.filter(r => r.status === 'failed'),
    ...stateRows.filter(r => !['running','completed','failed'].includes(r.status)),
  ];

  return { total, completed, failed, running, pending, pct, rows: sorted.slice(0, 500), triageItems: triageItems.slice(0, 200) };
}

// ── Sidebar batch popout (2026-05-17) ──────────────────────────
// Builds the detailed status feed for the clickable #sidebar-batch box.
// Reuses batchLive() for the current run summary, detailBatches() for the
// recent-runs grouping (15-min gap heuristic), data/cost-log.tsv for per-batch
// cost rows, and data/errors.log for batch-related failures.
function buildBatchStatusDetailed() {
  const live = batchLive();

  // ── Recent runs: enrich detailBatches() output with per-run cost ──
  // detailBatches groups batch-state.tsv rows into runs by 15-min gap. We
  // map cost-log.tsv rows (long format: date, batch_id, requests, ...) to
  // the closest run by started_at proximity. Fallback to short-format
  // per-item sum when long rows are unavailable.
  const det = (() => { try { return detailBatches(); } catch (_) { return { batches: [] }; } })();

  const costRows = [];
  const fpCost = join(ROOT, 'data/cost-log.tsv');
  if (existsSync(fpCost)) {
    const lines = readFileSync(fpCost, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      if (line.startsWith('date\t')) continue;
      const cols = line.split('\t');
      let dateStr, ts, cost, label, model;
      if (cols.length >= 9) {
        dateStr = cols[0]; ts = cols[0]; cost = parseFloat(cols[7]); model = cols[8] || ''; label = `${cols[2] || '?'} items`;
      } else if (cols.length >= 4) {
        dateStr = cols[0]; ts = cols[1] || cols[0]; cost = parseFloat(cols[2]); model = ''; label = cols[3] || '';
      } else continue;
      if (!isFinite(cost)) continue;
      const t = Date.parse(ts);
      if (isNaN(t)) continue;
      costRows.push({ date: dateStr, ts, t, cost, model, label });
    }
  }
  const PROX_MS = 30 * 60 * 1000; // 30 min — generous to catch async cost-log writes

  const recent_runs = (det.batches || []).slice(0, 10).map(b => {
    const startMs = b.started_at ? Date.parse(b.started_at) : 0;
    let runCost = 0;
    if (startMs) {
      for (const r of costRows) {
        if (Math.abs(r.t - startMs) <= PROX_MS) runCost += r.cost;
      }
    }
    const durSec = (b.duration_ms && b.duration_ms > 0) ? Math.round(b.duration_ms / 1000) : null;
    const status = b.running > 0 ? 'running' : (b.failed > 0 && b.completed === 0 ? 'failed' : (b.failed > 0 ? 'partial' : 'completed'));
    return {
      batch_id:     b.batch_id,
      started_at:   b.started_at,
      completed_at: b.completed_at,
      duration_s:   durSec,
      cost_usd:     Math.round(runCost * 100) / 100,
      items_count:  b.total,
      completed:    b.completed,
      failed:       b.failed,
      running:      b.running,
      pending:      b.pending,
      avg_score:    b.avgScore,
      model:        (recent_runs_lookupModel(costRows, startMs)) || 'claude-sonnet-4-6',
      status,
    };
  });

  // ── Aggregate costs (today / rolling 30d) ──
  const now = Date.now();
  const dayMs = 86400000;
  let cost_today_usd = 0;
  let cost_30d_usd = 0;
  const todayStr = new Date().toISOString().slice(0, 10);
  for (const r of costRows) {
    if (r.t >= now - 30 * dayMs) cost_30d_usd += r.cost;
    if (r.date === todayStr) cost_today_usd += r.cost;
  }

  // ── Queue depth: triage-advance / pipeline-pending / batch-input ──
  const queue_depth = {
    triage_advance:    countTriageAdvanceQueued(),
    pipeline_pending:  countPipelinePending(),
    batch_input:       (() => {
      const fp = join(ROOT, 'batch/batch-input.tsv');
      if (!existsSync(fp)) return 0;
      return readFileSync(fp, 'utf-8').split('\n').filter(l => l.trim() && !l.startsWith('id')).length;
    })(),
  };

  // ── Recent batch-related failures from data/errors.log (last 5) ──
  // Filter: lines containing "WORKER FAIL" / "batch" / "BATCH" — these are
  // the failures that surface in the batch pipeline (worker subprocesses,
  // API failures, etc.). Skip anything that doesn't look batch-related.
  const most_recent_failures = [];
  const fpErrors = join(ROOT, 'data/errors.log');
  if (existsSync(fpErrors)) {
    const raw = readFileSync(fpErrors, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    // Walk from the end backwards
    for (let i = lines.length - 1; i >= 0 && most_recent_failures.length < 5; i--) {
      const ln = lines[i];
      if (!/(WORKER FAIL|batch|BATCH|Anthropic|Gemini|worker)/i.test(ln)) continue;
      // Format observed: [ISO_TS] WORKER FAIL id=N exit=N: <message>
      const m = ln.match(/^\[([^\]]+)\]\s+(.*)$/);
      if (m) {
        most_recent_failures.push({
          ts:    m[1],
          error: m[2].slice(0, 240),
        });
      } else {
        most_recent_failures.push({ ts: '', error: ln.slice(0, 240) });
      }
    }
  }

  // ── Running state: ETA estimate ──
  // ETA = running × average completed-run duration. Uses the median of the
  // last 5 runs (if available) for stability against outliers.
  let eta_seconds = null;
  if (live.running > 0) {
    const durs = recent_runs.filter(r => r.duration_s && r.completed > 0).map(r => Math.round(r.duration_s / Math.max(1, r.completed))).slice(0, 5).sort((a, b) => a - b);
    if (durs.length) {
      const median = durs[Math.floor(durs.length / 2)];
      eta_seconds = median * live.running;
    }
  }

  return {
    ok: true,
    current_summary: {
      completed: live.completed,
      failed:    live.failed,
      running:   live.running,
      pending:   Math.max(0, live.pending),
      percent:   live.pct,
      total:     live.total,
      eta_seconds,
      model:     'claude-sonnet-4-6',  // current batch-runner-batches.mjs default
      temperature: 0,
    },
    recent_runs,
    queue_depth,
    cost_today_usd: Math.round(cost_today_usd * 100) / 100,
    cost_30d_usd:   Math.round(cost_30d_usd * 100) / 100,
    most_recent_failures,
    generated_at: new Date().toISOString(),
  };
}

// Find the cost-log model column closest to a given start timestamp.
// Returns null when no proximal row carries a model field.
function recent_runs_lookupModel(costRows, startMs) {
  if (!startMs) return null;
  const PROX_MS = 30 * 60 * 1000;
  for (const r of costRows) {
    if (Math.abs(r.t - startMs) <= PROX_MS && r.model) return r.model;
  }
  return null;
}

// ── Claim verification helpers ─────────────────────────────────

function buildVerifyPayload(reportSlug) {
  const reportPath = join(ROOT, 'reports', reportSlug);
  if (!existsSync(reportPath)) return null;
  const text = readFileSync(reportPath, 'utf8');
  const lines = text.split('\n');

  const titleMatch  = text.match(/^#\s+Evaluation:\s+(.+)/m);
  const scoreMatch  = text.match(/\*\*Score:\*\*\s*([\d.]+)/);
  const archMatch   = text.match(/\*\*Archetype:\*\*\s*([^\n]+)/);
  const urlMatch    = text.match(/\*\*URL:\*\*\s*(https?:\/\/[^\s\n]+)/);

  // Split "Company — Role" from title
  let company = '', role = '';
  if (titleMatch) {
    const parts = titleMatch[1].split(/\s*[—–-]\s*/);
    company = parts[0]?.trim() || '';
    role    = parts.slice(1).join(' — ').trim() || '';
  }

  // Extract key claims from B (CV Match), C (Level/Strategy), D (Positioning/Edges)
  const extractSection = (headerRe, maxBullets = 5) => {
    const idx = lines.findIndex(l => headerRe.test(l));
    if (idx < 0) return [];
    const out = [];
    for (let i = idx + 1; i < lines.length && out.length < maxBullets; i++) {
      if (/^##/.test(lines[i])) break;
      const m = lines[i].match(/^[-*]\s+(.+)/);
      if (m) out.push(stripMarkdown(m[1]).slice(0, 160));
    }
    return out;
  };

  // Extract STAR-style bullets from Block C
  const extractStarStories = () => {
    const cIdx = lines.findIndex(l => /^##\s+C\b/.test(l));
    if (cIdx < 0) return [];
    const out = [];
    for (let i = cIdx + 1; i < lines.length && out.length < 4; i++) {
      if (/^##\s+[D-Z]/.test(lines[i])) break;
      const m = lines[i].match(/^[-*]\s+\*\*(.+?)\*\*\s*[—–:]\s*(.+)/);
      if (m) out.push({ label: m[1].trim(), detail: stripMarkdown(m[2]).slice(0, 200) });
    }
    return out;
  };

  // Extract "what to emphasize" from Block D/E/positioning
  const edges = extractSection(/^##\s+[DE]\b/, 5);
  const starStories = extractStarStories();
  const cvMatchClaims = extractSection(/^##\s+B\b/, 4);

  // Extract final recommendation text
  let finalRec = '';
  const finalIdx = lines.findIndex(l => /final recommendation/i.test(l));
  if (finalIdx >= 0) {
    finalRec = lines.slice(finalIdx + 1, finalIdx + 12)
      .map(l => stripMarkdown(l)).join(' ').slice(0, 400);
  }

  // Whether evidence block already exists
  const hasEvidence = text.includes('## H) Evidence & Verification');

  // Build research queries
  const grokQuery = `site:reddit.com OR site:linkedin.com OR site:teamblind.com OR site:levels.fyi ${company} "${role}" hiring interview culture 2024 2025`;
  const perplexityQuery = `What do hiring managers and recruiters at ${company} actually screen for when hiring a ${role}? What are the real day-to-day responsibilities and team culture signals from employee reviews and public interviews?`;
  const claudeQuery = `Research ${company}'s AI roadmap, recent product launches, and any public statements by their leadership about the ${role} function. Cross-reference with Glassdoor/Blind signals about interview difficulty and culture. Summarize what claims an applicant for this role should be able to substantiate.`;

  return {
    reportSlug,
    company,
    role,
    score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
    archetype: archMatch ? archMatch[1].trim() : null,
    url: urlMatch ? urlMatch[1].trim() : null,
    cvMatchClaims,
    starStories,
    edges,
    finalRec: finalRec.trim(),
    hasEvidence,
    queries: {
      grok:      { platform: 'Grok (social)', label: '🐦 Social signals', query: grokQuery },
      perplexity:{ platform: 'Perplexity Pro', label: '🔍 Deep research', query: perplexityQuery },
      claude:    { platform: 'Claude Research', label: '🤖 AI synthesis', query: claudeQuery },
    },
  };
}

function saveEvidence(reportSlug, evidenceText) {
  const reportPath = join(ROOT, 'reports', reportSlug);
  if (!existsSync(reportPath)) return { ok: false, error: 'Report not found' };
  const text = readFileSync(reportPath, 'utf8');

  const block = `\n\n---\n\n## H) Evidence & Verification\n\n_Added ${new Date().toISOString().slice(0, 10)} via dashboard verify panel._\n\n${evidenceText.trim()}\n`;

  if (text.includes('## H) Evidence & Verification')) {
    // Replace existing block
    const updated = text.replace(/\n\n---\n\n## H\) Evidence & Verification[\s\S]*$/, block);
    writeFileSync(reportPath, updated);
  } else {
    appendFileSync(reportPath, block);
  }
  return { ok: true };
}

// ── Discard / rejection log ────────────────────────────────────
// Append-only log keyed by row num. Stored at data/discard-log.json.
// Written whenever a row transitions to Discarded, Rejected, or SKIP.
// Entries: { ts, num, company, role, status, reason, url }

const DISCARD_LOG_PATH = join(ROOT, 'data/discard-log.json');

function loadDiscardLog() {
  try {
    if (!existsSync(DISCARD_LOG_PATH)) return [];
    const raw = JSON.parse(readFileSync(DISCARD_LOG_PATH, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch (_) { return []; }
}

function appendDiscardEntry(entry) {
  const log = loadDiscardLog();
  log.push(entry);
  const tmp = DISCARD_LOG_PATH + '.tmp.' + process.pid + '.' + Date.now();
  writeFileSync(tmp, JSON.stringify(log, null, 2));
  renameSync(tmp, DISCARD_LOG_PATH);
}

function detailDiscarded() {
  const apps = parseApplications();
  const discardStatuses = new Set(['discarded', 'rejected', 'skip']);
  const log = loadDiscardLog();
  const reasonByNum = {};
  for (const e of log) if (e.num != null) reasonByNum[String(e.num)] = e.reason || '';

  const rows = apps
    .filter(a => discardStatuses.has((a.status || '').toLowerCase()))
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .map(r => ({ ...r, reason: reasonByNum[String(r.num)] || '' }));

  return { title: 'Discarded & Rejected', total: rows.length, rows };
}

const DETAIL_FNS = {
  'apply-now':    detailApplyNow,
  'evaluations':  detailEvaluations,
  'applied':      detailApplied,
  'pending':      detailPending,
  'companies':    detailCompanies,
  'scanned':      detailScanned,
  'batches':      detailBatches,
  'discarded':    detailDiscarded,
};

// ── Status writeback ───────────────────────────────────────────

function loadCanonicalStatuses() {
  // Read labels from templates/states.yml. Falls back to the AGENTS.md
  // canonical list if states.yml is missing or malformed.
  const fallback = ['Evaluated','Applied','Responded','Interview','Offer','Rejected','Discarded','SKIP'];
  try {
    const text = readFileSync(join(ROOT, 'templates/states.yml'), 'utf8');
    const doc = yaml.load(text);
    const labels = (doc?.states || [])
      .map(s => typeof s?.label === 'string' ? s.label.trim() : '')
      .filter(Boolean);
    return labels.length ? labels : fallback;
  } catch (_) {
    return fallback;
  }
}

const CANONICAL_STATUSES = loadCanonicalStatuses();

function updateApplicationStatus({ num, status, note }) {
  if (num === undefined || num === null || Number.isNaN(parseInt(num, 10))) {
    return { ok: false, code: 400, error: 'num is required and must be an integer' };
  }
  if (!status || typeof status !== 'string') {
    return { ok: false, code: 400, error: 'status is required (string)' };
  }
  // Case-insensitive match against canonical labels; reply with canonical casing
  const canonical = CANONICAL_STATUSES.find(s => s.toLowerCase() === status.trim().toLowerCase());
  if (!canonical) {
    return {
      ok: false, code: 400,
      error: `Invalid status "${status}". Must be one of: ${CANONICAL_STATUSES.join(', ')}`,
    };
  }

  const appsPath = join(ROOT, 'data/applications.md');
  if (!existsSync(appsPath)) {
    return { ok: false, code: 500, error: 'data/applications.md not found' };
  }

  const text = readFileSync(appsPath, 'utf8');
  const lines = text.split('\n');
  const targetNum = String(parseInt(num, 10));
  let updatedRow = null;
  let oldStatus = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) continue;
    if (line.match(/^[\|\s\-:]+$/)) continue;
    if (line.includes('| # |')) continue;

    const cols = line.split('|').map(c => c.trim());
    // cols: [empty, num, date, company, role, score, status, pdf, report, notes, (empty)]
    if (cols.length < 10 || cols[1] !== targetNum) continue;

    oldStatus = cols[6];
    cols[6] = canonical;
    if (typeof note === 'string' && note.length) {
      // Sanitize: pipes break the markdown table
      cols[9] = note.replace(/\|/g, '\\|').slice(0, 600);
    }
    lines[i] = '| ' + cols.slice(1, 10).join(' | ') + ' |';

    const reportMatch = cols[8]?.match(/\[(\d+)\]\(([^)]+)\)/);
    updatedRow = {
      num: cols[1],
      date: cols[2],
      company: cols[3],
      role: cols[4],
      score: parseFloat(cols[5]) || 0,
      status: cols[6],
      pdf: cols[7],
      report: reportMatch ? reportMatch[2] : null,
      notes: cols[9] || '',
    };
    break;
  }

  if (!updatedRow) {
    // AGENTS.md rule: NEVER create new entries — update only.
    return { ok: false, code: 404, error: `Row #${targetNum} not found in applications.md (refusing to create)` };
  }

  // Atomic write: write to temp then rename
  const tmpPath = appsPath + '.tmp.' + process.pid + '.' + Date.now();
  try {
    writeFileSync(tmpPath, lines.join('\n'));
    renameSync(tmpPath, appsPath);
  } catch (err) {
    return { ok: false, code: 500, error: `Atomic write failed: ${err.message}` };
  }

  // Bust the 30s apps cache so /api/outreach immediately sees the new status
  // when it enriches contacts via linked_application_id → applications.md.
  _appsCache = { ts: 0, byNum: new Map() };

  // Auto-log status change to per-row activity (best-effort; never block status update)
  if (oldStatus && oldStatus !== canonical) {
    try {
      appendRowEvent(targetNum, {
        ts: new Date().toISOString(),
        type: 'status',
        text: `${oldStatus} → ${canonical}`,
      });
    } catch (_) {}
  }

  // Write to discard log when transitioning to a terminal negative status
  const discardStatuses = new Set(['discarded', 'rejected', 'skip']);
  let queueUpdated = false;
  if (discardStatuses.has(canonical.toLowerCase()) && updatedRow) {
    try {
      appendDiscardEntry({
        ts:      new Date().toISOString(),
        num:     updatedRow.num != null ? parseInt(updatedRow.num, 10) : null,
        company: updatedRow.company || '',
        role:    updatedRow.role    || '',
        status:  canonical,
        reason:  (typeof note === 'string' && note.trim()) ? note.trim() : '',
      });
    } catch (_) {}

    // Remove from apply-now-queue.json so all surfaces stay in sync
    try {
      const queuePath = join(ROOT, 'data/apply-now-queue.json');
      if (existsSync(queuePath)) {
        const queueRaw = JSON.parse(readFileSync(queuePath, 'utf8'));
        const before = (queueRaw.ranked || []).length;
        queueRaw.ranked = (queueRaw.ranked || []).filter(r => String(r.num) !== targetNum);
        if (queueRaw.ranked.length !== before) {
          queueRaw.ranked.forEach((r, i) => { r.rank = i + 1; });
          queueRaw.total_rows = queueRaw.ranked.length;
          if (!queueRaw.qa_cleanup) queueRaw.qa_cleanup = {};
          queueRaw.qa_cleanup.last_auto_remove = {
            ts: new Date().toISOString(), num: parseInt(targetNum, 10),
            company: updatedRow.company, reason: canonical,
          };
          const queueTmp = queuePath + '.tmp.' + process.pid + '.' + Date.now();
          writeFileSync(queueTmp, JSON.stringify(queueRaw, null, 2));
          renameSync(queueTmp, queuePath);
          queueUpdated = true;
        }
      }
    } catch (_) {}
  }

  return { ok: true, row: updatedRow, queueUpdated };
}

function updateApplicationStatusBulk({ nums, status }) {
  if (!Array.isArray(nums) || nums.length === 0) {
    return { ok: false, code: 400, error: 'nums is required (non-empty array of integers)' };
  }
  if (nums.length > 200) {
    return { ok: false, code: 400, error: `Too many rows in one request (${nums.length} > 200)` };
  }
  if (!status || typeof status !== 'string') {
    return { ok: false, code: 400, error: 'status is required (string)' };
  }
  const canonical = CANONICAL_STATUSES.find(s => s.toLowerCase() === status.trim().toLowerCase());
  if (!canonical) {
    return {
      ok: false, code: 400,
      error: `Invalid status "${status}". Must be one of: ${CANONICAL_STATUSES.join(', ')}`,
    };
  }

  const targets = new Set();
  for (const n of nums) {
    const parsed = parseInt(n, 10);
    if (Number.isNaN(parsed)) {
      return { ok: false, code: 400, error: `Invalid num "${n}" — must be integer` };
    }
    targets.add(String(parsed));
  }

  const appsPath = join(ROOT, 'data/applications.md');
  if (!existsSync(appsPath)) {
    return { ok: false, code: 500, error: 'data/applications.md not found' };
  }

  const text = readFileSync(appsPath, 'utf8');
  const lines = text.split('\n');
  const updated = [];
  const oldStatusByNum = {};
  const stillMissing = new Set(targets);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) continue;
    if (line.match(/^[\|\s\-:]+$/)) continue;
    if (line.includes('| # |')) continue;

    const cols = line.split('|').map(c => c.trim());
    if (cols.length < 10) continue;
    if (!targets.has(cols[1])) continue;

    oldStatusByNum[cols[1]] = cols[6];
    cols[6] = canonical;
    lines[i] = '| ' + cols.slice(1, 10).join(' | ') + ' |';

    const reportMatch = cols[8]?.match(/\[(\d+)\]\(([^)]+)\)/);
    updated.push({
      num: cols[1],
      date: cols[2],
      company: cols[3],
      role: cols[4],
      score: parseFloat(cols[5]) || 0,
      status: cols[6],
      pdf: cols[7],
      report: reportMatch ? reportMatch[2] : null,
      notes: cols[9] || '',
    });
    stillMissing.delete(cols[1]);
  }

  if (updated.length === 0) {
    return {
      ok: false, code: 404,
      error: `No matching rows found for: ${[...stillMissing].join(', ')}`,
    };
  }

  // Atomic write — single rename for the entire batch
  const tmpPath = appsPath + '.tmp.' + process.pid + '.' + Date.now();
  try {
    writeFileSync(tmpPath, lines.join('\n'));
    renameSync(tmpPath, appsPath);
  } catch (err) {
    return { ok: false, code: 500, error: `Atomic write failed: ${err.message}` };
  }

  // Bust the apps cache so /api/outreach sees the new status immediately.
  _appsCache = { ts: 0, byNum: new Map() };

  // Auto-log status change to per-row activity (best-effort; never block)
  const ts = new Date().toISOString();
  for (const row of updated) {
    const old = oldStatusByNum[row.num];
    if (old && old !== canonical) {
      try {
        appendRowEvent(row.num, { ts, type: 'status', text: `${old} → ${canonical}` });
      } catch (_) {}
    }
  }

  return {
    ok: true,
    updated,
    notFound: [...stillMissing],
  };
}

// ── Quick-add to pipeline (dashboard "Add role" modal) ─────────

const ATS_PATTERNS = [
  { id: 'greenhouse', test: /(?:job-boards|boards)\.greenhouse\.io/i },
  { id: 'ashby',      test: /jobs\.ashbyhq\.com/i },
  { id: 'lever',      test: /jobs\.lever\.co/i },
  { id: 'workday',    test: /myworkdayjobs\.com|workday/i },
  { id: 'linkedin',   test: /linkedin\.com\/jobs/i },
];

function detectAts(url) {
  for (const p of ATS_PATTERNS) if (p.test.test(url)) return p.id;
  return 'unknown';
}

function extractCompanyFromAts(parsedUrl, ats) {
  try {
    if (ats === 'greenhouse') {
      const m = parsedUrl.pathname.match(/^\/([^\/]+)\/jobs\//);
      if (m) return m[1];
    } else if (ats === 'ashby' || ats === 'lever') {
      const m = parsedUrl.pathname.match(/^\/([^\/]+)/);
      if (m) return m[1];
    } else if (ats === 'workday') {
      // {company}.wd1.myworkdayjobs.com or workday subdomain
      return parsedUrl.hostname.split('.')[0];
    }
    return parsedUrl.hostname.replace(/^www\./, '').split('.')[0];
  } catch (_) {
    return 'Unknown';
  }
}

function urlInScanHistory(url) {
  const path = join(ROOT, 'data/scan-history.tsv');
  if (!existsSync(path)) return false;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split('\n')) {
    if (!line || line.startsWith('url\t')) continue;
    if (line.split('\t')[0] === url) return true;
  }
  return false;
}

function urlInPipeline(url) {
  const path = join(ROOT, 'data/pipeline.md');
  if (!existsSync(path)) return false;
  return readFileSync(path, 'utf8').includes(url);
}

function addUrlToPipeline({ url, company, title, ats, date }) {
  const path = join(ROOT, 'data/pipeline.md');
  if (!existsSync(path)) return { ok: false, code: 500, error: 'data/pipeline.md not found' };

  const content = readFileSync(path, 'utf8');
  const lines = content.split('\n');

  // Insert at the top of "### Tier 2" so newest-first matches scan.mjs.
  // Skip at most one blank line that follows the header (preserve any
  // trailing blank line before "### Tier 3").
  let insertIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^###\s+Tier 2\b/i.test(lines[i])) {
      insertIdx = i + 1;
      if (insertIdx < lines.length && lines[insertIdx].trim() === '') insertIdx++;
      break;
    }
  }
  if (insertIdx < 0) {
    if (lines[lines.length - 1] !== '') lines.push('');
    lines.push('### Tier 2 — Quick-add (manual)');
    lines.push('');
    insertIdx = lines.length;
  }

  const tag = ats && ats !== 'unknown' ? ' [' + ats + ']' : '';
  const safeCompany = (company || 'Unknown').replace(/\|/g, '/').slice(0, 80);
  const safeTitle   = ((title || '(pending triage)') + tag).replace(/\|/g, '/').slice(0, 200);
  const newLine = '- [ ] ' + url + ' | ' + safeCompany + ' | ' + safeTitle + ' | ' + date;
  lines.splice(insertIdx, 0, newLine);

  const tmp = path + '.tmp.' + process.pid + '.' + Date.now();
  try {
    writeFileSync(tmp, lines.join('\n'));
    renameSync(tmp, path);
  } catch (err) {
    return { ok: false, code: 500, error: 'Atomic write failed: ' + err.message };
  }
  return { ok: true, line: newLine };
}

function quickAddToPipeline(rawUrl) {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return { ok: false, code: 400, error: 'url is required' };
  if (trimmed.length > 2048) return { ok: false, code: 400, error: 'URL too long' };

  let parsedUrl;
  try { parsedUrl = new URL(trimmed); }
  catch (_) { return { ok: false, code: 400, error: 'Not a valid URL — paste a full http(s) link.' }; }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { ok: false, code: 400, error: 'URL must use http or https' };
  }

  // Normalize: drop fragment, keep query (some ATS slugs live there).
  const cleanUrl = parsedUrl.origin + parsedUrl.pathname + parsedUrl.search;

  if (urlInScanHistory(cleanUrl) || urlInPipeline(cleanUrl)) {
    return { ok: false, code: 200, duplicate: true, error: 'already in pipeline' };
  }

  const ats = detectAts(cleanUrl);
  const company = extractCompanyFromAts(parsedUrl, ats);
  const date = new Date().toISOString().slice(0, 10);

  const result = addUrlToPipeline({ url: cleanUrl, company, title: '(pending triage)', ats, date });
  if (!result.ok) return result;

  return { ok: true, ats, company, date, url: cleanUrl, line: result.line };
}

// ── Share-link tokens (24h read-only recruiter links) ─────────

const SHARE_TOKENS_PATH = join(ROOT, 'data/share-tokens.json');
const SHARE_TTL_MS = 24 * 60 * 60 * 1000;

function loadShareTokens() {
  try {
    if (!existsSync(SHARE_TOKENS_PATH)) return { tokens: [] };
    const raw = JSON.parse(readFileSync(SHARE_TOKENS_PATH, 'utf8'));
    if (!raw || !Array.isArray(raw.tokens)) return { tokens: [] };
    return raw;
  } catch (_) {
    return { tokens: [] };
  }
}

function saveShareTokens(data) {
  const dir = dirname(SHARE_TOKENS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = SHARE_TOKENS_PATH + '.tmp.' + process.pid + '.' + Date.now();
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, SHARE_TOKENS_PATH);
}

function pruneExpired(data, now = Date.now()) {
  const before = data.tokens.length;
  data.tokens = data.tokens.filter(t => new Date(t.expires).getTime() > now);
  return { data, removed: before - data.tokens.length };
}

function lookupShareToken(token) {
  if (!token || typeof token !== 'string') return { status: 'missing' };
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return { status: 'invalid' };
  const data = loadShareTokens();
  const row = data.tokens.find(t => t.token === token);
  if (!row) return { status: 'invalid' };
  if (new Date(row.expires).getTime() <= Date.now()) return { status: 'expired', row };
  return { status: 'valid', row };
}

function createShareToken() {
  const token = randomBytes(16).toString('hex'); // 32 hex chars
  const created = new Date().toISOString();
  const expires = new Date(Date.now() + SHARE_TTL_MS).toISOString();
  const data = pruneExpired(loadShareTokens()).data;
  data.tokens.push({ token, created, expires });
  saveShareTokens(data);
  return { token, created, expires };
}

// ── Per-row notes & activity log ───────────────────────────────
// Append-only timestamped events keyed by row num. Stored at
// data/row-notes.json (gitignored). Two event types:
//   { ts, type: 'note',   text: '<freeform user note>' }
//   { ts, type: 'status', text: 'OldStatus → NewStatus' }
// Atomic writes via tmp + rename. Per-note text capped at 1000 chars.

const ROW_NOTES_PATH    = join(ROOT, 'data/row-notes.json');
const NOTE_MAX_CHARS    = 1000;

function loadRowNotes() {
  try {
    if (!existsSync(ROW_NOTES_PATH)) return {};
    const raw = JSON.parse(readFileSync(ROW_NOTES_PATH, 'utf8'));
    return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  } catch (_) {
    return {};
  }
}

function saveRowNotes(data) {
  const dir = dirname(ROW_NOTES_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = ROW_NOTES_PATH + '.tmp.' + process.pid + '.' + Date.now();
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, ROW_NOTES_PATH);
}

function appendRowEvent(num, entry) {
  // Internal — unconditionally append. Validation happens at the public
  // entry points (appendRowNote, status-change call sites).
  const parsed = parseInt(num, 10);
  if (Number.isNaN(parsed)) return false;
  const key = String(parsed);
  const data = loadRowNotes();
  if (!Array.isArray(data[key])) data[key] = [];
  data[key].push(entry);
  try {
    saveRowNotes(data);
    return true;
  } catch (_) {
    return false;
  }
}

function appendRowNote({ num, text }) {
  if (num === undefined || num === null || Number.isNaN(parseInt(num, 10))) {
    return { ok: false, code: 400, error: 'num is required and must be an integer' };
  }
  if (typeof text !== 'string') {
    return { ok: false, code: 400, error: 'text is required (string)' };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, code: 400, error: 'text must not be empty' };
  }
  if (trimmed.length > NOTE_MAX_CHARS) {
    return { ok: false, code: 400, error: `text exceeds ${NOTE_MAX_CHARS}-char limit` };
  }

  const entry = { ts: new Date().toISOString(), type: 'note', text: trimmed };
  const ok = appendRowEvent(num, entry);
  if (!ok) {
    return { ok: false, code: 500, error: 'Failed to write row-notes.json' };
  }
  const all = loadRowNotes()[String(parseInt(num, 10))] || [];
  // Newest first to match the UI expectation.
  return { ok: true, num: String(parseInt(num, 10)), entries: [...all].reverse() };
}

function getRowNotes(num) {
  const parsed = parseInt(num, 10);
  if (Number.isNaN(parsed)) {
    return { ok: false, code: 400, error: 'num must be an integer' };
  }
  const key = String(parsed);
  const all = loadRowNotes()[key] || [];
  return { ok: true, num: key, entries: [...all].reverse() };
}

// ── /mark + report HTML renderer ──────────────────────────────

const CANONICAL_STATES = new Set([
  'Evaluated','Applied','Responded','Interview','Offer','Rejected','Discarded','SKIP',
]);

function renderMarkPage(ctx) {
  const isOk = !!ctx.ok;
  const accent = isOk ? '#1a7f37' : '#cf222e';
  const tone   = isOk ? '#dafbe1' : '#ffebe9';
  const icon   = isOk ? '✅' : '⚠️';
  let body = `<h1 style="margin:0 0 12px;color:${accent}">${icon} ${isOk ? (ctx.idempotent ? 'Already marked' : 'Status updated') : 'Could not mark'}</h1>`;
  body += `<p style="font-size:15px;color:#1f2328">${ctx.message || ''}</p>`;
  if (isOk && ctx.role) body += `<p style="font-size:14px;color:#57606a">${ctx.role}</p>`;
  if (isOk && ctx.priorStatus && ctx.priorStatus !== ctx.status && !ctx.idempotent) {
    const undoUrl = `/mark?num=${ctx.num}&status=${encodeURIComponent(ctx.priorStatus)}&from=${encodeURIComponent(ctx.status)}`;
    body += `<p style="margin-top:18px"><a href="${undoUrl}" style="background:#fff;color:#cf222e;padding:8px 14px;border:1px solid #cf222e;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px">↶ Undo (revert to ${ctx.priorStatus})</a></p>`;
  }
  body += `<p style="margin-top:22px"><a href="/dashboard/" style="color:#0969da;text-decoration:none;font-weight:500">← Back to dashboard</a></p>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>career-ops · mark status</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f6f8fa;color:#1f2328;margin:0;padding:0;line-height:1.55"><main style="max-width:640px;margin:64px auto;padding:0 20px"><div style="background:#ffffff;border:1px solid #d0d7de;border-left:4px solid ${accent};border-radius:10px;padding:28px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.04)"><div style="display:inline-block;background:${tone};color:${accent};padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:14px">career-ops</div>${body}</div></main></body></html>`;
}

function handleMarkRequest(req, res) {
  const fullUrl = new URL(req.url, `http://localhost:${PORT}`);
  const num    = parseInt(fullUrl.searchParams.get('num') || '', 10);
  const status = (fullUrl.searchParams.get('status') || 'Applied').trim();
  const previousStatus = (fullUrl.searchParams.get('from') || '').trim();

  const html = (body, code = 200) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(body); };

  if (!Number.isFinite(num) || num < 1)
    return html(renderMarkPage({ ok: false, message: `Invalid row number: ${fullUrl.searchParams.get('num')}` }), 400);
  if (!CANONICAL_STATES.has(status))
    return html(renderMarkPage({ ok: false, message: `Invalid status "${status}". Allowed: ${[...CANONICAL_STATES].join(', ')}` }), 400);

  const appsPath = join(ROOT, 'data/applications.md');
  if (!existsSync(appsPath))
    return html(renderMarkPage({ ok: false, message: 'data/applications.md not found' }), 500);

  const lines = readFileSync(appsPath, 'utf-8').split('\n');
  let priorStatus = '', priorCompany = '', priorRole = '', lineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\|\s*(\d+)\s*\|/);
    if (m && parseInt(m[1], 10) === num) {
      lineIdx = i;
      const cells = lines[i].split('|').map(c => c.trim());
      priorCompany = cells[3] || ''; priorRole = cells[4] || ''; priorStatus = cells[6] || '';
      break;
    }
  }
  if (lineIdx === -1)
    return html(renderMarkPage({ ok: false, message: `Row #${num} not found in applications.md` }), 404);
  if (priorStatus === status)
    return html(renderMarkPage({ ok: true, idempotent: true, num, company: priorCompany, role: priorRole, status, priorStatus, message: `#${num} is already marked ${status} — no change needed.` }));

  const cells = lines[lineIdx].split('|');
  if (cells.length < 10)
    return html(renderMarkPage({ ok: false, message: `Row #${num} has unexpected column count (${cells.length}). Refusing to edit.` }), 500);

  const orig = cells[6];
  cells[6] = `${orig.match(/^\s*/)[0]}${status}${orig.match(/\s*$/)[0]}`;
  const today = new Date().toISOString().slice(0, 10);
  const noteOrig = cells[9] || '';
  cells[9] = `${noteOrig.match(/^\s*/)[0]}${noteOrig.trim()} · marked ${status} via heartbeat ${today}${noteOrig.match(/\s*$/)[0]}`;
  lines[lineIdx] = cells.join('|');
  writeFileSync(appsPath, lines.join('\n'));
  console.log(`  ✓ Marked #${num} ${priorCompany}: ${priorStatus} → ${status}`);
  return html(renderMarkPage({ ok: true, num, company: priorCompany, role: priorRole, status, priorStatus, message: `#${num} ${priorCompany} marked ${priorStatus} → ${status}.` }));
}

function renderMarkdownPage(mdContent, fileName) {
  marked.setOptions({ gfm: true, breaks: false });
  const restHtml = marked.parse(mdContent);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${fileName} · career-ops</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;max-width:920px;margin:32px auto;padding:0 24px;color:#1e293b;line-height:1.6;background:#f8fafc}.nav{font-size:13px;color:#64748b;margin-bottom:18px}.nav a{color:#4338ca;text-decoration:none}article{background:#fff;padding:32px 40px;border-radius:12px;border:1px solid #e2e8f0}h1{font-size:26px;margin:0 0 14px;color:#0f172a}h2{font-size:19px;margin:28px 0 10px;color:#0f172a;border-left:4px solid #6366f1;padding-left:10px}h3{font-size:16px;margin:22px 0 8px;color:#1e293b}a{color:#4338ca}code{background:#f1f5f9;padding:1px 6px;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}pre{background:#f1f5f9;padding:14px 16px;border-radius:8px;overflow-x:auto;font-size:13px}table{border-collapse:collapse;width:100%;margin:16px 0;font-size:14px}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top}th{background:#f8fafc;font-weight:600}blockquote{margin:16px 0;padding:12px 18px;border-left:4px solid #6366f1;background:#eef2ff;color:#312e81;border-radius:0 8px 8px 0}hr{border:none;height:1px;background:#e2e8f0;margin:24px 0}ul,ol{padding-left:24px}li{margin:4px 0}</style></head><body><div class="nav"><a href="/dashboard/">← back to dashboard</a> · <code>${fileName}</code></div><article>${restHtml}</article></body></html>`;
}

// ── HTTP server ────────────────────────────────────────────────

const server = createServer((req, res) => {
  const url = req.url.split('?')[0];
  const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
  const query = Object.fromEntries(new URLSearchParams(queryString));

  const json = (data, code = 200) => {
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(data));
  };

  // /mark — heartbeat email "✅ Applied" one-click status flip
  if (url === '/mark') return handleMarkRequest(req, res);

  // /reports/*.md — render markdown reports as styled HTML
  const reportHtmlMatch = url.match(/^\/reports\/(.+\.md)$/);
  if (reportHtmlMatch) {
    const reportPath = join(ROOT, 'reports', reportHtmlMatch[1]);
    if (!existsSync(reportPath)) { res.writeHead(404); res.end('Report not found'); return; }
    const md = readFileSync(reportPath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(renderMarkdownPage(md, reportHtmlMatch[1]));
    return;
  }

  // Share-link endpoints
  if (url === '/api/share/create') {
    const { token, expires, created } = createShareToken();
    const host = req.headers.host || `localhost:${PORT}`;
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const shareUrl = `${proto}://${host}/?share=${token}&demo=1`;
    return json({ token, expires, created, url: shareUrl });
  }
  if (url === '/api/share/verify') {
    const result = lookupShareToken(query.share || query.token);
    if (result.status === 'valid') return json({ valid: true, expires: result.row.expires });
    if (result.status === 'expired') return json({ valid: false, reason: 'expired', expires: result.row.expires }, 410);
    return json({ valid: false, reason: result.status }, 401);
  }

  if (url === '/api/stats') return json(computeStats());

  // ── Hiring-manager intel (from scripts/hiring-manager-research.mjs) ─────
  // GET /api/hm-intel?slug=anthropic-comms-manager  → returns the JSON
  // synthesized by the 7-LLM council, or 404 if no intel exists yet.
  // The dashboard drawer fetches this lazily on row click.
  if (url === '/api/hm-intel') {
    const slug = String(query.slug || '').toLowerCase()
      .replace(/[^a-z0-9-]/g, '').slice(0, 120);
    if (!slug) return json({ ok: false, error: 'missing slug' }, 400);
    const fp = join(ROOT, 'data/hm-intel', `${slug}.json`);
    if (!existsSync(fp)) return json({ ok: false, error: 'no intel for slug', slug }, 404);
    try {
      const raw = readFileSync(fp, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      return res.end(raw);
    } catch (err) {
      return json({ ok: false, error: err.message }, 500);
    }
  }

  // GET /api/hm-intel/list → returns slugs that have intel files (for the
  // dashboard to know which rows have a 🔍 intel chip).
  if (url === '/api/hm-intel/list') {
    const dir = join(ROOT, 'data/hm-intel');
    if (!existsSync(dir)) return json({ slugs: [] });
    const slugs = readdirSync(dir)
      .filter(f => f.endsWith('.json') && !f.startsWith('_'))
      .map(f => f.replace(/\.json$/, ''));
    return json({ slugs });
  }

  // ── Pipeline processing — "Run Batch" + "Process All" buttons ───────────
  // Two flows the dashboard can trigger:
  //  • Run Batch       → batch-runner-batches.mjs run  (existing queue only)
  //  • Process All     → triage + batch + rebuild + optional email
  //
  // GET  /api/pipeline/preview        → counts + cost estimate + budget state
  // POST /api/pipeline/process-all    → kick off the chain
  // POST /api/batch/run               → kick off batch-only
  // GET  /api/pipeline/job-status     → poll a running job
  if (url === '/api/pipeline/preview') {
    return json(buildPipelinePreview());
  }
  if (url === '/api/pipeline/per-company-preview') {
    // Task 2 (2026-05-16): per-company breakdown for the 2-phase Process All
    // modal. Returns one row per unique company in the Apply-Now queue with
    // score + TTO + toxicity + cache-hit + cost estimate so the user can
    // inspect / uncheck rows before confirming the orchestrator run.
    //
    // Anti-breakage env kill switch (calibration brief 2026-05-16): set
    // PROCESS_ALL_V2_PREVIEW_ENABLED=false to disable the new endpoint without
    // a code change. Client (scripts/build-dashboard.mjs) detects the 410 and
    // falls back to the existing single-phase v1 modal flow automatically.
    if (process.env.PROCESS_ALL_V2_PREVIEW_ENABLED === 'false') {
      return json({ ok: false, error: 'v2 preview disabled via PROCESS_ALL_V2_PREVIEW_ENABLED env', disabled: true }, 410);
    }
    return json(buildPerCompanyPipelinePreview());
  }
  if (url === '/api/pipeline/exclude-company' && req.method === 'POST') {
    // Task 2 — "Trash" action on the per-company preview table. Appends a
    // company slug to data/excluded-companies.json under the user-defined
    // "manual_exclusion" category so it auto-trashes on future scans.
    let body = '';
    let total = 0;
    req.on('data', c => { total += c.length; if (total > 4 * 1024) { req.destroy(); return; } body += c; });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body || '{}'); }
      catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
      const company = String(parsed.company || '').trim();
      const rationale = String(parsed.rationale || '').trim();
      if (!company) return json({ ok: false, error: 'company required' }, 400);
      if (rationale.length > 500) return json({ ok: false, error: 'rationale too long (500 char max)' }, 400);
      const slug = _slugifyCompanyForIntel(company);
      if (!slug) return json({ ok: false, error: 'company slug empty after normalization' }, 400);
      const fp = join(ROOT, 'data/excluded-companies.json');
      let data;
      try {
        data = existsSync(fp) ? JSON.parse(readFileSync(fp, 'utf-8')) : { _schema_version: 1, categories: {} };
      } catch (e) {
        return json({ ok: false, error: 'failed to load excluded-companies.json: ' + e.message }, 500);
      }
      data.categories = data.categories || {};
      const cat = data.categories.manual_exclusion || (data.categories.manual_exclusion = {
        rationale: 'Companies manually trashed from the Process All preview modal. Auto-excluded on future scans until the user removes the slug.',
        companies: [],
        aliases: {},
        manual_entries: [],
      });
      cat.companies = Array.isArray(cat.companies) ? cat.companies : [];
      cat.manual_entries = Array.isArray(cat.manual_entries) ? cat.manual_entries : [];
      const alreadyHas = cat.companies.includes(slug);
      if (!alreadyHas) cat.companies.push(slug);
      cat.manual_entries.push({
        slug,
        company_label: company,
        rationale: rationale || '(no rationale provided)',
        added_at: new Date().toISOString(),
        source: 'process-all-modal',
      });
      try {
        if (!existsSync(join(ROOT, 'data'))) mkdirSync(join(ROOT, 'data'), { recursive: true });
        writeFileSync(fp, JSON.stringify(data, null, 2));
      } catch (e) {
        return json({ ok: false, error: 'failed to persist: ' + e.message }, 500);
      }
      return json({ ok: true, slug, idempotent: alreadyHas });
    });
    return;
  }
  if (url === '/api/pipeline/build-apply-pack' && req.method === 'POST') {
    // Task 2 — "Skip-to-apply-pack" action on the per-company preview table.
    // Spawns scripts/build-apply-pack.mjs for a single row so the user can
    // fast-track a high-confidence company into the apply-pack folder without
    // running the full orchestrator. Idempotent (build-apply-pack handles it).
    let body = '';
    let total = 0;
    req.on('data', c => { total += c.length; if (total > 4 * 1024) { req.destroy(); return; } body += c; });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body || '{}'); }
      catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
      const row = parseInt(parsed.row, 10);
      if (!Number.isFinite(row) || row < 1) return json({ ok: false, error: 'row (int) required' }, 400);
      const jobId = 'pack-' + Date.now().toString(36) + '-' + randomBytes(3).toString('hex');
      const logPath = `/tmp/apply-pack-${jobId}.log`;
      try {
        import('child_process').then(({ spawn }) => {
          const proc = spawn('node', [join(ROOT, 'scripts/build-apply-pack.mjs'), `--row=${row}`], {
            cwd: ROOT,
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: true,
          });
          proc.stdout?.on('data', c => { try { appendFileSync(logPath, c); } catch {} });
          proc.stderr?.on('data', c => { try { appendFileSync(logPath, '[stderr] ' + c); } catch {} });
          proc.unref();
        });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
      return json({ ok: true, row, jobId, log_path: logPath });
    });
    return;
  }
  // ── Drawer "Create Materials" — single-row apply-pack from the right-rail
  // POST /api/drawer/build-apply-pack
  //   Body: { rowNum: number, force?: boolean }
  //   Behavior:
  //     1) Verify the row exists in data/applications.md (via appsByNum cache)
  //     2) Detect existing apply-pack/{NNN}-*/ — return 409 with the path
  //        unless force:true
  //     3) Cost cap: PER_RUN_CAP_APPLY_PACK_USD ($5 default). If estimate
  //        exceeds the cap, return 402 unless force:true
  //     4) Spawn `node scripts/build-apply-pack.mjs --row=N [--force]` detached,
  //        stream stdout/stderr to /tmp/build-apply-pack-{jobId}.log
  //     5) Record a job row in data/pipeline-process-state.json so the existing
  //        /api/pipeline/job-status endpoint + the new
  //        /api/drawer/apply-pack-status alias can both poll it
  //
  // Voice-corpus passthrough: build-apply-pack.mjs scaffolds stubs only today
  // — the deeper humanize-check / council passes are out of scope for this
  // build task. When that pipeline lands, no endpoint changes are required:
  // we'll just pass --strict to the script.
  if (url === '/api/drawer/build-apply-pack' && req.method === 'POST') {
    let body = '';
    let total = 0;
    req.on('data', c => { total += c.length; if (total > 4 * 1024) { req.destroy(); return; } body += c; });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body || '{}'); }
      catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
      const rowNum = parseInt(parsed.rowNum ?? parsed.row, 10);
      const force  = !!parsed.force;
      if (!Number.isFinite(rowNum) || rowNum < 1) {
        return json({ ok: false, error: 'rowNum (positive integer) required' }, 400);
      }

      // 1) Row must exist
      const app = appsByNum().get(String(rowNum));
      if (!app) {
        return json({ ok: false, error: `Row #${rowNum} not found in data/applications.md` }, 404);
      }

      // 2) Existing apply-pack detection — mirror the script's folder-naming
      //    convention: apply-pack/{NNN}-{slug}. We can't reproduce the exact
      //    slug without re-running slugify on the same fields, so we glob the
      //    parent dir for any folder starting with the 3-digit row prefix.
      const APPLY_PACK_ROOT = join(ROOT, 'apply-pack');
      const prefix = String(rowNum).padStart(3, '0') + '-';
      let existingDir = null;
      if (existsSync(APPLY_PACK_ROOT)) {
        try {
          for (const f of readdirSync(APPLY_PACK_ROOT)) {
            if (f.startsWith(prefix)) {
              const full = join(APPLY_PACK_ROOT, f);
              try {
                if (statSync(full).isDirectory()) { existingDir = full; break; }
              } catch {}
            }
          }
        } catch {}
      }
      if (existingDir && !force) {
        return json({
          ok: false,
          error: 'Apply-pack already exists; pass force:true to regenerate.',
          already_exists: true,
          existing_dir: existingDir.replace(ROOT + '/', ''),
        }, 409);
      }

      // 3) Cost cap
      const estimatedCost = COST_PER_APPLY_PACK_USD;
      if (estimatedCost > PER_RUN_CAP_APPLY_PACK && !force) {
        return json({
          ok: false,
          error: `Estimated $${estimatedCost.toFixed(2)} exceeds per-run cap $${PER_RUN_CAP_APPLY_PACK.toFixed(2)}. Pass force:true to override or raise PER_RUN_CAP_APPLY_PACK_USD.`,
          cap_exceeded: 'per_run',
          estimated_cost_usd: estimatedCost,
          cap_usd: PER_RUN_CAP_APPLY_PACK,
        }, 402);
      }

      // 4) Spawn the script
      const jobId = 'drawer-pack-' + Date.now().toString(36) + '-' + randomBytes(3).toString('hex');
      const logPath = `/tmp/build-apply-pack-${jobId}.log`;
      // Compute the expected output dir for the client toast/link. The script
      // uses `${pad3(row)}-${slugify(company + '-' + role)}`. We can replicate
      // slugify locally — it's a single regex pipeline (see build-apply-pack.mjs:47).
      const expectedSlug = (app.company + '-' + app.role)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
      const expectedDir = `apply-pack/${prefix}${expectedSlug}`;
      try {
        const scriptArgs = [join(ROOT, 'scripts/build-apply-pack.mjs'), `--row=${rowNum}`];
        if (force) scriptArgs.push('--force');
        import('child_process').then(({ spawn }) => {
          const proc = spawn('node', scriptArgs, {
            cwd: ROOT,
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: true,
          });
          proc.stdout?.on('data', c => { try { appendFileSync(logPath, c); } catch {} });
          proc.stderr?.on('data', c => { try { appendFileSync(logPath, '[stderr] ' + c); } catch {} });
          proc.on('exit', (code) => {
            // Persist the terminal state so /api/pipeline/job-status returns
            // status=completed|failed after the process actually exits.
            try {
              const state = loadPipelineProcessState();
              if (state.jobs?.[jobId]) {
                state.jobs[jobId].status = code === 0 ? 'completed' : 'failed';
                state.jobs[jobId].exit_code = code;
                state.jobs[jobId].finished_at = new Date().toISOString();
                if (code !== 0) state.jobs[jobId].error = `build-apply-pack.mjs exited ${code}`;
                writeFileSync(join(ROOT, 'data/pipeline-process-state.json'), JSON.stringify(state, null, 2));
              }
            } catch {}
          });
          proc.unref();
        });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }

      // 5) Record the job in pipeline-process-state.json so the existing
      //    /api/pipeline/job-status (and our new alias) can poll it.
      try {
        if (!existsSync(join(ROOT, 'data'))) mkdirSync(join(ROOT, 'data'), { recursive: true });
        const state = loadPipelineProcessState();
        state.jobs[jobId] = {
          jobId,
          type:         'drawer-apply-pack',
          status:       'running',
          started_at:   new Date().toISOString(),
          row_num:      rowNum,
          company:      app.company,
          role:         app.role,
          expected_dir: expectedDir,
          force:        force,
          log_path:     logPath,
        };
        writeFileSync(join(ROOT, 'data/pipeline-process-state.json'), JSON.stringify(state, null, 2));
      } catch {}

      return json({
        ok: true,
        jobId,
        row_num: rowNum,
        log_path: logPath,
        expected_dir: expectedDir,
        company: app.company,
        role: app.role,
        force,
        estimated_cost_usd: estimatedCost,
        status_url: `/api/drawer/apply-pack-status?job_id=${jobId}`,
      });
    });
    return;
  }
  // GET /api/drawer/apply-pack-status?job_id=X
  //   Thin alias over /api/pipeline/job-status, kept under the drawer
  //   namespace so future drawer-specific fields (e.g. file_count, README
  //   ready-state) can be appended without touching the pipeline status path.
  if (url === '/api/drawer/apply-pack-status' && req.method === 'GET') {
    const jobId = String(query.job_id || '');
    if (!jobId) return json({ ok: false, error: 'missing job_id' }, 400);
    const state = loadPipelineProcessState();
    const job = state.jobs?.[jobId];
    if (!job) return json({ ok: false, error: 'job not found' }, 404);
    // Pull tail of log for the modal
    let tail = [];
    if (job.log_path && existsSync(job.log_path)) {
      try {
        const lines = readFileSync(job.log_path, 'utf-8').split('\n').filter(Boolean);
        tail = lines.slice(-20);
      } catch {}
    }
    // Detect README so the client can offer a deep link the moment the
    // script writes it (build-apply-pack.mjs writes README.md first).
    let readmeRel = null;
    if (job.expected_dir) {
      const readmeAbs = join(ROOT, job.expected_dir, 'README.md');
      if (existsSync(readmeAbs)) readmeRel = `${job.expected_dir}/README.md`;
    }
    return json({ ok: true, job, log_tail: tail, readme_rel: readmeRel });
  }
  if (url === '/api/pipeline/defer-company' && req.method === 'POST') {
    // Task 2 — "Defer" action on the per-company preview table. Writes a row
    // to data/deferred-companies.jsonl (gitignored) so the next Process All
    // can skip the company. Not the same as exclude — deferred companies are
    // retried on the next manual review; excluded companies are permanent.
    let body = '';
    let total = 0;
    req.on('data', c => { total += c.length; if (total > 4 * 1024) { req.destroy(); return; } body += c; });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body || '{}'); }
      catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
      const company = String(parsed.company || '').trim();
      if (!company) return json({ ok: false, error: 'company required' }, 400);
      const slug = _slugifyCompanyForIntel(company);
      const entry = {
        ts: new Date().toISOString(),
        slug,
        company_label: company,
        reason: String(parsed.reason || '').slice(0, 500),
        source: 'process-all-modal',
      };
      try {
        if (!existsSync(join(ROOT, 'data'))) mkdirSync(join(ROOT, 'data'), { recursive: true });
        appendFileSync(join(ROOT, 'data/deferred-companies.jsonl'), JSON.stringify(entry) + '\n');
      } catch (e) {
        return json({ ok: false, error: 'failed to persist: ' + e.message }, 500);
      }
      return json({ ok: true, slug });
    });
    return;
  }
  if (url === '/api/recruiter-pipeline-density') {
    // Phase 6 (calibration 2026-05-16): pipeline-density widget data source.
    // Used by the dashboard runway-alert widget + heartbeat email runway section.
    return json(computeRecruiterPipelineDensity());
  }
  if (url === '/api/runway-detail') {
    // 2026-05-17 — click-through detail for the runway sidebar widget.
    // Powers openRunwayDetailModal(); polled every 30s while modal open.
    return json(computeRunwayDetail());
  }
  if (url === '/api/discard-with-reason' && req.method === 'POST') {
    // Item #1 from 2026-05-16 incomplete-task review: capture WHY a row was
    // discarded so the next eval run can avoid the same anti-pattern. Reasons
    // append to data/discard-reasons.jsonl (gitignored — personal data).
    // Future: triage prompt enrichment consumes recent reasons + heartbeat
    // email surfaces a "rejected pattern of the week" section.
    let body = '';
    let total = 0;
    req.on('data', c => { total += c.length; if (total > 8 * 1024) { req.destroy(); return; } body += c; });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body || '{}'); }
      catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
      const rowNum = parseInt(parsed.row_num, 10);
      const reason = String(parsed.reason || '').trim();
      const company = String(parsed.company || '').trim();
      const role    = String(parsed.role    || '').trim();
      if (!rowNum || !reason) return json({ ok: false, error: 'row_num and reason required' }, 400);
      if (reason.length > 1000) return json({ ok: false, error: 'reason too long (1000 char max)' }, 400);
      const entry = {
        ts: new Date().toISOString(),
        row_num: rowNum,
        company,
        role,
        reason,
        // Tags help the triage prompt group reasons over time
        tag: classifyDiscardReason(reason),
      };
      try {
        if (!existsSync(join(ROOT, 'data'))) mkdirSync(join(ROOT, 'data'), { recursive: true });
        appendFileSync(join(ROOT, 'data/discard-reasons.jsonl'), JSON.stringify(entry) + '\n');
      } catch (e) {
        return json({ ok: false, error: 'failed to persist: ' + e.message }, 500);
      }
      return json({ ok: true, entry });
    });
    return;
  }
  if (url === '/api/discard-reasons/recent') {
    // Surfaced by heartbeat + future triage prompt enrichment. Last 30 entries.
    const fp = join(ROOT, 'data/discard-reasons.jsonl');
    if (!existsSync(fp)) return json({ ok: true, entries: [] });
    try {
      const lines = readFileSync(fp, 'utf-8').split('\n').filter(Boolean);
      const recent = lines.slice(-30).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      return json({ ok: true, entries: recent.reverse() });
    } catch (e) {
      return json({ ok: false, error: e.message }, 500);
    }
  }
  if (url === '/api/pipeline/process-all' && req.method === 'POST') {
    let body = '';
    let total = 0;
    // Larger ceiling so the optional `companies` payload (Task 2 modal selection)
    // doesn't get truncated for typical Apply-Now lists.
    req.on('data', c => { total += c.length; if (total > 32 * 1024) { req.destroy(); return; } body += c; });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body || '{}'); }
      catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
      if (!parsed.confirm) return json({ ok: false, error: 'confirm=true required' }, 400);
      // `force: true` overrides per-run / monthly caps (user explicitly accepted)
      // `companies` (optional) — Task 2 — comma-list of company labels passed
      // through to the orchestrator's --companies flag for subset runs.
      const result = spawnProcessAll({
        sendEmail: !!parsed.sendEmail,
        force:     !!parsed.force,
        companies: Array.isArray(parsed.companies) ? parsed.companies : null,
      });
      // 402 (Payment Required) for cap-exceeded refusals so UI can distinguish from generic errors
      const statusCode = result.ok ? 200 : (result.cap_exceeded ? 402 : 400);
      return json(result, statusCode);
    });
    return;
  }
  if (url === '/api/batch/run' && req.method === 'POST') {
    let body = '';
    let total = 0;
    req.on('data', c => { total += c.length; if (total > 4 * 1024) { req.destroy(); return; } body += c; });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body || '{}'); }
      catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
      if (!parsed.confirm) return json({ ok: false, error: 'confirm=true required' }, 400);
      const result = spawnBatchOnly({ sendEmail: !!parsed.sendEmail, force: !!parsed.force });
      const statusCode = result.ok ? 200 : (result.cap_exceeded ? 402 : 400);
      return json(result, statusCode);
    });
    return;
  }
  if (url === '/api/pipeline/job-status') {
    const jobId = String(query.job_id || '');
    if (!jobId) return json({ ok: false, error: 'missing job_id' }, 400);
    const state = loadPipelineProcessState();
    const job = state.jobs?.[jobId];
    if (!job) return json({ ok: false, error: 'job not found' }, 404);
    // Pull the last 20 log lines so the modal can show progress
    let tail = [];
    if (job.log_path && existsSync(job.log_path)) {
      try {
        const lines = readFileSync(job.log_path, 'utf-8').split('\n').filter(Boolean);
        tail = lines.slice(-20);
      } catch {}
    }
    return json({ ok: true, job, log_tail: tail });
  }

  // ── Outreach API ────────────────────────────────────────────────────────
  // Powers the Outreach Pulse section + per-contact intel drawer.
  // resetOutreachCache() ensures every GET reads fresh state (writes come
  // from log-touch.mjs running in a different process).
  if (url === '/api/outreach') {
    resetOutreachCache();
    return json(enrichOutreachSummary(buildOutreachSummary()));
  }
  if (url === '/api/outreach/all') {
    resetOutreachCache();
    const contacts = listOutreachContacts().map(c => enrichContact(c));
    return json({ contacts });
  }
  const outreachContactMatch = url.match(/^\/api\/outreach\/contact\/(.+)$/);
  if (outreachContactMatch && req.method === 'GET') {
    resetOutreachCache();
    const id = decodeURIComponent(outreachContactMatch[1]);
    const c = getOutreachContact(id);
    if (!c) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'not found' })); return; }
    return json(enrichContact(c));
  }
  if (url === '/api/outreach/touch' && req.method === 'POST') {
    let body = ''; let total = 0;
    req.on('data', c => { total += c.length; if (total > 8 * 1024) { req.destroy(); return; } body += c; });
    req.on('end', () => {
      try {
        const p = JSON.parse(body);
        if (!p.contact_id || !p.channel) throw new Error('contact_id and channel required');
        upsertOutreachContact({
          contact_id:            p.contact_id,
          name:                  p.name,
          company:               p.company,
          title_at_send:         p.title,
          contact_type:          p.contact_type || 'recruiter',
          degree:                p.degree || 1,
          linked_application_id: p.linked_application_id,
          tier:                  p.tier || 'B',
        });
        const c = logOutreachTouch(p.contact_id, {
          channel:     p.channel,
          template_id: p.template_id || null,
          summary:     p.summary || '',
          outbound:    p.outbound !== false,
          ts:          p.ts || null,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, contact: c }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }
  if (url === '/api/outreach/status' && req.method === 'POST') {
    let body = ''; let total = 0;
    req.on('data', c => { total += c.length; if (total > 8 * 1024) { req.destroy(); return; } body += c; });
    req.on('end', () => {
      try {
        const p = JSON.parse(body);
        if (!p.contact_id || !p.status) throw new Error('contact_id and status required');
        const c = setOutreachStatus(p.contact_id, p.status);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, contact: c }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }
  // POST /api/outreach/snooze — body: { contact_id, until_iso, note? }
  // Snoozed contacts are excluded from due_today/breakup/referrals until
  // until_iso passes. resetOutreachCache() ensures the next /api/outreach
  // call sees fresh state.
  if (url === '/api/outreach/snooze' && req.method === 'POST') {
    let body = ''; let total = 0;
    req.on('data', c => { total += c.length; if (total > 8 * 1024) { req.destroy(); return; } body += c; });
    req.on('end', () => {
      try {
        const p = JSON.parse(body);
        if (!p.contact_id || !p.until_iso) throw new Error('contact_id and until_iso required');
        if (!getOutreachContact(p.contact_id)) throw new Error(`contact not found: ${p.contact_id}`);
        const c = snoozeOutreachContact(p.contact_id, p.until_iso, p.note || '');
        resetOutreachCache();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, contact: enrichContact(c) }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }
  // POST /api/outreach/cancel-strategy — body: { contact_id, reason? }
  // Marks the current next_action as cancelled. Contact stays in the
  // tracker; the next recommender pass writes a fresh next_action.
  if (url === '/api/outreach/cancel-strategy' && req.method === 'POST') {
    let body = ''; let total = 0;
    req.on('data', c => { total += c.length; if (total > 8 * 1024) { req.destroy(); return; } body += c; });
    req.on('end', () => {
      try {
        const p = JSON.parse(body);
        if (!p.contact_id) throw new Error('contact_id required');
        if (!getOutreachContact(p.contact_id)) throw new Error(`contact not found: ${p.contact_id}`);
        const c = cancelOutreachStrategy(p.contact_id, p.reason || '');
        resetOutreachCache();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, contact: enrichContact(c) }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }
  // POST /api/outreach/wake — body: { contact_id }
  // Clears snoozed_until so the contact reappears on the next refresh.
  if (url === '/api/outreach/wake' && req.method === 'POST') {
    let body = ''; let total = 0;
    req.on('data', c => { total += c.length; if (total > 8 * 1024) { req.destroy(); return; } body += c; });
    req.on('end', () => {
      try {
        const p = JSON.parse(body);
        if (!p.contact_id) throw new Error('contact_id required');
        if (!getOutreachContact(p.contact_id)) throw new Error(`contact not found: ${p.contact_id}`);
        const c = wakeOutreachContact(p.contact_id);
        resetOutreachCache();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, contact: enrichContact(c) }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (url === '/api/batch-live') {
    try { return json(batchLive()); }
    catch (err) { res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ error: err.message })); return; }
  }

  // ── Sidebar batch popout: detailed live status feed (2026-05-17) ──
  // Powers the clickable #sidebar-batch box → modal with real-time detail.
  // Composes batchLive() summary + detailBatches() recent-runs grouping +
  // cost-log totals + queue depth + recent batch-related failures.
  if (url === '/api/batch/status-detailed') {
    try { return json(buildBatchStatusDetailed()); }
    catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
      return;
    }
  }

  const verifyMatch = url.match(/^\/api\/verify\/(.+\.md)$/);
  if (verifyMatch) {
    const payload = buildVerifyPayload(verifyMatch[1]);
    if (!payload) { res.writeHead(404); res.end('Report not found'); return; }
    return json(payload);
  }

  if (url === '/api/save-evidence' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { reportSlug, evidenceText } = JSON.parse(body);
        const result = saveEvidence(reportSlug, evidenceText || '');
        res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (url === '/api/status' && req.method === 'POST') {
    let body = '';
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > 8 * 1024) { req.destroy(); return; }
      body += c;
    });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); }
      catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }));
        return;
      }
      const result = updateApplicationStatus({
        num:    parsed.num,
        status: parsed.status,
        note:   parsed.note,
      });
      const code = result.ok ? 200 : (result.code || 400);
      res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(result.ok
        ? { ok: true, row: result.row, canonicalStatuses: CANONICAL_STATUSES }
        : { ok: false, error: result.error }));
    });
    return;
  }

  if (url === '/api/status' && req.method === 'GET') {
    return json({ canonicalStatuses: CANONICAL_STATUSES });
  }

  if (url === '/api/status/bulk' && req.method === 'POST') {
    let body = '';
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > 64 * 1024) { req.destroy(); return; }
      body += c;
    });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); }
      catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }));
        return;
      }
      const result = updateApplicationStatusBulk({
        nums:   parsed.nums,
        status: parsed.status,
      });
      const code = result.ok ? 200 : (result.code || 400);
      res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(result.ok
        ? { ok: true, updated: result.updated, notFound: result.notFound, canonicalStatuses: CANONICAL_STATUSES }
        : { ok: false, error: result.error }));
    });
    return;
  }

  if (url === '/api/pipeline/add' && req.method === 'POST') {
    let body = '';
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > 8 * 1024) { req.destroy(); return; }
      body += c;
    });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); }
      catch (_) {
        return json({ ok: false, error: 'Invalid JSON body' }, 400);
      }
      const result = quickAddToPipeline(parsed.url);
      const code = result.ok ? 200 : (result.code || 400);
      return json(result, code);
    });
    return;
  }

  // ── Notes & activity (per-row append-only log) ───────────────
  if (url === '/api/notes/add' && req.method === 'POST') {
    let body = '';
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > 8 * 1024) { req.destroy(); return; }
      body += c;
    });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); }
      catch (_) {
        return json({ ok: false, error: 'Invalid JSON body' }, 400);
      }
      const result = appendRowNote({ num: parsed.num, text: parsed.text });
      const code = result.ok ? 200 : (result.code || 400);
      return json(result.ok
        ? { ok: true, num: result.num, entries: result.entries }
        : { ok: false, error: result.error }, code);
    });
    return;
  }

  const notesGetMatch = url.match(/^\/api\/notes\/(\d+)$/);
  if (notesGetMatch && req.method === 'GET') {
    const result = getRowNotes(notesGetMatch[1]);
    const code = result.ok ? 200 : (result.code || 400);
    return json(result.ok
      ? { ok: true, num: result.num, entries: result.entries }
      : { ok: false, error: result.error }, code);
  }

  // ── Stale pipeline items (>=N days) — Feature 1 (item-list-pop-out) ───
  // GET /api/pipeline/stale-items?days=30
  // Returns the subset of detailPending() items whose daysInQueue >= threshold,
  // formatted for the stale-pipeline modal. Sorted oldest-first.
  if (url === '/api/pipeline/stale-items') {
    try {
      const daysRaw = parseInt(query.days, 10);
      const days = (!isNaN(daysRaw) && daysRaw >= 1 && daysRaw <= 3650) ? daysRaw : 30;
      const pending = detailPending();
      const items = (pending.items || [])
        .filter(it => it && it.daysInQueue != null && it.daysInQueue >= days)
        .sort((a, b) => (b.daysInQueue || 0) - (a.daysInQueue || 0))
        .map(it => ({
          url:        it.url || '',
          title:      it.role || '',
          company:    it.company || '',
          source:     it.platform || 'Unknown',
          tier:       it.tier || null,
          age_days:   it.daysInQueue,
          scraped_at: it.dateAdded || null,
          already_discarded: !!it.alreadyDiscarded,
        }));
      return json({ ok: true, days_threshold: days, count: items.length, items });
    } catch (err) {
      console.error('[stale-items] error:', err);
      return json({ ok: false, error: err.message }, 500);
    }
  }

  // POST /api/pipeline/remove-url — Feature 1 "Trash" action.
  // Removes a single pipeline.md row by URL match. Body: { url }.
  // Atomic write via tmp + rename. Idempotent: not-found returns 200.
  if (url === '/api/pipeline/remove-url' && req.method === 'POST') {
    let body = '';
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > 4 * 1024) { req.destroy(); return; }
      body += c;
    });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body || '{}'); }
      catch (_) { return json({ ok: false, error: 'Invalid JSON body' }, 400); }
      const target = String(parsed.url || '').trim();
      if (!target) return json({ ok: false, error: 'url is required' }, 400);
      if (target.length > 2048) return json({ ok: false, error: 'URL too long' }, 400);
      const path = join(ROOT, 'data/pipeline.md');
      if (!existsSync(path)) return json({ ok: false, error: 'pipeline.md not found' }, 500);
      const content = readFileSync(path, 'utf8');
      const lines = content.split('\n');
      let removed = 0;
      const keep = lines.filter(l => {
        if (!l.startsWith('- [ ]')) return true;
        const rest = l.replace(/^- \[ \]\s*/, '').trim();
        const firstCell = (rest.split('|')[0] || '').trim();
        if (firstCell === target) { removed++; return false; }
        return true;
      });
      if (removed === 0) {
        return json({ ok: true, removed: 0, note: 'URL not found in pipeline.md (already removed?)' });
      }
      const tmp = path + '.tmp.' + process.pid + '.' + Date.now();
      try {
        writeFileSync(tmp, keep.join('\n'));
        renameSync(tmp, path);
      } catch (err) {
        return json({ ok: false, error: 'Atomic write failed: ' + err.message }, 500);
      }
      return json({ ok: true, removed });
    });
    return;
  }

  // ── Scan activity — bottom-strip click-through (2026-05-17) ──────────
  // GET /api/scan-activity?limit=20
  // Lists the most recent scan events from data/scan-history.tsv with
  // a per-portal rollup (jobs found, jobs new, first-seen-on-this-scan,
  // age). Data source = parseScanHistory() (which returns one row per URL),
  // grouped by portal+date, sorted newest-first, capped at `limit` groups.
  if (url === '/api/scan-activity') {
    try {
      const limit = Math.max(1, Math.min(200, parseInt(query.limit || '20', 10) || 20));
      const rows = parseScanHistory();
      // Group by (portal, first_seen date) — that's how scans appear in
      // the TSV. Per group: jobs_found = entries, jobs_new = entries marked
      // 'new' or where status begins 'pending'.
      const groups = new Map();
      for (const r of rows) {
        if (!r.portal) continue;
        const dateKey = (r.first_seen || '').slice(0, 10);
        const key = r.portal + '|' + dateKey;
        if (!groups.has(key)) {
          groups.set(key, {
            portal: r.portal,
            date: dateKey,
            jobs_found: 0,
            jobs_new: 0,
            sample_companies: new Set(),
          });
        }
        const g = groups.get(key);
        g.jobs_found++;
        // 'new' is the most common status for fresh URLs in scan-history.tsv
        const s = (r.status || '').toLowerCase();
        if (s === 'new' || s.startsWith('pending')) g.jobs_new++;
        if (r.company && g.sample_companies.size < 5) g.sample_companies.add(r.company);
      }
      const list = Array.from(groups.values())
        .map(g => ({
          portal: g.portal,
          date:   g.date,
          jobs_found: g.jobs_found,
          jobs_new:   g.jobs_new,
          sample_companies: Array.from(g.sample_companies),
        }))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, limit);
      return json({ ok: true, events: list, total_groups: groups.size, generated_at: new Date().toISOString() });
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
      return;
    }
  }

  // ── System health — bottom-strip click-through (2026-05-17) ──────────
  // GET /api/system-health
  // Lists launchd jobs (career-ops.*), cloudflared tunnel state, dashboard
  // server uptime, and tail of data/errors.log. Best-effort — any check
  // that fails returns null/false rather than aborting the whole payload.
  if (url === '/api/system-health') {
    try {
      let jobs = [];
      try {
        const out = _execSync('launchctl list', { encoding: 'utf-8', timeout: 4000 }).toString();
        jobs = out.split('\n')
          .filter(l => l && /career-ops|careerops/i.test(l))
          .map(l => {
            const cols = l.split(/\t+/);
            return {
              pid:    cols[0] && cols[0] !== '-' ? parseInt(cols[0], 10) : null,
              status: cols[1] && cols[1] !== '-' ? parseInt(cols[1], 10) : null,
              label:  cols[2] || '',
            };
          });
      } catch (_) { /* launchctl not present or no agent — return empty list */ }

      // Tunnel: check if cloudflared process is running.
      let tunnel = { running: false, info: '' };
      try {
        const out = _execSync('pgrep -af cloudflared', { encoding: 'utf-8', timeout: 2000 }).toString().trim();
        if (out) {
          tunnel.running = true;
          tunnel.info = out.split('\n')[0].slice(0, 240);
        }
      } catch (_) { /* not running */ }

      // Server uptime + memory rough — process.uptime() returns seconds.
      const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
      const server = {
        uptime_seconds: Math.round(process.uptime()),
        node_version:   process.version,
        pid:            process.pid,
        memory_mb:      memMB,
      };

      // Recent errors — last 20 lines of data/errors.log
      const errLogPath = join(ROOT, 'data/errors.log');
      let errors = [];
      if (existsSync(errLogPath)) {
        try {
          const txt = readFileSync(errLogPath, 'utf-8');
          const lines = txt.split('\n').filter(l => l && l.trim());
          errors = lines.slice(-20).reverse().map(l => l.slice(0, 320));
        } catch (_) {}
      }

      return json({
        ok: true,
        jobs,
        tunnel,
        server,
        errors,
        generated_at: new Date().toISOString(),
      });
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
      return;
    }
  }

  // ── All-Evaluations bucket — Feature 2 (item-list-pop-out) ───────────
  // GET /api/all-evaluations/bucket?key={bucketKey}
  // Bucket keys: score-450-up, score-400-449, score-350-399, score-300-349,
  // score-below-300, status-evaluated, status-skip, status-discarded, plus
  // additional status keys for completeness.
  if (url === '/api/all-evaluations/bucket') {
    try {
      const key = String(query.key || '').trim();
      const BUCKET_FILTERS = {
        'score-450-up':     { label: 'Score 4.5+',     test: r => r.score >= 4.5 },
        'score-400-449':    { label: 'Score 4.0-4.4',  test: r => r.score >= 4.0 && r.score < 4.5 },
        'score-350-399':    { label: 'Score 3.5-3.9',  test: r => r.score >= 3.5 && r.score < 4.0 },
        'score-300-349':    { label: 'Score 3.0-3.4',  test: r => r.score >= 3.0 && r.score < 3.5 },
        'score-below-300':  { label: 'Score <3.0',     test: r => r.score < 3.0 },
        'status-evaluated': { label: 'Status: Evaluated',
          test: r => (r.status || '').toLowerCase() === 'evaluated' },
        'status-skip':      { label: 'Status: SKIP',
          test: r => (r.status || '').toLowerCase() === 'skip' },
        'status-discarded': { label: 'Status: Discarded',
          test: r => (r.status || '').toLowerCase() === 'discarded' },
        'status-applied':   { label: 'Status: Applied',
          test: r => (r.status || '').toLowerCase() === 'applied' },
        'status-rejected':  { label: 'Status: Rejected',
          test: r => (r.status || '').toLowerCase() === 'rejected' },
        'status-interview': { label: 'Status: Interview',
          test: r => (r.status || '').toLowerCase() === 'interview' },
        'status-offer':     { label: 'Status: Offer',
          test: r => (r.status || '').toLowerCase() === 'offer' },
        'status-responded': { label: 'Status: Responded',
          test: r => (r.status || '').toLowerCase() === 'responded' },
      };
      const filter = BUCKET_FILTERS[key];
      if (!filter) {
        return json({ ok: false, error: 'unknown bucket key', valid_keys: Object.keys(BUCKET_FILTERS) }, 400);
      }
      const apps = parseApplications();
      const matched = apps.filter(filter.test);
      // Sort: highest score first, then most recent eval (highest num).
      matched.sort((a, b) => (b.score - a.score) || (b.num - a.num));
      const rows = matched.slice(0, 500)
        .map(r => ({ ...r, reportSummary: r.report ? parseReportSummary(r.report) : {} }));
      return json({
        ok: true,
        bucket: { key, label: filter.label, count: matched.length },
        items: rows,
      });
    } catch (err) {
      console.error('[bucket] error:', err);
      return json({ ok: false, error: err.message }, 500);
    }
  }

  const detailMatch = url.match(/^\/api\/detail\/(.+)$/);
  if (detailMatch) {
    const fn = DETAIL_FNS[detailMatch[1]];
    if (fn) {
      try {
        return json(fn());
      } catch (err) {
        console.error(`[detail/${detailMatch[1]}] error:`, err);
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
    }
    res.writeHead(404); res.end('Unknown category');
    return;
  }

  const reportMatch = url.match(/^\/api\/report\/(.+\.md)$/);
  if (reportMatch) {
    const summary = parseReportSummary('reports/' + reportMatch[1]);
    return json(summary);
  }

  // Share-token middleware: when ?share=<token> is on the dashboard request,
  // validate before serving the HTML. Expired → 410 Gone. Invalid → 401.
  if (url === '/' && query.share) {
    const result = lookupShareToken(query.share);
    if (result.status === 'expired') {
      res.writeHead(410, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><title>Share link expired</title><body style="font-family:system-ui;padding:40px;max-width:520px;margin:0 auto"><h1>Share link expired</h1><p>This read-only dashboard share link has expired. Ask Mitchell for a fresh link.</p></body>');
      return;
    }
    if (result.status !== 'valid') {
      res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><title>Invalid share link</title><body style="font-family:system-ui;padding:40px;max-width:520px;margin:0 auto"><h1>Invalid share link</h1><p>This share token is not recognized.</p></body>');
      return;
    }
  }

  // Static files from dashboard/
  // Normalize: /dashboard/ and /dashboard are aliases for /
  const normalUrl = (url === '/dashboard' || url === '/dashboard/') ? '/' : url;
  // Strip /dashboard prefix so bookmarks to /dashboard/... still resolve
  const strippedUrl = normalUrl.startsWith('/dashboard/') ? normalUrl.slice('/dashboard'.length) : normalUrl;
  let filePath = strippedUrl === '/' ? '/dashboard/index.html' : `/dashboard${strippedUrl}`;
  filePath = join(ROOT, filePath);
  if (!existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  if (statSync(filePath).isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
  const ext = extname(filePath);
  const headers = { 'Content-Type': MIME[ext] || 'text/plain' };
  // Default cache policy: HTML is rebuilt by build-dashboard.mjs on every change,
  // so the browser must revalidate on every load (no-cache forces ETag round-trip
  // but no full re-download when content unchanged). Without this, every UI fix
  // requires the user to hard-refresh (Cmd-Shift-R) to see new HTML/inline CSS+JS.
  // Static assets (PNG, JSON, manifest) get a 5-min cache so revisits are fast.
  if (ext === '.html' || strippedUrl === '/' || strippedUrl === '/index.html') {
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
    headers['Pragma'] = 'no-cache';
    headers['Expires'] = '0';
  } else if (url === '/manifest.json') {
    headers['Content-Type'] = 'application/manifest+json';
    headers['Cache-Control'] = 'public, max-age=300';
  } else if (url === '/service-worker.js') {
    headers['Content-Type'] = 'application/javascript';
    headers['Service-Worker-Allowed'] = '/';
    headers['Cache-Control'] = 'no-cache';
  } else {
    // Static assets (PNG, ICO, etc.) — short cache for snappy revisits.
    headers['Cache-Control'] = 'public, max-age=300';
  }
  res.writeHead(200, headers);
  res.end(readFileSync(filePath));
});

server.listen(PORT, () => {
  console.log(`Dashboard → http://localhost:${PORT}`);
});
