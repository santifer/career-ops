---
name: korean-resume-builder
description: Generate Korean-language resumes (이력서) in multi-page A4 format for South Korean job applications. Use when the user applies to Korean-language job postings, Korean companies, Korean job portals (Jumpit, etc.), or explicitly asks for help with Korean resume format. Stop and redirect to resume-builder/resume-tailor if the user wants: one-page ATS CV, English-language application, or tailoring for a specific non-Korean role.
---

# Korean Resume Builder

## Overview

Generate Korean-market resumes in this repo without inventing a separate pipeline. Reuse `resumes/`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, `output/`, and `generate-pdf.mjs`, but switch to the bundled Jumpit-style multi-page layout when the user explicitly wants a Korean-style resume instead of the default one-page ATS CV.

## Decide The Path

- If the user wants a one-page global or ATS resume, stop and use `modes/pdf.md`.
- If the user wants a Korean-market resume, Korean copy, or a multi-page A4 PDF in the Jumpit style, continue with this skill.
- If visual fidelity matters, refer to `templates/jumpit-resume-template.pdf` or render it to PNG before changing layout or styling.

## Read Only What You Need

- Read `references/jumpit-layout.md` for section order, tables, and the senior/junior split.
- Read `references/career-ops-integration.md` for repo data sources, output paths, renderer quirks, and verification commands.
- Use `assets/jumpit-korean-resume-template.html` as the starting layout instead of building HTML from scratch.

## Workflow

1. Gather source facts from `resumes/`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, and any JD or company notes in the thread.
2. Choose the closest layout variant.
   - Experienced: header, About Me, skill table, and career summary table on page 1; detailed project pages after that.
   - Junior or entry: header, About Me, and two-tier skill tables on page 1; assignment/project experience pages after that.
3. Translate and compress the source material into Korean resume sections.
   - Write concise sentence fragments, not US-style narrative paragraphs.
   - Keep claims factual; do not invent numbers, titles, or shipped features.
   - Prefer bilingual section labels only where the reference uses them.
4. Fill the HTML asset.
   - Keep each physical page inside its own `.page` container.
   - Delete unused template branches instead of leaving empty tables.
   - Replace list and table placeholders with real HTML. The asset expects rendered `<li>`, `<tr>`, and project blocks.
5. Save the working HTML somewhere explicit, then generate the PDF with `node generate-pdf.mjs ... --format=a4`.
6. Review the PDF visually.
   - Use `pdfinfo` for page count.
   - Use `pdftoppm -png` when spacing or table alignment is uncertain.
   - Iterate until tables, page breaks, and Korean text rendering are clean.

## Content Rules

- Use A4.
- Default to 2-4 pages, not 1.
- Use Korean date style `YYYY. MM ~ YYYY. MM`.
- Show only city and district in the address unless the user asks for more.
- Omit resident registration number, full street address, marital status, military details, salary history, and photo unless the user explicitly requests them.
- Make skill tables honest.
  - Experienced resumes use one main skill table.
  - Junior resumes can split into "used in implementation" vs "theoretical knowledge" when that distinction helps.
- Project sections should emphasize role, stack, contribution, outcome, and links or reference material.

## Layout Rules

- Match the clean, table-driven layout from `templates/jumpit-resume-template.pdf` and the bundled HTML template.
- Use black text, light gray table headers, thin borders, generous row padding, and Korean system font stacks.
- Keep section headers bold with a simple underline or block treatment.
- Avoid sidebars, icon grids, gradients, and western two-column resume layouts.
- Preserve readable whitespace. Do not cram content by shrinking below roughly 10pt body text.

## Output And Verification

- Prefer `output/{company-slug}/{position-slug}/` when the resume is for a specific job.
- If there is no active company/role target, use a descriptive folder under `output/` and say which path you chose.
- Keep the editable HTML next to the PDF when the user is likely to revise the document.
- Before finishing, confirm:
  - page count is expected,
  - Korean glyphs render correctly,
  - no empty placeholder rows remain,
  - links are clickable,
  - page breaks do not split a project table mid-row.

## Notes

- `modes/pdf.md` enforces a one-page ATS CV. Do not apply that rule set here unless the user explicitly asks for a one-page Korean resume.
- If this skill reveals a repeatable production pattern, promote the working HTML into a repo-level template instead of reauthoring it again later.
