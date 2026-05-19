/**
 * lib/refresh-verifier.mjs — Cross-architecture verifier lane.
 *
 * Design source: refresh-master Phase 2 deliverable 3 + Phase 3 deliverables
 * 2 (adversarial second-pass), 3 (disagreement-as-signal), 4 (refuse-to-
 * commit). Every cache write passes through a verifier from a DIFFERENT
 * architectural family than the writer. The verifier reads the WRITER's
 * output + the prior cache (if any) and asks:
 *   1. Does the output contradict the prior cached version in any material way?
 *   2. Are there factual claims without source URLs?
 *   3. Does the output match the requested schema (cache.id semantics)?
 *   4. Are there "as of <date>" claims that contradict the retrieved_at?
 *
 * Architectural-family rules (so writer + verifier never share embeddings/
 * training-distribution):
 *   - anthropic-sonnet writer → verifier = perplexity-agent OR grok-4-x-search
 *   - perplexity-agent writer → verifier = anthropic-sonnet OR grok-4-x-search
 *   - grok-4-x-search writer → verifier = anthropic-sonnet OR perplexity-agent
 *
 * On verifier disagreement → Phase 3 adversarial second-pass + council-3
 * (Sonnet + Sonar Deep + Grok-x). If council can't reach consensus → return
 * refuse-to-commit + NEEDS_HUMAN.
 *
 * Phase 3 escalations:
 *   - adversarialSecondPass(): forces a verifier to ACTIVELY find issues
 *     ("be ruthlessly adversarial; convergence-on-praise is a failure signal")
 *   - councilAdjudicate(): runs council-3 when single verifier flags issues
 *   - refuseToCommit(): when consensus can't be reached, write
 *     "insufficient_signal: true" envelope to NEEDS_HUMAN dir + flag
 *
 * Exports:
 *   verifyCacheWrite({ writerResult, priorCache, cache, opts }) →
 *     { verified, escalateToCouncil, verifierResult, notes,
 *       councilResult?, refusedToCommit?, disagreement_band? }
 */

import { getAdapter } from './provider-adapters/index.mjs';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const NEEDS_HUMAN_DIR = join(REPO_ROOT, 'data', 'refresh-needs-human');

const FAMILY_MAP = {
  'anthropic-sonnet':  'anthropic',
  'perplexity-agent':  'perplexity',
  'grok-4-x-search':   'xai',
};

/** Pick a different-architecture verifier for a writer. */
export function pickVerifierProvider(writerProvider, cacheOverride = null) {
  if (cacheOverride && FAMILY_MAP[cacheOverride] && FAMILY_MAP[cacheOverride] !== FAMILY_MAP[writerProvider]) {
    return cacheOverride;
  }
  // Default rotation: writer-architecture → verifier choice.
  const family = FAMILY_MAP[writerProvider] || 'anthropic';
  const preference = {
    anthropic:  'perplexity-agent',
    perplexity: 'anthropic-sonnet',
    xai:        'anthropic-sonnet',
  };
  return preference[family];
}

/**
 * Run the cross-architecture verifier on a writer's result.
 * @param {object} args
 * @param {object} args.writerResult  - adapter return shape
 * @param {object|null} args.priorCache - prior cached content (for diff)
 * @param {object} args.cache         - cache descriptor
 * @param {object} args.row           - apply-now row
 * @param {object} args.opts          - { verifierProvider?, schemaHint?, signal? }
 */
export async function verifyCacheWrite({ writerResult, priorCache, cache, row, opts = {} }) {
  const writerProvider = writerResult?.providerMetadata?.model
    ? Object.keys(FAMILY_MAP).find(k => writerResult.model?.includes(FAMILY_MAP[k].slice(0, 4))) || 'anthropic-sonnet'
    : 'anthropic-sonnet';
  const verifierProvider = opts.verifierProvider || cache.verifierProvider || pickVerifierProvider(writerProvider, cache.verifierProvider);
  const adapter = getAdapter(verifierProvider);
  if (!adapter) {
    return {
      verified: null,
      escalateToCouncil: false,
      verifierResult: null,
      notes: [`verifier adapter "${verifierProvider}" not found`],
      verifierProvider,
    };
  }

  // Build a verifier prompt that hands the writer's output + the prior cache
  // and asks for a structured verdict.
  const verifierPrompt = buildVerifierPrompt({ writerResult, priorCache, cache, row, schemaHint: opts.schemaHint });
  const result = await adapter.refresh(
    cache,
    row,
    {
      ...opts,
      // The verifier doesn't need the full Mitchell corpus — it needs the
      // writer's output. Use a short context.
      promptBuilder: () => verifierPrompt,
      systemPrompt: 'You are a cross-architecture verifier for Mitchell\'s career-ops refresh pipeline. Adjudicate the WRITER\'s output. Return STRICT JSON: { "verdict": "PASS"|"FLAG"|"REJECT", "issues": ["..."], "schema_compliant": bool, "factual_claims_have_sources": bool, "contradicts_prior": bool, "notes": "..." }',
      caller: `refresh-verifier:${cache.id}:${verifierProvider}`,
      maxTokens: 2000,
    }
  );

  if (!result.ok) {
    return {
      verified: null,
      escalateToCouncil: true,
      verifierResult: result,
      notes: [`verifier adapter returned ok:false: ${(result.errors || []).join(' | ')}`],
      verifierProvider,
    };
  }

  const verdict = result.contentJson?.verdict || 'UNKNOWN';
  const verified = verdict === 'PASS';
  const escalateToCouncil = verdict === 'FLAG' || verdict === 'REJECT';

  // Phase 3: if first verifier passed, run an adversarial second-pass to
  // catch issues a single-shot review missed. apply-pack-polish.mjs Round 4
  // pattern: same model called with "be ruthlessly adversarial" framing.
  // Skip when caller explicitly opts out (opts.skipAdversarial = true).
  let adversarialResult = null;
  if (verified && !opts.skipAdversarial && cache.adversarialEnabled !== false) {
    adversarialResult = await adversarialSecondPass({
      writerResult,
      priorCache,
      cache,
      row,
      verifierProvider,
      opts,
    });
    if (adversarialResult && adversarialResult.contentJson?.verdict !== 'PASS') {
      // First pass said PASS, adversarial said FLAG/REJECT → disagreement signal
      return {
        verified: null,
        escalateToCouncil: true,
        verifierResult: result,
        adversarialResult,
        notes: [
          'Adversarial second-pass disagreed with first verifier',
          ...(adversarialResult.contentJson?.issues || []),
        ],
        verifierProvider,
        rawVerdict: verdict,
        adversarialVerdict: adversarialResult.contentJson?.verdict,
        disagreement_band: 'first_passed_adversarial_flagged',
      };
    }
  }

  return {
    verified,
    escalateToCouncil,
    verifierResult: result,
    adversarialResult,
    notes: result.contentJson?.issues || [],
    verifierProvider,
    rawVerdict: verdict,
  };
}

/**
 * Phase 3 deliverable 2: adversarial second-pass. Same verifier, harder
 * prompt — "be ruthlessly adversarial, find at least 3 issues; convergence-
 * on-praise without dissent is a failure signal."
 */
export async function adversarialSecondPass({ writerResult, priorCache, cache, row, verifierProvider, opts = {} }) {
  const adapter = getAdapter(verifierProvider);
  if (!adapter) return null;

  const writerJson = writerResult?.contentJson ?? null;
  const writerSourceUrls = writerResult?.sourceUrls || [];
  const adversarialPrompt = [
    `# Adversarial second-pass review`,
    `**Cache id:** ${cache.id}`,
    `**Row:** #${row.num} ${row.company} — ${row.role}`,
    ``,
    `You ALREADY approved this output in a first-pass review. Now act as an adversarial reviewer:`,
    `- Find at LEAST 3 issues you missed the first time.`,
    `- "Convergence on praise" — failing to find issues — is itself a failure signal.`,
    `- If the output really IS perfect, list 3 things you would have liked to see additionally.`,
    `- Focus on hallucination patterns: fabricated names, made-up URLs, "as of" date mismatches, inferred-but-uncited claims.`,
    ``,
    `**Writer model:** ${writerResult?.model || 'unknown'}`,
    `**Writer URLs (${writerSourceUrls.length}):** ${writerSourceUrls.slice(0, 6).join(', ')}`,
    ``,
    `## Writer output`,
    '```json',
    JSON.stringify(writerJson, null, 2).slice(0, 5000),
    '```',
    ``,
    `Return STRICT JSON:`,
    `{`,
    `  "verdict": "PASS" | "FLAG" | "REJECT",`,
    `  "issues": ["at least 3 specific issues you found"],`,
    `  "hallucination_risk_specific": ["fabricated-name/url/date claims with field path"],`,
    `  "notes": "why your second-pass verdict differs (or doesn't) from your first"`,
    `}`,
  ].join('\n');

  return await adapter.refresh(
    cache,
    row,
    {
      ...opts,
      promptBuilder: () => adversarialPrompt,
      systemPrompt: 'You are an ADVERSARIAL cross-architecture verifier. Your job is to find issues a first-pass review missed. STRICT JSON only.',
      caller: `refresh-verifier:adversarial:${cache.id}:${verifierProvider}`,
      maxTokens: 2000,
    }
  );
}

/**
 * Phase 3 deliverable 4: refuse-to-commit fallback. When verifier + adversarial
 * + council can't agree, write a NEEDS_HUMAN flag instead of fabricating a
 * write. Caller (orchestrator) checks refusedToCommit and skips the write.
 */
export function refuseToCommitWith({ cache, row, writerResult, verifierResult, adversarialResult, councilResult }) {
  mkdirSync(NEEDS_HUMAN_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const slug = `${cache.id}-${row.num || 'unknown'}-${date}`;
  const path = join(NEEDS_HUMAN_DIR, `${slug}.md`);
  const body = [
    `# REFRESH NEEDS_HUMAN — ${slug}`,
    ``,
    `**Cache:** ${cache.id}`,
    `**Row:** #${row.num} ${row.company} — ${row.role}`,
    `**Date:** ${new Date().toISOString()}`,
    ``,
    `## Reason`,
    `Verifier + adversarial second-pass + council-3 adjudication could not reach consensus on this write. Per refresh-master Phase 3 protocol, refusing to commit is correct rather than fabricating a confident answer.`,
    ``,
    `## Writer result`,
    '```json',
    JSON.stringify(writerResult?.contentJson || writerResult || {}, null, 2).slice(0, 3000),
    '```',
    ``,
    `## First verifier verdict`,
    `${verifierResult?.contentJson?.verdict || 'unknown'} — ${(verifierResult?.contentJson?.issues || []).join('; ').slice(0, 600)}`,
    ``,
    `## Adversarial second-pass`,
    `${adversarialResult?.contentJson?.verdict || 'unknown'} — ${(adversarialResult?.contentJson?.issues || []).join('; ').slice(0, 600)}`,
    ``,
    `## Council adjudication`,
    `${councilResult ? JSON.stringify(councilResult, null, 2).slice(0, 1500) : 'not run'}`,
    ``,
    `## Recommended action`,
    `Manual review of the writer output above. If acceptable, manually copy the JSON into ${cache.dir}/<key>.json with a "verifier_passed: false, manually_overridden: true" envelope.`,
  ].join('\n');
  writeFileSync(path, body);
  return { ok: true, path };
}

function buildVerifierPrompt({ writerResult, priorCache, cache, row, schemaHint }) {
  const writerJson = writerResult?.contentJson ?? null;
  const writerSourceUrls = writerResult?.sourceUrls || [];
  const priorJson = priorCache ?? null;

  return [
    `# Cross-architecture verification`,
    ``,
    `**Cache id:** ${cache.id}`,
    `**Row:** #${row.num} ${row.company} — ${row.role}`,
    `**Writer model:** ${writerResult?.model || 'unknown'}`,
    `**Writer source URLs (${writerSourceUrls.length}):** ${writerSourceUrls.slice(0, 8).join(', ')}`,
    ``,
    schemaHint ? `## Expected schema hint\n${schemaHint}\n` : '',
    `## Writer output (JSON)`,
    '```json',
    JSON.stringify(writerJson, null, 2).slice(0, 6000),
    '```',
    ``,
    priorJson ? `## Prior cached version (for contradiction check)\n\`\`\`json\n${JSON.stringify(priorJson, null, 2).slice(0, 4000)}\n\`\`\`\n` : '',
    `## Your verification task`,
    `1. Does writer output match the cache's documented schema for "${cache.id}"?`,
    `2. Are factual claims backed by source URLs?`,
    `3. Does it contradict the prior cached version in any MATERIAL way (>20% drift)?`,
    `4. Are there "as of" or date claims that contradict the underlying retrieval timestamp?`,
    ``,
    `Return STRICT JSON:`,
    `{`,
    `  "verdict": "PASS" | "FLAG" | "REJECT",`,
    `  "issues": ["specific issues you found, with citation to the field"],`,
    `  "schema_compliant": true|false,`,
    `  "factual_claims_have_sources": true|false,`,
    `  "contradicts_prior": true|false,`,
    `  "notes": "1-2 sentence summary of your verdict reasoning"`,
    `}`,
  ].filter(Boolean).join('\n');
}
