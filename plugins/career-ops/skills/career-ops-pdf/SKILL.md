---
name: career-ops-pdf
description: Generate ATS-ready PDFs with Career-Ops. Use when the user wants a tailored CV PDF, asks to regenerate a resume for a role, or needs the existing HTML-to-PDF flow without re-running the whole pipeline.
---

# Career-Ops PDF

1. Read `AGENTS.md`, `modes/_shared.md`, and `modes/pdf.md`.
2. Reuse `generate-pdf.mjs`, `templates/cv-template.html`, and the existing font assets.
3. Treat `cv.md` as the canonical CV source of truth.
4. Keep generated PDFs in `output/` and do not alter the tracker flow unless the user also asked for evaluation or merging.
