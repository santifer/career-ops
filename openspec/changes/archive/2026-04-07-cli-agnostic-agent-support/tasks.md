# Tasks: CLI-Agnostic Agent Support

## Phase 1: Runtime Core

- [x] 1.1 Create `runtime/modes.yml` as the sole input→mode map for raw JDs/URLs and every `/career-ops` subcommand.
- [x] 1.2 Create `runtime/context-loading.yml` with canonical file-loading rules for `auto-pipeline`, command modes, and `tracker`/`deep`/`training`/`project` exceptions.
- [x] 1.3 Create `runtime/operating-rules.md` for shared safeguards: Playwright-only verification, manual submit boundary, system/user layer ownership, and explicit worker/batch deferral.
- [x] 1.4 Create `runtime/adapters/{claude,opencode,codex,gemini-cli,copilot-cli}.yml` with one manifest schema, capability flags, entrypoints, and additive-only extension rules.

## Phase 2: Claude Adapter Refactor

- [x] 2.1 Refactor `.claude/skills/career-ops/SKILL.md` into a thin Claude wrapper that points to `runtime/*` for routing, context loading, and operating policy.
- [x] 2.2 Remove duplicated runtime mapping from Claude-facing instructions while preserving `modes/*` and `CLAUDE.md` as business-logic sources.
- [x] 2.3 Add adapter validation logic in `test-all.mjs` (or a small helper it imports) to fail if Claude stops referencing the canonical runtime files.

## Phase 3: OpenCode Premium Adapter

- [x] 3.1 Create `AGENTS.md` as the OpenCode-first repo adapter entry, documenting premium/manual UX as additive over the same core contract.
- [x] 3.2 Create `.opencode/commands/career-ops.md` plus a specialized `.opencode/agents/career-ops.md` entrypoint so OpenCode has an explicit `career-ops` agent surface.
- [x] 3.3 Bind `runtime/adapters/opencode.yml` to those entrypoints and declare which enhancements are allowed without changing routing, loaded files, or safeguards.

## Phase 4: Future Adapter Contracts and Docs

- [x] 4.1 Use `runtime/adapters/{codex,gemini-cli,copilot-cli}.yml` to document placeholder conventions, unsupported areas, and the exact rules for adding a future real adapter.
- [x] 4.2 Update `README.md`, `docs/ARCHITECTURE.md`, and `docs/SETUP.md` with the runtime core, support matrix, OpenCode premium status, and explicit “interactive now, workers later” scope.
- [x] 4.3 Update `DATA_CONTRACT.md` and `update-system.mjs` so `runtime/*`, `AGENTS.md`, and `.opencode/*` are treated as system-layer/updatable assets.

## Phase 5: Verification and Release Safety

- [x] 5.1 Extend `test-all.mjs` to assert canonical runtime files exist, every adapter manifest is complete, and documented-only adapters cannot claim batch parity.
- [x] 5.2 Add doc/reference checks that OpenCode and Claude wrappers both point at `runtime/*` and that deferred worker abstraction is stated consistently.
- [x] 5.3 Leave `batch/batch-runner.sh` unchanged in this PR; capture the deferred worker abstraction contract as follow-up notes in docs/runtime policy.
