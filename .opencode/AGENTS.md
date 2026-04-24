# OpenCode Context

`.opencode/` contains OpenCode command wrappers for Career Ops.

These commands should stay behaviorally aligned with Codex `/career-ops` modes and the local `.agents/skills/career-ops/SKILL.md` router.

When adding or renaming a Career Ops mode, update:

- `.agents/skills/career-ops/SKILL.md`
- `.opencode/commands/`
- root `AGENTS.md`
- `README.md` or `USAGE.md` when user-facing command docs change

Command wrappers should not become independent sources of scoring or tracker rules.
