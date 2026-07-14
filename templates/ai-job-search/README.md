# ai-job-search LaTeX Template Pack

Optional templates imported from `ai-job-search` for users who want a more
LaTeX-native application-material workflow.

Contents:

- `moderncv/moderncv-template.tex` -- moderncv-style CV starter.
- `cover/cover.cls` -- cover-letter class.
- `cover/OpenFonts/` -- font assets used by the cover-letter class.

These files are templates only. They are not a source of candidate facts.
Generated content must still read only from the career-ops source-of-truth
files listed in `AGENTS.md`.

The default career-ops path remains HTML-to-PDF via:

```bash
node generate-pdf.mjs
node generate-cover-letter.mjs --payload payload.json
```
