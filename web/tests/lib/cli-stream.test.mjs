// Tests for cli-stream.mjs — the per-CLI event dialects.
//
// Every fixture below is a real line captured from the actual CLI on 2026-08-11,
// not a guess at the schema. The token arithmetic in particular cannot be
// reasoned out from field names alone: whether `input_tokens` already contains
// the cached portion differs between vendors, and getting it wrong produces a
// plausible number rather than an error.
//
// Run:  node --test tests/lib/cli-stream.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClaude, parseGrok, parseCodex, parserFor, foldUsage, STREAM_CLIS } from "../../src/lib/cli-stream.mjs";

/** All events of one type, for terser assertions. */
const only = (events, type) => events.filter((e) => e.type === type);

// ── Claude ───────────────────────────────────────────────────────────────────

test("claude: text deltas become text", () => {
  const ev = { type: "stream_event", event: { type: "content_block_delta", delta: { text: "Hello" } } };
  assert.deepEqual(parseClaude(ev), [{ type: "text", text: "Hello" }]);
});

test("claude: tool_use blocks become tool events", () => {
  const ev = { type: "stream_event", event: { type: "content_block_start", content_block: { type: "tool_use", name: "Read" } } };
  assert.deepEqual(parseClaude(ev), [{ type: "tool", name: "Read" }]);
});

test("claude: usage excludes cache reads", () => {
  const ev = {
    type: "result",
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 9000, cache_creation_input_tokens: 5 },
    total_cost_usd: 0.0125,
  };
  // 9000 cached reads are the discounted path; counting them would make a
  // well-cached run look more expensive than a cold one.
  assert.deepEqual(parseClaude(ev), [{ type: "usage", tokens: 125, costUsd: 0.0125 }]);
});

test("claude: a result without a cost reports null, not zero", () => {
  const ev = { type: "result", usage: { input_tokens: 10, output_tokens: 1 } };
  assert.equal(parseClaude(ev)[0].costUsd, null, "zero would read as a free run");
});

// ── Grok ─────────────────────────────────────────────────────────────────────

test("grok: text events carry `data`, not `text`", () => {
  assert.deepEqual(parseGrok({ type: "text", data: "HI" }), [{ type: "text", text: "HI" }]);
});

test("grok: reasoning is not answer text", () => {
  // `thought` is chain-of-thought. Emitting it would put reasoning in the report
  // pane AND set emittedText for a run that never answered — defeating the
  // route's honesty gate.
  assert.deepEqual(parseGrok({ type: "thought", data: "The user wants..." }), []);
});

test("grok: the tool manifest is dropped", () => {
  // available_commands is multi-kilobyte and repeats on every turn.
  assert.deepEqual(parseGrok({ type: "available_commands", tools: ["read_file"], commands: [] }), []);
});

test("grok: tool_call reports the tool name", () => {
  const ev = { type: "tool_call", toolCallId: "call-1", title: "read_file", toolName: "read_file", status: "pending" };
  assert.deepEqual(parseGrok(ev), [{ type: "tool", name: "read_file" }]);
});

test("grok: end carries the turn total and a real cost", () => {
  // Verbatim from a live run. The arithmetic that proves input_tokens EXCLUDES
  // cache reads: 18575 + 32 + 5376 + 0 == 23983 == grok's own total_tokens.
  const ev = {
    type: "end",
    stopReason: "end_turn",
    usage: { input_tokens: 18575, cache_read_input_tokens: 5376, cache_creation_input_tokens: 0, output_tokens: 32, reasoning_tokens: 27, total_tokens: 23983 },
    total_cost_usd: 0.0389548,
  };
  assert.deepEqual(parseGrok(ev), [{ type: "usage", tokens: 18607, costUsd: 0.0389548 }]);
  assert.notEqual(parseGrok(ev)[0].tokens, 23983, "total_tokens includes discounted cache reads");
});

test("grok: intermediate usage is emitted too", () => {
  // So a run killed before `end` still records something rather than zero.
  const ev = { type: "usage", usage: { input_tokens: 100, output_tokens: 5, cache_creation_input_tokens: 0 } };
  assert.deepEqual(only(parseGrok(ev), "usage"), [{ type: "usage", tokens: 105, costUsd: null }]);
});

// ── Codex ────────────────────────────────────────────────────────────────────

test("codex: the answer arrives whole, in a completed agent_message", () => {
  const ev = { type: "item.completed", item: { id: "item_3", type: "agent_message", text: "career-ops" } };
  assert.deepEqual(parseCodex(ev), [{ type: "text", text: "career-ops" }]);
});

test("codex: non-message items are tool activity", () => {
  const ev = { type: "item.started", item: { id: "item_0", type: "command_execution", command: "/bin/bash -lc 'node doctor.mjs'" } };
  assert.deepEqual(parseCodex(ev), [{ type: "tool", name: "command_execution" }]);
});

test("codex: a completed command is not re-reported as a tool", () => {
  // item.started already announced it; item.completed would double it.
  const ev = { type: "item.completed", item: { id: "item_0", type: "command_execution", exit_code: 0 } };
  assert.deepEqual(parseCodex(ev), []);
});

test("codex: cached input is SUBTRACTED, not added", () => {
  // The vendor difference that makes a shared formula wrong. OpenAI's
  // input_tokens already contains cached_input_tokens, so adding them
  // double-counts: this run is 19136 fresh + 593 out, not 84497.
  const ev = { type: "turn.completed", usage: { input_tokens: 83904, cached_input_tokens: 64768, output_tokens: 593, reasoning_output_tokens: 364 } };
  assert.deepEqual(parseCodex(ev), [{ type: "usage", tokens: 19729, costUsd: null }]);
});

test("codex: cost is null, never invented", () => {
  const ev = { type: "turn.completed", usage: { input_tokens: 10, output_tokens: 2 } };
  assert.equal(parseCodex(ev)[0].costUsd, null, "codex reports no cost; a guessed rate would be fiction");
});

test("codex: a malformed usage block cannot go negative", () => {
  const ev = { type: "turn.completed", usage: { input_tokens: 5, cached_input_tokens: 900, output_tokens: 1 } };
  assert.equal(parseCodex(ev)[0].tokens, 1);
});

// ── shared robustness ────────────────────────────────────────────────────────

for (const [name, parse] of [["claude", parseClaude], ["grok", parseGrok], ["codex", parseCodex]]) {
  test(`${name}: unknown and malformed events are ignored, not thrown on`, () => {
    // A CLI adding an event type in a future release must not kill a live run.
    for (const junk of [null, undefined, 42, "text", [], {}, { type: "some.future.event" }]) {
      assert.deepEqual(parse(junk), [], `${name} choked on ${JSON.stringify(junk)}`);
    }
  });

  test(`${name}: a usage event with no counts reports 0, not NaN`, () => {
    const ev = name === "claude" ? { type: "result", usage: {} }
      : name === "grok" ? { type: "end", usage: {} }
        : { type: "turn.completed", usage: {} };
    assert.equal(parse(ev)[0].tokens, 0);
  });
}

// ── registry ─────────────────────────────────────────────────────────────────

test("parserFor resolves the CLIs with a structured mode", () => {
  assert.equal(parserFor("claude"), parseClaude);
  assert.equal(parserFor("grok"), parseGrok);
  assert.equal(parserFor("codex"), parseCodex);
});

test("parserFor returns null for text-only CLIs", () => {
  // null is meaningful: the route falls back to raw stdout passthrough.
  for (const id of ["gemini", "qwen", "copilot", "antigravity"]) {
    assert.equal(parserFor(id), null, `${id} has no structured mode wired`);
  }
});

test("parserFor is not fooled by inherited Object properties", () => {
  // parserFor dispatches on a value from the request body, so the names that
  // are only reachable through Object.prototype are the ones that matter.
  // Under the object-literal + hasOwnProperty form these were the guard's whole
  // job; under the switch they cannot be reached at all — assert either way, so
  // the property survives a future refactor back to a table.
  for (const name of ["constructor", "toString", "__proto__", "valueOf", "hasOwnProperty"]) {
    assert.equal(parserFor(name), null, `${name} must not resolve to a parser`);
  }
});

test("parserFor returns null for junk rather than throwing", () => {
  // It is a lookup on caller-supplied text; a bad request must 400 upstream,
  // never crash the stream reader.
  for (const junk of [undefined, null, "", 42, {}, [], Symbol.iterator]) {
    assert.equal(parserFor(junk), null, `parserFor(${String(junk)}) should be null`);
  }
});

test("STREAM_CLIS and parserFor do not drift", () => {
  // The switch is the dispatch and STREAM_CLIS is only a listing, so nothing
  // structurally keeps them in step. A CLI added to one and not the other is
  // either an unreachable parser or a capability claimed and not delivered.
  for (const id of STREAM_CLIS) {
    assert.equal(typeof parserFor(id), "function", `${id} is listed but has no parser`);
  }
  assert.equal(STREAM_CLIS.length, 3, "a new streaming CLI needs a switch arm and a listing entry");
});

// ── malformed usage blocks ───────────────────────────────────────────────────

test("a fractional token count is rejected, not rounded", () => {
  // CodeRabbit on this PR: `n` documented an integer and accepted 1.5, so a
  // malformed event could put a fractional total into /api/usage — where it is
  // read as money. Zero is the honest answer to an unparseable count.
  const ev = { type: "result", usage: { input_tokens: 1.5, output_tokens: 2 } };
  assert.deepEqual(parseClaude(ev), [{ type: "usage", tokens: 2, costUsd: null }]);
});

test("a value beyond the safe-integer range is rejected too", () => {
  // 2^53 arithmetic silently loses precision, so a total built from one is not
  // a number anyone should be billed against.
  const ev = { type: "result", usage: { input_tokens: Number.MAX_SAFE_INTEGER + 2, output_tokens: 3 } };
  assert.deepEqual(parseClaude(ev), [{ type: "usage", tokens: 3, costUsd: null }]);
});

test("negatives, NaN, Infinity and non-numbers all count as zero", () => {
  for (const bad of [-5, NaN, Infinity, -Infinity, "100", null, undefined, {}]) {
    const ev = { type: "result", usage: { input_tokens: bad, output_tokens: 7 } };
    assert.equal(parseClaude(ev)[0].tokens, 7, `not ignored: ${String(bad)}`);
  }
});

// ── folding usage across a run ───────────────────────────────────────────────

test("tokens are strict last-wins", () => {
  // The final total supersedes the intermediates — and keeping intermediates at
  // all is what lets a run killed mid-flight record something rather than zero.
  let acc = { tokens: 0, costUsd: null };
  acc = foldUsage(acc, { tokens: 105, costUsd: null });
  acc = foldUsage(acc, { tokens: 18607, costUsd: 0.0389548 });
  assert.deepEqual(acc, { tokens: 18607, costUsd: 0.0389548 });
});

test("a later null does NOT erase a cost already reported", () => {
  // The one CodeRabbit review point on this PR that was not adopted. Strict
  // last-wins on costUsd would turn a run that cost money into a free one, and
  // /api/usage exists to make spend visible. Grok's real sequence is
  // null → null → number, so nothing is stale in practice; this guards the
  // ordering nothing enforces.
  let acc = foldUsage({ tokens: 0, costUsd: null }, { tokens: 100, costUsd: 0.05 });
  acc = foldUsage(acc, { tokens: 120, costUsd: null });
  assert.equal(acc.costUsd, 0.05, "a trailing null must not report the run as free");
  assert.equal(acc.tokens, 120, "tokens still take the later value");
});

test("a zero cost is a cost, not a missing one", () => {
  const acc = foldUsage({ tokens: 0, costUsd: 0.05 }, { tokens: 1, costUsd: 0 });
  assert.equal(acc.costUsd, 0, "0 is a number and must win over an earlier 0.05");
});

test("foldUsage does not mutate its input and survives junk", () => {
  const prev = { tokens: 5, costUsd: 0.01 };
  foldUsage(prev, { tokens: 9, costUsd: 0.02 });
  assert.deepEqual(prev, { tokens: 5, costUsd: 0.01 }, "prev was mutated");
  for (const junk of [null, undefined, 42, "usage"]) {
    assert.deepEqual(foldUsage(prev, junk), { tokens: 5, costUsd: 0.01 }, `junk changed the total: ${String(junk)}`);
  }
  assert.deepEqual(foldUsage(null, { tokens: 3, costUsd: null }), { tokens: 3, costUsd: null });
});

test("a malformed token count in a fold reports zero, not the previous total", () => {
  const acc = foldUsage({ tokens: 500, costUsd: 0.1 }, { tokens: 1.5, costUsd: null });
  assert.equal(acc.tokens, 0, "a fractional count must not be carried through as the old total either");
});
