# TikTok Global CRM Evaluation

## Background

The bridge worker must evaluate the cached JobRight JD for TikTok's "Software Engineer Graduate (Global CRM) - 2026 Start (BS/MS)" role, write a report under `reports/`, and write a tracker addition TSV. The run explicitly says `PDF_CONFIRMED: no`, so no PDF should be generated.

## Goal

Produce the required Career-Ops artifacts for batch ID `1uui-slDL3j1Jsv686g31`:

1. Full A-G evaluation report at `reports/138-tiktok-2026-04-16.md`.
2. Tracker addition at `batch/tracker-additions/1uui-slDL3j1Jsv686g31.tsv`.
3. Final worker JSON with status, report path, score, archetype, legitimacy, and PDF status.

## Scope

In scope:

- Read the cached JD, `cv.md`, `article-digest.md`, `config/profile.yml`, `modes/_profile.md`, and tracker data.
- Use minimal external compensation lookup because the cached JD salary field is not an actual range.
- Create only the report, tracker TSV, and this execution plan.

Out of scope:

- Editing `cv.md`, `i18n.ts`, profile, portfolio, or source code.
- Generating a PDF.
- Editing `data/applications.md` directly.

## Assumptions

- The local JD file is the primary JD source.
- The local file has no YAML frontmatter delimiters, so frontmatter usage is false.
- The candidate requires work authorization support, per `config/profile.yml`.
- "H1B Sponsor Likely" from JobRight is positive but not equivalent to employer confirmation.
- The role is best scored as a backend/distributed systems new-grad role, not an AI role.

## Implementation Steps

1. Read the required local sources.
   Verify: source files load; missing `llms.txt` is noted as absent.
2. Detect hard blockers and fit.
   Verify: sponsorship and clearance checks appear in the report.
3. Score the role and write A-G report.
   Verify: report path exists and includes the required header fields.
4. Write tracker TSV.
   Verify: one tab-separated line with 9 columns.
5. Run targeted verification.
   Verify: `node cv-sync-check.mjs`, report existence, TSV field count, and `node merge-tracker.mjs --dry-run`.

## Verification Approach

- `node cv-sync-check.mjs`
- `test -f reports/138-tiktok-2026-04-16.md`
- `awk -F '\t' '{print NF}' batch/tracker-additions/1uui-slDL3j1Jsv686g31.tsv`
- `node merge-tracker.mjs --dry-run`

## Progress Log

- 2026-04-16: Read Career-Ops instructions, cached JD, CV, article digest, profile, shared mode, profile overrides, tracker, states, and scan history.
- 2026-04-16: Confirmed `llms.txt` is absent, so no LLM-source file was available to read.
- 2026-04-16: Ran `node cv-sync-check.mjs`; all checks passed.
- 2026-04-16: Ran one minimal compensation lookup because the cached JD has no usable salary range.
- 2026-04-16: Created report and tracker TSV.
- 2026-04-16: Verification passed.

## Key Decisions

- Classified the role as "AI Solutions Architect (closest prompt taxonomy) / Software Engineer, Backend / Distributed Systems (profile taxonomy)" because the JD buys scalable backend CRM/SaaS engineering rather than AI model work.
- Used `Proceed with Caution` for legitimacy because TikTok is real and the JD is coherent, but direct JobRight apply state and employer-hosted liveness are unverified in batch mode.
- Set global score to `4.05/5`: strong Java/Spring/backend/new-grad fit and likely strong comp, offset by weak AI north-star alignment, unknown location, high applicant count, and unverified sponsorship.
- Skipped PDF generation because this bridge run explicitly says `PDF_CONFIRMED: no`.

## Risks and Blockers

- Sponsorship is not directly confirmed by TikTok in the cached JD.
- The JD source is JobRight, not a verified employer-hosted page.
- Location and official compensation range are not present in the cached JD.
- JobRight reports 200+ applicants, so response probability may be lower even with good fit.

## Final Outcome

Report and tracker TSV were written successfully. No PDF was generated.
