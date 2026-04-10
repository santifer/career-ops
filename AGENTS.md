# Career-Ops for Codex

Read `CLAUDE.md` for all project instructions, routing, and behavioral rules. They apply equally to Codex.

Key points:
- Reuse the existing modes, scripts, templates, and tracker flow — do not create parallel logic.
- Store user-specific customization in `config/profile.yml`, `modes/_profile.md`, or `article-digest.md` — never in `modes/_shared.md`.
- Never submit an application on the user's behalf.
- **CN Adaptation**: For Chinese job boards (BOSS, Liepin, 51job), use `save-cookies.mjs` to capture session cookies and ensure Playwright uses them for JD fetching and scanning. Keep all Chinese portal queries in `portals.yml`.

For Codex-specific setup, see `docs/CODEX.md`.
