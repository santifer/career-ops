# Career-Ops for Codex

Read `CLAUDE.md` for all project instructions, routing, and behavioral rules. They apply equally to Codex.

Key points:
- Reuse the existing modes, scripts, templates, and tracker flow — do not create parallel logic.
- Store user-specific customization in `config/profile.yml`, `modes/_profile.md`, or `article-digest.md` — never in `modes/_shared.md`.
- Never submit an application on the user's behalf.

For Codex-specific setup, see `docs/CODEX.md`.

## Codex Commands

Individual command agents are available under `.agents/`:

| File | Equivalent | Description |
|------|------------|-------------|
| `.agents/career-ops.md` | main router | Show menu or auto-pipeline a JD/URL |
| `.agents/career-ops-evaluate.md` | `oferta` | Evaluate job offer (A-F scoring) |
| `.agents/career-ops-compare.md` | `ofertas` | Compare and rank multiple offers |
| `.agents/career-ops-scan.md` | `scan` | Scan portals for new offers |
| `.agents/career-ops-pdf.md` | `pdf` | Generate ATS-optimized CV PDF |
| `.agents/career-ops-pipeline.md` | `pipeline` | Process pending URLs from inbox |
| `.agents/career-ops-apply.md` | `apply` | Live application assistant |
| `.agents/career-ops-tracker.md` | `tracker` | Application status overview |
| `.agents/career-ops-contact.md` | `contacto` | LinkedIn outreach |
| `.agents/career-ops-deep.md` | `deep` | Deep company research |
| `.agents/career-ops-batch.md` | `batch` | Batch processing with parallel workers |
| `.agents/career-ops-training.md` | `training` | Evaluate course/cert |
| `.agents/career-ops-project.md` | `project` | Evaluate portfolio project idea |
| `.agents/career-ops-patterns.md` | `patterns` | Analyze rejection patterns |
| `.agents/career-ops-followup.md` | `followup` | Follow-up cadence tracker |
