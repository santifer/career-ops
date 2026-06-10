# Cover Letter Design Review - Matching Single-Column Direction A

**Date:** 2026-05-28  
**Status:** Approved for implementation planning  
**Scope:** ATS-safe, single-column cover letter matching the refined resume visual direction.

## Decision

Approve `variant-a-cover-letter.html` as the visual reference for the matching
single-column cover letter. It preserves the approved resume family's navy
editorial styling while keeping the document suitable for portal upload.

## Artifacts

- Source HTML: `variant-a-cover-letter.html`
- Visual render: `cover-letter-A.png`
- Pipeline PDF: `cover-letter-A-current-pipeline.pdf`
- Approval record: `approved-cover-letter.json`
- Original failure evidence: `cover-letter-A-original-current-pipeline.pdf`

## Verification

Command used:

```bash
node generate-pdf.mjs ~/.gstack/projects/santifer-career-ops/designs/resume-builder-20260528/variant-a-cover-letter.html ~/.gstack/projects/santifer-career-ops/designs/resume-builder-20260528/cover-letter-A-current-pipeline.pdf --format=a4
```

PDF evidence:

- Pages: 1
- Page size: 595.92 x 842.88 pts, A4
- File size: 72,855 bytes
- Visual render: 794 x 1123 PNG

`pdftotext -layout` extracted these required strings exactly:

- `DANIELLE EVANS`
- `Senior Administration Professional`
- `27 May 2026`
- `Hiring Manager`
- `Administration Coordinator`
- `APPLICATION FOR ADVERTISED POSITION`
- `Dear Hiring Manager,`
- `RELEVANT FIT`
- `Kind regards,`
- `COVER LETTER`

Extraction order verified:

1. Name
2. Role
3. Contact
4. Date
5. Recipient
6. Role heading
7. Application subject
8. Greeting
9. Body
10. Fit callout
11. Close
12. Signature
13. Footer

Split-token scan passed. No character-spaced fragments such as `A P P`,
`R E L`, `C O V`, `A DV`, or `I S E D` remained in extracted text.

## Fix Applied

The first current-pipeline render reproduced the same ATS extraction issue found
in the resume review: wide letter spacing caused uppercase labels to extract as
split characters, for example `A P P L I CAT I O N F O R...`.

The source was patched to remove extraction-sensitive tracking:

- `.subject`: `.22em` -> `0`
- `.proof-label`: `.22em` -> `0`
- `footer`: `.16em` -> `0`

The final PDF preserves the visual hierarchy while extracting readable words.

## Design Notes

- The cover letter uses the same serif display name, muted navy palette, thin
  rules, and restrained A4 spacing as the approved refined resume.
- The single-column layout avoids the parser risk of decorative sidebars.
- The fit callout is visually distinct without changing the reading order.
- Fixture copy and placeholder contact details are not approved candidate
  content; they are only there to test layout and extraction.

## Implementation Constraints

- Keep the production cover letter single-column for portal uploads.
- Keep decorative tracking conservative on any text that must extract as words.
- Add a generated-PDF text extraction gate before marking resume or cover-letter
  output as ready.
- Verify both A4 and Letter behavior during implementation.
