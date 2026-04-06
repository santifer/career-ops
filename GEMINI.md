# Gemini CLI adapter for Career-Ops

`AGENTS.md` is the canonical instruction file for this repository. Apply it first.

Gemini-specific notes:
- Use `GEMINI.md` as the project context wrapper and `AGENTS.md` as the operational source of truth.
- The portable skill entrypoint lives at `.agents/skills/career-ops/SKILL.md`.
- For headless automation, prefer `gemini -p` with the relevant `modes/` prompt content.
- If browser automation is unavailable in the active runtime, follow `AGENTS.md` and mark JD verification as unconfirmed rather than guessing.
