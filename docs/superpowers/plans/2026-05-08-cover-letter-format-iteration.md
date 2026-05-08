# Cover Letter Format Iteration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the cover-letter LaTeX template overhaul (matching the user's reference) and remove the portfolio link from both the cover-letter prompt and the V2.0 resume prompt.

**Architecture:** Two prompt-file edits (no orchestrator changes, no test changes). The cover-letter prompt gets a wholesale `<base_latex_template>` swap plus three small phase-rule updates. The resume prompt gets a single two-line surgical edit (drop trailing `~` after GitHub line, delete the Portfolio `\href{...}` line). All commits land on the existing `feat/cover-letter-pipeline` branch; PR #4 picks them up automatically.

**Tech Stack:** Markdown/XML for the prompt files, tectonic for LaTeX → PDF, node:test for the regression gate.

**Spec:** `docs/superpowers/specs/2026-05-08-cover-letter-format-iteration.md`

**Hard rules (do not cross):**
- Never modify `generate-pdf-latex.mjs`, `modes/pipeline.md`, or `modes/auto-pipeline.md`.
- The resume-prompt edit in Task 2 is **explicitly authorized by the user** for this iteration only — strictly limited to the portfolio-link removal + adjacent `~`. No other resume-prompt content may be touched.
- The 52 existing unit tests must still pass after both edits (regression gate).

---

## Task 1: Cover-letter prompt edits

Wholesale swap of `<base_latex_template>` plus three small phase-rule updates. All four edits land in one commit because they are interdependent (the template swap drives the phase-rule changes).

**Files:**
- Modify: `cover-letter-system-based-on-jd-and-resume.md`

- [ ] **Step 1: Read the current state of the cover-letter prompt file**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
grep -n "<base_latex_template>\|<paragraph number=\"4\"\|Verify exactly 4 body paragraphs\|Verify closing line is\|<step number=\"7\">\|<execution_command>\|</execution_command>" cover-letter-system-based-on-jd-and-resume.md
```

This locates the anchor lines for each of the four edits. Note the line numbers — they will inform the Edit calls.

- [ ] **Step 2: Replace the entire `<base_latex_template>` block**

Use the `Edit` tool. The current block runs from `<base_latex_template>` to `</base_latex_template>` and contains the OLD LaTeX template. Replace the WHOLE block with this exact content (including the `<base_latex_template>` and `</base_latex_template>` wrapping tags so the Edit is anchored).

`old_string` (the entire current block — read the file first to get the exact text to copy as `old_string`; it includes the `\documentclass[letterpaper,11pt]` line, all 14 packages, the `\ifdefined\pdfgentounicode` block, the `\fancyhf{}` block, the centered `\Huge` heading row WITH the `\href{...faGlobe...Portfolio}` line, the `\hfill [INSERT_DATE_YYYY-MM-DD]` line, the four `[PARAGRAPH N: ...]` placeholders separated by `\par\vspace{6pt}`, and the `Sincerely,\\` then `Yash Anghan` closing).

`new_string`:

```
  <base_latex_template>
    <latex_code>
\documentclass[11pt,letterpaper]{article}
\usepackage[empty]{fullpage}
\usepackage[hidelinks]{hyperref}
\usepackage[english]{babel}
\usepackage{fontawesome5}
\usepackage{xcolor}

\addtolength{\oddsidemargin}{-0.6in}
\addtolength{\evensidemargin}{-0.6in}
\addtolength{\textwidth}{1.2in}
\addtolength{\topmargin}{-0.7in}
\addtolength{\textheight}{1.4in}

\pagestyle{empty}
\raggedright
\setlength{\parindent}{0pt}
\setlength{\parskip}{8pt}

\begin{document}

%----------HEADING----------
\begin{center}
{\Huge \scshape Yash Anghan} \\ \vspace{2pt}
\small \raisebox{-0.1\height}\faEnvelope\ \href{mailto:yashanghan97@gmail.com}{yashanghan97@gmail.com} ~
\raisebox{-0.1\height}\faPhone\ +1 (437) 290-2005 ~
\href{https://www.linkedin.com/in/yash-aiautomation/}{\raisebox{-0.2\height}\faLinkedin\ \underline{Linkedin}} ~
\href{https://github.com/yash-ai-automation}{\raisebox{-0.2\height}\faGithub\ \underline{GitHub}} ~
\vspace{-8pt}
\end{center}

\vspace{-17pt}
\noindent\rule{\textwidth}{0.4pt}
\vspace{4pt}

%----------DATE & ADDRESS----------
[INSERT_DATE_LONG]

Hiring Manager \\
[INSERT_COMPANY_NAME] \\
[INSERT_COMPANY_LOCATION]

\textbf{Re: [INSERT_ROLE_TITLE]}

%----------BODY----------
Dear Hiring Manager,

[PARAGRAPH 1: Hook -- 3-4 sentences. Names role + company. Leads with exit-story. One hero metric.]

[PARAGRAPH 2: Why I match -- 4-5 sentences. JD keyword echo. 2-3 approved proof points. \textbf{} on at least 2 high-priority JD keywords echoing the resume; the total across all paragraphs is 4-7 (see Phase 4).]

[PARAGRAPH 3: Why this company -- 3-4 sentences. Specific JD-supplied company detail. Why it matters to candidate.]

[PARAGRAPH 4: Close -- 2-3 sentences. Forward-looking action line.]

Sincerely,

Yash Anghan

\end{document}
    </latex_code>
  </base_latex_template>
```

(The two-space indentation of `<base_latex_template>` and `<latex_code>` matches the surrounding XML's existing indentation. Verify after the Edit — if indentation drifts, re-edit.)

- [ ] **Step 3: Update Phase 2, paragraph 4 closing-line spec**

Use the `Edit` tool. Inside the `<paragraph number="4" purpose="Close" sentences="2-3">` block:

`old_string`:
```
        <required>Sign-off line: Sincerely,\\ Yash Anghan</required>
```

`new_string`:
```
        <required>Sign-off: write `Sincerely,` then a blank-line paragraph break, then `Yash Anghan` on its own paragraph. Do NOT use `\\` line breaks -- the `\setlength{\parskip}{8pt}` preamble setting handles vertical spacing.</required>
```

- [ ] **Step 4: Update Phase 5 verification step on paragraph spacing**

Use the `Edit` tool. Inside the `<phase_5>` `<pre_output_validation>` block:

`old_string`:
```
      <step>Verify exactly 4 paragraphs separated by \par\vspace{6pt}.</step>
```

`new_string`:
```
      <step>Verify exactly 4 body paragraphs separated by blank lines. The global `\setlength{\parskip}{8pt}` preamble setting handles vertical spacing -- do NOT insert explicit `\par\vspace{...}` between paragraphs.</step>
```

(If the file's actual current text differs slightly — e.g., includes a more elaborate phrasing about ¶4 followed by `\par\vspace{12pt}` per the prior fix commit `588aeff` — adjust `old_string` to match what's in the file. The intent is to replace whatever exists about paragraph spacing with the new global-parskip-based wording.)

- [ ] **Step 5: Update Phase 5 verification step on closing line**

Use the `Edit` tool. Inside the same `<pre_output_validation>` block:

`old_string`:
```
      <step>Verify closing line is "Sincerely,\\ Yash Anghan" (with the exact \\ command).</step>
```

`new_string`:
```
      <step>Verify the closing is `Sincerely,` on its own line, followed by a blank line, followed by `Yash Anghan` on its own line. No `\\` line breaks anywhere in the body or closing.</step>
```

- [ ] **Step 6: Replace the `execution_command` step 7 with steps 7+8 (placeholder substitutions)**

Use the `Edit` tool. Inside the `<execution_command>` block:

`old_string`:
```
    <step number="7">Replace [INSERT_DATE_YYYY-MM-DD] in the LaTeX output with today's ISO date (e.g., 2026-05-08).</step>
```

`new_string`:
```
    <step number="7">Substitute the four template placeholders in the LaTeX output:
      - [INSERT_DATE_LONG] -> today's date as `Month DD, YYYY` with zero-padded day (e.g., `May 08, 2026`).
      - [INSERT_COMPANY_NAME] -> JD frontmatter `company` field verbatim.
      - [INSERT_COMPANY_LOCATION] -> JD frontmatter `location` field verbatim; if missing/null/empty, OMIT the location line entirely (do NOT leave the placeholder text or an empty line).
      - [INSERT_ROLE_TITLE] -> JD frontmatter `role` field verbatim.
    </step>
    <step number="8">Replace each [PARAGRAPH N: ...] placeholder in the LaTeX with the actual paragraph composed in Phase 2 (4 body paragraphs total).</step>
```

- [ ] **Step 7: Verify all four edits land**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career

# New template markers must be present:
grep -c "INSERT_DATE_LONG\|INSERT_COMPANY_NAME\|INSERT_COMPANY_LOCATION\|INSERT_ROLE_TITLE" cover-letter-system-based-on-jd-and-resume.md
# Expected: 6 matches (one each in template, four in execution_command — wait, count manually).
# More reliable check below:

grep -c "INSERT_DATE_LONG" cover-letter-system-based-on-jd-and-resume.md       # expect: 2
grep -c "INSERT_COMPANY_NAME" cover-letter-system-based-on-jd-and-resume.md    # expect: 2
grep -c "INSERT_COMPANY_LOCATION" cover-letter-system-based-on-jd-and-resume.md # expect: 2
grep -c "INSERT_ROLE_TITLE" cover-letter-system-based-on-jd-and-resume.md      # expect: 2

# Old template markers must be GONE:
grep -c "INSERT_DATE_YYYY-MM-DD" cover-letter-system-based-on-jd-and-resume.md  # expect: 0
grep -c "faGlobe\|Portfolio" cover-letter-system-based-on-jd-and-resume.md      # expect: 0
grep -c "\\\\par\\\\vspace{6pt}\|\\\\par\\\\vspace{12pt}" cover-letter-system-based-on-jd-and-resume.md  # expect: 0
grep -c "Sincerely,\\\\\\\\\\\\\\\\" cover-letter-system-based-on-jd-and-resume.md  # expect: 0 (matches `Sincerely,\\\\`)

# New preamble markers:
grep -c "parskip}{8pt}" cover-letter-system-based-on-jd-and-resume.md  # expect: 2 (preamble + Phase 2 ¶4 spec)
grep -c "noindent\\\\rule" cover-letter-system-based-on-jd-and-resume.md  # expect: 1
grep -c "fancyhdr\|multicol\|titlesec\|marvosym" cover-letter-system-based-on-jd-and-resume.md  # expect: 0 (those packages dropped)

# Structural sanity (unchanged):
grep -c "<phase_" cover-letter-system-based-on-jd-and-resume.md  # expect: 6
grep -c "<proof_point id=" cover-letter-system-based-on-jd-and-resume.md  # expect: 6
```

If any expected count is wrong, re-inspect the relevant Edit and fix.

- [ ] **Step 8: Commit**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
git add cover-letter-system-based-on-jd-and-resume.md
git commit -m "$(cat <<'EOF'
feat(cover-letter): swap LaTeX template + phase rule updates

Driven by user review of the LDS smoke-test PDF. The new template:
- leaner preamble (6 packages instead of 14)
- header drops portfolio link (Email + Phone + Linkedin + GitHub only)
- horizontal rule under header
- left-aligned date in `Month DD, YYYY` format
- recipient address block: Hiring Manager / Company / Location
- bold `Re: <role>` line
- global `\setlength{\parskip}{8pt}` for paragraph spacing
- `Sincerely,` then `Yash Anghan` on a new paragraph (no `\\`)

Three phase-rule updates keep the prompt's verification logic
consistent with the new template: Phase 2 ¶4 closing spec, Phase 5
spacing check, Phase 5 closing-line check. execution_command gains
step 8 for the four placeholder substitutions ([INSERT_DATE_LONG],
[INSERT_COMPANY_NAME], [INSERT_COMPANY_LOCATION], [INSERT_ROLE_TITLE])
and the [PARAGRAPH N: ...] expansions.

Spec: docs/superpowers/specs/2026-05-08-cover-letter-format-iteration.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Resume prompt portfolio-link removal

Single surgical edit. The user explicitly authorized this one edit in their turn despite the prior never-modify-resume-prompt hard rule. Strictly limited scope: drop the trailing `~` on the GitHub line and delete the entire Portfolio `\href{...}` line.

**Files:**
- Modify: `resume-optimization-system-based-on-job-description.md`

- [ ] **Step 1: Read the resume prompt's header block to confirm exact current text**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
grep -n "faLinkedin\|faGithub\|faGlobe" resume-optimization-system-based-on-job-description.md
```

Expected: three lines, one each for Linkedin, GitHub, Globe (Portfolio). Note the line numbers — they should be adjacent (e.g., 994, 995, 996) inside the embedded LaTeX template.

- [ ] **Step 2: Apply the surgical edit**

Use the `Edit` tool with EXACT current text as `old_string`. The current block (in the embedded LaTeX template, around line 994-996) reads:

`old_string`:
```
\href{https://www.linkedin.com/in/yash-aiautomation/}{\raisebox{-0.2\height}\faLinkedin\ \underline{Linkedin}} ~
\href{https://github.com/yash-ai-automation}{\raisebox{-0.2\height}\faGithub\ \underline{GitHub}} ~
\href{https://yash-anghan-ai-automatio-15hmplk.gamma.site/}{\raisebox{-0.2\height}\faGlobe\ \underline{Portfolio}}
```

`new_string`:
```
\href{https://www.linkedin.com/in/yash-aiautomation/}{\raisebox{-0.2\height}\faLinkedin\ \underline{Linkedin}} ~
\href{https://github.com/yash-ai-automation}{\raisebox{-0.2\height}\faGithub\ \underline{GitHub}}
```

Two changes in this single Edit call: (1) the trailing ` ~` after `GitHub}}` is gone, (2) the entire Portfolio line is gone.

**If the Edit fails because the existing text differs from the snippet above** (e.g., extra trailing whitespace), read the surrounding lines first with `Read` (offset around the line numbers from Step 1), then construct an `old_string` that matches the actual file content character-for-character.

- [ ] **Step 3: Verify the edit**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
grep -n "faGlobe\|Portfolio" resume-optimization-system-based-on-job-description.md
```

Expected: zero matches. If anything matches, the edit didn't fully land.

```bash
grep -n "faGithub" resume-optimization-system-based-on-job-description.md
```

Expected: one match (the GitHub icon line). Read that line and confirm it does NOT end with `~` (the trailing separator should be gone).

- [ ] **Step 4: Sanity-check no other resume prompt content changed**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
git diff resume-optimization-system-based-on-job-description.md | head -20
```

Expected diff: exactly two `-` lines (the Portfolio line + the GitHub line with trailing `~`) and one `+` line (the GitHub line WITHOUT trailing `~`). Total: three changed lines, no others. If the diff shows other changes, REVERT and redo the Edit more carefully.

- [ ] **Step 5: Commit**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
git add resume-optimization-system-based-on-job-description.md
git commit -m "$(cat <<'EOF'
feat(resume): remove portfolio link from V2.0 prompt header

Drops the `\href{...faGlobe...Portfolio}` icon row entry from the
embedded LaTeX template's header block, plus the trailing `~`
separator on the preceding GitHub line. Per user authorization in
the cover-letter-format-iteration design (2026-05-08), the prior
never-modify-resume-prompt hard rule is overridden for this single
surgical edit. No other resume prompt content is touched.

Already-shipped resume PDFs are NOT regenerated by this change. To
regenerate a previously-processed URL with the new (portfolio-free)
header, re-add the URL to data/pipeline.md and run the pipeline.

Spec: docs/superpowers/specs/2026-05-08-cover-letter-format-iteration.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Regression test gate

No code changed, but the unit tests should still pass as a baseline check. This is verification, not implementation — no commit.

**Files:** none.

- [ ] **Step 1: Run the full test suite**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
node --test tests/yash-resume-pipeline.test.mjs 2>&1 | tail -10
```

Expected output:
```
# tests 52
# pass 52
# fail 0
```

If any test fails, investigate before proceeding to Task 4. The prompt-file edits should not affect any code path the tests exercise — a failure here points to an accidental edit somewhere unexpected.

---

## Task 4: End-to-end smoke test on a fresh URL

Manual verification. Picks the next pending URL from the queue, runs the full per-URL loop with the updated prompts, eyeballs both PDFs.

**Files:** none modified by the test itself; the URL produces output artifacts in the normal output directories.

- [ ] **Step 1: Confirm there is a pending URL to test with**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
node yash-resume-pipeline.mjs next-pending
```

Expected: `{"status":"ok","url":"https://...","line_number":N}`. Note the URL.

If `status: empty`, either add a fresh test URL to `data/pipeline.md` `## Pendientes` section, or run the next part by re-pending an already-processed URL (move a `- [x] <url>` line to `- [ ] <url>` in `## Pendientes`).

- [ ] **Step 2: Run the per-URL loop end-to-end**

Follow `modes/yash-resume-pipeline.md` step-by-step for the URL from Step 1, invoking the new templates throughout. The orchestrator subcommands are unchanged — only the prompt outputs differ. Expected artifact paths (replace `<slug>` with the slugified company_role for the URL):

- `jds/JD_<slug>_Yash_Anghan_<date>.md`
- `resumes/<slug>_Yash_Anghan_Resume_<date>.pdf`
- `resume-logs/<slug>_Yash_Anghan_Resume_<date>.log`
- `cover-letters/<slug>_Yash_Anghan_Cover_Letter_<date>.pdf`
- `cover-letter-logs/<slug>_Yash_Anghan_Cover_Letter_<date>.log`

- [ ] **Step 3: Verify all 5 artifacts exist on disk**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
ls -la jds/JD_*<latest>*.md
ls -la resumes/*<latest>*.pdf
ls -la resume-logs/*<latest>*.log
ls -la cover-letters/*<latest>*.pdf
ls -la cover-letter-logs/*<latest>*.log
```

Expected: each ls returns one matching file. Replace `<latest>` with whatever portion of the slug uniquely identifies this run.

- [ ] **Step 4: Verify directory hygiene**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
ls cover-letters/ | grep -v '^\.gitkeep$' | grep -v '\.pdf$' || echo "OK: cover-letters/ is PDF-only"
ls resumes/      | grep -v '^\.gitkeep$' | grep -v '\.pdf$' || echo "OK: resumes/ is PDF-only"
```

Expected: both print "OK: ..." with no stray `.log` or `.tex` files.

- [ ] **Step 5: Verify pipeline.md and JSONL log fields**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
grep "CL ✅\|CL ❌" data/pipeline.md | tail -1
tail -1 data/yash-resume-runs.log | python3 -m json.tool
```

Expected: pipeline.md Procesadas line for the URL includes `CL ✅` (or `CL ❌` only if the cover-letter step failed). JSONL line includes `cover_letter_pdf`, `cover_letter_score`, `cover_letter_status`.

- [ ] **Step 6: Eyeball the resume PDF**

Open `resumes/<slug>_Yash_Anghan_Resume_<date>.pdf`. Confirm:

- Header has Email + Phone + Linkedin + GitHub icons only.
- **NO Portfolio icon, NO faGlobe link.**
- No stray `~` separator after the GitHub icon.
- Everything else (work experience, skills, education, certifications) matches the prior layout exactly.

If the resume PDF still shows the Portfolio link, Task 2's edit didn't land or the LLM applying the V2.0 prompt copied the old template from a stale source. Investigate.

- [ ] **Step 7: Eyeball the cover-letter PDF**

Open `cover-letters/<slug>_Yash_Anghan_Cover_Letter_<date>.pdf`. Confirm against the user's reference (`/yash-superClaudeHuman/projects/yash-ai-automation-career/cover-letter-logs/Ldsociety_..._Cover_Letter_2026-05-08.tex`):

- **Header:** Email + Phone + Linkedin + GitHub icons only. No Portfolio. No stray `~`.
- **Horizontal rule** below the header.
- **Date** left-aligned, in `Month DD, YYYY` format with zero-padded day (e.g., `May 08, 2026`). Today's date.
- **Recipient block:** `Hiring Manager` / company / location, each on its own line. If the JD's location was missing, the location line is correctly absent (no blank line, no placeholder text).
- **Bold `Re: <role>`** line.
- **Salutation:** `Dear Hiring Manager,` (always — never a named individual).
- **4 body paragraphs** separated by visible white space (the global `\parskip` rendering, not explicit `\vspace`).
- **`\textbf{}` keywords** in the body (4-7 across all paragraphs, at least 2 in paragraph 2).
- **Closing:** `Sincerely,` on its own line, then a paragraph break, then `Yash Anghan` on its own line. No `\\` line break.
- **One page total** — no overflow to a second page.

- [ ] **Step 8: No commit needed for the smoke test**

If everything checks out, stop here — the manual artifacts are produced by the pipeline run, not by this task. They land in the normal output directories and are gitignored.

If the smoke test surfaces a real bug (wrong layout, broken substitution, etc.), file a follow-up commit to fix it. Otherwise this task ends with no commit.

---

## Task 5: Push and update PR #4 description

Push the new commits to origin and append a "## Format iteration" section to the existing PR #4 description.

**Files:** none modified locally.

- [ ] **Step 1: Push the new commits**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
git push origin feat/cover-letter-pipeline 2>&1 | tail -5
```

Expected: `feat/cover-letter-pipeline` updated with new commits (the spec doc commit `01ebf9d` plus the Task 1 and Task 2 implementation commits).

- [ ] **Step 2: Read the current PR #4 description**

```bash
gh pr view 4 --repo yash-ai-automation/yash-ai-automation-career --json body --jq .body > /tmp/pr4-body.md
cat /tmp/pr4-body.md
```

This captures the current body so Step 3 can append rather than overwrite.

- [ ] **Step 3: Append a `## Format iteration` section**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career

cat /tmp/pr4-body.md > /tmp/pr4-body-new.md
cat >> /tmp/pr4-body-new.md <<'EOF'

---

## Format iteration (post-initial-review)

User review of the LDS cover-letter PDF surfaced two formatting changes:

- **Cover-letter LaTeX template overhauled** to match the user's reference layout: leaner preamble (6 packages instead of 14), no portfolio link, horizontal rule below header, left-aligned date in `Month DD, YYYY` format, `Hiring Manager` / company / location address block, bold `Re: <role>` line, global `\setlength{\parskip}{8pt}` for paragraph spacing, `Sincerely,` and `Yash Anghan` on separate paragraphs (no `\\`).
- **Portfolio link removed from the V2.0 resume prompt** as well (single surgical edit, user explicitly authorized despite the prior never-modify-resume-prompt hard rule).

Spec: `docs/superpowers/specs/2026-05-08-cover-letter-format-iteration.md`
Plan: `docs/superpowers/plans/2026-05-08-cover-letter-format-iteration.md`

All 52 unit tests still pass. Cover-letter prompt's verification phases updated to match the new template's spacing model (Phase 2 ¶4 closing, Phase 5 spacing check, Phase 5 closing-line check, execution_command placeholder substitutions).
EOF

gh pr edit 4 --repo yash-ai-automation/yash-ai-automation-career --body-file /tmp/pr4-body-new.md
```

Expected: `gh pr edit` returns success and prints the PR URL.

- [ ] **Step 4: Verify the PR description landed**

```bash
gh pr view 4 --repo yash-ai-automation/yash-ai-automation-career --json body --jq .body | tail -20
```

Expected output: the new "## Format iteration" section appears at the bottom of the PR description.

- [ ] **Step 5: No additional commit; the push is the deliverable**

The branch is pushed, PR #4 reflects the iteration. Nothing else to do.

---

## Self-Review

Spec coverage check:
- Spec §3 (files modified) — Tasks 1 (cover-letter prompt) and 2 (resume prompt) cover both files.
- Spec §4 (new cover-letter template) — Task 1 step 2 swaps the entire template with the exact reference content.
- Spec §5 (cover-letter prompt phase updates) — Task 1 steps 3, 4, 5, 6 cover Phase 2 ¶4, two Phase 5 verification steps, and execution_command respectively.
- Spec §6 (resume prompt portfolio-link removal) — Task 2 covers the surgical two-line edit.
- Spec §7 (branch & PR strategy) — Task 5 covers push + PR description update.
- Spec §8 (testing strategy) — Task 3 covers the regression gate (52 tests); Task 4 covers the manual e2e smoke test with both PDF eyeball checks.
- Spec §9 (risks & mitigations) — every risk has a corresponding verification step in Task 1 step 7 (template marker grep) or Task 4 (visual eyeball).

Type/path consistency check:
- All four placeholder names use the exact form `[INSERT_DATE_LONG]`, `[INSERT_COMPANY_NAME]`, `[INSERT_COMPANY_LOCATION]`, `[INSERT_ROLE_TITLE]` consistently across the template (Task 1 step 2), the execution_command rewrite (Task 1 step 6), the verification grep (Task 1 step 7), and the smoke-test checklist (Task 4 step 7).
- The new cover-letter template's preamble matches the user's reference verbatim (verified by counting absent old packages and present new ones).
- The resume edit's before/after snippets show the trailing `~` removal and Portfolio line deletion as a single atomic change (Task 2 step 2).

Placeholder scan: no TBDs, no "implement later", no vague "add appropriate handling." Every step includes the literal command, edit text, or expected output.
