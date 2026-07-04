// Standalone test for cleanChips() using Node's built-in test runner.
// The web package has no test runner (no vitest/jest), so we use `node:test`.
// cleanChips() is re-implemented inline from src/lib/explore.ts since .ts
// can't be imported directly without a compiler/runner. The source is pure
// JS with no external deps, so this mirror stays in sync by inspection.
//
// Run:  node --test test-clean-chips.mjs
//
// NOTE: When editing cleanChips in explore.ts, keep this copy in sync.

import { test } from "node:test";
import assert from "node:assert/strict";

const CHIP_CAP = 16;

/** Trim, drop empties, de-dupe case-insensitively, cap length. */
function cleanChips(v) {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : [v];
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    if (typeof item !== "string") continue;
    const k = item.trim();
    if (!k) continue;
    if (!/[\p{L}\p{N}]/u.test(k)) continue; // drop punctuation-only junk
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
    if (out.length >= CHIP_CAP) break;
  }
  return out;
}

/** Split a raw input string the same way filter-builder's commit() does —
 *  on unambiguous item separators only (never bare spaces). */
function split(text) {
  return text.split(/[,\n;\t\r]+/);
}

test("comma-separated → 3 chips", () => {
  const parts = split("Afghanistan, Albania, Algeria");
  assert.deepEqual(cleanChips(parts), ["Afghanistan", "Albania", "Algeria"]);
});

test("space-separated → 1 chip (NOT split — by design)", () => {
  const parts = split("Afghanistan Algeria Algeria");
  assert.deepEqual(cleanChips(parts), ["Afghanistan Algeria Algeria"]);
});

test("newline-separated → 3 chips", () => {
  const parts = split("Afghanistan\nAlbania\nAlgeria");
  assert.deepEqual(cleanChips(parts), ["Afghanistan", "Albania", "Algeria"]);
});

test("semicolon-separated → 3 chips", () => {
  const parts = split("Afghanistan; Albania; Algeria");
  assert.deepEqual(cleanChips(parts), ["Afghanistan", "Albania", "Algeria"]);
});

test("tab-separated → 3 chips", () => {
  const parts = split("Afghanistan\tAlbania\tAlgeria");
  assert.deepEqual(cleanChips(parts), ["Afghanistan", "Albania", "Algeria"]);
});

test("carriage-return-separated → 3 chips", () => {
  const parts = split("Afghanistan\rAlbania\rAlgeria");
  assert.deepEqual(cleanChips(parts), ["Afghanistan", "Albania", "Algeria"]);
});

test("mixed delimiters → 3 chips", () => {
  const parts = split("Afghanistan, Albania\nAlgeria; Algeria");
  // "Algeria" and "Algeria" collide on last — wait, that's a typo in the
  // spec example. The real expectation is 3 unique: Afghanistan, Albania,
  // Algeria. The trailing "Algeria" is a duplicate of "Algeria" earlier in
  // the string. But actually the string is "Afghanistan, Albania\nAlgeria;
  // Algeria" — "Algeria" appears once. Re-reading: the spec says 3 chips.
  assert.deepEqual(cleanChips(parts), ["Afghanistan", "Albania", "Algeria"]);
});

test("stray tokens dropped: '*' → 0 chips", () => {
  assert.deepEqual(cleanChips(["*"]), []);
});

test("stray tokens dropped: '***' → 0 chips", () => {
  assert.deepEqual(cleanChips(["***"]), []);
});

test("stray tokens dropped: '---' → 0 chips", () => {
  assert.deepEqual(cleanChips(["---"]), []);
});

test("mixed with stray: 'Afghanistan, *, Albania, ***, Algeria' → 3 chips", () => {
  const parts = split("Afghanistan, *, Albania, ***, Algeria");
  assert.deepEqual(cleanChips(parts), ["Afghanistan", "Albania", "Algeria"]);
});

test("empty/whitespace entries dropped: 'Afghanistan, , , Albania' → 2 chips", () => {
  const parts = split("Afghanistan, , , Albania");
  assert.deepEqual(cleanChips(parts), ["Afghanistan", "Albania"]);
});

test("deduplication (case-insensitive): 'Afghanistan, Afghanistan, ALBANIA, albania' → 2 chips", () => {
  const parts = split("Afghanistan, Afghanistan, ALBANIA, albania");
  assert.deepEqual(cleanChips(parts), ["Afghanistan", "ALBANIA"]);
});

test("multi-word entries preserved: 'Costa Rica, South Africa, United States' → 3 chips", () => {
  const parts = split("Costa Rica, South Africa, United States");
  assert.deepEqual(cleanChips(parts), ["Costa Rica", "South Africa", "United States"]);
});

test("cap at 16: 20 comma-separated countries → 16 chips", () => {
  const countries = Array.from({ length: 20 }, (_, i) => `Country${i + 1}`);
  const parts = split(countries.join(","));
  assert.equal(cleanChips(parts).length, 16);
});

test("'12345' → 1 chip (has digits)", () => {
  assert.deepEqual(cleanChips(["12345"]), ["12345"]);
});

test("'@' → 0 chips (no letters or digits)", () => {
  assert.deepEqual(cleanChips(["@"]), []);
});

test("null/undefined input → []", () => {
  assert.deepEqual(cleanChips(null), []);
  assert.deepEqual(cleanChips(undefined), []);
});

test("non-array string input wraps to single chip", () => {
  assert.deepEqual(cleanChips("Afghanistan"), ["Afghanistan"]);
});