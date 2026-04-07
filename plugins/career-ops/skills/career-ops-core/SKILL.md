---
name: career-ops-core
description: Career-Ops discovery, onboarding, and routing for Codex. Use when the user asks what Career-Ops can do, how to use the repo, wants the command menu, needs first-run setup, wants to compare multiple offers, or uses Career-Ops without specifying a concrete mode.
---

# Career-Ops Core

1. Read `AGENTS.md`, `DATA_CONTRACT.md`, and `.claude/skills/career-ops/SKILL.md`.
2. If onboarding files are missing, follow the onboarding flow in `AGENTS.md` before any evaluation or scanning work.
3. If the user wants general help or a command menu, show the same discovery surface as the Claude router.
4. If the user pastes a raw JD or job URL, switch to the evaluate flow.
5. If the user wants to compare multiple offers, read `modes/_shared.md` and `modes/ofertas.md`.
6. Keep all user-specific customization in `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, or `portals.yml`.
