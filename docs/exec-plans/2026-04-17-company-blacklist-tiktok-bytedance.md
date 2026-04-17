# Company Blacklist for TikTok and ByteDance

## Background

The user asked to add TikTok and ByteDance to the company blacklist. The current newgrad scan pipeline supports company-level hard filters for sponsorship and active security clearance, but it does not support a generic user-driven company blacklist.

## Goal

Add a real user-configurable company blacklist to the newgrad scan pipeline and blacklist TikTok plus ByteDance in the user's profile.

## Scope

- Add a `blocked_companies` hard-filter field to the newgrad scan config contract and loader.
- Apply the blacklist in scan scoring and pending-entry filtering.
- Add TikTok and ByteDance to `config/profile.yml`.
- Add targeted tests for config loading and filtering behavior.

## Assumptions

- The user's request is a generic skip preference, not a claim about sponsorship or clearance.
- The blacklist only needs to affect the newgrad scan pipeline paths that already consume `newgrad_scan.hard_filters`.
- A user-specific configuration change belongs in `config/profile.yml`.

## Implementation Steps

1. Add plan artifact and lock assumptions.
   Verify: plan file exists under `docs/exec-plans/`.
2. Add `blocked_companies` support in contracts, config parsing, and filtering logic.
   Verify: targeted tests cover config loading and blacklist filtering.
3. Update `config/profile.yml` with TikTok and ByteDance.
   Verify: config contains both companies under the new blacklist field.
4. Run targeted verification.
   Verify: relevant Vitest suite passes.

## Verification Approach

- Run targeted Vitest files for `newgrad-config`, `newgrad-scorer`, and `newgrad-pending`.
- Inspect `config/profile.yml` after editing to confirm the blacklist entries.

## Progress Log

- 2026-04-17: Read root instructions (`CLAUDE.md`, `docs/CODEX.md`) and confirmed onboarding files exist.
- 2026-04-17: Located current company-level hard filters and confirmed there is no existing generic company blacklist field.
- 2026-04-17: Created this execution plan before implementation.
- 2026-04-17: Added `blocked_companies` support to the newgrad scan config contract, loader, scorer, and pending-entry filter.
- 2026-04-17: Updated `config/profile.yml` to blacklist `TikTok` and `ByteDance`; documented the field in `config/profile.example.yml`.
- 2026-04-17: Ran targeted Vitest coverage for `newgrad-config`, `newgrad-scorer`, and `newgrad-pending` with all tests passing.

## Key Decisions

- Implement a dedicated `blocked_companies` field instead of reusing `no_sponsorship_companies`, so filter reasons remain accurate.

## Risks and Blockers

- Existing memory-based company blocking only tracks sponsorship and clearance reasons; this change intentionally does not expand memory persistence unless needed by the request.

## Final Outcome

- Complete. The repository now supports a real user-driven company blacklist for newgrad scanning, and the user's profile blocks TikTok and ByteDance without mislabeling them as sponsorship or clearance exclusions.
