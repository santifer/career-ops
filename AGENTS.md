# Career-Ops — AI Job Search Pipeline

This file provides instructions for all AI coding agents working on this project (Claude Code, OpenCode, Codex, etc.).

## Shared Rules

- Use the existing modes, scripts, templates, and tracker flow. Do not create parallel logic.
- Store user-specific customizations in `config/profile.yml`, `modes/_profile.md`, or `article-digest.md`. Never edit `modes/_shared.md` with user data.
- Never submit an application on the user's behalf.
- Follow the data contract defined in `DATA_CONTRACT.md`.

## Agent-Specific Notes

- **OpenCode**: MCP configuration is in `.opencode/opencode.json`. Use `/career-ops-scan` to scan portals.
- **Claude Code**: Skills are in `.claude/skills/`. Use `claude -p` for batch workers.
- **Codex**: See `docs/CODEX.md` for setup details.