#!/usr/bin/env node
/**
 * rejection-latency.mjs — Post-Interview Response-Latency Signal for career-ops
 *
 * Cross-references data/active-interviews.md (interview round dates) with
 * data/applications.md (tracker status) and flags companies whose
 * post-interview silence exceeds a threshold, so slow employer processes feed
 * back into future apply/skip decisions instead of evaporating.
 *
 * A company is flagged only when BOTH hold:
 *   1. Its latest interview date in data/active-interviews.md is more than
 *      the threshold days ago, and
 *   2. Its tracker row is still in the `Interview` state — i.e. no
 *      `Responded`/`Offer`/`Rejected` transition has been recorded since.
 *      (The tracker holds the current state, so "still Interview" is the
 *      deterministic proxy for "no employer response after the interview".)
 *
 * Two tiers, never conflated:
 *   - statutory — jurisdiction-backed notification window. Ships with exactly
 *     one verified entry: CA-ON = 45 days (Ontario ESA, Working for Workers
 *     Four/Five Acts 2024 + O. Reg. 476/24, in force 2026-01-01: employers
 *     with 25+ employees must inform interviewed candidates for publicly
 *     advertised postings whether a hiring decision has been made within 45
 *     days of the last interview). Output phrases this as a fact about
 *     elapsed time ("exceeds the ... notification window"), NEVER as a legal
 *     conclusion — employer size and posting type are not verifiable from
 *     tracker data. Not legal advice.
 *   - courtesy — soft 30-day default with no legal claim attached,
 *     configurable via config/profile.yml `rejection_latency.courtesy_days`
 *     or `--courtesy-days`.
 *
 * Each flag carries a ready-to-copy data/blacklist.md row (same
 * suggestion-only bridge as modes/interview-redflag.md, #1854/#1856). This
 * script NEVER writes to data/blacklist.md, data/applications.md, or
 * data/active-interviews.md — it reads and reports, the user acts (#1742
 * opt-in guarantee).
 *
 * Jurisdiction is resolved from config/profile.yml `location.country` +
 * `location.province`/`region`/`state` (the region-aware pattern of the
 * employee-vs-contractor signal, #1630/#1631), overridable via
 * `rejection_latency.jurisdiction: CA-ON` or `--jurisdiction CA-ON`.
 *
 * Run: node rejection-latency.mjs             (JSON to stdout)
 *      node rejection-latency.mjs --summary   (human-readable table)
 *      node rejection-latency.mjs --courtesy-days 21
 *      node rejection-latency.mjs --jurisdiction CA-ON
 *      node rejection-latency.mjs --today 2026-07-17         (deterministic runs/tests)
 *      node rejection-latency.mjs --file path/to/active-interviews.md
 *      node rejection-latency.mjs --tracker path/to/applications.md
 *      node rejection-latency.mjs --self-test
 *
 * Issue #2013 — github.com/santifer/career-ops
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import yaml from 'js-yaml';

import { parseActiveInterviews } from './process-quality.mjs';
import { resolveColumns, parseTrackerRow } from './tracker-parse.mjs';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ACTIVE_INTERVIEWS_PATH = existsSync(join(CAREER_OPS, 'data/active-interviews.md'))
  ? join(CAREER_OPS, 'data/active-interviews.md')
  : join(CAREER_OPS, 'active-interviews.md');
const DEFAULT_TRACKER_PATH = existsSync(join(CAREER_OPS, 'data/applications.md'))
  ? join(CAREER_OPS, 'data/applications.md')
  : join(CAREER_OPS, 'applications.md');
const PROFILE_FILE = process.env.CAREER_OPS_PROFILE || join(CAREER_OPS, 'config/profile.yml');

export const DEFAULT_COURTESY_DAYS = 30;

// Statutory tier: jurisdiction → verified notification window. Exactly one
// verified entry ships; other jurisdictions are community-contributed WITH
// sources (same spirit as the localized market modes). Never add an entry
// without a citable statute/regulation.
export const STATUTORY_THRESHOLDS = {
  'CA-ON': {
    days: 45,
    window: 'Ontario ESA 45-day notification window',
    basis:
      'Ontario ESA — Working for Workers Four/Five Acts, 2024 + O. Reg. 476/24 ' +
      '(in force 2026-01-01): employers with 25+ employees must inform interviewed ' +
      'candidates for publicly advertised postings whether a hiring decision has ' +
      'been made within 45 days of the last interview.',
  },
};

export const DISCLAIMER =
  'Elapsed-time observation only — not legal advice. Whether a statutory ' +
  'notification rule applies to a specific employer depends on facts the ' +
  'tracker cannot verify (e.g. employer size, whether the posting was ' +
  'publicly advertised).';

// --- CLI args ---
const args = process.argv.slice(2);
const summaryMode = args.includes('--summary');
const selfTestMode = args.includes('--self-test');
const argValue = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] !== undefined ? args[idx + 1] : null;
};
const ACTIVE_INTERVIEWS_PATH = argValue('--file') || DEFAULT_ACTIVE_INTERVIEWS_PATH;
const TRACKER_PATH = argValue('--tracker') || DEFAULT_TRACKER_PATH;
const cliCourtesyDays = argValue('--courtesy-days');
const cliJurisdiction = argValue('--jurisdiction');
const cliToday = argValue('--today');

// --- Date helpers (same conventions as detect-reposts.mjs) ---
export function parseDate(dateStr) {
  const iso = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null;
  return date;
}

// Extract a YYYY-MM-DD date from a free-form Date/Time cell
// (e.g. "2026-06-01 14:00 EST" → 2026-06-01). Returns null when the cell
// contains no valid date.
export function extractDate(cell) {
  const match = String(cell || '').match(/\d{4}-\d{2}-\d{2}/);
  return match ? parseDate(match[0]) : null;
}

function daysBetween(d1, d2) {
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

// --- Company key ---
// Case-folded, punctuation-free, script-preserving (NFKC first) — the same
// normalization idea as tracker-parse.mjs's normalizeVia, applied to company
// names so "Acme Corp." in active-interviews.md matches "Acme Corp" in the
// tracker without depending on the candidate's punctuation habits.
export function companyKey(name) {
  return String(name || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

// Case-insensitive column lookup for candidate-edited markdown headers
// ("Notes" vs "notes" vs " Notes ") — same convention as process-quality.mjs.
function findColumn(row, name) {
  const key = Object.keys(row || {}).find(k => k.trim().toLowerCase() === name);
  return key ? String(row[key] ?? '') : '';
}

// --- Profile / jurisdiction resolution ---
const COUNTRY_CODES = {
  ca: 'CA', canada: 'CA',
  us: 'US', usa: 'US', 'united states': 'US', 'united states of america': 'US',
};

// Canadian provinces/territories — only CA-ON has a statutory entry today,
// but resolving all of them keeps "no statutory rule for your region yet"
// distinguishable from "region not understood".
const CA_REGION_CODES = {
  on: 'ON', ontario: 'ON',
  qc: 'QC', quebec: 'QC', 'québec': 'QC',
  bc: 'BC', 'british columbia': 'BC',
  ab: 'AB', alberta: 'AB',
  mb: 'MB', manitoba: 'MB',
  sk: 'SK', saskatchewan: 'SK',
  ns: 'NS', 'nova scotia': 'NS',
  nb: 'NB', 'new brunswick': 'NB',
  nl: 'NL', 'newfoundland and labrador': 'NL',
  pe: 'PE', 'prince edward island': 'PE',
  yt: 'YT', yukon: 'YT',
  nt: 'NT', 'northwest territories': 'NT',
  nu: 'NU', nunavut: 'NU',
};

export function loadProfile(profilePath = PROFILE_FILE) {
  if (!profilePath || !existsSync(profilePath)) return {};
  try {
    return yaml.load(readFileSync(profilePath, 'utf-8')) || {};
  } catch {
    return {};
  }
}

/**
 * Resolve a jurisdiction code like "CA-ON" from the profile.
 * Precedence: explicit `rejection_latency.jurisdiction` > `location.country`
 * + `location.province`/`region`/`state` > region suffix in
 * `identity.location` (e.g. "Toronto, ON"). Returns null when no
 * jurisdiction can be resolved — the statutory tier simply stays inactive.
 */
export function resolveJurisdiction(profile) {
  if (!profile || typeof profile !== 'object') return null;

  const explicit = profile.rejection_latency?.jurisdiction;
  if (typeof explicit === 'string' && /^[A-Za-z]{2}-[A-Za-z]{2,3}$/.test(explicit.trim())) {
    return explicit.trim().toUpperCase();
  }

  const loc = profile.location || {};
  const country = COUNTRY_CODES[String(loc.country || '').trim().toLowerCase()] || null;
  if (!country) return null;

  const rawRegion = String(loc.province ?? loc.region ?? loc.state ?? '').trim().toLowerCase();
  let region = null;
  if (rawRegion) {
    region = country === 'CA'
      ? (CA_REGION_CODES[rawRegion] || null)
      : (/^[a-z]{2}$/.test(rawRegion) ? rawRegion.toUpperCase() : null);
  }

  // Fallback: "City, XX" suffix in identity.location.
  if (!region) {
    const identityLoc = String(profile.identity?.location || '').trim();
    const suffix = identityLoc.match(/,\s*([A-Za-z]{2})\s*$/);
    if (suffix) {
      const code = suffix[1].toLowerCase();
      region = country === 'CA' ? (CA_REGION_CODES[code] || null) : code.toUpperCase();
    }
  }

  return region ? `${country}-${region}` : null;
}

// --- Tracker parsing ---
// Reads data/applications.md via the shared header-aware column mapper
// (tracker-parse.mjs) and returns rows whose current status is `Interview`
// (case-insensitive, markdown bold stripped) grouped by company key.
export function parseTrackerInterviewRows(content) {
  if (typeof content !== 'string' || !content.trim()) return new Map();
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const colmap = resolveColumns(lines);
  const byCompany = new Map();
  for (const line of lines) {
    const row = parseTrackerRow(line, colmap);
    if (!row) continue;
    const status = String(row.status || '').replace(/\*\*/g, '').trim().toLowerCase();
    if (status !== 'interview') continue;
    const key = companyKey(row.company);
    if (!key) continue;
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key).push(row);
  }
  return byCompany;
}

// --- Blacklist suggestion (suggestion-only, #1742/#1856) ---
// Mirrors data/blacklist.md's table format (templates/blacklist.example.md):
// | Company | Since | Scope | Reason |
export function buildBlacklistSuggestion(company, todayStr, reason) {
  return `| ${company} | ${todayStr} | company | ${reason} |`;
}

/**
 * Core check. Pure — no I/O, no clock reads (today is injected).
 *
 * @param {object[]} interviewRows - parsed data/active-interviews.md rows
 *   (parseActiveInterviews output: objects keyed by header cells).
 * @param {Map<string, object[]>} trackerByCompany - parseTrackerInterviewRows output.
 * @param {object} opts - { today: Date, courtesyDays: number, jurisdiction: string|null }
 * @returns {{ flags: object[], warnings: string[], companiesChecked: number }}
 */
export function computeRejectionLatency(interviewRows, trackerByCompany, opts = {}) {
  const today = opts.today instanceof Date && !Number.isNaN(opts.today.getTime())
    ? opts.today
    : new Date();
  const courtesyDays = Number.isFinite(opts.courtesyDays) && opts.courtesyDays > 0
    ? opts.courtesyDays
    : DEFAULT_COURTESY_DAYS;
  const jurisdiction = opts.jurisdiction || null;
  const statutory = jurisdiction ? STATUTORY_THRESHOLDS[jurisdiction] || null : null;

  const warnings = [];
  const rows = Array.isArray(interviewRows) ? interviewRows : [];
  const tracker = trackerByCompany instanceof Map ? trackerByCompany : new Map();

  // Latest interview date per company (case/punctuation-insensitive key).
  const byCompany = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const company = findColumn(row, 'company').trim();
    if (!company) continue;
    const key = companyKey(company);
    if (!key) continue;

    const dateCell = findColumn(row, 'date/time') || findColumn(row, 'date');
    const date = extractDate(dateCell);
    if (!date) {
      warnings.push(`Skipped a "${company}" interview row with no parseable YYYY-MM-DD date (Date/Time cell: "${String(dateCell).trim() || 'empty'}").`);
      continue;
    }

    const entry = byCompany.get(key);
    if (!entry || date > entry.lastDate) {
      byCompany.set(key, {
        company,
        role: findColumn(row, 'role').trim(),
        lastDate: date,
      });
    }
  }

  const todayStr = isoDay(today);
  const flags = [];
  for (const entry of byCompany.values()) {
    const trackerRows = tracker.get(companyKey(entry.company));
    if (!trackerRows || trackerRows.length === 0) {
      // No tracker row still in Interview state → either a response was
      // recorded (Responded/Offer/Rejected — nothing to flag) or the company
      // isn't tracked at all. Only the latter is worth a warning, but the
      // two are indistinguishable here without re-scanning all statuses —
      // stay silent rather than warn on every resolved application.
      continue;
    }

    const days = daysBetween(entry.lastDate, today);
    if (days < 0) continue; // interview is in the future

    let tier = null;
    let thresholdDays = null;
    let reason = null;
    let statutoryBasis = null;

    if (statutory && days > statutory.days) {
      tier = 'statutory';
      thresholdDays = statutory.days;
      // A fact about elapsed time — never a claim that the employer broke
      // the law (employer size / posting type are unverifiable here).
      reason = `${days} days post-interview silence exceeds the ${statutory.window}`;
      statutoryBasis = statutory.basis;
    } else if (days > courtesyDays) {
      tier = 'courtesy';
      thresholdDays = courtesyDays;
      reason = `${days} days post-interview silence exceeds the ${courtesyDays}-day courtesy threshold`;
    }

    if (!tier) continue;

    flags.push({
      company: entry.company,
      role: entry.role,
      trackerNums: trackerRows.map(r => r.num),
      lastInterviewDate: isoDay(entry.lastDate),
      daysSinceLastInterview: days,
      tier,
      thresholdDays,
      courtesyDays,
      statutoryBasis,
      reason,
      blacklistSuggestion: buildBlacklistSuggestion(entry.company, todayStr, reason),
    });
  }

  flags.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === 'statutory' ? -1 : 1;
    if (b.daysSinceLastInterview !== a.daysSinceLastInterview) {
      return b.daysSinceLastInterview - a.daysSinceLastInterview;
    }
    return a.company.localeCompare(b.company);
  });

  return { flags, warnings, companiesChecked: byCompany.size };
}

// --- File loading (CRLF normalized at read time — this repo's CRLF bug class) ---
function readNormalized(path) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf-8').replace(/\r\n/g, '\n');
}

// --- Summary mode ---
function printSummary(result, meta) {
  console.log(`\n${'='.repeat(78)}`);
  console.log('  Rejection Latency — career-ops');
  console.log(`  as of: ${meta.today} | jurisdiction: ${meta.jurisdiction || 'none resolved'} | ` +
    `statutory: ${meta.statutoryDays != null ? `${meta.statutoryDays}d` : 'n/a'} | courtesy: ${meta.courtesyDays}d`);
  console.log(`${'='.repeat(78)}\n`);

  if (result.flags.length === 0) {
    console.log('  No post-interview silence exceeded the configured thresholds.\n');
  } else {
    const header =
      '  ' +
      'Company'.padEnd(24) +
      'Last interview'.padEnd(16) +
      'Days'.padEnd(7) +
      'Tier'.padEnd(11) +
      'Threshold';
    console.log(header);
    console.log('  ' + '-'.repeat(70));
    for (const f of result.flags) {
      console.log(
        '  ' +
        (f.company || '').substring(0, 22).padEnd(24) +
        f.lastInterviewDate.padEnd(16) +
        String(f.daysSinceLastInterview).padEnd(7) +
        f.tier.padEnd(11) +
        `${f.thresholdDays}d`
      );
    }

    console.log('\n  Suggested data/blacklist.md rows (copy manually — nothing is written for you):\n');
    console.log('  | Company | Since | Scope | Reason |');
    console.log('  |---------|-------|-------|--------|');
    for (const f of result.flags) {
      console.log('  ' + f.blacklistSuggestion);
    }
  }

  for (const w of result.warnings) {
    console.log(`  ⚠ ${w}`);
  }
  console.log(`\n  Note: ${DISCLAIMER}\n`);
}

// --- Self-test ---
function runSelfTest() {
  let pass = 0;
  let fail = 0;
  const check = (cond, label) => {
    if (cond) { pass += 1; } else { fail += 1; console.error(`  FAIL: ${label}`); }
  };

  const activeMd = [
    '# Active Interviews',
    '',
    '| Company | Role | Round | Date/Time | Interviewer | Status | Notes |',
    '|---------|------|-------|-----------|-------------|--------|-------|',
    '| Acme Corp | Backend Engineer | Prescreen | 2026-04-01 | Recruiter | Done | went fine |',
    '| Acme Corp | Backend Engineer | Round 2 | 2026-05-01 14:00 EST | Panel | Done | final round |',
    '| Globex | Coordinator | Prescreen | 2026-06-10 | HM | Done | quick chat |',
    '| Initech | Analyst | Round 1 | 2026-05-20 | Panel | Done | they rejected later |',
    '| Umbrella LLC | Designer | Round 1 | not scheduled yet | HM | Pending | date TBD |',
    '| Hooli | PM | Round 1 | 2026-07-10 | Panel | Done | recent, on time |',
  ].join('\r\n'); // CRLF on purpose — parsing must normalize

  const trackerMd = [
    '# Applications Tracker',
    '',
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    '| 1 | 2026-03-20 | Acme Corp | Backend Engineer | 4.2/5 | Interview | ✅ | — | waiting since final round |',
    '| 2 | 2026-05-30 | Globex | Coordinator | 3.8/5 | Interview | ❌ | — | prescreen done |',
    '| 3 | 2026-05-01 | Initech | Analyst | 4.0/5 | Rejected | ❌ | — | form rejection |',
    '| 4 | 2026-06-25 | Hooli | PM | 4.5/5 | Interview | ✅ | — | fresh |',
  ].join('\r\n');

  const interviewRows = parseActiveInterviews(activeMd.replace(/\r\n/g, '\n'));
  const trackerByCompany = parseTrackerInterviewRows(trackerMd);
  const today = parseDate('2026-07-17');

  // -- CA-ON: statutory tier active --
  const on = computeRejectionLatency(interviewRows, trackerByCompany, {
    today, courtesyDays: 30, jurisdiction: 'CA-ON',
  });

  const acme = on.flags.find(f => f.company === 'Acme Corp');
  check(!!acme, 'Acme Corp (77 days, still Interview) is flagged under CA-ON');
  if (acme) {
    check(acme.tier === 'statutory', 'Acme Corp flag is statutory tier (77 > 45)');
    check(acme.lastInterviewDate === '2026-05-01', 'latest interview date wins (2026-05-01, not 2026-04-01)');
    check(acme.daysSinceLastInterview === 77, 'elapsed days computed from last interview to --today');
    check(acme.reason.includes('exceeds the Ontario ESA 45-day notification window'),
      'statutory phrasing is a fact about elapsed time (notification window)');
    check(!/broke the law|illegal|violat/i.test(acme.reason + (acme.statutoryBasis || '')),
      'statutory output never claims a legal violation');
    check(acme.statutoryBasis && acme.statutoryBasis.includes('O. Reg. 476/24'),
      'statutory basis cites the regulation');
    check(acme.blacklistSuggestion === '| Acme Corp | 2026-07-17 | company | ' + acme.reason + ' |',
      'blacklist suggestion row matches data/blacklist.md column format');
    check(acme.trackerNums.includes(1), 'flag carries the tracker row number(s)');
  }

  const globex = on.flags.find(f => f.company === 'Globex');
  check(!!globex, 'Globex (37 days, still Interview) is flagged under CA-ON');
  if (globex) {
    check(globex.tier === 'courtesy', 'Globex is courtesy tier (37 > 30 but <= 45)');
    check(globex.statutoryBasis === null, 'courtesy tier carries no statutory basis');
    check(globex.reason.includes('30-day courtesy threshold'), 'courtesy reason names the courtesy threshold');
  }

  check(!on.flags.some(f => f.company === 'Initech'),
    'Initech (Rejected in tracker — response recorded) is never flagged');
  check(!on.flags.some(f => f.company === 'Hooli'),
    'Hooli (7 days elapsed) is under both thresholds — not flagged');
  check(on.flags[0] && on.flags[0].tier === 'statutory', 'statutory flags sort before courtesy flags');
  check(on.warnings.some(w => w.includes('Umbrella LLC')),
    'row with unparseable date produces a warning, not a crash');
  check(on.companiesChecked === 4,
    'all 4 companies with at least one dated interview row were considered (Umbrella LLC has none)');

  // -- No jurisdiction: statutory tier inactive, courtesy still works --
  const nowhere = computeRejectionLatency(interviewRows, trackerByCompany, {
    today, courtesyDays: 30, jurisdiction: null,
  });
  const acmeNowhere = nowhere.flags.find(f => f.company === 'Acme Corp');
  check(acmeNowhere && acmeNowhere.tier === 'courtesy',
    'without a jurisdiction, Acme Corp downgrades to a courtesy-tier flag');
  check(!nowhere.flags.some(f => f.tier === 'statutory'),
    'no statutory flags without a resolved jurisdiction');

  // -- Unknown jurisdiction code: same as none (table ships CA-ON only) --
  const elsewhere = computeRejectionLatency(interviewRows, trackerByCompany, {
    today, courtesyDays: 30, jurisdiction: 'CA-BC',
  });
  check(!elsewhere.flags.some(f => f.tier === 'statutory'),
    'jurisdiction without a statutory entry (CA-BC) produces no statutory flags');

  // -- Configurable courtesy threshold --
  const strict = computeRejectionLatency(interviewRows, trackerByCompany, {
    today, courtesyDays: 5, jurisdiction: null,
  });
  check(strict.flags.some(f => f.company === 'Hooli' && f.tier === 'courtesy'),
    'lowering courtesy days flags fresher silences (Hooli at 7 days > 5)');

  // -- CRLF tracker content parses (Windows bug class) --
  check(trackerByCompany.size === 3, 'CRLF tracker content parses (3 companies still in Interview)');
  check(!trackerByCompany.has(companyKey('Initech')), 'Rejected tracker rows are excluded');

  // -- Company key normalization --
  check(companyKey('Acme Corp.') === companyKey('acme corp'), 'company match is case/punctuation-insensitive');

  // -- Jurisdiction resolution from profile shapes --
  check(resolveJurisdiction({ location: { country: 'Canada', province: 'Ontario' } }) === 'CA-ON',
    'resolves CA-ON from country + province name');
  check(resolveJurisdiction({ location: { country: 'canada', region: 'ON' } }) === 'CA-ON',
    'resolves CA-ON from lowercase country + 2-letter region');
  check(resolveJurisdiction({ location: { country: 'Canada' }, identity: { location: 'Toronto, ON' } }) === 'CA-ON',
    'falls back to the identity.location ", ON" suffix');
  check(resolveJurisdiction({ rejection_latency: { jurisdiction: 'ca-on' } }) === 'CA-ON',
    'explicit rejection_latency.jurisdiction override wins and is normalized');
  check(resolveJurisdiction({ location: { country: 'Canada' } }) === null,
    'country without a region resolves to null (statutory tier stays off)');
  check(resolveJurisdiction({}) === null, 'empty profile resolves to null');
  check(resolveJurisdiction(null) === null, 'null profile resolves to null (no crash)');

  // -- Empty / malformed inputs never crash --
  check(computeRejectionLatency([], new Map(), { today }).flags.length === 0, 'empty inputs return no flags');
  check(computeRejectionLatency(null, null, { today }).flags.length === 0, 'null inputs return no flags (no crash)');
  check(parseTrackerInterviewRows('').size === 0, 'empty tracker content returns no rows');
  check(parseTrackerInterviewRows(null).size === 0, 'non-string tracker content returns no rows (no crash)');

  console.log(`\n  rejection-latency self-test: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

// --- Run (CLI only; guarded so the module is safely importable for tests) ---
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (selfTestMode) {
    runSelfTest();
  }

  const profile = loadProfile();
  const jurisdiction = cliJurisdiction
    ? cliJurisdiction.trim().toUpperCase()
    : resolveJurisdiction(profile);
  const profileCourtesy = Number.parseInt(profile.rejection_latency?.courtesy_days, 10);
  const cliCourtesy = Number.parseInt(cliCourtesyDays, 10);
  const courtesyDays = Number.isFinite(cliCourtesy) && cliCourtesy > 0
    ? cliCourtesy
    : (Number.isFinite(profileCourtesy) && profileCourtesy > 0 ? profileCourtesy : DEFAULT_COURTESY_DAYS);
  const today = (cliToday && parseDate(cliToday)) || new Date();

  const interviewRows = parseActiveInterviews(readNormalized(ACTIVE_INTERVIEWS_PATH));
  const trackerByCompany = parseTrackerInterviewRows(readNormalized(TRACKER_PATH));

  const result = computeRejectionLatency(interviewRows, trackerByCompany, {
    today, courtesyDays, jurisdiction,
  });

  const statutoryDays = jurisdiction && STATUTORY_THRESHOLDS[jurisdiction]
    ? STATUTORY_THRESHOLDS[jurisdiction].days
    : null;
  const metadata = {
    today: isoDay(today),
    jurisdiction,
    statutoryDays,
    courtesyDays,
    interviewRows: interviewRows.length,
    companiesChecked: result.companiesChecked,
    flagged: result.flags.length,
    disclaimer: DISCLAIMER,
  };

  if (summaryMode) {
    printSummary(result, metadata);
  } else {
    console.log(JSON.stringify({
      metadata,
      flags: result.flags,
      warnings: result.warnings,
    }, null, 2));
  }
}
