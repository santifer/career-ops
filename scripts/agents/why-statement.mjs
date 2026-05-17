/**
 * scripts/agents/why-statement.mjs — Sub-agent: draft the "Why this company / role" one-pager.
 *
 * Stage: 'why-statement' (one of the 5 parallel draft-generation agents in
 * orchestrator stage 4 `fan_out_drafts`).
 *
 * Live mode: Drafts a one-pager explaining why Mitchell is compelling for this
 * specific company and role. Uses HM-intel, company AI-policy notes, and the
 * voice corpus for calibration.
 *
 * @typedef {import('./types.mjs').SubAgentInput} SubAgentInput
 * @typedef {import('./types.mjs').SubAgentOutput} SubAgentOutput
 */

import { dryRunSkipped } from './types.mjs';

const STAGE = 'why-statement';

/**
 * Draft the "Why this company / role" one-pager.
 *
 * @param {SubAgentInput} input
 * @returns {Promise<SubAgentOutput>}
 */
export async function runWhyStatement(input) {
  const dryRun = input?.config?.dryRun ?? true;

  if (dryRun) {
    return dryRunSkipped(STAGE);
  }

  throw new Error('why-statement live mode not yet wired — see Tier B #8');
}
