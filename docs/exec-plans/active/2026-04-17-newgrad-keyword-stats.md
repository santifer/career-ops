# Newgrad Keyword Matching And Stats

## Background

The newgrad scanner uses `config/profile.yml -> newgrad_scan.skill_keywords`
to score rows from `newgrad-jobs.com`. The current matcher uses simple
substring checks, so short terms such as `AI` and `Java` can match unintended
text. The user also wants resume coverage for `iOS`, `Swift`, `iOS SDK`, and
`C/C++`, plus a dashboard view that shows which configured skills are matched
or missed.

## Goal

Make skill keyword matching more precise, add the requested resume keywords,
and expose last-scan plus profile skill coverage in `web/index.html`.

## Scope

- Update user-owned resume/profile keyword data only where directly requested.
- Replace substring skill matching with a reusable bounded matcher.
- Persist last newgrad scan skill hit counts in repo data.
- Extend the static dashboard generator/template to display matched and
  unmatched skills.

## Assumptions

- `web/index.html` is generated from `web/template.html` by
  `web/build-dashboard.mjs`, so dashboard UI changes should be made in the
  template and regenerated.
- Scan-history rows do not contain enough JD text to reconstruct historical
  skill matches, so last-scan skill stats should be written during scoring.
- Existing unrelated worktree changes are user or prior-session work and must
  not be reverted.

## Implementation Steps

1. Add the requested resume/profile keywords.
   Verify: profile parsing sees the terms and resume/material text contains
   them.
2. Add a bounded skill matcher and route list/detail value matching through it.
   Verify: tests cover `AI` not matching inside ordinary words, `Java` not
   matching `JavaScript`, and `C/C++` matching `C++17`.
3. Persist last-scan skill stats during newgrad list scoring.
   Verify: direct smoke run writes expected matched/unmatched counts.
4. Update dashboard build/template to inline and render keyword stats.
   Verify: `npm run dashboard` regenerates `web/index.html`.
5. Run targeted typechecks/tests where the local environment permits.
   Verify: report exact commands and failures.

## Verification Approach

- Targeted Vitest for the new skill matcher/scorer behavior if the local native
  binding issue allows tests to run.
- Direct `tsx` smoke assertions for matcher and stats persistence.
- `npm --prefix bridge run typecheck`
- `npm run dashboard`

## Progress Log

- 2026-04-17: Created plan after user asked to add `iOS`, `Swift`,
  `iOS SDK`, and `C/C++`, fix short-word false positives, and surface matched
  vs unmatched skills in `web/index.html`.
- 2026-04-17: Updated `cv.md` Skills and `config/profile.yml` newgrad skill
  terms so `C/C++`, `iOS`, `Swift`, and `iOS SDK` are first-class profile
  keywords.
- 2026-04-17: Added bounded skill keyword matching and routed list scoring plus
  detail value scoring through the shared matcher. Added tests for `AI`,
  `Java`, `JavaScript`, `API`, `C/C++`, `iOS`, and `iOS SDK` behavior.
- 2026-04-17: Added `data/newgrad-skill-stats.json` generation. The bridge now
  writes last-scan matched/unmatched skill counts during list scoring and also
  records profile coverage from `cv.md`, `article-digest.md`, and
  `modes/_profile.md`.
- 2026-04-17: Added a Keywords tab to the static dashboard template and
  regenerated `web/index.html`.
- 2026-04-17: Restarted the local extension bridge on `127.0.0.1:47319` after
  rebuilding the extension so the next browser scan uses the updated matcher and
  stats writer.
- 2026-04-17: Expanded `cv.md` Skills into ATS-friendly categories containing
  the user's requested owned keywords, including Shell, ElementUI, SpringMVC,
  OpenAPI, OpenRouter API, R, HTML/CSS, Linux/Unix, security, systems, testing,
  and architecture terms.
- 2026-04-17: Expanded `config/profile.yml -> newgrad_scan.skill_keywords.terms`
  to 101 scanner terms with the user's requested keyword table, including
  `R`, `HTML/CSS`, `Linux/Unix`, `Spring (IOC, AOP)`, `JUnit 5`,
  `CORS/CSRF protection`, and full architecture/security pattern phrases.
- 2026-04-17: Added phrase aliases for the expanded scanner table so dashboard
  and config can use owned keyword names while matching common JD variants such
  as `HTML5`, `Unix`, `Spring Framework`, `JUnit5`, `CI/CD`, and `CORS`.
- 2026-04-17: Rebuilt and restarted the local extension bridge after the
  scanner keyword update so browser scans use the new matcher immediately.
- 2026-04-17: Ran a real `/v1/newgrad-scan/score` bridge smoke test against
  `127.0.0.1:47319` using three synthetic newgrad rows. The test verified that
  `R&D` does not match the `R` skill, that `R`, `Python`, `HTML/CSS`,
  `Linux/Unix`, `Spring (IOC, AOP)`, `JUnit 5`, `CORS/CSRF protection`, and
  `CI/CD pipeline` match through the live score endpoint, and that dashboard
  skill stats are written from the endpoint.

## Key Decisions

- Keep the dashboard static and repo-backed by writing a JSON stats artifact
  instead of introducing a dashboard server.
- Reuse one skill matcher for list scoring and detail value scoring so the
  rules stay consistent.
- Keep bootstrap scan counts empty (`rowsScored: 0`) until a real scan runs; the
  dashboard still shows profile coverage immediately.
- Use canonical owned-skill phrases in `config/profile.yml` and implement
  matching aliases in code instead of duplicating near-equivalent scanner terms,
  which would inflate skill hit counts.

## Risks And Blockers

- Vitest may still be blocked by the existing local `rolldown` native binding
  code-signature issue.
- Last-scan stats can only reflect rows passed into the bridge scoring request;
  rows filtered before extraction or historical rows without qualification text
  cannot be reconstructed exactly.

## Final Outcome

Implemented and verified with the available local checks.

Verification run:

- Direct `tsx` smoke assertion passed: `C++17` matches `C/C++`, `iOS SDK`
  matches both `iOS` and `iOS SDK`, `JavaScript` does not also match `Java`,
  and `Maintain` does not false-match `AI`.
- `npm run dashboard` passed and regenerated `web/index.html`.
- `npm --prefix bridge run typecheck` passed.
- `npm run ext:start` rebuilt the extension and started the bridge on
  `127.0.0.1:47319`.
- `config/profile.yml` scanner term parse check passed with 101 skill terms and
  0 case-insensitive duplicates.
- Direct `tsx` matcher smoke assertion passed: `R` does not match `R&D`; `R`,
  `Python`, and `HTML/CSS` match a skill list; `Linux/Unix`,
  `Spring (IOC, AOP)`, `JUnit 5`, `CORS/CSRF protection`, and `CI/CD pipeline`
  match common JD variants.
- `data/newgrad-skill-stats.json` was refreshed from the expanded scanner table,
  and `npm run dashboard` regenerated `web/index.html`.
- `npm run ext:start` rebuilt the extension and restarted the bridge on
  `127.0.0.1:47319` with the updated scanner code.
- Live bridge API smoke test passed: `POST /v1/newgrad-scan/score` returned
  `200`/`ok: true`; the `R&D` row had no matched skills; the phrase-alias row
  matched `R`, `Python`, `HTML/CSS`, `Linux/Unix`, `Spring (IOC, AOP)`,
  `JUnit 5`, `CORS/CSRF protection`, and `CI/CD pipeline`; the architecture row
  matched `AI customer service agent`, `Event-driven architecture`, and
  `Back-pressure handling`.
- After the live API smoke test, `data/newgrad-skill-stats.json` showed
  `rowsScored: 3`, and `npm run dashboard` regenerated `web/index.html` with
  those last-scan keyword stats.
- Targeted Vitest was attempted for `newgrad-scorer` and `newgrad-value-scorer`
  but failed before tests executed due the existing local `rolldown` native
  binding code-signature error.
