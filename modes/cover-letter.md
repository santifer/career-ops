# Mode: cover-letter — Tailored Cover Letter Generation

## Full pipeline

1. Read `cv.md` as the source of truth for the candidate's background.
2. Read `config/profile.yml` for candidate contact info and targeting details.
3. Check context for the Job Description (JD) and any evaluation report. If not present, ask the user to provide the JD or URL.
4. Detect JD language (default to English).
5. Detect company location (US/Canada → `letter` format, Rest of the world → `a4`).
6. Generate the cover letter text based on the JD requirements and candidate profile:
   - **Length:** 3-4 paragraphs max (must fit on a single page).
   - **Salutation:** Address the Hiring Manager or specific recruiter if known, otherwise "Dear Hiring Team at [Company]" or similar.
   - **Opening:** State the target role and convey genuine excitement about the company's mission/product.
   - **Body paragraphs:** Map 1-2 major JD requirements to concrete achievements from `cv.md` (and `article-digest.md` if available). Inject key terminology naturally without exaggerating.
   - **Closing:** Reiterate value, reference the enclosed CV/portfolio, and express enthusiasm for discussing further.
7. Generate the HTML content by replacing placeholders in `templates/cover-letter-template.html`:
   - `{{LANG}}`: Detected language (e.g. `en`).
   - `{{PAGE_WIDTH}}`: `8.5in` for letter or `210mm` for A4.
   - `{{NAME}}`: Candidate's full name.
   - `{{PHONE}}`: Candidate's phone (with separator, if defined).
   - `{{EMAIL}}`: Candidate's email address.
   - `{{LINKEDIN_URL}}` / `{{LINKEDIN_DISPLAY}}`: LinkedIn details.
   - `{{PORTFOLIO_URL}}` / `{{PORTFOLIO_DISPLAY}}`: Portfolio details.
   - `{{LOCATION}}`: Candidate's location.
   - `{{DATE}}`: Current date formatted nicely (e.g. "June 10, 2026").
   - `{{COMPANY}}`: Short name of the hiring company.
   - `{{RECIPIENT}}`: "Hiring Team", "Hiring Manager", or specific contact if known.
   - `{{SUBJECT}}`: "Subject: Application for [Role Title] - [Candidate Name]" (kebab-case or title case).
   - `{{BODY}}`: HTML paragraphs (`<p>...</p>`) containing the generated cover letter.
8. Read `name` from `config/profile.yml` → normalize to kebab-case lowercase → `{candidate}`.
9. Write the temporary HTML file to `/tmp/cl-{candidate}-{company}.html`.
10. Execute: `node generate-pdf.mjs /tmp/cl-{candidate}-{company}.html output/cl-{candidate}-{company}-{YYYY-MM-DD}.pdf --format={letter|a4}`.
11. Report the output paths (both the generated PDF and a markdown/plain-text copy for copy-pasting), and confirm the files are saved.
12. Update the tracker if the job is already registered: add a note in the tracker that a cover letter was generated.

## Writing Style & Voice

- Match the candidate's voice as configured in `modes/_profile.md` or from `writing-samples/`.
- Maintain a professional, confident, yet humble tone.
- Avoid clichés like "I am writing to express my interest..." or "I am a motivated self-starter...". Start with a hook or direct connection instead.
