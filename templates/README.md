# Templates

System-layer template files used by career-ops scripts and modes. These files are auto-updated when you run `npm run update` -- put user customizations in the user-layer files instead (see DATA_CONTRACT.md).

## Files

| File                         | Used By                                                              | Purpose                                                                  |
| ---------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `cv-template.html`           | `generate-pdf.mjs`, legacy `/career-ops pdf` flow                    | Refined ATS-safe CV PDF template                                         |
| `resume-template.html`       | `generate-resume.mjs`                                                | Refined ATS-safe resume PDF template                                     |
| `resume-template.md`         | `generate-resume.mjs`                                                | Portal-ready plain Markdown resume template                              |
| `cover-letter-template.html` | `generate-resume.mjs`                                                | Matching single-column cover-letter PDF template                         |
| `cover-letter-template.md`   | `generate-resume.mjs`                                                | Portal-ready plain Markdown cover-letter template                        |
| `cv-template.tex`            | `generate-latex.mjs`                                                 | LaTeX/Overleaf template for ATS-optimized CV PDFs                        |
| `portals.example.yml`        | Onboarding                                                           | Example portal scanner configuration (copy to `portals.yml` to activate) |
| `states.yml`                 | `verify-pipeline.mjs`, `normalize-statuses.mjs`, `merge-tracker.mjs` | Canonical application states and their aliases                           |

### cv-template.html

The HTML template rendered by Playwright into PDF. Uses placeholder tokens (`{{NAME}}`, `{{SUMMARY_TEXT}}`, `{{EXPERIENCE}}`, etc.) that the PDF pipeline fills at generation time.

**Design:** Refined ATS-safe single-column layout from the verified gstack
design-review artifacts under
`~/.gstack/projects/santifer-career-ops/designs/resume-builder-20260528/`.
Use `variant-a-refined-resume.html` as the resume anchor, with
`variant-a-ats.html`, `design-board.html`, and `document-family-board.html` as
context artifacts.

The production style uses a white paper background, navy ink,
muted blue-grey rules, a Georgia display name, and self-hosted DM Sans body
text. Headings use conservative letter spacing so `pdftotext` and ATS parsers
extract complete words.

**Customization:** Edit this file to change colors, spacing, or section order. The placeholder tokens are documented in `batch/batch-prompt.md` under "Template placeholders."

### resume-template.html / cover-letter-template.html

The resume-builder templates share the same refined visual language as
`cv-template.html`. They are driven by JSON specs and rendered through
`generate-resume.mjs`, which writes HTML, Markdown, and PDF into
`output/{company-slug}-{role-slug}/`.

`generate-resume.mjs` also copies the required DM Sans files into
`output/{company-slug}-{role-slug}/fonts/` so the generated HTML previews load
cleanly in a browser as well as through the PDF renderer.

Use canonical resume headings for parser safety: `Professional Summary`,
`Skills`, `Work Experience`, `Education`, and `Certifications` when the spec
contains certifications.

The matching cover letter follows
`resume-builder-20260528/variant-a-cover-letter.html`: serif candidate header,
large serif role heading, small uppercase subject label, linear body copy,
optional `proof` block, signature, and footer. Keep the cover letter
single-column and avoid decorative sidebars because these files are intended
for portal uploads as well as human review.

### cv-template.tex

LaTeX template for Overleaf-compatible CV generation. Based on the [sb2nov/resume](https://github.com/sb2nov/resume) format. Uses placeholder tokens (`{{NAME}}`, `{{EXPERIENCE}}`, `{{PROJECTS}}`, etc.) that the LaTeX pipeline fills at generation time.

**Design:** Single-column ATS-safe layout using standard CTAN packages (`fontawesome5`, `enumitem`, `hyperref`, `titlesec`). No custom fonts or external dependencies — uploads directly to Overleaf.

**Usage:**
```bash
# Validate and compile .tex → .pdf (requires pdflatex on PATH)
node generate-latex.mjs output/cv-name-company-date.tex

# Or specify a custom output path
node generate-latex.mjs output/cv-name-company-date.tex output/custom-name.pdf
```

**Prerequisites:** `pdflatex` via [MiKTeX](https://miktex.org/) (Windows) or TeX Live (Linux/macOS). First compilation may auto-install missing LaTeX packages. Alternatively, upload the `.tex` file directly to [Overleaf](https://www.overleaf.com) — no local install needed.

**Customization:** Edit this file to change margins, section order, or formatting commands. The placeholder tokens are documented in `modes/latex.md` under "Template Placeholders."

### portals.example.yml

Pre-configured portal scanner with 45+ tracked companies and search queries. Contains title filters, company career page URLs, Greenhouse API endpoints, and WebSearch queries.

**To activate:** Copy to project root as `portals.yml` and customize `title_filter.positive` keywords for your target roles. Add or remove companies as needed.

### states.yml

Defines the 8 canonical application states (`Evaluated`, `Applied`, `Responded`, `Interview`, `Offer`, `Rejected`, `Discarded`, `SKIP`) with aliases for common variants. All pipeline scripts validate statuses against this file.

**Do not rename states** -- the dashboard and all scripts depend on these exact IDs. You can add aliases if you encounter new variants that should map to an existing state.
