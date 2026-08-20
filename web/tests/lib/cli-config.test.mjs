// Tests for the CLI selection reader/writer using Node's built-in test runner.
// Imports directly from cli-config.mjs (the single source of truth) so the test
// and production code can never drift out of sync.
//
// Run:  node --test tests/lib/cli-config.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG_KEY, readConfig, readCliId, saveCliId, pickDefaultCli, resolveCliId } from "../../src/lib/cli-config.mjs";

// A stand-in for window.localStorage: same surface, no DOM.
function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

// A /api/clis response with Claude Code present and the rest not installed.
function clisResponse(clis) {
  return { ok: true, json: async () => ({ clis }) };
}

const INSTALLED_CLAUDE = [
  { id: "claude", name: "Claude Code", installed: true, path: "/opt/homebrew/bin/claude" },
  { id: "codex", name: "Codex", installed: false, path: null },
];

test("readConfig: absent, corrupt and non-object payloads all read as empty", () => {
  assert.deepEqual(readConfig(makeStorage()), {});
  assert.deepEqual(readConfig(makeStorage({ [CONFIG_KEY]: "{not json" })), {});
  assert.deepEqual(readConfig(makeStorage({ [CONFIG_KEY]: '"a string"' })), {});
  assert.deepEqual(readConfig(null), {});
});

test("readCliId: returns the saved id, and null for empty or missing", () => {
  assert.equal(readCliId(makeStorage({ [CONFIG_KEY]: '{"cliId":"claude"}' })), "claude");
  assert.equal(readCliId(makeStorage({ [CONFIG_KEY]: '{"cliId":""}' })), null);
  assert.equal(readCliId(makeStorage({ [CONFIG_KEY]: "{}" })), null);
  assert.equal(readCliId(makeStorage()), null);
});

test("saveCliId: preserves the other stored preferences", () => {
  // Given a config that already carries appearance + provider prefs
  const storage = makeStorage({ [CONFIG_KEY]: '{"provider":"openai","logos":false}' });

  // When the engine choice is written
  assert.equal(saveCliId("claude", storage), true);

  // Then the engine lands without dropping what was already there
  assert.deepEqual(readConfig(storage), { provider: "openai", logos: false, mode: "cli", cliId: "claude" });
});

test("saveCliId: reports failure instead of throwing when storage is unavailable", () => {
  assert.equal(saveCliId("claude", null), false);
  const full = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
  assert.equal(saveCliId("claude", full), false);
});

test("pickDefaultCli: first installed wins, uninstalled and junk are skipped", () => {
  assert.equal(pickDefaultCli(INSTALLED_CLAUDE), "claude");
  assert.equal(pickDefaultCli([{ id: "claude", installed: false }, { id: "codex", installed: true }]), "codex");
  assert.equal(pickDefaultCli([{ id: "claude", installed: false }]), null);
  assert.equal(pickDefaultCli([null, { installed: true }, { id: "opencode", installed: true }]), "opencode");
  assert.equal(pickDefaultCli(null), null);
  assert.equal(pickDefaultCli([]), null);
});

test("resolveCliId: uses the saved choice without asking the server", async () => {
  // Given a user who already picked a CLI
  const storage = makeStorage({ [CONFIG_KEY]: '{"cliId":"opencode"}' });
  let calls = 0;
  const fetchImpl = async () => { calls++; return clisResponse(INSTALLED_CLAUDE); };

  // When a run resolves the engine
  const id = await resolveCliId({ storage, fetchImpl });

  // Then their choice stands and detection never runs
  assert.equal(id, "opencode");
  assert.equal(calls, 0);
});

test("resolveCliId: falls back to the detected CLI and persists it", async () => {
  // Given nothing saved but Claude Code installed on the machine
  const storage = makeStorage();
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    assert.equal(url, "/api/clis");
    return clisResponse(INSTALLED_CLAUDE);
  };

  // When a run resolves the engine
  const id = await resolveCliId({ storage, fetchImpl });

  // Then it uses what is installed and writes it through, so the next read is
  // synchronous and every other surface agrees a CLI is configured
  assert.equal(id, "claude");
  assert.equal(readCliId(storage), "claude");

  // And a second resolve is served from storage
  assert.equal(await resolveCliId({ storage, fetchImpl }), "claude");
  assert.equal(calls, 1);
});

test("resolveCliId: returns null when no CLI is installed, and persists nothing", async () => {
  const storage = makeStorage();
  const fetchImpl = async () => clisResponse([{ id: "claude", installed: false }]);

  assert.equal(await resolveCliId({ storage, fetchImpl }), null);
  assert.equal(storage.getItem(CONFIG_KEY), null);
});

test("resolveCliId: a failing or unreachable /api/clis resolves null, never throws", async () => {
  const storage = makeStorage();
  assert.equal(await resolveCliId({ storage, fetchImpl: async () => { throw new Error("offline"); } }), null);
  assert.equal(await resolveCliId({ storage, fetchImpl: async () => ({ ok: false, json: async () => ({}) }) }), null);
  assert.equal(await resolveCliId({ storage, fetchImpl: async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }) }), null);
});

test("resolveCliId: no storage and no fetch resolves null rather than crashing the launch", async () => {
  assert.equal(await resolveCliId({ storage: null, fetchImpl: null }), null);
});
