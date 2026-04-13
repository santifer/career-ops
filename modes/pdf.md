# Mode: pdf — ATS-optimized PDF generation

## Full pipeline

1. Read `cv.md` as source of truth
2. Ask the user for the JD if it is not in context (text or URL)
3. Extract 15–20 keywords from the JD
4. Detect JD language → CV language (EN default)
5. Detect company location → paper format:
   - US/Canada → `letter`
   - Resto del mundo → `a4`
6. Detecta arquetipo del rol → adapta framing
7. Reescribe Professional Summary inyectando keywords del JD + exit narrative bridge ("Built and sold a business. Now applying systems thinking to [domain del JD].")
8. Selecciona top 3-4 proyectos más relevantes para la oferta
9. Reordena bullets de experiencia por relevancia al JD
10. Construye competency grid desde requisitos del JD (6-8 keyword phrases)
11. Inyecta keywords naturalmente en logros existentes (NUNCA inventa)
12. Genera HTML completo desde template + contenido personalizado
13. Lee `name` de `config/profile.yml` → normaliza a kebab-case lowercase (e.g. "John Doe" → "john-doe") → `{candidate}`
14. Escribe HTML a `/tmp/cv-{candidate}-{company}.html`
15. Ejecuta: `node generate-pdf.mjs /tmp/cv-{candidate}-{company}.html output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf --format={letter|a4}`
15. Reporta: ruta del PDF, nº páginas, % cobertura de keywords

## ATS rules (clean parsing)

- Single-column layout (no sidebars, no parallel columns)
- Standard headers: “Professional Summary”, “Work Experience”, “Education”, “Skills”, “Certifications”, “Projects”
- No text in images/SVGs
- No critical info only in PDF headers/footers (ATS often ignores them)
- UTF-8, selectable text (not rasterized)
- No nested tables
- Spread JD keywords: Summary (top 5), first bullet per role, Skills section

## PDF design

- **Fonts:** Space Grotesk (headings, 600–700) + DM Sans (body, 400–500)
- **Self-hosted fonts:** `fonts/`
- **Header:** name in Space Grotesk 24px bold + gradient line `linear-gradient(to right, hsl(187,74%,32%), hsl(270,70%,45%))` 2px + contact row
- **Section headers:** Space Grotesk 13px, uppercase, letter-spacing 0.05em, cyan primary
- **Body:** DM Sans 11px, line-height 1.5
- **Company names:** accent purple `hsl(270,70%,45%)`
- **Margins:** 0.6in
- **Background:** pure white

## Section order (“6-second recruiter scan”)

1. Header (large name, gradient, contact, portfolio link)
2. Professional Summary (3–4 lines, keyword-dense)
3. Core Competencies (6–8 keyword phrases in flex-grid)
4. Work Experience (reverse chronological)
5. Projects (top 3–4 by relevance)
6. Education & Certifications
7. Skills (languages + technical)

## Keyword injection (ethical, truth-based)

Legitimate reframing examples:
- JD says “RAG pipelines” and CV says “LLM workflows with retrieval” → use “RAG pipeline design and LLM orchestration workflows”
- JD says “MLOps” and CV says “observability, evals, error handling” → use “MLOps and observability: evals, error handling, cost monitoring”
- JD says “stakeholder management” and CV says “collaborated with team” → use “stakeholder management across engineering, operations, and business”

**Never add skills the candidate does not have. Only rephrase real experience with the JD’s vocabulary.**

## HTML template

Use the template in `cv-template.html`. Replace `{{...}}` placeholders with tailored content:

| Placeholder | Content |
|-------------|---------|
| `{{LANG}}` | `en` or `es` |
| `{{PAGE_WIDTH}}` | `8.5in` (letter) or `210mm` (A4) |
| `{{NAME}}` | (from profile.yml) |
| `{{EMAIL}}` | (from profile.yml) |
| `{{LINKEDIN_URL}}` | (from profile.yml) |
| `{{LINKEDIN_DISPLAY}}` | (from profile.yml) |
| `{{PORTFOLIO_URL}}` | (from profile.yml) (or `/es` by language) |
| `{{PORTFOLIO_DISPLAY}}` | (from profile.yml) (or `/es` by language) |
| `{{LOCATION}}` | (from profile.yml) |
| `{{SECTION_SUMMARY}}` | Professional Summary / Resumen Profesional |
| `{{SUMMARY_TEXT}}` | Tailored summary with keywords |
| `{{SECTION_COMPETENCIES}}` | Core Competencies / Competencias Core |
| `{{COMPETENCIES}}` | `<span class="competency-tag">keyword</span>` × 6–8 |
| `{{SECTION_EXPERIENCE}}` | Work Experience / Experiencia Laboral |
| `{{EXPERIENCE}}` | HTML per job with reordered bullets |
| `{{SECTION_PROJECTS}}` | Projects / Proyectos |
| `{{PROJECTS}}` | HTML for top 3–4 projects |
| `{{SECTION_EDUCATION}}` | Education / Formación |
| `{{EDUCATION}}` | HTML for education |
| `{{SECTION_CERTIFICATIONS}}` | Certifications / Certificaciones |
| `{{CERTIFICATIONS}}` | HTML for certifications |
| `{{SECTION_SKILLS}}` | Skills / Competencias |
| `{{SKILLS}}` | HTML for skills |

## Canva CV generation (optional)

If `config/profile.yml` has `canva_resume_design_id` set, offer a choice before generating:
- **“HTML/PDF (fast, ATS-optimized)”** — flow above
- **“Canva CV (visual, design-preserving)”** — flow below

If there is no `canva_resume_design_id`, skip this prompt and use the HTML/PDF flow.

### Canva workflow

#### Step 1 — Duplicate the base design

a. `export-design` the base design (using `canva_resume_design_id`) as PDF → get download URL  
b. `import-design-from-url` using that download URL → creates a new editable design (the duplicate)  
c. Note the new `design_id` for the duplicate  

#### Step 2 — Read the design structure

a. `get-design-content` on the new design → returns all text elements (richtexts) with their content  
b. Map text elements to CV sections by content matching:
   - Candidate name → header
   - “Summary” or “Professional Summary” → summary
   - Company names from cv.md → experience
   - Degree/school names → education
   - Skill keywords → skills  
c. If mapping fails, show what was found and ask the user for guidance  

#### Step 3 — Generate tailored content

Same content generation as the HTML flow (steps 1–11 above):
- Rewrite Professional Summary with JD keywords + exit narrative
- Reorder experience bullets by JD relevance
- Select top competencies from JD requirements
- Inject keywords naturally (NEVER invent)

**IMPORTANT — character budget:** Each replacement text MUST be roughly the same length as the original (within ±15% character count). If tailored content is longer, condense it. Canva boxes are fixed-size; longer text overlaps neighbors. Count characters from Step 2 originals and enforce the budget.

#### Step 4 — Apply edits

a. `start-editing-transaction` on the duplicate design  
b. `perform-editing-operations` with `find_and_replace_text` per section:
   - Summary → tailored summary
   - Experience bullets → reordered/rewritten bullets
   - Competency/skills → JD-matched terms
   - Project descriptions → top relevant projects  
c. **Reflow layout after text replacement:**  
   After replacements, text boxes resize but neighbors stay put, which can unevenly space experience blocks. Fix:
   1. Read updated positions/dimensions from the `perform-editing-operations` response
   2. For each work block (top to bottom), compute bullet box end: `end_y = top + height`
   3. Next section header should start at `end_y + consistent_gap` (template gap, typically ~30px)
   4. Use `position_element` to move the next section’s date, company, title, and bullets for even spacing
   5. Repeat for all experience sections  
d. **Verify layout before commit:**
   - `get-design-thumbnail` with `transaction_id` and `page_index=1`
   - Check thumbnail for overlap, uneven spacing, cut-off or tiny text
   - Fix with `position_element`, `resize_element`, or `format_text` until clean  
e. Show final preview and ask for approval  
f. `commit-editing-transaction` only after user approval  

#### Step 5 — Export and download PDF

a. `export-design` the duplicate as PDF (a4 or letter from JD location)  
b. **Immediately** download with Bash:
   ```bash
   curl -sL -o "output/cv-{candidate}-{company}-canva-{YYYY-MM-DD}.pdf" "{download_url}"
   ```
   Export URLs are pre-signed and expire in ~2 hours — download right away.  
c. Verify:
   ```bash
   file output/cv-{candidate}-{company}-canva-{YYYY-MM-DD}.pdf
   ```
   Must show “PDF document”. If XML/HTML, URL expired — re-export and retry.  
d. Report: PDF path, file size, Canva design URL (for manual tweaks)  

#### Error handling

- If `import-design-from-url` fails → fall back to HTML/PDF with a clear message  
- If text elements cannot be mapped → warn, show findings, ask for manual mapping  
- If `find_and_replace_text` finds no matches → try broader substring matching  
- Always give the Canva design URL so the user can edit manually if automation fails  

## After generation

If the offer is already in the tracker, update the row: set PDF from ❌ to ✅.
