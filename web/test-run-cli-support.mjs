import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accumulateTokens,
  completedReportNames,
  hasNewCompletedReport,
  isFatalCodexStderr,
  parseClaudeEvent,
  parseCodexEvent,
} from "./src/lib/run-cli-support.mjs";

test("Codex agent message becomes dashboard text", () => {
  const event = parseCodexEvent(JSON.stringify({
    type: "item.completed",
    item: { type: "agent_message", text: "VERDICT: 4.2/5 — strong fit" },
  }));
  assert.deepEqual(event, { text: "VERDICT: 4.2/5 — strong fit" });
});

test("Codex usage becomes a token count", () => {
  const event = parseCodexEvent(JSON.stringify({
    type: "turn.completed",
    usage: { input_tokens: 120, cached_input_tokens: 80, output_tokens: 30 },
  }));
  assert.deepEqual(event, { tokens: 150 });
});

test("Codex turn.completed without usage is ignored, not zeroed", () => {
  const event = parseCodexEvent(JSON.stringify({ type: "turn.completed" }));
  assert.equal(event, null);
});

test("invalid and irrelevant Codex lines are ignored", () => {
  assert.equal(parseCodexEvent("not json"), null);
  assert.equal(parseCodexEvent('{"type":"item.completed","item":{"type":"command_execution"}}'), null);
});

test("a syntactically-valid but unrecognized Codex event type is ignored", () => {
  assert.equal(parseCodexEvent(JSON.stringify({ type: "session.diff" })), null);
});

test("Codex item.started maps command_execution to the Bash tool", () => {
  const event = parseCodexEvent(JSON.stringify({ type: "item.started", item: { type: "command_execution" } }));
  assert.deepEqual(event, { tool: "Bash" });
});

test("Codex item.started maps web_search to the WebSearch tool", () => {
  const event = parseCodexEvent(JSON.stringify({ type: "item.started", item: { type: "web_search" } }));
  assert.deepEqual(event, { tool: "WebSearch" });
});

test("Codex item.started maps a named mcp_tool_call to its tool name", () => {
  const event = parseCodexEvent(JSON.stringify({ type: "item.started", item: { type: "mcp_tool_call", tool: "reserve-report-num" } }));
  assert.deepEqual(event, { tool: "reserve-report-num" });
});

test("Codex item.started falls back to Working for an unnamed mcp_tool_call", () => {
  const event = parseCodexEvent(JSON.stringify({ type: "item.started", item: { type: "mcp_tool_call" } }));
  assert.deepEqual(event, { tool: "Working" });
});

test("Codex turn.failed extracts the error.message", () => {
  const event = parseCodexEvent(JSON.stringify({ type: "turn.failed", error: { message: "model unavailable" } }));
  assert.deepEqual(event, { error: "model unavailable" });
});

test("Codex error event falls back to a top-level message", () => {
  const event = parseCodexEvent(JSON.stringify({ type: "error", message: "connection reset" }));
  assert.deepEqual(event, { error: "connection reset" });
});

test("Codex error event with no message uses the default fallback", () => {
  const event = parseCodexEvent(JSON.stringify({ type: "error" }));
  assert.deepEqual(event, { error: "Codex failed before finishing" });
});

test("benign Codex stderr diagnostics are not fatal", () => {
  assert.equal(isFatalCodexStderr("ERROR codex_models_manager::cache: failed to load models cache: schema mismatch"), false);
});

test("Codex auth-failure stderr phrases are fatal", () => {
  assert.equal(isFatalCodexStderr("Error: unauthorized"), true);
  assert.equal(isFatalCodexStderr("please log in to continue"), true);
  assert.equal(isFatalCodexStderr("credential file missing"), true);
  assert.equal(isFatalCodexStderr("403 forbidden"), true);
  assert.equal(isFatalCodexStderr("not authenticated"), true);
  assert.equal(isFatalCodexStderr("sign in required"), true);
});

test("Codex quota/rate-limit stderr is fatal", () => {
  assert.equal(isFatalCodexStderr("Error: quota exceeded"), true);
  assert.equal(isFatalCodexStderr("429 rate limit hit"), true);
});

test("Claude tool_use stream event becomes a dashboard tool", () => {
  const event = parseClaudeEvent(JSON.stringify({
    type: "stream_event",
    event: { type: "content_block_start", content_block: { type: "tool_use", name: "WebFetch" } },
  }));
  assert.deepEqual(event, { tool: "WebFetch" });
});

test("Claude text delta becomes dashboard text", () => {
  const event = parseClaudeEvent(JSON.stringify({
    type: "stream_event",
    event: { type: "content_block_delta", delta: { text: "Evaluating..." } },
  }));
  assert.deepEqual(event, { text: "Evaluating..." });
});

test("Claude system init becomes the ready status", () => {
  const event = parseClaudeEvent(JSON.stringify({ type: "system", subtype: "init" }));
  assert.deepEqual(event, { status: "Agent ready" });
});

test("Claude result usage becomes tokens + cost", () => {
  const event = parseClaudeEvent(JSON.stringify({
    type: "result",
    usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 5 },
    total_cost_usd: 0.012,
  }));
  assert.deepEqual(event, { tokens: 125, costUsd: 0.012 });
});

test("Claude result without usage is ignored, not zeroed", () => {
  const event = parseClaudeEvent(JSON.stringify({ type: "result" }));
  assert.equal(event, null);
});

test("invalid and irrelevant Claude lines are ignored", () => {
  assert.equal(parseClaudeEvent("not json"), null);
  assert.equal(parseClaudeEvent('{"type":"stream_event","event":{"type":"content_block_stop"}}'), null);
});

test("a syntactically-valid but unrecognized Claude event type is ignored", () => {
  assert.equal(parseClaudeEvent(JSON.stringify({ type: "assistant" })), null);
});

test("accumulateTokens sums across multiple turns instead of overwriting", () => {
  let total = 0;
  total = accumulateTokens(total, { tokens: 100 });
  total = accumulateTokens(total, { tokens: 50 });
  assert.equal(total, 150);
});

test("accumulateTokens ignores events without a token count", () => {
  assert.equal(accumulateTokens(120, { status: "Evaluating the role" }), 120);
});

test("accumulateTokens ignores a null event (unparseable or unrecognized line)", () => {
  assert.equal(accumulateTokens(120, null), 120);
});

test("completedReportNames filters out RESERVED sentinels", () => {
  const names = completedReportNames(["020-existing.md", "021-RESERVED.md", "readme.txt"]);
  assert.deepEqual([...names].sort(), ["020-existing.md"]);
});

test("replacing a reservation with a report counts as persistence", () => {
  const before = ["020-existing.md", "021-RESERVED.md"];
  assert.equal(hasNewCompletedReport(before, ["020-existing.md", "021-new-company.md"]), true);
});

test("reservation churn alone does not count as persistence", () => {
  const before = ["020-existing.md", "021-RESERVED.md"];
  assert.equal(hasNewCompletedReport(before, ["020-existing.md", "022-RESERVED.md"]), false);
});
