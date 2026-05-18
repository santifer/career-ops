#!/usr/bin/env node
/**
 * scripts/calibrate-ai-detectors.mjs — AI-detector FPR calibration (O11).
 *
 * Runs humanize-check-passed cover letters through external AI detectors
 * (GPTZero, Originality.ai) to record the actual false-positive rate (FPR)
 * on Mitchell's writing style. Outputs a calibration JSON used to tune
 * the humanize-check threshold.
 *
 * Usage:
 *   node scripts/calibrate-ai-detectors.mjs [--dry-run] [--output <path>]
 *
 * Options:
 *   --dry-run    Run local heuristics only; skip external API calls
 *   --output     Override output path (default: data/humanize-calibration-YYYY-MM-DD.json)
 *   --samples    Comma-separated paths to specific CL files (overrides auto-discovery)
 *
 * API keys (read from .env):
 *   GPTZERO_API_KEY      — GPTZero v2 API key
 *   ORIGINALITY_API_KEY  — Originality.ai API key
 *   If missing, the detector is skipped and documented in the output.
 *
 * Budget cap: $5 total (enforced by keeping sample count to 3 CLs).
 * Cost estimate: GPTZero ~$0.01/call, Originality.ai ~$0.01/call → ~$0.06 total.
 *
 * Output structure:
 *   data/humanize-calibration-{date}.json
 *   data/humanize-calibration.json (symlink/copy for latest)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Load .env
try {
  const { config } = await import('dotenv');
  config({ path: join(ROOT, '.env'), override: true });
} catch { /* dotenv optional */ }

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = (() => {
  const a = { dryRun: false, output: null, samples: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') { a.dryRun = true; }
    else if (argv[i] === '--output'  && argv[i+1]) { a.output  = argv[++i]; }
    else if (argv[i] === '--samples' && argv[i+1]) { a.samples = argv[++i]; }
  }
  return a;
})();

// ── Sample discovery ──────────────────────────────────────────────────────────

// Resolve the main repo root: worktrees have ROOT pointing to the worktree dir.
// The canonical apply-pack/ directory lives in the main repo (one level up from
// the .claude/worktrees/<id>/ directory structure).
const MAIN_REPO_ROOT = (() => {
  // Worktree path: /path/to/career-ops/.claude/worktrees/<id>
  // Main repo:     /path/to/career-ops
  const parts = ROOT.split('/');
  const claudeIdx = parts.lastIndexOf('.claude');
  if (claudeIdx > 0) {
    return parts.slice(0, claudeIdx).join('/');
  }
  return ROOT; // fallback: same as ROOT if not in a worktree
})();

const CANDIDATE_SAMPLES = [
  // Priority order per spec (worktree paths first, then main repo)
  join(ROOT, 'data/apply-packs/050-elevenlabs-communications-manager/cover-letter.md'),
  join(ROOT, 'apply-pack/050-elevenlabs-communications-manager/cover-letter.md'),
  join(MAIN_REPO_ROOT, 'apply-pack/050-elevenlabs-communications-manager/cover-letter.md'),
  join(MAIN_REPO_ROOT, 'apply-pack/053-openai-policy-communications-manager/cover-letter.md'),
  join(MAIN_REPO_ROOT, 'apply-pack/059-sierra-developer-relations-engineer-nyc/cover-letter.md'),
  join(MAIN_REPO_ROOT, 'apply-pack/001-anthropic-communications-manager-research/cover-letter.md'),
  join(MAIN_REPO_ROOT, 'apply-pack/048-anthropic-engineering-editorial-lead/cover-letter.md'),
  join(MAIN_REPO_ROOT, 'apply-pack/051-openai-research-communications-manager/cover-letter.md'),
];

function discoverSamples(limit = 3) {
  if (args.samples) {
    return args.samples.split(',').map(s => resolve(s.trim())).filter(existsSync).slice(0, limit);
  }
  return CANDIDATE_SAMPLES.filter(existsSync).slice(0, limit);
}

// ── Local heuristics via humanize-check.mjs (runCheck export) ─────────────────

async function localCheck(text) {
  try {
    const { runCheck } = await import('./humanize-check.mjs');
    const result = runCheck(text);
    return {
      score: result.score,
      risk: result.risk?.label ?? result.risk ?? 'UNKNOWN',
      details: {
        burstiness: result.checks?.burstiness?.score ?? null,
        phrases: result.checks?.phrases?.score ?? null,
        passive: result.checks?.passive?.score ?? null,
        transitions: result.checks?.transitions?.score ?? null,
        word_count: result.wordCount ?? null,
        sentence_count: result.sentenceCount ?? null,
      },
    };
  } catch (e) {
    return { score: null, risk: 'ERROR', details: { error: String(e.message || e) } };
  }
}

// ── GPTZero v2 API ────────────────────────────────────────────────────────────
// Endpoint: POST https://api.gptzero.me/v2/predict/text
// Pricing: ~$0.01/document as of 2026-05 (free tier: 2,000 words/min)
// Response: { documents: [{ average_generated_prob, completely_generated_prob, ... }] }

async function runGPTZero(text) {
  const key = process.env.GPTZERO_API_KEY;
  if (!key) {
    return { skipped: true, reason: 'GPTZERO_API_KEY not set in .env' };
  }
  try {
    const resp = await fetch('https://api.gptzero.me/v2/predict/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
      },
      body: JSON.stringify({
        document: text.slice(0, 5000),
        multilingual: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return {
        skipped: false,
        error: `HTTP ${resp.status}: ${body.slice(0, 200)}`,
        prob: null,
        verdict: null,
      };
    }

    const data = await resp.json();
    const doc = data.documents?.[0];
    if (!doc) {
      return { skipped: false, error: 'No documents in response', prob: null, verdict: null };
    }

    const prob = doc.average_generated_prob ?? doc.completely_generated_prob ?? null;
    const verdict = prob != null
      ? (prob > 0.8 ? 'AI' : prob > 0.5 ? 'MIXED' : 'HUMAN')
      : null;

    return {
      skipped: false,
      prob: prob != null ? Math.round(prob * 100) / 100 : null,
      verdict,
      raw_average_generated_prob: doc.average_generated_prob ?? null,
      raw_completely_generated_prob: doc.completely_generated_prob ?? null,
      burstiness_score: doc.burstiness_score ?? null,
      class_probabilities: doc.class_probabilities ?? null,
    };
  } catch (e) {
    return { skipped: false, error: String(e.message || e), prob: null, verdict: null };
  }
}

// ── Originality.ai API ────────────────────────────────────────────────────────
// Endpoint: POST https://api.originality.ai/api/v1/scan/ai
// Pricing: ~$0.01/100 words (credits-based)
// Response: { score: { ai, original }, status: 'success' }

async function runOriginalityAI(text) {
  const key = process.env.ORIGINALITY_API_KEY;
  if (!key) {
    return { skipped: true, reason: 'ORIGINALITY_API_KEY not set in .env' };
  }
  try {
    const resp = await fetch('https://api.originality.ai/api/v1/scan/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OAI-API-KEY': key,
      },
      body: JSON.stringify({
        content: text.slice(0, 5000),
        aiModelVersion: '1',
        // storeScan: false  // don't store to avoid retention
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return {
        skipped: false,
        error: `HTTP ${resp.status}: ${body.slice(0, 200)}`,
        prob: null,
        verdict: null,
      };
    }

    const data = await resp.json();
    if (data.status !== 'success' && !data.score) {
      return {
        skipped: false,
        error: `API error: ${JSON.stringify(data).slice(0, 200)}`,
        prob: null,
        verdict: null,
      };
    }

    const aiScore = data.score?.ai ?? null;
    const verdict = aiScore != null
      ? (aiScore > 0.8 ? 'AI' : aiScore > 0.5 ? 'MIXED' : 'HUMAN')
      : null;

    return {
      skipped: false,
      prob: aiScore != null ? Math.round(aiScore * 100) / 100 : null,
      verdict,
      raw_ai_score: aiScore,
      raw_original_score: data.score?.original ?? null,
      credits_used: data.credits_used ?? null,
    };
  } catch (e) {
    return { skipped: false, error: String(e.message || e), prob: null, verdict: null };
  }
}

// ── Extract body text from cover-letter.md format ────────────────────────────

function extractBodyText(raw) {
  const sepMatches = [...raw.matchAll(/^---$/gm)];
  let body = raw;
  if (sepMatches.length >= 2) {
    body = raw.slice(sepMatches[0].index + 3, sepMatches[1].index).trim();
  } else if (sepMatches.length === 1) {
    body = raw.slice(sepMatches[0].index + 3).trim();
  }
  // Strip metadata comments and blockquotes
  body = body.replace(/<!--[\s\S]*?-->/g, '');
  body = body.replace(/^>.*$/gm, '');
  body = body.replace(/^#{1,6}\s+.+$/gm, '');
  return body.trim();
}

// ── Compute recommended threshold from calibration results ────────────────────

function computeRecommendation(samples, currentThreshold = 20) {
  const localScores = samples
    .map(s => s.local?.score)
    .filter(s => s != null);

  if (localScores.length === 0) {
    return {
      recommended_humanize_threshold: currentThreshold,
      reasoning: 'No local scores available — keeping current threshold',
    };
  }

  const maxLocalScore = Math.max(...localScores);
  const avgLocalScore = Math.round(localScores.reduce((a, b) => a + b, 0) / localScores.length);

  // If all CLs score below threshold, threshold is probably fine
  // If any CL exceeds threshold, consider raising it to max + 5
  const suggestedThreshold = maxLocalScore > currentThreshold
    ? Math.min(45, maxLocalScore + 5)  // raise but cap at MEDIUM band
    : currentThreshold;

  const gptzeroProbs = samples
    .map(s => s.gptzero?.prob)
    .filter(p => p != null);
  const origProbs = samples
    .map(s => s.originality?.prob)
    .filter(p => p != null);

  return {
    recommended_humanize_threshold: suggestedThreshold,
    current_threshold: currentThreshold,
    max_local_score: maxLocalScore,
    avg_local_score: avgLocalScore,
    gptzero_avg_fpr: gptzeroProbs.length > 0
      ? Math.round((gptzeroProbs.reduce((a, b) => a + b, 0) / gptzeroProbs.length) * 100) / 100
      : null,
    originality_avg_fpr: origProbs.length > 0
      ? Math.round((origProbs.reduce((a, b) => a + b, 0) / origProbs.length) * 100) / 100
      : null,
    gptzero_sample_count: gptzeroProbs.length,
    originality_sample_count: origProbs.length,
    reasoning: suggestedThreshold !== currentThreshold
      ? `Raised from ${currentThreshold} to ${suggestedThreshold}: max local score ${maxLocalScore} exceeded current threshold`
      : `Keeping threshold at ${currentThreshold}: all samples scored below threshold (max=${maxLocalScore}, avg=${avgLocalScore})`,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const outputPath = args.output
    ? resolve(args.output)
    : join(ROOT, `data/humanize-calibration-${today}.json`);
  const latestPath = join(ROOT, 'data/humanize-calibration.json');

  console.log('O11 — AI-detector FPR calibration');
  console.log(`Date: ${today}`);
  console.log(`Output: ${outputPath}`);
  console.log('');

  // ── 1. Discover samples ─────────────────────────────────────────────────

  const samplePaths = discoverSamples(3);
  if (samplePaths.length === 0) {
    console.error('No cover-letter.md samples found. Check apply-pack/ directory.');
    process.exit(1);
  }
  console.log(`Samples found: ${samplePaths.length}`);
  for (const p of samplePaths) {
    console.log(`  - ${p.replace(ROOT + '/', '')}`);
  }
  console.log('');

  // ── 2. Check API key availability ──────────────────────────────────────

  const gptzeroKeyPresent = !!process.env.GPTZERO_API_KEY;
  const originalityKeyPresent = !!process.env.ORIGINALITY_API_KEY;

  console.log('API key status:');
  console.log(`  GPTZero:        ${gptzeroKeyPresent ? 'PRESENT' : 'MISSING — will skip'}`);
  console.log(`  Originality.ai: ${originalityKeyPresent ? 'PRESENT' : 'MISSING — will skip'}`);
  if (!gptzeroKeyPresent)     console.log('  → To enable: add GPTZERO_API_KEY to .env');
  if (!originalityKeyPresent) console.log('  → To enable: add ORIGINALITY_API_KEY to .env');
  console.log('');

  if (args.dryRun) {
    console.log('--dry-run: running local heuristics only, no API calls.');
    console.log('');
  }

  // ── 3. Process each sample ──────────────────────────────────────────────

  const sampleResults = [];
  let totalApiCost = 0;

  for (let i = 0; i < samplePaths.length; i++) {
    const p = samplePaths[i];
    const id = `sample_${String(i + 1).padStart(2, '0')}`;
    const rawText = readFileSync(p, 'utf-8');
    const bodyText = extractBodyText(rawText);

    console.log(`Processing ${id}: ${p.replace(ROOT + '/', '')}`);
    console.log(`  Body: ${bodyText.split(/\s+/).length} words`);

    // Local heuristics (always run)
    const local = await localCheck(bodyText);
    console.log(`  Local score: ${local.score}% (${local.risk})`);

    // GPTZero
    let gptzero = { skipped: true, reason: 'API key not configured' };
    if (!args.dryRun && gptzeroKeyPresent) {
      process.stdout.write('  GPTZero: calling API... ');
      gptzero = await runGPTZero(bodyText);
      if (gptzero.skipped) {
        console.log('skipped');
      } else if (gptzero.error) {
        console.log(`ERROR — ${gptzero.error.slice(0, 80)}`);
      } else {
        const cost = 0.01; // ~$0.01/call estimate
        totalApiCost += cost;
        console.log(`${(gptzero.prob * 100).toFixed(0)}% AI probability (${gptzero.verdict})`);
      }
    } else if (!args.dryRun && !gptzeroKeyPresent) {
      console.log('  GPTZero: skipped (no API key)');
    }

    // Originality.ai
    let originality = { skipped: true, reason: 'API key not configured' };
    if (!args.dryRun && originalityKeyPresent) {
      process.stdout.write('  Originality.ai: calling API... ');
      originality = await runOriginalityAI(bodyText);
      if (originality.skipped) {
        console.log('skipped');
      } else if (originality.error) {
        console.log(`ERROR — ${originality.error.slice(0, 80)}`);
      } else {
        const cost = 0.01;
        totalApiCost += cost;
        console.log(`${(originality.prob * 100).toFixed(0)}% AI probability (${originality.verdict})`);
      }
    } else if (!args.dryRun && !originalityKeyPresent) {
      console.log('  Originality.ai: skipped (no API key)');
    }

    sampleResults.push({
      id,
      path: p.replace(ROOT + '/', ''),
      word_count: bodyText.split(/\s+/).filter(Boolean).length,
      humanize_check_score: local.score,
      humanize_check_risk: local.risk,
      local: local,
      gptzero: args.dryRun ? { skipped: true, reason: 'dry-run mode' } : gptzero,
      originality: args.dryRun ? { skipped: true, reason: 'dry-run mode' } : originality,
    });

    console.log('');
  }

  // ── 4. Compute summary ──────────────────────────────────────────────────

  const summary = computeRecommendation(sampleResults, 20);

  // ── 5. Write output ─────────────────────────────────────────────────────

  const calibrationData = {
    calibrated_at: new Date().toISOString(),
    calibrated_by: 'scripts/calibrate-ai-detectors.mjs',
    dry_run: args.dryRun,
    api_keys_present: {
      gptzero: gptzeroKeyPresent,
      originality: originalityKeyPresent,
    },
    api_cost_estimate_usd: totalApiCost,
    samples: sampleResults,
    summary,
    notes: [
      'FPR = false-positive rate: probability that Mitchell\'s human-written CLs are flagged as AI.',
      'Local score = humanize-check.mjs composite (burstiness + phrases + passive + transitions).',
      'GPTZero + Originality provide external validation; local heuristics are used for the humanize gate.',
      gptzeroKeyPresent     ? null : 'GPTZero was not configured — add GPTZERO_API_KEY to .env for external validation.',
      originalityKeyPresent ? null : 'Originality.ai was not configured — add ORIGINALITY_API_KEY to .env for external validation.',
    ].filter(Boolean),
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(calibrationData, null, 2), 'utf-8');
  writeFileSync(latestPath,  JSON.stringify(calibrationData, null, 2), 'utf-8');

  console.log('=== Calibration Summary ===');
  console.log(`Samples processed:     ${sampleResults.length}`);
  console.log(`Local avg score:       ${summary.avg_local_score}%`);
  console.log(`Local max score:       ${summary.max_local_score}%`);
  if (summary.gptzero_avg_fpr != null) {
    console.log(`GPTZero avg FPR:       ${(summary.gptzero_avg_fpr * 100).toFixed(0)}%`);
  } else {
    console.log(`GPTZero avg FPR:       N/A (key not configured)`);
  }
  if (summary.originality_avg_fpr != null) {
    console.log(`Originality avg FPR:   ${(summary.originality_avg_fpr * 100).toFixed(0)}%`);
  } else {
    console.log(`Originality avg FPR:   N/A (key not configured)`);
  }
  console.log(`API cost (this run):   $${totalApiCost.toFixed(4)}`);
  console.log(`Recommended threshold: ${summary.recommended_humanize_threshold}% (was ${summary.current_threshold}%)`);
  console.log(`Reasoning:             ${summary.reasoning}`);
  console.log('');
  console.log(`Output written: ${outputPath.replace(ROOT + '/', '')}`);
  console.log(`Latest copy:     data/humanize-calibration.json`);

  if (!gptzeroKeyPresent || !originalityKeyPresent) {
    console.log('');
    console.log('NOTE: External detectors were not run due to missing API keys.');
    console.log('The calibration JSON includes local heuristic results only.');
    console.log('To add external validation:');
    if (!gptzeroKeyPresent)     console.log('  echo "GPTZERO_API_KEY=your_key" >> .env');
    if (!originalityKeyPresent) console.log('  echo "ORIGINALITY_API_KEY=your_key" >> .env');
    console.log('Then re-run: node scripts/calibrate-ai-detectors.mjs');
  }

  return calibrationData;
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] || '')) {
  main().catch(err => {
    console.error('Calibration failed:', err.message);
    process.exit(1);
  });
}

export { main as runCalibration };
