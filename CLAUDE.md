# Claude Code adapter for Career-Ops

`AGENTS.md` is the canonical instruction file for this repository. Apply it first.

Claude-specific notes:
- The Claude skill entrypoint lives at `.claude/skills/career-ops/SKILL.md`.
- For headless batch execution, use `CAREER_OPS_AGENT=claude batch/batch-runner.sh`.
- If Claude browser tools are available, prefer them for live JD verification, but still follow the capability order in `AGENTS.md`.
- Keep Claude-specific flags and CLI behavior inside `batch/batch-runner.sh`, not in the shared business logic.
