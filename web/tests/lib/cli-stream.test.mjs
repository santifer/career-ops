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
import { parseClaude, parseGrok, parseCodex, parserFor } from "../../src/lib/cli-stream.mjs";

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
  assert.equal(parserFor("constructor"), null);
  assert.equal(parserFor("toString"), null);
});
