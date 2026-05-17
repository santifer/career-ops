/**
 * scripts/agents/form-fields.mjs — Sub-agent: fill structured application form fields.
 *
 * Stage: 'form-fields' (one of the 5 parallel draft-generation agents in
 * orchestrator stage 4 `fan_out_drafts`).
 *
 * Live mode: Answers each structured application form question using cv.md,
 * article-digest.md, and the JD text. Output is a JSON array of
 * { question: string, answer: string } objects. Answers are grounded
 * exclusively in corpus files — no fabricated metrics.
 *
 * @typedef {import('./types.mjs').SubAgentInput} SubAgentInput
 * @typedef {import('./types.mjs').SubAgentOutput} SubAgentOutput
 */

import { dryRunSkipped } from './types.mjs';

const STAGE = 'form-fields';

/**
 * Fill the structured application form-field answers.
 *
 * @param {SubAgentInput} input
 * @returns {Promise<SubAgentOutput>}
 */
export async function runFormFields(input) {
  const dryRun = input?.config?.dryRun ?? true;

  if (dryRun) {
    return dryRunSkipped(STAGE);
  }

  throw new Error('form-fields live mode not yet wired — see Tier B #8');
}
