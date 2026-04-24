# Output Context

`output/` is user layer. It contains generated CV PDFs, generated HTML, screenshots, and other artifacts created for specific applications.

Generated files here may contain personal data. Treat them as private.

Do not delete or regenerate output files unless the user asks or the current workflow explicitly requires a refreshed PDF.

For PDF work, read:

- `generate-pdf.mjs`
- `templates/cv-template.html`
- `cv.md`
- `config/profile.yml`
- `modes/_profile.md`

If you generate a new PDF for an evaluation, make sure the matching report and tracker references are consistent.
