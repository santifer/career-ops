# Cover Letter Pipeline — Design Spec

**Date:** 2026-05-08
**Status:** Approved (6/6 sections)
**Owner:** Yash Anghan
**Driver problem:** `/yash-resume-pipeline` produces a tailored resume PDF for each JD URL but stops there. Each application also needs a tailored one-page cover letter PDF. Today this is manual. The enhancement extends the existing pipeline to auto-generate a cover letter alongside every resume, with the same anti-hallucination discipline, scoring gate, and sidecar-log layout the resume side already uses.

---

## 1. Goal

Extend `/yash-resume-pipeline` so each per-URL run produces three deliverables instead of two:

- `jds/JD_<Company>_<Position>_Yash_Anghan_<date>.md` (existing)
- `resumes/<Company>_<Position>_Yash_Anghan_Resume_<date>.pdf` (existing)
- **`cover-letters/<Company>_<Position>_Yash_Anghan_Cover_Letter_<date>.pdf` (NEW)**

Plus the matching sidecar log under `cover-letter-logs/`.

The cover letter must:
- Be one page maximum.
- Use the same LaTeX preamble (fonts, header, FontAwesome icons, margins) as the resume PDF for visual continuity.
- Use `\textbf{}` to bold the JD's high-priority keywords (ATS).
- Echo at least 5 of the keywords already bolded in the tailored resume (narrative consistency).
- Pass a strict ≥90/100 quality gate or output a deficiency log + corrected LaTeX (parity with the resume's V2.0 prompt).
- Pull all metrics and proof points from `config/profile.yml.proof_points` and `cv.md` only — never invent.

## 2. Non-goals

- Modifying `resume-optimization-system-based-on-job-description.md` (hard rule).
- Modifying `generate-pdf-latex.mjs` (hard rule). It is prompt-agnostic and reused as-is.
- Modifying the existing `pipeline` or `auto-pipeline` modes (hard rule).
- Writing a separate `/yash-cover-letter-pipeline` slash command. The cover letter is always co-generated with the resume in the existing per-URL loop.
- Cover-letter-only regeneration (when a resume already exists). Out of scope; revisit if the need surfaces.
- Generating a cover letter when the resume step fails. The resume PDF is the prerequisite.

## 3. Architecture

### 3.1 New files

| Path | Purpose |
|------|---------|
| `cover-letter-system-based-on-jd-and-resume.md` | XML-format prompt mirroring V2.0's structure. Sibling of the resume prompt. |
| `cover-letters/.gitkeep` | Directory placeholder; PDFs only land here. |
| `cover-letter-logs/.gitkeep` | Directory placeholder; sidecar `.log` files only land here. |
| `tests/fixtures/cover-letter-good.tex` | Compile-positive fixture for unit tests. |
| `tests/fixtures/cover-letter-bad.tex` | Compile-negative fixture (missing `\end{document}`) for failure-path test. |

### 3.2 Modified files

| Path | Change |
|------|--------|
| `yash-resume-pipeline.mjs` | New `compile-cover-letter` subcommand. Extended `mark-processed`, `log`, and `check-duplicate` subcommands. New helper functions for cover-letter paths. |
| `modes/yash-resume-pipeline.md` | Per-URL loop gains steps 9b–12b (apply prompt, write `.tex`, compile PDF, write sidecar log). Step 11 extended with cover-letter args. |
| `.gitignore` | `cover-letters/*` and `cover-letter-logs/*` rules mirroring `resumes/` and `resume-logs/` (with `!*/.gitkeep` exceptions). |
| `tests/yash-resume-pipeline.test.mjs` (or sibling new file) | Unit tests for path helpers, compile subcommand, mark-processed/log extensions. |

### 3.3 Untouched (hard rules)

- `resume-optimization-system-based-on-job-description.md` — never modified.
- `generate-pdf-latex.mjs` — never modified. Reused for cover-letter compilation; it just compiles whatever `.tex` is handed to it.
- `modes/pipeline.md` and `modes/auto-pipeline.md` — never modified.

### 3.4 File layout per URL

```
jds/JD_<Company>_<Position>_Yash_Anghan_<date>.md
resumes/<Company>_<Position>_Yash_Anghan_Resume_<date>.pdf
resume-logs/<Company>_<Position>_Yash_Anghan_Resume_<date>.log
cover-letters/<Company>_<Position>_Yash_Anghan_Cover_Letter_<date>.pdf       (NEW)
cover-letter-logs/<Company>_<Position>_Yash_Anghan_Cover_Letter_<date>.log    (NEW)
/tmp/<Company>_<Position>_Yash_Anghan_Cover_Letter_<date>.tex                 (transient)
```

`cover-letters/` holds **only** PDFs. `cover-letter-logs/` holds **only** sidecar metadata. Same discipline as `resumes/` ↔ `resume-logs/`.

## 4. Cover-letter prompt structure

`cover-letter-system-based-on-jd-and-resume.md` mirrors the V2.0 XML format. ~700 lines, parallel rigor.

### 4.1 Inputs

The prompt is applied in-context with two attachments:
- The JD body markdown (from `jds/JD_<…>_<date>.md`, written in step 6 of the loop).
- The just-generated tailored resume LaTeX (from `/tmp/<…>_Resume_<date>.tex`, written in step 8 of the loop).

The resume LaTeX is the source of the **resume keyword echo set** — the keywords already bolded with `\textbf{}` for this JD. The cover letter must echo ≥5 of them.

### 4.2 Phases

| Phase | Purpose |
|-------|---------|
| 1 | JD analysis & integrity check. Extract company name, role title, hiring problem, high-priority keywords. Build resume keyword echo set. |
| 2 | Locked 4-paragraph skeleton (Hook / Why I match / Why this company / Close) with sentence count 12–16 total. |
| 3 | Proof-point allocation rules — locked list of 6 hero metrics; archetype-driven mapping. |
| 4 | Keyword injection & ATS optimization. `\textbf{}` for 4–7 high-priority keywords; LaTeX escapes. |
| 5 | Constraint verification. Sentence count, paragraph count, proof-point provenance, keyword echo, page-1 limit. |
| 6 | Quality scoring & output rules (rubric below). |

### 4.3 Locked 4-paragraph skeleton

| ¶ | Purpose | Length | Required content |
|---|---------|--------|------------------|
| 1 | Hook | 3–4 sentences | Names role + company. Leads with exit-story (Bell + Morningstar enterprise → AI automation). One quantified hero metric. |
| 2 | Why I match | 4–5 sentences | Direct keyword/responsibility echo from JD. 2–3 proof points from the locked list, mapped to JD requirements. JD keywords wrapped in `\textbf{}`. |
| 3 | Why this company | 3–4 sentences | Acknowledges a specific company detail from the JD (mission, product, scale, regulated domain). States why that detail matters. No generic culture fluff. |
| 4 | Close | 2–3 sentences | Forward-looking action line. Sign-off `Sincerely,\\\\ Yash Anghan`. |

Total: **12–16 sentences**. Hard-fails outside that band (`PARAGRAPH_COUNT_ERROR`).

### 4.4 Locked proof points (anti-hallucination)

Sourced verbatim from `config/profile.yml.proof_points`:

1. **AI Document Processing Pipeline** — Morningstar — 65% manual review reduction, 12K monthly fund documents.
2. **GenAI Classification System** — Morningstar — 94% accuracy via embeddings + vector similarity.
3. **RAG Pipeline for Document Processing** — Morningstar — 15K+ documents, 75% extraction time reduction.
4. **Client Onboarding Automation** — freelance Make.com — 520+ hours saved annually.
5. **E-commerce Automation** — freelance N8N — $43K/year operational cost cut.
6. **AI Lead Qualification System** — freelance GPT-4 — 65% sales productivity gain.

**Allocation by archetype:**

| If JD archetype is… | ¶2 picks proof points… |
|---|---|
| AI / LLM / GenAI Engineer | #1, #2, #3 |
| AI Automation Engineer | #4, #5, #6 |
| ML Engineer | #2, #3, plus AWS inference detail from `cv.md` Morningstar |
| Full-stack / AI Software Engineer | #1, plus enterprise-engineering detail from Bell/Virtusa |
| Other / fallback | exit-story narrative + #1 |

Inventing a proof point is a hard-fail (`PROOF_POINT_VIOLATION`).

### 4.5 Scoring rubric (≥90/100 to ship LaTeX-only)

| Criterion | Max | Components |
|---|---|---|
| Constraint Adherence | 30 | 12 (4 paragraphs present) · 10 (sentence count 12–16) · 8 (all proof points from approved list) |
| Content Relevance | 25 | 5 pts × 5 high-priority JD keywords (max 25) |
| ATS Compatibility | 20 | 5 (header+contact) · 5 (salutation) · 5 (body 4 paragraphs) · 5 (closing+signature) |
| Contextual Authenticity | 15 | 5 (hook ties to exit-story) · 5 (¶3 references specific company detail) · 5 (no generic fluff) |
| Technical Accuracy | 10 | 5 (LaTeX escapes correct) · 5 (`\textbf{}` properly opened/closed) |

### 4.6 Output rules priority hierarchy

1. `PARAGRAPH_COUNT_ERROR` (hard-fail, no LaTeX).
2. `PROOF_POINT_VIOLATION` (invented metric — hard-fail, no LaTeX).
3. `CONTEXTUALIZATION_DEFICIENCY` (correct + emit corrected LaTeX).
4. Score < 90 (correct + emit with deficiency log).
5. Score ≥ 90 (LaTeX only, no commentary).

### 4.7 LaTeX template

Embedded in the prompt. Same preamble as the resume template (Computer Modern via tectonic + FontAwesome5; same margins; `\input{glyphtounicode}` and `\pdfgentounicode=1` wrapped in `\ifdefined\pdfgentounicode…\fi` per the tectonic patch already applied to the resume side).

Header: same `\Huge \scshape Yash Anghan` block with the same icon row (faEnvelope, faPhone, faLinkedin, faGithub, faGlobe).

Below the header:
- `\hfill <Date>` right-aligned.
- Salutation: **always `Dear Hiring Manager,`**, never a named individual. Even when a JD lists a recruiter or hiring lead, the prompt does not address them by name — mis-attribution risk (recruiter vs. hiring manager vs. team lead) is higher than the marginal warmth of using a name.
- 4 body paragraphs separated by `\par\vspace{6pt}` (no `\section` headings — cover letters don't use them).
- `Sincerely,\\\\ Yash Anghan` flush left.

## 5. Per-URL loop changes (`modes/yash-resume-pipeline.md`)

Inserted after step 10 (resume sidecar log), before step 11 (mark processed):

```
9b. Apply the cover-letter prompt:
    - Read cover-letter-system-based-on-jd-and-resume.md
    - Apply in-context to the JD body (from step 6) and the resume LaTeX
      (from step 8, still in /tmp).
    - Parse output: find first \documentclass.
      - Hard-fails (PARAGRAPH_COUNT_ERROR, PROOF_POINT_VIOLATION) → no LaTeX.
        Skip 10b–11b. Write sidecar log with status: failed and full output.
        Print warning. URL still marked processed at step 11.
      - LaTeX present → continue.

10b. Write cover-letter .tex to /tmp/<…>_Cover_Letter_<date>.tex
     (NEVER to repo, mirroring no-tex-on-disk discipline).

11b. Compile cover letter:
       node yash-resume-pipeline.mjs compile-cover-letter \
            --tex /tmp/<…>_Cover_Letter_<date>.tex \
            --pdf cover-letters/<…>_Cover_Letter_<date>.pdf

     On status: fail (tectonic crash):
       - Skip 12b PDF write. Sidecar log records tectonic_log_tail and
         status: failed. Stray-.log cleanup runs on both success and failure
         paths (parity with compile-resume).
       - Print warning. URL still marked processed at step 11.

12b. Write cover-letter sidecar log → cover-letter-logs/<…>_Cover_Letter_<date>.log
     Contents:
       score: <X>/100
       deficiencies: <text before \documentclass; or "none">
       status: compiled | compiled-review-recommended | failed
       resume_keywords_echoed: <count>
```

Step 11 (mark-processed) and step 12 (final report) extended with cover-letter args; step 13 (continue prompt) unchanged.

## 6. Orchestrator changes (`yash-resume-pipeline.mjs`)

### 6.1 New subcommand: `compile-cover-letter`

Body identical to `compile-resume`'s shape: resolves paths, ensures output directory, calls `generate-pdf-latex.mjs`, runs the stray-`.log` cleanup on both success and failure paths.

### 6.2 Extended subcommand: `mark-processed`

New optional args:
- `--cover-letter <pdf-path>`
- `--cover-letter-status <ok|fail>`

If both provided, the `## Procesados` line includes `cl:<path>` and `cl-status:<status>` suffixes. If omitted, line shape is unchanged (backward compatible).

### 6.3 Extended subcommand: `log`

JSONL line in `data/yash-resume-runs.log` gains optional fields:
- `cover_letter_pdf`
- `cover_letter_score`
- `cover_letter_status`

Old entries without these fields remain valid. Additive only.

### 6.4 Extended subcommand: `check-duplicate`

Returns `cover_letter_exists: true|false` alongside the existing JD/resume duplicate check. The dedup *gate* (which marks the URL skipped) still triggers only on JD+resume duplicates — cover-letter-alone is not a gate.

### 6.5 New helper functions

- `buildCoverLetterTexPath(slug, date)` → `/tmp/<slug>_Cover_Letter_<date>.tex`
- `buildCoverLetterPdfPath(slug, date)` → `cover-letters/<slug>_Cover_Letter_<date>.pdf`
- `buildCoverLetterLogPath(slug, date)` → `cover-letter-logs/<slug>_Cover_Letter_<date>.log`

## 7. Error handling matrix

| Step | Failure | Action | URL state | Resume PDF | CL PDF | Sidecar log |
|------|--------|--------|-----------|------------|--------|-------------|
| 9b | `PARAGRAPH_COUNT_ERROR` / `PROOF_POINT_VIOLATION` (no `\documentclass` in output) | Skip 10b–11b. Sidecar log status `failed` + full prompt output. Warning printed. | **processed** | kept | absent | written |
| 9b | Score < 90, LaTeX present | Use corrected LaTeX. Sidecar status `compiled-review-recommended`. | **processed** | kept | written | written w/ deficiencies |
| 11b | Tectonic compile fail | Skip PDF write. JSONL `cover_letter_status: fail` + `tectonic_log_tail`. Sidecar status `failed`. Stray-`.log` cleanup runs. Warning printed. | **processed** | kept | absent | written w/ tectonic tail |
| 11b | Compile OK, suspicious PDF (<5KB or >1 page per tectonic page-count parse) | Sidecar status `compiled-review-recommended`. Warning printed. | **processed** | kept | written | written w/ review flag |

3-consecutive-failures backoff applies only to the resume step. Cover-letter failures don't count.

## 8. Idempotency

A URL with both JD `.md` and resume `.pdf` already on disk hits the existing dedup gate at step 5 and is marked skipped — cover-letter regeneration is not attempted. Cover-letter-only regeneration would need a new command/flag and is out of scope.

## 9. Testing strategy

### 9.1 Unit tests (Node test runner, no LLM calls)

| Test | Pin |
|------|-----|
| `buildCoverLetterTexPath` | `/tmp/<slug>_Cover_Letter_<date>.tex` |
| `buildCoverLetterPdfPath` | `cover-letters/<slug>_Cover_Letter_<date>.pdf` |
| `buildCoverLetterLogPath` | `cover-letter-logs/<slug>_Cover_Letter_<date>.log` |
| `compile-cover-letter` (good fixture) | PDF written, `status: ok`, no stray `.log` in `cover-letters/` |
| `compile-cover-letter` (bad fixture) | `status: fail`, no PDF, no stray `.log` in `cover-letters/` |
| `mark-processed --cover-letter --cover-letter-status` | Procesados line gets `cl:` and `cl-status:` suffixes |
| `mark-processed` without CL args | Procesados line shape unchanged (backward compat) |
| `log --cover-letter --cover-letter-score --cover-letter-status` | JSONL line includes the three new fields |
| `log` without CL args | JSONL line lacks those keys (backward compat) |
| `check-duplicate` | Reports `cover_letter_exists: true|false` |

### 9.2 Fixture compile tests

- `tests/fixtures/cover-letter-good.tex` — minimal valid 4-paragraph letter using the locked template; expected to compile cleanly.
- `tests/fixtures/cover-letter-bad.tex` — same but missing `\end{document}`; expected to crash tectonic and trigger the stray-`.log` cleanup.

### 9.3 End-to-end smoke test (manual)

1. Reset the `League Inc.` URL to `## Pendientes` in `data/pipeline.md`.
2. Run `/yash-resume-pipeline`. Confirm:
   - `jds/JD_LeagueInc_…_2026-05-08.md` written.
   - `resumes/LeagueInc_…_Resume_2026-05-08.pdf` written.
   - `cover-letters/LeagueInc_…_Cover_Letter_2026-05-08.pdf` written.
   - `cover-letter-logs/LeagueInc_…_Cover_Letter_2026-05-08.log` written with score.
   - No stray `.log` in either `resumes/` or `cover-letters/`.
   - `data/pipeline.md` URL moved to `## Procesados` with `cl:` and `cl-status:` suffixes.
   - `data/yash-resume-runs.log` JSONL line includes `cover_letter_*` fields.
3. Eyeball the cover-letter PDF: same fonts as resume, 4 paragraphs, `\textbf{}` keywords echo the resume's bolds, exactly one page.
4. Negative test: temporarily corrupt the cover-letter prompt to force `PARAGRAPH_COUNT_ERROR`. Rerun. Confirm:
   - Resume PDF still written.
   - Cover-letter PDF absent.
   - `cover-letter-logs/<…>.log` records `status: failed`.
   - URL marked processed (with warning), not failed.

## 10. Out of scope

- A standalone `/yash-cover-letter-pipeline` slash command.
- Cover-letter-only regeneration when the resume already exists.
- Multilingual cover letters (de/fr/ja). Existing English-only flow is the baseline.
- Generating cover letters for portal scans that haven't been added to `data/pipeline.md`.
- Visual differences from the resume (e.g., color accents, alternative fonts). Visual continuity is a hard requirement.

## 11. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Cover letter drifts from the resume's narrative framing | Prompt requires echoing ≥5 keywords already bolded in the resume LaTeX. |
| LLM invents metrics | Locked `<approved_proof_points>` block + `PROOF_POINT_VIOLATION` hard-fail. |
| Cover letter exceeds one page after compile | Phase 5 verification + `compiled-review-recommended` flag if tectonic page-count parse > 1. |
| Tectonic stray `.log` lands in `cover-letters/` (today's resume bug) | `compile-cover-letter` runs the same `unlink()` cleanup on both success and failure paths. |
| Cover-letter failure blocks queue progress | Failure-mode matrix: URL still marked processed; only the resume step counts toward 3-consecutive-failures backoff. |
| Future upstream change to `generate-pdf-latex.mjs` | The compile subcommand depends only on the script's CLI interface (`<input> <output>` args). Internal changes to the script don't break the cover-letter flow. |
