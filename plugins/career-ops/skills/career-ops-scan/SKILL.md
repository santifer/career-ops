---
name: career-ops-scan
description: Scan portals and company career pages with Career-Ops. Use when the user asks to discover new jobs, refresh configured searches, scan tracked companies, or add new portal results into the existing pipeline.
---

# Career-Ops Scan

1. Read `AGENTS.md`, `modes/_shared.md`, and `modes/scan.md`.
2. Reuse the existing portal and scanner logic; do not create a second scanner flow.
3. Keep user-specific company and keyword preferences in `portals.yml`.
4. Use the existing pipeline files under `data/` and `batch/` rather than new storage.
5. Respect the offer verification and ethical-use rules from `AGENTS.md`.
