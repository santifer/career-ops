# Mode: apply — Live application assistant

Interactive mode while the candidate fills an application form in Chrome. Read what is on screen, load prior context for that role, and generate tailored answers per question.

## Requirements

- **Best with visible Playwright:** The candidate sees the browser; Claude can interact with the page.
- **Without Playwright:** The candidate shares a screenshot or pastes questions manually.

## Workflow

```
1. DETECT    → Read active Chrome tab (screenshot / URL / title)
2. IDENTIFY  → Extract company + role from the page
3. SEARCH    → Match against existing reports in reports/
4. LOAD      → Read full report + Section G if present
5. COMPARE   → Does on-screen role match evaluated role? If changed → warn
6. ANALYZE   → Identify ALL visible form questions
7. GENERATE  → Tailored answer per question
8. PRESENT   → Formatted copy-paste output
```

## Step 1 — Detect the listing

**With Playwright:** Snapshot the active page. Read title, URL, visible content.

**Without Playwright:** Ask the candidate to:
- Share a screenshot of the form (Read tool supports images)
- Or paste the questions as text
- Or give company + role so you can search

## Step 2 — Identify and load context

1. Extract company name and role title from the page
2. Search `reports/` for the company (case-insensitive Grep)
3. If match → load the full report
4. If Section G exists → use prior draft answers as a base
5. If no match → warn and offer a quick auto-pipeline run

## Step 3 — Detect role changes

If the on-screen role differs from the evaluated one:
- **Tell the candidate:** “The role changed from [X] to [Y]. Re-evaluate or adapt answers to the new title?”
- **If adapt:** Adjust answers to the new title without a full re-eval
- **If re-eval:** Run full A–F, update report, regenerate Section G
- **Update tracker:** Change role title in `applications.md` if appropriate

## Step 4 — Analyze form questions

Identify **all** visible questions:
- Free text (cover letter, why this role, etc.)
- Dropdowns (how you heard, work authorization, etc.)
- Yes/No (relocation, visa, etc.)
- Salary fields
- Uploads (resume, cover PDF)

Classify each:
- **Already in Section G** → refine existing draft
- **New** → generate from report + `cv.md`

## Step 5 — Generate answers

For each question:

1. **Report context:** Proof points from block B, STAR stories from block F
2. **Prior Section G:** Use as base and refine
3. **Tone “I’m choosing you”:** Same framework as auto-pipeline
4. **Specificity:** Reference something concrete visible on the JD page
5. **career-ops proof point:** Use “Additional info” fields when available

**Output format:**

```
## Answers for [Company] — [Role]

Based on: Report #NNN | Score: X.X/5 | Archetype: [type]

---

### 1. [Exact form question]
> [Copy-paste-ready answer]

### 2. [Next question]
> [Answer]

...

---

Notes:
- [Observations about the role, changes, etc.]
- [Customization the candidate should double-check]
```

## Step 6 — Post-apply (optional)

If the candidate confirms submission:
1. Update `applications.md` status from Evaluated → Applied
2. Update Section G in the report with final answers
3. Suggest next step: `/career-ops contacto` for LinkedIn outreach

## Scroll handling

If the form has more questions below the fold:
- Ask the candidate to scroll and share another screenshot
- Or paste remaining questions
- Iterate until the full form is covered
