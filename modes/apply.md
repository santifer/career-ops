# Mode: apply — Live Application Assistant

Interactive mode for when the candidate is filling out an application form in Chrome. Read what is on screen, load the prior offer context, and generate tailored answers for each question in the form.

## Requirements

- **Best with visible Playwright**: in visible mode, the candidate sees the browser and Claude can interact with the page.
- **Without Playwright**: the candidate shares a screenshot or pastes the questions manually.

## Workflow

```
1. DETECT     → Read the active Chrome tab (screenshot/URL/title)
2. IDENTIFY   → Extract company + role from the page
3. LOOK UP    → Match against existing reports in reports/
4. LOAD       → Read the full report + Section G (if present)
5. COMPARE    → Does the on-screen role match the evaluated one? If it changed -> warn
6. ANALYZE    → Identify ALL visible form questions
7. GENERATE   → Produce a tailored answer for each question
8. PRESENT    → Show formatted answers for copy-paste
```

## Step 1 — Detect the offer

**With Playwright:** take a snapshot of the active page. Read the title, URL, and visible content.

**Without Playwright:** ask the candidate to:
- Share a screenshot of the form (the Read tool can inspect images)
- Or paste the form questions as text
- Or provide the company + role so we can look it up

## Step 2 — Identify and load context

1. Extract the company name and role title from the page
2. Search `reports/` by company name (case-insensitive grep)
3. If there is a match -> load the full report
4. If there is a Section G -> load the draft answers as the starting point
5. If there is NO match -> warn the candidate and offer a quick auto-pipeline run

## Step 3 — Detect role changes

If the role on screen differs from the evaluated one:
- **Warn the candidate**: "The role changed from [X] to [Y]. Do you want me to re-evaluate it or adapt the answers to the new title?"
- **If adapt**: tailor the answers to the new role without re-evaluating
- **If re-evaluate**: run the full A-F evaluation, update the report, and regenerate Section G
- **Update tracker**: change the role title in `applications.md` if needed

## Step 4 — Analyze the form questions

Identify ALL visible questions:
- Free-text fields (cover letter, why this role, etc.)
- Dropdowns (how did you hear, work authorization, etc.)
- Yes/No prompts (relocation, visa, etc.)
- Salary fields (range, expectation)
- Upload fields (resume, cover letter PDF)

Classify each question:
- **Already answered in Section G** -> adapt the existing answer
- **New question** -> generate a fresh answer from the report + `cv.md`

## Step 5 — Generate the answers

For each question, generate the answer using:

1. **Report context**: use proof points from block B and STAR stories from block F
2. **Existing Section G**: if a draft answer already exists, use it as the base and refine it
3. **"I'm choosing you" tone**: same framework as auto-pipeline
4. **Specificity**: reference something concrete from the JD visible on screen
5. **career-ops proof point**: include it in "Additional info" if there is a relevant field

**Output format:**

```
## Answers for [Company] — [Role]

Based on: Report #NNN | Score: X.X/5 | Archetype: [type]

---

### 1. [Exact question from the form]
> [Copy-paste-ready answer]

### 2. [Next question]
> [Answer]

...

---

Notes:
- [Any observations about the role, changes, etc.]
- [Personalization suggestions the candidate should review]
```

## Step 6 — Post-apply (optional)

If the candidate confirms they submitted the application:
1. Update the status in `applications.md` from `Evaluated` to `Applied`
2. Update Section G in the report with the final answers
3. Suggest the next step: `/career-ops outreach` for LinkedIn outreach

## Scroll handling

If the form has more questions than the visible portion:
- Ask the candidate to scroll and share another screenshot
- Or paste the remaining questions
- Process it iteratively until the whole form is covered
