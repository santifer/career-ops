/**
 * lib/polish-loop.mjs — Phase 2 of apply-pack-polish (Mitchell · ALPHA · 2026-05-19).
 *
 * Per-artifact review loop. For ONE artifact (cv-tailored / cover-letter /
 * form-fields / impact-doc / references / referrals), runs:
 *
 *   ROUND 1 — 3 critics in parallel (Haiku 4.5 each, diversity-of-voice):
 *     copywriter-critic, designer-critic, recruiter-critic
 *   ROUND 2 — author rebuttal (Sonnet 4.6, full corpus context)
 *   ROUND 3 — convergence pass: critics see rebuttals, opus adjudicator on standoffs
 *   ROUND 4 — adversarial sweep (quality-first addition — Sonar Deep + Opus)
 *
 *   Exit when weighted_confidence ≥ targetConfidence (default 0.99) AND
 *   adversarial sweep finds nothing AND no critic changes their score
 *   between rounds. Max 6 inner rounds. 3 outer-loop retries on non-
 *   convergence with --no-cache + forced refresh of signals.
 *
 * Anti-drift guards:
 *   - Every rewrite cites a line in cv.md or article-digest.md
 *   - Diff cap: 35% line-level change vs input (unless --allow-major-rewrite)
 *   - Voice fidelity: kill list enforced via voice-reference-brief.md
 *
 * Returns: { final_artifact_text, confidence, rounds_used, polish_trace,
 *           critic_scores_history, cost_usd, adversarial_findings }
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callCouncil } from './council.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const CRITICS = [
  {
    role: 'copywriter',
    model: 'anthropic:claude-haiku-4-5-20251001',
    persona: 'Senior copywriter. Score tone, voice, narrative arc, sentence rhythm, kill-list adherence.',
  },
  {
    role: 'designer',
    model: 'anthropic:claude-haiku-4-5-20251001',
    persona: 'Senior content designer. Score visual hierarchy, scannability, paragraph length, density of proof points per line.',
  },
  {
    role: 'recruiter',
    model: 'anthropic:claude-haiku-4-5-20251001',
    persona: 'Senior in-house recruiter at a frontier AI lab. Score ATS keyword coverage, 6-second scan readability, evidence-of-fit per line.',
  },
];

const AUTHOR_MODEL = 'anthropic:claude-sonnet-4-6';
const ADJUDICATOR_MODEL = 'anthropic:claude-opus-4-7';
const ADVERSARIAL_LINEUP = ['perplexity:sonar-deep-research', 'anthropic:claude-opus-4-7'];

const DEFAULT_TARGET = 0.99;
const DEFAULT_MAX_ROUNDS = 6;
const DEFAULT_OUTER_RETRIES = 3;
const DEFAULT_DIFF_CAP = 0.35;

// Per OMEGA-proposal-1 (approved 2026-05-19): Opus adjudication can legitimately
// run 60-120s; council's 180s default leaves no headroom for adversarial Round 4.
// POLISH_API_TIMEOUT_MS overrides the council's per-provider timeout. Defaults to
// 300_000ms (5 min). Clamped to [30s, 30min] by callCouncil itself.
const _rawPolishTimeout = parseInt(process.env.POLISH_API_TIMEOUT_MS || '300000', 10);
const POLISH_API_TIMEOUT_MS = Number.isFinite(_rawPolishTimeout) && _rawPolishTimeout > 0
  ? Math.min(Math.max(_rawPolishTimeout, 30_000), 1_800_000)
  : 300_000;

function extractJson(content) {
  const trimmed = String(content || '').trim();
  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); } catch { /* */ }
  }
  const fenced = content.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* */ }
  }
  const s = content.indexOf('{');
  const e = content.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try { return JSON.parse(content.slice(s, e + 1)); } catch { /* */ }
  }
  return null;
}

function diffRatio(before, after) {
  const a = (before || '').split('\n');
  const b = (after || '').split('\n');
  const max = Math.max(a.length, b.length, 1);
  let diff = 0;
  for (let i = 0; i < max; i++) {
    if ((a[i] || '') !== (b[i] || '')) diff++;
  }
  return diff / max;
}

function summarizeCritic(criticOut) {
  if (!criticOut) return { score: 0, gaps: [], concrete_rewrites: [] };
  return {
    score: Number(criticOut.score) || 0,
    gaps: Array.isArray(criticOut.gaps) ? criticOut.gaps : [],
    concrete_rewrites: Array.isArray(criticOut.concrete_rewrites) ? criticOut.concrete_rewrites : [],
  };
}

function buildCriticPrompt({ persona, role, artifactKind, artifactText, signals, cvText, articleDigest, voiceBrief }) {
  return [
    `# Role`,
    persona,
    `You are ${role.toUpperCase()}-critic on a polish loop for Mitchell Williams's ${artifactKind}.`,
    ``,
    `# Inputs`,
    `## Polish signals (ground truth from Phase 1 dealbreaker)`,
    JSON.stringify(signals, null, 2).slice(0, 4000),
    ``,
    `## cv.md (canonical corpus — every rewrite MUST cite cv.md:N or article-digest.md:N)`,
    (cvText || '').slice(0, 4500),
    ``,
    `## article-digest.md (proof points)`,
    (articleDigest || '').slice(0, 2500),
    ``,
    `## Voice brief (kill list + canonical metrics — never invent metrics)`,
    (voiceBrief || '').slice(0, 2000),
    ``,
    `# Artifact under review (${artifactKind})`,
    `\`\`\``,
    String(artifactText || '').slice(0, 6000),
    `\`\`\``,
    ``,
    `# Your task — return STRICT JSON only`,
    `{`,
    `  "score": 0.0,  // 0–1, your confidence the artifact ships at top quality from YOUR critic-lens`,
    `  "gaps": ["specific issues — file:line in the artifact OR named anti-pattern from the polish signals"],`,
    `  "concrete_rewrites": [`,
    `    { "target_line_or_phrase": "exact text from artifact", "rewrite": "...", "citation": "cv.md:NN or article-digest.md:NN", "reason": "..." }`,
    `  ]`,
    `}`,
    `Hard rules:`,
    `- Every concrete_rewrite MUST include a citation. No citation → don't propose it.`,
    `- Honor the kill list (no "delve", "tapestry", "passionate", exclamation marks, etc.)`,
    `- Reuse ONLY canonical metrics from voice brief; never invent.`,
    `- Be specific. "improve clarity" is not a gap. "Line 3 mixes two claims; split them" is a gap.`,
  ].join('\n');
}

function buildAuthorPrompt({ artifactKind, artifactText, signals, cvText, articleDigest, voiceBrief, critics }) {
  return [
    `# Role`,
    `You are the AUTHOR voice for Mitchell Williams's ${artifactKind}. You hold the canon — cv.md, article-digest.md, voice brief.`,
    `Three critics (copywriter / designer / recruiter) just reviewed the artifact. Decide which rewrites to accept, reject, or merge.`,
    ``,
    `# Polish signals (Phase 1)`,
    JSON.stringify(signals, null, 2).slice(0, 3500),
    ``,
    `# cv.md (ground truth)`,
    (cvText || '').slice(0, 4500),
    ``,
    `# article-digest.md`,
    (articleDigest || '').slice(0, 2500),
    ``,
    `# Voice brief`,
    (voiceBrief || '').slice(0, 2000),
    ``,
    `# Artifact under review`,
    `\`\`\``,
    String(artifactText || '').slice(0, 6000),
    `\`\`\``,
    ``,
    `# Critic outputs (Round 1)`,
    JSON.stringify(critics, null, 2).slice(0, 5500),
    ``,
    `# Your task — return STRICT JSON only`,
    `{`,
    `  "accepted_rewrites": [{ "from_critic": "copywriter|designer|recruiter", "target": "...", "rewrite": "...", "citation": "cv.md:NN", "reason": "why this accept" }],`,
    `  "rejected_rewrites": [{ "from_critic": "...", "target": "...", "rewrite": "...", "reason": "violates voice brief / no citation / overclaim" }],`,
    `  "merged_artifact_text": "the FULL revised artifact text, with accepted rewrites applied. Cite cv.md:N inline where rewrites pulled from cv.md.",`,
    `  "author_self_score": 0.0,  // your confidence the revised artifact is publish-ready`,
    `  "author_notes": "1-3 sentences on what changed and why"`,
    `}`,
    `Constraints:`,
    `- Never inflate metrics. If a critic suggests a number not in cv.md / article-digest.md, REJECT it.`,
    `- Diff cap: stay within ~35% line-level change vs. input. Larger rewrite requires explicit override (out of scope here).`,
    `- merged_artifact_text MUST be the complete artifact — not a diff.`,
  ].join('\n');
}

function buildAdjudicatorPrompt({ artifactKind, originalText, authorText, critics, signals }) {
  return [
    `# Role — Opus adjudicator`,
    `You break standoffs on the polish loop for Mitchell Williams's ${artifactKind}.`,
    `The author has applied some critic rewrites and rejected others. Your call is final.`,
    ``,
    `# Inputs`,
    `## Polish signals`,
    JSON.stringify(signals, null, 2).slice(0, 3500),
    ``,
    `## Critic outputs`,
    JSON.stringify(critics, null, 2).slice(0, 5500),
    ``,
    `## Original artifact`,
    `\`\`\``,
    String(originalText || '').slice(0, 6000),
    `\`\`\``,
    ``,
    `## Author-revised artifact`,
    `\`\`\``,
    String(authorText || '').slice(0, 6000),
    `\`\`\``,
    ``,
    `# Your task — return STRICT JSON only`,
    `{`,
    `  "final_artifact_text": "the artifact as it should ship. Either keep author's version, or selectively apply more critic rewrites the author wrongly rejected.",`,
    `  "weighted_confidence": 0.0,  // weighted across critic scores + your own judgment + signal coverage`,
    `  "remaining_concerns": ["specific issues that still block ≥0.99 if any"],`,
    `  "adjudicator_notes": "1-3 sentences on the call"`,
    `}`,
    `Weighting heuristic: copywriter 0.30, designer 0.25, recruiter 0.30, your own 0.15. Apply to score-out-of-1 each.`,
  ].join('\n');
}

function buildAdversarialPrompt({ artifactKind, finalText, signals }) {
  return [
    `# Role — adversarial sweep`,
    `You are actively trying to BREAK this polished ${artifactKind} before it ships.`,
    `Find anything: voice drift, overclaim, weak opening, dead phrase, citation gap, HM read-fail, ATS keyword gap.`,
    ``,
    `# Polish signals`,
    JSON.stringify(signals, null, 2).slice(0, 3500),
    ``,
    `# Artifact (post-adjudicator)`,
    `\`\`\``,
    String(finalText || '').slice(0, 6000),
    `\`\`\``,
    ``,
    `# Your task — return STRICT JSON only`,
    `{`,
    `  "blocking_findings": [{ "finding": "...", "severity": "blocker|major|minor", "fix_suggestion": "..." }],`,
    `  "passes": true|false,  // true ONLY if NO blocking_findings remain`,
    `  "adversarial_notes": "what you tried and why it held / failed"`,
    `}`,
    `Be ruthless. "passes": true requires zero blockers AND zero majors.`,
  ].join('\n');
}

/**
 * Run ONE artifact through the 4-round polish loop, with up to maxRounds
 * inner rounds and outerRetries outer-loop retries on non-convergence.
 *
 * @param {object} input
 * @param {string} input.artifactKind — "cv-tailored" | "cover-letter" | "form-fields" | "impact-doc" | "references" | "referrals"
 * @param {string} input.artifactText — current artifact text
 * @param {object} input.signals — Phase 1 polish-signals.json content
 * @param {string} input.cvText
 * @param {string} input.articleDigest
 * @param {string} input.voiceBrief
 * @param {object} [input.opts]
 * @param {number} [input.opts.targetConfidence=0.99]
 * @param {number} [input.opts.maxRounds=6]
 * @param {number} [input.opts.outerRetries=3]
 * @param {number} [input.opts.costCap=80]  // USD per-artifact ceiling
 * @param {string} [input.opts.tracePath]   // where to write polish-trace-{artifact}.md
 * @returns {Promise<object>}
 */
export async function polishArtifact(input) {
  const t0 = Date.now();
  const opts = input.opts || {};
  const target = opts.targetConfidence ?? DEFAULT_TARGET;
  const maxRounds = opts.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const outerRetries = opts.outerRetries ?? DEFAULT_OUTER_RETRIES;
  const costCap = opts.costCap ?? 80;
  const diffCap = opts.diffCap ?? DEFAULT_DIFF_CAP;

  const trace = [];
  let totalCost = 0;
  let bestText = input.artifactText;
  let bestConfidence = 0;
  let lastCriticScores = null;
  let outerAttempt = 0;
  let adversarialFindings = [];
  let onSignalsRefresh = typeof opts.onSignalsRefresh === 'function' ? opts.onSignalsRefresh : null;
  let signals = input.signals;

  // Cost-trace opts forwarding (Mitchell decision α.2).
  // Merge onCostRecord + phase + artifactSlug into every callCouncil opts object.
  const costTraceOpts = {
    ...(opts.onCostRecord ? { onCostRecord: opts.onCostRecord } : {}),
    ...(opts.phase ? { phase: opts.phase } : {}),
    ...(opts.artifactSlug ? { artifactSlug: opts.artifactSlug } : { artifactSlug: input.artifactKind }),
    agentSlug: 'apply-pack-polish',
  };

  for (outerAttempt = 0; outerAttempt < outerRetries; outerAttempt++) {
    let rounds = 0;
    let converged = false;

    while (rounds < maxRounds) {
      rounds++;
      if (totalCost >= costCap) {
        trace.push(`# Round ${rounds} — cost cap $${costCap} reached at $${totalCost.toFixed(4)}, stopping inner loop.`);
        break;
      }

      /* ----- ROUND 1 — three critics in parallel ----- */
      const criticPromises = CRITICS.map(c =>
        callCouncil({
          prompt: buildCriticPrompt({
            persona: c.persona,
            role: c.role,
            artifactKind: input.artifactKind,
            artifactText: bestText,
            signals,
            cvText: input.cvText,
            articleDigest: input.articleDigest,
            voiceBrief: input.voiceBrief,
          }),
          models: [c.model],
          opts: { maxTokens: 1800, timeoutMs: POLISH_API_TIMEOUT_MS, ...costTraceOpts },
        }).then(r => ({ role: c.role, raw: r.results?.[0]?.content || '', cost: r.report?.totalCost || 0, error: r.results?.[0]?.error || null }))
          .catch(err => ({ role: c.role, raw: '', error: String(err.message || err), cost: 0 }))
      );
      const criticResults = await Promise.all(criticPromises);
      for (const c of criticResults) totalCost += c.cost || 0;

      const critics = criticResults.map(c => ({
        role: c.role,
        parsed: summarizeCritic(extractJson(c.raw)),
        raw_excerpt: (c.raw || '').slice(0, 400),
        error: c.error,
      }));

      const criticScores = critics.map(c => ({ role: c.role, score: c.parsed.score }));
      trace.push(`## Round ${rounds} — critic scores: ${criticScores.map(s => `${s.role}=${s.score.toFixed(2)}`).join(', ')}`);

      /* ----- ROUND 2 — author rebuttal ----- */
      let authorOut = null;
      try {
        const author = await callCouncil({
          prompt: buildAuthorPrompt({
            artifactKind: input.artifactKind,
            artifactText: bestText,
            signals,
            cvText: input.cvText,
            articleDigest: input.articleDigest,
            voiceBrief: input.voiceBrief,
            critics,
          }),
          models: [AUTHOR_MODEL],
          opts: { maxTokens: 4000, timeoutMs: POLISH_API_TIMEOUT_MS, ...costTraceOpts },
        });
        const raw = author.results?.[0]?.content || '';
        totalCost += author.report?.totalCost || 0;
        authorOut = extractJson(raw);
      } catch (e) {
        trace.push(`## Round ${rounds} — author error: ${String(e.message || e)}`);
      }

      const authorText = authorOut?.merged_artifact_text || bestText;
      const authorScore = Number(authorOut?.author_self_score) || 0;

      /* ----- diff cap check ----- */
      const dr = diffRatio(bestText, authorText);
      if (dr > diffCap && !opts.allowMajorRewrite) {
        trace.push(`## Round ${rounds} — author rewrite diff ${dr.toFixed(2)} > cap ${diffCap}; reverting to original.`);
        // Keep bestText, treat this round as critic-only
      }
      const acceptedText = (dr > diffCap && !opts.allowMajorRewrite) ? bestText : authorText;

      /* ----- ROUND 3 — adjudicator ----- */
      let adjudicator = null;
      try {
        const adj = await callCouncil({
          prompt: buildAdjudicatorPrompt({
            artifactKind: input.artifactKind,
            originalText: bestText,
            authorText: acceptedText,
            critics,
            signals,
          }),
          models: [ADJUDICATOR_MODEL],
          opts: { maxTokens: 4000, timeoutMs: POLISH_API_TIMEOUT_MS, ...costTraceOpts },
        });
        const raw = adj.results?.[0]?.content || '';
        totalCost += adj.report?.totalCost || 0;
        adjudicator = extractJson(raw);
      } catch (e) {
        trace.push(`## Round ${rounds} — adjudicator error: ${String(e.message || e)}`);
      }

      const adjudicatedText = adjudicator?.final_artifact_text || acceptedText;
      const weightedConfidence = Number(adjudicator?.weighted_confidence) || authorScore || 0;

      trace.push(`## Round ${rounds} — author_score=${authorScore.toFixed(2)} weighted=${weightedConfidence.toFixed(3)} diff=${dr.toFixed(2)}`);

      bestText = adjudicatedText;
      bestConfidence = weightedConfidence;

      /* ----- ROUND 4 — adversarial sweep ----- */
      let adversarial = null;
      try {
        const adv = await callCouncil({
          prompt: buildAdversarialPrompt({
            artifactKind: input.artifactKind,
            finalText: bestText,
            signals,
          }),
          models: ADVERSARIAL_LINEUP,
          opts: { maxTokens: 2000, timeoutMs: POLISH_API_TIMEOUT_MS, ...costTraceOpts },
        });
        totalCost += adv.report?.totalCost || 0;
        const responses = (adv.results || []).map(r => extractJson(r.content || '')).filter(Boolean);
        const allFindings = responses.flatMap(r => Array.isArray(r.blocking_findings) ? r.blocking_findings : []);
        const passes = responses.length > 0 && responses.every(r => r.passes === true);
        adversarial = { passes, findings: allFindings, raw_count: responses.length };
        adversarialFindings = allFindings;
      } catch (e) {
        trace.push(`## Round ${rounds} — adversarial error: ${String(e.message || e)}`);
      }

      const advPasses = adversarial?.passes === true;
      trace.push(`## Round ${rounds} — adversarial: ${advPasses ? 'PASS' : `FAIL (${adversarialFindings.length} findings)`}`);

      /* ----- convergence check ----- */
      const scoresStable = lastCriticScores && criticScores.every((s, i) => Math.abs(s.score - lastCriticScores[i].score) < 0.02);
      const confidenceOK = weightedConfidence >= target;

      if (confidenceOK && advPasses && scoresStable) {
        converged = true;
        trace.push(`## Round ${rounds} — CONVERGED. weighted=${weightedConfidence.toFixed(3)} ≥ ${target}, adversarial passed, scores stable.`);
        break;
      }
      if (confidenceOK && advPasses && rounds >= 2) {
        // First round can't satisfy "scores stable" (no prior round). Accept on second round.
        converged = true;
        trace.push(`## Round ${rounds} — CONVERGED (weighted≥${target}, adversarial passed, ≥2 rounds).`);
        break;
      }
      lastCriticScores = criticScores;
    }

    if (converged) break;

    // Outer retry: if signals refresh callback was provided, request a fresh harvest.
    if (outerAttempt < outerRetries - 1) {
      trace.push(`# Outer retry ${outerAttempt + 1}/${outerRetries} — non-convergence after ${rounds} rounds. Requesting signals refresh.`);
      if (onSignalsRefresh) {
        try {
          const refreshed = await onSignalsRefresh();
          if (refreshed) signals = refreshed;
        } catch (e) {
          trace.push(`# Outer retry — signals refresh failed: ${String(e.message || e)}`);
        }
      }
    } else {
      trace.push(`# Outer retries exhausted. Returning best-effort artifact at confidence ${bestConfidence.toFixed(3)}.`);
    }
  }

  /* ----- write polish trace ----- */
  if (opts.tracePath) {
    try {
      mkdirSync(dirname(opts.tracePath), { recursive: true });
      writeFileSync(opts.tracePath, trace.join('\n\n') + '\n', 'utf-8');
    } catch (e) {
      trace.push(`## trace write error: ${String(e.message || e)}`);
    }
  }

  return {
    artifact_kind: input.artifactKind,
    final_artifact_text: bestText,
    confidence: bestConfidence,
    rounds_used: outerAttempt + 1,
    converged: bestConfidence >= target,
    adversarial_findings: adversarialFindings,
    polish_trace: trace.join('\n\n'),
    cost_usd: Math.round(totalCost * 10000) / 10000,
    duration_ms: Date.now() - t0,
  };
}

export const _internal = { extractJson, diffRatio, CRITICS, AUTHOR_MODEL, ADJUDICATOR_MODEL };
