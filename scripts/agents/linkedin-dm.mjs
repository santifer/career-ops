/**
 * scripts/agents/linkedin-dm.mjs — Sub-agent: draft the recruiter LinkedIn DM.
 *
 * Stage: 'linkedin-dm' (one of the 5 parallel draft-generation agents in
 * orchestrator stage 4 `fan_out_drafts`).
 *
 * Live mode: Drafts a 160-220 word, 2-3 paragraph recruiter LinkedIn DM.
 * Respects the voice patterns from `data/linkedin-outreach-voice.md` and the
 * full role name convention (never abbreviate). Uses HM-intel to personalize
 * the outreach.
 *
 * @typedef {import('./types.mjs').SubAgentInput} SubAgentInput
 * @typedef {import('./types.mjs').SubAgentOutput} SubAgentOutput
 */

import { dryRunSkipped } from './types.mjs';

const STAGE = 'linkedin-dm';

/**
 * Draft the recruiter LinkedIn DM (160-220 words, 2-3 paragraphs).
 *
 * @param {SubAgentInput} input
 * @returns {Promise<SubAgentOutput>}
 */
export async function runLinkedinDm(input) {
  const dryRun = input?.config?.dryRun ?? true;

  if (dryRun) {
    return dryRunSkipped(STAGE);
  }

  throw new Error('linkedin-dm live mode not yet wired — see Tier B #8');
}
