#!/usr/bin/env node
/**
 * opt-timeline.mjs -- OPT status calculator + H-1B cap season calendar + TTH estimation
 *
 * Usage:
 *   node opt-timeline.mjs               Print human-readable OPT status dashboard
 *   node opt-timeline.mjs --test        Run built-in test cases
 *   node opt-timeline.mjs --json        Calculate from JSON stdin (pipeline integration)
 *
 * Reads config/visa.yml for OPT settings. Copy config/visa.example.yml to get started.
 *
 * JSON stdin shape (--json mode):
 *   { optConfig?: { type, start_date, unemployment_days_used, end_date?, h1b_lottery_status? },
 *     jdText?: string, customTthDefaults?: object }
 *   If optConfig omitted, loads from config/visa.yml.
 *
 * JSON output shape:
 *   { optStatus: { type, startDate, endDate, remainingDays, expired },
 *     unemployment: { limit, used, remaining, severity },
 *     capSeason: { phase, advice, h1bLotteryStatus },
 *     tthEstimate?: { type, minDays, maxDays, warning? } }
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const VISA_CONFIG_PATH = join(ROOT, 'config', 'visa.yml');

// --- Constants ---

const OPT_DURATIONS = { regular: 12, stem: 36 }; // months
const UNEMPLOYMENT_LIMITS = { regular: 90, stem: 150 }; // days

const WARNING_THRESHOLDS = [
  { days: 60, severity: 'info' },
  { days: 30, severity: 'warning' },
  { days: 14, severity: 'urgent' }
];

const DEFAULT_TTH = {
  startup: [14, 28],
  midsize: [28, 56],
  enterprise: [56, 112]
};

// Cap season phases with approximate month boundaries (D-09, D-10, D-11)
// Pre-registration spans Oct-Feb (month >= 10 OR month <= 2)
const CAP_PHASES = [
  {
    name: 'Pre-registration',
    match: (m) => m >= 10 || m <= 2,
    advice: 'Build your employer list now. Prioritize companies with strong H-1B filing history. Employer registration opens in March.'
  },
  {
    name: 'Registration open',
    match: (m) => m === 3,
    advice: 'Registration is open -- confirm your employer has registered you. Each beneficiary gets one registration per sponsor.'
  },
  {
    name: 'Lottery results',
    match: (m) => m === 4,
    advice: 'Lottery results are being announced. If selected, your employer can file your H-1B petition. If not selected, explore cap-exempt employers (universities, nonprofits).'
  },
  {
    name: 'Filing window',
    match: (m) => m >= 5 && m <= 6,
    advice: 'Filing window is open for selected petitions. Ensure your employer files before the deadline. Start date is October 1.'
  },
  {
    name: 'Post-cap / Waiting',
    match: (m) => m >= 7 && m <= 9,
    advice: 'Cap season is over. If selected, wait for October 1 start date. If not selected, focus on cap-exempt employers or plan for next year\'s lottery.'
  }
];

// --- Minimal YAML Parser (matches visa-score.mjs pattern) ---

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function parseMinimalYaml(text) {
  const result = {};
  let currentSection = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, ''); // CRLF handling (Phase 3 fix)
    const trimmed = line.trimStart();

    // Skip comments and blank lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check indent level
    const indent = line.length - line.trimStart().length;

    // Top-level key
    if (indent === 0) {
      const topMatch = trimmed.match(/^(\w[\w_-]*):\s*(.*)$/);
      if (topMatch) {
        const [, key, val] = topMatch;
        if (UNSAFE_KEYS.has(key)) continue;
        if (val && val.trim() && !val.trim().startsWith('#')) {
          let trimVal = val.trim();
          if ((trimVal.startsWith('"') && trimVal.endsWith('"')) || (trimVal.startsWith("'") && trimVal.endsWith("'"))) {
            trimVal = trimVal.slice(1, -1);
          }
          result[key] = trimVal;
        } else {
          result[key] = {};
          currentSection = key;
        }
      }
      continue;
    }

    // Nested key (2+ spaces indent)
    if (indent >= 2 && currentSection) {
      // Array value: key: [num, num]
      const arrMatch = trimmed.match(/^(\w[\w_-]*):\s*\[([^\]]*)\]/);
      if (arrMatch) {
        const [, key, arrStr] = arrMatch;
        if (UNSAFE_KEYS.has(key)) continue;
        const vals = arrStr.split(',').map(v => {
          const n = parseInt(v.trim(), 10);
          return isNaN(n) ? v.trim() : n;
        });
        if (typeof result[currentSection] === 'object') {
          result[currentSection][key] = vals;
        }
        continue;
      }

      // Simple key: value
      const kvMatch = trimmed.match(/^(\w[\w_-]*):\s*(.+)$/);
      if (kvMatch) {
        const [, key, rawVal] = kvMatch;
        if (UNSAFE_KEYS.has(key)) continue;
        let val = rawVal.trim();
        // Strip inline comments only on unquoted values
        if (!val.startsWith('"') && !val.startsWith("'")) {
          const commentIdx = val.indexOf(' #');
          if (commentIdx > 0) val = val.substring(0, commentIdx).trim();
        }
        // Strip matched quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        // Parse numbers
        if (/^-?\d+(\.\d+)?$/.test(val)) {
          val = parseFloat(val);
        }
        if (typeof result[currentSection] === 'object') {
          result[currentSection][key] = val;
        }
        continue;
      }
    }
  }

  return result;
}

// --- Config Loading ---

function loadVisaConfig() {
  const defaults = {
    sponsorship_mode: 'info_only',
    penalties: { wont_sponsor: -0.7, unknown: -0.3 },
    opt: null,
    time_to_hire_defaults: { ...DEFAULT_TTH }
  };

  if (!existsSync(VISA_CONFIG_PATH)) {
    return defaults;
  }

  try {
    const raw = readFileSync(VISA_CONFIG_PATH, 'utf-8');
    const parsed = parseMinimalYaml(raw);

    const config = { ...defaults };

    if (parsed.sponsorship_mode && typeof parsed.sponsorship_mode === 'string') {
      config.sponsorship_mode = parsed.sponsorship_mode;
    }

    if (parsed.penalties && typeof parsed.penalties === 'object') {
      config.penalties = {
        wont_sponsor: typeof parsed.penalties.wont_sponsor === 'number' ? parsed.penalties.wont_sponsor : defaults.penalties.wont_sponsor,
        unknown: typeof parsed.penalties.unknown === 'number' ? parsed.penalties.unknown : defaults.penalties.unknown
      };
    }

    if (parsed.opt && typeof parsed.opt === 'object') {
      config.opt = parseOptConfig(parsed.opt);
    }

    if (parsed.time_to_hire_defaults && typeof parsed.time_to_hire_defaults === 'object') {
      config.time_to_hire_defaults = {};
      for (const [key, val] of Object.entries(parsed.time_to_hire_defaults)) {
        if (Array.isArray(val) && val.length === 2) {
          config.time_to_hire_defaults[key] = [
            Math.max(1, Math.round(val[0])),
            Math.max(1, Math.round(val[1]))
          ];
        }
      }
      // Fill missing with defaults
      for (const key of Object.keys(DEFAULT_TTH)) {
        if (!config.time_to_hire_defaults[key]) {
          config.time_to_hire_defaults[key] = [...DEFAULT_TTH[key]];
        }
      }
    }

    return config;
  } catch (err) {
    console.warn(`\u26A0\uFE0F  Could not parse config/visa.yml: ${err.message}`);
    return defaults;
  }
}

// --- OPT Config Parsing (OPT-01) ---

function parseOptConfig(raw) {
  const result = {};

  // Type validation
  const validTypes = ['regular', 'stem'];
  if (raw.type && validTypes.includes(raw.type)) {
    result.type = raw.type;
  } else {
    if (raw.type) {
      console.warn(`\u26A0\uFE0F  Invalid OPT type "${raw.type}", defaulting to "regular"`);
    }
    result.type = 'regular';
  }

  // Start date validation
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!raw.start_date || !dateRegex.test(String(raw.start_date))) {
    return { error: 'Missing or invalid start_date (expected YYYY-MM-DD format)' };
  }
  const parsed = new Date(raw.start_date + 'T00:00:00');
  if (isNaN(parsed.getTime())) {
    return { error: `Invalid start_date: "${raw.start_date}" is not a valid date` };
  }
  result.startDate = parsed;
  result.startDateStr = raw.start_date;

  // End date override (optional)
  if (raw.end_date && dateRegex.test(String(raw.end_date))) {
    const endParsed = new Date(raw.end_date + 'T00:00:00');
    if (!isNaN(endParsed.getTime())) {
      result.endDateOverride = endParsed;
      result.endDateOverrideStr = raw.end_date;
    }
  }

  // Unemployment days used (clamp to >= 0, per T-04-03)
  const rawDays = typeof raw.unemployment_days_used === 'number' ? raw.unemployment_days_used : 0;
  result.unemploymentDaysUsed = Math.max(0, Math.round(rawDays));

  // H-1B lottery status (optional)
  const validStatuses = ['selected', 'not_selected', 'pending'];
  if (raw.h1b_lottery_status && validStatuses.includes(raw.h1b_lottery_status)) {
    result.h1bLotteryStatus = raw.h1b_lottery_status;
  } else {
    result.h1bLotteryStatus = 'pending';
  }

  return result;
}

// --- OPT Expiration Calculation (OPT-02) ---

function calculateExpiration(startDateStr, type, endDateOverride) {
  if (endDateOverride) {
    return typeof endDateOverride === 'string'
      ? new Date(endDateOverride + 'T00:00:00')
      : new Date(endDateOverride);
  }

  const start = typeof startDateStr === 'string'
    ? new Date(startDateStr + 'T00:00:00')
    : new Date(startDateStr);

  const months = OPT_DURATIONS[type] || OPT_DURATIONS.regular;

  if (months <= 0) return new Date(start); // No duration, return start unchanged

  // Add months carefully to avoid end-of-month overflow
  const result = new Date(start);
  const targetMonth = result.getMonth() + months;
  const targetYear = result.getFullYear() + Math.floor(targetMonth / 12);
  const targetMonthMod = targetMonth % 12;

  result.setFullYear(targetYear);
  result.setMonth(targetMonthMod);

  // Handle end-of-month overflow (e.g., Jan 31 + 1 month should be Feb 28, not Mar 3)
  if (result.getMonth() !== targetMonthMod) {
    // Overflowed -- go back to last day of target month
    result.setDate(0);
  }

  return result;
}

function formatDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function daysDiff(a, b) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

// --- Unemployment Tracking (OPT-03, OPT-04) ---

function unemploymentStatus(type, daysUsed) {
  const limit = UNEMPLOYMENT_LIMITS[type] || UNEMPLOYMENT_LIMITS.regular;
  const used = Math.max(0, Math.round(daysUsed));
  const remaining = Math.max(0, limit - used);

  let severity = null;
  for (const threshold of WARNING_THRESHOLDS) {
    if (remaining <= threshold.days) {
      severity = threshold.severity;
    }
  }

  return { limit, used, remaining, severity };
}

// --- Cap Season Detection (OPT-05, OPT-06) ---

function getCapPhase(date, h1bLotteryStatus) {
  const month = date.getMonth() + 1; // 1-12

  let phase = null;
  for (const p of CAP_PHASES) {
    if (p.match(month)) {
      phase = p;
      break;
    }
  }

  if (!phase) {
    // Should never happen since phases cover all 12 months
    phase = CAP_PHASES[0]; // Default to Pre-registration
  }

  let advice = phase.advice;

  // Adjust advice based on H-1B lottery status
  if (h1bLotteryStatus === 'selected') {
    if (phase.name === 'Filing window') {
      advice = 'You were selected! Ensure your employer files the H-1B petition before the deadline. Start date is October 1.';
    } else if (phase.name === 'Post-cap / Waiting') {
      advice = 'You were selected! Your H-1B petition is pending. Wait for October 1 start date. Monitor case status on USCIS.';
    }
  } else if (h1bLotteryStatus === 'not_selected') {
    if (phase.name === 'Lottery results') {
      advice = 'You were not selected in the lottery. Focus on cap-exempt employers (universities, research institutions, nonprofits) or plan for next year.';
    } else if (phase.name === 'Filing window' || phase.name === 'Post-cap / Waiting') {
      advice = 'Not selected this cycle. Focus on cap-exempt employers (universities, research institutions, nonprofits). Next registration opens in March.';
    }
  }

  return { phase: phase.name, advice };
}

// --- Company Type Inference + TTH Estimation (OPT-07) ---

function inferCompanyType(jdText) {
  if (!jdText || typeof jdText !== 'string') return 'midsize';

  const lower = jdText.toLowerCase();

  // Startup signals
  const startupPatterns = [
    /series\s*[a-c]/i,
    /seed\s*(round|fund|stage)/i,
    /early[- ]stage/i,
    /pre[- ]series/i,
    /\b(startup|start-up)\b/i,
    /(\d{1,2})\s*employees/i,
    /small\s*team/i
  ];

  for (const pat of startupPatterns) {
    const match = lower.match(pat);
    if (match) {
      // Check employee count if captured
      if (match[1] && /^\d+$/.test(match[1]) && parseInt(match[1]) < 100) {
        return 'startup';
      } else if (!match[1] || !/^\d+$/.test(match[1])) {
        return 'startup';
      }
    }
  }

  // Enterprise signals
  const enterprisePatterns = [
    /fortune\s*500/i,
    /\bf500\b/i,
    /fortune\s*100/i,
    /(\d{4,})\+?\s*employees/i,
    /global\s*enterprise/i,
    /multinational/i,
    /publicly\s*traded/i,
    /nyse|nasdaq/i
  ];

  for (const pat of enterprisePatterns) {
    const match = lower.match(pat);
    if (match) {
      if (match[1] && /^\d+$/.test(match[1]) && parseInt(match[1]) >= 5000) {
        return 'enterprise';
      } else if (!match[1] || !/^\d+$/.test(match[1])) {
        return 'enterprise';
      }
    }
  }

  return 'midsize';
}

function estimateTTH(jdText, customDefaults) {
  const companyType = inferCompanyType(jdText);
  const defaults = customDefaults || DEFAULT_TTH;
  const range = defaults[companyType] || DEFAULT_TTH[companyType] || DEFAULT_TTH.midsize;

  return {
    type: companyType,
    minDays: range[0],
    maxDays: range[1]
  };
}

function checkTthWarning(tthEstimate, optRemainingDays) {
  if (!tthEstimate || typeof optRemainingDays !== 'number') return null;

  const { minDays, maxDays } = tthEstimate;

  if (minDays > optRemainingDays) {
    return {
      severity: 'warning',
      message: `Estimated hire: ${minDays}-${maxDays} days. Your OPT expires in ${optRemainingDays} days. This company may not complete hiring before your authorization expires.`
    };
  }

  if (maxDays > optRemainingDays) {
    return {
      severity: 'info',
      message: `Tight timeline: best case ${minDays} days, worst case ${maxDays} days. Your OPT expires in ${optRemainingDays} days. Hiring could be tight -- consider discussing timeline early.`
    };
  }

  return null;
}

// --- Dashboard Formatting ---

function formatDashboard(optConfig, optStatus, unemploymentInfo, capPhase, tthInfo) {
  const lines = [];
  lines.push('='.repeat(50));
  lines.push('  OPT STATUS DASHBOARD');
  lines.push('='.repeat(50));
  lines.push('');

  // OPT Status
  lines.push(`  OPT Type:        ${optConfig.type.toUpperCase()} (${OPT_DURATIONS[optConfig.type]} months)`);
  lines.push(`  Start Date:      ${optConfig.startDateStr}`);
  lines.push(`  Expiration:      ${formatDate(optStatus.endDate)}`);
  if (optStatus.expired) {
    lines.push(`  Status:          \u274C EXPIRED`);
  } else {
    lines.push(`  Remaining:       ${optStatus.remainingDays} days`);
  }
  lines.push('');

  // Unemployment
  lines.push('-'.repeat(40));
  lines.push('  UNEMPLOYMENT DAYS');
  lines.push('-'.repeat(40));
  lines.push(`  Used:            ${unemploymentInfo.used} / ${unemploymentInfo.limit} days`);
  lines.push(`  Remaining:       ${unemploymentInfo.remaining} days`);
  if (unemploymentInfo.severity === 'urgent') {
    lines.push(`  \u26A0\uFE0F  URGENT: Only ${unemploymentInfo.remaining} unemployment days left!`);
  } else if (unemploymentInfo.severity === 'warning') {
    lines.push(`  \u26A0\uFE0F  Warning: ${unemploymentInfo.remaining} unemployment days remaining`);
  } else if (unemploymentInfo.severity === 'info') {
    lines.push(`  \u2139\uFE0F  Note: ${unemploymentInfo.remaining} unemployment days remaining`);
  }
  lines.push('');

  // Cap Season
  lines.push('-'.repeat(40));
  lines.push('  H-1B CAP SEASON');
  lines.push('-'.repeat(40));
  lines.push(`  Current Phase:   ${capPhase.phase}`);
  lines.push(`  ${capPhase.advice}`);
  if (optConfig.h1bLotteryStatus && optConfig.h1bLotteryStatus !== 'pending') {
    lines.push(`  Lottery Status:  ${optConfig.h1bLotteryStatus.replace('_', ' ')}`);
  }
  lines.push('');

  // TTH (if available)
  if (tthInfo) {
    lines.push('-'.repeat(40));
    lines.push('  TIME-TO-HIRE DEFAULTS');
    lines.push('-'.repeat(40));
    lines.push(`  Startup:         ${DEFAULT_TTH.startup[0]}-${DEFAULT_TTH.startup[1]} days`);
    lines.push(`  Midsize:         ${DEFAULT_TTH.midsize[0]}-${DEFAULT_TTH.midsize[1]} days`);
    lines.push(`  Enterprise:      ${DEFAULT_TTH.enterprise[0]}-${DEFAULT_TTH.enterprise[1]} days`);
    lines.push('');
  }

  lines.push('='.repeat(50));
  return lines.join('\n');
}

// --- JSON Mode ---

async function runJsonMode() {
  let input;
  try {
    const stdinData = readFileSync(0, 'utf-8');
    input = JSON.parse(stdinData);
  } catch (err) {
    console.error(JSON.stringify({ error: `Invalid JSON input: ${err.message}` }));
    process.exit(1);
  }

  // Load OPT config from stdin or file
  let optConfig;
  if (input.optConfig) {
    optConfig = parseOptConfig(input.optConfig);
  } else {
    const config = loadVisaConfig();
    optConfig = config.opt;
  }

  if (!optConfig || optConfig.error) {
    console.error(JSON.stringify({ error: optConfig ? optConfig.error : 'No OPT configuration found' }));
    process.exit(1);
  }

  const now = new Date();
  const endDate = calculateExpiration(optConfig.startDateStr, optConfig.type, optConfig.endDateOverride);
  const remainingDays = daysDiff(now, endDate);

  const result = {
    optStatus: {
      type: optConfig.type,
      startDate: optConfig.startDateStr,
      endDate: formatDate(endDate),
      remainingDays: Math.max(0, remainingDays),
      expired: remainingDays < 0
    },
    unemployment: unemploymentStatus(optConfig.type, optConfig.unemploymentDaysUsed),
    capSeason: {
      ...getCapPhase(now, optConfig.h1bLotteryStatus),
      h1bLotteryStatus: optConfig.h1bLotteryStatus || 'pending'
    }
  };

  // TTH estimate (optional, only if jdText provided)
  if (input.jdText) {
    const customDefaults = input.customTthDefaults || null;
    const tth = estimateTTH(input.jdText, customDefaults);
    const warning = checkTthWarning(tth, remainingDays);
    result.tthEstimate = { ...tth };
    if (warning) {
      result.tthEstimate.warning = warning;
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

// --- Dashboard Mode ---

async function printStatus() {
  if (!existsSync(VISA_CONFIG_PATH)) {
    console.log('OPT timeline tracking is not configured.');
    console.log('');
    console.log('To activate:');
    console.log('  1. Copy config/visa.example.yml to config/visa.yml');
    console.log('  2. Fill in your OPT details (type, start_date, unemployment_days_used)');
    console.log('  3. Run this command again');
    return;
  }

  const config = loadVisaConfig();

  if (!config.opt || config.opt.error) {
    console.log('OPT section not configured or invalid in config/visa.yml');
    if (config.opt && config.opt.error) {
      console.log(`Error: ${config.opt.error}`);
    }
    console.log('');
    console.log('Add the opt: section to your config/visa.yml. See config/visa.example.yml for the template.');
    return;
  }

  const now = new Date();
  const endDate = calculateExpiration(config.opt.startDateStr, config.opt.type, config.opt.endDateOverride);
  const remainingDays = daysDiff(now, endDate);
  const unemploymentInfo = unemploymentStatus(config.opt.type, config.opt.unemploymentDaysUsed);
  const capPhase = getCapPhase(now, config.opt.h1bLotteryStatus);

  const optStatus = {
    endDate,
    remainingDays: Math.max(0, remainingDays),
    expired: remainingDays < 0
  };

  console.log(formatDashboard(config.opt, optStatus, unemploymentInfo, capPhase, true));
}

// --- Inline Tests ---

function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(name, condition) {
    if (condition) {
      passed++;
    } else {
      failed++;
      console.error(`\u274C FAIL: ${name}`);
    }
  }

  function assertEq(name, actual, expected) {
    if (actual === expected) {
      passed++;
    } else {
      failed++;
      console.error(`\u274C FAIL: ${name} -- expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  console.log('Running opt-timeline.mjs tests...\n');

  // --- OPT-01: Config parsing ---
  console.log('OPT-01: Config parsing');

  const cfg1 = parseOptConfig({ type: 'stem', start_date: '2025-06-01', unemployment_days_used: 45 });
  assertEq('parseOptConfig stem type', cfg1.type, 'stem');
  assert('parseOptConfig stem startDate', cfg1.startDate instanceof Date);
  assertEq('parseOptConfig stem unemployment', cfg1.unemploymentDaysUsed, 45);

  const cfg2 = parseOptConfig({ type: 'invalid', start_date: '2025-06-01' });
  assertEq('parseOptConfig invalid type defaults regular', cfg2.type, 'regular');

  const cfg3 = parseOptConfig({ type: 'stem', start_date: '2025-06-01', unemployment_days_used: -5 });
  assertEq('parseOptConfig negative unemployment clamps to 0', cfg3.unemploymentDaysUsed, 0);

  const cfg4 = parseOptConfig({ type: 'stem' });
  assert('parseOptConfig missing start_date returns error', cfg4.error !== undefined);

  // --- OPT-02: Expiration calculation ---
  console.log('OPT-02: Expiration calculation');

  const exp1 = calculateExpiration('2025-06-01', 'regular');
  assertEq('regular expiration', formatDate(exp1), '2026-06-01');

  const exp2 = calculateExpiration('2025-06-01', 'stem');
  assertEq('stem expiration', formatDate(exp2), '2028-06-01');

  const exp3 = calculateExpiration('2025-01-31', 'regular');
  // Jan 31 + 12 months = Jan 31 of next year
  assertEq('no month overflow jan 31', formatDate(exp3), '2026-01-31');

  const exp4 = calculateExpiration('2025-06-01', 'stem', '2028-12-31');
  assertEq('end_date override', formatDate(exp4), '2028-12-31');

  // --- OPT-03: Unemployment tracking ---
  console.log('OPT-03: Unemployment tracking');

  const ue1 = unemploymentStatus('regular', 45);
  assertEq('regular unemployment limit', ue1.limit, 90);
  assertEq('regular unemployment used', ue1.used, 45);
  assertEq('regular unemployment remaining', ue1.remaining, 45);
  assertEq('regular unemployment 45 remaining severity', ue1.severity, 'info');

  const ue2 = unemploymentStatus('stem', 100);
  assertEq('stem unemployment limit', ue2.limit, 150);
  assertEq('stem unemployment used', ue2.used, 100);
  assertEq('stem unemployment remaining', ue2.remaining, 50);
  assertEq('stem unemployment 50 remaining severity', ue2.severity, 'info');

  const ue3 = unemploymentStatus('regular', 80);
  assertEq('regular 80 used remaining', ue3.remaining, 10);
  assertEq('regular 80 used severity', ue3.severity, 'urgent');

  const ue4 = unemploymentStatus('stem', 140);
  assertEq('stem 140 used remaining', ue4.remaining, 10);
  assertEq('stem 140 used severity', ue4.severity, 'urgent');

  // --- OPT-04: Warning thresholds ---
  console.log('OPT-04: Warning thresholds');

  const wt1 = unemploymentStatus('stem', 89); // remaining = 61
  assertEq('61 remaining -> no warning', wt1.severity, null);

  const wt2 = unemploymentStatus('stem', 90); // remaining = 60
  assertEq('60 remaining -> info', wt2.severity, 'info');

  const wt3 = unemploymentStatus('stem', 120); // remaining = 30
  assertEq('30 remaining -> warning', wt3.severity, 'warning');

  const wt4 = unemploymentStatus('stem', 136); // remaining = 14
  assertEq('14 remaining -> urgent', wt4.severity, 'urgent');

  const wt5 = unemploymentStatus('stem', 150); // remaining = 0
  assertEq('0 remaining -> urgent', wt5.severity, 'urgent');

  // --- OPT-05 + OPT-06: Cap season detection ---
  console.log('OPT-05 + OPT-06: Cap season detection');

  const cp1 = getCapPhase(new Date('2026-01-15'));
  assertEq('Jan -> Pre-registration', cp1.phase, 'Pre-registration');

  const cp2 = getCapPhase(new Date('2026-03-10'));
  assertEq('Mar -> Registration open', cp2.phase, 'Registration open');

  const cp3 = getCapPhase(new Date('2026-04-15'));
  assertEq('Apr -> Lottery results', cp3.phase, 'Lottery results');

  const cp4 = getCapPhase(new Date('2026-05-15'));
  assertEq('May -> Filing window', cp4.phase, 'Filing window');

  const cp5 = getCapPhase(new Date('2026-08-01'));
  assertEq('Aug -> Post-cap', cp5.phase, 'Post-cap / Waiting');

  const cp6 = getCapPhase(new Date('2026-11-01'));
  assertEq('Nov -> Pre-registration (year-wrap)', cp6.phase, 'Pre-registration');

  // Verify advice strings exist
  assert('cap phase advice is string', typeof cp1.advice === 'string' && cp1.advice.length > 0);

  // Test lottery status adjustments
  const cp7 = getCapPhase(new Date('2026-05-15'), 'selected');
  assert('selected Filing advice mentions selected', cp7.advice.includes('selected'));

  const cp8 = getCapPhase(new Date('2026-04-15'), 'not_selected');
  assert('not_selected Lottery advice mentions cap-exempt', cp8.advice.includes('cap-exempt'));

  // --- OPT-07: TTH estimation ---
  console.log('OPT-07: TTH estimation');

  const tth1 = estimateTTH('Series A startup, 50 employees');
  assertEq('startup detection type', tth1.type, 'startup');
  assertEq('startup min', tth1.minDays, 14);
  assertEq('startup max', tth1.maxDays, 28);

  const tth2 = estimateTTH('Fortune 500 company');
  assertEq('enterprise detection type', tth2.type, 'enterprise');
  assertEq('enterprise min', tth2.minDays, 56);
  assertEq('enterprise max', tth2.maxDays, 112);

  const tth3 = estimateTTH('');
  assertEq('empty jd defaults midsize', tth3.type, 'midsize');
  assertEq('midsize min', tth3.minDays, 28);
  assertEq('midsize max', tth3.maxDays, 56);

  // TTH vs OPT warning
  const tthWarn1 = checkTthWarning({ minDays: 56, maxDays: 112 }, 45);
  assert('TTH exceeds OPT -> warning', tthWarn1 !== null && tthWarn1.severity === 'warning');

  const tthWarn2 = checkTthWarning({ minDays: 14, maxDays: 28 }, 90);
  assertEq('TTH within OPT -> null', tthWarn2, null);

  const tthWarn3 = checkTthWarning({ minDays: 14, maxDays: 100 }, 50);
  assert('TTH tight -> info', tthWarn3 !== null && tthWarn3.severity === 'info');

  // --- JSON mode shape test ---
  console.log('JSON mode: output shape');

  // We test the underlying functions since stdin is hard to test inline
  const jsonCfg = parseOptConfig({ type: 'stem', start_date: '2025-06-01', unemployment_days_used: 45 });
  assert('json config parses', !jsonCfg.error);
  const jsonEnd = calculateExpiration(jsonCfg.startDateStr, jsonCfg.type);
  assert('json expiration calculates', jsonEnd instanceof Date);
  const jsonUe = unemploymentStatus(jsonCfg.type, jsonCfg.unemploymentDaysUsed);
  assert('json unemployment has keys', 'limit' in jsonUe && 'used' in jsonUe && 'remaining' in jsonUe && 'severity' in jsonUe);
  const jsonCp = getCapPhase(new Date());
  assert('json cap phase has keys', 'phase' in jsonCp && 'advice' in jsonCp);

  // --- YAML parser test ---
  console.log('YAML parser');

  const testYaml = `
# Comment
sponsorship_mode: info_only

penalties:
  wont_sponsor: -0.7
  unknown: -0.3

opt:
  type: stem
  start_date: "2025-06-01"
  unemployment_days_used: 30
  h1b_lottery_status: pending

time_to_hire_defaults:
  startup: [14, 28]
  midsize: [28, 56]
  enterprise: [56, 112]
`;
  const parsed = parseMinimalYaml(testYaml);
  assertEq('yaml sponsorship_mode', parsed.sponsorship_mode, 'info_only');
  assertEq('yaml penalty wont_sponsor', parsed.penalties.wont_sponsor, -0.7);
  assertEq('yaml opt type', parsed.opt.type, 'stem');
  assertEq('yaml opt start_date', parsed.opt.start_date, '2025-06-01');
  assertEq('yaml opt unemployment', parsed.opt.unemployment_days_used, 30);
  assert('yaml tth startup is array', Array.isArray(parsed.time_to_hire_defaults.startup));
  assertEq('yaml tth startup[0]', parsed.time_to_hire_defaults.startup[0], 14);
  assertEq('yaml tth enterprise[1]', parsed.time_to_hire_defaults.enterprise[1], 112);

  // --- CRLF handling test ---
  console.log('CRLF handling');
  const crlfYaml = "opt:\r\n  type: stem\r\n  start_date: \"2025-06-01\"\r\n";
  const crlfParsed = parseMinimalYaml(crlfYaml);
  assertEq('crlf yaml opt type', crlfParsed.opt.type, 'stem');
  assertEq('crlf yaml opt start_date', crlfParsed.opt.start_date, '2025-06-01');

  // --- Summary ---
  console.log('');
  console.log('='.repeat(40));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(40));

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('\u2705 All tests passed');
  }
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    runTests();
    return;
  }

  if (args.includes('--json')) {
    await runJsonMode();
    return;
  }

  // Default: dashboard mode
  await printStatus();
}

main();
