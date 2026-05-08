# Mode: yash-resume-pipeline — JD-extract → V2.0-resume two-phase pipeline

Single-URL-at-a-time pipeline. Reads pending URLs from `data/pipeline.md`,
extracts each JD via Playwright into `jds/`, applies
`resume-optimization-system-based-on-job-description.md` to produce LaTeX,
compiles a tailored PDF resume into `resumes/`. Asks for user confirmation
before each URL. No evaluation, no scoring gate, no tracker writes.

## Per-run loop

Repeat until queue empty, user quits, or 3 consecutive failures:

1. **Get next URL**

   ```bash
   node yash-resume-pipeline.mjs next-pending
   ```

   - If `status: empty` → report "queue drained" and stop.
   - If `status: ok` → continue with the returned `url`.

2. **Confirm with user**

   Show the URL. Ask: "Process `<url>`? (yes / skip / quit)"

   - `quit` → stop the loop.
   - `skip` → run `mark-skipped --url <url> --reason "user skipped"`, continue to next URL.
   - `yes` → continue.

3. **Extract JD via Playwright** (in `/tmp` to avoid `.playwright-cli/` polluting the repo):

   ```bash
   cd /tmp
   playwright-cli open <url> --browser=chromium
   playwright-cli eval "() => document.title"
   playwright-cli eval "() => document.body.innerText"
   playwright-cli close
   ```

   On any tool error (timeout, 404, login wall, expired posting):
   - run `mark-failed --url <url> --reason "playwright: <short-error>"`
   - run `log --status fail --url <url> --reason "..."`
   - ask user: continue with next URL? (yes / quit)

4. **Parse JD fields** from raw text (LLM judgment):
   - Extract `company`, `role`, `location`, `posted_date`.
   - Use the URL host as a portal hint: `lever`, `ashby`, `greenhouse`, `workday`, or `other`.
   - If `company` or `role` confidence is low, ask user once to confirm/correct.
   - If user can't say, run `mark-failed --url <url> --reason "could not determine company/role"` and continue.

5. **Slugify and dedup check:**

   ```bash
   node yash-resume-pipeline.mjs slugify --company "<c>" --role "<r>"
   ```

   Capture `company_slug`, `role_slug`, `date` from the returned JSON.

   ```bash
   node yash-resume-pipeline.mjs check-duplicate \
       --company-slug <c> --role-slug <r> --date <d>
   ```

   If `exists: true` → run `mark-skipped --url <url> --reason "duplicate (jd+pdf already exist)"` and continue.

6. **Write JD .md** to `jds/JD_<c>_<r>_Yash_Anghan_<d>.md`:

   ```markdown
   ---
   company: "<original company>"
   company_slug: <c>
   role: "<original role>"
   role_slug: <r>
   url: <url>
   source: lever | ashby | greenhouse | workday | other
   location: "<location>"
   posted_date: <YYYY-MM-DD or null>
   captured_date: <d>
   ---

   # <role> at <company>

   <cleaned full JD body as markdown>
   ```

7. **Apply the V2.0 prompt:**

   Read `resume-optimization-system-based-on-job-description.md` and apply it
   in-context to the JD body from the file written in step 6. The prompt's
   output rules govern the response. Possible outputs:

   a) Just LaTeX (score ≥ 90)
   b) `OPTIMIZATION INCOMPLETE — Score: X/100` + deficiencies + LaTeX
   c) `CONTEXTUALIZATION DEFICIENCY DETECTED` + reason + LaTeX
   d) `SENTENCE COUNT ERROR — CANNOT PROCEED` (no LaTeX, hard fail)
   e) `SKILLS OVERFLOW ERROR — CANNOT PROCEED` (no LaTeX, hard fail)

   **Parse the output:**

   - Find the first occurrence of `\documentclass`.
   - If present: everything before that line = deficiency log; everything from
     `\documentclass` to end of output = LaTeX block.
   - If absent: hard-fail. Run
     `mark-failed --url <url> --reason "V2.0 hard-fail: <SENTENCE_COUNT|SKILLS_OVERFLOW>"`
     and `log --status fail --url <url> --reason "V2.0 hard-fail: <SENTENCE_COUNT|SKILLS_OVERFLOW>"`. Save the full output to the sidecar `.log`. Continue.

8. **Write `.tex`:** save the LaTeX block (from `\documentclass` onward) to
   `resumes/<c>_<r>_Yash_Anghan_Resume_<d>.tex`.

9. **Compile to PDF:**

   ```bash
   node yash-resume-pipeline.mjs compile-resume \
       --tex resumes/<c>_<r>_Yash_Anghan_Resume_<d>.tex \
       --pdf resumes/<c>_<r>_Yash_Anghan_Resume_<d>.pdf
   ```

   If `status: fail`:
   - run `mark-failed --url <url> --reason "tectonic: <tectonic_log_tail>"`
   - run `log --status fail --url <url> --reason "tectonic: ..."`
   - keep the .tex on disk for inspection
   - ask user: continue?

10. **Write sidecar `.log`** to `resume-logs/<c>_<r>_Yash_Anghan_Resume_<d>.log`:

    ```
    score: <X>/100
    deficiencies: <text captured before \documentclass; or "none">
    status: compiled | compiled-review-recommended  (review-recommended if score < 90)
    ```

11. **Mark processed and log:**

    ```bash
    node yash-resume-pipeline.mjs mark-processed \
        --url <url> --company "<c>" --role "<r>" \
        --jd <jd-path> --pdf <pdf-path> --score <X>

    node yash-resume-pipeline.mjs log \
        --status ok --url <url> \
        --slug <c>_<r> --score <X> \
        --jd <jd-path> --pdf <pdf-path>
    ```

12. **Report to user:** print the JD path, PDF path, score, and any review flag.

13. **Ask user:** "continue with next URL? (yes / quit)"

## Stop conditions

- User says quit at any prompt.
- `next-pending` returns `status: empty`.
- 3 consecutive failures (extract or compile). Report summary and ask user
  to investigate before continuing.

## Hard rules

- **One URL at a time.** Never process in parallel. Never run multiple URLs
  through the V2.0 prompt simultaneously.
- **Files only.** This pipeline never auto-submits applications. It only
  produces JD `.md`, `.tex`, `.pdf`, and `.log` files.
- **Never edit `data/pipeline.md` directly.** Always go through the orchestrator
  subcommands so the format stays consistent with the existing `pipeline` mode.
- **Never fabricate company or role.** If the JD page is ambiguous, ask the
  user once. If they can't say, mark failed.
- **Never modify** `resume-optimization-system-based-on-job-description.md`,
  `generate-pdf-latex.mjs`, or the existing `pipeline`/`auto-pipeline` modes.
