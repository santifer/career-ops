#!/usr/bin/env node
/**
 * scripts/calibrate-voice-fidelity.mjs
 *
 * O10: Voice-fidelity calibration on Mitchell's past cover letters.
 *
 * Per Phase 3 strategy doc (data/output-pipeline-strategy-2026-05-17.md) Day 7:
 *   "Run Mitchell's 10 best past cover letters through the voice-pass cosine
 *    gate. Record actual cosine distribution. Tune threshold from 0.80
 *    default to whatever the empirical lower quartile is."
 *
 * This calibrator computes a voice-fidelity score (0–1) for each cover letter
 * against writing-samples/voice-reference.md using a DETERMINISTIC local
 * algorithm (no LLM/embedding API). It blends three deterministic similarity
 * signals:
 *
 *   1. **Character 3-gram cosine similarity** — captures register/rhythm/prose-cadence
 *   2. **Sentence-length-distribution similarity** — captures burstiness pattern
 *   3. **Vocab-overlap (Jaccard) on top 200 content words** — captures topical-voice signature
 *
 * Composite = 0.5 × 3gram + 0.3 × sentence_dist + 0.2 × vocab_jaccard
 *
 * Output:
 *   - data/voice-fidelity-calibration-{YYYY-MM-DD}.json   (this run)
 *   - data/voice-fidelity-calibration.json                 (rolling latest)
 *
 * Use the empirical lower-quartile of the top-10 sample distribution as the
 * suggested threshold (replacing the default 0.80 from Phase 3).
 *
 * Future enhancement: optional --use-embeddings flag calling
 * text-embedding-3-large via OpenAI; would replace signal #1 with proper
 * semantic-embedding cosine. Costs ~$0.05/run. Not required for v1.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const VOICE_REF_PATH = join(ROOT, 'writing-samples', 'voice-reference.md');
const APPLY_PACK_DIR = join(ROOT, 'apply-pack');

const today = new Date().toISOString().slice(0, 10);

/* ── Text normalization ────────────────────────────────────────────────── */

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this',
  'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'him', 'us',
  'them', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all',
  'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'about', 'as',
  'by', 'from', 'into', 'through', 'over', 'under', 'after', 'before',
]);

function stripFrontmatter(text) {
  // Remove markdown frontmatter (--- ... ---) + HTML-style comments + code fences
  return text
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^>.*$/gm, ''); // strip blockquote intro / agent notes
}

function normalizeText(text) {
  return stripFrontmatter(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s.!?'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ── Signal 1: Character 3-gram cosine similarity ──────────────────────── */

function trigramFreq(text) {
  const t = normalizeText(text).replace(/\s+/g, ' ');
  const freq = new Map();
  for (let i = 0; i < t.length - 2; i++) {
    const g = t.slice(i, i + 3);
    freq.set(g, (freq.get(g) || 0) + 1);
  }
  return freq;
}

function cosine(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [k, va] of a) {
    normA += va * va;
    const vb = b.get(k) || 0;
    dot += va * vb;
  }
  for (const vb of b.values()) {
    normB += vb * vb;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

/* ── Signal 2: Sentence-length-distribution similarity ─────────────────── */

function sentenceLengths(text) {
  const t = stripFrontmatter(text);
  const sentences = t.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  return sentences.map(s => s.split(/\s+/).filter(Boolean).length);
}

function lengthHistogram(lengths, buckets = [0, 5, 10, 15, 20, 25, 35, 50, 1000]) {
  const hist = new Array(buckets.length - 1).fill(0);
  for (const len of lengths) {
    for (let i = 0; i < buckets.length - 1; i++) {
      if (len >= buckets[i] && len < buckets[i + 1]) {
        hist[i]++;
        break;
      }
    }
  }
  const total = hist.reduce((a, b) => a + b, 0) || 1;
  return hist.map(c => c / total);
}

function distSimilarity(distA, distB) {
  // 1 - half L1 distance, range [0,1]
  let l1 = 0;
  for (let i = 0; i < distA.length; i++) {
    l1 += Math.abs(distA[i] - distB[i]);
  }
  return 1 - l1 / 2;
}

/* ── Signal 3: Vocab Jaccard on top-200 content words ──────────────────── */

function topContentWords(text, n = 200) {
  const words = normalizeText(text)
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w));
  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  const ranked = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
  return new Set(ranked);
}

function jaccard(a, b) {
  let intersect = 0;
  for (const x of a) if (b.has(x)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

/* ── Composite ─────────────────────────────────────────────────────────── */

function computeVoiceFidelity(refText, sampleText) {
  const refTri = trigramFreq(refText);
  const sampleTri = trigramFreq(sampleText);
  const triCos = cosine(refTri, sampleTri);

  const refDist = lengthHistogram(sentenceLengths(refText));
  const sampleDist = lengthHistogram(sentenceLengths(sampleText));
  const distSim = distSimilarity(refDist, sampleDist);

  const refVocab = topContentWords(refText);
  const sampleVocab = topContentWords(sampleText);
  const vocabJac = jaccard(refVocab, sampleVocab);

  const composite = 0.5 * triCos + 0.3 * distSim + 0.2 * vocabJac;
  return {
    composite: +composite.toFixed(4),
    trigram_cosine: +triCos.toFixed(4),
    sentence_dist_sim: +distSim.toFixed(4),
    vocab_jaccard: +vocabJac.toFixed(4),
  };
}

/* ── Discover past CLs ──────────────────────────────────────────────── */

function discoverCoverLetters(maxN = 10) {
  const results = [];
  try {
    const dirs = readdirSync(APPLY_PACK_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const dirName of dirs) {
      const clPath = join(APPLY_PACK_DIR, dirName, 'cover-letter.md');
      try {
        const text = readFileSync(clPath, 'utf-8');
        if (text.length < 200) continue; // skip empty/stub CLs
        results.push({ id: dirName, path: clPath, text });
      } catch {
        // file missing — skip
      }
    }
  } catch (err) {
    console.error(`[calibrate] could not read apply-pack/: ${err.message}`);
    return [];
  }

  // Sort: prefer alphanumeric (Mitchell's recent pads = lower numerics first or by recency)
  // For now: take first N alphabetically (mostly recent given naming convention 0XX > 8XX)
  return results.sort((a, b) => a.id.localeCompare(b.id)).slice(0, maxN);
}

/* ── Distribution stats ────────────────────────────────────────────────── */

function quartiles(values) {
  if (values.length === 0) return { min: null, q1: null, median: null, q3: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p) => {
    const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
    return sorted[idx];
  };
  return {
    min: sorted[0],
    q1: q(0.25),
    median: q(0.5),
    q3: q(0.75),
    max: sorted[sorted.length - 1],
  };
}

/* ── Main ──────────────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);
  const maxN = parseInt(args.find(a => a.startsWith('--n='))?.split('=')[1] || '10', 10);

  console.log(`[calibrate] reading voice-reference.md...`);
  let refText;
  try {
    refText = readFileSync(VOICE_REF_PATH, 'utf-8');
  } catch (err) {
    console.error(`[calibrate] FATAL: cannot read ${VOICE_REF_PATH}: ${err.message}`);
    process.exit(1);
  }

  console.log(`[calibrate] discovering up to ${maxN} past cover letters...`);
  const samples = discoverCoverLetters(maxN);
  if (samples.length === 0) {
    console.error('[calibrate] no past cover letters found in apply-pack/. Aborting.');
    process.exit(1);
  }
  console.log(`[calibrate] found ${samples.length} samples.`);

  const results = samples.map(s => ({
    id: s.id,
    path: s.path.replace(ROOT + '/', ''),
    bytes: s.text.length,
    ...computeVoiceFidelity(refText, s.text),
  }));

  const composites = results.map(r => r.composite);
  const stats = quartiles(composites);

  // Suggested threshold = lower-quartile (Q1) of accepted samples
  const suggestedThreshold = +stats.q1.toFixed(2);

  const calibration = {
    calibrated_at: new Date().toISOString(),
    method: 'local_deterministic_v1',
    formula: '0.5*trigram_cosine + 0.3*sentence_dist_sim + 0.2*vocab_jaccard',
    voice_reference_path: VOICE_REF_PATH.replace(ROOT + '/', ''),
    sample_count: samples.length,
    samples: results,
    distribution: {
      composite_min: stats.min,
      composite_q1: stats.q1,
      composite_median: stats.median,
      composite_q3: stats.q3,
      composite_max: stats.max,
    },
    suggested_threshold: suggestedThreshold,
    current_default_threshold: 0.80,
    threshold_delta: +(suggestedThreshold - 0.80).toFixed(2),
    notes: [
      `Composite range: ${stats.min} – ${stats.max}`,
      `Suggested threshold (Q1 of sample distribution): ${suggestedThreshold}`,
      `Strategy doc default was 0.80; empirical Q1 is ${suggestedThreshold > 0.80 ? 'higher (tighter)' : 'lower (looser)'}`,
      `For embedding-based recalibration (semantic cosine via text-embedding-3-large), re-run with --use-embeddings (TODO; ~\$0.05/run)`,
    ],
  };

  const datedPath = join(ROOT, 'data', `voice-fidelity-calibration-${today}.json`);
  const latestPath = join(ROOT, 'data', 'voice-fidelity-calibration.json');

  writeFileSync(datedPath, JSON.stringify(calibration, null, 2));
  writeFileSync(latestPath, JSON.stringify(calibration, null, 2));

  console.log(`\n[calibrate] === RESULTS ===`);
  console.log(`Samples scored: ${samples.length}`);
  console.log(`Distribution: min=${stats.min} q1=${stats.q1} median=${stats.median} q3=${stats.q3} max=${stats.max}`);
  console.log(`Suggested threshold: ${suggestedThreshold} (vs default 0.80 → delta ${calibration.threshold_delta >= 0 ? '+' : ''}${calibration.threshold_delta})`);
  console.log(`\nWrote: ${datedPath.replace(ROOT + '/', '')}`);
  console.log(`Wrote: ${latestPath.replace(ROOT + '/', '')}`);
}

main().catch(err => {
  console.error('[calibrate] FATAL:', err);
  process.exit(1);
});
