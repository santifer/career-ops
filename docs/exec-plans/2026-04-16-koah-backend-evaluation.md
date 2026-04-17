# Koah Backend Evaluation

## Background

The bridge worker requested evaluation report 143 for Koah's "Software Engineer - Backend" Ashby posting. The primary JD source is the local bridge file at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-C7UStheFpQKBrj8_srR3e.txt`.

## Goal

Generate a durable job evaluation report and tracker addition for batch ID `C7UStheFpQKBrj8_srR3e` without generating a PDF.

## Scope

- Read the local JD cache, `cv.md`, `article-digest.md`, `config/profile.yml`, `templates/states.yml`, `data/applications.md`, and `data/scan-history.tsv`.
- Write `reports/143-koah-2026-04-16.md`.
- Write `batch/tracker-additions/C7UStheFpQKBrj8_srR3e.tsv`.
- Do not edit `cv.md`, `i18n.ts`, `data/applications.md`, or portfolio files.

## Assumptions

- The local JD cache is sufficient for a batch-mode evaluation even though it is short.
- No PDF should be generated because the run explicitly says `PDF_CONFIRMED: no`.
- The requested report date is `2026-04-16`, even though `data/scan-history.tsv` contains a Koah scanner entry dated `2026-04-17`.
- The candidate requires work authorization support per `config/profile.yml`.

## Implementation Steps

1. Read local sources and detect the closest archetype.
   Verify: company, role, JD facts, candidate visa status, and proof points are available.
2. Draft A-G evaluation with score, legitimacy, gaps, personalization plan, interview plan, and keywords.
   Verify: report includes required sections and does not include draft application answers because score is below 4.5.
3. Create tracker addition line.
   Verify: TSV has 9 tab-separated columns and uses a canonical status.
4. Run targeted file validation.
   Verify: report exists, tracker exists, tracker columns are valid, and PDF remains null.

## Verification Approach

Use targeted shell checks after writing:

- Confirm required files exist.
- Validate tracker-addition column count is exactly 9.
- Validate report header fields include score, legitimacy, URL, PDF default note, and batch ID.

## Progress Log

- 2026-04-16: Read career-ops instructions and project instructions.
- 2026-04-16: Read local JD cache; no YAML frontmatter was present.
- 2026-04-16: Read `cv.md`, `article-digest.md`, `config/profile.yml`, `templates/states.yml`, `data/applications.md`, and `data/scan-history.tsv`.

## Key Decisions

- Use `AI Platform / LLMOps Engineer (backend infrastructure adjacency)` as the closest required archetype because the JD is not an AI role but buys scalable backend/data infrastructure.
- Score below 4.5, so omit draft application answers.
- Keep status as `Evaluada` instead of `NO APLICAR` because sponsorship is unknown, not explicitly unsupported.

## Risks and Blockers

- The JD cache is short and includes a non-salary string in the salary field, so compensation and live posting state remain unverified.
- Sponsorship is unknown and is a possible hard blocker for the candidate.
- ClickHouse, Ruby on Rails, and adtech-specific bidding experience are not explicit in the CV.

## Final Outcome

Pending.
