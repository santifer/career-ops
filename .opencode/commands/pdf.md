---
description: Generate ATS-optimized CV tailored to a job description
agent: general
---

# CV PDF Generator

Generate a tailored, ATS-friendly CV for a specific job.

Arguments: $ARGUMENTS

**What to do:**

1. Load `modes/_shared.md` and `modes/pdf.md` (Spanish - translate as you execute)

2. Run the PDF generation workflow:
   
   **Step 1: Gather inputs**
   - Read `cv.md` (source of truth for candidate's experience)
   - Get the JD (from arguments, or ask user for it)
   
   **Step 2: Extract and analyze**
   - Extract 15-20 keywords from the JD
   - Detect JD language (default English)
   - Detect company location → paper format:
     - US/Canada → `letter` (8.5x11)
     - Rest of world → `a4` (210x297mm)
   - Detect role archetype (matches candidate's target roles)
   
   **Step 3: Customize content**
   - Rewrite Professional Summary to naturally include top keywords
   - Add exit narrative bridge: "Built and sold a business. Now applying systems thinking to [JD domain]."
   - Select top 3-4 projects most relevant to this job
   - Reorder experience bullets by relevance to JD
   - Build competency grid with 6-8 keyword phrases from JD
   
   **Step 4: Generate HTML**
   - Use template from `templates/cv-template.html`
   - Replace placeholders with customized content
   - Inject keywords naturally into existing achievements
   - **Critical rule:** NEVER fabricate skills. Only reword real experience using JD vocabulary.
   
   **Step 5: Convert to PDF**
   - Write HTML to `/tmp/cv-candidate-{company}.html`
   - Run: `node generate-pdf.mjs /tmp/cv-candidate-{company}.html output/cv-candidate-{company}-{YYYY-MM-DD}.pdf --format={letter|a4}`
   - Report to user: PDF path, page count, keyword coverage percentage

**ATS Optimization Rules:**

- **Layout:** Single column (no sidebars or parallel columns)
- **Headers:** Standard section names: "Professional Summary", "Work Experience", "Education", "Skills", "Certifications", "Projects"
- **No images:** Don't put text in images/SVGs (ATS can't read them)
- **No header/footer info:** ATS ignores PDF headers/footers
- **Selectable text:** UTF-8, not rasterized
- **No nested tables**
- **Keyword placement:** Summary (top 5), first bullet of each role, Skills section

**Design specs:**
- **Fonts:** Space Grotesk (headings, 600-700) + DM Sans (body, 400-500)
- **Header:** Name in large Space Grotesk + gradient line (cyan to purple) + contact row
- **Section headers:** Space Grotesk 13px, uppercase, cyan color
- **Body:** DM Sans 11px, line-height 1.5
- **Company names:** Purple accent color
- **Margins:** 0.6in
- **Background:** Pure white

**Section order (optimized for 6-second recruiter scan):**
1. Header (name, contact, portfolio link)
2. Professional Summary (3-4 lines, keyword-dense)
3. Core Competencies (6-8 keyword phrases in grid)
4. Work Experience (reverse chronological)
5. Projects (top 3-4 most relevant)
6. Education & Certifications
7. Skills (languages + technical)

**Ethical keyword injection:**
- JD says "RAG pipelines" and CV says "LLM workflows with retrieval" → Reword to "RAG pipeline design and LLM orchestration workflows"
- JD says "MLOps" and CV says "observability, evals, error handling" → Reword to "MLOps and observability: evals, error handling, cost monitoring"
- JD says "stakeholder management" and CV says "collaborated with team" → Reword to "stakeholder management across engineering, operations, and business"

**Never add skills the candidate doesn't have. Only reformulate real experience with JD vocabulary.**

**Post-generation:**
- If this is part of a tracked offer, update applications.md: change PDF from ❌ to ✅
