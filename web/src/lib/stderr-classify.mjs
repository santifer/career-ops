/**
 * stderr-classify.mjs — did this stderr line mean the run failed?
 *
 * Lives in a plain .mjs, and takes a line rather than a chunk, so the decision
 * can be asserted on as a VALUE. The alternative — a regex inlined in route.ts
 * plus a test that greps route.ts's source — is the arrangement
 * claude-invocation.mjs's header explains was defeated five times by rewriting
 * the route around the guard.
 *
 * Two rules pulling against each other:
 *
 * 1. The failure pattern is deliberately BROAD. A silent auth failure is the
 *    worst outcome here: the run looks fine, produces nothing, and the user is
 *    told nothing. So "error", "auth", "quota" and friends all count.
 *
 * 2. Some CLIs log housekeeping to stderr on every single invocation. Codex
 *    emits a models-cache warning each time; read as failure, every codex run
 *    is reported broken.
 *
 * Rule 2 must not become a hole in rule 1. The benign patterns are therefore
 * ANCHORED at the start of the line and pinned to the emitting module and its
 * exact message — not a substring test for "models cache", which would discard
 * a genuine error that happened to mention one. A real failure would have to
 * impersonate the whole diagnostic to slip through.
 */

/**
 * Broad on purpose — see rule 1. Tested against one COMPLETE line: a chunk
 * boundary can fall mid-word, which both hides an error split across two reads
 * and matches fragments that are not the word they look like.
 */
export const STDERR_FAILURE =
  /error|denied|fatal|not found|unauthorized|forbidden|auth|login|credential|api[ -]?key|quota|rate limit|not authenticated/i;

/**
 * Known gap, recorded rather than quietly closed: there is no word here for a
 * bare crash. `panic: failed to write models cache: disk full` matches nothing
 * above and is classified as chatter.
 *
 * Adding "failed" would catch it — and also "0 failed" and "Failed to load
 * optional plugin, continuing". A false positive marks a run whose PDF rendered
 * fine as failed (see pdfRunOutcome), so widening the pattern is a trade worth
 * making on its own terms, not inside a change about something else. Pinned by
 * a test so it stays a decision instead of being rediscovered as a surprise.
 */

/**
 * Per-CLI housekeeping lines, anchored. Each entry must match a complete
 * observed diagnostic, start to identifying message — never a bare keyword.
 *
 * codex, verbatim from every run:
 *   2026-08-11T05:15:58.824552Z ERROR codex_models_manager::cache: failed to
 *   load models cache: missing field `base_instructions` at line 94 column 5
 * The timestamp is optional in the pattern because it is codex's log format,
 * not part of what identifies the message.
 */
export const BENIGN_STDERR = {
  codex: [
    /^(?:\S+\s+)?ERROR\s+codex_models_manager::cache:\s+failed to load models cache\b/,
  ],
};

/**
 * Is this line one of `cliId`'s known-harmless diagnostics?
 *
 * @param {string} cliId
 * @param {string} line - One complete stderr line, no trailing newline.
 * @returns {boolean}
 */
export function isBenignStderrLine(cliId, line) {
  const patterns = Object.prototype.hasOwnProperty.call(BENIGN_STDERR, cliId)
    ? BENIGN_STDERR[cliId]
    : null;
  if (!patterns) return false;
  const text = String(line ?? '');
  return patterns.some((re) => re.test(text));
}

/**
 * The single decision: does this line mean the run failed?
 *
 * @param {string} cliId
 * @param {string} line - One complete stderr line.
 * @returns {boolean}
 */
export function isStderrFailure(cliId, line) {
  const text = String(line ?? '');
  if (!text.trim()) return false;
  if (isBenignStderrLine(cliId, text)) return false;
  return STDERR_FAILURE.test(text);
}
