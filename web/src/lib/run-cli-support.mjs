// Plain .mjs (same pattern as tracker-table.mjs/clean-chips.mjs/spawn-cli.mjs)
// so test-run-cli-support.mjs can import it directly under Node. Import it
// with the .mjs extension included (e.g. "@/lib/run-cli-support.mjs" or
// "./run-cli-support.mjs") — unlike .ts files, which TypeScript resolves
// without an extension, ESM specifiers for plain JS modules must be fully
// specified.

/**
 * Dashboard-friendly shape both `parseCodexEvent` and `parseClaudeEvent` return.
 * Usually at most one payload field (`tool`/`text`/`tokens`/`costUsd`/`error`) is
 * set per event; `status` may accompany any of them, and `tokens`/`costUsd` may
 * co-occur on a Claude `result` event.
 * @typedef {{status?: string, tool?: string, text?: string, tokens?: number, costUsd?: number, error?: string}} ParsedEvent
 */

const STATUS_READY = "Agent ready";

/** Codex `exec --json` stderr that should short-circuit a run as fatal — narrow
 * on purpose (auth + quota/rate-limit only). Codex can emit benign ERROR-level
 * diagnostics (e.g. a stale local model-cache schema) and still complete
 * successfully, so its JSONL stream + exit code stay authoritative for
 * everything else. */
const CODEX_FATAL_STDERR_RE =
  /unauthorized|forbidden|not authenticated|please log in|sign[ -]?in required|credential.*missing|quota|rate limit/i;

/**
 * Whether one Codex stderr chunk should be treated as a fatal error.
 * @param {string} line
 * @returns {boolean}
 */
export function isFatalCodexStderr(line) {
  return CODEX_FATAL_STDERR_RE.test(line);
}

/**
 * Convert one `codex exec --json` JSONL event into dashboard-friendly data.
 * @returns {ParsedEvent | null}
 */
export function parseCodexEvent(line) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }

  if (event.type === "thread.started") return { status: STATUS_READY };
  if (event.type === "turn.started") return { status: "Evaluating the role" };

  if (event.type === "item.started") {
    const type = event.item?.type;
    if (type === "command_execution") return { tool: "Bash" };
    if (type === "web_search") return { tool: "WebSearch" };
    if (type === "mcp_tool_call") return { tool: event.item?.tool || "Working" };
  }

  if (event.type === "item.completed" && event.item?.type === "agent_message") {
    return typeof event.item.text === "string" ? { text: event.item.text } : null;
  }

  if (event.type === "turn.completed") {
    // No `usage` block means nothing to report — return null rather than a
    // {tokens: 0}, so the caller's `typeof === "number"` guard skips it instead
    // of clobbering a correct running total from an earlier turn.
    if (!event.usage) return null;
    const usage = event.usage;
    return {
      tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    };
  }

  if (event.type === "turn.failed" || event.type === "error") {
    const message = event.error?.message || event.message || "Codex failed before finishing";
    return { error: String(message) };
  }

  return null;
}

/**
 * Convert one Claude Code `--output-format stream-json` line into the same
 * dashboard-friendly shape `parseCodexEvent` produces.
 * @returns {ParsedEvent | null}
 */
export function parseClaudeEvent(line) {
  let ev;
  try {
    ev = JSON.parse(line);
  } catch {
    return null;
  }

  if (ev.type === "stream_event") {
    const e = ev.event;
    if (e?.type === "content_block_start" && e.content_block?.type === "tool_use") {
      return { tool: e.content_block.name };
    }
    if (e?.type === "content_block_delta" && e.delta?.text) {
      return { text: e.delta.text };
    }
    return null;
  }

  if (ev.type === "system" && ev.subtype === "init") {
    return { status: STATUS_READY };
  }

  if (ev.type === "result") {
    // No `usage` block means nothing to report — same null-over-zero rule as
    // parseCodexEvent's turn.completed, for the same reason.
    if (!ev.usage) return null;
    // Tokens = the same formula /api/usage uses: input + output + cache-creation.
    const u = ev.usage;
    const result = { tokens: (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0) };
    if (typeof ev.total_cost_usd === "number") result.costUsd = ev.total_cost_usd;
    return result;
  }

  return null;
}

/**
 * Fold one parsed event's token count into a running total. `turn.completed`
 * (Codex) and `result` (Claude) usage is per-event, not cumulative-since-start,
 * so callers must accumulate across multiple events in one run rather than
 * overwrite — otherwise a multi-turn run silently undercounts.
 */
export function accumulateTokens(current, ev) {
  return typeof ev?.tokens === "number" ? current + ev.tokens : current;
}

// Must match reserve-report-num.mjs's own reservation-filename convention
// (writer: `${formatReportNumber(num)}-RESERVED.md`; reader regex:
// /^\d+-RESERVED\.md$/) — kept as a local constant rather than a cross-package
// import since reserve-report-num.mjs is a root-level script web/ doesn't
// otherwise import from.
const RESERVED_SUFFIX = "-RESERVED.md";

/** Reservation sentinels are not completed reports. */
export function completedReportNames(entries) {
  return new Set(entries.filter((name) => name.endsWith(".md") && !name.endsWith(RESERVED_SUFFIX)));
}

/**
 * Whether `afterEntries` contains a completed report name absent from
 * `beforeEntries` — i.e. persistence actually happened, as opposed to a
 * `NNN-RESERVED.md` sentinel merely being replaced or churned.
 * @param {string[]} beforeEntries
 * @param {string[]} afterEntries
 * @returns {boolean}
 */
export function hasNewCompletedReport(beforeEntries, afterEntries) {
  const before = completedReportNames(beforeEntries);
  const after = completedReportNames(afterEntries);
  for (const name of after) {
    if (!before.has(name)) return true;
  }
  return false;
}
