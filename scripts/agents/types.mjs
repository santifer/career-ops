/**
 * scripts/agents/types.mjs — Shared type definitions for the Phase 3
 * sub-agent contract.
 *
 * Each sub-agent in `scripts/agents/` consumes a `SubAgentInput` and returns
 * a `SubAgentOutput`. The contract is identical across all 5 draft-generation
 * agents so the orchestrator's `Promise.allSettled` fan-out can treat every
 * result uniformly.
 *
 * These are JSDoc-only type definitions (no runtime values). Import them
 * from any sub-agent file via:
 *
 *   /** @typedef {import('./types.mjs').SubAgentInput} SubAgentInput *\/
 */

/**
 * @typedef {Object} SubAgentInput
 * @property {Object}  pack       - The ApplyPack assembled so far (read-only for this stage).
 *                                  Shape matches `lib/apply-pack-schema.mjs`.
 * @property {Object}  context    - Corpus + intel loaded by the orchestrator's stage 3.
 * @property {string}  context.cv                  - Contents of cv.md (or its path).
 * @property {string}  context.articleDigest       - Contents of article-digest.md (or its path).
 * @property {string}  context.voiceReference      - Contents of writing-samples/voice-reference.md.
 * @property {Object|null} context.hmIntel         - Parsed data/hm-intel/{slug}.json, or null.
 * @property {Object}  context.aiPolicy            - AI-policy excerpt from data/ai-policies.yml.
 * @property {Object}  config     - Runtime configuration flags.
 * @property {boolean} config.dryRun               - When true, return a scaffold stub without
 *                                                   making any LLM call. Defaults to true.
 * @property {string}  [config.model]              - Claude model ID to use in live mode
 *                                                   (e.g. "claude-sonnet-4-6").
 * @property {string}  [config.reasoningEffort]    - Thinking budget: "none" | "low" | "high".
 */

/**
 * @typedef {Object} SubAgentOutput
 * @property {string}           stage       - One of the five agent stage names:
 *                                            'cv-tailor' | 'cover-letter' | 'why-statement' |
 *                                            'linkedin-dm' | 'form-fields'
 * @property {'ok'|'skipped'|'error'} status
 * @property {string|Object|null} output    - The generated artifact.
 *                                            Markdown string for prose stages;
 *                                            JSON array of {question, answer} objects for 'form-fields';
 *                                            null when status is 'skipped' or 'error'.
 * @property {Object}           diagnostics - Execution metadata for cost/perf tracking.
 * @property {number}           diagnostics.duration_ms
 * @property {number}           diagnostics.cost_estimate_usd
 * @property {number}           diagnostics.tokens_used
 * @property {string}           diagnostics.model_used
 * @property {string|null}      error       - Error message when status === 'error', else null.
 */

/** Dry-run diagnostics sentinel shared by all shims. */
export const DRY_RUN_DIAGNOSTICS = {
  duration_ms: 0,
  cost_estimate_usd: 0,
  tokens_used: 0,
  model_used: 'dry-run',
};

/**
 * Build a canonical dry-run skipped output for a sub-agent stage.
 *
 * @param {string} stage - The stage name (one of the five agent keys).
 * @returns {SubAgentOutput}
 */
export function dryRunSkipped(stage) {
  return {
    stage,
    status: 'skipped',
    output: null,
    diagnostics: { ...DRY_RUN_DIAGNOSTICS },
    error: null,
  };
}
