#!/usr/bin/env node
/**
 * scripts/ai-detection-calibrate-baseline.mjs
 *
 * DELTA P2 — calibration scaffold.
 *
 * Runs Mitchell's known-human voice corpus AND a small set of obviously-AI
 * decoy texts through GPTZero + Originality. Records per-sample scores AND
 * the per-sentence highlight data GPTZero returns. The result is the
 * empirical baseline DELTA's weighted bands calibrate against.
 *
 * Output: `data/ai-detection-calibration/baseline-<date>.json` + summary
 * markdown at `data/ai-detection-calibration/baseline-<date>.md`.
 *
 * The summary numbers (human-mean, human-max, ai-mean, etc.) are written
 * to `data/ai-detection-calibration/current-thresholds.json` for the gate
 * to read at runtime.
 *
 * Usage:
 *   node scripts/ai-detection-calibrate-baseline.mjs            # use cache
 *   node scripts/ai-detection-calibrate-baseline.mjs --refresh  # force re-call
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCorpusProse } from '../lib/voice-corpus.mjs';
import { checkText } from '../lib/ai-detection-gate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'data', 'ai-detection-calibration');

try {
  const { config } = await import('dotenv');
  config({ path: join(ROOT, '.env'), override: true });
} catch { /* ignore */ }

const ARGV = new Set(process.argv.slice(2));
const SKIP_CACHE = ARGV.has('--refresh');

// Decoy AI texts — generated AI-typical prose to anchor the high end of the
// scale. These are intentionally NOT Mitchell's voice — they're the kind of
// generic "today's landscape" cover-letter sludge an LLM produces without
// constraint. The score-distribution gap between these and Mitchell's actual
// writing is the signal DELTA's bands rely on.
const AI_DECOYS = [
  {
    id: 'ai-decoy-corporate-jargon',
    register: 'narrative',
    text: `In today's rapidly evolving landscape, it is imperative that we leverage data-driven insights to navigate complex challenges. Furthermore, organizations must streamline operations and foster a culture of continuous improvement. By harnessing the power of artificial intelligence, stakeholders can unlock new opportunities and drive transformative growth across the enterprise. Moreover, embracing innovation and championing best practices will ensure that we remain at the forefront of our industry.`,
  },
  {
    id: 'ai-decoy-generic-cover-letter',
    register: 'narrative',
    text: `I am writing to express my enthusiastic interest in the position. I believe my unique blend of skills and experiences makes me an ideal candidate. Throughout my career, I have consistently demonstrated the ability to deliver results in fast-paced environments. I am passionate about leveraging cutting-edge technology to drive impactful outcomes. I would be thrilled to bring my expertise to your innovative team and contribute to your continued success.`,
  },
  {
    id: 'ai-decoy-buzzword-paragraph',
    register: 'mixed',
    text: `As we navigate the complexities of the modern business landscape, it becomes increasingly important to align cross-functional teams around a unified vision. By fostering collaboration and breaking down silos, we can unlock synergies that propel organizations toward sustainable growth. Embracing a holistic approach to talent development empowers individuals to thrive while driving collective success.`,
  },
];

function chunkForDetector(text) {
  return text.slice(0, 5000);
}

async function scoreOne(id, prose, options) {
  const t0 = Date.now();
  const r = await checkText(chunkForDetector(prose), { skipCache: SKIP_CACHE, budgetUsd: 0.10 });
  return {
    id,
    elapsed_ms: Date.now() - t0,
    options,
    gptzero_prob: r.gptzero_prob,
    originality_prob: r.originality_prob,
    verdict: r.verdict,
    passes: r.passes,
    from_cache: r.from_cache,
    gptzero_error: r.gptzero_error,
    originality_error: r.originality_error,
  };
}

function mean(arr) {
  const xs = arr.filter(x => x != null);
  if (!xs.length) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000;
}
function max(arr) { const xs = arr.filter(x => x != null); return xs.length ? Math.max(...xs) : null; }
function min(arr) { const xs = arr.filter(x => x != null); return xs.length ? Math.min(...xs) : null; }

async function run() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.error('[calibrate] loading human corpus...');
  const humans = loadCorpusProse(['high', 'medium']);
  const validHumans = humans.filter(h => h.word_count > 50 && !h.missing);
  console.error(`[calibrate] ${validHumans.length} human samples, ${AI_DECOYS.length} AI decoys`);

  const human_results = [];
  for (const h of validHumans) {
    console.error(`[calibrate] scoring HUMAN ${h.id} (${h.word_count} words)...`);
    const r = await scoreOne(h.id, h.prose, { confidence: h.confidence, register: h.register, path: h.path });
    human_results.push(r);
  }

  const ai_results = [];
  for (const d of AI_DECOYS) {
    console.error(`[calibrate] scoring AI DECOY ${d.id}...`);
    const r = await scoreOne(d.id, d.text, { register: d.register });
    ai_results.push(r);
  }

  const summary = {
    calibrated_at: new Date().toISOString(),
    sample_counts: { human: human_results.length, ai_decoy: ai_results.length },
    human: {
      gptzero: {
        mean: mean(human_results.map(r => r.gptzero_prob)),
        max:  max(human_results.map(r => r.gptzero_prob)),
        min:  min(human_results.map(r => r.gptzero_prob)),
      },
      originality: {
        mean: mean(human_results.map(r => r.originality_prob)),
        max:  max(human_results.map(r => r.originality_prob)),
        min:  min(human_results.map(r => r.originality_prob)),
      },
    },
    ai: {
      gptzero: {
        mean: mean(ai_results.map(r => r.gptzero_prob)),
        max:  max(ai_results.map(r => r.gptzero_prob)),
        min:  min(ai_results.map(r => r.gptzero_prob)),
      },
      originality: {
        mean: mean(ai_results.map(r => r.originality_prob)),
        max:  max(ai_results.map(r => r.originality_prob)),
        min:  min(ai_results.map(r => r.originality_prob)),
      },
    },
  };

  // Derive weighted-band thresholds. The empirical principle is:
  //   AUTHENTICITY = how Mitchell-like is the text, vs. how AI-decoy-like is it.
  // We use the human-MAX (worst-case false positive in Mitchell's own writing)
  // as the upper bound for the CLEAR band — anything below that is at most
  // as suspicious as Mitchell's own canonical prose. Above human-MAX, we
  // band toward AI-decoy-MIN (best-case under-flag of AI prose).
  const humanMaxGz   = summary.human.gptzero.max   ?? 0;
  const humanMaxOrig = summary.human.originality.max ?? 0;
  const aiMinGz   = summary.ai.gptzero.min   ?? 1;
  const aiMinOrig = summary.ai.originality.min ?? 1;

  // CLEAR band ceiling: human-MAX (anything Mitchell himself produces).
  // CRIT band floor: AI-decoy-MIN (anything as bad as a known AI decoy).
  // MED/HIGH split the middle.
  const thresholds = {
    derived_at: summary.calibrated_at,
    rationale: 'Bands anchored to empirical baseline: CLEAR ceiling = max prob observed on Mitchell\'s own writing; CRIT floor = min prob observed on AI decoys; HIGH = upper-mid; MED = lower-mid.',
    gptzero: {
      CLEAR: { max: round2(humanMaxGz) },
      MED:   { min: round2(humanMaxGz), max: round2((humanMaxGz + aiMinGz) / 2) },
      HIGH:  { min: round2((humanMaxGz + aiMinGz) / 2), max: round2(aiMinGz) },
      CRIT:  { min: round2(aiMinGz) },
    },
    originality: {
      CLEAR: { max: round2(humanMaxOrig) },
      MED:   { min: round2(humanMaxOrig), max: round2((humanMaxOrig + aiMinOrig) / 2) },
      HIGH:  { min: round2((humanMaxOrig + aiMinOrig) / 2), max: round2(aiMinOrig) },
      CRIT:  { min: round2(aiMinOrig) },
    },
    notes: [
      'These bands are RELATIVE to Mitchell\'s baseline, not absolute. A 0.95 GPTZero score may sit in CLEAR if Mitchell\'s own writing scores 0.99 — the gate is calibrated to authenticity vs Mitchell, not detection-evasion vs the platform.',
      'Re-run `node scripts/ai-detection-calibrate-baseline.mjs --refresh` after every meaningful voice-corpus update to refresh these bands.',
      'AUTHENTICITY band reports the worst (max) prob across both detectors after band assignment — a single CRIT detector dominates, since false-positive-on-AI is the costly error.',
    ],
  };

  function round2(x) { return Math.round(x * 100) / 100; }

  const stamp = summary.calibrated_at.slice(0, 10);
  const jsonPath = join(OUT_DIR, `baseline-${stamp}.json`);
  const currentThresholdsPath = join(OUT_DIR, 'current-thresholds.json');

  writeFileSync(jsonPath, JSON.stringify({ summary, human_results, ai_results, thresholds }, null, 2));
  writeFileSync(currentThresholdsPath, JSON.stringify(thresholds, null, 2));

  // Markdown summary
  const md = [];
  md.push('# DELTA — AI Detection Calibration Baseline');
  md.push('');
  md.push(`**Calibrated at:** ${summary.calibrated_at}`);
  md.push(`**Samples:** ${summary.sample_counts.human} human · ${summary.sample_counts.ai_decoy} AI decoy`);
  md.push('');
  md.push('## Human baseline (Mitchell\'s voice corpus)');
  md.push('');
  md.push('| id | confidence | register | words | GPTZero | Originality |');
  md.push('|---|---|---|---|---|---|');
  for (let i = 0; i < human_results.length; i++) {
    const r = human_results[i];
    const h = validHumans[i];
    md.push(`| ${r.id} | ${r.options.confidence} | ${r.options.register} | ${h.word_count} | ${r.gptzero_prob ?? 'n/a'} | ${r.originality_prob ?? 'n/a'} |`);
  }
  md.push('');
  md.push(`**Aggregate (human):**`);
  md.push(`- GPTZero — mean ${summary.human.gptzero.mean} · max ${summary.human.gptzero.max} · min ${summary.human.gptzero.min}`);
  md.push(`- Originality — mean ${summary.human.originality.mean} · max ${summary.human.originality.max} · min ${summary.human.originality.min}`);
  md.push('');
  md.push('## AI decoy baseline');
  md.push('');
  md.push('| id | register | GPTZero | Originality |');
  md.push('|---|---|---|---|');
  for (const r of ai_results) {
    md.push(`| ${r.id} | ${r.options.register} | ${r.gptzero_prob ?? 'n/a'} | ${r.originality_prob ?? 'n/a'} |`);
  }
  md.push('');
  md.push(`**Aggregate (AI decoy):**`);
  md.push(`- GPTZero — mean ${summary.ai.gptzero.mean} · max ${summary.ai.gptzero.max} · min ${summary.ai.gptzero.min}`);
  md.push(`- Originality — mean ${summary.ai.originality.mean} · max ${summary.ai.originality.max} · min ${summary.ai.originality.min}`);
  md.push('');
  md.push('## Derived weighted bands (`current-thresholds.json`)');
  md.push('');
  md.push('```json');
  md.push(JSON.stringify(thresholds, null, 2));
  md.push('```');
  md.push('');
  md.push('## Interpretation');
  md.push('');
  md.push('GPTZero false-positive rate on Mitchell\'s known-human writing is the load-bearing data point. If `human.gptzero.max ≥ 0.9`, the detector cannot distinguish authentic Mitchell prose from AI prose — the bands MUST anchor to that baseline, not to absolute scores. The gate refuses to fail an artifact below the human-max ceiling because that would be a guaranteed false positive.');
  md.push('');
  md.push('See `data/delta-detector-field-audit-2026-05-19.md` for the raw field shapes the detectors return.');
  md.push('');

  const mdPath = join(OUT_DIR, `baseline-${stamp}.md`);
  writeFileSync(mdPath, md.join('\n'));

  console.error(`[calibrate] wrote ${jsonPath}`);
  console.error(`[calibrate] wrote ${currentThresholdsPath}`);
  console.error(`[calibrate] wrote ${mdPath}`);
  console.error('---');
  console.error('Human GPTZero max  =', humanMaxGz,   '· AI GPTZero min  =', aiMinGz);
  console.error('Human Orig.   max  =', humanMaxOrig, '· AI Orig.   min  =', aiMinOrig);
}

run().catch(e => { console.error('[calibrate] fatal:', e); process.exit(1); });
