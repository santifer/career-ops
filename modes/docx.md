# Mode: docx — ATS-Optimized DOCX Generation

## Full pipeline

1. Read `cv.md` as the source of truth
2. Ask the user for the JD if it is not in context (text or URL)
3. Extract 15-20 keywords from the JD
4. Detect JD language → CV language (EN default)
5. Detect role archetype → adapt framing
6. Rewrite Professional Summary by injecting JD keywords + exit narrative bridge ("Built and sold a business. Now applying systems thinking to [JD domain].")
7. Select top 3-4 most relevant projects for the job
8. Reorder experience bullets by JD relevance
9. Build competency grid from JD requirements (6-8 keyword phrases)
10. Inject keywords naturally into existing achievements (NEVER invent)
11. Generate full HTML from template + personalized content
12. Read `name` from `config/profile.yml` → normalize to kebab-case lowercase (e.g. "John Doe" → "john-doe") → `{candidate}`
13. Write HTML to `/tmp/cv-{candidate}-{company}.html`
14. Execute: `node generate-docx.mjs /tmp/cv-{candidate}-{company}.html output/cv-{candidate}-{company}-{YYYY-MM-DD}.docx`
15. Report: DOCX path, keyword coverage %

## ATS Rules (clean parsing)

- Single-column layout (no sidebars, no parallel columns)
- Standard headers: "Professional Summary", "Work Experience", "Education", "Skills", "Certifications", "Projects"
- No text in images/shapes
- No nested tables
- Calibri font for universal compatibility across Word, LibreOffice, Pages, Google Docs, and ATS parsers
- Margins set to 0.35" (504 twips) on all sides
- Colored accents matching the PDF theme: Primary Cyan `#156B7A` for section headings, Secondary Purple `#6F22C5` for company/institution names
- Consistent paragraph spacing, bulleted lists for jobs/projects/achievements, and tables for certifications/skills

## Keyword injection strategy (ethical, truth-based)

Examples of legitimate reformulation:
- JD says "RAG pipelines" and CV says "LLM workflows with retrieval" → change to "RAG pipeline design and LLM orchestration workflows"
- JD says "MLOps" and CV says "observability, evals, error handling" → change to "MLOps and observability: evals, error handling, cost monitoring"
- JD says "stakeholder management" and CV says "collaborated with team" → change to "stakeholder management across engineering, operations, and business"

**NEVER add skills that the candidate does not have. Only reword real experience using the exact JD vocabulary.**

## Post-generation

Update tracker if the job is already registered.
