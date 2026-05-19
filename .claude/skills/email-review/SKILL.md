---
name: email-review
description: Review today's archived [career-ops] heartbeat email at 09:30 PT — invokes the email-review-strategist orchestrator which reads the dated HTML in data/heartbeat-archive/, runs 5 parallel analyzers (copy / design / action / cognitive-load / recipient-simulator), deliberates contested findings via /council, ranks via email-review-adjudicator, polishes via email-review-polisher, and ships AUTO-APPLY-eligible patches to scripts/heartbeat.mjs on a feature branch with draft PR + single-command rollback. North star is action-conversion (Ready → Applied, Due → Sent), NOT aesthetic refinement; cosmetic findings auto-defer during runway-critical state. Tracking-critical patterns (role IDs, scores, apply URLs, statuses, touch counts) are regex-blocked from patch generation. Trigger when Mitchell types /email-review, says "review today's heartbeat," "audit the heartbeat email," "what's hurting heartbeat conversion," "find friction in this morning's email," "run the email review," or any phrasing that wants the daily review fired manually instead of waiting for the 09:30 launchd job. First run invokes email-review-setup-wizard automatically; subsequent runs are silent + config-driven.
user_invocable: true
args: query
argument-hint: "[--dry-run] [--date YYYY-MM-DD] [--lens copy_hierarchy|visual_rhythm_and_spacing|action_conversion_friction|accessibility_and_mobile_rendering|weekly_council_retrospective] [--no-council] [--budget 1.50]"
---

# email-review — Daily heartbeat-email review + auto-implementer

## What this skill does

Reads `data/heartbeat-archive/heartbeat-<today>.html` (the dated HTML archive of the same email scripts/heartbeat.mjs sent to Mitchell at 09:00 PT) and produces patches that improve **action-conversion** — turning "Ready to Apply" into "Applied," and "Due Today" into "Sent."

Ten-phase pipeline run by the `email-review-strategist` subagent:

1. **Config + preconditions** — read `.claude/config/email-review.yaml`, halt if missing or stale (>30 days since last wizard run), confirm today's archive exists
2. **Intake** — parse heartbeat sections, diff against yesterday, pull live state from `data/pipeline.md` + `reports/`
3. **Recipient simulation** — role-play Mitchell at 09:01 PT phone-first, dark mode, scattered-mode possible (Brain-grounded via `personality-adhd-profile.md` + `personality-emotional-architecture.md`)
4. **Parallel analysis** (serial under launchd) — 5 specialists analyze copy / design / action / cognitive-load + a researcher pulls current operational-dashboard practices
5. **Adjudication** — `email-review-adjudicator` ranks findings, weighting action-analyzer 2x, auto-downgrading cosmetic findings during runway-critical state, capping at 5 Critical/High + 3 Medium
6. **Council deliberation** — `/council` is invoked for every Critical/High finding + every finding < 0.85 confidence with four persona briefs (CRM lead, ops-dashboard UX, brand-voice director, accessibility auditor)
7. **Implementation eligibility** — auto-apply gate (conf ≥ 0.95 + 4/4 or 3/4-no-reject + reversible + not tracking-critical + accelerates_action/reduces_friction); held-for-review otherwise
8. **Patch generation** — `email-implementer` produces minimal unified diffs against `scripts/heartbeat.mjs` and its template helpers (`lib/heartbeat-system-banner.mjs`, `lib/tpgm-heartbeat-section.mjs`); regex-blocked from modifying tracking-critical patterns
9. **Verification** — `change-verifier` applies patch to temp branch, renders sample, diffs against today's archive for tracking-critical byte-identity, validates WCAG 2.2 AA + voice compliance
10. **Application** — `change-applier` branches `email-review/<date>-<slug>`, commits with prefix `email-review:`, opens draft PR (per repo single-env policy, never direct-to-main); held patches written as draft PRs with `[HELD]` label

**Cost cap:** $1.50 per run (per-run), $30/month (per the Decision-Maximization Policy this is intentionally tight — quality over quantity, with the runway-critical gate filtering out cosmetic churn).

**Schedule:** launchd at 09:30 PT (30 minutes after heartbeat.mjs sends at 09:00 PT). Saturday + Sunday skipped per `novelty_rotation` config.

**Novelty rotation** (weekday → analytical lens that gets primary weight):
- Mon: copy_hierarchy
- Tue: visual_rhythm_and_spacing
- Wed: action_conversion_friction
- Thu: accessibility_and_mobile_rendering
- Fri: weekly_council_retrospective + weekly impact digest

## When to trigger

- `/email-review` — run today's review with the rotation's lens
- `/email-review --dry-run` — analyze only, write no patches
- `/email-review --date 2026-05-18` — re-review a past archive
- `/email-review --lens action_conversion_friction` — force a specific lens
- "review today's heartbeat email"
- "audit the heartbeat — what's stalling Apply clicks"
- "find friction in this morning's heartbeat"
- "what would the email reviewer say about today's heartbeat"
- "run the email-review job"

Also fires automatically via `~/Library/LaunchAgents/com.mitchell.career-ops.email-review.plist` at 09:30 PT Mon–Fri.

## First-run behavior

If `.claude/config/email-review.yaml` does not exist OR `last_wizard_run` is >30 days old, the orchestrator hands off to `email-review-setup-wizard` which:

1. Validates infrastructure (researcher / /council / heartbeat.mjs / cv.md / voice-reference.md / modes/ all present)
2. Confirms repo root + Second Brain location (extracts `~/Downloads/second-brain.zip` if not already extracted)
3. Builds `.claude/knowledge/career-ops/corpus-map.yaml` from actual repo state (uses `modes/_profile.md` + `interview-prep/story-bank.md` — NOT the prompt's nonexistent `profile/` and `story-bank/` directories)
4. Proposes a diff to `scripts/heartbeat.mjs` to also write the rendered HTML to `data/heartbeat-archive/heartbeat-<date>.html` (requires Mitchell's explicit confirmation before applying)
5. Verifies `/council` skill signature (writes adapter at `.claude/agents/_adapters/council-adapter.md` if signature differs)
6. Reconciles voice — diffs `writing-samples/voice-reference.md` against `personality-communication-style.md`, surfaces conflicts, writes resolved rules to `.claude/knowledge/career-ops/voice-resolved.md`
7. Generates `.claude/scheduler/com.mitchell.career-ops.email-review.plist` + `run-email-review.sh` (does NOT auto-install — prints `launchctl bootstrap` command for Mitchell to run)
8. Writes final `.claude/config/email-review.yaml` validated against `email-review.schema.yaml`
9. Offers an optional dry-run against today's archive

## Hard constraints

- **No production direct-writes.** Every patch → feature branch → draft PR. Verifier rejects direct main writes.
- **Tracking-critical patterns are regex-blocked** from any patch (role IDs `#\d+`, scores `\d+\.\d+ / 5`, "Apply Pack", "Mark Applied", "day N · N touches", timestamps, script invocations, file paths in `scripts/` / `data/`).
- **Reversibility is non-negotiable.** Every applied change has a one-command rollback (`git revert <SHA>`).
- **Findings without citations are dropped at adjudication.** Every finding cites a KB path + Brain anchor + corpus anchor where relevant.
- **Deep over broad.** Hard cap: 5 Critical/High + 3 Medium emitted per run; the rest archived to `.claude/audit/email-review/`.
- **RSD-safe framing** enforced by polisher: no "failed/broken/wrong" language; "friction-point" / "held for review" / "candidate for improvement" only.
- **Win-naming mandatory on Fridays** — Effort & trajectory section non-optional in the weekly digest.

## Outputs

```
.claude/audit/email-review/
├── <YYYY-MM-DD>-report.md                # Daily review report
├── <YYYY-MM-DD>-changelog.md             # What auto-applied + rollback commands
├── <YYYY-MM-DD>-patches/                 # Per-finding unified diffs
│   ├── <severity>-<slug>.patch
│   └── ...
├── weekly-<ISO-week>-impact.md           # Friday-only — trajectory + council retrospective
├── cron.log                              # launchd stdout/stderr trail
├── launchd-stdout.log
└── launchd-stderr.log
```

Per-day git artifacts: feature branches `email-review/<YYYY-MM-DD>-<slug>` and draft PRs on `mitwilli-create` fork (never santifer upstream — per global guardrail).

## Cost economics

| Component | Spend per run |
|---|---|
| 5 parallel analyzers (Sonnet 4.6) | ~$0.40 |
| recipient simulator (Sonnet 4.6, prereq) | ~$0.05 |
| researcher (Haiku 4.5 for cached lookup, monthly refresh on Sonnet) | ~$0.05 |
| adjudicator (Opus 4.7) | ~$0.10 |
| /council (4 persona votes per contested finding) | ~$0.50 typical, capped |
| polisher (Sonnet 4.6) | ~$0.05 |
| implementer + verifier + applier (Sonnet 4.6) | ~$0.30 |
| **Per-run cap** | **$1.50** |
| **Monthly cap** | **$30** (20 review days × $1.50) |
