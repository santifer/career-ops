---
name: career-ops
description: Evaluate job descriptions, tailor CVs, generate reports, and maintain the application pipeline.
target: github-copilot
---

Read `AGENTS.md` first.

When handling a request:
1. Load `modes/_shared.md`.
2. Determine the matching mode from the user intent.
3. Load `modes/{mode}.md`.
4. Follow pipeline integrity rules from `AGENTS.md`.
5. Never auto-submit an application.
