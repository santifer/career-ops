> **⚠️ Superseded by [docs/superpowers/specs/2026-05-20-shivani-v3-pipeline-design.md](2026-05-20-shivani-v3-pipeline-design.md) (2026-05-20). This document describes the V2-era Shivani pipeline targeting Azure Data Engineer roles. The Shivani pipeline has since been re-canonicalized on the V3.1 prompt (Full Stack Java Developer @ CIBC/HCLTech/Accenture, Banking & Financial Services). Body retained for historical context only.**

# Design: /shivani-resume-pipeline — Parallel Pipeline for Shivani Anghan

**Date:** 2026-05-10
**Status:** Approved
**Author:** Claude Code (brainstorming session)

---

## Overview

Introduce `/shivani-resume-pipeline` as a complete parallel pipeline to `/yash-resume-pipeline`, fully namespaced to Shivani Anghan (Azure Data Engineer). Simultaneously migrate all existing Yash artifacts into per-person `*/yash/` subdirectories so both pipelines share a symmetric, unambiguous folder structure.

---

## Architecture

Two independent, symmetric pipelines sharing only the LaTeX compiler (`generate-pdf-latex.mjs`) and the Scrapling fetcher (`scrapling_fetch.py`). No shared queues, no shared output directories, no shared state.

```
/yash-resume-pipeline                   /shivani-resume-pipeline
  data/yash-pipeline.md                   data/shivani-pipeline.md
  yash-resume-pipeline.mjs                shivani-resume-pipeline.mjs
  modes/yash-resume-pipeline.md           modes/shivani-resume-pipeline.md
  .claude/commands/yash-resume-pipeline   .claude/commands/shivani-resume-pipeline
  jds/yash/                               jds/shivani/
  resumes/yash/                           resumes/shivani/
  resume-logs/yash/                       resume-logs/shivani/
  cover-letters/yash/                     cover-letters/shivani/
  cover-letter-logs/yash/                 cover-letter-logs/shivani/
  data/yash-resume-runs.log               data/shivani-resume-runs.log
  cv.md                                   cv-shivani.md
  resume-optimization-system-based-      V2-Shivani-Anghan-Resume-
    on-job-description.md                   Optimization-System-XML-Markdown.md
  cover-letter-system-based-on-          shivani-cover-letter-system.md
    jd-and-resume.md

                    ── shared ──
              generate-pdf-latex.mjs
              scrapling_fetch.py
```

---

## Source-of-Truth Files

| File | Purpose | Status |
|------|---------|--------|
| `cv-shivani.md` | Shivani's canonical CV (Azure Data Engineer) | Create (placeholder with `<!-- FILL IN -->` comments) |
| `V2-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md` | Locked V3.0 resume prompt | Already exists at project root — never modify |
| `shivani-cover-letter-system.md` | Cover letter generation prompt for Shivani | Create by adapting `cover-letter-system-based-on-jd-and-resume.md` |

**Shivani profile details:**
- Email: `shivanianghan98@gmail.com`
- Role domain: Azure Data Engineer
- Key technologies: Azure Data Factory, Databricks, Synapse Analytics, PySpark, SQL, ETL/ELT, data pipelines, cloud data platforms

---

## Implementation Phases

### Phase 0 — Bootstrap Shivani's source-of-truth files

1. **`cv-shivani.md`** — Well-structured markdown CV placeholder. Sections: Summary, Experience, Projects, Education, Skills, Certifications. Each section marked `<!-- FILL IN -->`.

2. **`shivani-cover-letter-system.md`** — Adapted from `cover-letter-system-based-on-jd-and-resume.md`:
   - `Yash Anghan` → `Shivani Anghan` throughout
   - `developer@acodesoft.com` → `shivanianghan98@gmail.com`
   - Archetype: AI/ML Engineer → **Azure Data Engineer**
   - Proof points and scoring rubrics adapted for data engineering (ETL, cloud data, Azure ecosystem)
   - Identical document structure, section headers, LaTeX output format

### Phase 1 — Migrate existing Yash artifacts to `*/yash/` subdirectories

Create subdirs and move existing files (preserving git history via `git mv` where applicable):

| Source | Destination |
|--------|-------------|
| `jds/*.md` | `jds/yash/*.md` |
| `resumes/*.pdf` | `resumes/yash/*.pdf` |
| `resume-logs/*.log` | `resume-logs/yash/*.log` |
| `cover-letters/*.pdf` | `cover-letters/yash/*.pdf` |
| `cover-letter-logs/*.log`, `*.tex` | `cover-letter-logs/yash/` |
| `data/pipeline.md` | `data/yash-pipeline.md` |

Create empty `*/shivani/` siblings with `.gitkeep` files:
`jds/shivani/`, `resumes/shivani/`, `resume-logs/shivani/`, `cover-letters/shivani/`, `cover-letter-logs/shivani/`

**Rule:** Do not move existing `.gitkeep` files from folder roots.

### Phase 2 — Update Yash's orchestrator for new paths

Edit `yash-resume-pipeline.mjs` — update these path-building functions:

| Function | Old | New |
|----------|-----|-----|
| `pipelinePath()` | `data/pipeline.md` | `data/yash-pipeline.md` |
| `jdsDir()` | `jds` | `jds/yash` |
| `resumesDir()` | `resumes` | `resumes/yash` |
| `buildJdPath()` | `jds/JD_..._Yash_Anghan_...md` | `jds/yash/JD_..._Yash_Anghan_...md` |
| `buildPdfPath()` | `resumes/..._Yash_Anghan_Resume_...pdf` | `resumes/yash/..._Yash_Anghan_Resume_...pdf` |
| `buildSidecarLogPath()` | `resume-logs/..._Yash_Anghan_Resume_...log` | `resume-logs/yash/..._Yash_Anghan_Resume_...log` |
| `buildCoverLetterPdfPath()` | `cover-letters/..._Yash_Anghan_Cover_Letter_...pdf` | `cover-letters/yash/..._Yash_Anghan_Cover_Letter_...pdf` |
| `buildCoverLetterLogPath()` | `cover-letter-logs/..._Yash_Anghan_Cover_Letter_...log` | `cover-letter-logs/yash/..._Yash_Anghan_Cover_Letter_...log` |

**Unchanged:** `runsLogPath()` → `data/yash-resume-runs.log`, `buildCoverLetterTexPath()` → `/tmp/`

Also update `modes/yash-resume-pipeline.md`: all path references and examples updated for `*/yash/` and `data/yash-pipeline.md`.

### Phase 3 — Create Shivani's orchestrator

Create `shivani-resume-pipeline.mjs` from `yash-resume-pipeline.mjs` with these substitutions:

| Old | New |
|-----|-----|
| `data/yash-pipeline.md` | `data/shivani-pipeline.md` |
| `data/yash-resume-runs.log` | `data/shivani-resume-runs.log` |
| `jds/yash` | `jds/shivani` |
| `resumes/yash` | `resumes/shivani` |
| `resume-logs/yash` | `resume-logs/shivani` |
| `cover-letters/yash` | `cover-letters/shivani` |
| `cover-letter-logs/yash` | `cover-letter-logs/shivani` |
| `Yash_Anghan` (path strings only) | `Shivani_Anghan` |
| `resume-optimization-system-based-on-job-description.md` | `V2-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md` |
| `cover-letter-system-based-on-jd-and-resume.md` | `shivani-cover-letter-system.md` |
| `yash-resume-pipeline.mjs` (comments/header) | `shivani-resume-pipeline.mjs` |

All logic, subcommand signatures, argument parsing, and error handling remain identical.

### Phase 4 — Create Shivani's mode file, queue, and slash command

**`modes/shivani-resume-pipeline.md`** — Mirror of `modes/yash-resume-pipeline.md` with:
- Title: `shivani-resume-pipeline — JD-extract → V3.0-resume two-phase pipeline`
- All CLI calls: `node yash-resume-pipeline.mjs` → `node shivani-resume-pipeline.mjs`
- Locked prompt reference: `V2-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md`
- Cover letter prompt reference: `shivani-cover-letter-system.md`
- "Three files never modified" list updated for Shivani's filenames
- All path examples use `jds/shivani/`, `resumes/shivani/`, etc.

**`data/shivani-pipeline.md`** — Empty queue with sections:
```markdown
## Pendientes
## Procesados
## Fallidos
```

**`.claude/commands/shivani-resume-pipeline.md`**:
```
---
description: Run the JD-extract → V3.0-resume pipeline for Shivani Anghan (one URL at a time).
argument-hint: ""
---

Read modes/shivani-resume-pipeline.md and follow it.
```

### Phase 5 — Documentation updates

Edit `AGENTS.md`:
1. Add row to Skill Modes table: `| Wants to run Shivani's resume pipeline | \`shivani-resume-pipeline\` |`
2. Add `### Shivani Resume Pipeline (shivani-resume-pipeline)` section below the existing Yash section, documenting all Shivani-specific paths and files
3. Update `### Yash Resume Pipeline` section for renamed `data/yash-pipeline.md` and `*/yash/` subdir outputs

### Phase 6 — Tests

1. `tests/shivani-resume-pipeline.test.mjs` — Mirror of `tests/yash-resume-pipeline.test.mjs` with CLI and path substitutions
2. `tests/test-shivani-pipeline-smoke.mjs` — Mirror of `tests/test-yash-pipeline-smoke.mjs`
3. Update `tests/test-yash-pipeline-smoke.mjs` — fix any hardcoded `data/pipeline.md` references to `data/yash-pipeline.md`
4. Update `test-all.mjs` — add both new Shivani test files to the runner manifest

---

## Locked Files (never modify)

- `generate-pdf-latex.mjs`
- `resume-optimization-system-based-on-job-description.md`
- `V2-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md`
- `cover-letter-system-based-on-jd-and-resume.md`

---

## Execution Order

Phases must execute in order. Phase 1 (file moves) must complete before Phase 2 (path updates in `.mjs`), which must complete before Phase 6 (tests verify the new paths). Phase 0 can run concurrently with Phase 1.

---

## Success Criteria

- `node shivani-resume-pipeline.mjs next-pending` exits cleanly against `data/shivani-pipeline.md` (empty queue)
- `node shivani-resume-pipeline.mjs slugify --company "Microsoft" --role "Senior Data Engineer"` returns paths with `Shivani_Anghan` pointing to `jds/shivani/`, `resumes/shivani/`
- `node yash-resume-pipeline.mjs next-pending` still works against `data/yash-pipeline.md`
- `/shivani-resume-pipeline` slash command exists at `.claude/commands/shivani-resume-pipeline.md`
- `node test-all.mjs` passes all checks (63+ existing + new Shivani tests)
- All existing Yash artifacts accessible at their new `*/yash/` paths
- `cv-shivani.md` exists with scaffolded sections ready to fill in
