#!/usr/bin/env node
/**
 * ollama-batch.mjs — Ollama batch worker for career-ops
 *
 * Drop-in replacement for `claude -p` workers in batch-runner.sh.
 * Evaluates one job offer using a local Ollama model, writes the report .md
 * and tracker TSV, then prints a JSON summary to stdout for the orchestrator.
 *
 * Usage (invoked by batch-runner.sh --backend ollama):
 *   node ollama-batch.mjs \
 *     --url <URL> \
 *     --jd-file <PATH> \
 *     --report-num <NUM> \
 *     --date <YYYY-MM-DD> \
 *     --batch-id <ID>
 *
 * Environment:
 *   OLLAMA_BASE_URL     Ollama server base URL (default: http://localhost:11434)
 *   OLLAMA_MODEL        Model name (default: llama3.3)
 *   OLLAMA_TIMEOUT_MS   Request timeout in ms (default: 300000 = 5 min)
 *
 * Context window guidance:
 *   The system prompt (cv.md + modes files + JD) is typically 10K-15K tokens.
 *   Use a model with at least 32K context — llama3.3, mistral-nemo, qwen2.5.
 *   Smaller models (llama3.2:3b, phi3) may truncate and produce poor results.
 *
 * PDF generation:
 *   PDFs are not generated in Ollama batch mode (no tool-calling harness).
 *   Generate manually: node generate-pdf.mjs <html-file> <output.pdf>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

try {
  const { config } = await import('dotenv');
  config();
} catch { /* dotenv optional */ }

const ROOT = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL    || 'llama3.3';
const TIMEOUT_MS      = parseInt(process.env.OLLAMA_TIMEOUT_MS || '300000', 10);

const PATHS = {
  shared:  join(ROOT, 'modes', '_shared.md'),
  oferta:  join(ROOT, 'modes', 'oferta.md'),
  cv:      join(ROOT, 'cv.md'),
  reports: join(ROOT, 'reports'),
  tracker: join(ROOT, 'batch', 'tracker-additions'),
  apps:    join(ROOT, 'data', 'applications.md'),
};

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`
Usage: node ollama-batch.mjs \\
  --url <URL> \\
  --jd-file <PATH> \\
  --report-num <NUM> \\
  --date <YYYY-MM-DD> \\
  --batch-id <ID>

Environment:
  OLLAMA_BASE_URL   (default: http://localhost:11434)
  OLLAMA_MODEL      (default: llama3.3)
  OLLAMA_TIMEOUT_MS (default: 300000)

Invoked automatically by batch-runner.sh --backend ollama.
`);
  process.exit(0);
}

let url       = '';
let jdFile    = '';
let reportNum = '';
let date      = new Date().toISOString().split('T')[0];
let batchId   = '';

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--url':        url       = args[++i]; break;
    case '--jd-file':    jdFile    = args[++i]; break;
    case '--report-num': reportNum = args[++i]; break;
    case '--date':       date      = args[++i]; break;
    case '--batch-id':   batchId   = args[++i]; break;
  }
}

if (!reportNum || !batchId) {
  console.error('ERROR: --report-num and --batch-id are required');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readFile(path, label) {
  if (!existsSync(path)) return `[${label} not found — skipping]`;
  return readFileSync(path, 'utf-8').trim();
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
}

function fail(msg, extra = {}) {
  const out = {
    status:     'failed',
    id:         batchId,
    report_num: reportNum,
    company:    'unknown',
    role:       'unknown',
    score:      null,
    pdf:        null,
    report:     null,
    error:      msg,
    ...extra,
  };
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Get JD text — file first, URL fetch fallback
// ---------------------------------------------------------------------------
let jdText = '';

if (jdFile && existsSync(jdFile)) {
  jdText = readFileSync(jdFile, 'utf-8').trim();
}

if (!jdText && url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 career-ops/1.0' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    jdText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50_000);
  } catch (err) {
    fail(`Could not fetch JD: ${err.message}`);
  }
}

if (!jdText) {
  fail('No JD text — jd-file missing/empty and URL fetch failed');
}

// ---------------------------------------------------------------------------
// Build prompt
// ---------------------------------------------------------------------------
const sharedCtx = readFile(PATHS.shared, 'modes/_shared.md');
const ofertaCtx = readFile(PATHS.oferta, 'modes/oferta.md');
const cvContent = readFile(PATHS.cv,     'cv.md');

const systemPrompt = `You are career-ops, an AI-powered job search assistant.
You evaluate job offers against the candidate's CV using a structured A-G scoring system.
Follow the evaluation methodology below exactly.

═══════════════════════════════════════════════════════
SYSTEM CONTEXT (_shared.md)
═══════════════════════════════════════════════════════
${sharedCtx}

═══════════════════════════════════════════════════════
EVALUATION MODE (oferta.md)
═══════════════════════════════════════════════════════
${ofertaCtx}

═══════════════════════════════════════════════════════
CANDIDATE RESUME (cv.md)
═══════════════════════════════════════════════════════
${cvContent}

═══════════════════════════════════════════════════════
OPERATING RULES FOR THIS BATCH SESSION
═══════════════════════════════════════════════════════
1. You do NOT have access to WebSearch, Playwright, or file-writing tools.
   - Block D (Comp research): use training-data salary estimates; note them as estimates.
   - Block G (Legitimacy): analyze JD text only. Mark posting freshness as "unverified (batch mode)".
   - File writing is handled by the script after you respond.
2. Generate all Blocks A through G in full.
3. At the very end output this exact machine-readable block (no extra whitespace):

---SCORE_SUMMARY---
COMPANY: <company name or "Unknown">
ROLE: <role title>
SCORE: <global score as decimal, e.g. 3.8>
ARCHETYPE: <detected archetype>
LEGITIMACY: <High Confidence | Proceed with Caution | Suspicious>
---END_SUMMARY---
`;

const userMessage = `BATCH EVALUATION — Report #${reportNum} | Date: ${date} | Batch ID: ${batchId}
URL: ${url || 'N/A'}

JOB DESCRIPTION TO EVALUATE:

${jdText}`;

// ---------------------------------------------------------------------------
// Call Ollama (OpenAI-compatible endpoint)
// ---------------------------------------------------------------------------
const endpoint = `${OLLAMA_BASE_URL}/v1/chat/completions`;

let evalText;
try {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:    OLLAMA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
      stream:      false,
      temperature: 0.4,
      options: { num_ctx: 32768 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    fail(`Ollama API error: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  evalText = data.choices?.[0]?.message?.content?.trim();
  if (!evalText) fail('Ollama returned an empty response');
} catch (err) {
  if (err.name === 'TimeoutError') {
    fail(`Ollama request timed out after ${Math.round(TIMEOUT_MS / 1000)}s — try a smaller model or increase OLLAMA_TIMEOUT_MS`);
  }
  fail(`Ollama API call failed: ${err.message}`);
}

// ---------------------------------------------------------------------------
// Parse SCORE_SUMMARY block
// ---------------------------------------------------------------------------
const summaryMatch = evalText.match(/---SCORE_SUMMARY---\s*([\s\S]*?)---END_SUMMARY---/);

let company    = 'unknown';
let role       = 'unknown';
let score      = null;
let archetype  = 'unknown';
let legitimacy = 'Proceed with Caution';

if (summaryMatch) {
  const extract = (key) => {
    const m = summaryMatch[1].match(new RegExp(`${key}:\\s*(.+)`));
    return m ? m[1].trim() : 'unknown';
  };
  company    = extract('COMPANY');
  role       = extract('ROLE');
  score      = parseFloat(extract('SCORE')) || null;
  archetype  = extract('ARCHETYPE');
  legitimacy = extract('LEGITIMACY');
}

const companySlug = slugify(company);
const reportFile  = `${reportNum}-${companySlug}-${date}.md`;
const reportPath  = join(PATHS.reports, reportFile);

// ---------------------------------------------------------------------------
// Write report .md
// ---------------------------------------------------------------------------
mkdirSync(PATHS.reports, { recursive: true });

const cleanEval = evalText.replace(/---SCORE_SUMMARY---[\s\S]*?---END_SUMMARY---/, '').trim();

const reportContent = `# Evaluación: ${company} — ${role}

**Fecha:** ${date}
**Arquetipo:** ${archetype}
**Score:** ${score !== null ? score + '/5' : 'N/A'}
**Legitimacy:** ${legitimacy}
**URL:** ${url || 'N/A'}
**PDF:** ❌ (generate manually: \`node generate-pdf.mjs\`)
**Batch ID:** ${batchId}
**Tool:** Ollama (${OLLAMA_MODEL})
**Verification:** unverified (batch mode)

---

${cleanEval}
`;

writeFileSync(reportPath, reportContent, 'utf-8');

// ---------------------------------------------------------------------------
// Write tracker TSV
// ---------------------------------------------------------------------------
mkdirSync(PATHS.tracker, { recursive: true });

let nextNum = 1;
if (existsSync(PATHS.apps)) {
  const content = readFileSync(PATHS.apps, 'utf-8');
  const nums = [...content.matchAll(/^\|\s*(\d+)\s*\|/gm)].map(m => parseInt(m[1], 10));
  if (nums.length > 0) nextNum = Math.max(...nums) + 1;
}

const scoreStr   = score !== null ? `${score}/5` : 'N/A';
const reportLink = `[${reportNum}](reports/${reportFile})`;
const notesStr   = `${archetype} — ${legitimacy}`;
const tsvLine    = [nextNum, date, company, role, 'Evaluada', scoreStr, '❌', reportLink, notesStr].join('\t');

writeFileSync(join(PATHS.tracker, `${batchId}.tsv`), tsvLine + '\n', 'utf-8');

// ---------------------------------------------------------------------------
// JSON summary to stdout (parsed by batch-runner.sh)
// ---------------------------------------------------------------------------
const summary = {
  status:     'completed',
  id:         batchId,
  report_num: reportNum,
  company,
  role,
  score,
  legitimacy,
  pdf:        null,
  report:     `reports/${reportFile}`,
  error:      null,
};

process.stdout.write(JSON.stringify(summary) + '\n');
