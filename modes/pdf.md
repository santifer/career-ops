# Mode: pdf — ATS-Optimized Resume PDF

## Full Pipeline

1. Read `cv.md` as the source of truth
2. Get the JD if it is not already in context
3. Extract 15-20 JD keywords
4. Choose paper format:
   - US or Canada -> `letter`
   - everywhere else -> `a4`
5. Detect the role archetype and adapt framing
6. Rewrite the Professional Summary using truthful JD language
7. Select the top 3-4 most relevant projects
8. Reorder experience bullets by JD relevance
9. Build a competency grid with 6-8 keyword phrases
10. Inject keywords naturally into real experience only
11. Render HTML from the resume template
12. Write HTML to `/tmp/cv-candidate-{company}.html`
13. Run `generate-pdf.mjs`
14. Report the PDF path, page count, and keyword coverage

## ATS Rules

- single-column layout only
- standard headings only
- no critical text in images or SVGs
- no critical information in PDF headers or footers
- selectable UTF-8 text only
- no nested tables

## Design

- Space Grotesk for headings
- DM Sans for body text
- white background
- 0.6in margins
- keep the existing template style

## Ethical Keyword Injection

- rewrite real experience using the JD's vocabulary
- never add skills the candidate does not have
- keep all generated copy in English only unless the user explicitly asks otherwise

## Template Placeholders

Use the placeholders in `templates/cv-template.html` and populate them with truthful candidate data.

## After Generation

If the role already exists in the tracker, update the PDF column from `❌` to `✅`.
