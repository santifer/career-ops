# Mode: latex-tex — Tailor a user-owned LaTeX CV in place

Opt-in mode for candidates who already maintain a hand-tuned `.tex` CV. **Does not change the global source of truth** — `cv.md` remains the default for evaluations, apply mode, and auto-pipeline. Invoke explicitly via `/career-ops latex-tex`.

## When to use

- User has `resume.tex` (or `config/profile.yml → latex.source`) in a supported layout
- User wants JD-tailored bullets/skills while keeping their preamble, macros, colors, and spacing

## Supported layouts (v1)

| Family | Detection | Editable prose |
|--------|-----------|----------------|
| `resumeSubheading` | `\resumeSubheading` + `\resumeItem` | `\resumeItem{...}` bullets; `\textbf{Category}{: items}` skill values |
| `tabularx-itemize` | `tabularx` + `itemize`, no resume macros | `\item` body text in the document body |
| `luxsleekCV` | `\newcommand{\headleft}` + `\newcommand{\headright}` + `\newcommand{\smaller}` (LuxSleek-CV template, Kostyrka/U. Luxembourg) | `{\justifying\noindent ... \par}` prose paragraphs (e.g. Profile Summary); `\item` body text; `\smaller{...}` bullets |

Any other layout → stop with the script error and suggest `/career-ops latex` (cv.md → career-ops template).

## Source file resolution

1. `config/profile.yml → latex.source` if set
2. Else `resume.tex` in project root
3. Else `cv.tex` in project root

If none exist, stop and ask the user to add their `.tex` file or set `latex.source`.

```yaml
# config/profile.yml (optional, user layer)
latex:
  source: resume.tex
```

## Pipeline

1. Resolve source `.tex` path (see above)
2. Run: `node extract-latex-content.mjs <source.tex> --out /tmp/cv-slots-{company}.json`
3. If `supported: false` → show `error` + `hint`; do not proceed
4. Read JD (from context, report, or ask user)
5. Tailor **only** the `slots[].text` values for JD fit (same ethics as `modes/latex.md` / `pdf`):
   - Extract 15–20 JD keywords
   - Reorder bullets by relevance (reorder patch list order if needed; patch ids stay stable)
   - Inject keywords into existing achievements — **NEVER invent skills**
   - If `cv.md` exists, cross-check claims against it; omit anything not backed by in-scope sources
   - **Graphics-safety length budget:** the source template already renders correctly, so every patched `text` must stay within **±5 characters** of its slot's original length (`slots[].text.length`, counted before LaTeX escaping). This is the cheapest reliable proxy against overflowing a fixed-width column or shifting a page break — tighten or pad the wording to fit rather than freely rewriting length. `patch-latex-content.mjs` enforces this as a hard gate (see step 7); do not pre-emptively reach for `--allow-length-drift` — treat a gate failure as a signal to shorten/lengthen the text, not to bypass the check.
6. Write patches file:

```json
{
  "slots": [ "... copy from extract manifest ..." ],
  "patches": [
    { "id": "bullet-0", "text": "Tailored plain-text bullet (no LaTeX escaping — the script escapes)" }
  ]
}
```

7. Run: `node patch-latex-content.mjs <source.tex> /tmp/cv-patches-{company}.json output/cv-{candidate}-{company}-{YYYY-MM-DD}.tex` — exits non-zero and lists the offending slot ids if any patch is outside the ±5-character budget; fix the wording and retry rather than passing `--allow-length-drift`, unless the user explicitly confirms the drift is safe for that specific slot
8. Run: `node generate-latex.mjs output/cv-{candidate}-{company}-{YYYY-MM-DD}.tex output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf --compile-only`
9. Report: family, slot count, patched count, `.tex` path, `.pdf` path (or compile error)

**Requires:** `tectonic` or `pdflatex` on PATH (same as `latex` mode).

## Ethical rules (mandatory)

Same as `modes/latex.md` and `modes/pdf.md`:

- Keywords get **reformulated, never fabricated**
- Never add tools, skills, or metrics the candidate does not already have in the source `.tex` or `cv.md`
- **Never write LaTeX markup (`\textit{...}`, `\&`, etc.) inside a patch's `text` value.** `patch-latex-content.mjs` always LaTeX-escapes patch text — a literal `\textit{Key Contribution:}` in your patch renders as visible backslashes and braces, not italics (confirmed by hitting this exact bug during testing). If a slot's original text has markup you want to keep, **leave that slot unpatched** rather than retyping the markup into the patch; only patch slots where the replacement is pure prose.
- Do **not** rewrite preamble, macro definitions, section titles, dates, company names, or job titles unless the user explicitly asks
- Every patch stays within **±5 characters** of its slot's original length — enforced by `patch-latex-content.mjs`, not just a style preference

## What this mode does NOT do

- Does not replace `cv.md` as the system source of truth
- Does not parse arbitrary LaTeX templates
- Does not auto-run during auto-pipeline or evaluation
- Does not submit applications

## Relationship to `latex` mode

| Mode | Input | Output |
|------|-------|--------|
| `latex` | `cv.md` | career-ops `templates/cv-template.tex` → `.tex` + PDF |
| `latex-tex` | user's `resume.tex` | same template shape, tailored prose only → `.tex` + PDF |
