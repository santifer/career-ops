/**
 * scripts/agents/cover-letter.mjs — Sub-agent: draft the cover letter.
 *
 * Stage: 'cover-letter' (one of the 5 parallel draft-generation agents in
 * orchestrator stage 4 `fan_out_drafts`).
 *
 * Live mode: Drafts the cover letter with `[[HUMAN:openingHook]]` and
 * `[[HUMAN:closingAsk]]` markers preserved for Mitchell's final edit pass.
 * Voice corpus is used for stylistic calibration; NEVER fabricates metrics
 * or experience beyond what cv.md documents.
 *
 * @typedef {import('./types.mjs').SubAgentInput} SubAgentInput
 * @typedef {import('./types.mjs').SubAgentOutput} SubAgentOutput
 */

import { dryRunSkipped } from './types.mjs';

const STAGE = 'cover-letter';

/**
 * Draft the cover letter with [[HUMAN:...]] markers preserved.
 *
 * @param {SubAgentInput} input
 * @returns {Promise<SubAgentOutput>}
 */
export async function runCoverLetter(input) {
  const dryRun = input?.config?.dryRun ?? true;

  if (dryRun) {
    return dryRunSkipped(STAGE);
  }

  throw new Error('cover-letter live mode not yet wired — see Tier B #8');
}
