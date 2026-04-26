#!/usr/bin/env node

/**
 * risk-assess.mjs -- Company risk assessment for F-1 visa job seekers
 *
 * Calculates a deterministic LOW/MEDIUM/HIGH risk level from weighted factors:
 * layoffs/watchlist, H-1B denial rate, funding stage, company size, petition
 * trends, and OPT timeline cross-reference.
 *
 * Usage:
 *   node risk-assess.mjs <company> [--h1b-denial-rate N] [--h1b-trend declining]
 *   echo '{"companyName":"...","h1bSummary":{...}}' | node risk-assess.mjs --stdin --json
 *   node risk-assess.mjs --test
 *
 * Risk factors (from RESEARCH.md):
 *   recentLayoffs  (weight 3): Layoffs in past 6 months
 *   olderLayoffs   (weight 1): Layoffs 6-12 months ago
 *   earlyStage     (weight 2): Seed/Series A funding stage
 *   highDenialRate (weight 2): H-1B denial rate > 20%
 *   smallCompany   (weight 1): Fewer than 50 employees
 *   decliningH1b   (weight 1): Declining H-1B petition trend
 *   tthExceedsOpt  (weight 3): Time-to-hire exceeds OPT remaining
 *
 * Thresholds: LOW: 0-2, MEDIUM: 3-5, HIGH: 6+
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const DEFAULT_WATCHLIST_PATH = join(ROOT, 'config', 'risk-watchlist.yml');

// --- Risk Factor Weights ---

const RISK_FACTORS = {
  recentLayoffs:  { weight: 3, description: 'Layoffs in past 6 months' },
  olderLayoffs:   { weight: 1, description: 'Layoffs 6-12 months ago' },
  earlyStage:     { weight: 2, description: 'Seed/Series A funding stage' },
  highDenialRate: { weight: 2, description: 'H-1B denial rate > 20%' },
  smallCompany:   { weight: 1, description: 'Fewer than 50 employees' },
  decliningH1b:   { weight: 1, description: 'Declining H-1B petition trend' },
  tthExceedsOpt:  { weight: 3, description: 'Time-to-hire exceeds OPT remaining' }
};

const RISK_THRESHOLDS = { low: 2, medium: 5 };
// LOW: 0-2, MEDIUM: 3-5, HIGH: 6+

// --- YAML Parser (duplicated per project convention) ---

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Minimal YAML parser for watchlist format (array of objects).
 * Parses indented key-value pairs under array items (- key: value).
 * Rejects prototype-pollution keys (T-05-06 mitigation).
 *
 * @param {string} text - YAML text content
 * @returns {Array<object>} Array of watchlist entry objects
 */
function parseWatchlistYaml(text) {
  const entries = [];
  let current = null;

  for (const line of text.split('\n')) {
    const trimmed = line.replace(/\r$/, '').trim();

    // Skip comments and blank lines
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // New array item: - company: "value" or - company: value
    const arrayItemMatch = trimmed.match(/^-\s+(\w+)\s*:\s*"?([^"#]*?)"?\s*(?:#.*)?$/);
    if (arrayItemMatch) {
      const key = arrayItemMatch[1];
      const value = arrayItemMatch[2].trim();
      if (UNSAFE_KEYS.has(key)) {
        console.warn(`Skipping unsafe YAML key: ${key}`);
        continue;
      }
      current = { [key]: value };
      entries.push(current);
      continue;
    }

    // Continuation key under current array item: key: "value"
    const contMatch = trimmed.match(/^(\w+)\s*:\s*"?([^"#]*?)"?\s*(?:#.*)?$/);
    if (contMatch && current) {
      const key = contMatch[1];
      const value = contMatch[2].trim();
      if (UNSAFE_KEYS.has(key)) {
        console.warn(`Skipping unsafe YAML key: ${key}`);
        continue;
      }
      current[key] = value;
    }
  }

  return entries;
}

// --- Employer Normalization (duplicated from h1b-lookup.mjs) ---

/**
 * Normalize employer name for comparison.
 *
 * @param {string} name - Employer name to normalize
 * @returns {string} Normalized name (lowercase, stripped suffixes)
 */
function normalizeEmployer(name) {
  if (!name) return '';
  let normalized = name.toLowerCase().trim();
  const suffixes = [
    ', inc.', ', inc', ', llc', ', corp.', ', corp',
    ', ltd.', ', ltd', ', llp', ', l.p.', ', na', ', n.a.', ', co.',
    ' inc.', ' inc', ' llc', ' corp.', ' corp',
    ' ltd.', ' ltd', ' llp', ' l.p.', ' na', ' n.a.', ' co.'
  ];
  for (const suffix of suffixes) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
      break;
    }
  }
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

// --- Watchlist ---

/**
 * Load risk watchlist from YAML file.
 *
 * @param {string} filePath - Path to risk-watchlist.yml
 * @returns {Array<object>} Array of watchlist entries
 */
function loadWatchlist(filePath) {
  const resolvedPath = filePath || DEFAULT_WATCHLIST_PATH;
  if (!existsSync(resolvedPath)) return [];

  try {
    const text = readFileSync(resolvedPath, 'utf-8');
    return parseWatchlistYaml(text);
  } catch {
    return [];
  }
}

/**
 * Check company against watchlist entries.
 * Classifies by event age: <6 months = recent (weight 3), 6-12 months = older (weight 1), >12 months = stale (weight 0).
 *
 * @param {string} companyName - Company name to check
 * @param {Array<object>} watchlist - Loaded watchlist entries
 * @param {Date} [now] - Current date (for testing)
 * @returns {Array<object>} Array of { factor, weight, detail } objects
 */
function checkWatchlist(companyName, watchlist, now) {
  if (!companyName || !watchlist || watchlist.length === 0) return [];

  const normalizedCompany = normalizeEmployer(companyName);
  const currentDate = now || new Date();
  const factors = [];

  for (const entry of watchlist) {
    if (!entry.company) continue;
    const normalizedEntry = normalizeEmployer(entry.company);

    if (normalizedCompany !== normalizedEntry) continue;

    // Calculate age in months
    let ageMonths = 0;
    if (entry.date) {
      const entryDate = new Date(entry.date);
      if (!isNaN(entryDate.getTime())) {
        ageMonths = (currentDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
      }
    }

    const event = entry.event || 'unknown';
    const scale = entry.scale || '';

    if (ageMonths < 6) {
      factors.push({
        factor: 'recentLayoffs',
        weight: RISK_FACTORS.recentLayoffs.weight,
        detail: `${event} ${ageMonths < 1 ? 'this month' : Math.floor(ageMonths) + ' months ago'}${scale ? ': ' + scale : ''}`
      });
    } else if (ageMonths < 12) {
      factors.push({
        factor: 'olderLayoffs',
        weight: RISK_FACTORS.olderLayoffs.weight,
        detail: `${event} ${Math.floor(ageMonths)} months ago${scale ? ': ' + scale : ''}`
      });
    } else {
      // Stale data: weight 0 but include as note
      factors.push({
        factor: 'staleEvent',
        weight: 0,
        detail: `${event} ${Math.floor(ageMonths)} months ago (stale, not scored)${scale ? ': ' + scale : ''}`
      });
    }
  }

  return factors;
}

// --- H-1B Risk Factors ---

/**
 * Check H-1B filing history for risk signals.
 *
 * @param {object} h1bSummary - { denialRate, trend, totalPetitions, approvalRate }
 * @returns {Array<object>} Array of { factor, weight, detail }
 */
function checkH1bRisk(h1bSummary) {
  if (!h1bSummary) return [];
  const factors = [];

  if (typeof h1bSummary.denialRate === 'number' && h1bSummary.denialRate > 20) {
    factors.push({
      factor: 'highDenialRate',
      weight: RISK_FACTORS.highDenialRate.weight,
      detail: `${h1bSummary.denialRate}% denial rate`
    });
  }

  if (h1bSummary.trend === 'declining') {
    factors.push({
      factor: 'decliningH1b',
      weight: RISK_FACTORS.decliningH1b.weight,
      detail: 'Declining petition trend'
    });
  }

  return factors;
}

// --- Company Risk Factors ---

/**
 * Detect company risk signals from JD text.
 *
 * @param {string} jdText - Job description text
 * @returns {Array<object>} Array of { factor, weight, detail }
 */
function checkCompanyRisk(jdText) {
  if (!jdText) return [];
  const factors = [];
  const lower = jdText.toLowerCase();

  // Early-stage startup signals
  if (/series\s*a\b|seed\s*(stage|round|funding)|pre-series|pre-revenue/i.test(lower)) {
    factors.push({
      factor: 'earlyStage',
      weight: RISK_FACTORS.earlyStage.weight,
      detail: 'Early-stage startup (Seed/Series A)'
    });
  } else if (/series\s*b\b/i.test(lower)) {
    factors.push({
      factor: 'earlyStage',
      weight: 1,
      detail: 'Growth-stage startup (Series B)'
    });
  }

  // Small company detection
  const empMatch = lower.match(/\b(\d{1,3})\+?\s*(employees|people|team members|person team)\b/i);
  if (empMatch) {
    const empCount = parseInt(empMatch[1].replace(/,/g, ''), 10);
    if (empCount < 50) {
      factors.push({
        factor: 'smallCompany',
        weight: RISK_FACTORS.smallCompany.weight,
        detail: `Small company (~${empCount} employees)`
      });
    }
  }

  return factors;
}

// --- TTH vs OPT Risk (RISK-03, D-13) ---

/**
 * Check if time-to-hire exceeds remaining OPT days.
 *
 * @param {object} optTimeline - { remainingDays, expired }
 * @param {object} tthEstimate - { type, minDays, maxDays }
 * @returns {Array<object>} Array of { factor, weight, detail }
 */
function checkTthRisk(optTimeline, tthEstimate) {
  if (!optTimeline || !tthEstimate) return [];
  if (typeof optTimeline.remainingDays !== 'number') return [];
  if (typeof tthEstimate.maxDays !== 'number') return [];

  const factors = [];

  if (tthEstimate.maxDays > optTimeline.remainingDays) {
    const gap = tthEstimate.maxDays - optTimeline.remainingDays;
    factors.push({
      factor: 'tthExceedsOpt',
      weight: RISK_FACTORS.tthExceedsOpt.weight,
      detail: `TTH (up to ${tthEstimate.maxDays}d) exceeds OPT remaining (${optTimeline.remainingDays}d) by ${gap} days`
    });
  }

  return factors;
}

// --- Main Assessment Function ---

/**
 * Assess company risk based on multiple weighted factors.
 * Returns deterministic LOW/MEDIUM/HIGH from summed weights.
 *
 * @param {object} input - { companyName, h1bSummary, jdText, optTimeline, tthEstimate, watchlist, watchlistPath }
 * @returns {object} { riskLevel, riskScore, factors, summary }
 */
function assessRisk(input = {}) {
  const {
    companyName,
    h1bSummary,
    jdText,
    optTimeline,
    tthEstimate,
    watchlist: providedWatchlist,
    watchlistPath,
    _now // for testing
  } = input;

  // Load watchlist from provided array, file, or default
  const watchlist = providedWatchlist || loadWatchlist(watchlistPath);

  // Collect all risk factors
  const factors = [
    ...checkWatchlist(companyName, watchlist, _now),
    ...checkH1bRisk(h1bSummary),
    ...checkCompanyRisk(jdText),
    ...checkTthRisk(optTimeline, tthEstimate)
  ];

  // Sum weighted scores
  const riskScore = factors.reduce((sum, f) => sum + f.weight, 0);

  // Determine risk level
  let riskLevel;
  if (riskScore <= RISK_THRESHOLDS.low) {
    riskLevel = 'LOW';
  } else if (riskScore <= RISK_THRESHOLDS.medium) {
    riskLevel = 'MEDIUM';
  } else {
    riskLevel = 'HIGH';
  }

  // Build summary
  const activeFactors = factors.filter(f => f.weight > 0);
  let summary;
  if (activeFactors.length === 0) {
    summary = 'No risk signals detected';
  } else {
    const descriptions = activeFactors.map(f => RISK_FACTORS[f.factor]?.description || f.detail);
    summary = `${riskLevel} risk (score ${riskScore}): ${descriptions.join('; ')}`;
  }

  return { riskLevel, riskScore, factors, summary };
}

// --- Human-Readable Formatting ---

function formatOutput(result) {
  const emoji = result.riskLevel === 'LOW' ? '🟢' : result.riskLevel === 'MEDIUM' ? '🟡' : '🔴';
  console.log(`\nRisk Assessment: ${emoji} ${result.riskLevel} (score: ${result.riskScore})`);
  console.log('-'.repeat(50));

  if (result.factors.length === 0) {
    console.log('  No risk signals detected');
  } else {
    for (const f of result.factors) {
      const weightStr = f.weight > 0 ? `+${f.weight}` : '  0';
      console.log(`  [${weightStr}] ${f.factor}: ${f.detail}`);
    }
  }

  console.log('\n  Summary: ' + result.summary);
}

// --- Built-in Test Suite ---

function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  PASS  ${testName}`);
      passed++;
    } else {
      console.log(`  FAIL  ${testName}`);
      failed++;
    }
  }

  console.log('\n  Risk Assessment Tests');
  console.log('  ' + '='.repeat(50));

  // Test 1: Recent layoffs (weight 3) => MEDIUM or HIGH
  {
    const now = new Date('2026-04-13');
    const result = assessRisk({
      companyName: 'TestCo',
      watchlist: [{ company: 'TestCo', date: '2026-03-01', event: 'layoffs', scale: '15% workforce' }],
      _now: now
    });
    assert(
      (result.riskLevel === 'MEDIUM' || result.riskLevel === 'HIGH') && result.riskScore >= 3,
      'Recent layoffs (< 6 months) returns MEDIUM or HIGH risk'
    );
  }

  // Test 2: High H-1B denial rate (weight 2)
  {
    const result = assessRisk({
      h1bSummary: { denialRate: 25 }
    });
    const hasFactor = result.factors.some(f => f.factor === 'highDenialRate');
    assert(hasFactor && result.riskScore >= 2,
      'H-1B denial rate > 20% adds highDenialRate factor (weight 2)');
  }

  // Test 3: Declining H-1B trend (weight 1)
  {
    const result = assessRisk({
      h1bSummary: { trend: 'declining' }
    });
    const hasFactor = result.factors.some(f => f.factor === 'decliningH1b');
    assert(hasFactor,
      'Declining H-1B petition trend adds decliningH1b factor');
  }

  // Test 4: Early-stage startup (weight 2)
  {
    const result = assessRisk({
      jdText: 'We are a Series A startup building the future of AI'
    });
    const hasFactor = result.factors.some(f => f.factor === 'earlyStage');
    assert(hasFactor && result.riskScore >= 2,
      'Series A in JD text adds earlyStage factor (weight 2)');
  }

  // Test 5: TTH exceeds OPT (weight 3)
  {
    const result = assessRisk({
      optTimeline: { remainingDays: 30 },
      tthEstimate: { maxDays: 90 }
    });
    const hasFactor = result.factors.some(f => f.factor === 'tthExceedsOpt');
    assert(hasFactor && result.riskScore >= 3,
      'TTH exceeding OPT remaining adds tthExceedsOpt factor (weight 3)');
  }

  // Test 6: No risk factors => LOW (score 0)
  {
    const result = assessRisk({});
    assert(result.riskLevel === 'LOW' && result.riskScore === 0,
      'No risk factors returns LOW (score 0)');
  }

  // Test 7: Old layoffs (>12 months) get weight 0
  {
    const now = new Date('2026-04-13');
    const result = assessRisk({
      companyName: 'OldCo',
      watchlist: [{ company: 'OldCo', date: '2024-06-01', event: 'layoffs' }],
      _now: now
    });
    const stale = result.factors.find(f => f.factor === 'staleEvent');
    assert(stale && stale.weight === 0 && result.riskScore === 0,
      'Layoffs > 12 months old get weight 0 (stale data)');
  }

  // Test 8: Determinism -- same inputs produce same output
  {
    const input = {
      companyName: 'DetCo',
      h1bSummary: { denialRate: 30, trend: 'declining' },
      jdText: 'Series A startup with 20 employees',
      watchlist: []
    };
    const r1 = assessRisk(input);
    const r2 = assessRisk(input);
    assert(
      r1.riskLevel === r2.riskLevel && r1.riskScore === r2.riskScore,
      'Deterministic: same inputs always produce same riskLevel and score'
    );
  }

  // Test 9: YAML parser rejects __proto__ keys
  {
    assert(UNSAFE_KEYS.has('__proto__') && UNSAFE_KEYS.has('constructor') && UNSAFE_KEYS.has('prototype'),
      'UNSAFE_KEYS set rejects __proto__, constructor, prototype');
  }

  // Test 10: Combined factors produce correct HIGH risk
  {
    const now = new Date('2026-04-13');
    const result = assessRisk({
      companyName: 'RiskyCo',
      h1bSummary: { denialRate: 25 },
      watchlist: [{ company: 'RiskyCo', date: '2026-02-01', event: 'layoffs' }],
      optTimeline: { remainingDays: 30 },
      tthEstimate: { maxDays: 90 },
      _now: now
    });
    // recentLayoffs(3) + highDenialRate(2) + tthExceedsOpt(3) = 8 => HIGH
    assert(result.riskLevel === 'HIGH' && result.riskScore >= 8,
      'Combined factors (layoffs+denial+TTH) produce HIGH risk (score >= 8)');
  }

  // Test 11: Older layoffs (6-12 months) get weight 1
  {
    const now = new Date('2026-04-13');
    const result = assessRisk({
      companyName: 'MidCo',
      watchlist: [{ company: 'MidCo', date: '2025-08-01', event: 'layoffs' }],
      _now: now
    });
    const older = result.factors.find(f => f.factor === 'olderLayoffs');
    assert(older && older.weight === 1,
      'Layoffs 6-12 months old get weight 1 (olderLayoffs)');
  }

  // Test 12: Small company detection
  {
    const result = assessRisk({
      jdText: 'Join our team of 30 employees building great products'
    });
    const hasFactor = result.factors.some(f => f.factor === 'smallCompany');
    assert(hasFactor,
      'JD text with < 50 employees adds smallCompany factor');
  }

  // Test 13: watchlist case-insensitive match
  {
    const now = new Date('2026-04-13');
    const result = assessRisk({
      companyName: 'TESTCORP',
      watchlist: [{ company: 'testcorp', date: '2026-03-15', event: 'layoffs' }],
      _now: now
    });
    assert(result.factors.length > 0 && result.factors[0].weight === 3,
      'Watchlist matching is case-insensitive');
  }

  // Test 14: TTH within OPT remaining produces no factor
  {
    const result = assessRisk({
      optTimeline: { remainingDays: 120 },
      tthEstimate: { maxDays: 60 }
    });
    const hasFactor = result.factors.some(f => f.factor === 'tthExceedsOpt');
    assert(!hasFactor,
      'TTH within OPT remaining does not add tthExceedsOpt factor');
  }

  // Test 15: H-1B denial rate at 20% does NOT trigger (must be > 20)
  {
    const result = assessRisk({
      h1bSummary: { denialRate: 20 }
    });
    const hasFactor = result.factors.some(f => f.factor === 'highDenialRate');
    assert(!hasFactor,
      'H-1B denial rate at 20% exactly does not trigger (threshold is > 20)');
  }

  console.log('\n  ' + '-'.repeat(50));
  console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);

  if (failed > 0) {
    process.exit(1);
  }
}

// --- Stdin Pipeline Mode ---

async function handleStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch (e) {
    console.error(JSON.stringify({ error: 'invalid_json', message: e.message }));
    process.exit(1);
  }
  const result = assessRisk(input);
  console.log(JSON.stringify(result, null, 2));
}

// --- CLI Entry Point ---

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    runTests();
    return;
  }

  if (args.includes('--stdin')) {
    await handleStdin();
    return;
  }

  const jsonOutput = args.includes('--json');
  const positional = args.filter(a => !a.startsWith('--'));

  if (positional.length < 1) {
    console.log('Usage: node risk-assess.mjs <company> [--h1b-denial-rate N] [--h1b-trend declining] [--json]');
    console.log('       echo \'{"companyName":"..."}\' | node risk-assess.mjs --stdin --json');
    console.log('       node risk-assess.mjs --test');
    process.exit(0);
  }

  const companyName = positional[0];
  const denialRateIdx = args.indexOf('--h1b-denial-rate');
  const trendIdx = args.indexOf('--h1b-trend');

  const input = { companyName };
  if (denialRateIdx >= 0 && args[denialRateIdx + 1]) {
    input.h1bSummary = input.h1bSummary || {};
    input.h1bSummary.denialRate = parseFloat(args[denialRateIdx + 1]);
  }
  if (trendIdx >= 0 && args[trendIdx + 1]) {
    input.h1bSummary = input.h1bSummary || {};
    input.h1bSummary.trend = args[trendIdx + 1];
  }

  const result = assessRisk(input);

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    formatOutput(result);
  }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
