#!/usr/bin/env node
/**
 * scripts/tpgm-tracker.mjs — Read-only TPgM-credibility reporting CLI.
 *
 * Operationalizes Dimensions 4 (TPgM evidence), 5 (20% / side allocation),
 * 6 (course tracking), and 10 (long-arc trajectory) of
 * `data/ingest-feature-strategy-2026-05-17.md`. Computes the
 * "PM-Bridge-Buildability" (5% weight) and "Skill-Portability" (5% weight)
 * scoring dimensions added to `modes/_profile.md` §2 per
 * `data/career-calibration-20260516-190152.md`.
 *
 * Pure reporter. NEVER mutates corpus / cv.md / config. Only reads:
 *   - data/courses.yml                  (registry from Tier B item #6)
 *   - data/skill-tracker/extracted/*.json (weekly extracts from skill-ingest)
 *
 * Usage:
 *   node scripts/tpgm-tracker.mjs                    # markdown report
 *   node scripts/tpgm-tracker.mjs --report           # same
 *   node scripts/tpgm-tracker.mjs --json             # machine-readable
 *   node scripts/tpgm-tracker.mjs --week 2026-W20    # single-week snapshot
 *
 * Exit codes:
 *   0  success (including "no data yet")
 *   1  CLI / config error
 *   2  YAML parse error
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(__filename, '../..');

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

const args = process.argv.slice(2);
function arg(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
}
function flag(name) { return args.includes(name); }

const wantJson = flag('--json');
const wantReport = flag('--report') || !wantJson; // markdown is default
const weekFilter = arg('--week');

if (weekFilter && !/^\d{4}-W\d{2}$/.test(weekFilter)) {
  console.error(`Invalid --week format: "${weekFilter}" (expected YYYY-Www, e.g. 2026-W20)`);
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* Load courses.yml                                                           */
/* -------------------------------------------------------------------------- */

const coursesPath = resolve(ROOT, 'data', 'courses.yml');
let coursesDoc = { version: 1, courses: [] };
if (existsSync(coursesPath)) {
  try {
    coursesDoc = yaml.load(readFileSync(coursesPath, 'utf8')) || coursesDoc;
  } catch (err) {
    console.error(`YAML parse error in data/courses.yml: ${err.message}`);
    process.exit(2);
  }
} else {
  // No registry yet — report runs in empty-state.
  coursesDoc = { version: 1, courses: [] };
}

const courses = Array.isArray(coursesDoc.courses) ? coursesDoc.courses : [];

/* -------------------------------------------------------------------------- */
/* Load weekly extracts                                                       */
/* -------------------------------------------------------------------------- */

const extractedDir = resolve(ROOT, 'data', 'skill-tracker', 'extracted');
let extracts = [];
if (existsSync(extractedDir)) {
  const files = readdirSync(extractedDir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    try {
      const j = JSON.parse(readFileSync(resolve(extractedDir, f), 'utf8'));
      // Tolerate either {week_iso: "..."} or {week_index: "..."} (council
      // schema variants). Fall back to filename.
      const week = j.week_iso || j.week_index || f.replace(/\.json$/, '');
      extracts.push({ week, path: f, data: j });
    } catch {
      // Skip malformed extract; the report will surface emptiness elsewhere.
    }
  }
  // Sort newest-first by ISO week string (lexicographic works for YYYY-Www).
  extracts.sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : 0));
}

if (weekFilter) {
  extracts = extracts.filter(e => e.week === weekFilter);
}

/* -------------------------------------------------------------------------- */
/* Composite scoring                                                          */
/* -------------------------------------------------------------------------- */

/**
 * TPgM-credibility composite, 0–100.
 *
 * Combines two streams of evidence:
 *   1. Completed courses, weighted by their declared pm_bridge_weight (0–10).
 *      Each completed course contributes pm_bridge_weight points.
 *   2. tpgm_evidence items from extracted weekly JSON. Each item's
 *      scoring_impact (in [-1, 1]) contributes scoring_impact * 20.
 *
 * Capped at 100. The scoring shape is intentionally simple + legible —
 * council Dimension 4 explicitly recommends starting with gemini-2.5-pro's
 * additive scheme and tuning empirically after 8+ weeks of data.
 */
function computeTpgmScore() {
  let total = 0;
  for (const c of courses) {
    if (c.status === 'completed' && typeof c.pm_bridge_weight === 'number') {
      total += c.pm_bridge_weight;
    }
  }
  for (const e of extracts) {
    const items = Array.isArray(e.data?.tpgm_evidence) ? e.data.tpgm_evidence : [];
    for (const it of items) {
      if (typeof it.scoring_impact === 'number') {
        total += it.scoring_impact * 20;
      }
    }
  }
  return Math.max(0, Math.min(100, Math.round(total)));
}

/**
 * PM-Bridge-Buildability index, 0–10. Weighted sum of:
 *   - completed courses' pm_bridge_weight (normalized)
 *   - extracted pm_bridge_evidence items' weight_for_pm_transition
 *
 * Council finding #38: PM_credibility = 0.4*TPgM + 0.3*PM-Bridge + 0.3*Portability.
 * This is the "PM-Bridge" term as a 0–10 index.
 */
function computePmBridgeIndex() {
  let sum = 0;
  let n = 0;
  for (const c of courses) {
    if (c.status === 'completed' && typeof c.pm_bridge_weight === 'number') {
      sum += c.pm_bridge_weight;
      n += 1;
    }
  }
  for (const e of extracts) {
    const items = Array.isArray(e.data?.pm_bridge_evidence) ? e.data.pm_bridge_evidence : [];
    for (const it of items) {
      if (typeof it.weight_for_pm_transition === 'number') {
        sum += it.weight_for_pm_transition * 10;
        n += 1;
      }
    }
  }
  if (n === 0) return 0;
  return Math.max(0, Math.min(10, Math.round((sum / n) * 10) / 10));
}

/**
 * Skill-Portability index per industry.
 * Returns a map { finance, health, legal, other } → number of supporting
 * evidence items + completed-course portability weight.
 *
 * Per calibration brief: finance + health + legal + "other" are the named
 * target verticals.
 */
function computeSkillPortabilityIndex() {
  const buckets = { finance: 0, health: 0, legal: 0, other: 0 };
  // Completed courses with non-zero skill_portability_weight contribute to
  // "other" (industry-agnostic baseline) unless explicitly tagged.
  for (const c of courses) {
    if (c.status === 'completed' && typeof c.skill_portability_weight === 'number') {
      buckets.other += c.skill_portability_weight;
    }
  }
  for (const e of extracts) {
    const items = Array.isArray(e.data?.skill_portability_evidence) ? e.data.skill_portability_evidence : [];
    for (const it of items) {
      const industry = String(it.target_industry || '').toLowerCase().trim();
      if (industry in buckets) buckets[industry] += 1;
      else buckets.other += 1;
    }
  }
  return buckets;
}

/**
 * Skill-gap delta: high-pm_bridge_weight courses that are still in-progress
 * or not-started. Returned sorted by descending pm_bridge_weight.
 */
function computeSkillGaps() {
  return courses
    .filter(c => (c.status === 'in-progress' || c.status === 'not-started' || c.status === 'planning')
                 && typeof c.pm_bridge_weight === 'number'
                 && c.pm_bridge_weight >= 6)
    .map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      pm_bridge_weight: c.pm_bridge_weight,
      skill_portability_weight: c.skill_portability_weight ?? 0,
    }))
    .sort((a, b) => b.pm_bridge_weight - a.pm_bridge_weight);
}

/**
 * Active courses — in-progress or planning.
 */
function listActiveCourses() {
  return courses
    .filter(c => c.status === 'in-progress' || c.status === 'planning')
    .map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      units_completed: c.units_completed ?? null,
      units_total: c.units_total ?? null,
      archetype_tag: c.archetype_tag,
      pm_bridge_weight: c.pm_bridge_weight ?? null,
    }));
}

/**
 * Latest-4-weeks evidence (or filtered week only).
 */
function latestEvidence() {
  const slice = weekFilter ? extracts : extracts.slice(0, 4);
  return slice.map(e => {
    const data = e.data || {};
    return {
      week: e.week,
      tpgm_evidence: Array.isArray(data.tpgm_evidence) ? data.tpgm_evidence.length : 0,
      pm_bridge_evidence: Array.isArray(data.pm_bridge_evidence) ? data.pm_bridge_evidence.length : 0,
      skill_portability_evidence: Array.isArray(data.skill_portability_evidence) ? data.skill_portability_evidence.length : 0,
      skills: Array.isArray(data.skills) ? data.skills.length : 0,
      courses: Array.isArray(data.courses) ? data.courses.length : 0,
      highlights: (Array.isArray(data.tpgm_evidence) ? data.tpgm_evidence : [])
        .slice(0, 3)
        .map(it => ({
          work_item: it.work_item ?? '(unspecified)',
          technical_signal: it.technical_signal ?? '',
          scoring_impact: typeof it.scoring_impact === 'number' ? it.scoring_impact : null,
        })),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Build the report payload                                                   */
/* -------------------------------------------------------------------------- */

const tpgmScore = computeTpgmScore();
const pmBridge = computePmBridgeIndex();
const portability = computeSkillPortabilityIndex();
const gaps = computeSkillGaps();
const active = listActiveCourses();
const evidence = latestEvidence();
const completedCount = courses.filter(c => c.status === 'completed').length;

// PM-credibility composite per council finding #38 (0.4/0.3/0.3 weights).
// Scaled to 0–100 for legibility.
const pmCredibility = Math.round(
  0.4 * tpgmScore +
  0.3 * (pmBridge * 10) +
  0.3 * Object.values(portability).reduce((a, b) => a + b, 0) * 5
);

const payload = {
  generated_at: new Date().toISOString(),
  week_filter: weekFilter || null,
  tpgm_credibility_score: tpgmScore,
  pm_bridge_buildability_index: pmBridge,
  skill_portability_index: portability,
  pm_credibility_composite: Math.max(0, Math.min(100, pmCredibility)),
  course_counts: {
    total: courses.length,
    completed: completedCount,
    in_progress: courses.filter(c => c.status === 'in-progress').length,
    planning: courses.filter(c => c.status === 'planning').length,
    not_started: courses.filter(c => c.status === 'not-started').length,
  },
  weekly_extract_count: extracts.length,
  active_courses: active,
  skill_gaps: gaps,
  latest_evidence: evidence,
};

/* -------------------------------------------------------------------------- */
/* Output                                                                     */
/* -------------------------------------------------------------------------- */

if (wantJson) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

// Markdown report.
const lines = [];
lines.push('# TPgM Credibility Tracker');
lines.push('');
lines.push(`*Generated:* ${payload.generated_at}`);
if (weekFilter) lines.push(`*Filtered to week:* ${weekFilter}`);
lines.push('');
lines.push('## TPgM-credibility composite');
lines.push('');
lines.push(`- **TPgM-credibility score:** ${tpgmScore}/100`);
lines.push(`- **PM-Bridge-Buildability index:** ${pmBridge}/10`);
lines.push(`- **PM-credibility composite** (0.4 TPgM + 0.3 PM-Bridge + 0.3 Portability): ${payload.pm_credibility_composite}/100`);
lines.push('');
lines.push('### Skill-portability by industry');
lines.push('');
for (const [industry, score] of Object.entries(portability)) {
  lines.push(`- **${industry}:** ${score}`);
}
lines.push('');

lines.push(`## Latest evidence (${weekFilter ? `week ${weekFilter}` : 'last 4 weeks'})`);
lines.push('');
if (evidence.length === 0) {
  lines.push('_No extracted weekly evidence yet. Run `node scripts/skill-ingest.mjs --week <YYYY-Www> --apply` to populate `data/skill-tracker/extracted/`._');
  lines.push('');
} else {
  for (const e of evidence) {
    lines.push(`### Week ${e.week}`);
    lines.push('');
    lines.push(`- TPgM evidence items: ${e.tpgm_evidence}`);
    lines.push(`- PM-Bridge evidence items: ${e.pm_bridge_evidence}`);
    lines.push(`- Skill-Portability evidence items: ${e.skill_portability_evidence}`);
    lines.push(`- Skills logged: ${e.skills}`);
    lines.push(`- Courses logged: ${e.courses}`);
    if (e.highlights.length) {
      lines.push('');
      lines.push('**Top 3 TPgM highlights:**');
      for (const h of e.highlights) {
        const impact = h.scoring_impact !== null ? ` (impact ${h.scoring_impact.toFixed(2)})` : '';
        lines.push(`- ${h.work_item} — ${h.technical_signal}${impact}`);
      }
    }
    lines.push('');
  }
}

lines.push('## Active courses');
lines.push('');
if (active.length === 0) {
  lines.push('_No active courses. Add entries to `data/courses.yml` with status `in-progress` or `planning`._');
  lines.push('');
} else {
  lines.push('| Course | Status | Archetype | PM-bridge weight | Progress |');
  lines.push('|---|---|---|---|---|');
  for (const c of active) {
    const progress = (c.units_completed != null && c.units_total != null)
      ? `${c.units_completed}/${c.units_total}`
      : (c.units_completed != null ? `${c.units_completed} units` : '—');
    lines.push(`| ${c.name} | ${c.status} | ${c.archetype_tag ?? '—'} | ${c.pm_bridge_weight ?? '—'} | ${progress} |`);
  }
  lines.push('');
}

lines.push('## Skill gaps to close');
lines.push('');
if (gaps.length === 0) {
  lines.push('_No high-leverage gaps. Either everything weighty is complete, or no high-weight courses are tracked yet._');
  lines.push('');
} else {
  lines.push('| Course | Status | PM-bridge | Portability |');
  lines.push('|---|---|---|---|');
  for (const g of gaps) {
    lines.push(`| ${g.name} | ${g.status} | ${g.pm_bridge_weight} | ${g.skill_portability_weight} |`);
  }
  lines.push('');
}

lines.push('## Course-registry summary');
lines.push('');
lines.push(`- Total tracked: ${payload.course_counts.total}`);
lines.push(`- Completed: ${payload.course_counts.completed}`);
lines.push(`- In progress: ${payload.course_counts.in_progress}`);
lines.push(`- Planning: ${payload.course_counts.planning}`);
lines.push(`- Not started: ${payload.course_counts.not_started}`);
lines.push('');
lines.push('---');
lines.push('');
lines.push('_Read-only report. Source data: `data/courses.yml`, `data/skill-tracker/extracted/*.json`._');

console.log(lines.join('\n'));
