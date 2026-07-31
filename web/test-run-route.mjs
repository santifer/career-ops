// Regression checks for /api/run process handling. The route is a Next.js TS
// module with path aliases, so keep this as a source-level guard until the web
// app has a fuller route-unit test harness.

import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("./src/app/api/run/route.ts", import.meta.url), "utf8");

test("/api/run does not fail a clean exit because stderr contained a keyword", () => {
  assert.doesNotMatch(source, /else if\s*\(\s*!cleanExit\s*\|\|\s*sawError\s*\)/);
  assert.match(source, /else if\s*\(\s*!cleanExit\s*\)/);
});

test("/api/run stderr keyword matches are not streamed as fatal job errors", () => {
  const stderrHandler = source.match(/child\.stderr\.on\("data",[\s\S]*?\n\s*\}\);/);
  assert.ok(stderrHandler, "stderr handler not found");
  assert.doesNotMatch(stderrHandler[0], /send\(\s*\{\s*type:\s*"error"/);
});

test("/api/run stderr snippets are captured around the matched keyword", () => {
  const stderrHandler = source.match(/child\.stderr\.on\("data",[\s\S]*?\n\s*\}\);/);
  assert.ok(stderrHandler, "stderr handler not found");
  assert.match(stderrHandler[0], /const match = STDERR_ERROR_RE\.exec\(s\)/);
  assert.match(stderrHandler[0], /match\.index - 50/);
  assert.match(stderrHandler[0], /s\.slice\(start, start \+ 200\)\.trim\(\)/);
});

// route.ts is a Next.js route with path aliases the plain `node --test` runner
// can't import directly (see file header), so this mirrors the actual
// STDERR_ERROR_RE + slice-window logic verbatim to test it behaviorally. The
// source-guard test above catches drift if someone edits the real algorithm
// without updating this mirror.
const STDERR_ERROR_RE =
  /\b(?:error|denied|fatal|not found|unauthorized|forbidden|login|credential|api[ -]?key|quota|rate limit|not authenticated|auth(?:entication|orization)?)\b/i;

function productionStderrRegexLiteral() {
  const match = source.match(/const STDERR_ERROR_RE\s*=\s*(\/.+\/[a-z]*);/);
  assert.ok(match, "production STDERR_ERROR_RE literal not found");
  return match[1];
}

function captureStderrSnippet(s) {
  const match = STDERR_ERROR_RE.exec(s);
  if (!match) return "";
  const start = Math.max(0, match.index - 50);
  return s.slice(start, start + 200).trim();
}

test("mirrored stderr matcher stays identical to production", () => {
  assert.equal(STDERR_ERROR_RE.toString(), productionStderrRegexLiteral());
});

test("captureStderrSnippet returns a trimmed 200-char window centered on the first match", () => {
  const filler = "x".repeat(80);
  const stderr = `${filler} a fatal error occurred and more context follows after the match`;
  const snippet = captureStderrSnippet(stderr);
  assert.ok(snippet.length > 0 && snippet.length <= 200);
  assert.match(snippet, /fatal/);
  // The window starts 50 chars before the match, not at the string start.
  assert.ok(!snippet.startsWith("x".repeat(80)));
});

test("captureStderrSnippet returns empty string when no keyword matches", () => {
  assert.equal(captureStderrSnippet("all clear, nothing to see"), "");
});

test("captureStderrSnippet does not go out of bounds when the match is near the start", () => {
  const snippet = captureStderrSnippet("error at the very beginning of the stream");
  assert.match(snippet, /error/);
});

test("/api/run stderr detector does not match authorized as auth", () => {
  assert.match(source, /const STDERR_ERROR_RE =/);
  assert.doesNotMatch(source, /\|auth\|/);
  assert.doesNotMatch("Authorized to work in the US", STDERR_ERROR_RE);
});
