# Archive Report

**Change**: cli-agnostic-agent-support
**Archived to**: `openspec/changes/archive/2026-04-07-cli-agnostic-agent-support/`
**Artifact Store Mode**: hybrid

## Archive Outcome

The delta specs were synced into `openspec/specs/*` as the new source of truth, and the archived change bundle was materialized under the dated archive path for auditability. The final verified UX state is recorded: OpenCode's specialized `career-ops` agent is the preferred interface, while explicit `/career-ops` commands remain fallback/escape-hatch UX only.

OpenCode was also manually tested in this environment, and that manual validation is consistent with the adapter wording now captured in `AGENTS.md`, `.opencode/commands/career-ops.md`, and `.opencode/agents/career-ops.md`.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `agent-runtime-core` | Created | 2 requirements copied from persisted delta because no main spec existed |
| `cli-adapters` | Created | 2 requirements copied and normalized to reflect preferred OpenCode agent UX + explicit command fallback |
| `runtime-compatibility-docs` | Created | 2 requirements copied and updated so support docs mention preferred OpenCode agent UX |

## Archive Contents

- `proposal.md` ✅
- `specs/agent-runtime-core/spec.md` ✅
- `specs/cli-adapters/spec.md` ✅
- `specs/runtime-compatibility-docs/spec.md` ✅
- `design.md` ✅
- `tasks.md` ✅ (16/16 complete)
- `verify-report.md` ✅
- `state.yaml` ✅

## Source of Truth Updated

The following specs now reflect the archived behavior:

- `openspec/specs/agent-runtime-core/spec.md`
- `openspec/specs/cli-adapters/spec.md`
- `openspec/specs/runtime-compatibility-docs/spec.md`

## Traceability

Engram observations used as archive inputs:

- Proposal: `#344` (`sdd/cli-agnostic-agent-support/proposal`)
- Spec: `#348` (`sdd/cli-agnostic-agent-support/spec`)
- Design: `#352` (`sdd/cli-agnostic-agent-support/design`)
- Tasks: `#355` (`sdd/cli-agnostic-agent-support/tasks`)
- Verify report: `#363` (`sdd/cli-agnostic-agent-support/verify-report`)
- State before archive: `#345` (`sdd/cli-agnostic-agent-support/state`)

## Verification of Archive

- [x] Main specs updated under `openspec/specs/*`
- [x] Archived change folder exists at `openspec/changes/archive/2026-04-07-cli-agnostic-agent-support/`
- [x] Archive contains proposal, specs, design, tasks, verify report, and state
- [x] No active `openspec/changes/cli-agnostic-agent-support/` directory remains

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived.
Ready for the next change.
