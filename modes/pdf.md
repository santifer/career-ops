# Mode: pdf — ATS-Optimized PDF Generation

## Full pipeline

1. Read `cv.md` as the source of truth
2. Ask the user for the JD if it is not in context (text or URL)
3. Extract 15-20 keywords from the JD
4. Detect JD language → CV language (EN default)
5. Detect company location → paper format:
   - US/Canada → `letter`
   - Rest of the world → `a4`
6. Detect role archetype → adapt framing
7. Build an internal recruiter-side risk map from the JD using `modes/heuristics/recruiter-side.md`: likely doubts, matching evidence, and which document section should address each doubt
8. Rewrite Professional Summary by injecting JD keywords + exit narrative bridge ("Built and sold a business. Now applying systems thinking to [JD domain].")
9. Select top 3-4 most relevant projects for the job
10. Reorder experience bullets by JD relevance and by the risk map: strongest matching evidence first
11. Build competency grid from JD requirements (6-8 keyword phrases)
12. Inject keywords naturally into existing achievements (NEVER invent)
13. Apply the six-second clarity gate from `modes/heuristics/recruiter-side.md`: top third must make target role, strongest fit, and proof obvious
14. Generate full HTML from template + personalized content
15. Read `name` from `config/profile.yml` → normalize to kebab-case lowercase (e.g. "John Doe" → "john-doe") → `{candidate}`
16. Write HTML to `output/cv-{candidate}-{company}.html` (NOT a temp dir — the recorded HTML is what the dashboard's `D` hotkey regenerates from, so it must survive temp cleanup)
17. Execute: `node generate-pdf.mjs output/cv-{candidate}-{company}.html output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf --format={letter|a4} --report={report number}` — `{report number}` is the NNN from the report filename/link (e.g. `008` for `reports/008-acme-….md`), not the tracker `#` column. Pass it whenever the application has (or will have) a report; it records the PDF↔report linkage in `data/pdf-index.tsv` so the dashboard can open and regenerate the exact PDF. Omit it only for one-off CVs with no tracker entry.
18. Report: PDF path, number of pages, keyword coverage %

## ATS Rules (clean parsing)

- Single-column layout (no sidebars, no parallel columns)
- Standard headers: "Professional Summary", "Work Experience", "Education", "Skills", "Certifications", "Projects"
- No text in images/SVGs
- No critical info in PDF headers/footers (ATS ignores them)
- UTF-8, selectable text (not rasterized)
- No nested tables
- Distributed JD keywords: Summary (top 5), first bullet of each role, Skills section
- No hidden text, keyword stuffing, or white-font tricks. Optimize for parseability plus human review.

## Recruiter Review Gates

- The summary should answer: "What role is this person targeting, and why this one?"
- The first screen should show 1-2 proof points that map to the JD's highest-risk requirements.
- Bullets should emphasize outcomes, systems, users, or business effects rather than task history.
- Logistics such as location, work authorization, salary, and availability belong in the CV only when appropriate for the market and profile; otherwise handle them in form answers or recruiter scripts.

## PDF Design

- **Fonts**: Space Grotesk (headings, 600-700) + DM Sans (body, 400-500)
- **Fonts self-hosted**: `fonts/`
- **Header**: name in Space Grotesk 24px bold + gradient line `linear-gradient(to right, hsl(187,74%,32%), hsl(270,70%,45%))` 2px + contact row
- **Section headers**: Space Grotesk 13px, uppercase, letter-spacing 0.05em, color cyan primary
- **Body**: DM Sans 11px, line-height 1.5
- **Company names**: accent purple color `hsl(270,70%,45%)`
- **Margins**: 0.6in
- **Background**: pure white

## Section order (optimized "6-second recruiter scan")

1. Header (large name, gradient, contact, portfolio link)
2. Professional Summary (3-4 lines, keyword-dense)
3. Core Competencies (6-8 keyword phrases in flex-grid)
4. Work Experience (reverse chronological)
5. Projects (top 3-4 most relevant)
6. Education & Certifications
7. Skills (languages + technical)

## Keyword injection strategy (ethical, truth-based)

Examples of legitimate reformulation:
- JD says "RAG pipelines" and CV says "LLM workflows with retrieval" → change to "RAG pipeline design and LLM orchestration workflows"
- JD says "MLOps" and CV says "observability, evals, error handling" → change to "MLOps and observability: evals, error handling, cost monitoring"
- JD says "stakeholder management" and CV says "collaborated with team" → change to "stakeholder management across engineering, operations, and business"

**NEVER add skills that the candidate does not have. Only reword real experience using the exact JD vocabulary.**

## Template HTML

Use the template in `cv-template.html`. Replace the `{{...}}` placeholders with personalized content:

| Placeholder | Content |
|-------------|-----------|
| `{{LANG}}` | CV language code (e.g. `en`, `es`, `ja`, `ar`). Drives language-specific CSS in the template: `ja` enables a CJK font fallback so Japanese renders instead of tofu (□); `ar` enables RTL + Arabic fonts. Use the BCP-47/ISO-639 code that matches the CV language. |
| `{{PAGE_WIDTH}}` | `8.5in` (letter) or `210mm` (A4) |
| `{{PHOTO}}` | Opt-in profile photo (#264). When `profile.yml` has a non-empty `candidate.photo`, replace with `<img class="cv-photo" src="<path-or-data-URL>" alt="{{NAME}}">`; otherwise **remove the whole `{{PHOTO}}` line** so no markup (and no `<img>`) is emitted. Opt-in for DACH/European markets — an absent photo renders identically (pixel-for-pixel) to the photoless layout (US/UK and many-market ATS penalize photos). |
| `{{NAME}}` | (from profile.yml) |
| `{{PHONE}}` | (from profile.yml — include with its separator only when `profile.yml` has a non-empty `phone` value; omit both the `<a href="tel:…">` element and the following `<span class="separator">` otherwise) |
| `{{EMAIL}}` | (from profile.yml) |
| `{{LINKEDIN_URL}}` | [from profile.yml] |
| `{{LINKEDIN_DISPLAY}}` | [from profile.yml] |
| `{{PORTFOLIO_URL}}` | [from profile.yml] (or /es depending on language) |
| `{{PORTFOLIO_DISPLAY}}` | [from profile.yml] (or /es depending on language) |
| `{{LOCATION}}` | [from profile.yml] |
| `{{SECTION_SUMMARY}}` | Professional Summary |
| `{{SUMMARY_TEXT}}` | Personalized summary with keywords |
| `{{SECTION_COMPETENCIES}}` | Core Competencies |
| `{{COMPETENCIES}}` | `<span class="competency-tag">keyword</span>` × 6-8 |
| `{{SECTION_EXPERIENCE}}` | Work Experience |
| `{{EXPERIENCE}}` | HTML for each job with reordered bullets |
| `{{SECTION_PROJECTS}}` | Projects |
| `{{PROJECTS}}` | HTML for top 3-4 projects |
| `{{SECTION_EDUCATION}}` | Education |
| `{{EDUCATION}}` | Education HTML |
| `{{SECTION_CERTIFICATIONS}}` | Certifications |
| `{{CERTIFICATIONS}}` | Certifications HTML |
| `{{SECTION_SKILLS}}` | Skills |
| `{{SKILLS}}` | Skills HTML |

### Profile photo (opt-in, market-specific)

The `{{PHOTO}}` slot is **off by default** and intentionally market-specific:

- **DACH / much of continental Europe** (Germany, Austria, Switzerland): a professional photo is standard and often expected. Opt in by setting `candidate.photo` in `config/profile.yml` (a local file path or a `data:` URL).
- **US / UK / Canada / Australia and many ATS-first markets**: photos are discouraged and can trip bias-avoidance filters. Leave `candidate.photo` empty — the `{{PHOTO}}` line is dropped entirely, no `<img>` is emitted, and the CV renders **pixel-for-pixel identical** to today's photoless layout.

When set, the photo floats into the top corner (mirrored for RTL/Arabic) and the header/summary text wraps beside it; `.cv-photo` in `cv-template.html` controls its size and framing.

## Canva CV Generation (optional)

If `config/profile.yml` has `cv.canva_resume_design_id` set, offer the user a choice before generating:
- **"HTML/PDF (fast, ATS-optimized)"** — existing flow above
- **"Canva CV (visual, design-preserving)"** — new flow below

If the user has no `cv.canva_resume_design_id`, skip this prompt and use the HTML/PDF flow.

### Canva workflow

#### Step 1 — Duplicate the base design

a. `export-design` the base design (using `cv.canva_resume_design_id`) as PDF → get download URL
b. `import-design-from-url` using that download URL → creates a new editable design (the duplicate)
c. Note the new `design_id` for the duplicate

#### Step 2 — Read the design structure

a. `get-design-content` on the new design → returns all text elements (richtexts) with their content
b. Map text elements to CV sections by content matching:
   - Look for the candidate's name → header section
   - Look for "Summary" or "Professional Summary" → summary section
   - Look for company names from cv.md → experience sections
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
e. Show the user the final preview and ask for approval
f. `commit-editing-transaction` to save (ONLY after user approval)

#### Step 5 — Export and download PDF

a. `export-design` the duplicate as PDF (format: a4 or letter based on JD location)
b. **IMMEDIATELY** download the PDF using Bash:
   ```bash
   curl -sL -o "output/cv-{candidate}-{company}-canva-{YYYY-MM-DD}.pdf" "{download_url}"
   ```
   The export URL is a pre-signed S3 link that expires in ~2 hours. Download it right away.
c. Verify the download:
   ```bash
   file output/cv-{candidate}-{company}-canva-{YYYY-MM-DD}.pdf
   ```
   Must show "PDF document". If it shows XML or HTML, the URL expired — re-export and retry.
d. Report: PDF path, file size, Canva design URL (for manual tweaking)

#### Error handling

- If `import-design-from-url` fails → fall back to HTML/PDF pipeline with message
- If text elements can't be mapped → warn user, show what was found, ask for manual mapping
- If `find_and_replace_text` finds no matches → try broader substring matching
- Always provide the Canva design URL so the user can edit manually if auto-edit fails

## Cover Letter Sub-flow

After generating the CV PDF, offer to generate a cover letter:

```text
CV PDF generated: output/{path}

Want a cover letter for this role too?
- Say "yes" or "cover letter" to generate one now
- Or run `/career-ops cover {slug}` later
```

Apply `voice-dna.md` (if present) to the cover letter — full guardrail, conversational voice included (Tier 1 + Tier 2). The CV PDF itself stays Tier 1 only (formal ATS register). See `_shared.md` → Voice DNA.

If the user says yes, run the full cover letter flow from `modes/cover.md` in slug mode:
1. Load the existing `## Cover Letter Draft` from the evaluation report as a starting point
2. Run company research (Step 3 of cover.md)
3. Present keyword list for confirmation (Step 4)
4. Surface any gaps (Step 5)
5. Ask the four prompts: why / problems / approach / tone (Step 6)
6. Draft in chat, wait for approval (Steps 7-8)
7. Generate cover letter PDF via `node generate-cover-letter.mjs` (Step 9)
8. Report both PDF paths

Do not auto-generate the cover letter PDF without going through the interactive steps above.

## Post-generation

Update tracker if the job is already registered: change PDF from ❌ to ✅.
