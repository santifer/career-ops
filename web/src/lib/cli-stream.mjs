/**
 * cli-stream.mjs — normalize each agent CLI's structured output into one event shape.
 *
 * Every CLI streams a different JSON dialect, so /api/run used to parse Claude's
 * inline and fall back to raw-text passthrough for everything else. That worked
 * for display but threw away the usage numbers, and a codex/grok run was
 * recorded as `tokens: 0, costUsd: null` — the cost of a whole evaluation
 * invisible in /api/usage. This maps each dialect onto:
 *
 *   {type:'text',   text}          answer text (NOT reasoning — see below)
 *   {type:'tool',   name}
 *   {type:'status', label}
 *   {type:'usage',  tokens, costUsd|null}
 *
 * Parsers take ONE already-parsed JSON value and return zero or more events, so
 * line buffering and transport stay in the route and the dialect knowledge
 * stays here, unit-testable against captured fixtures.
 *
 * ── The token formula, and why it is not the same expression everywhere ──
 *
 * `tokens` means "tokens billed at full rate": fresh input + output + cache
 * writes. Cache READS are excluded — they are the discounted path, and counting
 * them would make a well-cached run look more expensive than a cold one.
 *
 * The trap is that the CLIs disagree on whether `input_tokens` already includes
 * the cached portion:
 *
 *   Claude  input_tokens EXCLUDES cache reads (they are cache_read_input_tokens)
 *           → input + output + cache_creation
 *   Grok    same convention. Verified arithmetically against a real run:
 *           18575 + 32 + 5376 + 0 == 23983, the total_tokens grok itself
 *           reports — so input_tokens does not already contain the 5376 read.
 *           → input + output + cache_creation
 *   Codex   input_tokens INCLUDES cached_input_tokens (OpenAI's convention),
 *           so adding them would double-count and subtracting is required.
 *           → (input - cached) + output
 *
 * Getting this wrong does not throw; it silently makes cross-CLI cost
 * comparison meaningless, which is the entire point of recording it.
 *
 * Cost: Claude and Grok report total_cost_usd. Codex reports none, so costUsd
 * stays null rather than being invented from a token count and a guessed rate.
 */

/** Non-negative integer, or 0. Guards against nulls in partial usage blocks. */
function n(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/** Claude / Grok convention: input excludes cache reads. */
function fullRateAnthropicStyle(u) {
  return n(u.input_tokens) + n(u.output_tokens) + n(u.cache_creation_input_tokens);
}

/**
 * Claude Code — `--output-format stream-json --verbose --include-partial-messages`
 */
export function parseClaude(ev) {
  if (!ev || typeof ev !== 'object') return [];

  if (ev.type === 'stream_event') {
    const e = ev.event;
    if (e?.type === 'content_block_start' && e.content_block?.type === 'tool_use') {
      return [{ type: 'tool', name: String(e.content_block.name ?? 'tool') }];
    }
    if (e?.type === 'content_block_delta' && e.delta?.text) {
      return [{ type: 'text', text: String(e.delta.text) }];
    }
    return [];
  }
  if (ev.type === 'system' && ev.subtype === 'init') {
    return [{ type: 'status', label: 'Agent ready' }];
  }
  if (ev.type === 'result') {
    const u = ev.usage || {};
    return [{
      type: 'usage',
      tokens: fullRateAnthropicStyle(u),
      costUsd: typeof ev.total_cost_usd === 'number' ? ev.total_cost_usd : null,
    }];
  }
  return [];
}

/**
 * Grok Build CLI — `--output-format streaming-json`
 *
 * `thought` carries chain-of-thought and is deliberately dropped: surfacing it
 * as answer text would put reasoning into the report pane and, worse, make
 * emittedText true for a run that never produced an answer, defeating the
 * route's honesty gate. `available_commands` is a multi-kilobyte tool manifest
 * repeated on every turn — pure noise.
 *
 * Both `usage` (per model call) and `end` (turn total) carry counts. Both are
 * emitted; the route keeps the last, and `end` always arrives last. Emitting
 * the intermediate ones too means a run killed mid-flight still records
 * something rather than zero.
 */
export function parseGrok(ev) {
  if (!ev || typeof ev !== 'object') return [];

  switch (ev.type) {
    case 'text':
      return ev.data ? [{ type: 'text', text: String(ev.data) }] : [];
    case 'tool_call':
      return [{ type: 'tool', name: String(ev.toolName ?? ev.title ?? 'tool') }];
    case 'usage':
    case 'end': {
      const u = ev.usage || {};
      return [{
        type: 'usage',
        tokens: fullRateAnthropicStyle(u),
        costUsd: typeof ev.total_cost_usd === 'number' ? ev.total_cost_usd : null,
      }];
    }
    default:
      // thought, tool_call_update, available_commands, and anything grok adds later
      return [];
  }
}

/**
 * Codex — `codex exec --json`
 *
 * Text arrives whole in a completed `agent_message` item rather than as deltas,
 * so the pane fills in one step instead of typing out. That is codex's wire
 * format, not something to paper over by faking deltas.
 */
export function parseCodex(ev) {
  if (!ev || typeof ev !== 'object') return [];

  if (ev.type === 'thread.started') return [{ type: 'status', label: 'Agent ready' }];

  if (ev.type === 'item.started' && ev.item?.type && ev.item.type !== 'agent_message') {
    return [{ type: 'tool', name: String(ev.item.type) }];
  }
  if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && ev.item.text) {
    return [{ type: 'text', text: String(ev.item.text) }];
  }
  if (ev.type === 'turn.completed') {
    const u = ev.usage || {};
    // Subtraction, not addition: see the header note on OpenAI's convention.
    // Clamped at 0 so a malformed block can never report negative tokens.
    const fresh = Math.max(0, n(u.input_tokens) - n(u.cached_input_tokens));
    return [{ type: 'usage', tokens: fresh + n(u.output_tokens), costUsd: null }];
  }
  return [];
}

/** cliId → parser, for the CLIs that expose a structured stream. */
export const PARSERS = {
  claude: parseClaude,
  grok: parseGrok,
  codex: parseCodex,
};

/**
 * The parser for a CLI, or null if it has no structured mode.
 *
 * null is meaningful: the route falls back to raw stdout passthrough, which
 * still displays fine — it just cannot report usage. Better than pretending
 * every CLI speaks JSON.
 *
 * @param {string} cliId
 * @returns {((ev: unknown) => Array<Record<string, unknown>>)|null}
 */
export function parserFor(cliId) {
  return Object.prototype.hasOwnProperty.call(PARSERS, cliId) ? PARSERS[cliId] : null;
}
