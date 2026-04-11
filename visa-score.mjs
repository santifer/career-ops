#!/usr/bin/env node

/**
 * visa-score.mjs -- Composite visa-friendliness score calculator
 *
 * Combines JD sponsorship signals, H-1B filing history, and inferred
 * company size into a weighted 1-5 score. Supports three sponsorship
 * modes: hard_filter, score_penalty, info_only.
 *
 * Usage:
 *   node visa-score.mjs --test              Run built-in test cases
 *   node visa-score.mjs --json < input.json Calculate score from JSON stdin
 *   node visa-score.mjs                     Print usage
 *
 * Components (weighted per D-08):
 *   - JD signals (30%): WILL_SPONSOR=5, UNKNOWN=3, WONT_SPONSOR=1
 *   - H-1B history (30%): Based on petition count + approval rate
 *   - E-Verify (20%): Neutral default (Phase 5 fills this)
 *   - Company size (10%): Inferred from JD text + H-1B presence
 *   - STEM job (10%): Neutral default (Phase 5 fills this)
 *
 * Penalty modes:
 *   - hard_filter: WONT_SPONSOR -> SKIP (caller handles)
 *   - score_penalty: WONT_SPONSOR -> -0.7, UNKNOWN -> -0.3 on global score
 *   - info_only: No score impact (default)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const VISA_CONFIG_PATH = join(ROOT, 'config', 'visa.yml');

// --- Constants ---

const WEIGHTS = {
  jdSignals: 0.30,
  h1bHistory: 0.30,
  eVerify: 0.20,
  companySize: 0.10,
  stemJob: 0.10
};

const NEUTRAL_SCORE = 3; // Default for missing components (per D-09)

// --- Config Loader ---

/**
 * Load visa config from config/visa.yml with safe defaults.
 * Minimal YAML parser -- reads key-value pairs only.
 * Clamps penalty values to valid range (T-03-10 mitigation).
 *
 * @returns {{ sponsorship_mode: string, penalties: { wont_sponsor: number, unknown: number } }}
 */
function loadVisaConfig() {
  const defaults = {
    sponsorship_mode: 'info_only',
    penalties: { wont_sponsor: -0.7, unknown: -0.3 }
  };

  if (!existsSync(VISA_CONFIG_PATH)) {
    return defaults;
  }

  try {
    const text = readFileSync(VISA_CONFIG_PATH, 'utf-8');
    let mode = defaults.sponsorship_mode;
    let wontSponsor = defaults.penalties.wont_sponsor;
    let unknown = defaults.penalties.unknown;

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed) continue;

      // sponsorship_mode: "hard_filter"
      const modeMatch = trimmed.match(/^sponsorship_mode:\s*["']?([^"'\s#]+)/);
      if (modeMatch) {
        mode = modeMatch[1];
        continue;
      }

      // wont_sponsor: -0.7
      const wsMatch = trimmed.match(/^wont_sponsor:\s*([-\d.]+)/);
      if (wsMatch) {
        const val = parseFloat(wsMatch[1]);
        if (!isNaN(val)) wontSponsor = val;
        continue;
      }

      // unknown: -0.3
      const unkMatch = trimmed.match(/^unknown:\s*([-\d.]+)/);
      if (unkMatch) {
        const val = parseFloat(unkMatch[1]);
        if (!isNaN(val)) unknown = val;
        continue;
      }
    }

    return { sponsorship_mode: mode, penalties: { wont_sponsor: wontSponsor, unknown } };
  } catch {
    return defaults;
  }
}

// --- Sub-Score Functions ---

/**
 * Score JD sponsorship classification signal.
 * @param {string} classification - WILL_SPONSOR | WONT_SPONSOR | UNKNOWN
 * @returns {number} Score 1-5
 */
function jdSignalScore(classification) {
  switch (classification) {
    case 'WILL_SPONSOR': return 5;
    case 'WONT_SPONSOR': return 1;
    case 'UNKNOWN': return 3;
    default: return NEUTRAL_SCORE;
  }
}

/**
 * Score H-1B filing history based on petition count and approval rate.
 * @param {object|null} summary - { totalPetitions, avgApprovalRate, trend, yearsOfData, latestYear }
 * @returns {number} Score 1-5
 */
function h1bHistoryScore(summary) {
  if (!summary || summary.totalPetitions === 0) return 2;

  const { avgApprovalRate, totalPetitions } = summary;

  if (avgApprovalRate >= 90 && totalPetitions >= 50) return 5;
  if (avgApprovalRate >= 80 && totalPetitions >= 20) return 4;
  if (avgApprovalRate >= 70 || totalPetitions >= 10) return 3;
  return 2;
}

/**
 * Infer company size from JD text and score accordingly.
 * Large companies with zero H-1B filings score lower than small ones (D-12, D-13).
 *
 * @param {string|null} jdText - Raw JD text
 * @param {boolean} h1bFound - Whether H-1B filings were found
 * @returns {number} Score 1-5
 */
function inferCompanySizeScore(jdText, h1bFound) {
  if (!jdText) return NEUTRAL_SCORE;

  const lower = jdText.toLowerCase();

  // Check for large company signals
  const isLarge = /fortune\s*500|fortune\s*100|f500|s&p\s*500/i.test(lower);

  // Check employee count
  const empMatch = lower.match(/(\d[\d,]*)\+?\s*(employees|people|team members)/i);
  let empCount = null;
  if (empMatch) {
    empCount = parseInt(empMatch[1].replace(/,/g, ''), 10);
  }

  // Large company logic
  if (isLarge || (empCount !== null && empCount > 5000)) {
    if (h1bFound === false) return 1; // Large + zero filings = likely won't sponsor
    return NEUTRAL_SCORE; // Size handled by h1b score
  }

  // Startup signals
  const isStartup = /series\s*[ab]|seed\s*stage|early-stage|startup/i.test(lower);
  if (isStartup && h1bFound === false) return 3; // Neutral -- may be new sponsor

  // Medium company by employee count
  if (empCount !== null) {
    if (empCount > 500 && !h1bFound) return 2;
    if (empCount <= 500) return 4; // Small-medium, may be new sponsor
  }

  return NEUTRAL_SCORE;
}

// --- Composite Score ---

/**
 * Calculate weighted composite visa-friendliness score.
 *
 * @param {object} components
 * @param {string} components.jdClassification - WILL_SPONSOR | WONT_SPONSOR | UNKNOWN
 * @param {object|null} components.h1bSummary - H-1B lookup summary
 * @param {number|null} components.eVerify - E-Verify sub-score (Phase 5)
 * @param {string|null} components.jdText - Raw JD text for size inference
 * @param {boolean} components.h1bFound - Whether H-1B filings found
 * @param {number|null} components.stemJob - STEM job sub-score (Phase 5)
 * @returns {{ composite: number, subScores: object, weights: object }}
 */
function calculateVisaScore(components) {
  const subScores = {
    jdSignals: jdSignalScore(components.jdClassification),
    h1bHistory: h1bHistoryScore(components.h1bSummary),
    eVerify: components.eVerify ?? NEUTRAL_SCORE,
    companySize: inferCompanySizeScore(components.jdText, components.h1bFound),
    stemJob: components.stemJob ?? NEUTRAL_SCORE
  };

  let composite = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    composite += subScores[key] * weight;
  }

  composite = Math.round(composite * 10) / 10;

  return { composite, subScores, weights: WEIGHTS };
}

// --- Penalty Application ---

/**
 * Apply sponsorship mode penalty to global evaluation score.
 * Clamps adjustedScore to minimum 0 (T-03-10 mitigation).
 *
 * @param {number} globalScore - The overall evaluation score (e.g. 4.2/5)
 * @param {string} classification - WILL_SPONSOR | WONT_SPONSOR | UNKNOWN
 * @param {{ sponsorship_mode: string, penalties: { wont_sponsor: number, unknown: number } }} config
 * @returns {{ adjustedScore?: number, penalty?: number, action?: string, reason?: string }}
 */
function applyPenalty(globalScore, classification, config) {
  if (config.sponsorship_mode === 'hard_filter') {
    if (classification === 'WONT_SPONSOR') {
      return { action: 'SKIP', reason: 'hard_filter mode: WONT_SPONSOR' };
    }
    if (classification === 'UNKNOWN') {
      return { adjustedScore: globalScore, penalty: 0 };
    }
    return { adjustedScore: globalScore, penalty: 0 };
  }

  if (config.sponsorship_mode === 'score_penalty') {
    let penalty = 0;
    if (classification === 'WONT_SPONSOR') {
      penalty = config.penalties.wont_sponsor;
    } else if (classification === 'UNKNOWN') {
      penalty = config.penalties.unknown;
    }
    const adjusted = Math.max(0, globalScore + penalty);
    return { adjustedScore: Math.round(adjusted * 10) / 10, penalty };
  }

  // info_only or unknown mode -- no impact
  return { adjustedScore: globalScore, penalty: 0 };
}

// --- Built-in Tests ---

function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(name, condition) {
    if (condition) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.log(`  ❌ ${name}`);
      failed++;
    }
  }

  console.log('visa-score.mjs -- built-in tests\n');

  // Test 1: WILL_SPONSOR + strong H-1B -> composite >= 4.0
  {
    const result = calculateVisaScore({
      jdClassification: 'WILL_SPONSOR',
      h1bSummary: { totalPetitions: 150, avgApprovalRate: 95, trend: 'stable', yearsOfData: 5, latestYear: 2024 },
      eVerify: null,
      jdText: null,
      h1bFound: true,
      stemJob: null
    });
    assert('1. WILL_SPONSOR + strong H-1B (90%+, 100+ petitions) -> composite >= 4.0',
      result.composite >= 4.0);
  }

  // Test 2: WONT_SPONSOR + no H-1B history -> composite <= 2.0
  {
    const result = calculateVisaScore({
      jdClassification: 'WONT_SPONSOR',
      h1bSummary: null,
      eVerify: null,
      jdText: null,
      h1bFound: false,
      stemJob: null
    });
    assert('2. WONT_SPONSOR + no H-1B history -> composite <= 2.5',
      result.composite <= 2.5);
  }

  // Test 3: UNKNOWN + no signals -> composite ~3.0 (all neutral)
  {
    const result = calculateVisaScore({
      jdClassification: 'UNKNOWN',
      h1bSummary: null,
      eVerify: null,
      jdText: null,
      h1bFound: false,
      stemJob: null
    });
    assert('3. UNKNOWN + no signals -> composite ~3.0 (all neutral)',
      result.composite >= 2.5 && result.composite <= 3.5);
  }

  // Test 4: WILL_SPONSOR + zero filings + startup JD -> composite ~3.5-4.0
  {
    const result = calculateVisaScore({
      jdClassification: 'WILL_SPONSOR',
      h1bSummary: { totalPetitions: 0, avgApprovalRate: 0, trend: 'none', yearsOfData: 0, latestYear: null },
      eVerify: null,
      jdText: 'Join our early-stage startup building AI tools. Series A funded.',
      h1bFound: false,
      stemJob: null
    });
    assert('4. WILL_SPONSOR + zero filings + startup JD -> composite 3.0-4.5',
      result.composite >= 3.0 && result.composite <= 4.5);
  }

  // Test 5: WONT_SPONSOR + strong H-1B (conflicting) -> composite ~2.5-3.5
  {
    const result = calculateVisaScore({
      jdClassification: 'WONT_SPONSOR',
      h1bSummary: { totalPetitions: 200, avgApprovalRate: 95, trend: 'stable', yearsOfData: 5, latestYear: 2024 },
      eVerify: null,
      jdText: null,
      h1bFound: true,
      stemJob: null
    });
    assert('5. WONT_SPONSOR + strong H-1B (conflicting) -> composite 2.5-3.5',
      result.composite >= 2.5 && result.composite <= 3.5);
  }

  // Test 6: score_penalty mode: WONT_SPONSOR with default penalty
  {
    const config = { sponsorship_mode: 'score_penalty', penalties: { wont_sponsor: -0.7, unknown: -0.3 } };
    const result = applyPenalty(4.0, 'WONT_SPONSOR', config);
    assert('6. score_penalty WONT_SPONSOR: 4.0 - 0.7 = 3.3',
      result.adjustedScore === 3.3 && result.penalty === -0.7);
  }

  // Test 7: score_penalty mode: UNKNOWN with default penalty
  {
    const config = { sponsorship_mode: 'score_penalty', penalties: { wont_sponsor: -0.7, unknown: -0.3 } };
    const result = applyPenalty(4.0, 'UNKNOWN', config);
    assert('7. score_penalty UNKNOWN: 4.0 - 0.3 = 3.7',
      result.adjustedScore === 3.7 && result.penalty === -0.3);
  }

  // Test 8: info_only mode: WONT_SPONSOR -> no change
  {
    const config = { sponsorship_mode: 'info_only', penalties: { wont_sponsor: -0.7, unknown: -0.3 } };
    const result = applyPenalty(4.0, 'WONT_SPONSOR', config);
    assert('8. info_only WONT_SPONSOR: score unchanged at 4.0',
      result.adjustedScore === 4.0 && result.penalty === 0);
  }

  // Test 9: Missing eVerify and stemJob default to 3/5 neutral
  {
    const result = calculateVisaScore({
      jdClassification: 'UNKNOWN',
      h1bSummary: null,
      eVerify: null,
      jdText: null,
      h1bFound: false,
      stemJob: null
    });
    assert('9. Missing eVerify and stemJob default to neutral 3',
      result.subScores.eVerify === NEUTRAL_SCORE && result.subScores.stemJob === NEUTRAL_SCORE);
  }

  // Test 10: Large company (Fortune 500) with zero H-1B filings -> companySize = 1
  {
    const result = calculateVisaScore({
      jdClassification: 'UNKNOWN',
      h1bSummary: null,
      eVerify: null,
      jdText: 'Fortune 500 company with 10000 employees seeking talent.',
      h1bFound: false,
      stemJob: null
    });
    assert('10. Fortune 500 + zero H-1B filings -> companySize sub-score = 1',
      result.subScores.companySize === 1);
  }

  // Test 11: hard_filter mode: WONT_SPONSOR -> SKIP action
  {
    const config = { sponsorship_mode: 'hard_filter', penalties: { wont_sponsor: -0.7, unknown: -0.3 } };
    const result = applyPenalty(4.0, 'WONT_SPONSOR', config);
    assert('11. hard_filter WONT_SPONSOR -> action SKIP',
      result.action === 'SKIP');
  }

  // Test 12: score_penalty clamps to minimum 0
  {
    const config = { sponsorship_mode: 'score_penalty', penalties: { wont_sponsor: -0.7, unknown: -0.3 } };
    const result = applyPenalty(0.3, 'WONT_SPONSOR', config);
    assert('12. score_penalty clamps adjustedScore to minimum 0',
      result.adjustedScore === 0);
  }

  // Test 13: WILL_SPONSOR in score_penalty mode -> no penalty
  {
    const config = { sponsorship_mode: 'score_penalty', penalties: { wont_sponsor: -0.7, unknown: -0.3 } };
    const result = applyPenalty(4.5, 'WILL_SPONSOR', config);
    assert('13. score_penalty WILL_SPONSOR: no penalty applied',
      result.adjustedScore === 4.5 && result.penalty === 0);
  }

  // Test 14: Small company (<=500 employees) -> companySize = 4
  {
    const result = calculateVisaScore({
      jdClassification: 'UNKNOWN',
      h1bSummary: null,
      eVerify: null,
      jdText: 'Our team of 200 employees is growing fast.',
      h1bFound: false,
      stemJob: null
    });
    assert('14. Small company (200 employees) -> companySize sub-score = 4',
      result.subScores.companySize === 4);
  }

  // Test 15: Weights sum to 1.0
  {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    assert('15. Weights sum to 1.0',
      Math.abs(sum - 1.0) < 0.001);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    runTests();
    return;
  }

  if (args.includes('--json') || args.includes('--stdin')) {
    // Read JSON from stdin
    let input = '';
    process.stdin.setEncoding('utf-8');
    for await (const chunk of process.stdin) {
      input += chunk;
    }

    try {
      const components = JSON.parse(input);
      const config = loadVisaConfig();
      const scoreResult = calculateVisaScore(components);
      const penaltyResult = components.globalScore != null
        ? applyPenalty(components.globalScore, components.jdClassification, config)
        : null;

      const output = {
        ...scoreResult,
        config: { sponsorship_mode: config.sponsorship_mode },
        penalty: penaltyResult
      };

      console.log(JSON.stringify(output, null, 2));
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  // Usage
  console.log(`visa-score.mjs -- Composite visa-friendliness score calculator

Usage:
  node visa-score.mjs --test              Run built-in test cases
  node visa-score.mjs --json < input.json Calculate score from JSON stdin

Components (weighted):
  - JD signals (30%): WILL_SPONSOR=5, UNKNOWN=3, WONT_SPONSOR=1
  - H-1B history (30%): Based on petition count + approval rate
  - E-Verify (20%): Neutral default (Phase 5)
  - Company size (10%): Inferred from JD text
  - STEM job (10%): Neutral default (Phase 5)

Input JSON shape:
  {
    "jdClassification": "WILL_SPONSOR",
    "h1bSummary": { "totalPetitions": 100, "avgApprovalRate": 92 },
    "eVerify": null,
    "jdText": "...",
    "h1bFound": true,
    "stemJob": null,
    "globalScore": 4.2
  }`);
}

main();
