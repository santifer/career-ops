# Design: CLI-Agnostic Agent Support

## Technical Approach

Introduce a neutral runtime core under `runtime/` and make every CLI surface an adapter over that core. The core owns routing (`runtime/modes.yml`), context loading (`runtime/context-loading.yml`), operating rules (`runtime/operating-rules.md`), and adapter compatibility metadata (`runtime/adapters/*.yml`). Existing business logic stays in `modes/*` and `CLAUDE.md`; adapters only translate each CLI’s invocation style into the canonical runtime contract.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Canonical source | `runtime/*` becomes the runtime contract | Keep `.claude/skills/...` as canonical | Stops adapter drift and lets docs/tests validate one source |
| Adapter shape | Thin per-CLI wrappers + adapter manifest | Forked instructions per vendor | Reuses business logic and keeps premium UX isolated |
| OpenCode position | First-class adapter with additive UX only | Make OpenCode special in core | Preserves neutrality while allowing better interactive affordances |
| Future CLIs | Contract includes declared capability matrix and extensions | Wait until implementations exist | Makes Codex/Gemini/Copilot compatibility explicit without fake parity |
| Batch scope | Leave worker abstraction deferred | Generalize `claude -p` now | Current PR stays focused on interactive/manual parity and lower regression risk |

## Data Flow

```text
User input
  -> adapter entrypoint (.claude / AGENTS.md / future CLI docs)
  -> runtime/modes.yml classifies command or raw JD
  -> runtime/context-loading.yml resolves files to load
  -> modes/* + CLAUDE.md execute business rules
  -> adapter applies CLI-specific UX only

Compatibility checks
  -> runtime/adapters/*.yml
  -> test-all.mjs / docs / updater path lists
```

OpenCode premium path is additive: richer command ergonomics or manual flow hints are allowed only if resolved mode, required context, and safeguards remain identical to the core. In the verified final UX, the specialized OpenCode `career-ops` agent is the preferred interface and the explicit `/career-ops` command is fallback UX only.

## File Changes

| File | Action | Description |
|---|---|---|
| `runtime/modes.yml` | Create | Canonical input→mode routing table |
| `runtime/context-loading.yml` | Create | Canonical mode→context rules and delegation notes |
| `runtime/operating-rules.md` | Create | Shared safeguards, manual-only rules, deferred boundaries |
| `runtime/adapters/claude.yml` | Create | Claude capabilities, entrypoints, supported extensions |
| `runtime/adapters/opencode.yml` | Create | OpenCode capabilities and additive UX declarations |
| `runtime/adapters/codex.yml` | Create | Planned adapter manifest marked partial/documented-only |
| `runtime/adapters/gemini-cli.yml` | Create | Planned adapter manifest marked partial/documented-only |
| `runtime/adapters/copilot-cli.yml` | Create | Planned adapter manifest marked partial/documented-only |
| `.claude/skills/career-ops/SKILL.md` | Modify | Reduce to Claude-specific invocation wrapper over `runtime/*` |
| `AGENTS.md` | Create | Repo-level adapter entry for OpenCode and generic agent consumers |
| `.opencode/commands/career-ops.md` | Create | Thin OpenCode command wrapper |
| `.opencode/agents/career-ops.md` | Create | Preferred OpenCode premium agent surface for natural-language use |
| `README.md`, `docs/ARCHITECTURE.md`, `docs/SETUP.md` | Modify | Document neutral core, adapters, support matrix, deferred worker parity |
| `DATA_CONTRACT.md` | Modify | Mark `runtime/*`, `AGENTS.md`, `.opencode/*` as system layer |
| `update-system.mjs` | Modify | Add runtime and adapter paths to `SYSTEM_PATHS` |
| `test-all.mjs` | Modify | Validate canonical runtime files and adapter references |
| `batch/batch-runner.sh` | Deferred | No abstraction in this PR; document future worker contract |

## Interfaces / Contracts

```yaml
adapter:
  id: opencode
  entrypoints: ["AGENTS.md", ".opencode/commands/career-ops.md", ".opencode/agents/career-ops.md"]
  supports:
    interactive: true
    manual_flows: true
    batch_workers: false
  extensions:
    - id: opencode-premium-manual-ux
      additive_only: true
      must_preserve: [routing, context_loading, safeguards]
```

```yaml
mode_resolution:
  source: runtime/modes.yml
context_resolution:
  source: runtime/context-loading.yml
policy:
  source: runtime/operating-rules.md
```

Rule: adapters may declare `extensions`, but they cannot override routing, loaded files, ethical rules, Playwright requirements, or the final manual-submit boundary.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Runtime manifests are complete and consistent | Node assertions in `test-all.mjs` or extracted helper |
| Integration | Claude/OpenCode wrappers reference canonical runtime files | String/path validation against adapter entrypoints |
| Docs | Support matrix and deferred batch scope stay explicit | Doc presence checks for adapter/core terminology |
| Regression | Future adapter manifests don’t claim unsupported parity | Validate `supports` vs required fields |

## Migration / Rollout

Phase 1: add `runtime/*`, then refactor Claude adapter to consume it without behavior changes. Phase 2: add `AGENTS.md` and `.opencode/commands/career-ops.md` as first-class consumers. Phase 3: add `.opencode/agents/career-ops.md` as the preferred OpenCode premium surface, then update docs, updater, and tests. Codex/Gemini CLI/Copilot CLI land as documented manifests plus placeholder entrypoint conventions, so contributors know how to extend the contract before shipping real adapters. No user-data migration required.

## Open Questions

- [ ] Should future adapter manifests live in YAML only, or also generate wrapper docs from a template to reduce drift further?
- [ ] When batch abstraction starts, do we standardize a `runtime/workers.yml` contract or a script-level `WORKER_CLI` interface?
