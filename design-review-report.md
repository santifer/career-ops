# Design Review Report: Refined ATS-Safe Resume

Date: 2026-05-28
Project: career-ops
Artifact: A - Refined ATS-safe resume
Status: Approved for implementation planning

## Scope

This review covers the selected refined resume artifact only:

- `variant-a-refined-resume.html`
- `refined-resume-A.png`
- `refined-resume-A-current-pipeline.pdf`
- `approved-refined-resume.json`

The matching cover letter remains a separate approval item.

## Decision

Use the refined single-column resume as the visual reference for the ATS-safe resume builder output.

The design keeps the calm editorial direction from the reference PDF while preserving the portal-upload requirements:

- Single-column reading order
- Candidate contact details in body text
- No sidebar
- No text embedded in images
- Canonical ATS section headings
- Selectable PDF text

## Verification Evidence

Generated with the current career-ops PDF pipeline:

```bash
node generate-pdf.mjs \
  ~/.gstack/projects/santifer-career-ops/designs/resume-builder-20260528/variant-a-refined-resume.html \
  ~/.gstack/projects/santifer-career-ops/designs/resume-builder-20260528/refined-resume-A-current-pipeline.pdf \
  --format=a4
```

PDF evidence:

- Page count: 1
- Format: A4
- PDF size: 71,867 bytes
- Text extraction: successful with `pdftotext -layout`

Exact extracted headings verified:

- `PROFESSIONAL SUMMARY`
- `SKILLS`
- `WORK EXPERIENCE`
- `EDUCATION`
- `CERTIFICATIONS`

Known extraction issue fixed:

- Wide heading letter-spacing previously caused section names such as `EDUCATION` and `CERTIFICATIONS` to extract as split letters.
- Heading tracking was reduced so headings now extract as normal words.

## Design Notes

Keep these constraints during implementation:

- Use print units or verified equivalent sizing for resume typography.
- Avoid wide letter spacing for text that must survive ATS extraction.
- Keep section headings canonical even if visual styling changes.
- Treat all mockup copy as fixture text, not approved candidate content.
- Generate production content only from user-layer sources such as `cv.md`, `config/profile.yml`, `modes/_profile.md`, and approved proof-point material.

## Open Items

- Approve or revise the matching single-column cover-letter artifact separately.
- Verify short, typical, and long resume content fixtures before shipping.
- Verify both A4 and Letter exports during implementation.
- Add an implementation gate that renders the PDF and asserts text extraction order.
