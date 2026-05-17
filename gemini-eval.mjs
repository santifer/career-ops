#!/usr/bin/env node
/**
 * gemini-eval.mjs — Gemini-powered Job Offer Evaluator for career-ops
 *
 * A free-tier alternative to the Claude-based pipeline.
 * Reads evaluation logic from modes/oferta.md + modes/_shared.md,
 * reads the user's resume from cv.md, and evaluates a Job Description
 * passed as a command-line argument.
 *
 * Usage:
 *   node gemini-eval.mjs "Paste full JD text here"
 *   node gemini-eval.mjs --file ./jds/my-job.txt
 *
 * Requires:
 *   GEMINI_API_KEY in .env (or environment variable)
 *
 * Free-tier model: gemini-2.0-flash (generous quota, no billing required)
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Bootstrap: load .env before anything else
// ---------------------------------------------------------------------------
try {
  const { config } = await import('dotenv');
  config();
} catch {
  // dotenv is optional — fall back to process.env if not installed
}

import { GoogleGenerativeAI } from '@google/generative-ai';
import { renderDiscardPatternBrief } from './lib/discard-pattern-injector.mjs';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const ROOT = dirname(fileURLToPath(import.meta.url));

const PATHS = {
  // Primary evaluation logic lives in these two mode files
  shared:   join(ROOT, 'modes', '_shared.md'),
  oferta:   join(ROOT, 'modes', 'oferta.md'),
  // Canonical skill path referenced in Issue #344
  evaluate: join(ROOT, '.claude', 'skills', 'career-ops', 'SKILL.md'),
  cv:       join(ROOT, 'cv.md'),
  reports:  join(ROOT, 'reports'),
  tracker:  join(ROOT, 'data', 'applications.md'),
};

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           career-ops — Gemini Evaluator (free-tier)             ║
╚══════════════════════════════════════════════════════════════════╝

  Evaluate a job offer using Google Gemini instead of Claude.

  USAGE
    node gemini-eval.mjs "<JD text>"
    node gemini-eval.mjs --file ./jds/my-job.txt
    node gemini-eval.mjs --model gemini-2.0-flash "<JD text>"

  OPTIONS
    --file <path>    Read JD from a file instead of inline text
    --model <name>   Gemini model to use (default: gemini-2.0-flash)
    --no-save        Do not save report to reports/ directory
    --help           Show this help

  SETUP
    1. Get a free API key at https://aistudio.google.com/apikey
    2. Add GEMINI_API_KEY=<your-key> to .env
    3. Run: npm install   (installs @google/generative-ai + dotenv)

  EXAMPLES
    node gemini-eval.mjs "We are looking for a Senior AI Engineer..."
    node gemini-eval.mjs --file ./jds/openai-swe.txt
`);
  process.exit(0);
}

// Parse flags
let jdText = '';
let modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
let saveReport = true;
let batchMode = false;
let batchReportNum = null;
let batchId = null;
let batchDate = null;
let batchUrl = null;
let triageMode = false;
let triageTier = 2;
let triageJdSnippet = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--mode=triage' || args[i] === '--mode' && args[i + 1] === 'triage') {
    triageMode = true;
    if (args[i] === '--mode') i++;
  } else if (args[i] === '--file' && args[i + 1]) {
    const filePath = args[++i];
    if (!existsSync(filePath)) {
      console.error(`❌  File not found: ${filePath}`);
      process.exit(1);
    }
    jdText = readFileSync(filePath, 'utf-8').trim();
  } else if (args[i] === '--model' && args[i + 1]) {
    modelName = args[++i];
  } else if (args[i] === '--no-save') {
    saveReport = false;
  } else if (args[i] === '--batch') {
    batchMode = true;
  } else if (args[i] === '--report-num' && args[i + 1]) {
    batchReportNum = args[++i];
  } else if (args[i] === '--id' && args[i + 1]) {
    batchId = args[++i];
  } else if (args[i] === '--date' && args[i + 1]) {
    batchDate = args[++i];
  } else if (args[i] === '--url' && args[i + 1]) {
    batchUrl = args[++i];
  } else if (args[i] === '--tier' && args[i + 1]) {
    triageTier = parseInt(args[++i]) || 2;
  } else if (args[i] === '--jd-snippet' && args[i + 1]) {
    triageJdSnippet = args[++i];
  } else if (!args[i].startsWith('--')) {
    jdText += (jdText ? '\n' : '') + args[i];
  }
}

// ── Triage mode: quick-score via JSON output, then exit ──────────
if (triageMode) {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error('GEMINI_API_KEY not set — cannot run triage mode');
    process.exit(1);
  }
  const triagePromptPath = join(ROOT, 'batch', 'triage-prompt.md');
  if (!existsSync(triagePromptPath)) {
    console.error(`triage-prompt.md not found at ${triagePromptPath}`);
    process.exit(1);
  }
  // Append recent-discard brief so triage doesn't re-surface anti-patterns
  // (modes/_shared.md "Discard Pattern Awareness"). Safe to skip on missing file.
  let discardBrief = '';
  try { discardBrief = renderDiscardPatternBrief({ limit: 20, format: 'markdown' }) || ''; }
  catch (e) { console.error(`[gemini-triage] discard-pattern brief unavailable: ${e.message}`); }

  const triagePrompt = readFileSync(triagePromptPath, 'utf8')
    .replace('{{URL}}', batchUrl || '(url not provided)')
    .replace('{{TIER}}', String(triageTier))
    .replace('{{JD_SNIPPET}}', (triageJdSnippet || jdText || '(no JD available)').slice(0, 3000))
    + discardBrief;

  const { GoogleGenerativeAI: GeminiAI } = await import('@google/generative-ai');
  const gai   = new GeminiAI(geminiApiKey);
  // maxOutputTokens bumped from 80 → 250: triage JSON output is ~50–100
  // tokens AT MINIMUM, and any preamble or longer reason field would silently
  // truncate at 80 → parse failure → SKIP. Same failure mode as the 0.001
  // --max-budget-usd cap discovered 2026-05-16. thinkingConfig:0 disables
  // gemini-2.5's reasoning step (which eats output budget without benefit
  // for this structured-output task).
  const gmod  = gai.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 250,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  try {
    const result = await gmod.generateContent([{ text: triagePrompt }]);
    process.stdout.write(result.response.text().trim() + '\n');
  } catch (err) {
    console.error(`Gemini triage error: ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

if (!jdText && batchUrl) {
  try {
    const res = await fetch(batchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 career-ops/1.7.0' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    jdText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .replace(/\s{3,}/g, '\n\n')
      .trim()
      .slice(0, 20000);
  } catch (err) {
    console.error(`❌  Failed to fetch JD from ${batchUrl}: ${err.message}`);
    process.exit(1);
  }
}

if (!jdText) {
  console.error('❌  No Job Description provided. Run with --help for usage.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Validate environment
// ---------------------------------------------------------------------------
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error(`
❌  GEMINI_API_KEY not found.

   1. Get a free key at https://aistudio.google.com/apikey
   2. Add it to .env:   GEMINI_API_KEY=your_key_here
   3. Or export it:     export GEMINI_API_KEY=your_key_here
`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------
function readFile(path, label) {
  if (!existsSync(path)) {
    console.warn(`⚠️   ${label} not found at: ${path}`);
    return `[${label} not found — skipping]`;
  }
  return readFileSync(path, 'utf-8').trim();
}

function nextReportNumber() {
  if (!existsSync(PATHS.reports)) return '001';
  const files = readdirSync(PATHS.reports)
    .filter(f => /^\d{3}-/.test(f))
    .map(f => parseInt(f.slice(0, 3)))
    .filter(n => !isNaN(n));
  if (files.length === 0) return '001';
  return String(Math.max(...files) + 1).padStart(3, '0');
}


// ---------------------------------------------------------------------------
// Load context files
// ---------------------------------------------------------------------------
console.log('\n📂  Loading context files...');

const sharedContext  = readFile(PATHS.shared,   'modes/_shared.md');
const ofertaLogic    = readFile(PATHS.oferta,   'modes/oferta.md');
const cvContent      = readFile(PATHS.cv,       'cv.md');
const articleDigestPath = join(ROOT, 'article-digest.md');
const articleDigest  = existsSync(articleDigestPath) ? readFileSync(articleDigestPath, 'utf-8').trim() : null;

// ---------------------------------------------------------------------------
// Build the system prompt (mirrors the Claude skill router logic)
// ---------------------------------------------------------------------------
const systemPrompt = `You are career-ops, an AI-powered job search assistant.
You evaluate job offers against the user's CV using a structured A-G scoring system.

Your evaluation methodology is defined below. Follow it exactly.

═══════════════════════════════════════════════════════
SYSTEM CONTEXT (_shared.md)
═══════════════════════════════════════════════════════
${sharedContext}

═══════════════════════════════════════════════════════
EVALUATION MODE (oferta.md)
═══════════════════════════════════════════════════════
${ofertaLogic}

═══════════════════════════════════════════════════════
CANDIDATE RESUME (cv.md)
═══════════════════════════════════════════════════════
${cvContent}
${articleDigest ? `
═══════════════════════════════════════════════════════
PROOF POINTS (article-digest.md)
═══════════════════════════════════════════════════════
${articleDigest}
` : ''}
═══════════════════════════════════════════════════════
IMPORTANT OPERATING RULES FOR THIS CLI SESSION
═══════════════════════════════════════════════════════
1. You do NOT have access to WebSearch, Playwright, or file writing tools.
   - For Block D (Comp research): provide salary estimates based on your training data, clearly noted as estimates.
   - For Block G (Legitimacy): analyze the JD text only; skip URL/page freshness checks.
   - Post-evaluation file saving is handled by the script, not by you.
2. Generate Blocks A through G in full, in English, unless the JD is in another language.
3. At the very end, output a machine-readable summary block in this exact format:

---SCORE_SUMMARY---
COMPANY: <company name or "Unknown">
ROLE: <role title>
SCORE: <global score as decimal, e.g. 3.8>
ARCHETYPE: <detected archetype>
LEGITIMACY: <High Confidence | Proceed with Caution | Suspicious>
---END_SUMMARY---
`;

// ---------------------------------------------------------------------------
// Call Gemini API
// ---------------------------------------------------------------------------
console.log(`🤖  Calling Gemini (${modelName})... this may take 30-60 seconds.\n`);

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({
  model: modelName,
  generationConfig: {
    temperature: 0.4,      // deterministic enough for structured evaluation
    maxOutputTokens: 8192, // full 7-block evaluation
  },
});

let evaluationText;
try {
  const result = await model.generateContent([
    { text: systemPrompt },
    { text: `\n\nJOB DESCRIPTION TO EVALUATE:\n\n${jdText}` },
  ]);
  evaluationText = result.response.text();
} catch (err) {
  console.error('❌  Gemini API error:', err.message);
  if (err.message?.includes('API_KEY')) {
    console.error('    Check your GEMINI_API_KEY in .env');
  } else if (err.message?.includes('quota') || err.message?.includes('rate')) {
    console.error('    You may have hit the free-tier rate limit. Wait 60s and retry.');
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Display evaluation
// ---------------------------------------------------------------------------
console.log('\n' + '═'.repeat(66));
console.log('  CAREER-OPS EVALUATION — powered by Google Gemini');
console.log('═'.repeat(66) + '\n');
console.log(evaluationText);

// ---------------------------------------------------------------------------
// Parse score summary
// ---------------------------------------------------------------------------
const summaryMatch = evaluationText.match(
  /---SCORE_SUMMARY---\s*([\s\S]*?)---END_SUMMARY---/
);

let company    = 'unknown';
let role       = 'unknown';
let score      = '?';
let archetype  = 'unknown';
let legitimacy = 'unknown';

if (summaryMatch) {
  const block = summaryMatch[1];
  const extract = (key) => {
    const m = block.match(new RegExp(`${key}:\\s*(.+)`));
    return m ? m[1].trim() : 'unknown';
  };
  company    = extract('COMPANY');
  role       = extract('ROLE');
  score      = extract('SCORE');
  archetype  = extract('ARCHETYPE');
  legitimacy = extract('LEGITIMACY');
}

// ---------------------------------------------------------------------------
// Save report
// ---------------------------------------------------------------------------
if (saveReport) {
  try {
    if (!existsSync(PATHS.reports)) {
      mkdirSync(PATHS.reports, { recursive: true });
    }

    const num         = batchReportNum || nextReportNumber();
    const today       = batchDate || new Date().toISOString().split('T')[0];
    const companySlug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename    = `${num}-${companySlug}-${today}.md`;
    const reportPath  = join(PATHS.reports, filename);

    const reportContent = `# Evaluation: ${company} — ${role}

**Date:** ${today}
**Archetype:** ${archetype}
**Score:** ${score}/5
**Legitimacy:** ${legitimacy}
**PDF:** pending
**Tool:** Gemini (${modelName})

---

${evaluationText.replace(/---SCORE_SUMMARY---[\s\S]*?---END_SUMMARY---/, '').trim()}
`;

    writeFileSync(reportPath, reportContent, 'utf-8');
    console.log(`\n✅  Report saved: reports/${filename}`);

    if (batchMode && batchId) {
      const tsvDir = join(ROOT, 'batch', 'tracker-additions');
      if (!existsSync(tsvDir)) mkdirSync(tsvDir, { recursive: true });
      const companySlugTsv = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const tsvPath = join(tsvDir, `${num}-${companySlugTsv}.tsv`);
      const scoreForTsv = score !== '?' ? `${score}/5` : '-';
      const reportLink = `[${num}](reports/${filename})`;
      writeFileSync(tsvPath, `${num}\t${today}\t${company}\t${role}\tEvaluated\t${scoreForTsv}\t❌\t${reportLink}\tGemini (${modelName})\n`, 'utf-8');
      console.log(`✅  TSV written: batch/tracker-additions/${num}-${companySlugTsv}.tsv`);
    } else {
      console.log(`\n📊  Tracker entry (add to data/applications.md):`);
      console.log(`    | ${num} | ${today} | ${company} | ${role} | ${score} | Evaluada | ❌ | [${num}](reports/${filename}) |`);
    }
  } catch (err) {
    console.warn(`⚠️   Could not save report: ${err.message}`);
  }
}

console.log('\n' + '─'.repeat(66));
console.log(`  Score: ${score}/5  |  Archetype: ${archetype}  |  Legitimacy: ${legitimacy}`);
console.log('─'.repeat(66) + '\n');
