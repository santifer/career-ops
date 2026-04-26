#!/usr/bin/env node

/**
 * stem-detect.mjs -- STEM job detection from role title and JD text
 *
 * Classifies job roles as STEM / NON_STEM / UNCERTAIN using keyword
 * matching against config/stem-keywords.yml. Returns a score compatible
 * with visa-score.mjs stemJob parameter: STEM=5, NON_STEM=2, UNCERTAIN=3.
 *
 * Critical for STEM OPT holders: STEM-eligible roles qualify for the
 * 24-month STEM OPT extension (36 months total OPT).
 *
 * Usage:
 *   node stem-detect.mjs <role-title>              Human-readable output
 *   node stem-detect.mjs <role-title> --json        JSON output
 *   echo '{"roleTitle":"...","jdText":"..."}' | node stem-detect.mjs --stdin --json
 *   node stem-detect.mjs --test                     Run built-in test suite
 *
 * Scores per D-17:
 *   STEM       = 5 (positive keyword match, no strong negative in title)
 *   NON_STEM   = 2 (only negative keywords match)
 *   UNCERTAIN  = 3 (no matches or ambiguous)
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const KEYWORDS_PATH = join(ROOT, 'config', 'stem-keywords.yml');

// --- YAML Parser (duplicated from sponsorship-detect.mjs per project convention) ---

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Minimal YAML parser for flat array-of-strings structure.
 * Recognizes category keys (word:) and array items (- "value").
 * Rejects prototype-pollution keys (T-05-04 mitigation).
 *
 * @param {string} filePath - Path to stem-keywords.yml
 * @returns {object} { positive: string[], negative: string[] }
 */
function loadStemKeywords(filePath) {
  const text = readFileSync(filePath, 'utf-8');
  const result = {};
  let currentKey = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const trimmed = line.trim();

    // Skip comments and blank lines
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Category key: word followed by colon at start of line (no leading whitespace)
    const keyMatch = line.match(/^(\w+):$/);
    if (keyMatch) {
      currentKey = keyMatch[1];
      if (UNSAFE_KEYS.has(currentKey)) {
        console.warn(`Skipping unsafe YAML key: ${currentKey}`);
        currentKey = null;
        continue;
      }
      result[currentKey] = [];
      continue;
    }

    // Array item: leading whitespace, dash, quoted string
    const itemMatch = trimmed.match(/^-\s+"(.+)"$/) || trimmed.match(/^-\s+'(.+)'$/);
    if (itemMatch && currentKey) {
      result[currentKey].push(itemMatch[1]);
      continue;
    }
  }

  // Validate expected categories exist
  if (!result.positive) {
    throw new Error(`Missing category "positive" in ${filePath}`);
  }
  if (!result.negative) {
    throw new Error(`Missing category "negative" in ${filePath}`);
  }

  return result;
}

// --- STEM Detection ---

/**
 * Detect whether a job role is STEM-eligible.
 *
 * Strategy:
 *   1. Check for negative keyword matches in role title (strong signal)
 *   2. Check for positive keyword matches in title + JD text
 *   3. Score: STEM=5, NON_STEM=2, UNCERTAIN=3 (per D-17)
 *   4. JD text positive matches can override title-only negative matches
 *
 * @param {string} roleTitle - Job title (e.g., "Software Engineer")
 * @param {string} jdText - Full JD text (can be empty)
 * @param {object} [keywords] - Pre-loaded keywords (for testing)
 * @returns {object} { classification, score, matchedKeywords, negativeKeywords, confidence }
 */
function detectStem(roleTitle, jdText, keywords) {
  const kw = keywords || loadStemKeywords(KEYWORDS_PATH);

  const titleLower = (roleTitle || '').toLowerCase().trim();
  const jdLower = (jdText || '').toLowerCase();
  const combinedText = titleLower + ' ' + jdLower;

  const matchedKeywords = [];
  const negativeKeywords = [];

  // Check for negative keyword matches in title
  let titleNegativeMatch = false;
  for (const neg of kw.negative) {
    const negLower = neg.toLowerCase();
    if (titleLower.includes(negLower)) {
      negativeKeywords.push(neg);
      titleNegativeMatch = true;
    }
  }

  // Check for positive keyword matches in combined text (title + JD)
  for (const pos of kw.positive) {
    const posLower = pos.toLowerCase();
    if (combinedText.includes(posLower)) {
      matchedKeywords.push(pos);
    }
  }

  // Also check for negative keywords in JD text (weaker signal)
  for (const neg of kw.negative) {
    const negLower = neg.toLowerCase();
    if (jdLower.includes(negLower) && !negativeKeywords.includes(neg)) {
      negativeKeywords.push(neg);
    }
  }

  // Classification logic per D-17
  let classification;
  let score;
  let confidence;

  const hasPositive = matchedKeywords.length > 0;
  const hasNegative = negativeKeywords.length > 0;

  if (hasPositive && !hasNegative) {
    // Clear STEM signal
    classification = 'STEM';
    score = 5;
    confidence = 'high';
  } else if (hasPositive && hasNegative) {
    // Both signals -- check if JD text has more positive signals
    // If title is negative but JD has strong STEM keywords, lean STEM
    if (!titleNegativeMatch && matchedKeywords.length > negativeKeywords.length) {
      classification = 'STEM';
      score = 5;
      confidence = 'medium';
    } else if (titleNegativeMatch && matchedKeywords.length > negativeKeywords.length) {
      // Title is negative but JD has overwhelming positive signals
      // Check if positive keywords are in JD text (not just title)
      const jdPositives = matchedKeywords.filter(kw => jdLower.includes(kw.toLowerCase()));
      if (jdPositives.length > negativeKeywords.length) {
        classification = 'STEM';
        score = 5;
        confidence = 'medium';
      } else {
        classification = 'UNCERTAIN';
        score = 3;
        confidence = 'low';
      }
    } else {
      classification = 'UNCERTAIN';
      score = 3;
      confidence = 'low';
    }
  } else if (!hasPositive && hasNegative) {
    // Only negative signals
    classification = 'NON_STEM';
    score = 2;
    confidence = 'high';
  } else {
    // No matches either way
    classification = 'UNCERTAIN';
    score = 3;
    confidence = 'low';
  }

  return {
    classification,
    score,
    matchedKeywords,
    negativeKeywords,
    confidence
  };
}

// --- Human-readable Output ---

function formatHuman(result) {
  const lines = [];
  lines.push(`STEM Detection Result`);
  lines.push('='.repeat(40));
  lines.push(`  Classification: ${result.classification}`);
  lines.push(`  Score:          ${result.score}/5`);
  lines.push(`  Confidence:     ${result.confidence}`);

  if (result.matchedKeywords.length > 0) {
    lines.push(`  STEM keywords:  ${result.matchedKeywords.map(k => `"${k}"`).join(', ')}`);
  }
  if (result.negativeKeywords.length > 0) {
    lines.push(`  Non-STEM:       ${result.negativeKeywords.map(k => `"${k}"`).join(', ')}`);
  }
  lines.push('='.repeat(40));

  if (result.classification === 'STEM') {
    lines.push('This role qualifies as STEM. STEM OPT extension eligible.');
  } else if (result.classification === 'NON_STEM') {
    lines.push('This role does NOT qualify as STEM.');
    lines.push('STEM OPT extension would NOT apply to this position.');
  } else {
    lines.push('STEM eligibility is uncertain for this role.');
    lines.push('Review the actual CIP code and employer E-Verify status.');
  }

  return lines.join('\n');
}

// --- Built-in Tests ---

function runTests() {
  const kw = loadStemKeywords(KEYWORDS_PATH);
  let passed = 0;
  let failed = 0;

  function ok(condition, msg) {
    if (condition) {
      console.log(`  PASS: ${msg}`);
      passed++;
    } else {
      console.log(`  FAIL: ${msg}`);
      failed++;
    }
  }

  console.log('\nSTEM Detection -- Built-in Tests\n');

  // Test 1: Software Engineer is STEM
  const t1 = detectStem('Software Engineer', '', kw);
  ok(t1.classification === 'STEM', `Test 1: 'Software Engineer' is STEM (got '${t1.classification}')`);
  ok(t1.score === 5, `Test 1: score is 5 (got ${t1.score})`);
  ok(t1.matchedKeywords.length > 0, 'Test 1: has matched keywords');

  // Test 2: Marketing Manager is NON_STEM
  const t2 = detectStem('Marketing Manager', '', kw);
  ok(t2.classification === 'NON_STEM', `Test 2: 'Marketing Manager' is NON_STEM (got '${t2.classification}')`);
  ok(t2.score === 2, `Test 2: score is 2 (got ${t2.score})`);

  // Test 3: Marketing Manager with STEM JD text overrides
  const t3 = detectStem('Marketing Manager', 'Build and maintain machine learning pipeline for customer segmentation using deep learning models', kw);
  ok(t3.classification === 'STEM', `Test 3: 'Marketing Manager' with ML JD text is STEM (got '${t3.classification}')`);
  ok(t3.score === 5, `Test 3: score is 5 (got ${t3.score})`);

  // Test 4: Project Manager is UNCERTAIN (no matches)
  const t4 = detectStem('Project Manager', '', kw);
  ok(t4.classification === 'UNCERTAIN', `Test 4: 'Project Manager' is UNCERTAIN (got '${t4.classification}')`);
  ok(t4.score === 3, `Test 4: score is 3 (got ${t4.score})`);

  // Test 5: Case-insensitive matching
  const t5 = detectStem('ML ENGINEER', '', kw);
  ok(t5.classification === 'STEM', `Test 5: 'ML ENGINEER' (uppercase) is STEM (got '${t5.classification}')`);

  // Test 6: Variation handling
  const t6 = detectStem('AI/ML Research Scientist', '', kw);
  ok(t6.classification === 'STEM', `Test 6: 'AI/ML Research Scientist' is STEM (got '${t6.classification}')`);

  // Test 7: Negative keywords prevent false positives
  const t7 = detectStem('Sales Engineer', 'selling software products to enterprise customers', kw);
  ok(t7.classification === 'NON_STEM' || t7.classification === 'UNCERTAIN',
    `Test 7: 'Sales Engineer' selling software is NON_STEM or UNCERTAIN (got '${t7.classification}')`);

  // Test 8: YAML parser rejects __proto__ keys
  let unsafeRejected = false;
  try {
    const testKw = { positive: [], negative: [] };
    // Verify UNSAFE_KEYS set exists and works
    unsafeRejected = UNSAFE_KEYS.has('__proto__') && UNSAFE_KEYS.has('constructor') && UNSAFE_KEYS.has('prototype');
  } catch {
    unsafeRejected = false;
  }
  ok(unsafeRejected, 'Test 8: UNSAFE_KEYS guard covers __proto__, constructor, prototype');

  // Test 9: Data Scientist is STEM
  const t9 = detectStem('Data Scientist', '', kw);
  ok(t9.classification === 'STEM', `Test 9: 'Data Scientist' is STEM (got '${t9.classification}')`);
  ok(t9.score === 5, `Test 9: score is 5 (got ${t9.score})`);

  // Test 10: Empty role title with STEM JD text
  const t10 = detectStem('', 'We need a software engineer to build our data pipeline', kw);
  ok(t10.classification === 'STEM', `Test 10: empty title with STEM JD is STEM (got '${t10.classification}')`);

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2);
  const flags = {
    test: args.includes('--test'),
    json: args.includes('--json'),
    stdin: args.includes('--stdin')
  };

  const positional = args.filter(a => !a.startsWith('--'));

  if (flags.test) {
    const success = runTests();
    process.exit(success ? 0 : 1);
  }

  if (flags.stdin) {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const input = Buffer.concat(chunks).toString('utf-8').trim();
    let roleTitle = '';
    let jdText = '';
    try {
      const parsed = JSON.parse(input);
      roleTitle = parsed.roleTitle || '';
      jdText = parsed.jdText || '';
    } catch {
      // Treat entire input as JD text
      jdText = input;
    }
    const result = detectStem(roleTitle, jdText);
    if (flags.json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(formatHuman(result));
    }
    process.exit(0);
  }

  if (positional.length === 0) {
    console.log('Usage: node stem-detect.mjs <role-title> [--json] [--stdin] [--test]');
    process.exit(1);
  }

  const roleTitle = positional.join(' ');
  const result = detectStem(roleTitle, '');

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n' + formatHuman(result));
  }
}

main();
