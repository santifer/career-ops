# Mode: cover-letter — Tailored Cover Letter Generation

## Full pipeline

1. Read `cv.md` as the source of truth for the candidate's background.
2. Read candidate contact info (structured fields) from `config/profile.yml`. Read voice, tone, and targeting narrative from `modes/_profile.md`.
3. Check context for the Job Description (JD) and any evaluation report. If not present, ask the user to provide the JD or URL. When a JD URL is provided, validate it prior to fetching:
   - Ensure the protocol is strictly `http` or `https`.
   - Resolve the hostname and disallow any private (RFC 1918) or link-local IP addresses to prevent SSRF.
   - Enforce domain-specific safety checks or ask the user to paste the JD directly if the domain is not trusted.
   - Limit accepted Content-Types to `text/html`, `text/plain`, or `application/pdf`.
   - Apply strict timeouts (max 10s) and size limits (max 2MB) on the fetch operation.
   - If the fetch fails or is rejected, fallback to asking the user to paste the JD text.
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
   - `{{BODY}}`: HTML paragraphs (`<p>...</p>`) containing the generated cover letter. **Security Rule:** All dynamic content injected into `{{BODY}}` must be HTML-escaped/sanitized (using `escapeHtml` or equivalent to escape `<`, `>`, `&`, `"`, `'`) to prevent HTML injection.
8. Read `name` from `config/profile.yml` → normalize to kebab-case lowercase → `{candidate}`.
9. Write the temporary HTML file to `/tmp/cl-{candidate}-{company}.html`. Before writing, sanitize `{candidate}` and `{company}` to prevent path traversal or shell injection: remove all path separators (`/`, `\`), shell metacharacters, and limit characters to a strict allowlist of alphanumeric characters and hyphens. Resolve the path absolutely and verify it is located inside `/tmp` (or equivalent temporary directory).
10. Execute the PDF generator using a safe process execution method (such as Node's `child_process.execFile` or equivalent argument-based execution) rather than shell command string interpolation to prevent shell command injection. Validate the `format` argument against a strict whitelist (`letter`, `a4`). The invocation should look like: `node generate-pdf.mjs [inputHtmlPath] [outputPdfPath] --format=[letter|a4]`.
11. Generate and save a plain-text/markdown copy of the cover letter to `output/cl-{candidate}-{company}-{YYYY-MM-DD}.txt` (or `.md`) so that a copy-pasteable fallback version is written alongside the PDF.
12. Report the absolute paths for both the generated PDF and the plain-text/markdown copy, and confirm both files were successfully saved.
13. Update the tracker if the job is already registered: add a note in the tracker that a cover letter was generated.

## Error Handling

Apply a consistent error detection and remediation strategy across all steps:
- **Profile / CV Validation**: Verify that `cv.md` exists and contains background content. Verify that `config/profile.yml` exists and contains required fields (`name`, `email`, `phone`). If any required field is missing, log the error with step/context and the missing input, present a clear user-facing message explaining how to populate it (e.g. running onboarding), and terminate execution immediately (return a non-zero exit status).
- **Optional Profile Fields**: For optional fields (like LinkedIn or portfolio), if missing or empty, output a warning/sensible default and continue.
- **JD URL Fetch Failures**: If fetching the JD URL fails (DNS error, timeout, SSRF rejection, untrusted domain, or invalid content-type), log the error and fall back to asking the user to paste the JD text. Do not proceed without a valid JD.
- **PDF Generation Errors**: If `generate-pdf.mjs` / Playwright fails, or if permission/write errors occur when saving to `/tmp` or `output/`, log the error with context, display a clear message to the user, terminate execution with a non-zero exit status, and record the failure in the application tracker if generation was attempted.

## Writing Style & Voice

- Match the candidate's voice as configured in `modes/_profile.md` (or, if absent, standard professional defaults) or from `writing-samples/`.
- Maintain a professional, confident, yet humble tone.
- Avoid clichés like "I am writing to express my interest..." or "I am a motivated self-starter...". Start with a hook or direct connection instead.
