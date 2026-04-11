#!/usr/bin/env node

/**
 * sponsorship-detect.mjs -- JD visa sponsorship signal detection
 *
 * Classifies job description text into WILL_SPONSOR / WONT_SPONSOR / UNKNOWN
 * using keyword matching against config/sponsorship-keywords.yml.
 *
 * Usage:
 *   node sponsorship-detect.mjs --test              Run built-in test cases
 *   node sponsorship-detect.mjs --file <path>       Classify JD from file
 *   node sponsorship-detect.mjs --stdin             Classify JD from stdin
 *   node sponsorship-detect.mjs --stdin --json      Output as JSON
 *   node sponsorship-detect.mjs                     Print usage
 *
 * Classification logic:
 *   - Negative keywords / government blockers / authorization blockers => negative signal
 *   - Positive keywords => positive signal
 *   - Only negative => WONT_SPONSOR (high confidence)
 *   - Only positive => WILL_SPONSOR (high confidence)
 *   - Both => UNKNOWN (medium confidence, conflicting signals)
 *   - Neither => UNKNOWN (low confidence, no signals)
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const KEYWORDS_PATH = join(ROOT, 'config', 'sponsorship-keywords.yml');

// --- YAML Parser ---

/**
 * Minimal YAML parser for flat array-of-strings structure.
 * Only recognizes category keys (word:) and array items (- "value").
 * No eval, no exec -- safe against injection (T-03-02 mitigation).
 *
 * @param {string} filePath - Path to sponsorship-keywords.yml
 * @returns {object} { positive_keywords: [], negative_keywords: [], government_blockers: [], authorization_blockers: [] }
 */
function loadKeywords(filePath) {
  const text = readFileSync(filePath, 'utf-8');
  const result = {};
  let currentKey = null;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();

    // Skip comments and blank lines
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Category key: word followed by colon at start of line (no leading whitespace)
    // Note: handle CRLF line endings by trimming \r from line before matching
    const keyMatch = line.replace(/\r$/, '').match(/^(\w+):$/);
    if (keyMatch) {
      currentKey = keyMatch[1];
      result[currentKey] = [];
      continue;
    }

    // Array item: leading whitespace, dash, quoted string
    const itemMatch = trimmed.match(/^-\s+"(.+)"$/) || trimmed.match(/^-\s+'(.+)'$/);
    if (itemMatch && currentKey) {
      result[currentKey].push(itemMatch[1]);
      continue;
    }

    // Reject unexpected lines (T-03-02: strict parsing)
    // Silently skip -- no eval on unrecognized content
  }

  // Validate expected categories exist
  const expected = ['positive_keywords', 'negative_keywords', 'government_blockers', 'authorization_blockers'];
  for (const key of expected) {
    if (!result[key]) {
      throw new Error(`Missing category "${key}" in ${filePath}`);
    }
  }

  return result;
}

// --- Classification ---

/**
 * Classify JD text for visa sponsorship signals.
 *
 * @param {string} jdText - Full JD text to analyze
 * @param {object} keywords - Loaded keyword categories from loadKeywords()
 * @returns {object} { classification, positiveSignals, negativeSignals, confidence }
 */
function classifySponsorship(jdText, keywords) {
  const text = jdText.toLowerCase();
  const positiveSignals = [];
  const negativeSignals = [];

  // Check negative keywords
  for (const kw of keywords.negative_keywords) {
    if (text.includes(kw.toLowerCase())) {
      negativeSignals.push(kw);
    }
  }

  // Check government blockers (auto WONT_SPONSOR per D-04)
  for (const kw of keywords.government_blockers) {
    if (text.includes(kw.toLowerCase())) {
      negativeSignals.push(kw);
    }
  }

  // Check authorization blockers
  for (const kw of keywords.authorization_blockers) {
    if (text.includes(kw.toLowerCase())) {
      negativeSignals.push(kw);
    }
  }

  // Check positive keywords
  for (const kw of keywords.positive_keywords) {
    if (text.includes(kw.toLowerCase())) {
      positiveSignals.push(kw);
    }
  }

  // Classification logic
  const hasPositive = positiveSignals.length > 0;
  const hasNegative = negativeSignals.length > 0;

  let classification;
  let confidence;

  if (hasNegative && !hasPositive) {
    classification = 'WONT_SPONSOR';
    confidence = 'high';
  } else if (hasPositive && !hasNegative) {
    classification = 'WILL_SPONSOR';
    confidence = 'high';
  } else if (hasPositive && hasNegative) {
    classification = 'UNKNOWN';
    confidence = 'medium';
  } else {
    classification = 'UNKNOWN';
    confidence = 'low';
  }

  return { classification, positiveSignals, negativeSignals, confidence };
}

// --- Built-in Tests ---

function runTests(keywords) {
  const tests = [
    {
      input: 'This role will not sponsor work visas',
      expected: 'WONT_SPONSOR',
      confidence: 'high',
      label: 'Negative: will not sponsor',
    },
    {
      input: 'Visa sponsorship available for qualified candidates',
      expected: 'WILL_SPONSOR',
      confidence: 'high',
      label: 'Positive: visa sponsorship available',
    },
    {
      input: 'We are looking for a software engineer',
      expected: 'UNKNOWN',
      confidence: 'low',
      label: 'No signals: generic JD',
    },
    {
      input: 'Requires active TS/SCI security clearance',
      expected: 'WONT_SPONSOR',
      confidence: 'high',
      label: 'Government: TS/SCI clearance',
    },
    {
      input: 'Must be a US citizen or permanent resident',
      expected: 'WONT_SPONSOR',
      confidence: 'high',
      label: 'Authorization: US citizen + permanent resident',
    },
    {
      input: 'H-1B sponsorship available. Must be authorized to work in the US',
      expected: 'UNKNOWN',
      confidence: 'medium',
      label: 'Conflicting: positive + authorization blocker',
    },
    {
      input: 'We Will Sponsor qualified H1B candidates',
      expected: 'WILL_SPONSOR',
      confidence: 'high',
      label: 'Case insensitive: mixed case positive',
    },
    {
      input: 'ITAR compliance required for this position',
      expected: 'WONT_SPONSOR',
      confidence: 'high',
      label: 'Government: ITAR compliance',
    },
  ];

  let passed = 0;
  let failed = 0;

  console.log('Running sponsorship detection tests...\n');

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const result = classifySponsorship(t.input, keywords);
    const ok = result.classification === t.expected && result.confidence === t.confidence;

    if (ok) {
      console.log(`  ✅ Test ${i + 1}: ${t.label}`);
      console.log(`     Input: "${t.input}"`);
      console.log(`     Result: ${result.classification} (${result.confidence})`);
      passed++;
    } else {
      console.log(`  ❌ Test ${i + 1}: ${t.label}`);
      console.log(`     Input: "${t.input}"`);
      console.log(`     Expected: ${t.expected} (${t.confidence})`);
      console.log(`     Got: ${result.classification} (${result.confidence})`);
      failed++;
    }
    console.log('');
  }

  console.log('='.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed out of ${tests.length} tests`);

  return failed === 0;
}

// --- Output Formatting ---

function formatHuman(result) {
  const pos = result.positiveSignals.length > 0
    ? result.positiveSignals.map(s => `"${s}"`).join(', ')
    : '(none)';
  const neg = result.negativeSignals.length > 0
    ? result.negativeSignals.map(s => `"${s}"`).join(', ')
    : '(none)';

  return [
    `Classification: ${result.classification}`,
    `Confidence: ${result.confidence}`,
    `Positive signals: ${pos}`,
    `Negative signals: ${neg}`,
  ].join('\n');
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage:');
    console.log('  node sponsorship-detect.mjs --test              Run built-in test cases');
    console.log('  node sponsorship-detect.mjs --file <path>       Classify JD from file');
    console.log('  node sponsorship-detect.mjs --stdin             Classify JD from stdin');
    console.log('  node sponsorship-detect.mjs --stdin --json      Output as JSON');
    process.exit(0);
  }

  const keywords = loadKeywords(KEYWORDS_PATH);
  const jsonMode = args.includes('--json');

  if (args.includes('--test')) {
    const allPassed = runTests(keywords);
    process.exit(allPassed ? 0 : 1);
  }

  if (args.includes('--file')) {
    const fileIdx = args.indexOf('--file');
    const filePath = args[fileIdx + 1];
    if (!filePath) {
      console.error('Error: --file requires a path argument');
      process.exit(1);
    }
    const jdText = readFileSync(filePath, 'utf-8');
    const result = classifySponsorship(jdText, keywords);

    if (jsonMode) {
      console.log(JSON.stringify(result));
    } else {
      console.log(formatHuman(result));
    }
    process.exit(0);
  }

  if (args.includes('--stdin')) {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const jdText = Buffer.concat(chunks).toString('utf-8');
    const result = classifySponsorship(jdText, keywords);

    if (jsonMode) {
      console.log(JSON.stringify(result));
    } else {
      console.log(formatHuman(result));
    }
    process.exit(0);
  }

  console.error('Error: Unknown arguments. Run without arguments for usage.');
  process.exit(1);
}

main();
