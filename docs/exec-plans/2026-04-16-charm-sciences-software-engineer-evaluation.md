# Charm Sciences Software Engineer I Evaluation

## Background

The bridge worker requested evaluation report 148 for Charm Sciences, Inc.'s Indeed posting for `SOFTWARE ENGINEER I`. The primary JD source is the local bridge file at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-qm0rAaE7CufY-dGXHISID.txt`.

## Goal

Generate a durable job evaluation report and tracker addition for batch ID `qm0rAaE7CufY-dGXHISID` without generating a PDF.

## Scope

- Read the local JD cache, `cv.md`, `article-digest.md`, `config/profile.yml`, `templates/states.yml`, `data/applications.md`, and `data/scan-history.tsv`.
- Write `reports/148-charm-sciences-inc-2026-04-16.md`.
- Write `batch/tracker-additions/qm0rAaE7CufY-dGXHISID.tsv`.
- Do not edit `cv.md`, `i18n.ts`, `data/applications.md`, or portfolio files.

## Assumptions

- The local JD cache is sufficient for a batch-mode evaluation; no WebFetch or WebSearch is needed.
- The JD cache does not contain YAML frontmatter even though it includes structured text fields.
- No PDF should be generated because the run explicitly says `PDF_CONFIRMED: no`.
- The requested report date is `2026-04-16`.
- The candidate requires work authorization support per `config/profile.yml`; the JD cache says `H1B Sponsor Likely`, so sponsorship is a verification risk rather than an immediate hard blocker.

## Implementation Steps

1. Read local sources and detect the closest required archetype.
   Verify: company, role, JD facts, candidate visa status, and proof points are available.
2. Draft A-G evaluation with score, legitimacy, gaps, personalization plan, interview plan, and keywords.
   Verify: report includes required sections and omits draft application answers because score is below 4.5.
3. Create tracker addition line.
   Verify: TSV has 9 tab-separated columns and uses a canonical status accepted by the tracker flow.
4. Run targeted file validation.
   Verify: report exists, tracker exists, tracker columns are valid, and PDF remains null.

## Verification Approach

Use targeted shell checks after writing:

- Confirm required report and tracker files exist.
- Validate tracker-addition column count is exactly 9.
- Validate report header fields include score, legitimacy, URL, PDF default note, and batch ID.

## Progress Log

- 2026-04-16: Read career-ops instructions and project instructions.
- 2026-04-16: Ran `node update-system.mjs check`; result was offline with local version `1.3.0`.
- 2026-04-16: Read local JD cache; no YAML frontmatter was present.
- 2026-04-16: Read `cv.md`, `article-digest.md`, `config/profile.yml`, `templates/states.yml`, `data/applications.md`, and `data/scan-history.tsv`.
- 2026-04-16: Drafted evaluation report and tracker addition.

## Key Decisions

- Use `AI Forward Deployed Engineer (weak proxy)` as the closest required archetype because the JD is a general early-career software role, not an AI role, but it buys practical full-stack delivery, debugging, and cross-functional execution.
- Score below 4.5, so omit draft application answers.
- Keep status as `Evaluada` instead of `NO APLICAR` because sponsorship is tagged as likely and the role has technical fit, even though it is low priority.

## Risks and Blockers

- Posting freshness and apply-button state are unverified in batch mode.
- The cached salary field is an Indeed promotional string, not compensation data.
- Location is not available in the cache, while the JD mentions an 8:30 am to 5:30 pm schedule and preferably on-site work.
- The role is weakly aligned with the candidate's AI/backend north star and has gaps around C#, .NET, and logic analyzers.

## Final Outcome

Pending verification.
