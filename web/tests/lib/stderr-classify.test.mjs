// Tests for stderr-classify.mjs — the failure/noise decision on one stderr line.
//
// The exemption for a CLI's housekeeping output is a hole punched in a
// deliberately broad failure rule, so the tests that matter are the ones
// proving the hole is exactly the size of the diagnostic it was cut for.
//
// Run:  node --test tests/lib/stderr-classify.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { isStderrFailure, isBenignStderrLine, STDERR_FAILURE, BENIGN_STDERR } from "../../src/lib/stderr-classify.mjs";

/** Verbatim from every codex run. */
const CODEX_NOISE =
  "2026-08-11T05:15:58.824552Z ERROR codex_models_manager::cache: failed to load models cache: missing field `base_instructions` at line 94 column 5";

// ── the exemption ────────────────────────────────────────────────────────────

test("codex's models-cache diagnostic is not a failure", () => {
  assert.equal(isBenignStderrLine("codex", CODEX_NOISE), true);
  assert.equal(isStderrFailure("codex", CODEX_NOISE), false);
});

test("the same line IS a failure for a CLI that has no such exemption", () => {
  // Exemptions are per-CLI: grok has no reason to emit codex's diagnostic, so a
  // line that looks like it is not something to wave through.
  assert.equal(isStderrFailure("grok", CODEX_NOISE), true);
  assert.equal(isStderrFailure("claude", CODEX_NOISE), true);
});

test("the timestamp is optional but the module and message are not", () => {
  assert.equal(isBenignStderrLine("codex", "ERROR codex_models_manager::cache: failed to load models cache"), true);
  assert.equal(isBenignStderrLine("codex", "ERROR some_other_module::cache: failed to load models cache"), false);
  assert.equal(isBenignStderrLine("codex", "ERROR codex_models_manager::cache: could not reach the API"), false);
});

// ── the hole must not be bigger than the diagnostic ──────────────────────────

test("a real error that merely mentions the models cache is still a failure", () => {
  // The regression this file exists for. The first cut matched the substring
  // /models cache|base_instructions/, so every line below was silently
  // discarded and the run reported clean.
  const real = [
    "Error: quota exceeded while refreshing the models cache",
    "fatal: unauthorized — cannot read models cache for this account",
    "ERROR: invalid api-key; models cache untouched",
    "TypeError: Cannot read properties of undefined (reading 'base_instructions')",
  ];
  for (const line of real) {
    assert.equal(isStderrFailure("codex", line), true, `swallowed a real error: ${line}`);
  }
});

test("known gap: STDERR_FAILURE has no word for a bare crash", () => {
  // Found by this file, and pre-existing — nothing to do with the exemption.
  // "panic:" and "failed" appear in neither the pattern nor any benign entry,
  // so a line carrying only those words is classified as ordinary chatter.
  //
  // Deliberately NOT fixed here. Adding "failed" would catch this and also
  // "0 failed" and "Failed to load optional plugin, continuing" — and a false
  // positive marks a run whose PDF rendered fine as failed (see pdfRunOutcome).
  // That trade deserves its own change, not a quiet widening inside a fix for
  // something else. Asserted so the gap is recorded rather than rediscovered.
  assert.equal(isStderrFailure("codex", "panic: failed to write models cache: disk full"), false);
  assert.equal(isStderrFailure("claude", "panic: goroutine stack exceeds limit"), false);
});

test("the exemption is anchored — it cannot be smuggled in mid-line", () => {
  // A JD, a filename or an echoed command could carry the text anywhere in a
  // line; only a line that STARTS as the diagnostic is the diagnostic.
  const smuggled = `Error: build failed — ERROR codex_models_manager::cache: failed to load models cache`;
  assert.equal(isBenignStderrLine("codex", smuggled), false);
  assert.equal(isStderrFailure("codex", smuggled), true);
});

test("an unknown CLI has no exemptions", () => {
  assert.equal(isBenignStderrLine("nope", CODEX_NOISE), false);
  assert.equal(isBenignStderrLine("constructor", "anything"), false, "not fooled by inherited properties");
  assert.equal(isBenignStderrLine("toString", "anything"), false);
});

// ── the broad rule itself ────────────────────────────────────────────────────

test("the failure words that matter are all caught", () => {
  // Auth and quota failures are the common real ones and a narrow regex missed
  // them, which reads as a silent success — the worst outcome available.
  for (const line of [
    "Not logged in · Please run /login",
    "401 unauthorized",
    "You have exceeded your quota",
    "rate limit reached, try again later",
    "invalid credential",
    "command not found: codex",
  ]) {
    assert.equal(isStderrFailure("codex", line), true, `missed: ${line}`);
  }
});

test("ordinary progress chatter is not a failure", () => {
  for (const line of ["Reading additional input from stdin...", "  Compiled successfully", "warning: 2 unused variables"]) {
    assert.equal(isStderrFailure("codex", line), false, `false positive: ${line}`);
  }
});

test("blank lines are never a failure", () => {
  for (const line of ["", "   ", "\t", null, undefined]) assert.equal(isStderrFailure("codex", line), false);
});

// ── shape ────────────────────────────────────────────────────────────────────

test("every benign pattern is anchored at the start of the line", () => {
  // The property that keeps rule 2 from becoming a hole in rule 1. Asserted
  // structurally so a future entry cannot quietly be added as a substring test.
  for (const [cli, patterns] of Object.entries(BENIGN_STDERR)) {
    for (const re of patterns) {
      assert.ok(re.source.startsWith("^"), `${cli}: ${re} must be anchored`);
      assert.ok(!re.flags.includes("i"), `${cli}: ${re} should not be case-insensitive — the emitting module's casing is fixed`);
    }
  }
});

test("STDERR_FAILURE is exported for reuse rather than re-typed elsewhere", () => {
  assert.ok(STDERR_FAILURE instanceof RegExp);
  assert.ok(STDERR_FAILURE.flags.includes("i"));
});
