# TikTok Trust and Safety PhD Evaluation

## Background

Batch job `QLBJOy5phYzHFt8r0qhmL` requests a Career-Ops evaluation for TikTok's `CV/NLP/Multimodal LLM Machine Learning Engineer Graduate (TikTok-Trust and Safety) - 2026 Start (PhD)` role. The local bridge JD file is the primary source, but it only contains the URL and title, so a minimal web lookup is needed to reconstruct the actual JD.

## Goal

Produce the required bridge artifacts:

1. Full A-G evaluation report at `reports/198-tiktok-2026-04-16.md`.
2. Tracker addition at `batch/tracker-additions/QLBJOy5phYzHFt8r0qhmL.tsv`.
3. Final worker JSON with status, report path, score, archetype, legitimacy, and PDF status.

## Scope

In scope:

- Read the local JD cache, `cv.md`, `article-digest.md`, `config/profile.yml`, tracker data, canonical states, and scan history.
- Use minimal web lookup because the local cache does not include the JD body.
- Create only this execution plan, the report, and the tracker TSV.

Out of scope:

- Editing `cv.md`, `i18n.ts`, profile, portfolio, source code, or `data/applications.md`.
- Generating a PDF, because this run explicitly says `PDF_CONFIRMED: no`.
- Applying to the role.

## Assumptions

- The report date is the orchestrator-provided `2026-04-16`.
- The local JD cache has no YAML frontmatter, so frontmatter usage is false.
- The candidate requires sponsorship / work authorization support, per `config/profile.yml`.
- The PhD minimum is treated as a major eligibility blocker because the candidate is completing an MS, not a PhD.
- Indexed job mirrors are sufficient for evaluation, but employer-hosted apply liveness remains unverified in batch mode.

## Implementation Steps

1. Read the required repository sources.
   Verify: local files load; missing `llms.txt` is noted as absent.
2. Reconstruct the JD with minimal web lookup because the cache is title-only.
   Verify: recovered role title, location, responsibilities, minimum qualifications, and salary appear in the report.
3. Evaluate fit, blockers, compensation, interview plan, and legitimacy.
   Verify: report includes sections A-G and omits section H because score is below 4.5.
4. Write tracker TSV.
   Verify: tracker addition has one line and 9 tab-separated fields.
5. Run targeted verification.
   Verify: report exists, tracker field count is 9, and dry-run tracker merge parses the addition.

## Verification Approach

- `test -f reports/198-tiktok-2026-04-16.md`
- `awk -F '\t' '{print NF}' batch/tracker-additions/QLBJOy5phYzHFt8r0qhmL.tsv`
- `node merge-tracker.mjs --dry-run`

## Progress Log

- 2026-04-16: Read Career-Ops instructions, project instructions, local JD cache, CV, article digest, profile, tracker data, canonical states, and scan history.
- 2026-04-16: Confirmed `llms.txt` is absent in the project root.
- 2026-04-16: Reconstructed the full JD from minimal web lookup because the cache only had the title and URL.
- 2026-04-16: Classified the role as `AI Platform / LLMOps Engineer + AI Forward Deployed Engineer`.
- 2026-04-16: Scored the role as `2.65/5` because the content-understanding and ML-serving domain is aligned, but the PhD requirement, limited direct CV/NLP/multimodal training evidence, and sponsorship uncertainty make it a no-apply for this candidate.
- 2026-04-16: Wrote report and tracker TSV.

## Key Decisions

- Used `NO APLICAR` in the tracker because the role explicitly targets PhD candidates and the candidate's current degree path is MS.
- Used `High Confidence` for legitimacy because the JD is detailed, internally consistent, compensation-transparent, and appears across multiple current job mirrors, while still noting direct employer-hosted liveness is unverified.
- Skipped PDF generation because this bridge run explicitly says `PDF_CONFIRMED: no`.

## Risks and Blockers

- Employer-hosted TikTok apply state was not verified in batch mode.
- The candidate may be a strong fit for the BS/MS version of this role family, but that is a different posting and should be evaluated separately.
- Sponsorship is not explicitly confirmed in the recovered JD.

## Final Outcome

Report and tracker TSV were written successfully. No PDF was generated.
