#!/usr/bin/env node
/**
 * golden-budget-analysis.mjs — Static token budget analysis for golden cases
 *
 * For each golden case, computes:
 *   1. Token count with full context (--no-compress)
 *   2. Token count with compressed context (default)
 *   3. Which sections would be trimmed
 *   4. Whether any P0 section would be affected (should NEVER happen)
 *
 * Zero API calls — purely static analysis of the compression logic against
 * the actual _shared.md and golden case JDs.
 *
 * Usage:
 *   node lib/golden-budget-analysis.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildBudgetedPrompt, SECTION_PRIORITY } from './context-budget.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN_DIR = join(ROOT, 'evals', 'golden');

if (!existsSync(GOLDEN_DIR)) {
  console.error('Golden directory not found:', GOLDEN_DIR);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load context files
// ---------------------------------------------------------------------------
function readFile(path, label) {
  if (!existsSync(path)) {
    console.warn(`  ⚠️  ${label} not found: ${path}`);
    return `[${label} not found]`;
  }
  return readFileSync(path, 'utf-8').trim();
}

const sharedContent = readFile(join(ROOT, 'modes', '_shared.md'), '_shared.md');
const ofertaContent = readFile(join(ROOT, 'modes', 'oferta.md'), 'oferta.md');
const cvContent = readFile(join(ROOT, 'cv.md'), 'cv.md');

const p0Keys = Object.entries(SECTION_PRIORITY)
  .filter(([, p]) => p === 0)
  .map(([k]) => k);

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

// No cv.md in a fresh checkout — use a realistic synthetic CV for testing.
// A typical cv.md is 500-3000 lines of markdown; 80 lines is a short CV.
const SYNTHETIC_CV = [
  '# John Doe — Senior AI Engineer',
  '',
  '## Summary',
  'Senior AI/ML engineer with 8+ years building production LLM systems,',
  'RAG pipelines, and agent orchestration platforms. Led teams of 3-8 engineers.',
  '',
  '## Experience',
  '',
  '### Head of AI — TechCorp (2022-Present)',
  '- Built multi-agent orchestration platform serving 2M+ requests/day',
  '- Reduced inference latency 40% via custom batching and KV-cache optimization',
  '- Managed $1.2M GPU budget across AWS and GCP',
  '- Hired and mentored team of 6 ML engineers',
  '',
  '### Senior ML Engineer — StartupAI (2020-2022)',
  '- Designed RAG pipeline over 50M documents using pgvector + Cohere embeddings',
  '- Built evaluation framework (ragas + custom metrics) catching 23% of bad retrievals',
  '- Shipped 3 product features from 0→1 in 18 months',
  '',
  '### ML Engineer — DataCo (2018-2020)',
  '- Deployed first production NLP pipeline (NER + classification)',
  '- Migrated legacy ML infra to Kubernetes, cutting costs 35%',
  '',
  '## Skills',
  'Python, PyTorch, LangChain, Vector DBs (pgvector, Pinecone), Kubernetes,',
  'AWS/GCP, Docker, CI/CD, Prompt Engineering, Evals & Observability',
  '',
  '## Education',
  'MS Computer Science, Stanford University (2018)',
  'BS Computer Science, UC Berkeley (2016)',
].join('\n');

const SCENARIOS = {
  'Gemini Flash (1M ctx, 128K budget)': { budget: 128000, margin: 8192 },
  'GPT-4o-mini (128K ctx, 100K budget)': { budget: 100000, margin: 8192 },
  'Local/Ollama (8K ctx, 6K budget)': { budget: 8000, margin: 2000 },
};

// ---------------------------------------------------------------------------
// Analyze each golden case
// ---------------------------------------------------------------------------
const caseFiles = readdirSync(GOLDEN_DIR).filter(f => f.endsWith('.json'));

for (const [scenarioName, { budget, margin }] of Object.entries(SCENARIOS)) {
  console.log(`\n${'═'.repeat(88)}`);
  console.log(`Scenario: ${scenarioName}`);
  console.log(`CV: synthetic (${SYNTHETIC_CV.length} chars, ${SYNTHETIC_CV.split('\n').length} lines)`);
  console.log(`${'═'.repeat(88)}\n`);

  const results = [];
  let totalTokensSaved = 0;
  let totalCasesCompressed = 0;

  for (const file of caseFiles) {
    const tc = JSON.parse(readFileSync(join(GOLDEN_DIR, file), 'utf8'));

    // Run with compression (default)
    const { budgetReport: compressedReport } = buildBudgetedPrompt({
      sharedContent,
      ofertaContent,
      cvContent: SYNTHETIC_CV,
      jdText: tc.jd,
      maxTokens: budget,
      safetyMargin: margin,
    });

    // Run without compression (--no-compress)
    const { budgetReport: fullReport } = buildBudgetedPrompt({
      sharedContent,
      ofertaContent,
      cvContent: SYNTHETIC_CV,
      jdText: tc.jd,
      maxTokens: budget,
      safetyMargin: margin,
      noCompress: true,
    });

    const saved = fullReport.totalTokens - compressedReport.afterTokens;
    const savedPct = fullReport.totalTokens > 0
      ? Math.round((saved / fullReport.totalTokens) * 100)
      : 0;

    // Safety check: are any P0 sections in the removed list?
    const p0Violated = compressedReport.removed.some(name => {
      const key = name.toLowerCase()
        .replace(/\s*\([^)]*\)\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return p0Keys.includes(key);
    });

    if (compressedReport.compressed) totalCasesCompressed++;
    totalTokensSaved += saved;

    results.push({
      id: tc.id,
      labelArchetype: tc.label.archetype,
      labelScore: tc.label.score,
      compressed: compressedReport.compressed,
      beforeTokens: fullReport.totalTokens,
      afterTokens: compressedReport.afterTokens,
      saved,
      savedPct,
      removed: compressedReport.removed,
      p0Violated,
    });
  }

  // Per-case table
  console.log('Case                           | Archetype (label)         | Before  | After   | Saved |  % | Status');
  console.log('───────────────────────────────┼───────────────────────────┼─────────┼─────────┼───────┼────┼───────');

  let p0Clean = true;
  for (const r of results) {
    const id = r.id.padEnd(29).slice(0, 29);
    const arch = r.labelArchetype.padEnd(25).slice(0, 25);
    const savedStr = String(r.saved).padStart(5);
    const pctStr = (r.savedPct + '%').padStart(3);
    const status = r.compressed
      ? (r.p0Violated ? '⚠️ P0 VIOLATION' : '✅ compressed')
      : '  not needed';

    if (r.p0Violated) p0Clean = false;
    console.log(`${id} | ${arch} | ${String(r.beforeTokens).padStart(7)} | ${String(r.afterTokens).padStart(7)} | ${savedStr} | ${pctStr} | ${status}`);
  }

  // Summary
  const avgSavedPct = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.savedPct, 0) / results.length)
    : 0;

  console.log(`\n  Summary:`);
  console.log(`  Cases compressed:     ${totalCasesCompressed}/${results.length}`);
  console.log(`  Avg tokens saved:     ${Math.round(totalTokensSaved / results.length)}/case`);
  console.log(`  Avg savings %:        ${avgSavedPct}%`);
  console.log(`  P0 integrity:         ${p0Clean ? '✅ CLEAN — no P0 section trimmed' : '❌ VIOLATED'}`);

  if (totalCasesCompressed > 0) {
    const trimCounts = {};
    for (const r of results) {
      for (const name of r.removed) {
        trimCounts[name] = (trimCounts[name] || 0) + 1;
      }
    }
    console.log(`  Trimmed sections:`);
    const sorted = Object.entries(trimCounts).sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted) {
      const key = name.toLowerCase()
        .replace(/\s*\([^)]*\)\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const p = SECTION_PRIORITY[key];
      const label = p != null ? `P${p}` : `P${2}*`;
      console.log(`    ${label} — ${name} (${count}/${results.length})`);
    }
  }
}

console.log('');
