/**
 * Eval Loop Runner — autoresearch-style evaluation loop
 *
 * Builds test sets from calibration data, scores evaluation results
 * against expected outcomes, and summarizes iteration results.
 */

/** Frozen array of the 6 evaluation criteria. */
export const CRITERIA = Object.freeze([
  'score_within_0.5',
  'deal_breakers_surfaced',
  'proof_points_cited',
  'action_matched',
  'archetype_correct',
  'signals_reflected',
]);

/**
 * Convert calibration log entries to test cases.
 * Filters out entries with empty or missing action field.
 */
export function buildTestSet(calibration) {
  return calibration
    .filter((entry) => entry.action && entry.action.trim() !== '')
    .map((entry) => ({
      company: entry.company,
      role: entry.role,
      expectedScore: entry.score,
      expectedAction: entry.action,
      lesson: entry.lesson || '',
    }));
}

/**
 * Score an evaluation result against expected outcomes.
 *
 * @param {Object} result
 * @param {number} result.score - Actual score
 * @param {number} result.expectedScore - Expected score
 * @param {boolean} result.dealBreakersFound - Were deal breakers surfaced?
 * @param {boolean} result.proofPointsCited - Were proof points cited?
 * @param {boolean} result.actionMatched - Did action match expected?
 * @param {boolean} result.archetypeCorrect - Was archetype correct?
 * @param {boolean} result.signalsReflected - Were signals reflected?
 * @returns {{ passed: number, total: number, passRate: number, failures: string[] }}
 */
export function scoreEvaluation(result) {
  const total = CRITERIA.length;
  const failures = [];

  // Check score within 0.5
  const scoreDelta = Math.abs(
    (typeof result.score === 'number' ? result.score : parseFloat(result.score) || 0) -
    (typeof result.expectedScore === 'number' ? result.expectedScore : parseFloat(result.expectedScore) || 0)
  );
  if (scoreDelta > 0.5) failures.push('score');

  if (!result.dealBreakersFound) failures.push('deal_breakers');
  if (!result.proofPointsCited) failures.push('proof_points');
  if (!result.actionMatched) failures.push('action');
  if (!result.archetypeCorrect) failures.push('archetype');
  if (!result.signalsReflected) failures.push('signals');

  const passed = total - failures.length;
  return {
    passed,
    total,
    passRate: passed / total,
    failures,
  };
}

/**
 * Record a single iteration result.
 */
export function runIteration(iteration, passRate, changes, kept) {
  return {
    iteration,
    passRate,
    changes,
    kept,
  };
}

/**
 * Summarize a list of iteration results into readable text.
 */
export function summarizeResults(iterations) {
  if (!iterations || iterations.length === 0) return 'No iterations to summarize.';

  const lines = ['Eval Loop Summary', '=================', ''];

  for (const it of iterations) {
    const pct = (it.passRate * 100).toFixed(1);
    const status = it.kept ? 'kept' : 'discarded';
    lines.push(`Iteration ${it.iteration}: ${pct}% pass rate — ${status}`);
    if (it.changes) lines.push(`  Changes: ${it.changes}`);
  }

  const startRate = (iterations[0].passRate * 100).toFixed(1);
  const bestIt = iterations.reduce((best, it) => (it.passRate > best.passRate ? it : best), iterations[0]);
  const bestRate = (bestIt.passRate * 100).toFixed(1);

  lines.push('');
  lines.push(`Start: ${startRate}% → Best: ${bestRate}%`);

  const keptCount = iterations.filter((it) => it.kept).length;
  const discardedCount = iterations.filter((it) => !it.kept).length;
  lines.push(`Kept: ${keptCount}, Discarded: ${discardedCount}`);

  return lines.join('\n');
}
