---
description: AI job search command center fallback command for the OpenCode career-ops agent
---

# /career-ops Command (OpenCode)

Use this command as a thin OpenCode wrapper over the runtime core.

This command is **optional fallback UX**. In OpenCode, the preferred experience is the specialized `career-ops` agent with natural-language routing.

## Required runtime files

- `runtime/modes.yml`
- `runtime/context-loading.yml`
- `runtime/operating-rules.md`

## Command behavior

1. Resolve raw JDs, offer URLs, and explicit `/career-ops` subcommands through `runtime/modes.yml`.
2. Load mode context exactly as declared in `runtime/context-loading.yml`.
3. Execute shared business logic from `modes/*` and `CLAUDE.md`.
4. Preserve Playwright-only verification and the manual-submit boundary from `runtime/operating-rules.md`.

OpenCode-specific UX may improve discovery and manual guidance, but it remains additive-only.

When both surfaces exist:
- Prefer `.opencode/agents/career-ops.md` for natural conversational use.
- Keep this command for explicit invocation, scripted precision, or recovery when the user wants to force a mode.
