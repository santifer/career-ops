# Mode: latex-tex — Tailor an existing LaTeX CV (preserve your template)

Use when the candidate has `cv.tex`, `resume.tex`, or another LaTeX CV in their own format — **not** the career-ops `templates/cv-template.tex` flow (`modes/latex.md` + `cv.md`).

## CV source priority

1. `resume.tex` or `cv.tex` in project root (if both exist, prefer `resume.tex`)
2. `cv.md` (fallback — use `modes/pdf.md` or `modes/latex.md`)

## Pipeline

1. **Parse** — `node parse-latex.mjs <cv.tex> output/`
   - Produces `cv-parse-{name}-{timestamp}.json` (content) and `cv-template-*.json` (metadata).
2. **Tailor (AI)** — Same ethical rules as `modes/pdf.md`:
   - Read JD → extract 15–20 keywords
   - Reorder experience/project bullets by JD relevance
   - Inject keywords into **existing** bullets only — **NEVER invent skills**
   - Optionally reorder skill **values** within categories (do not add categories the candidate lacks)
   - Write tailored JSON to `output/cv-tailored-{company}-{YYYY-MM-DD}.json`
3. **Write** — `node write-latex.mjs <original.tex> output/cv-tailored-{company}-{date}.json output/cv-{company}-{date}.tex`
   - Replaces bullet text and skill values only; preserves layout, colors, `tabularx`, `lrbox`, spacing.
4. **Compile** — `node compile-latex.mjs output/cv-{company}-{date}.tex output/cv-{company}-{date}.pdf`
5. **Report** — `.tex` path, `.pdf` path, sizes, keyword coverage %, sections touched.

**One-shot (parse + write + compile, round-trip JSON for testing):**

```bash
node latex-pipeline.mjs resume.tex --company acme --json output/cv-tailored-acme-2026-05-21.json
```

Without `--json`, the pipeline parses the source and writes back the same content (smoke test).

## Supported formats

| Format | Detection | Write support |
|--------|-----------|---------------|
| tabularx + itemize | `tabularx` + `itemize` sections | ✅ |
| resumeSubheading | `\resumeSubheading` / `\resumeItem` | ✅ |
| section + itemize | generic | partial (itemize bullets) |

## Tailoring JSON schema

Use the structure from `parse-latex.mjs` output:

```json
{
  "meta": { "format_detected": "tabularx-itemize" },
  "contact": { "email": "", "phone": "", "linkedin": "", "github": "" },
  "experience": [{ "company": "", "role": "", "start": "", "end": "", "bullets": ["..."] }],
  "projects": [{ "name": "", "tech": "", "date": "", "bullets": ["..."] }],
  "skills": { "Category Name": ["skill1", "skill2"] },
  "education": [{ "degree": "", "institution": "", "date": "", "details": "" }]
}
```

Only fields with bullets/skills you changed need updating; writer merges by section order and category keys.

## LaTeX escaping

Bullet strings in JSON should be plain text. `write-latex.mjs` escapes `&`, `%`, `_`, `#`, etc., and preserves existing escapes like `\&`.

## Requires

- `tectonic` (preferred: `brew install tectonic`) or `pdflatex` on PATH for PDF output.

## vs `modes/latex.md`

| | latex-tex | latex |
|---|-----------|-------|
| Input | User's `.tex` | `cv.md` |
| Template | Original file | `templates/cv-template.tex` |
| Output layout | Unchanged | career-ops resume class |

## Auto-pipeline integration

When JD is pasted and `resume.tex` / `cv.tex` exists:

1. Run evaluation blocks (oferta) as usual
2. For PDF step, use **this mode** instead of HTML `generate-pdf.mjs`
3. Record PDF path in tracker TSV as for `pdf` mode
