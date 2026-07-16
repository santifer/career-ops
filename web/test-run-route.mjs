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

test("/api/run stderr detector does not match authorized as auth", () => {
  assert.match(source, /const STDERR_ERROR_RE =/);
  assert.doesNotMatch(source, /\|auth\|/);
  assert.doesNotMatch("Authorized to work in the US", /\b(?:error|denied|fatal|not found|unauthorized|forbidden|login|credential|api[ -]?key|quota|rate limit|not authenticated|auth(?:entication|orization)?)\b/i);
});
