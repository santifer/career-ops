#!/usr/bin/env node
/**
 * scripts/build-quarterly-trajectory.mjs — Quarterly career-velocity report.
 *
 * Reads the last 13 weeks of `data/skill-tracker/{YYYY-Www}.md` files plus
 * `data/applications.md` and emits:
 *   data/quarterly-trajectory-{YYYY}-Q{N}.md
 *
 * Current quarter is computed from the system clock:
 *   Q1 = Jan–Mar  Q2 = Apr–Jun  Q3 = Jul–Sep  Q4 = Oct–Dec
 *
 * Per ingest-feature-strategy finding #37.
 *
 * Usage:
 *   node scripts/build-quarterly-trajectory.mjs
 *   node scripts/build-quarterly-trajectory.mjs --dry-run    # print to stdout, no file write
 *   node scripts/build-quarterly-trajectory.mjs --quarter 2026-Q2  # explicit quarter
 *
 * Output sections:
 *   1. 13-week rolling skill growth summary
 *   2. Application velocity (apps/week trend)
 *   3. Interview conversion rate
 *   4. Top 5 skill compounding signals
 *   5. Recommended next-quarter focus
 *
 * Scheduling: launchd — Monday 07:00 PT, first day of each new month
 *   (scripts/launchd/com.mitchell.career-ops.quarterly-trajectory.plist)
 *
 * Exit codes:
 *   0  success (file written or dry-run complete)
 *   1  configuration / argument error
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(__filename, '../..');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const quarterArg = (() => {
  const i = args.indexOf('--quarter');
  return i >= 0 ? args[i + 1] : null;
})();

if (quarterArg && !/^\d{4}-Q[1-4]$/.test(quarterArg)) {
  console.error(`[quarterly-trajectory] Invalid --quarter format: "${quarterArg}" (expected YYYY-QN)`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Quarter + week helpers
// ---------------------------------------------------------------------------

/**
 * Returns the current quarter label e.g. "2026-Q2".
 */
function currentQuarterLabel(date = new Date()) {
  const month = date.getMonth() + 1; // 1-based
  const q = Math.ceil(month / 3);
  return `${date.getFullYear()}-Q${q}`;
}

/**
 * Returns the ISO week string for a Date (YYYY-Www).
 */
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Returns the 13 ISO week labels ending at (and including) today.
 */
function last13Weeks() {
  const weeks = [];
  const now = new Date();
  for (let i = 12; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i * 7);
    weeks.push(isoWeek(d));
  }
  return weeks;
}

// ---------------------------------------------------------------------------
// Skill-tracker readers
// ---------------------------------------------------------------------------

function readSkillTracker(weekIso) {
  const p = resolve(ROOT, 'data', 'skill-tracker', `${weekIso}.md`);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf-8');
}

/**
 * Extract skill entries from a weekly drop markdown.
 * Returns string[] of skill names.
 */
function extractSkillNames(md) {
  if (!md) return [];
  const skills = [];
  const lines = md.split('\n');
  // Collect ## headings inside the # Skills section
  let inSkills = false;
  for (const line of lines) {
    if (/^# Skills/i.test(line)) { inSkills = true; continue; }
    if (inSkills && /^# /.test(line) && !/^# Skills/i.test(line)) { inSkills = false; }
    if (inSkills && /^## .+/.test(line)) {
      skills.push(line.replace(/^## /, '').trim());
    }
  }
  return skills;
}

/**
 * Extract TPgM evidence bullet count from a weekly drop markdown.
 */
function extractTpgmCount(md) {
  if (!md) return 0;
  const lines = md.split('\n');
  let inTpgm = false;
  let count = 0;
  for (const line of lines) {
    if (/^# TPgM Evidence/i.test(line)) { inTpgm = true; continue; }
    if (inTpgm && /^# /.test(line)) { inTpgm = false; }
    if (inTpgm && /^- /.test(line)) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Applications tracker reader
// ---------------------------------------------------------------------------

function readApplications() {
  const p = resolve(ROOT, 'data', 'applications.md');
  if (!existsSync(p)) return [];
  const text = readFileSync(p, 'utf-8');
  const rows = [];
  for (const line of text.split('\n')) {
    // Match table rows: | # | Date | Company | Role | Score | Status | ...
    const m = line.match(/^\|\s*(\d+)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/);
    if (m) {
      rows.push({
        num: parseInt(m[1], 10),
        date: m[2].trim(),
        company: m[3].trim(),
        role: m[4].trim(),
        score: m[5].trim(),
        status: m[6].trim(),
      });
    }
  }
  return rows;
}

/**
 * Group applications by ISO week of their date field.
 * Returns Map<weekIso, Row[]>.
 */
function appsByWeek(rows) {
  const map = new Map();
  for (const row of rows) {
    const d = new Date(row.date + 'T12:00:00Z');
    if (isNaN(d.getTime())) continue;
    const w = isoWeek(d);
    if (!map.has(w)) map.set(w, []);
    map.get(w).push(row);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Velocity + conversion helpers
// ---------------------------------------------------------------------------

function applicationVelocityTable(weeks, appsByWeekMap) {
  const rows = weeks.map((w) => {
    const apps = appsByWeekMap.get(w) || [];
    const applied = apps.filter((a) => /applied|interview|offer|responded/i.test(a.status)).length;
    const evaluated = apps.filter((a) => /evaluated/i.test(a.status)).length;
    return { week: w, apps: apps.length, applied, evaluated };
  });
  const totalApps = rows.reduce((s, r) => s + r.apps, 0);
  const avgPerWeek = (totalApps / weeks.length).toFixed(1);
  const peak = rows.reduce((best, r) => (r.apps > best.apps ? r : best), rows[0] || { week: '-', apps: 0 });
  return { rows, totalApps, avgPerWeek, peak };
}

function interviewConversionRate(appsByWeekMap, weeks) {
  let applied = 0;
  let interview = 0;
  let offer = 0;
  for (const w of weeks) {
    const apps = appsByWeekMap.get(w) || [];
    for (const a of apps) {
      if (/applied|interview|offer|responded/i.test(a.status)) applied++;
      if (/interview/i.test(a.status)) interview++;
      if (/offer/i.test(a.status)) offer++;
    }
  }
  const interviewRate = applied > 0 ? ((interview / applied) * 100).toFixed(1) : 'n/a';
  const offerRate = applied > 0 ? ((offer / applied) * 100).toFixed(1) : 'n/a';
  return { applied, interview, offer, interviewRate, offerRate };
}

// ---------------------------------------------------------------------------
// Top 5 compounding skill signals
// ---------------------------------------------------------------------------

function topCompoundingSkills(weekData) {
  const freq = new Map();
  for (const { skills } of weekData) {
    for (const s of skills) {
      const key = s.toLowerCase().replace(/\s*\(.*\)/, '').trim();
      freq.set(key, (freq.get(key) || 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, weeks]) => ({ name, weeks }));
}

// ---------------------------------------------------------------------------
// Next-quarter recommendation (rule-based)
// ---------------------------------------------------------------------------

function nextQuarterFocus(compoundingSkills, interviewStats) {
  const recs = [];
  const { interviewRate, applied } = interviewStats;

  if (applied < 10) {
    recs.push('Increase application velocity — fewer than 10 applications submitted in the period. Target ≥3 applications/week to sustain pipeline density.');
  }
  if (parseFloat(interviewRate) < 15 || interviewRate === 'n/a') {
    recs.push('Interview conversion is below 15%. Review quality signals: ensure all submissions are ≥4.0/5 scored, cover letters are humanized-check green, and JD-specific tailoring is applied.');
  }
  if (compoundingSkills.length > 0) {
    const top = compoundingSkills[0];
    recs.push(`Double down on "${top.name}" — appeared in ${top.weeks} of the last 13 weeks. This is the strongest compounding signal and should anchor the next-quarter narrative and LinkedIn positioning.`);
  }
  if (compoundingSkills.length < 3) {
    recs.push('Skill breadth is narrow this quarter. Consider adding one new skill domain (language, framework, or domain knowledge) to broaden portability signals heading into next quarter.');
  }
  recs.push('Run `node scripts/build-quarterly-trajectory.mjs --quarter {NEXT}` at the start of next quarter to capture the baseline.');
  return recs;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const today = new Date();
const quarter = quarterArg || currentQuarterLabel(today);
const weeks = last13Weeks();

// Collect skill-tracker data
const weekData = weeks.map((w) => {
  const md = readSkillTracker(w);
  return {
    week: w,
    present: !!md,
    skills: extractSkillNames(md),
    tpgm: extractTpgmCount(md),
  };
});

const presentWeeks = weekData.filter((w) => w.present);
const allApps = readApplications();
const appsByWeekMap = appsByWeek(allApps);
const velocityData = applicationVelocityTable(weeks, appsByWeekMap);
const interviewStats = interviewConversionRate(appsByWeekMap, weeks);
const compoundingSkills = topCompoundingSkills(weekData);
const recs = nextQuarterFocus(compoundingSkills, interviewStats);

// ---------------------------------------------------------------------------
// Build report markdown
// ---------------------------------------------------------------------------

const generated = today.toISOString().slice(0, 10);

const velocityRows = velocityData.rows
  .map((r) => `| ${r.week} | ${r.apps} | ${r.applied} | ${r.evaluated} |`)
  .join('\n');

const compoundingTable = compoundingSkills.length > 0
  ? compoundingSkills
      .map((s, i) => `${i + 1}. **${s.name}** — active in ${s.weeks}/13 weeks`)
      .join('\n')
  : '_No skill data in range._';

const recsText = recs.map((r, i) => `${i + 1}. ${r}`).join('\n');

const report = `# Quarterly Career Trajectory — ${quarter}

**Generated:** ${generated}
**Period:** ${weeks[0]} → ${weeks[weeks.length - 1]} (13 weeks)
**Skill-tracker files found:** ${presentWeeks.length} / 13

---

## 1. 13-Week Skill Growth Summary

| Week | Total skill-tracker entries | Skills logged |
|------|----------------------------|---------------|
${weekData.map((w) => `| ${w.week} | ${w.present ? 'yes' : 'missing'} | ${w.skills.join(', ') || '—'} |`).join('\n')}

**Total unique skills logged:** ${new Set(weekData.flatMap((w) => w.skills).map((s) => s.toLowerCase())).size}

---

## 2. Application Velocity

| Week | All rows | Applied/Interview/Offer | Evaluated |
|------|----------|------------------------|-----------|
${velocityRows}

**Total rows in window:** ${velocityData.totalApps}
**Average applications/week:** ${velocityData.avgPerWeek}
**Peak week:** ${velocityData.peak.week} (${velocityData.peak.apps} rows)

---

## 3. Interview Conversion Rate

| Metric | Value |
|--------|-------|
| Applications submitted | ${interviewStats.applied} |
| Interviews entered | ${interviewStats.interview} |
| Offers received | ${interviewStats.offer} |
| Application → Interview rate | ${interviewStats.interviewRate}% |
| Application → Offer rate | ${interviewStats.offerRate}% |

---

## 4. Top 5 Skill Compounding Signals

${compoundingTable}

---

## 5. Recommended Next-Quarter Focus

${recsText}

---

_Generated by \`scripts/build-quarterly-trajectory.mjs\`._
`;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

if (dryRun) {
  console.log(report);
  console.error(`[quarterly-trajectory] --dry-run: report not written to disk.`);
  process.exit(0);
}

const outPath = resolve(ROOT, 'data', `quarterly-trajectory-${quarter}.md`);
writeFileSync(outPath, report, 'utf-8');
console.log(JSON.stringify({
  ok: true,
  quarter,
  weeks_found: presentWeeks.length,
  total_apps_in_window: velocityData.totalApps,
  avg_apps_per_week: velocityData.avgPerWeek,
  interview_rate: interviewStats.interviewRate,
  top_skills: compoundingSkills,
  output: `data/quarterly-trajectory-${quarter}.md`,
}, null, 2));
