# RemoteHunter AI Systems Engineer Evaluation

## Background

Bridge batch worker request for report `257` using cached JD file `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-VbO2UYvRhHMYW5UONaSlL.txt`.

## Goal

Create a complete A-G evaluation report for RemoteHunter's AI Systems Engineer role, write one tracker-addition TSV line, and return valid JSON. PDF generation is explicitly disabled for this run.

## Scope

- Read repository sources of truth: `cv.md`, `article-digest.md`, `config/profile.yml`, `modes/_profile.md`, and local JD cache.
- Write `reports/257-remotehunter-2026-04-17.md`.
- Write `batch/tracker-additions/VbO2UYvRhHMYW5UONaSlL.tsv`.
- Do not modify `cv.md`, `i18n.ts`, `data/applications.md`, or portfolio files.

## Assumptions

- The local cached JD is the primary source because it exists and includes frontmatter.
- `llms.txt` is optional and absent in this repository.
- `h1b: unknown` is a risk for a candidate requiring sponsorship, not an automatic rejection unless the role explicitly refuses sponsorship.
- The salary frontmatter value is not a compensation range and should not be treated as salary evidence.

## Implementation Steps

1. Read sources and parse JD/frontmatter.
   Verify: source files can be opened and company/role are identified.
2. Score the role across A-G using only repository evidence and cached JD signals.
   Verify: report includes required sections and CV line references.
3. Write tracker TSV with next application number from `data/applications.md`.
   Verify: TSV has exactly 9 tab-separated columns.
4. Skip PDF because `PDF_CONFIRMED: no`.
   Verify: final JSON uses `pdf: null`.

## Verification Approach

- Check report file exists and includes required section headings.
- Check tracker-addition file exists and has 9 TSV fields.
- Do not run web fetch/search; cached JD is sufficient.

## Progress Log

- 2026-04-17: Read cached JD, profile, CV, article digest, tracker state, and scan-history signals.
- 2026-04-17: Identified RemoteHunter / AI Systems Engineer, cached JD source with frontmatter, no PDF confirmation.

## Key Decisions

- Use Agentic Workflows / Automation as the primary archetype because the JD buys AI workflow automation, Slack integrations, API development, and internal productivity tooling.
- Use Proceed with Caution for legitimacy because the JD is specific enough technically, but the RemoteHunter page is self-referential, salary metadata is promotional copy, and live freshness/apply state is unverified in batch mode.

## Risks and Blockers

- Sponsorship is unknown while the candidate requires work authorization support.
- Compensation is not provided; the cached `salary` field is not a real salary range.
- Remote/location details are missing.

## Final Outcome

Pending file write and verification.
