# Mode: apply — Live Application Assistant

Interactive mode for when the candidate is filling out an application form in Chrome. It reads what is on the screen, loads the previous context of the job, and generates personalized responses for each form question.

## Queue integration

Before starting the interactive apply flow, check whether a `data/apply-queue.json`
record exists for this role (match by URL or company+title):

- **If a queue record exists:** load its `employment_type`, `visa_answer`, `drafts`,
  `cv_pdf`, and `free_text_fields`. Use these instead of re-deriving them from scratch.
  This ensures the visa answer selected during scoring is used consistently.
- **If no queue record exists:** proceed normally, deriving answers from
  `config/profile.yml` and `modes/_profile.md`.

**On open:** re-verify liveness (Playwright `browser_navigate` + `browser_snapshot`).
If the posting is closed, mark the queue record `status: "closed"` and inform Neil.

**Conservative fill:** only populate fields that can be mapped with high confidence
from `config/profile.yml` and the queue record. Any field that cannot be confidently
identified must be left blank and added to the role's `flags` as `manual-field`.
Never guess or approximate a value. A blank field is acceptable; a wrong value is not.

**Part-time hours guardrail:** for part-time roles, any hours/week or availability
field must use `application_answers.availability_parttime` (text) or
`application_answers.max_hours_per_week_parttime` (number). Never enter a value
above 24 hours/week for a part-time role on a student visa.

**Stop before submit:** this mode fills and presents answers; Neil submits manually.
After Neil confirms submission, call `POST /api/role/:id/decision {decision:"submitted"}`
on the local dashboard server (if running) to write the status back and sync the tracker.

---

## Login-gated portals (standing procedure)

Some custom ATSes (Vic Gov careers, ELMO Talent, Workday, PageUp, Taleo,
SmartRecruiters, SAP SuccessFactors, iCIMS) gate the application form behind a
candidate account login. These roles carry the `login-required` flag in the queue and
show a 🔐 badge in the dashboard.

**Procedure (always followed — never bypassed):**

1. Navigate to the posting URL and take a snapshot.
2. If a sign-in / register wall is present (no application form visible):
   - **Pause immediately.** Tell Neil: "This portal requires login. Please sign in or
     create an account in the open browser, then confirm here and I'll continue."
   - Wait for Neil's confirmation. Do not proceed, fill, or navigate away.
3. After Neil confirms authentication: re-snapshot, then continue with the normal
   layered fill (deterministic → cache → model-reasoned).
4. Leave the browser/tab open at the filled form. **Never locate or click Submit.**
5. This procedure applies regardless of whether a queue record exists for the role.

**Why:** account creation on these portals involves verifiable identity steps (email
confirmation, password, optional 2FA) that the agent must not perform or automate on
the candidate's behalf. The agent's role is to fill the form once the candidate has
authenticated; submitting remains the candidate's action.

---

## Requirements

- **Best with Playwright in visible mode**: In visible mode, the candidate sees the browser and Claude can interact with the page.
- **Without Playwright**: the candidate shares a screenshot or pastes the questions manually.

## Workflow

```text
1. DETECT      → Read active Chrome tab (screenshot/URL/title)
2. IDENTIFY    → Extract company + role from the page
3. SEARCH      → Match against existing reports in reports/
4. LOAD        → Read full report + Section G (if it exists)
5. COMPARE     → Does the role on screen match the one evaluated? If it changed → notify
6. ANALYZE     → Identify ALL visible form questions
7. GENERATE    → For each question, generate a personalized response
8. PRESENT     → Show formatted responses for copy-paste
```

## Step 1 — Detect the job

**With Playwright:** Take a snapshot of the active page. Read title, URL, and visible content.

**Without Playwright:** Ask the candidate to:
- Share a screenshot of the form (Read tool can read images)
- Or paste the form questions as text
- Or say company + role so we can search for it

## Step 2 — Identify and search for context

1. Extract company name and role title from the page
2. Search in `reports/` by company name (case-insensitive grep)
3. If there is a match → load the full report
4. If there is a Section G → load previous draft answers as a base
5. If there is NO match → notify and offer to run a quick auto-pipeline

## Step 3 — Detect changes in the role

If the role on screen differs from the one evaluated:
- **Notify the candidate**: "The role has changed from [X] to [Y]. Do you want me to re-evaluate or adapt the responses to the new title?"
- **If adapt**: Adjust responses to the new role without re-evaluating
- **If re-evaluate**: Execute full A-F evaluation, update report, regenerate Section G
- **Update tracker**: Change role title in applications.md if applicable

## Step 4 — Analyze form questions

Identify ALL visible questions:
- Free text fields (cover letter, why this role, etc.)
- Dropdowns (how did you hear, work authorization, etc.)
- Yes/No (relocation, visa, etc.)
- Salary fields (range, expectation)
- Upload fields (resume, cover letter PDF)

Classify each question:
- **Already answered in Section G** → adapt the existing response
- **New question** → generate response from the report + cv.md

## Work authorization and sponsorship

Read `config/profile.yml` before answering any visa, work-rights, or sponsorship
question. Specific phrasings and work-rights framing are in `modes/_profile.md`
under the "Negotiation / Application Framing" section.

Default answers while the profile is unchanged:

- Sponsorship required? **No** / **No sponsorship required**.
- Require employer sponsorship now or in the future? **No**.
- Authorized to work in the role's jurisdiction? **Yes**, with the exact timing
  and conditions from `config/profile.yml`.
- Citizenship, residency, or security clearance? Do not claim any status not
  explicitly present in `config/profile.yml`.

If a form only allows an option that does not accurately describe the candidate's
work rights, stop and flag it to the candidate. Never submit or recommend
submitting an inaccurate answer.

## Step 5 — Generate responses

For each question, generate the response following:

1. **Report context**: Use proof points from block B, STAR stories from block F
2. **Previous Section G**: If a draft response exists, use it as a base and refine
3. **"I'm choosing you" tone**: Same auto-pipeline framework
4. **Specificity**: Reference something specific from the JD visible on screen
5. **career-ops proof point**: Include in "Additional info" if there is a field for it

**Output format:**

```text
## Responses for [Company] — [Role]

Based on: Report #NNN | Score: X.X/5 | Archetype: [type]

---

### 1. [Exact form question]
> [Response ready for copy-paste]

### 2. [Next question]
> [Response]

...

---

Notes:
- [Any observations about the role, changes, etc.]
- [Personalization suggestions the candidate should review]
```

## Step 6 — Post-apply (optional)

If the candidate confirms that they submitted the application:
1. Update status in `applications.md` from "Evaluated" to "Applied"
2. Update Section G of the report with the final responses
3. Suggest next step: `/career-ops contacto` for LinkedIn outreach

## Scroll handling

If the form has more questions than the visible ones:
- Ask the candidate to scroll and share another screenshot
- Or paste the remaining questions
- Process in iterations until the entire form is covered
