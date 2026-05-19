/**
 * lib/refresh-verifier.mjs — Cross-architecture verifier lane.
 *
 * Design source: refresh-master Phase 2 deliverable 3. Every cache write
 * passes through a verifier from a DIFFERENT architectural family than the
 * writer. The verifier reads the WRITER's output + the prior cache (if any)
 * and asks:
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
 * On verifier disagreement → adjudicate via council-3 (Sonnet + Sonar Deep +
 * Grok-x). On adjudicator failure → return refuse-to-commit + NEEDS_HUMAN.
 *
 * Exports:
 *   verifyCacheWrite({ writerResult, priorCache, cache, opts }) →
 *     { verified, escalateToCouncil, verifierResult, notes }
 */

import { getAdapter } from './provider-adapters/index.mjs';

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

  return {
    verified,
    escalateToCouncil,
    verifierResult: result,
    notes: result.contentJson?.issues || [],
    verifierProvider,
    rawVerdict: verdict,
  };
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
