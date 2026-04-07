# Proposal: CLI-Agnostic Agent Support

## Intent

Career-ops is coupled to Claude in routing, docs, and batch execution. That blocks adoption in other CLIs, makes updates/tooling vendor-specific, and mixes business logic with runtime entrypoints. We need a vendor-neutral core so the repo can run across CLIs while still giving OpenCode a best-in-class adapter where it can do more.

## Scope

### In Scope
- Define a canonical runtime contract: mode routing, context-loading rules, and execution boundaries independent of any single CLI.
- Add thin adapters for Claude and OpenCode that map to the same core contract, with OpenCode treated as a premium first-class adapter.
- Update system docs/tooling so adapters are tracked, tested, and classified as system-layer assets.
- Clarify phased delivery: first PR establishes the agnostic architecture; follow-up work expands parity for batch/background flows.

### Out of Scope
- Perfect feature parity across every CLI on day one.
- Rewriting mode business logic in `modes/*`.
- Replacing Playwright verification or changing user data contracts.

## Capabilities

### New Capabilities
- `agent-runtime-core`: Canonical vendor-neutral contract for command routing, mode loading, and shared operating rules.
- `cli-adapters`: Runtime-specific entrypoints for Claude and OpenCode that consume the core contract without redefining business logic.
- `runtime-compatibility-docs`: Documentation and update/test coverage for supported adapters and declared limitations.

### Modified Capabilities
- None.

## Approach

Extract the repo’s operational contract from Claude-specific surfaces into a canonical core, then keep CLI adapters thin. First PR should cover interactive routing, docs/tooling, and explicit capability matrices. OpenCode is the premium adapter: same neutral core, plus richer UX/integration where its runtime supports it better. Batch worker abstraction stays intentionally phased after the core contract lands.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `.claude/skills/career-ops/SKILL.md` | Modified | Convert to thin Claude adapter over canonical runtime contract |
| `AGENTS.md`, `.opencode/**` | New | OpenCode adapter entrypoints and instructions |
| `CLAUDE.md`, `README.md`, `docs/*` | Modified | Document agnostic architecture, supported adapters, limitations |
| `DATA_CONTRACT.md`, `update-system.mjs`, `test-all.mjs` | Modified | Treat adapter files as first-class system assets |
| `batch/batch-runner.sh` | Deferred | Follow-up runtime abstraction for worker CLI |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Adapter drift | Med | Define one canonical core contract and test adapters against it |
| False parity claims | Med | Publish explicit support matrix and defer batch parity honestly |
| Overfitting to OpenCode | Low | Keep core vendor-neutral; isolate premium UX in adapter layer |

## Rollback Plan

Revert adapter files and doc/tooling changes, leaving Claude entrypoints as the sole supported runtime until a safer abstraction is ready.

## Dependencies

- Existing mode files in `modes/*` remain the business-logic source of truth.
- Validation of adapter conventions in repo tooling/tests.

## Success Criteria

- [ ] Repo defines one vendor-neutral runtime contract separate from CLI-specific entrypoints.
- [ ] Claude and OpenCode both execute the same interactive mode map through thin adapters.
- [ ] Docs/tooling clearly mark first-PR support versus follow-up parity work.
- [ ] OpenCode is supported as a premium adapter without becoming the only architectural target.
