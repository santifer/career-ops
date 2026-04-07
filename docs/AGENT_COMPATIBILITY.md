# Agent Compatibility

Career-Ops now has a universal core and thin runtime adapters.

## Source of Truth

- `AGENTS.md` is the canonical agent guide.
- `CLAUDE.md` is a compatibility layer for Claude Code.
- `.claude/skills/career-ops/SKILL.md` keeps the existing slash-command router for Claude/OpenCode.

Only special integration features remain in runtime-specific directories:

- `.claude/` for Claude/OpenCode skill routing
- `.opencode/` for OpenCode command shortcuts

The product behavior, data contract, and mode logic live outside those folders.

## Runtime Strategy

### Claude Code / OpenCode

Supported directly:

- slash-command routing remains available,
- the built-in batch worker providers `claude` and `codex` are verified,
- the same `modes/*` files are reused.

### Codex, Gemini CLI, and Other Runtimes

Supported through the universal core:

- load `AGENTS.md`,
- follow the same `modes/*`,
- use the same user/system data contract,
- use the built-in `codex` batch path when available,
- otherwise plug batch mode in through an adapter script.

## Batch Adapter Contract

Out of the box, the runner ships with verified `claude` and `codex` providers. To avoid inventing unsupported flags for other tools, all other runtimes use an explicit adapter.

Runner inputs:

```text
adapter <resolved-system-prompt-file> <user-prompt>
```

Environment provided by the runner:

- `CAREER_OPS_PROJECT_DIR`
- `CAREER_OPS_BATCH_DIR`
- `CAREER_OPS_AGENT`
- `CAREER_OPS_BATCH_ID`
- `CAREER_OPS_REPORT_NUM`
- `CAREER_OPS_TARGET_URL`

Expected behavior:

- read the resolved system prompt file and the user prompt,
- invoke the target runtime,
- stream final worker output to stdout,
- exit `0` on success, non-zero on failure.

See `batch/agent-adapter.example.sh` for the skeleton.
