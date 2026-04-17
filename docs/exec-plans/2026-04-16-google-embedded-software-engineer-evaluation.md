# Google Embedded Software Engineer Evaluation

## Background

Batch job `SbIY-qHc_IonicX3Crqco` requests a career-ops evaluation for Google's `Software Engineer, PhD, Early Career, Embedded Systems and Firmware, 2026 Start` role. The bridge JD cache contains only the URL and title, so the official Google Careers page was used to recover the complete JD.

## Goal

Produce a real evaluation report and tracker addition for report number 193 without generating a PDF.

## Scope

- Read the cached JD, `cv.md`, optional `llms.txt`, `article-digest.md`, profile data, tracker state, and scan history.
- Use the official Google Careers page to fill missing role facts because the bridge cache is too short for evaluation.
- Generate `reports/193-google-2026-04-16.md`.
- Generate `batch/tracker-additions/SbIY-qHc_IonicX3Crqco.tsv`.
- Do not edit `cv.md`, `i18n.ts`, or `data/applications.md`.
- Do not generate a PDF because `PDF_CONFIRMED: no`.

## Assumptions

- The official Google Careers page is the best available JD source for this run.
- The cached JD file has no YAML frontmatter, so `used_frontmatter` is false.
- The candidate requires sponsorship based on `config/profile.yml`; the JD does not explicitly deny sponsorship, so this is a verification risk rather than an automatic hard blocker.
- The PhD requirement and embedded systems/firmware requirement are material fit blockers for the candidate's current CV.
- The closest required career-ops archetype is `AI Platform / LLMOps Engineer` by infrastructure adjacency, but the actual role is embedded systems and firmware software engineering.

## Implementation Steps

1. Parse local and official role facts.
   Verify: company, role, locations, salary, responsibilities, qualifications, and blocker signals are known.
2. Evaluate A-G against the CV and article proof points.
   Verify: every major JD requirement maps to a CV line, article proof point, or stated gap.
3. Write report markdown.
   Verify: report exists at the requested path and contains A-G plus keywords.
4. Write tracker addition.
   Verify: TSV has one line and exactly 9 tab-separated columns.
5. Skip PDF.
   Verify: final JSON reports `pdf: null`.

## Verification Approach

- `test -s` for report and tracker files.
- `awk -F'\t' 'NF != 9 { exit 1 }'` on the tracker addition.
- Header grep for score, legitimacy, URL, batch ID, and PDF status in the report.

## Progress Log

- 2026-04-16: Read the career-ops skill, `CLAUDE.md`, cached JD, profile, CV, article digest, tracker state, scan history, states config, and comparable reports/plans.
- 2026-04-16: Confirmed `llms.txt` is absent and PDF generation is explicitly disabled.
- 2026-04-16: Opened the official Google Careers page because the bridge JD cache only contained URL/title; recovered full qualifications, responsibilities, locations, and `$147,000-$211,000` base salary range.

## Key Decisions

- Use the official Google Careers page as the full JD source because the cached bridge file is too short for a complete evaluation.
- Do not do broader company or market research because the official posting provides compensation, requirements, benefits, and legitimacy signals.
- Treat the PhD and embedded firmware requirements as the decisive fit blockers.
- Omit application-answer drafts because the expected global score is below the `>= 4.5` threshold.

## Risks and Blockers

- The role targets PhD-level embedded systems and firmware candidates; Hongxi is completing an MS in Software Engineering.
- The CV shows C++/Linux systems evidence but not firmware, microcontrollers, kernel development, device drivers, or hardware/software integration.
- Sponsorship support is not stated in the posting and must be confirmed separately.
- Batch mode cannot fully verify exact posting freshness.

## Final Outcome

Pending.
