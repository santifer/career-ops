# Shivani Resume Pipeline — V3.1 Identity Pivot Design

**Date:** 2026-05-20
**Status:** Approved — ready for implementation plan
**Supersedes:** [docs/superpowers/specs/2026-05-10-shivani-resume-pipeline-design.md](2026-05-10-shivani-resume-pipeline-design.md)
**Locked-prompt source:** `V3-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md` (V3.1, read-only)

---

## 1. Goal

Adopt `V3-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md` (VERSION 3.1, "REFACTORED FOR CIBC / HCLTECH / ACCENTURE (BANKING & FINANCIAL SERVICES)") as the canonical resume-generation prompt for the Shivani pipeline. The V3 prompt locks an entirely different professional identity than the existing cv-shivani.md, and the user has confirmed V3 is the new truth. This work:

1. Restructures `cv-shivani.md` to mirror V3's locked LaTeX template exactly (CIBC / HCLTech / Accenture employers, Full Stack Java Developer positioning, Banking & Financial Services domain, new contact details, V3-locked certifications).
2. Rewrites `shivani-cover-letter-system.md` from V1.0 to V3.1 with full harmonization to V3's XML+Markdown framework (`<phase id="N">`, binary verification system, output rules, constraint priority order).
3. Rewires all V2 path references to V3 across modes, AGENTS.md, .claude/, and .opencode/.
4. Adds superseded-by headers to the May 10 V2-era design + plan docs.
5. Executes one end-to-end live run on the next pending URL in `data/shivani-pipeline.md` to validate the full chain.

Validators (`tools/validate_bullets.py`, `tools/validate_skills.py`) and the pipeline driver (`shivani-resume-pipeline.mjs`) are left untouched — the Shivani pipeline doesn't call the validators, and the driver is prompt-agnostic.

---

## 2. Identity pivot — user-confirmed

The user has explicitly confirmed that V3's CIBC / HCLTech / Accenture work history (with new contact details and V3-listed certifications) is real, user-confirmed history — not invention. cv-shivani.md will be rewritten as the canonical source of truth for the new identity.

| Field | V3 (new canonical) | cv-shivani.md (replaced) |
|-------|--------------------|--------------------------|
| Positioning | Full Stack Java Developer / Software Engineer | Azure Data Engineer |
| Employer 1 | CIBC / Software Engineer / Toronto, ON / Feb 2024 – Present | Metro Inc. / Azure Data Engineer / Montreal, QC / Feb 2024 – Present |
| Employer 2 | HCLTech / Full Stack Java Developer / Ahmedabad, India / Aug 2022 – Nov 2023 | Adani Enterprises / Data Engineer / Ahmedabad, India / Jan 2023 – Dec 2023 |
| Employer 3 | Accenture / Java Developer / Bengaluru, India / Feb 2021 – Jul 2022 | Maveric Systems / Data Analyst / Pune, India / June 2021 – Dec 2022 |
| Email | shivanianghan11@gmail.com | shivanianghan98@gmail.com |
| Phone | +1 (647) 249-4955 | +1 (647) 556-8985 |
| LinkedIn | linkedin.com/in/shivani-swe-ll | linkedin.com/in/shivanianghan |
| GitHub | github.com/shivani-swe-ll | github.com/shivani-anghan |
| Certifications | AWS SAA (Jun 2025), Databricks DE (Feb 2026), DP-900 (Jan 2026), AZ-900 (Dec 2025) | Databricks DE (Aug 2025), DP-700 (May 2025), DP-900 (Jan 2025), AZ-900 (Dec 2024) |
| Domain | Banking & Financial Services | Retail / Infrastructure / Banking analytics |

Education unchanged: Gujarat Technological University | BE IT | Sept 2016 – May 2020.

---

## 3. cv-shivani.md restructure — 1:1 V3 mirror

cv-shivani.md becomes a faithful textual mirror of V3's locked LaTeX template inputs.

### 3.1 Sections (top to bottom)

1. **Title line:** `# Shivani Anghan`
2. **Contact row:** Email | Phone | LinkedIn | GitHub | Portfolio (if any) | Location
3. **Summary** (~3 sentences, Full Stack Java Banking positioning, qualitative outcomes, no false-precision metrics)
4. **Work Experience** (three sub-headings, in V3's locked order)
5. **Technical Skills** (nine named categories matching V3's locked template)
6. **Education** (one entry)
7. **Certifications** (four entries, V3-locked dates)

No Projects section in the canonical cv-shivani.md (V3 doesn't consume one; resume generation works directly from Work Experience sentences). If the user wants a portfolio section later, it can live elsewhere.

### 3.2 Work Experience — narrative shape

Each role gets one short narrative paragraph (1–2 sentences) describing scope + a small bullet list (3–4 bullets) of typical responsibilities and qualitative outcomes. The 15 generated sentences (CIBC=6, HCLTech=5, Accenture=4) are produced per-JD by V3 at runtime — the CV holds context, not pre-written sentences.

Each role narrative includes:
- Banking domain context (retail banking / core banking modernization / banking modules — per company per V3's `<contextual_transformation_examples>`)
- Tech stack the role used (Java, Spring Boot, microservices, REST APIs, SQL, etc.)
- Qualitative outcome language (`significantly`, `substantially`, `measurably`, `meaningfully` — V3's locked vocabulary)
- For CIBC only: explicit AI coding assistant context (Copilot / Claude Code / Cursor) — per V3's "AI Coding Assistant Placement" rule (CIBC only).

### 3.3 Technical Skills — nine categories with caps

cv-shivani.md lists exactly nine categories with content within V3's per-category char caps. Skills sourced from:
- V3's `<contextual_transformation_examples>` (Spring Boot, Microservices, RESTful APIs, SQL, Hibernate, Oracle, Docker, Kubernetes, Apache Kafka, React, Angular, OAuth 2.0, AI Coding Assistant, Agile)
- V3's `<universal_keyword_contexts>` (universal fallback keywords)
- Core full-stack Java banking stack (JUnit, Mockito, JPA, Maven, Gradle, etc.)

| Category | V3 cap | Source content |
|----------|--------|----------------|
| Languages & Frameworks | 97 | Java, Spring Boot, Spring MVC, Spring Security, JPA, JUnit |
| Backend Technologies | 105 | Microservices, REST APIs, SOAP, Hibernate, OAuth 2.0, Apache Kafka, JMS |
| Frontend Technologies | 94 | Angular, React, TypeScript, JavaScript, HTML5, CSS3, Bootstrap |
| Cloud Platforms | 106 | AWS (EC2, S3, RDS, Lambda), Azure (App Service, AKS, Functions), GCP |
| DevOps & Tools | 96 | Docker, Kubernetes, Jenkins, GitHub Actions, Maven, Gradle, Git |
| Testing Frameworks | 88 | JUnit, Mockito, Selenium, Cucumber, Postman, REST Assured |
| Database & Methodologies | 101 | Oracle, PostgreSQL, MySQL, MongoDB, Agile, Scrum, TDD, CI/CD |
| AI & ML tools | 88 | Claude Code, GitHub Copilot, Cursor, ChatGPT, LangChain (basic) |
| Other Technologies | 101 | Linux, Bash, JIRA, Confluence, ServiceNow, Splunk |

Exact content TBD during write — must measure each category's length and trim to cap before commit. Validator (`validate_skills.py`) is not used in Shivani pipeline so caps live only in cv-shivani.md and the V3 prompt's binary verification.

### 3.4 Education

Single entry, unchanged from current cv-shivani.md:
- Gujarat Technological University | Gujarat, India
- Bachelor of Engineering in Information Technology | Sept 2016 – May 2020

### 3.5 Certifications

V3's locked list verbatim, in V3's order:
1. AWS Certified Solutions Architect – Associate — June 2025
2. Databricks Certified Data Engineer Associate — February 2026
3. Microsoft Certified: Azure Data Fundamentals (DP-900) — January 2026
4. Microsoft Certified: Azure Fundamentals (AZ-900) — December 2025

Current cv-shivani.md's DP-700 cert + earlier dates are replaced. (User confirmed V3 = new truth.)

---

## 4. Cover letter system — V3.1 full harmonization

`shivani-cover-letter-system.md` gets a complete rewrite. Title becomes "Cover Letter Optimization System V3.1 — Shivani Anghan (Full Stack Java Developer, Banking & Financial Services)". Sibling-of pointer updates to `V3-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md`.

### 4.1 Structural mirror of V3

XML+Markdown with:
- `<cover_letter_optimization_system>` root
- `<metadata>` block (title, version 3.1, sibling_of, revision_notes)
- `<primary_directive>` (what to do when JD + tailored resume LaTeX are provided)
- `<phase id="0.5">` — JD quality assessment (Full Stack Java / Banking domain detection)
- `<phase id="1">` — JD analysis + resume_keyword_echo_set extraction + archetype detection
- `<phase id="2">` — Locked 4-paragraph skeleton (12–16 sentences total)
- `<phase id="3">` — Locked proof points P1–P6 + archetype allocation rules
- `<phase id="3B">` — JD-keyword to banking-context mapping (parallels V3's contextual transformation)
- `<phase id="4">` — Keyword injection (`\textbf{}` 4–7), LaTeX escape rules
- `<phase id="5">` — Binary verification system (PASS/FAIL gates)
- `<phase id="6">` — LaTeX syntax validation
- `<phase id="7">` — Output rules with constraint priority order
- `<constraint_priority_order>` — explicit priority hierarchy
- `<final_deliverable_standards>`
- `<execution_command>` (numbered steps)
- `<base_latex_template>` — preamble matches V3's preamble for visual continuity

### 4.2 Archetypes (replaces V1.0's Azure DE list)

- **Software Engineer (Banking)** — CIBC anchor. Signals: AI coding assistant keywords, modern microservices, full-stack, retail banking domain.
- **Full Stack Java Banking Modernization** — HCLTech anchor. Signals: core banking modernization, monolith-to-microservices, Hibernate/JPA, Angular/React.
- **Java Foundational Banking** — Accenture anchor. Signals: Core Java, Spring, SQL/PL-SQL, batch jobs, banking modules (loan/account/statement).
- **Other / Fallback** — none of the above dominates.

### 4.3 Locked proof points P1–P6 (drafted by primary session, qualitative only)

Banking-domain qualitative proof points. No false-precision metrics — V3's metric honesty rule applies. Drafted from V3's `<contextual_transformation_examples>` + the new cv-shivani.md. User reviews before lock-in.

Working draft (subject to refinement during writing-plans phase):

| ID | Name | Context | Qualitative outcome | Archetypes |
|----|------|---------|---------------------|-----------|
| P1 | Retail banking microservices delivery | CIBC | Substantially improved digital banking platform stability | Software Engineer Banking, fallback |
| P2 | Core banking modernization | HCLTech | Measurably reduced legacy banking system reliance | Full Stack Java Banking Modernization |
| P3 | Banking module backend services | Accenture | Significantly improved code quality + delivery cadence | Java Foundational Banking |
| P4 | AI-assisted development workflow | CIBC | Meaningfully accelerated boilerplate + test generation cycles | Software Engineer Banking (CIBC only) |
| P5 | Full-stack feature delivery (Angular/React + Spring Boot) | CIBC / HCLTech | Substantially improved channel-side feature velocity | Software Engineer Banking, Full Stack Java Banking Modernization |
| P6 | PL/SQL + Hibernate persistence work | Accenture / HCLTech | Measurably improved transactional banking data layer reliability | Java Foundational Banking, Full Stack Java Banking Modernization |

P4 is restricted to CIBC per V3's "AI Coding Assistant Placement" rule.

### 4.4 Skeleton (matches V1.0 shape — preserved choice)

- Paragraph 1 — Hook (3–4 sentences): names role + company explicitly in first sentence; leads with Full Stack Java background in Banking & Financial Services; one qualitative hero outcome from locked proof points; no boilerplate openers.
- Paragraph 2 — Why I match (4–5 sentences): direct JD keyword echo; 2–3 proof points mapped to JD requirements; at least 2 high-priority JD keywords wrapped in `\textbf{}`.
- Paragraph 3 — Why this company (3–4 sentences): references one specific JD-supplied company detail; why it matters to candidate's trajectory; no generic culture fluff.
- Paragraph 4 — Close (2–3 sentences): forward-looking action line; `Sincerely,` then blank paragraph break then `Shivani Anghan`.

Total: 12–16 sentences. Outside this band → `PARAGRAPH_COUNT_ERROR` (hard fail, no LaTeX).

### 4.5 Binary verification system

Each check returns PASS / FAIL. Inspired by V3's `<binary_verification_system>`.

| Check | Method | Pass criteria | On fail |
|-------|--------|---------------|---------|
| Paragraph count | Count `\n\n`-separated body paragraphs | Exactly 4 | `PARAGRAPH_COUNT_ERROR` (HALT, no LaTeX) |
| Sentence band | Count sentences across 4 paragraphs | 12 ≤ N ≤ 16 | `PARAGRAPH_COUNT_ERROR` (HALT, no LaTeX) |
| Bolded JD keyword count | Count `\textbf{}` occurrences in body | 4 ≤ N ≤ 7 | Deficiency report + corrected LaTeX |
| Resume keyword echo | Count of resume `\textbf{}` keywords that appear in cover letter (bolded or unbolded) | ≥5 | -10 score deduction (Content Relevance) |
| Proof point invention check | Every metric/claim traces to P1–P6 or cv-shivani.md verbatim | Zero inventions | `PROOF_POINT_VIOLATION` (HALT, no LaTeX) |
| Banking domain vocabulary | Each of paragraphs 1, 2, 3 contains ≥1 banking term (retail banking, payments, core banking, modernization, etc.) | ≥3 of 4 paragraphs contain banking vocabulary | `CONTEXTUALIZATION_DEFICIENCY` |
| LaTeX brace match | Count `{` vs `}` | Equal | Deficiency report + corrected LaTeX |
| Special character escaping | Scan body for unescaped `# & % $ _` | Zero unescaped | Deficiency report + corrected LaTeX |
| Environment closure | Each `\begin{X}` has matching `\end{X}` | All balanced | Deficiency report + corrected LaTeX |
| No Unicode special chars | Scan for `✓ • → ★ © ® ™` and emoji | Zero hits | Deficiency report + corrected LaTeX |
| Closing format | "Sincerely,\n\nShivani Anghan" with no `\\` line breaks | Exact match | Deficiency report + corrected LaTeX |

### 4.6 Output rules (priority order)

1. `PARAGRAPH_COUNT_ERROR` — STOP, no LaTeX output
2. `PROOF_POINT_VIOLATION` — STOP, no LaTeX output
3. `CHARACTER_LIMIT_EXCEEDED` (if any cover letter content somehow exceeds resume-style caps — unlikely for cover letters but included for symmetry with V3)
4. `CONTEXTUALIZATION_DEFICIENCY` — correct then output with deficiency log
5. Score < 90 (no STOP condition) — correct then output with deficiency log
6. Score ≥ 90 + all checks PASS — output LaTeX only

### 4.7 Scoring rubric (100 points)

Identical shape to V1.0:
- Constraint Adherence: 30
  - Exactly 4 paragraphs: 12
  - Total sentence count 12–16: 10
  - All proof points from approved list: 8
- Content Relevance: 25
  - 5 points per high-priority JD keyword wrapped in `\textbf{}` or echoed (cap at 5 keywords)
  - -10 deduction if resume_keyword_echo_set overlap < 5
- ATS Compatibility: 20
  - Header + contact row: 5
  - Salutation: 5
  - 4-paragraph body: 5
  - Closing + signature: 5
- Contextual Authenticity: 15
  - Hook ties to Full Stack Java Banking background: 5
  - Paragraph 3 references a specific JD-supplied company detail: 5
  - No generic culture fluff: 5
- Technical Accuracy: 10
  - All LaTeX special characters escaped: 5
  - All `\textbf{}` commands properly closed + braces balanced: 5

Threshold: ≥90/100 to ship LaTeX-only.

### 4.8 LaTeX base template

Preamble matches V3 for visual continuity:

```latex
\documentclass[11pt,letterpaper]{article}
\usepackage[empty]{fullpage}
\usepackage[hidelinks]{hyperref}
\usepackage[english]{babel}
\usepackage{fontawesome5}
\usepackage{xcolor}

\addtolength{\oddsidemargin}{-0.7in}
\addtolength{\evensidemargin}{-0.7in}
\addtolength{\textwidth}{1.4in}
\addtolength{\topmargin}{-0.8in}
\addtolength{\textheight}{1.6in}

\pagestyle{empty}
\raggedright
\setlength{\parindent}{0pt}
\setlength{\parskip}{8pt}

\begin{document}

%----------HEADING----------
\begin{center}
{\Huge \scshape Shivani Anghan} \\ \vspace{2pt}
\small \raisebox{-0.1\height}\faEnvelope\ \href{mailto:shivanianghan11@gmail.com}{shivanianghan11@gmail.com} ~
\raisebox{-0.1\height}\faPhone\ +1 (647) 249-4955 ~
\href{https://www.linkedin.com/in/shivani-swe-ll/}{\raisebox{-0.2\height}\faLinkedin\ \underline{Linkedin}} ~
\href{https://github.com/shivani-swe-ll}{\raisebox{-0.2\height}\faGithub\ \underline{GitHub}} ~
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

[PARAGRAPH 1]
[PARAGRAPH 2]
[PARAGRAPH 3]
[PARAGRAPH 4]

Sincerely,

Shivani Anghan

\end{document}
```

Margin adjustments match V3 (`-0.7in / +1.4in / -0.8in / +1.6in`). Note: this preamble does NOT use `\input{glyphtounicode}` or `\pdfgentounicode` (Tectonic-safe). No XeTeX patch needed for cover letter.

### 4.9 Placeholder substitution at runtime

- `[INSERT_DATE_LONG]` → today's date as `Month DD, YYYY` (zero-padded day, e.g., `May 20, 2026`).
- `[INSERT_COMPANY_NAME]` → JD frontmatter `company` verbatim.
- `[INSERT_COMPANY_LOCATION]` → JD frontmatter `location` verbatim; if null/empty, omit the entire location line.
- `[INSERT_ROLE_TITLE]` → JD frontmatter `role` verbatim.
- `[PARAGRAPH N]` → composed paragraph (4 substitutions).

---

## 5. Pipeline wiring updates

### 5.1 modes/shivani-resume-pipeline.md

- All `V2-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md` → `V3-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md` (2 occurrences: step 7 instruction + Hard rules "Never modify" entry).
- Title "V3.0-resume" → "V3.1-resume".
- Step 7 body "Apply the V3.0 prompt" → "Apply the V3.1 prompt".
- Step 9b cover letter path unchanged (file is still `shivani-cover-letter-system.md` — only its content is rewritten).
- Hard rules entry `Never modify shivani-cover-letter-system.md during a run` stays — discipline preserved.

### 5.2 AGENTS.md (Shivani Resume Pipeline section)

- Path `V2-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md` → `V3-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md`.
- Tagline "targeting Azure Data Engineer roles" → "targeting Full Stack Java / Software Developer roles in Banking & Financial Services".
- Locked V3.0 prompt → Locked V3.1 prompt.
- Contact line `shivanianghan98@gmail.com` → `shivanianghan11@gmail.com`.
- Two-files-never-modified list updates V2 → V3 path.

### 5.3 .claude/commands/shivani-resume-pipeline.md

- Description line "V3.0-resume" → "V3.1-resume".

### 5.4 .claude/skills/career-ops/SKILL.md

- Grep for Shivani references; update any version/path strings if present. (Initial scan: no Shivani-specific refs in the head of the file. Full file check during implementation.)

### 5.5 .opencode/commands/*.md

- Grep for `V2-Shivani` / `V3.0` / `Azure Data Engineer` Shivani references; update any hits to V3 / V3.1 / Full Stack Java.

### 5.6 shivani-resume-pipeline.mjs

No code changes. The driver only ever passes paths as strings — it doesn't embed the V2 path. Verified by reading source.

---

## 6. V2 docs superseded headers

Two files get a single banner prepended:

**`docs/superpowers/specs/2026-05-10-shivani-resume-pipeline-design.md`**

```markdown
> **⚠️ Superseded by [docs/superpowers/specs/2026-05-20-shivani-v3-pipeline-design.md](2026-05-20-shivani-v3-pipeline-design.md) (2026-05-20). This document describes the V2-era Shivani pipeline targeting Azure Data Engineer roles. The Shivani pipeline has since been re-canonicalized on the V3.1 prompt (Full Stack Java Developer @ CIBC/HCLTech/Accenture, Banking & Financial Services). Body retained for historical context only.**
```

**`docs/superpowers/plans/2026-05-10-shivani-resume-pipeline.md`**

Same banner, identical text.

---

## 7. Smoke test

After all writes, before live run:

```bash
npm run smoke
# = node tests/e2e-smoke.mjs
```

Exit 0 required. Smoke validates the deterministic surface (Yash bullet/skill validators, slug, phase-timer). Since the Shivani changes are content-only (no driver / no validator changes), smoke regression risk is minimal — but running it confirms nothing inadvertently leaked into the shared surface.

---

## 8. End-to-end live run

### 8.1 Queue state

Current `data/shivani-pipeline.md` `## Pendientes`:

```
- [ ] https://job-boards.greenhouse.io/clutch/jobs/6000418004?gh_src=ca458a634us
```

### 8.2 Per-URL loop (mirrors `modes/shivani-resume-pipeline.md`)

1. `node shivani-resume-pipeline.mjs next-pending` → confirms URL pops.
2. `.venv/bin/python3 scrapling_fetch.py <url>` → JD JSON (title, body, source_hint).
3. Parse company, role, location, posted_date from JSON.
4. `node shivani-resume-pipeline.mjs slugify --company "<c>" --role "<r>"` → slugs + date.
5. `node shivani-resume-pipeline.mjs check-duplicate --company-slug <c> --role-slug <r> --date <d>` → dedup gate (jd+pdf).
6. Write JD .md verbatim to `jds/shivani/JD_<c>_<r>_Shivani_Anghan_<d>.md`.
7. Cat the V3.1 prompt + JD .md → primary session generates resume LaTeX in-context. Parse output: locate first `\documentclass`, capture deficiencies before it.
8. Write resume .tex to `/tmp/<c>_<r>_Shivani_Anghan_Resume_<d>.tex`.
9. `node shivani-resume-pipeline.mjs compile-resume --tex <tex> --pdf resumes/shivani/<c>_<r>_Shivani_Anghan_Resume_<d>.pdf`.
10. Write resume sidecar log to `resume-logs/shivani/<c>_<r>_Shivani_Anghan_Resume_<d>.log` (score, deficiencies, status).

11. (9b) Cat the V3.1 cover letter prompt + JD .md + resume .tex → primary session generates cover letter LaTeX. Parse output.
12. (10b) Write cover letter .tex to `/tmp/<c>_<r>_Shivani_Anghan_Cover_Letter_<d>.tex`.
13. (11b) `node shivani-resume-pipeline.mjs compile-cover-letter --tex <tex> --pdf cover-letters/shivani/<c>_<r>_Shivani_Anghan_Cover_Letter_<d>.pdf`.
14. (12b) Write cover letter sidecar log to `cover-letter-logs/shivani/<c>_<r>_Shivani_Anghan_Cover_Letter_<d>.log` (score, deficiencies, status, resume_keywords_echoed).

15. `mark-processed` + `log` (NDJSON append to `data/shivani-resume-runs.log`).
16. Report per-phase timings, resume score, cover letter score, page count, keyword echoes, total runtime.

### 8.3 Pre-flight verification

Before step 7, check the JD body for Full Stack Java / Banking domain signals. If the JD is clearly not a Java/Banking role (e.g., it's a frontend-only React role or a non-banking domain), surface a warning to the user before proceeding. V3 will likely produce `CONTEXTUALIZATION_DEFICIENCY` and corrected LaTeX with a lower score — the artifacts still land but flagged.

### 8.4 Verification

- All 5 artifacts on disk with non-zero sizes:
  - `jds/shivani/JD_...md`
  - `resumes/shivani/..._Resume_...pdf`
  - `resume-logs/shivani/..._Resume_...log`
  - `cover-letters/shivani/..._Cover_Letter_...pdf`
  - `cover-letter-logs/shivani/..._Cover_Letter_...log`
- Resume = 1 page, verified via `.venv/bin/python3 -c "from pypdf import PdfReader; ..."`.
- Resume score ≥ 90/100.
- Cover letter score ≥ 90/100.
- Cover letter ≥5 resume keyword echoes.
- NDJSON entry appended to `data/shivani-resume-runs.log`.
- URL moved from `## Pendientes` to `## Procesadas` in `data/shivani-pipeline.md`.

### 8.5 Tectonic XeTeX patch

V3's locked resume LaTeX template uses `\input{glyphtounicode}` + `\pdfgentounicode=1` — pdfTeX-only primitives. Tectonic (XeTeX-based) will crash unless these are wrapped. Per project memory rule (`project_yash_resume_pipeline_tectonic_patch.md`):

```latex
\ifdefined\pdfgentounicode
  \input{glyphtounicode}
  \pdfgentounicode=1
\fi
```

The primary session applies this patch at .tex write time (step 8) — does NOT edit V3 itself. The cover letter preamble (V3.1) does not use pdfTeX-only primitives, so no patch needed for cover letter.

### 8.6 Memory-isolation rule (locked prompt reads)

All locked prompts (V3 resume, V3.1 cover letter, cv-shivani.md) are loaded into primary session context via `cat` in Bash — never via the Read tool. This bypasses the global `PreToolUse:Read` hook (claude-mem) that silently truncates Read responses and injects observation timelines.

---

## 9. Rollback plan

- All writes are git-tracked. Failure recovery: `git restore <file>` per-file, or `git reset --hard HEAD~N` for full rollback.
- V3 prompt (`V3-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md`) is locked — never touched.
- `tools/validate_*.py` not touched — zero risk to Yash pipeline.
- Old cv-shivani.md content preserved in git history (commit log shows the May 10 version).
- Old V2 design + plan docs only get a 1-line header prepended; bodies intact.
- If live run fails after rewrites are committed, the rewrites can stand; the user can retry the live run separately.

---

## 10. Success metrics

1. `grep -rn "V2-Shivani-Anghan-Resume-Optimization" modes/ .claude/ .opencode/ AGENTS.md shivani-resume-pipeline.mjs` returns **0 hits**.
2. `cv-shivani.md` reflects the new identity (CIBC/HCLTech/Accenture, V3 contact, 9 skill categories, V3 certifications).
3. `shivani-cover-letter-system.md` is V3.1-harmonized (`<phase id="N">` framework, binary verification system, Full Stack Java Banking archetypes, P1–P6 banking proof points).
4. Live run produces all 5 artifacts; resume = 1 page; resume score ≥ 90; cover letter score ≥ 90; ≥5 keyword echoes; NDJSON entry appended; URL marked processed.
5. `npm run smoke` exits 0.
6. Total per-URL runtime ≤ 5 minutes (sub-5min target from `2026-05-13-yash-resume-pipeline-sub5min-design.md`). Deviations explained in the final report.

---

## 11. Risks & mitigations

| ID | Risk | Mitigation |
|----|------|-----------|
| R1 | V3.1-harmonized cover letter is unproven on a live JD | Live run validates; iterate framework if score < 90 |
| R2 | Tectonic rejects V3's `\input{glyphtounicode}` + `\pdfgentounicode=1` (pdfTeX-only) | Apply `\ifdefined\pdfgentounicode...\fi` patch at .tex write time per project memory rule. No edit to V3 itself. |
| R3 | Clutch URL may be non-Java / non-banking — V3 will produce `CONTEXTUALIZATION_DEFICIENCY` and lower-scoring LaTeX | Inspect JD domain before generation; surface warning to user; proceed (artifacts still land, flagged for review) |
| R4 | Locked prompts truncated by claude-mem `PreToolUse:Read` hook | Strict discipline: `cat` via Bash for V3, V3.1 cover letter, cv-shivani.md. Never Read. |
| R5 | cv-shivani.md identity pivot conflicts with prior Apollo / interview-prep memory of the Azure DE identity | Out of scope here. User has confirmed V3 = truth; downstream tooling that referenced old identity will need separate updates if/when surfaced. |
| R6 | 9-category skills section blows V3's char caps on first pass | Measure each category's length pre-commit; trim to cap before commit. |
| R7 | Cover letter draft proof points P1–P6 don't satisfy user's accuracy requirements | User reviews draft before commit; iterate. |

---

## 12. File diff list (canonical)

| Action | Path | Note |
|--------|------|------|
| Rewrite | `cv-shivani.md` | Wholesale rewrite; old content replaced |
| Rewrite | `shivani-cover-letter-system.md` | V1.0 → V3.1 full harmonization |
| Edit | `modes/shivani-resume-pipeline.md` | V2 path → V3 path; V3.0 → V3.1 |
| Edit | `AGENTS.md` | Shivani section: path + tagline + contact + version |
| Edit | `.claude/commands/shivani-resume-pipeline.md` | V3.0 → V3.1 |
| Possibly edit | `.claude/skills/career-ops/SKILL.md` | Only if grep finds Shivani refs needing update |
| Possibly edit | `.opencode/commands/*.md` | Only if grep finds Shivani / V2-Shivani refs |
| Edit | `docs/superpowers/specs/2026-05-10-shivani-resume-pipeline-design.md` | Prepend superseded banner |
| Edit | `docs/superpowers/plans/2026-05-10-shivani-resume-pipeline.md` | Prepend superseded banner |
| Create | This file | The V3 design |
| Run | `npm run smoke` | Post-rewrite verification |
| Generated | `jds/shivani/JD_...md` | Live run output |
| Generated | `resumes/shivani/..._Resume_...pdf` | Live run output |
| Generated | `resume-logs/shivani/..._Resume_...log` | Live run output |
| Generated | `cover-letters/shivani/..._Cover_Letter_...pdf` | Live run output |
| Generated | `cover-letter-logs/shivani/..._Cover_Letter_...log` | Live run output |
| Appended | `data/shivani-resume-runs.log` | NDJSON run entry |
| Updated | `data/shivani-pipeline.md` | URL moved Pendientes → Procesadas |

---

## 13. Out of scope (explicit)

- `V3-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md` itself — locked, read-only, never edited.
- `tools/validate_bullets.py` / `tools/validate_skills.py` — Shivani pipeline doesn't call them; leaving them untouched protects Yash pipeline.
- `shivani-resume-pipeline.mjs` — prompt-agnostic driver, no code changes needed.
- Yash pipeline (`yash-resume-pipeline.mjs`, `modes/yash-resume-pipeline.md`, Yash V2 prompt) — completely independent.
- `data/applications.md` / `data/pipeline.md` — Shivani outputs flow only to Shivani-specific directories.
- Application submission — pipeline produces artifacts only; no auto-apply.
- Apollo / interview-prep / portfolio tooling — out of scope; downstream Apollo contact targeting may need separate identity updates later.

---

## 14. Workflow gates

This spec is approved. Next gates:

1. **writing-plans skill** converts this spec into an ordered implementation plan (`docs/superpowers/plans/2026-05-20-shivani-v3-pipeline.md`).
2. **User reviews implementation plan**.
3. **executing-plans skill** (or in-session execution) runs the plan: rewrites → smoke → live run → final report.

Per the brainstorming superpowers workflow, no writes to cv-shivani.md, shivani-cover-letter-system.md, mode file, AGENTS.md, or the V2 doc headers happen until the implementation plan is approved.
