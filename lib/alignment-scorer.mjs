// lib/alignment-scorer.mjs — compute 3 percentages per role for Role-at-a-glance:
//
//   1. % alignment      — how well Mitchell's profile matches the JD
//   2. % interview      — likelihood of converting Applied → Interview
//   3. % HM-noticing    — likelihood the HM/recruiter notices the application
//
// 2026-05-17 — Built per Mitchell's 5-pillar UX brief. Each percentage is
// surfaced as a horizontal bar in the drawer, with hover-tooltip explaining
// the inputs.
//
// All 3 percentages are derived from data already in the reports + tracker.
// No external API calls — pure computation. Safe to run on every dashboard
// build.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Base interview-conversion rate for AI-native cold applications.
// Empirically: out of 100 applications to AI-native targets, ~10-15% get
// at least a recruiter screen. Mitchell's calibration brief lands him at
// the high end of that range given his AI-native portfolio.
const BASE_INTERVIEW_RATE = 12;

// Count of "Strong" / "✅" / "Exceptional" requirements out of total in Block B.
function countMatchSignals(text) {
  if (!text) return { strong: 0, partial: 0, total: 0 };
  // Block B has rows like: | Requirement | CV Evidence | ✅ Strong / ⚠️ Partial / ❌ Missing |
  let strong = 0, partial = 0, total = 0;
  const blockBMatch = text.match(/##\s*(?:B\)|Block B|Bloque B)[\s\S]*?(?=\n##\s|$)/);
  if (!blockBMatch) return { strong: 0, partial: 0, total: 0 };
  const block = blockBMatch[0];
  for (const line of block.split('\n')) {
    if (!line.includes('|')) continue;
    if (/^\s*\|\s*-{3,}/.test(line)) continue;
    if (/^\s*\|\s*(?:Requirement|JD Requirement|Must|Need)/i.test(line)) continue;
    if (!/✅|⚠️|❌|Strong|Partial|Exceptional|Missing|Yes|Match/i.test(line)) continue;
    total++;
    if (/✅|Strong|Exceptional|Yes\b/i.test(line)) strong++;
    else if (/⚠️|Partial/i.test(line)) partial++;
  }
  return { strong, partial, total };
}

// Count "Strong" entries in Block C "What Fits" / competitive edge.
function countCompetitiveEdges(text) {
  if (!text) return 0;
  const match = text.match(/\*\*Competitive\s+Edges?\*\*[\s\S]*?(?=\n##|\n\*\*[A-Z])/i)
             || text.match(/##\s+(?:What\s+Fits|Competitive\s+Edge)[\s\S]*?(?=\n##|$)/i);
  if (!match) return 0;
  return (match[0].match(/^\s*[-*•]\s+/gm) || []).length;
}

// Parse final score from report header.
function parseReportScore(text) {
  const m = text.match(/\*\*Score:\*\*\s*([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

// Parse archetype from report header.
function parseReportArchetype(text) {
  const m = text.match(/\*\*Archetype:\*\*\s*(?:Tier\s+)?([A-Z]\d?)/);
  return m ? m[1] : '';
}

// Prior outcomes at same company. Returns { evaluated, applied, discarded, total }.
function priorOutcomesAtCompany(companyName, applicationsText) {
  if (!companyName || !applicationsText) return { evaluated: 0, applied: 0, discarded: 0, total: 0 };
  const target = String(companyName).toLowerCase().trim();
  let evaluated = 0, applied = 0, discarded = 0, total = 0;
  for (const line of applicationsText.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (/^\|\s*#\s*\|/.test(line)) continue;
    if (/^\|\s*-{3,}/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 6) continue;
    const [, , company, , , status] = cells;
    if (!company) continue;
    if (!company.toLowerCase().includes(target) && !target.includes(company.toLowerCase())) continue;
    total++;
    const s = status.replace(/\*/g, '').trim().toLowerCase();
    if (s.startsWith('evaluated')) evaluated++;
    else if (s.startsWith('applied') || s.startsWith('responded') || s.startsWith('interview') || s.startsWith('offer')) applied++;
    else if (s.startsWith('discarded') || s.startsWith('rejected') || s.startsWith('skip')) discarded++;
  }
  return { evaluated, applied, discarded, total };
}

// Compute % alignment — how well Mitchell's profile fits this JD.
//
// Inputs:
//   - Block B match counts (strong + partial / total)
//   - Overall report score (out of 5)
//   - Competitive edge count
//
// Formula:
//   alignment = 0.6 × (block_b_match_pct) + 0.4 × (score / 5 × 100)
//   bonus: +5% if competitiveEdge ≥ 3, +5% if score ≥ 4.5
//   capped at 100
function computeAlignment({ blockB, score, competitiveEdges }) {
  const blockBPct = blockB.total > 0
    ? ((blockB.strong + 0.5 * blockB.partial) / blockB.total) * 100
    : Math.min(100, (score / 5) * 100); // fallback to score if no Block B
  const scorePct = (score / 5) * 100;
  let alignment = 0.6 * blockBPct + 0.4 * scorePct;
  if (competitiveEdges >= 3) alignment += 5;
  if (score >= 4.5) alignment += 5;
  return Math.round(Math.min(100, Math.max(0, alignment)));
}

// Compute % interview likelihood.
//
// Inputs:
//   - Overall score (drives most signal)
//   - Archetype (A1 best — primary target; B partial; A2 adjacent)
//   - Prior outcomes at company (applied/discarded ratio)
//
// Formula:
//   interview = BASE_INTERVIEW_RATE
//             + (score - 3) × 12       (each point above 3 adds 12%)
//             + archetype_bonus        (A1 +10, B +5, A2 +3, other 0)
//             + comp_match_bonus       (+5 if base ≥ floor, -5 if below)
//             + prior_outcome_adj      (+10 if prior Applied; -10 if 100% Discarded)
//   capped at 85% (never claim certainty)
function computeInterview({ score, archetype, priorOutcomes, compMatchesFloor }) {
  let pct = BASE_INTERVIEW_RATE;
  pct += Math.max(0, (score - 3)) * 12;
  if (archetype === 'A1') pct += 10;
  else if (archetype === 'B')  pct += 5;
  else if (archetype === 'A2') pct += 3;
  if (compMatchesFloor === true) pct += 5;
  else if (compMatchesFloor === false) pct -= 5;
  if (priorOutcomes.total > 0) {
    const appliedRatio = priorOutcomes.applied / priorOutcomes.total;
    const discardRatio = priorOutcomes.discarded / priorOutcomes.total;
    if (appliedRatio >= 0.5) pct += 8;       // History of moving past screen here
    else if (discardRatio >= 0.7) pct -= 8;  // Strong negative pattern
  }
  return Math.round(Math.min(85, Math.max(2, pct)));
}

// Compute % HM-noticing likelihood — chance the hiring manager / recruiter
// actually sees and engages with Mitchell's application (vs ATS-filtered).
//
// Inputs:
//   - Overall score
//   - Competitive edge count (rare-combination markers)
//   - Has a "Mitchell-shaped" rare-combination tag in TL;DR
//   - LinkedIn network proximity (referral path strength)
//
// Formula:
//   notice = score-derived base (score × 14)
//          + competitive_edge_bonus (edges × 3, capped at 15)
//          + rare_combo_bonus (+15 if "rare combination" / "Mitchell-shaped" in tldr)
//          + referral_bonus (+15 if has high-confidence network contact)
//   capped at 95%
function computeHmNoticing({ score, competitiveEdges, hasRareCombo, hasReferralPath }) {
  let pct = score * 14;
  pct += Math.min(15, competitiveEdges * 3);
  if (hasRareCombo) pct += 15;
  if (hasReferralPath) pct += 15;
  return Math.round(Math.min(95, Math.max(2, pct)));
}

// Detect "rare combination" / "Mitchell-shaped" language in the report.
function detectRareCombo(text) {
  if (!text) return false;
  const head = text.slice(0, 6000);
  return /rare\s+combination|Mitchell-shaped|hybrid\s+(?:profile|background|builder)|unusual\s+(?:overlap|match)/i.test(head);
}

// Parse Comp from report quickly + match against Mitchell's floor of $175K.
function checkCompFloor(text) {
  if (!text) return null;
  const m = text.match(/\$\s*(\d{2,4})\s*K\s*[-–to]+\s*\$?\s*(\d{2,4})\s*K/i);
  if (!m) return null;
  const low = parseInt(m[1], 10);
  return low >= 175;
}

// Main: score one report. Returns { alignment, interview, hmNoticing, notes }.
export function scoreAlignment({ reportPath, companyName, hasReferralPath = false, applicationsText = null }) {
  const fullPath = reportPath?.startsWith('/') ? reportPath : join(ROOT, reportPath || '');
  if (!reportPath || !existsSync(fullPath)) {
    return {
      alignment: 0, interview: 0, hmNoticing: 0,
      breakdown: { error: 'report missing' },
    };
  }
  const text = readFileSync(fullPath, 'utf-8');
  const score = parseReportScore(text);
  const archetype = parseReportArchetype(text);
  const blockB = countMatchSignals(text);
  const competitiveEdges = countCompetitiveEdges(text);
  const hasRareCombo = detectRareCombo(text);
  const compMatchesFloor = checkCompFloor(text);

  // Prior outcomes (lazy-load applications.md if not provided).
  let appsText = applicationsText;
  if (!appsText) {
    const p = join(ROOT, 'data', 'applications.md');
    appsText = existsSync(p) ? readFileSync(p, 'utf-8') : '';
  }
  const priorOutcomes = priorOutcomesAtCompany(companyName, appsText);

  const alignment = computeAlignment({ blockB, score, competitiveEdges });
  const interview = computeInterview({ score, archetype, priorOutcomes, compMatchesFloor });
  const hmNoticing = computeHmNoticing({ score, competitiveEdges, hasRareCombo, hasReferralPath });

  return {
    alignment, interview, hmNoticing,
    breakdown: {
      score, archetype, blockB, competitiveEdges,
      hasRareCombo, compMatchesFloor, priorOutcomes, hasReferralPath,
    },
  };
}

// Small in-process cache so the dashboard can call this once per row.
const _cache = new Map();
export function scoreAlignmentCached(opts) {
  const k = `${opts.reportPath}|${opts.companyName}|${opts.hasReferralPath}`;
  if (_cache.has(k)) return _cache.get(k);
  const r = scoreAlignment(opts);
  _cache.set(k, r);
  return r;
}
