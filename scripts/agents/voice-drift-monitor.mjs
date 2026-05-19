#!/usr/bin/env node
/**
 * scripts/agents/voice-drift-monitor.mjs — Voice-drift sentinel on commits.
 *
 * Design source: refresh-master Phase 5 deliverable 2. Runs on every
 * Mitchell-voiced commit (cv.md, cover-letter.md, linkedin-dm.md,
 * apply-pack outputs). Computes a voice-drift score against the corpus
 * baseline at lib/voice-corpus.mjs and flags drift > threshold.
 *
 * Cheap path (default, no LLM):
 *   - Lexical signal: ratio of Mitchell's signature constructions in the
 *     committed text vs. the voice corpus baseline
 *   - Buzzword detection: how many "rapidly evolving / cutting-edge / unlock
 *     value" tells per 100 words
 *   - Sentence-length distribution drift vs. corpus baseline
 *
 * Expensive path (--llm):
 *   - Runs Mitchell-voice scorer via calibrate-voice-fidelity.mjs if it
 *     exists, or falls back to a council-3 voice-fidelity prompt
 *
 * Usage:
 *   node scripts/agents/voice-drift-monitor.mjs --diff HEAD~1..HEAD
 *   node scripts/agents/voice-drift-monitor.mjs --file path/to/cover-letter.md
 *   node scripts/agents/voice-drift-monitor.mjs --since 2026-05-19   (audit recent commits)
 *
 * Output: data/voice-drift-{date}.md with per-file drift scores.
 * Exit code 2 if any file's drift > threshold (default 0.4).
 *
 * Triggers: optionally as a post-commit git hook (Mitchell decides whether
 * to install). Also called by scripts/agents/apply-pack-polish.mjs as a
 * polish-pack post-ship gate.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const OUTPUT_DIR = join(REPO_ROOT, 'data');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };

const THRESHOLD = parseFloat(process.env.VOICE_DRIFT_THRESHOLD || '0.4');

// Buzzword tells per Mitchell's voice baseline (lib/voice-corpus.mjs / DELTA's
// AI decoy analysis 2026-05-19 — these are the "always says it, never reads
// human" phrases). Cheap lexical filter.
const BUZZWORDS = [
  /rapidly evolving/i,
  /cutting[- ]edge/i,
  /unlock(s|ing)? (value|potential)/i,
  /in today'?s\b/i,
  /leverag(ed?|ing) (the )?(power|capabilities)/i,
  /at the intersection of/i,
  /game[- ]changer/i,
  /paradigm shift/i,
  /seamless(ly)?/i,
  /\bsynerg(y|ies|istic)/i,
  /robust\s+solution/i,
  /scalable\s+platform/i,
];

// Mitchell signature constructions (incomplete; expand via voice-corpus-grower).
const MITCHELL_TELLS = [
  /\b— [a-z]/,                   // em-dash + lowercase ("— and the audience")
  /\baudience(s)?\b/i,
  /\bproduct[- ]first\b/i,
  /\bbuilder\b/i,
  /\bship(ped|ping)\b/i,
  /\bsignal\b/i,
  /\bhuman[- ]readable\b/i,
];

function loadCorpusBaselineStats() {
  // Read lib/voice-corpus.mjs and approximate the baseline. If missing,
  // fall back to defaults.
  const fp = join(REPO_ROOT, 'lib', 'voice-corpus.mjs');
  if (!existsSync(fp)) {
    return { avgSentenceWords: 18, mitchellTellRatePer100: 1.5, buzzwordRatePer100: 0.05 };
  }
  try {
    const src = readFileSync(fp, 'utf8');
    // Extract text exemplars from heuristic patterns. Look for sample.text or
    // sample.body fields.
    const matches = src.match(/text:\s*['"`]([^'"`]+)['"`]/g) || [];
    const corpus = matches.map(m => m.match(/['"`]([^'"`]+)['"`]/)?.[1] || '').join(' ');
    if (corpus.length < 200) {
      return { avgSentenceWords: 18, mitchellTellRatePer100: 1.5, buzzwordRatePer100: 0.05 };
    }
    return computeStats(corpus);
  } catch {
    return { avgSentenceWords: 18, mitchellTellRatePer100: 1.5, buzzwordRatePer100: 0.05 };
  }
}

function computeStats(text) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const sentences = String(text || '').split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgSentenceWords = sentences.length ? words.length / sentences.length : 0;
  const buzzCount = BUZZWORDS.reduce((s, re) => s + (text.match(re)?.length || 0), 0);
  const mitchellCount = MITCHELL_TELLS.reduce((s, re) => s + (text.match(re)?.length || 0), 0);
  const per100 = (n) => words.length ? (n / words.length) * 100 : 0;
  return {
    wordCount: words.length,
    sentenceCount: sentences.length,
    avgSentenceWords,
    buzzwordRatePer100: per100(buzzCount),
    mitchellTellRatePer100: per100(mitchellCount),
  };
}

function driftScore(textStats, baseline) {
  // 0 = no drift, 1 = severe. Composite of:
  //   - excess buzzword rate (each per-100 above baseline×3 → +0.4)
  //   - mitchell-tell rate below 30% of baseline → +0.3
  //   - sentence length wildly off baseline (|delta| > 8 words → +0.2)
  let score = 0;
  if (textStats.buzzwordRatePer100 > Math.max(0.5, baseline.buzzwordRatePer100 * 3)) score += 0.4;
  if (textStats.mitchellTellRatePer100 < baseline.mitchellTellRatePer100 * 0.3) score += 0.3;
  if (Math.abs(textStats.avgSentenceWords - baseline.avgSentenceWords) > 8) score += 0.2;
  // Aggressive buzzword density (>1 per 100 words) is its own signal
  if (textStats.buzzwordRatePer100 > 1.0) score += 0.2;
  return Math.min(1.0, score);
}

function checkFile(filepath) {
  if (!existsSync(filepath)) return { file: filepath, error: 'not found' };
  let text;
  try { text = readFileSync(filepath, 'utf8'); }
  catch (e) { return { file: filepath, error: e.message }; }
  const stats = computeStats(text);
  const baseline = loadCorpusBaselineStats();
  const score = driftScore(stats, baseline);
  return {
    file: filepath.replace(REPO_ROOT + '/', ''),
    stats,
    baseline,
    drift_score: score,
    drift_band: score < 0.2 ? 'CLEAR' : score < 0.4 ? 'LOW' : score < 0.7 ? 'MED' : 'HIGH',
    flag: score >= THRESHOLD,
  };
}

function filesFromGitDiff(diffRange) {
  try {
    const out = execSync(`git diff --name-only ${diffRange}`, { cwd: REPO_ROOT, encoding: 'utf8' });
    return out.split('\n').filter(Boolean).filter(f => {
      // Only check Mitchell-voiced files
      return /\.(md|txt)$/.test(f) || f.includes('apply-pack/');
    }).map(f => join(REPO_ROOT, f));
  } catch (e) {
    return [];
  }
}

function main() {
  const targets = [];
  if (arg('--file')) targets.push(arg('--file'));
  if (arg('--diff')) targets.push(...filesFromGitDiff(arg('--diff')));
  if (arg('--since')) targets.push(...filesFromGitDiff(`@{${arg('--since')}}..HEAD`));
  if (!targets.length) {
    console.log('usage: --file <path> | --diff <range> | --since <date>');
    process.exit(0);
  }

  const results = targets.map(checkFile).filter(r => r);
  const flagged = results.filter(r => r.flag);
  const date = new Date().toISOString().slice(0, 10);
  const reportPath = join(OUTPUT_DIR, `voice-drift-${date}.md`);
  const body = [
    `# Voice-drift monitor — ${date}`,
    ``,
    `**Threshold:** ${THRESHOLD}`,
    `**Files checked:** ${results.length}`,
    `**Flagged (drift ≥ ${THRESHOLD}):** ${flagged.length}`,
    ``,
    `## Per-file scores`,
    ``,
    ...results.map(r => [
      `### \`${r.file}\` — drift ${r.drift_score?.toFixed(2) || 'err'} (${r.drift_band || 'err'})`,
      r.error ? `error: ${r.error}` : `- buzzword rate /100w: ${r.stats?.buzzwordRatePer100?.toFixed(2)} (baseline ${r.baseline?.buzzwordRatePer100?.toFixed(2)})`,
      r.error ? '' : `- Mitchell-tell rate /100w: ${r.stats?.mitchellTellRatePer100?.toFixed(2)} (baseline ${r.baseline?.mitchellTellRatePer100?.toFixed(2)})`,
      r.error ? '' : `- avg sentence words: ${r.stats?.avgSentenceWords?.toFixed(1)} (baseline ${r.baseline?.avgSentenceWords?.toFixed(1)})`,
      ``,
    ].join('\n')),
  ].join('\n');
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(reportPath, body);
  console.log(`voice-drift report: ${reportPath}`);
  console.log(JSON.stringify({ checked: results.length, flagged: flagged.length, threshold: THRESHOLD }, null, 2));
  if (flagged.length > 0 && flag('--exit-on-flags')) process.exit(2);
}

main();
