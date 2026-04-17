# Mode: apply — Live Application Assistant

Interactive mode for when the candidate is filling out an application form in Chrome. Read what is on screen, load prior context for the offer, and generate personalized answers for each form question.

## Requirements

- **Best with visible Playwright**: In visible mode, the candidate sees the browser and Claude can interact with the page.
- **Without Playwright**: the candidate shares a screenshot or pastes the questions manually.

## Workflow

```
1. DETECT      → Read the active Chrome tab (screenshot/URL/title)
2. IDENTIFY    → Extract company + role from the page
3. LOOK UP     → Match against existing reports in `reports/`
4. LOAD        → Read the full report + draft application answers section (if it exists)
5. COMPARE     → Does the role on screen match the evaluated one? If it changed → warn
6. ANALYZE     → Identify ALL visible form questions
7. GENERATE    → Generate a personalized answer for each question
8. PRESENT     → Show formatted answers for copy-paste
```

## Step 1 — Detect the Offer

**With Playwright:** take a snapshot of the active page. Read the title, URL, and visible content.

**Without Playwright:** ask the candidate to:
- Share a screenshot of the form (the Read tool can read images)
- Or paste the form questions as text
- Or provide company + role so we can look it up

## Step 2 — Identify and Look Up Context

1. Extract the company name and role title from the page
2. Search `reports/` by company name (case-insensitive grep)
3. If there is a match → load the full report
4. If there is a draft application answers section → load the previous draft answers as a base
5. If there is NO match → warn and offer to run a quick auto-pipeline

## Step 3 — Detect Role Changes

If the role on screen differs from the one previously evaluated:
- **Warn the candidate**: "The role has changed from [X] to [Y]. Do you want me to re-evaluate it or adapt the answers to the new title?"
- **If adapting**: adjust the answers to the new role without re-evaluating
- **If re-evaluating**: run the full A-G evaluation, update the report, and regenerate the draft application answers
- **Update tracker**: change the role title in `applications.md` if appropriate

## Step 4 — Analyze Form Questions

Identify ALL visible questions:
- Free-text fields (cover letter, why this role, etc.)
- Dropdowns (how did you hear, work authorization, etc.)
- Yes/No fields (relocation, visa, etc.)
- Salary fields (range, expectation)
- Upload fields (resume, cover letter PDF)

Classify each question:
- **Already answered in the draft application answers section** → adapt the existing answer
- **New question** → generate an answer from the report + `cv.md`

## Step 5 — Generate Answers

For each question, generate the answer following these rules:

1. **Report context**: use proof points from block B and STAR stories from block F
2. **Previous draft answers**: if there is a draft answer, use it as a base and refine it
3. **"I'm choosing you" tone**: same framework as auto-pipeline
4. **Specificity**: reference something concrete from the JD visible on screen
5. **career-ops proof point**: include it in "Additional info" if there is a field for that

**Output format:**

```
## Answers for [Company] — [Role]

Based on: Report #NNN | Score: X.X/5 | Archetype: [type]

---

### 1. [Exact question from the form]
> [Answer ready for copy-paste]

### 2. [Next question]
> [Answer]

...

---

Notes:
- [Any notes about the role, changes, etc.]
- [Customization suggestions the candidate should review]
```

## Step 6 — Post-Apply (Optional)

If the candidate confirms they submitted the application:
1. Update the status in `applications.md` from "Evaluated" to "Applied"
2. Update the draft application answers section of the report with the final answers
3. Suggest the next step: `/career-ops-contact` for LinkedIn outreach

## Scroll Handling

If the form has more questions than the currently visible ones:
- Ask the candidate to scroll and share another screenshot
- Or paste the remaining questions
- Process them in iterations until the whole form is covered
