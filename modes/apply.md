# Mode: apply — Live Application Assistant

> Apply `voice-dna.md` (if present) to free-text answers and cover-letter fields — full guardrail, conversational voice included (Tier 1 + Tier 2). See `_shared.md` → Voice DNA.

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
If the posting is closed, mark the queue record `status: "closed"` and inform the candidate.

**Conservative fill:** only populate fields that can be mapped with high confidence
from `config/profile.yml` and the queue record. Any field that cannot be confidently
identified must be left blank and added to the role's `flags` as `manual-field`.
Never guess or approximate a value. A blank field is acceptable; a wrong value is not.

**Part-time hours guardrail:** for part-time roles, any hours/week or availability
field must use `application_answers.availability_parttime` (text) or
`application_answers.max_hours_per_week_parttime` (number). Never enter a value
above the configured work-rights or availability limit in `config/profile.yml`.

**Stop before submit:** this mode fills and presents answers; the candidate submits manually.
After the candidate confirms submission, call
`POST /api/role/:id/decision {decision:"submitted"}` on the local dashboard server
(if running) to write the status back and sync the tracker.

---

## Login-gated portals (standing procedure)

Some ATSes gate the application form behind a candidate account login.
These roles carry the `login-required` flag in the queue and show a 🔐 badge
in the dashboard.

**For deterministic-fill roles (`form-fill.mjs` path — Greenhouse / Lever / Ashby):**
`form-fill.mjs` handles login-wall detection and polling automatically. It reads
credentials from `data/portal-credentials.json` (gitignored) and follows the
login/registration capabilities configured in the user's `config/profile.yml`
(`automation.login_timeout_min`). Refer to `form-fill.mjs` and `login-core.mjs`
for the exact behavior.

**For custom ATS roles (agent apply path — this mode):**

1. Navigate to the posting URL and take a snapshot.
2. If a sign-in / register wall is present (no application form visible):
   - Detect whether it is a **login wall** or a **registration form**.
   - **Registration form**: fill PII from `config/profile.yml`; call
     `getOrCreateCredentials(host)` from `credentials-store.mjs` to get or generate a
     password; fill the password fields; click **Register / Sign up / Create
     account**. Then enter the polling loop (step 3).
   - **Login wall** (account already exists): tell the candidate which credential is
     stored for this portal, then poll (step 3).
3. Poll every ~3 s for the post-login signal (application form fields visible) for up
   to `automation.login_timeout_min` minutes. The candidate resolves email verification /
   CAPTCHA / OTP during this window — the polling loop waits without conversational
   interruption.
4. Once the form is visible, continue with the normal layered fill
   (deterministic → cache → model-reasoned).
5. **Multi-page wizards**: click **Continue / Next / Save and continue / Review** to
   advance pages. Stop when the page shows a review/summary (entered data echoed, no
   further editable input fields). The exact button label at that stop point is
   irrelevant — the stop signal is the page state.
6. For **Workday / PageUp** pre-filled fields: verify and correct CV-parsed values —
   do not only fill blank fields. Cross-check every pre-filled field against
   `config/profile.yml`.
7. Leave the browser/tab open at the filled form. **Never locate or click the final
   submit button** — the denylist is: "Submit", "Submit application", "Send application",
   "Confirm and submit". The candidate makes the final call.
8. After the candidate confirms submission: capture confirmation number if visible,
   screenshot to `output/`, call `POST /api/role/:id/decision {decision:"submitted"}`
   to sync the tracker.

**Note on passwords:** all auto-generated portal passwords are stored in
`data/portal-credentials.json` (gitignored). If you need to look up a password for
a portal the candidate already has an account on, read that file.

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
5. PREFLIGHT   → Confirm posting liveness + company/role match before drafting
6. ANALYZE     → Identify ALL visible form questions
7. GENERATE    → For each question, generate a personalized response
8. PRESENT     → Show formatted responses for copy-paste
```

## Step 5 — Preflight gate

Before generating any application answers, verify that the form still points to the intended active job. This gate runs after the page has been detected, the company/role has been identified, and the matching report has been loaded.

1. Read the visible URL, page title, company, role, and any closed/expired signals.
2. If a URL is available, verify liveness with Playwright:
   - active posting evidence: title/role + job description or form fields + submit/apply path
   - closed posting evidence: expired/closed/no longer accepting applications, missing JD with only nav/footer, hard redirect to generic careers/search, or 404/410
3. Compare the visible company and role against the matched report.
4. If company or title changed materially, stop before drafting and ask:
   "The form appears to be for [visible company] — [visible role], but the matched report is [report company] — [report role]. Do you want me to re-evaluate, adapt with this mismatch, or stop?"
5. If the posting appears closed, refuse to generate final copy unless the candidate explicitly overrides with a known reason.
6. If liveness cannot be verified because the candidate only pasted questions or a screenshot, state that limitation and ask the candidate to confirm the company, role, and active posting before drafting.

Do not continue to Step 6 until this preflight is resolved.

**Applying to several roles in one sitting?** This preflight verifies the single form in front of you. Before a multi-role session — especially against scanner entries marked `**Verification:** unconfirmed (batch mode)` — run the `pipeline` mode **Liveness sweep** first (`node check-liveness.mjs --file <urls>`). It drops the dead postings from `data/pipeline.md` in one batch so you never open a tab on an expired role.

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
- **If adapt**: Adjust responses to the new role without re-evaluating, only after the candidate explicitly accepts the mismatch
- **If re-evaluate**: Execute full A-F evaluation, update report, regenerate Section G
- **Update tracker**: Change role title in applications.md if applicable

## Step 6 — Analyze form questions

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

For each field, preserve the application form contract:
- `field_type`: `text`, `textarea`, `select`, `radio`, `checkbox`, `number`, `file`, or `unknown`
- `required`: `yes`, `no`, or `unknown`
- `limit`: exact character/word limit if visible; otherwise `unknown`
- `options`: visible options for select/radio/checkbox fields
- `needs_candidate_confirmation`: `yes` for legal, demographic, work authorization, visa, relocation, salary, disability, veteran, sponsorship, background-check, or self-identification questions unless the answer is explicitly present in `config/profile.yml`

Never invent answers for legal, demographic, work-authorization, visa/sponsorship, salary, disability, veteran, background-check, relocation, or self-identification fields. If the answer is not present in `config/profile.yml` or visible context, mark it as needing candidate confirmation and provide the safest question to ask the candidate.

## Step 7 — Generate responses

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
> [Response ready for copy-paste, or "Ask candidate: ..." if the field needs confirmation]

### 2. [Next question]
> [Response]

...

---

Notes:
- [Any observations about the role, changes, etc.]
- [Personalization suggestions the candidate should review]
```

## Step 8 — Post-apply (optional)

If the candidate confirms that they submitted the application:
1. Update status in `applications.md` from "Evaluated" to "Applied"
2. Update Section G of the report with the final responses
3. Suggest next step: `/career-ops contacto` for LinkedIn outreach

## Scroll handling

If the form has more questions than the visible ones:
- Ask the candidate to scroll and share another screenshot
- Or paste the remaining questions
- Process in iterations until the entire form is covered
