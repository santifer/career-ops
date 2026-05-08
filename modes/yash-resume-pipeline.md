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

3. **Extract JD via Scrapling** (stealth fetcher, bypasses Cloudflare/Akamai):

   ```bash
   .venv/bin/python3 scrapling_fetch.py <url>
   ```

   Returns JSON on stdout, exit 0 on ok / exit 1 on fail.

   - On `status: ok` → use `title`, `body`, and `source_hint` from the JSON to continue.
   - On `status: fail`:
     - run `mark-failed --url <url> --reason "scrapling: <json.error>"`
     - run `log --status fail --url <url> --reason "scrapling: <json.error>"`
     - ask user: continue with next URL? (yes / quit)

4. **Parse JD fields** from raw text (LLM judgment):
   - Extract `company`, `role`, `location`, `posted_date`.
   - For the portal hint, use the `source_hint` returned by step 3 (`lever` / `ashby` / `greenhouse` / `workday` / `other`). Do not re-derive from the URL host.
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

9b. **Apply the cover-letter prompt:**

    Read `cover-letter-system-based-on-jd-and-resume.md` and apply it
    in-context to:
    - the JD body from `jds/JD_<c>_<r>_Yash_Anghan_<d>.md` (written in step 6)
    - the tailored resume LaTeX from `/tmp/<c>_<r>_Yash_Anghan_Resume_<d>.tex` (written in step 8)

    The prompt's output rules govern the response. Possible outputs:

    a) Just LaTeX (score >= 90)
    b) `OPTIMIZATION INCOMPLETE — Score: X/100` + deficiencies + LaTeX
    c) `CONTEXTUALIZATION DEFICIENCY DETECTED` + reason + LaTeX
    d) `PARAGRAPH_COUNT_ERROR — CANNOT PROCEED` (no LaTeX, hard fail)
    e) `PROOF_POINT_VIOLATION — CANNOT PROCEED` (no LaTeX, hard fail)

    **Parse the output:**
    - Find the first occurrence of `\documentclass`.
    - If present: everything before it = deficiency log; everything from
      `\documentclass` to end = LaTeX block.
    - If absent: cover-letter step fails. Skip 10b–11b. Write the
      sidecar `.log` (step 12b) with `status: failed` and the full output.
      Print warning to user. Do NOT mark URL failed — the resume PDF is
      already on disk; the URL still gets marked processed at step 11.

10b. **Write cover-letter `.tex`:** save the LaTeX block (from
     `\documentclass` onward) to
     `/tmp/<c>_<r>_Yash_Anghan_Cover_Letter_<d>.tex`. Never write to
     `cover-letters/` (PDFs only).

11b. **Compile cover letter to PDF:**

     ```bash
     node yash-resume-pipeline.mjs compile-cover-letter \
         --tex /tmp/<c>_<r>_Yash_Anghan_Cover_Letter_<d>.tex \
         --pdf cover-letters/<c>_<r>_Yash_Anghan_Cover_Letter_<d>.pdf
     ```

     If `status: fail`:
     - Skip the cover-letter PDF — but the stray-`.log` cleanup runs
       inside the subcommand on both success and failure paths, so
       `cover-letters/` stays clean.
     - Write the sidecar `.log` (step 12b) with `status: failed` and
       `tectonic_log_tail` from the response.
     - Print warning. URL still marked processed at step 11.

12b. **Write cover-letter sidecar `.log`** to
     `cover-letter-logs/<c>_<r>_Yash_Anghan_Cover_Letter_<d>.log`:

     ```
     score: <X>/100
     deficiencies: <text captured before \documentclass; or "none">
     status: compiled | compiled-review-recommended | failed
     resume_keywords_echoed: <count>
     ```

11. **Mark processed and log:**

    ```bash
    node yash-resume-pipeline.mjs mark-processed \
        --url <url> --company "<c>" --role "<r>" \
        --jd <jd-path> --pdf <pdf-path> --score <X> \
        --cover-letter <cover-letter-pdf-path-or-omitted-on-fail> \
        --cover-letter-status <ok|fail>

    node yash-resume-pipeline.mjs log \
        --status ok --url <url> \
        --slug <c>_<r> --score <X> \
        --jd <jd-path> --pdf <pdf-path> \
        --cover-letter <cover-letter-pdf-path-or-omitted> \
        --cover-letter-score <X-or-omitted> \
        --cover-letter-status <ok|fail>
    ```

    Omit cover-letter args when the cover-letter step failed at 9b
    (no LaTeX) or 11b (compile crashed).

12. **Report to user:** print the JD path, resume PDF path,
    cover-letter PDF path (or `<absent — see warning>`), resume score,
    cover-letter score, and any review/warning flags.

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
- **Cover letter is best-effort.** A cover-letter failure (V2.0 hard-fail or
  tectonic crash) does NOT mark the URL failed when the resume PDF already
  succeeded. The URL is marked processed with a warning, and the cover-letter
  sidecar `.log` records the reason. Cover-letter failures do NOT count toward
  the 3-consecutive-failures backoff.
- **Never modify** `cover-letter-system-based-on-jd-and-resume.md` during a run
  (same discipline as the resume prompt).
