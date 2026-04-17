# Amazon Network Development Engineer Evaluation

**Date:** 2026-04-16
**Status:** in progress
**Owner:** Codex

## Background

The bridge worker received a cached JD for Amazon Web Services (AWS), `Network Development Engineer I, ML Fabrics, Product Engineering`, under batch ID `VYxGAF2cB_ZHjdZUbZKuC`.
The repository is the source of truth for candidate data, proof points, tracker state, and report output.

## Goal

Generate a complete A-G evaluation report for the AWS role, write one tracker-addition TSV row, skip PDF generation because `PDF_CONFIRMED: no`, and return a schema-valid JSON summary.

## Scope

- Read the cached JD, `cv.md`, `article-digest.md`, `config/profile.yml`, `modes/_profile.md`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- Write `reports/147-amazon-web-services-aws-2026-04-16.md`.
- Write `batch/tracker-additions/VYxGAF2cB_ZHjdZUbZKuC.tsv`.
- Do not edit `cv.md`, `i18n.ts`, portfolio files, or `data/applications.md`.

## Assumptions

- The cached bridge JD is sufficient for the bridge MVP. It includes company, role, skill tags, requirements, responsibilities, H1B signal, taxonomy, and source URL.
- The temp bridge JD has no YAML frontmatter; the repository-local JD cache adds equivalent metadata and a fuller responsibility list.
- The role is primarily network infrastructure for ML fabrics, not an AI software role. Among the worker's six required archetypes, the closest fit is `AI Platform / LLMOps Engineer` because the role buys production infrastructure reliability, automation, and scale.
- The candidate requires sponsorship. The cached `H1B Sponsor Likely` signal reduces but does not eliminate work-authorization risk.
- No active security clearance requirement appears in the cached JD.

## Implementation Steps

1. Read local sources and extract candidate/JD evidence.
   Verify: local files are readable and JD source is `cache`.
2. Evaluate Blocks A-G and global score from the cached JD plus repository proof points.
   Verify: each major requirement maps to CV or article evidence, with gaps identified.
3. Write the report and tracker-addition row.
   Verify: files exist at the expected paths.
4. Validate output shape.
   Verify: report header exists, tracker row has 9 TSV columns, and final JSON uses the required schema.

## Verification Approach

- Inspect generated report header and key sections with `sed`.
- Count TSV columns with `awk -F '\t'`.
- Confirm no PDF was generated for this run.

## Progress Log

- 2026-04-16: Read `CLAUDE.md`, the `career-ops` skill router, cached bridge JD, local JD cache, `cv.md`, `article-digest.md`, `config/profile.yml`, `modes/_profile.md`, tracker files, states, and scan history.
- 2026-04-16: Confirmed `llms.txt` is absent and `i18n.ts` is absent.
- 2026-04-16: Found one matching scan-history appearance on 2026-04-17 marked `promoted`.
- 2026-04-16: Calculated next tracker number as `95` from `data/applications.md`.

## Key Decisions

- Use no WebFetch/WebSearch because local JD caches are available and external research is not necessary for the minimum bridge outcome.
- Treat exact posting freshness and apply-button state as unverified in batch mode.
- Use `Evaluada` in the tracker addition because the worker prompt's valid-state list explicitly allows it.
- Omit Block H because the global score is below 4.5.

## Risks and Blockers

- Exact salary, location, modality, live apply state, and formal sponsorship policy are unavailable from the cached JD.
- The role has material gaps against Hongxi's current CV: BGP, OSPF, IS-IS, MPLS, network hardware, packet-forwarding architectures, and data-center on-call network operations.
- The cached `H1B Sponsor Likely` signal is favorable but not a binding sponsorship commitment.

## Final Outcome

Pending.
