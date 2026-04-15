# Mode: pdf — ATS-Optimized PDF Generation

## One-page constraint (MANDATORY)

The generated CV MUST always fit on exactly ONE page. No exceptions. To achieve this:

1. **Summary**: 2-3 lines max. Tight, keyword-dense, no filler.
2. **Experience**: Include only the 2-3 most relevant roles. 2-3 bullets per role max. Each bullet is 1-2 lines.
3. **Projects**: Top 2-3 most relevant only. One-line description each.
4. **Education**: Degree + institution + date. No descriptions unless exceptional (honors, thesis).
5. **Certifications**: List format, no descriptions. Skip if space is tight.
6. **Skills**: Single line per category. Compact.
7. **Competencies**: Inline comma-separated or pipe-separated keywords. No tags, no grid.

If content overflows 1 page, CUT content — never shrink fonts or margins. Priority for cuts (lowest value first): certifications > older/less-relevant jobs > project descriptions > education details.

## Full pipeline

1. Identify the best-matching CV from the `resumes/` folder (e.g. `resumes/ai-engineer-cv.md`). List the files in `resumes/` if the role type is unclear and pick the most relevant one. Read that file as the source of truth.
2. Ask the user for the JD if it is not already in context (text or URL)
3. Extract 15-20 JD keywords
4. Detect the JD language -> CV language (EN default)
5. Detect the company location -> paper format:
   - US/Canada -> `letter`
   - Rest of the world -> `a4`
6. Detect the role archetype -> adapt the framing
7. Rewrite the Professional Summary by injecting JD keywords + the exit narrative bridge ("Built and sold a business. Now applying systems thinking to [JD domain].")
8. Select the top 2-3 projects that are most relevant to the offer
9. Reorder experience bullets by JD relevance, keep only 2-3 bullets per role
10. Build a competency list from the JD requirements (6-8 keyword phrases, inline text)
11. Inject keywords naturally into existing achievements (NEVER invent)
12. **Verify 1-page fit**: estimate total content — if it looks too long, trim further before generating HTML
13. **Generate Markdown and wait for approval** — render the full tailored CV as clean Markdown, create the output directory (`mkdir -p output/{company-slug}/{position-slug}/`), and write it to `output/{company-slug}/{position-slug}/cv-{candidate}-{company-slug}-{YYYY-MM-DD}.md`. Show the full Markdown to the user and **STOP**. Ask:
    > "Here's the tailored CV in Markdown. Does everything look correct? Reply 'yes' (or suggest changes) — I'll generate the PDF only after you approve."
    - If the user requests changes: apply them **to the `.md` file on disk first**, then show the revised content from the file, and ask again. Never carry changes only in memory.
    - **Do NOT proceed to PDF generation until the user explicitly approves.**
14. **Re-read the `.md` file from disk** — after approval, always read `output/{company-slug}/{position-slug}/cv-{candidate}-{company-slug}-{YYYY-MM-DD}.md` fresh from disk. Use this as the source for HTML generation, not in-memory content.
15. Generate the full HTML from the template + tailored content
16. Write the HTML to `/tmp/cv-{candidate}-{company-slug}.html`
17. Run: `node generate-pdf.mjs /tmp/cv-{candidate}-{company-slug}.html output/{company-slug}/{position-slug}/cv-{candidate}-{company-slug}-{YYYY-MM-DD}.pdf --format={letter|a4}`
18. Report the PDF path, Markdown path, page count, and keyword coverage %
19. **If page count > 1**: go back, trim content, update the `.md` file, re-read it from disk, regenerate PDF. Repeat until 1 page.

**Output directory convention:** `output/{company-slug}/{position-slug}/` where slugs are lowercase-hyphenated (e.g., `output/openai/senior-ml-engineer/`). Both the `.md` and `.pdf` files live in this folder.

## ATS rules (clean parsing)

- Single-column layout (no sidebars, no parallel columns)
- Standard headers: "Professional Summary", "Work Experience", "Education", "Skills", "Certifications", "Projects"
- No text embedded in images/SVGs
- No critical information in PDF headers/footers (ATS often ignores them)
- UTF-8, selectable text (not rasterized)
- No nested tables
- JD keywords distributed across Summary (top 5), the first bullet of each role, and the Skills section

## PDF design (consulting style — black & white, traditional, dense)

- **Font**: Times New Roman / Georgia (system serif) — no custom web fonts
- **Header**: name centered 22px bold, contact row centered below with pipe separators
- **Section headers**: 11px, bold, uppercase, black bottom border (1px solid), no color
- **Body**: 10.5px, line-height 1.3
- **Company names**: bold, black (no color accents)
- **Role titles**: italic
- **Competencies**: inline comma/pipe-separated text (no colored tags)
- **Margins**: 0.5in all sides
- **Background**: pure white
- **Colors**: black only. Links: underlined blue (#0000CC)
- **No gradients, no colored accents, no tags/badges**

## Section order ("6-second recruiter scan" optimized)

1. Header (centered name, contact row with pipes)
2. Professional Summary (2-3 lines, keyword-dense)
3. Core Competencies (6-8 keyword phrases, inline text)
4. Work Experience (reverse chronological, 2-3 roles, 2-3 bullets each)
5. Projects (top 2-3 most relevant, one-line descriptions)
6. Education & Certifications
7. Skills (compact, one line per category)

## Keyword injection strategy (ethical, truth-based)

Examples of legitimate rewriting:
- JD says "RAG pipelines" and CV says "LLM workflows with retrieval" -> rewrite to "RAG pipeline design and LLM orchestration workflows"
- JD says "MLOps" and CV says "observability, evals, error handling" -> rewrite to "MLOps and observability: evals, error handling, cost monitoring"
- JD says "stakeholder management" and CV says "collaborated with team" -> rewrite to "stakeholder management across engineering, operations, and business"

**NEVER add skills the candidate does not have. Only rephrase real experience using the exact vocabulary of the JD.**

## HTML template

Use the template at `cv-template.html`. Replace the `{{...}}` placeholders with tailored content:

| Placeholder | Content |
|-------------|---------|
| `{{LANG}}` | `en` or `es` |
| `{{PAGE_WIDTH}}` | `8.5in` (letter) or `210mm` (A4) |
| `{{NAME}}` | (from profile.yml) |
| `{{EMAIL}}` | (from profile.yml) |
| `{{LINKEDIN_URL}}` | [from profile.yml] |
| `{{LINKEDIN_DISPLAY}}` | [from profile.yml] |
| `{{PORTFOLIO_URL}}` | [from profile.yml] (or `/es` depending on language) |
| `{{PORTFOLIO_DISPLAY}}` | [from profile.yml] (or `/es` depending on language) |
| `{{LOCATION}}` | [from profile.yml] |
| `{{SECTION_SUMMARY}}` | Professional Summary / Resumen Profesional |
| `{{SUMMARY_TEXT}}` | Tailored summary with keywords |
| `{{SECTION_COMPETENCIES}}` | Core Competencies / Competencias Core |
| `{{COMPETENCIES}}` | `<span class="competency-tag">keyword</span>` × 6-8 |
| `{{SECTION_EXPERIENCE}}` | Work Experience / Experiencia Laboral |
| `{{EXPERIENCE}}` | HTML for each job with reordered bullets |
| `{{SECTION_PROJECTS}}` | Projects / Proyectos |
| `{{PROJECTS}}` | HTML for the top 3-4 projects |
| `{{SECTION_EDUCATION}}` | Education / Formación |
| `{{EDUCATION}}` | Education HTML |
| `{{SECTION_CERTIFICATIONS}}` | Certifications / Certificaciones |
| `{{CERTIFICATIONS}}` | Certifications HTML |
| `{{SECTION_SKILLS}}` | Skills / Competencias |
| `{{SKILLS}}` | Skills HTML |

## Canva CV Generation (optional)

If `config/profile.yml` has `canva_resume_design_id` set, offer the user a choice before generating:
- **"HTML/PDF (fast, ATS-optimized)"** — existing flow above
- **"Canva CV (visual, design-preserving)"** — new flow below

If the user has no `canva_resume_design_id`, skip this prompt and use the HTML/PDF flow.

### Canva workflow

#### Step 1 — Duplicate the base design

a. `export-design` the base design (using `canva_resume_design_id`) as PDF → get download URL
b. `import-design-from-url` using that download URL → creates a new editable design (the duplicate)
c. Note the new `design_id` for the duplicate

#### Step 2 — Read the design structure

a. `get-design-content` on the new design → returns all text elements (richtexts) with their content
b. Map text elements to CV sections by content matching:
   - Look for the candidate's name → header section
   - Look for "Summary" or "Professional Summary" → summary section
   - Look for company names from the selected `resumes/` CV file → experience sections
   - Look for degree/school names → education section
   - Look for skill keywords → skills section
c. If mapping fails, show the user what was found and ask for guidance

#### Step 3 — Generate tailored content

Same content generation as the HTML flow (Steps 1-11 above):
- Rewrite Professional Summary with JD keywords + exit narrative
- Reorder experience bullets by JD relevance
- Select top competencies from JD requirements
- Inject keywords naturally (NEVER invent)

**IMPORTANT — Character budget rule:** Each replacement text MUST be approximately the same length as the original text it replaces (within ±15% character count). If tailored content is longer, condense it. The Canva design has fixed-size text boxes — longer text causes overlapping with adjacent elements. Count the characters in each original element from Step 2 and enforce this budget when generating replacements.

#### Step 4 — Apply edits

a. `start-editing-transaction` on the duplicate design
b. `perform-editing-operations` with `find_and_replace_text` for each section:
   - Replace summary text with tailored summary
   - Replace each experience bullet with reordered/rewritten bullets
   - Replace competency/skills text with JD-matched terms
   - Replace project descriptions with top relevant projects
c. **Reflow layout after text replacement:**
   After applying all text replacements, the text boxes auto-resize but neighboring elements stay in place. This causes uneven spacing between work experience sections. Fix this:
   1. Read the updated element positions and dimensions from the `perform-editing-operations` response
   2. For each work experience section (top to bottom), calculate where the bullets text box ends: `end_y = top + height`
   3. The next section's header should start at `end_y + consistent_gap` (use the original gap from the template, typically ~30px)
   4. Use `position_element` to move the next section's date, company name, role title, and bullets elements to maintain even spacing
   5. Repeat for all work experience sections
d. **Verify layout before commit:**
   - `get-design-thumbnail` with the transaction_id and page_index=1
   - Visually inspect the thumbnail for: text overlapping, uneven spacing, text cut off, text too small
   - If issues remain, adjust with `position_element`, `resize_element`, or `format_text`
   - Repeat until layout is clean
d. Show the user the final preview and ask for approval
e. `commit-editing-transaction` to save (ONLY after user approval)

#### Step 5 — Export and download PDF

a. `export-design` the duplicate as PDF (format: a4 or letter based on JD location)
b. **IMMEDIATELY** download the PDF using Bash:
   ```bash
   mkdir -p "output/{company-slug}/{position-slug}/"
   curl -sL -o "output/{company-slug}/{position-slug}/cv-{candidate}-{company-slug}-canva-{YYYY-MM-DD}.pdf" "{download_url}"
   ```
   The export URL is a pre-signed S3 link that expires in ~2 hours. Download it right away.
c. Verify the download:
   ```bash
   file "output/{company-slug}/{position-slug}/cv-{candidate}-{company-slug}-canva-{YYYY-MM-DD}.pdf"
   ```
   Must show "PDF document". If it shows XML or HTML, the URL expired — re-export and retry.
d. Report: PDF path, Markdown path, file size, Canva design URL (for manual tweaking)

#### Error handling

- If `import-design-from-url` fails → fall back to HTML/PDF pipeline with message
- If text elements can't be mapped → warn user, show what was found, ask for manual mapping
- If `find_and_replace_text` finds no matches → try broader substring matching
- Always provide the Canva design URL so the user can edit manually if auto-edit fails

## Post-generation

Update the tracker if the offer is already registered: change PDF from ❌ to ✅.
Both output files (`cv-...md` and `cv-...pdf`) will be in `output/{company-slug}/{position-slug}/`.
