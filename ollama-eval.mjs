#!/usr/bin/env node
/**
 * ollama-eval.mjs — Ollama-powered Job Offer Evaluator for career-ops
 *
 * Local, free, private alternative to the Claude-based pipeline.
 * Reads evaluation logic from modes/oferta.md + modes/_shared.md,
 * reads the user's resume from cv.md, and evaluates a Job Description
 * passed as a CLI argument or file.
 *
 * Usage:
 *   node ollama-eval.mjs "Paste full JD text here"
 *   node ollama-eval.mjs --file ./jds/my-job.txt
 *   node ollama-eval.mjs --model qwen2.5:72b --file ./jds/my-job.txt
 *
 * Requires:
 *   Ollama running locally — https://ollama.com
 *   A model pulled:  ollama pull llama3.3
 *
 * Context window guidance:
 *   The prompt (cv + modes + JD) is ~10K-15K tokens.
 *   Recommended models (32K+ context): llama3.3, mistral-nemo, qwen2.5, gemma3
 *   Smaller models (llama3.2:3b, phi3) may produce incomplete evaluations.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

try {
  const { config } = await import('dotenv');
  config();
} catch { /* dotenv optional */ }

const ROOT = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const PATHS = {
  shared:  join(ROOT, 'modes', '_shared.md'),
  oferta:  join(ROOT, 'modes', 'oferta.md'),
  cv:      join(ROOT, 'cv.md'),
  reports: join(ROOT, 'reports'),
};

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           career-ops — Ollama Evaluator (local / free)          ║
╚══════════════════════════════════════════════════════════════════╝

  Evaluate a job offer using a local Ollama model instead of Claude.

  USAGE
    node ollama-eval.mjs "<JD text>"
    node ollama-eval.mjs --file ./jds/my-job.txt
    node ollama-eval.mjs --model qwen2.5:72b "<JD text>"

  OPTIONS
    --file <path>    Read JD from a file instead of inline text
    --model <name>   Ollama model to use (default: llama3.3)
    --url <url>      Ollama base URL (default: http://localhost:11434)
    --no-save        Do not save report to reports/ directory
    --help           Show this help

  SETUP
    1. Install Ollama:  https://ollama.com
    2. Pull a model:    ollama pull llama3.3
    3. Start server:    ollama serve   (or it auto-starts)
    4. Run this script

  EXAMPLES
    node ollama-eval.mjs "We are looking for a Senior AI Engineer..."
    node ollama-eval.mjs --file ./jds/openai-swe.txt
    OLLAMA_MODEL=mistral-nemo node ollama-eval.mjs --file ./jds/job.txt
`);
  process.exit(0);
}

// Parse flags
let jdText    = '';
let modelName = process.env.OLLAMA_MODEL || 'llama3.3';
let baseUrl   = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
let saveReport = true;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file' && args[i + 1]) {
    const filePath = args[++i];
    if (!existsSync(filePath)) {
      console.error(`❌  File not found: ${filePath}`);
      process.exit(1);
    }
    jdText = readFileSync(filePath, 'utf-8').trim();
  } else if (args[i] === '--model' && args[i + 1]) {
    modelName = args[++i];
  } else if (args[i] === '--url' && args[i + 1]) {
    baseUrl = args[++i].replace(/\/$/, '');
  } else if (args[i] === '--no-save') {
    saveReport = false;
  } else if (!args[i].startsWith('--')) {
    jdText += (jdText ? '\n' : '') + args[i];
  }
}

if (!jdText) {
  console.error('❌  No Job Description provided. Run with --help for usage.');
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
    .map(f => parseInt(f.slice(0, 3), 10))
    .filter(n => !isNaN(n));
  if (files.length === 0) return '001';
  return String(Math.max(...files) + 1).padStart(3, '0');
}

// ---------------------------------------------------------------------------
// Check Ollama is reachable before burning time on prompt assembly
// ---------------------------------------------------------------------------
try {
  const probe = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5_000) });
  if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
} catch (err) {
  console.error(`
❌  Ollama not reachable at ${baseUrl}

   1. Install Ollama: https://ollama.com
   2. Start server:   ollama serve
   3. Pull a model:   ollama pull ${modelName}
`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load context files
// ---------------------------------------------------------------------------
console.log('\n📂  Loading context files...');

const sharedContext = readFile(PATHS.shared, 'modes/_shared.md');
const ofertaLogic   = readFile(PATHS.oferta, 'modes/oferta.md');
const cvContent     = readFile(PATHS.cv,     'cv.md');

// ---------------------------------------------------------------------------
// Build system prompt
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

═══════════════════════════════════════════════════════
IMPORTANT OPERATING RULES FOR THIS SESSION
═══════════════════════════════════════════════════════
1. You do NOT have access to WebSearch, Playwright, or file writing tools.
   - Block D (Comp research): use training-data salary estimates; note them as estimates.
   - Block G (Legitimacy): analyze JD text only; skip URL/page freshness checks.
   - Post-evaluation file saving is handled by the script, not by you.
2. Generate Blocks A through G in full.
3. At the very end, output this exact machine-readable block:

---SCORE_SUMMARY---
COMPANY: <company name or "Unknown">
ROLE: <role title>
SCORE: <global score as decimal, e.g. 3.8>
ARCHETYPE: <detected archetype>
LEGITIMACY: <High Confidence | Proceed with Caution | Suspicious>
---END_SUMMARY---
`;

// ---------------------------------------------------------------------------
// Call Ollama
// ---------------------------------------------------------------------------
const endpoint = `${baseUrl}/v1/chat/completions`;
const timeoutMs = parseInt(process.env.OLLAMA_TIMEOUT_MS || '300000', 10);

console.log(`🤖  Calling Ollama (${modelName})... this may take a minute.\n`);

let evaluationText;
try {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:    modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: `JOB DESCRIPTION TO EVALUATE:\n\n${jdText}` },
      ],
      stream:      false,
      temperature: 0.4,
      options: { num_ctx: 32768 },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`❌  Ollama API error: HTTP ${res.status}`);
    console.error(`    ${body.slice(0, 300)}`);
    process.exit(1);
  }

  const data = await res.json();
  evaluationText = data.choices?.[0]?.message?.content?.trim();
  if (!evaluationText) {
    console.error('❌  Ollama returned an empty response.');
    process.exit(1);
  }
} catch (err) {
  if (err.name === 'TimeoutError') {
    console.error(`❌  Request timed out after ${Math.round(timeoutMs / 1000)}s.`);
    console.error(`    Try a smaller/faster model, or increase OLLAMA_TIMEOUT_MS.`);
  } else {
    console.error(`❌  Ollama API call failed: ${err.message}`);
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Display evaluation
// ---------------------------------------------------------------------------
console.log('\n' + '═'.repeat(66));
console.log('  CAREER-OPS EVALUATION — powered by Ollama (' + modelName + ')');
console.log('═'.repeat(66) + '\n');
console.log(evaluationText);

// ---------------------------------------------------------------------------
// Parse score summary
// ---------------------------------------------------------------------------
const summaryMatch = evaluationText.match(/---SCORE_SUMMARY---\s*([\s\S]*?)---END_SUMMARY---/);

let company    = 'unknown';
let role       = 'unknown';
let score      = '?';
let archetype  = 'unknown';
let legitimacy = 'unknown';

if (summaryMatch) {
  const extract = (key) => {
    const m = summaryMatch[1].match(new RegExp(`${key}:\\s*(.+)`));
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

    const num         = nextReportNumber();
    const today       = new Date().toISOString().split('T')[0];
    const companySlug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename    = `${num}-${companySlug}-${today}.md`;
    const reportPath  = join(PATHS.reports, filename);

    const reportContent = `# Evaluation: ${company} — ${role}

**Date:** ${today}
**Archetype:** ${archetype}
**Score:** ${score}/5
**Legitimacy:** ${legitimacy}
**PDF:** pending
**Tool:** Ollama (${modelName})

---

${evaluationText.replace(/---SCORE_SUMMARY---[\s\S]*?---END_SUMMARY---/, '').trim()}
`;

    writeFileSync(reportPath, reportContent, 'utf-8');
    console.log(`\n✅  Report saved: reports/${filename}`);

    console.log(`\n📊  Tracker entry (add to data/applications.md):`);
    console.log(`    | ${num} | ${today} | ${company} | ${role} | ${score}/5 | Evaluated | ❌ | [${num}](reports/${filename}) |`);
  } catch (err) {
    console.warn(`⚠️   Could not save report: ${err.message}`);
  }
}

console.log('\n' + '─'.repeat(66));
console.log(`  Score: ${score}/5  |  Archetype: ${archetype}  |  Legitimacy: ${legitimacy}`);
console.log('─'.repeat(66) + '\n');
