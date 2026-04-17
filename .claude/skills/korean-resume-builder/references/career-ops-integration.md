# Career-Ops Integration

## Source Of Truth

- Prefer `resumes/` for raw career history and project details.
- Read `config/profile.yml` for name, contact details, location, and links.
- Read `modes/_profile.md` and `article-digest.md` for user-specific framing and proof points.
- Keep user-specific future tweaks in `config/profile.yml`, `modes/_profile.md`, or `article-digest.md`, not in shared system files.

## Reuse The Existing Repo Flow

- Use the bundled asset as the HTML starting point.
- Reuse `generate-pdf.mjs` for PDF rendering.
- Reuse the repo `output/` folder conventions instead of inventing a second output area.
- Treat `modes/pdf.md` as the default ATS path and this skill as the Korean-format exception.

## Renderer Quirk

- `generate-pdf.mjs` auto-scales using the first `.page` element it finds.
- Keep every resume page wrapped in a `.page` block.
- Do not remove the `.page` class or the renderer may shrink a multi-page document incorrectly.

## Suggested Output Paths

- Job-specific resume: `output/{company-slug}/{position-slug}/`.
- General Korean resume iteration: `output/korean-resume/` or another descriptive folder under `output/`.

## Useful Commands

```bash
# Generate the PDF
node generate-pdf.mjs /tmp/korean-resume.html output/korean-resume/korean-resume.pdf --format=a4

# Check metadata and page count
pdfinfo output/korean-resume/korean-resume.pdf

# Render pages to PNG for visual review
mkdir -p tmp/pdfs
pdftoppm -png output/korean-resume/korean-resume.pdf tmp/pdfs/korean-resume
```

## When To Inspect The Original References

- If spacing, section order, or table density is uncertain, render the PDFs in `examples/resumes/` to PNG first.
- Use the examples as shape references, not as literal text sources.

## Final Review Checklist

- Korean text renders without missing glyphs.
- Table headers and body rows stay aligned.
- Page breaks happen between project blocks, not inside a labeled row.
- Links remain readable and clickable.
- The final document looks like a polished Korean resume, not an annotated guide.
