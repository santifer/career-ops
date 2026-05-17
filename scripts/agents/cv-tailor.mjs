/**
 * scripts/agents/cv-tailor.mjs — Sub-agent: tailor cv.md bullets to the JD.
 *
 * Stage: 'cv-tailor' (one of the 5 parallel draft-generation agents in
 * orchestrator stage 4 `fan_out_drafts`).
 *
 * Live mode: Uses HM-intel + voice corpus to select and re-phrase the most
 * relevant cv.md bullets for this specific JD. Wiring is tracked in
 * Tier B #8 — cv-tailor live mode. Until then, live-mode throws.
 *
 * @typedef {import('./types.mjs').SubAgentInput} SubAgentInput
 * @typedef {import('./types.mjs').SubAgentOutput} SubAgentOutput
 */

import { dryRunSkipped } from './types.mjs';

const STAGE = 'cv-tailor';

/**
 * Tailor cv.md bullets to the JD using HM-intel and voice corpus.
 *
 * @param {SubAgentInput} input
 * @returns {Promise<SubAgentOutput>}
 */
export async function runCvTailor(input) {
  const dryRun = input?.config?.dryRun ?? true;

  if (dryRun) {
    return dryRunSkipped(STAGE);
  }

  throw new Error('cv-tailor live mode not yet wired — see Tier B #8');
}
