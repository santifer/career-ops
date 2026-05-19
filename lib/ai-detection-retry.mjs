/**
 * lib/ai-detection-retry.mjs — 3-stage retry pipeline for the AI-detection gate.
 *
 * DELTA P1: when the gate flags an artifact as CRIT band on a detector with
 * GOOD signal quality, run up to 3 stricter regenerations against the SAME
 * model. Model-switching as evasion is banned by policy (DELTA Δ.2 P0): no
 * empirical evidence supports it, it disrupts the diversity-of-voice design
 * intentionally baked into the apply-pack pipeline, and it conflates two
 * unrelated questions ("which model writes most like Mitchell" and "which
 * model evades detection best").
 *
 * Stages — each with a different intervention shape, NOT a different model:
 *
 *   Stage 1 — Band-aware stricter prompt. Tells the model the band + the
 *             flagged sentence count + the highest-prob sentence. Generic
 *             "rewrite with more burstiness, more specifics" guidance.
 *
 *   Stage 2 — Sentence-level intervention. Quotes the K worst sentences
 *             GPTZero flagged with their per-sentence probs and asks for a
 *             targeted rewrite of THOSE sentences specifically.
 *
 *   Stage 3 — Voice-corpus anchor. Includes a short excerpt from the
 *             canonical exemplar AS the rewrite target style, instructs
 *             the model to mirror that register sentence-by-sentence.
 *
 * Exit conditions:
 *   - Stage produces a result with `gateBlocks === false` → return that.
 *   - All 3 stages fail → return the BEST attempt (lowest gptzero_prob)
 *     with `final_status: 'EXHAUSTED'`.
 *   - Signal quality USELESS on BOTH detectors → return original (no retry)
 *     with `final_status: 'SIGNAL_USELESS'`.
 *
 * Exports:
 *   runDetectionRetryPipeline({...}) → { final, attempts, final_status }
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkText } from './ai-detection-gate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Short voice-corpus excerpt for Stage-3 prompt anchoring. Inlined here
// rather than loaded from voice-reference.md so this helper works without a
// filesystem dependency in test/headless contexts. Source: writing-samples/
// voice-reference.md § Canonical Exemplar, opening + closing paragraphs.
const VOICE_ANCHOR = `EXAMPLE OF MITCHELL'S AUTHENTIC PROSE (mirror this register sentence-by-sentence):

"The problem wasn't the concept — it was the gap between what the system actually did and what anyone in the room could explain about it. I'd built a production-grade autonomous communications agent inside Google's Office of Cross-Google Engineering, serving roughly 1,000 of the company's most senior technical staff — Principal Engineers, Distinguished Engineers, Google Fellows, the top 0.5% of a 180,000-person organization. The system ran. The results were real. But the moment I had to explain the architecture to anyone outside the build, I watched the same thing happen every time: eyes that understood 'AI' in the abstract and glazed over the instant the specifics arrived."

"What I've learned is that translating complex technical work isn't a communications problem — it's a modeling problem. You're not simplifying the concept; you're finding the domain where your audience already has the intuitions and mapping the unfamiliar thing onto it."

Note: short declarative sentences alternated with long em-dash-linked clauses. Specific named entities (1,000 staff; top 0.5%; 180,000-person). No hedging. No "passionate about" / "thrilled" / "excited". Em dashes for the operational specification.`;

/**
 * Build Stage-1 (band-aware) stricter prompt.
 */
function buildStage1Prompt(baseSystemPrompt, detection) {
  const flagged = detection.sentence_signals?.highlighted_count ?? 0;
  const worstSentence = (detection.sentences || [])
    .filter(s => typeof s.generated_prob === 'number')
    .sort((a, b) => b.generated_prob - a.generated_prob)[0];
  const worstLine = worstSentence
    ? `\nHighest-flagged sentence (GPTZero ${Math.round((worstSentence.generated_prob || 0) * 100)}%): "${(worstSentence.sentence || '').slice(0, 200)}"`
    : '';
  return baseSystemPrompt + `

CRITICAL — AI-detection gate retry (Stage 1 / 3). The draft is in band ${detection.band}. GPTZero flagged ${flagged} sentence(s).${worstLine}

Rewrite the prose with dramatically more burstiness. Short declarative sentences (5-9 words) alternating with longer em-dash-linked clauses (20-30 words). Replace any abstract claim with a specific, concrete artifact ONLY IF supported by cv.md / article-digest.md. Do not invent. Strip any of: "passionate about", "thrilled", "excited to", "delve", "leverage", "navigate the complexities of", "in today's", "furthermore", "moreover".`;
}

/**
 * Build Stage-2 (sentence-level intervention) prompt.
 */
function buildStage2Prompt(baseSystemPrompt, detection) {
  const top = (detection.sentences || [])
    .filter(s => typeof s.generated_prob === 'number')
    .sort((a, b) => b.generated_prob - a.generated_prob)
    .slice(0, 5);
  const quotedList = top.map((s, i) =>
    `  ${i + 1}. (GPTZero ${Math.round((s.generated_prob || 0) * 100)}%) "${(s.sentence || '').slice(0, 240)}"`
  ).join('\n');
  return baseSystemPrompt + `

CRITICAL — AI-detection gate retry (Stage 2 / 3). The draft remains in band ${detection.band} after one rewrite. The following SPECIFIC sentences were flagged:

${quotedList}

Rewrite EACH of those sentences with the same fact-content but a fundamentally different shape. Use abrupt sentence breaks. Use first-person where appropriate. Insert concrete proper nouns from cv.md if applicable. Vary sentence-opening syntax — do NOT start consecutive sentences with the same word or part-of-speech. Keep the unflagged sentences exactly as they were.`;
}

/**
 * Build Stage-3 (voice-corpus anchor) prompt.
 */
function buildStage3Prompt(baseSystemPrompt, detection) {
  const flagged = detection.sentence_signals?.highlighted_count ?? 0;
  return baseSystemPrompt + `

CRITICAL — AI-detection gate retry (Stage 3 / 3, FINAL). The draft is still in band ${detection.band} after two rewrites (${flagged} sentence(s) still flagged).

${VOICE_ANCHOR}

Rewrite the ENTIRE prose to mirror that register sentence-by-sentence. Match the cadence: short declarative sentences alternating with em-dash-linked compound clauses. Use ONLY claims supported by cv.md / article-digest.md — do NOT fabricate. If a sentence cannot be expressed in this register without fabrication, cut it.`;
}

/**
 * @typedef {Object} RetryStageAttempt
 * @property {number} stage
 * @property {string} system_prompt_excerpt
 * @property {{ band: string|null, gateBlocks: boolean, gptzero_prob: number|null, originality_prob: number|null }} detection
 * @property {string} prose
 * @property {boolean} accepted
 */

/**
 * Run the 3-stage retry pipeline.
 *
 * @param {Object} args
 * @param {string} args.initialProse — prose that was already gate-checked once.
 * @param {Awaited<ReturnType<typeof checkText>>} args.initialDetection
 * @param {string} args.baseSystemPrompt
 * @param {(systemPrompt: string) => Promise<{ prose: string, tokens?: { input: number, output: number } }>} args.regenerate
 *   Caller-supplied function that runs the same-model regeneration with the new system prompt
 *   and returns the new prose. The retry pipeline never picks the model itself — that's enforced
 *   by passing in this opaque callback (no `modelKey` parameter exists on this API by design).
 * @param {Object} [args.opts]
 * @param {number} [args.opts.budgetUsd=0.10]
 * @returns {Promise<{ final: { prose: string, detection: any }, attempts: RetryStageAttempt[], final_status: 'PASSED'|'EXHAUSTED'|'SIGNAL_USELESS'|'ERROR', tokens_used: { input: number, output: number } }>}
 */
export async function runDetectionRetryPipeline({ initialProse, initialDetection, baseSystemPrompt, regenerate, opts = {} }) {
  /** @type {RetryStageAttempt[]} */
  const attempts = [];
  const tokens_used = { input: 0, output: 0 };

  // AAA-5 (council finding): the 3-stage retry pipeline has not been
  // empirically validated against a GOOD-signal-quality fixture. Under the
  // current 2026-05-19 baseline both detectors are USELESS, so the pipeline
  // always short-circuits to SIGNAL_USELESS — i.e. it's dead code in prod.
  // Gate it behind an opt-in env flag until at least one detector reaches
  // WEAK signal quality on a real ≥20-human + ≥10-AI corpus.
  if (process.env.DELTA_RETRY_ENABLED !== 'true') {
    return {
      final: { prose: initialProse, detection: initialDetection },
      attempts,
      final_status: 'DISABLED',
      tokens_used,
    };
  }

  // Short-circuit: if both detectors are USELESS, retry produces no signal,
  // so we ship the original and surface SIGNAL_USELESS so the dashboard can
  // show the editing-priority advisory.
  const gzUseless = initialDetection?.gptzero_signal_quality   === 'USELESS';
  const origUseless = initialDetection?.originality_signal_quality === 'USELESS';
  if (gzUseless && origUseless) {
    return {
      final: { prose: initialProse, detection: initialDetection },
      attempts,
      final_status: 'SIGNAL_USELESS',
      tokens_used,
    };
  }

  // Short-circuit: if the gate didn't block, no retry needed.
  if (initialDetection?.gateBlocks !== true) {
    return {
      final: { prose: initialProse, detection: initialDetection },
      attempts,
      final_status: 'PASSED',
      tokens_used,
    };
  }

  // Track best attempt (lowest worst-detector prob) across the 3 stages so we
  // can surface that one if all stages exhaust.
  let best = { prose: initialProse, detection: initialDetection };
  const worstProb = (d) => Math.max(d?.gptzero_prob ?? 0, d?.originality_prob ?? 0);

  const stagePromptBuilders = [
    buildStage1Prompt,
    buildStage2Prompt,
    buildStage3Prompt,
  ];

  for (let i = 0; i < stagePromptBuilders.length; i++) {
    const stage = i + 1;
    const builder = stagePromptBuilders[i];
    const lastDetection = best.detection;
    const systemPrompt = builder(baseSystemPrompt, lastDetection);

    let retryResult;
    try {
      retryResult = await regenerate(systemPrompt);
    } catch (err) {
      attempts.push({
        stage,
        system_prompt_excerpt: systemPrompt.slice(-180),
        detection: null,
        prose: null,
        accepted: false,
        error: String(err?.message || err),
      });
      continue;
    }

    if (retryResult?.tokens) {
      tokens_used.input  += retryResult.tokens.input  || 0;
      tokens_used.output += retryResult.tokens.output || 0;
    }

    const newProse = retryResult?.prose;
    if (typeof newProse !== 'string' || newProse.trim().length === 0) {
      attempts.push({
        stage,
        system_prompt_excerpt: systemPrompt.slice(-180),
        detection: null,
        prose: null,
        accepted: false,
        error: 'regenerate returned empty prose',
      });
      continue;
    }

    let newDetection;
    try {
      newDetection = await checkText(newProse, { budgetUsd: opts.budgetUsd ?? 0.10, skipCache: true });
    } catch (err) {
      attempts.push({
        stage,
        system_prompt_excerpt: systemPrompt.slice(-180),
        detection: null,
        prose: newProse,
        accepted: false,
        error: `gate check failed: ${err?.message || err}`,
      });
      continue;
    }

    const accepted = newDetection.gateBlocks !== true;
    attempts.push({
      stage,
      system_prompt_excerpt: systemPrompt.slice(-180),
      detection: {
        band: newDetection.band,
        gateBlocks: newDetection.gateBlocks,
        gptzero_prob: newDetection.gptzero_prob,
        originality_prob: newDetection.originality_prob,
        gptzero_band: newDetection.gptzero_band,
        originality_band: newDetection.originality_band,
        flagged_count: newDetection.sentence_signals?.highlighted_count ?? null,
      },
      prose: newProse,
      accepted,
    });

    if (worstProb(newDetection) < worstProb(best.detection)) {
      best = { prose: newProse, detection: newDetection };
    }

    if (accepted) {
      return {
        final: { prose: newProse, detection: newDetection },
        attempts,
        final_status: 'PASSED',
        tokens_used,
      };
    }
  }

  return {
    final: best,
    attempts,
    final_status: 'EXHAUSTED',
    tokens_used,
  };
}
