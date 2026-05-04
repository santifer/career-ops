# Career-Ops for GitHub Copilot CLI

Read `CLAUDE.md` for all project instructions, routing, and behavioral rules. They apply equally to Copilot CLI.

Key points:
- Reuse the existing modes, scripts, templates, and tracker flow — do not create parallel logic.
- Store user-specific customization in `config/profile.yml`, `modes/_profile.md`, or `article-digest.md` — never in `modes/_shared.md`.
- Never submit an application on the user's behalf.

## Copilot-specific tool mapping

When mode files reference Claude Code tools, use the Copilot CLI equivalents:

| Claude Code | Copilot CLI | Notes |
|-------------|-------------|-------|
| `WebSearch` | `web_search` | Comp research, company data |
| `WebFetch` | `web_fetch` | Static page JD extraction |
| Playwright (`browser_navigate` + `browser_snapshot`) | `chrome-devtools-navigate_page` + `chrome-devtools-take_snapshot` | Career pages, SPAs, offer verification |
| `Read` / `Write` / `Edit` | `view` / `create` / `edit` | File operations |
| `Bash` | `bash` | Run Node scripts |
| `claude -p` (pipe workers) | `task` tool with `agent_type: general-purpose`, `mode: background` | Parallel evaluation, scanning |

> **Note:** The left column lists Claude Code CLI commands; the right column lists Copilot CLI agent tool names (invoked via the agent's tool calls, not as shell commands). `chrome-devtools-*` tools require the `chrome-devtools-mcp` MCP server; `task` is the built-in subagent tool.

**Browser is a shared resource — never run 2+ browser agents in parallel.**

For Copilot CLI setup, see `docs/COPILOT_CLI.md`.
