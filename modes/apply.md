# Mode: apply — Live Application Assistant

Interactive mode for when the candidate is filling out an application form in Chrome. Read what is on screen, load prior offer context, and generate tailored answers for each form question.

## Requirements

- **Best with visible Playwright**: In visible mode, the candidate sees the browser and Claude can interact with the page.
- **Without Playwright**: The candidate shares a screenshot or pastes the questions manually.

## Workflow

```
1. DETECT     → Read active Chrome tab (screenshot/URL/title)
2. IDENTIFY   → Extract company + role from the page
3. SEARCH     → Match against existing reports in reports/
4. LOAD       → Read full report + Section G (if present)
5. COMPARE    → Does the on-screen role match the evaluated one? If it changed → warn
6. ANALYZE    → Identify ALL visible form questions
7. GENERATE   → For each question, generate a tailored answer
8. PRESENT    → Show formatted answers for copy-paste
```

## Step 1 — Detect the offer

**With Playwright:** Snapshot the active page. Read title, URL, and visible content.

**Without Playwright:** Ask the candidate to:
- Share a screenshot of the form (Read tool reads images)
- Or paste the form questions as text
- Or give company + role so we can look it up

## Step 2 — Identify and load context

1. Extract company name and role title from the page
2. Search `reports/` by company name (Grep case-insensitive)
3. If there is a match → load the full report
4. If there is Section G → load prior draft answers as a base
5. If there is NO match → warn and offer to run a quick auto-pipeline

## Step 3 — Detect role changes

If the on-screen role differs from the evaluated one:
- **Warn the candidate**: "The role changed from [X] to [Y]. Do you want me to re-evaluate or adapt answers to the new title?"
- **If adapting**: Adjust answers to the new role without re-evaluating
- **If re-evaluating**: Run full A–F evaluation, update report, regenerate Section G
- **Update tracker**: Change the role title in applications.md if appropriate

## Step 4 — Analyze form questions

Identify ALL visible questions:
- Free-text fields (cover letter, why this role, etc.)
- Dropdowns (how did you hear, work authorization, etc.)
- Yes/No (relocation, visa, etc.)
- Salary fields (range, expectation)
- Upload fields (resume, cover letter PDF)

Classify each question:
- **Already answered in Section G** → adapt the existing answer
- **New question** → generate answer from report + cv.md

## Step 5 — Generate answers

For each question, generate the answer following:

1. **Report context**: Use proof points from block B, STAR stories from block F
2. **Prior Section G**: If a draft answer exists, use it as a base and refine
3. **"I'm choosing you" tone**: Same framework as auto-pipeline
4. **Specificity**: Reference something concrete from the JD visible on screen
5. **career-ops proof point**: Include in "Additional info" if there is a field for it

**Output format:**

```
## Answers for [Company] — [Role]

Based on: Report #NNN | Score: X.X/5 | Archetype: [type]

---

### 1. [Exact form question]
> [Answer ready for copy-paste]

### 2. [Next question]
> [Answer]

...

---

Notes:
- [Any observation about the role, changes, etc.]
- [Personalization suggestions the candidate should review]
```

## Step 5a — Auto-Fill (Playwright)

When auto-fill mode is requested (dashboard `a` key, or agent decides to fill):

1. **Generate answers.json** from Section G: map each draft answer to a regex pattern matching its form field label. Output as JSON with regex keys (e.g., `{"why.*interested": "Your Innovation Lab maps directly to...", "years.*experience": "12"}`).
2. **Run**: `node apply-auto.mjs --url <jobURL> --resume <resumePDF> --cover-letter <coverLetterPDF> --mode fill --profile config/profile.yml --answers answers.json`
3. The script fills all form fields (identity, EEO, resume, cover letter, custom answers) and opens a visible browser for the candidate to review.
4. **Cover letter handling**: The script auto-detects whether the form has a file upload (`input[type="file"]`) or a textarea for cover letter:
   - File upload → uploads the cover letter PDF
   - Textarea → strips HTML from the cover letter `.html` file and pastes as plain text
5. **CAPTCHA**: If detected, the script logs a warning. The candidate solves it manually.
6. The candidate reviews all fields and clicks Submit when ready.
7. After the candidate confirms submission, proceed to Step 6.

## Step 5b — Auto-Submit (Playwright)

When auto-submit mode is requested (dashboard `A` key, or agent running in batch):

1. Same as Step 5a (generate answers.json, run apply-auto.mjs) but with `--mode submit`.
2. The script runs headless by default: fills all fields, then clicks the Submit button.
3. **CAPTCHA fallback**: If a CAPTCHA is detected, the script falls back to auto-fill mode (visible browser, candidate solves CAPTCHA manually).
4. **Post-submit verification**: The script waits for a confirmation page, captures a screenshot to `output/apply-confirm-{slug}-{date}.png`, and checks for success/error indicators.
5. **Duplicate detection**: If the page shows "already applied," the script aborts and logs the result with exit code 2.
6. All results are logged to `data/apply-log.tsv`.
7. Proceed to Step 6 automatically.

## Step 6 — Post-apply

After submission (confirmed by candidate for auto-fill, or verified automatically for auto-submit):
1. Update status in `applications.md` from "Evaluated" to "Applied"
2. Update Section G of the report with the final answers
3. Log the apply attempt to `data/apply-log.tsv` if not already logged by the script
4. Suggest next step: `/career-ops contacto` for LinkedIn outreach

## Scroll handling

If the form has more questions than are visible:
- Ask the candidate to scroll and share another screenshot
- Or paste the remaining questions
- Process in iterations until the whole form is covered
