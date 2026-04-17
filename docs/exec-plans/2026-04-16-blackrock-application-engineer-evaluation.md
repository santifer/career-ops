# 2026-04-16 BlackRock Application Engineer Evaluation

## Background

Bridge batch run for BlackRock, "Analyst, Application Engineer" from the Workday URL:
`https://blackrock.wd1.myworkdayjobs.com/BlackRock_Professional/job/Wilmington-DE/Analyst--Application-Engineer_R262373`.

The local JD cache at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-Pem9opgc1O2_3wDHAb-yP.txt`
contained only the URL, title, and a "captured page text is short" note. I used a direct fetch attempt plus a minimal web search to recover enough JD detail for a real evaluation.

## Goal

Generate the required batch artifacts:

1. Full A-G markdown report at `reports/231-blackrock-2026-04-16.md`.
2. One TSV tracker-addition line at `batch/tracker-additions/Pem9opgc1O2_3wDHAb-yP.tsv`.
3. No PDF, because `PDF_CONFIRMED: no`.
4. Final JSON compatible with the bridge output schema.

## Scope

In scope:

- Read candidate truth files: `cv.md`, `article-digest.md`, `config/profile.yml`, and local JD cache.
- Use `llms.txt` only if it exists; it does not exist in this repo.
- Check `data/scan-history.tsv` for prior appearances.
- Use external retrieval only because the local JD cache was not evaluable.
- Write report, tracker addition, and this execution plan.

Out of scope:

- Editing `cv.md`, `article-digest.md`, `i18n.ts`, or `data/applications.md`.
- Generating a tailored PDF.
- Submitting an application.

## Assumptions

- Candidate requires sponsorship or work authorization support, based on `config/profile.yml`.
- No active security clearance requirement is present in the recovered JD.
- The role is best treated as an early-career enterprise application/platform engineering role, not an AI-first role.
- The report can use public indexed listing content where the official Workday page is inaccessible in batch mode, as long as the limitation is disclosed.

## Implementation Steps

1. Read project instructions and career-ops routing.
   Verify: `CLAUDE.md` and career-ops skill were read.
2. Read local truth sources and JD cache.
   Verify: `cv.md`, `article-digest.md`, `config/profile.yml`, and the JD cache were read.
3. Recover missing JD details.
   Verify: direct URL fetch attempted; minimal search found the BlackRock/Built In job content.
4. Evaluate A-G against the candidate profile.
   Verify: report includes role summary, CV match, strategy, comp, personalization, interview prep, legitimacy, score, and keywords.
5. Write tracker addition.
   Verify: next tracker number calculated from `data/applications.md` as 163 and TSV has 9 columns.
6. Run targeted verification.
   Verify: report and tracker files exist, TSV column count is correct, and diff check passes.

## Verification Approach

- Confirm report file exists and is non-empty.
- Confirm tracker addition exists and contains exactly one tab-separated line with 9 fields.
- Run `git diff --check` to catch whitespace issues.
- Confirm PDF remains ungenerated and final JSON uses `pdf: null`.

## Progress Log

- 2026-04-16: Read career-ops instructions and repository instructions.
- 2026-04-16: Read `cv.md`, `article-digest.md`, `config/profile.yml`, and local JD cache.
- 2026-04-16: Confirmed `llms.txt` is absent and `i18n.ts` is absent.
- 2026-04-16: Local JD cache was a stub, so I attempted direct URL fetch and then used one minimal search to recover JD detail.
- 2026-04-16: Found prior scan-history appearance for this BlackRock role on 2026-04-16.
- 2026-04-16: Drafted report and tracker addition.

## Key Decisions

- Legitimacy tier is `Proceed with Caution`, not `High Confidence`, because the exact Workday URL could not be verified in batch mode and the recovered public listing shows a different requisition identifier than the user-provided URL.
- Global score is `2.85/5`: good early-career backend/platform overlap, but weak AI north-star alignment, ServiceNow/Splunk gaps, below-target base compensation, 4-day Wilmington office requirement, and sponsorship uncertainty.
- No draft application answers are included because the global score is below 4.5.
- No PDF is generated because the run explicitly says `PDF_CONFIRMED: no`.

## Risks and Blockers

- Exact Workday apply-button state and requisition freshness remain unverified in batch mode.
- Sponsorship support is unknown and is a candidate-specific risk.
- Public listing data may correspond to a mirrored or previously indexed version of the role; report calls this out.

## Final Outcome

Pending verification after file writes.
