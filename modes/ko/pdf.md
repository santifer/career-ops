# Mode: pdf (Korean) — 한국 이력서 PDF 생성

## Overview

Korean-market resumes (이력서) in multi-page A4 format for South Korean job applications. Generates 2-4 page resumes using Jumpit-style layout with tables, clean typography, and Korean-specific formatting.

This mode is automatically used when:
- Job posting description is in Korean
- Job posting specifies "이력서는 한국어로 제출"
- Company is Korean-based
- User explicitly requests Korean resume format

**Different from default English mode (`modes/pdf.md`):**
- Multi-page (2-4 pages) instead of single-page ATS
- Jumpit-style layout with tables
- Korean date format `YYYY. MM ~ YYYY. MM`
- Korean section headers and terminology
- A4 format (not letter)

## Workflow

### Step 1: Decide the path

- If user wants one-page global/ATS resume → use `modes/pdf.md` (default English mode)
- If user wants Korean-market resume, Korean copy, or multi-page → continue below

### Step 2: Read source materials

- `resumes/` (CV variants)
- `config/profile.yml` (candidate profile)
- `modes/_profile.md` (user customizations)
- `article-digest.md` (proof points, if exists)
- Job description or company notes from thread

### Step 3: Choose layout variant

- **Experienced (3+ years):** Header + About Me + skill table + career summary on page 1; detailed project pages after
- **Junior/Entry:** Header + About Me + two-tier skill tables (used vs. theoretical) on page 1; project/assignment pages after

### Step 4: Translate and structure

Gather Korean content:
- Write in concise sentence fragments (not US narrative paragraphs)
- Keep all claims factual; do NOT invent numbers, titles, or features
- Use Korean terminology naturally (정규직, 포괄임금제, 퇴직금, 스톡옵션, 4대보험, etc.)
- Translate company names, role titles, and technical terms accurately
- Preserve metrics and achievements from source material

### Step 5: Fill the HTML template

- Use `modes/ko/assets/jumpit-korean-resume-template.html` as base
- Keep each physical page in its own `.page` container
- Replace placeholders with real HTML (`<li>`, `<tr>`, project blocks)
- Delete unused template sections (don't leave empty tables)
- Verify Korean glyphs render correctly

### Step 6: Generate PDF

```bash
node generate-pdf.mjs /tmp/cv-{candidate}-{company}.html output/{company-slug}/{position-slug}/cv-{candidate}-ko-{YYYY-MM-DD}.pdf --format=a4
```

### Step 7: Verify output

- Page count is expected (2-4 pages)
- Korean text renders correctly
- No empty placeholder rows remain
- Links are clickable
- Page breaks don't split tables mid-row

Use verification tools:
```bash
pdfinfo output/cv-{candidate}-ko-{YYYY-MM-DD}.pdf  # Check page count
pdftoppm -png output/cv-{candidate}-ko-{YYYY-MM-DD}.pdf /tmp/cv-preview  # Visual inspection
```

## Content Rules

- **Format:** A4 (not letter)
- **Length:** 2-4 pages (not 1 page)
- **Dates:** Korean style `YYYY. MM ~ YYYY. MM` (e.g., `2026. 03 ~ 현재`)
- **Address:** City and district only (omit full street unless user asks)
- **Omit:** Registration number, marital status, military service, photo, salary history (unless explicitly requested)
- **Skill tables:** One main table (experienced) or two-tier split for junior (used vs. theoretical knowledge)
- **Projects:** Emphasize role, stack, contribution, outcome, and links

## Layout Rules

Reference: `modes/ko/references/jumpit-layout.md`

- Match Jumpit template layout (`modes/ko/templates/jumpit-resume-template.pdf`)
- Black text, light gray table headers, thin borders, generous row padding
- Korean system font stack (Noto Sans Korean, etc.)
- Bold section headers with simple underline or block treatment
- NO sidebars, icon grids, gradients, or western two-column layouts
- Preserve readable whitespace (min ~10pt body text)

## Output Paths

- For specific job: `output/{company-slug}/{position-slug}/cv-{candidate}-ko-{YYYY-MM-DD}.pdf`
- For general Korean resume: `output/korean-resume/cv-{candidate}-ko-{YYYY-MM-DD}.pdf`
- Keep editable HTML next to PDF for user revisions

## Integration Notes

Read `modes/ko/references/career-ops-integration.md` for:
- Repo data sources and output paths
- Renderer quirks for Korean fonts
- Verification commands

## Important Distinctions

- This mode (`modes/ko/pdf.md`) = multi-page Korean 이력서
- Default mode (`modes/pdf.md`) = one-page ATS CV (English)
- Do NOT apply one-page ATS rules here unless user explicitly asks for single-page Korean resume
