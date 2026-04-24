# Agent Skills Context

`.agents/` contains local skill definitions for agent runtimes.

Keep skills aligned with the same mode files used by Codex and OpenCode. Do not duplicate large copies of business logic when a skill can route to `modes/` instead.

If a command changes in `.agents/skills/career-ops/SKILL.md`, check `.opencode/commands/` and root `AGENTS.md` for matching references.

Skill text should route, load context, and enforce guardrails. Detailed scoring and workflow rules should remain in the mode files where possible.
