---
name: data-truth-audit
description: Audit every computed metric on the career-ops dashboard for accuracy, freshness, source-attribution, and null-handling. Use when Mitchell asks "are the dashboard numbers accurate", "audit my metrics", "trace metric X back to source", "find stale data on the dashboard", "is the runway widget lying", or types /data-truth-audit.
user_invocable: true
metadata:
  type: audit
  origin: γ GAMMA overnight 2026-05-19
  baseline_report: data/gamma-audit-2026-05-19.md
---

# data-truth-audit — Are the dashboard numbers true?

This skill runs `scripts/agents/data-truth-auditor.mjs` against the current state of the codebase. It's a recurring follow-up to the original γ GAMMA audit (`data/gamma-audit-2026-05-19.md`), which surfaced 1 CRITICAL false attribution, 3 hardcoded-date LLM prompts, and 2 silent-zero fallbacks.

## When to invoke

Trigger phrases:
- "audit my dashboard metrics"
- "are the numbers on the dashboard accurate"
- "trace metric X back to source"
- "find stale data on the dashboard"
- "is metric X lying"
- "/data-truth-audit"

Run it any time after touching `lib/*.mjs`, `dashboard-server.mjs`, or `scripts/build-dashboard.mjs` — the sweeps below catch the specific regression patterns γ found in the overnight build.

## What it does

Four sweeps:

1. **False attribution sweep** — greps `scripts/build-dashboard.mjs` for every `lib/X.mjs` string reference inside tooltips, "View source" links, and source comments. Verifies each referenced file exists. The original γ audit found a runway tooltip claiming compute lived in `lib/recruiter-pipeline-density.mjs` — a file that did not exist.

2. **Hardcoded date sweep** — searches `lib/*.mjs` for `Today is YYYY-MM-DD` literals in non-comment code. The γ audit found 3 LLM prompts with `"Today is 2026-05-17 PT"` baked in; every call from those entry points lied about the date.

3. **Inventory consistency** — re-checks every metric in the latest `data/gamma-metric-inventory-*.json` against the codebase. Surfaces metrics whose claimed compute library no longer exists.

4. **Silent-zero pattern check** — heuristic scan for `return { x: 0, ..., error: ... }` style blocks. The γ audit found `lib/alignment-scorer.mjs:188` returning three confident zeros when a source report was missing, which rendered as three confidently-bad 0% bars on the dashboard.

## How to invoke

```bash
# Full audit + write report to data/data-truth-audit-{date}.md
node scripts/agents/data-truth-auditor.mjs --all

# Just the attribution sweep
node scripts/agents/data-truth-auditor.mjs --check-attribution

# Just the hardcoded-date sweep
node scripts/agents/data-truth-auditor.mjs --check-dates

# JSON output for programmatic consumers
node scripts/agents/data-truth-auditor.mjs --all --json
```

The CLI prints a one-line per-sweep summary and (for `--all`) writes a markdown report.

Exit code:
- `0` — no findings
- `1` — at least one finding requires review

## Example invocations

**Mitchell:** "audit the dashboard for metric truth"
**You:**
```bash
node scripts/agents/data-truth-auditor.mjs --all
```

Then read `data/data-truth-audit-{TODAY}.md`, summarize the findings, and tier them AAA / AA / A / B same as the original γ audit. For each AAA, propose an inline fix.

**Mitchell:** "is the runway widget tooltip still pointing at a real file?"
**You:**
```bash
node scripts/agents/data-truth-auditor.mjs --check-attribution
```

**Mitchell:** "I just edited a bunch of lib files — check nothing regressed"
**You:**
```bash
node scripts/agents/data-truth-auditor.mjs --all
```
Then walk every finding and report what needs fixing.

## Inputs / outputs / constraints

**Inputs:**
- The current state of `scripts/build-dashboard.mjs`, `dashboard-server.mjs`, and every file under `lib/*.mjs`.
- The latest `data/gamma-metric-inventory-*.json` if present (otherwise the inventory sweep skips with a warning).

**Outputs:**
- Stdout summary
- `data/data-truth-audit-{YYYY-MM-DD}.md` (when `--all`)

**Constraints:**
- Pure read-only. The auditor never modifies code; it only reports.
- All findings cite file:line. No fabricated severities.
- Comment-only matches are excluded from the hardcoded-date sweep (looking for runtime-effective strings, not provenance comments).

## Anti-hallucination reminders

- Every claim this skill emits MUST be grounded in a file:line read or grep hit.
- If a metric is unfamiliar, mark it `unknown` — never `OK`.
- Never report "all metrics fine" if a sweep was skipped — name the skip explicitly.
- The auditor's heuristics produce false positives (especially the silent-zero scan); flag those for human review rather than silently dropping them.

## Anti-sycophancy reminders

- Bob the Drag Queen voice when reporting: name the metrics that were lying, and the ones that weren't. Praise nothing for free.
- If the audit comes back clean, say "clean today — but run this again after your next merge."
- If the audit comes back dirty, name every finding by file:line and severity. Do not soften CRITICAL into "minor".
- If Mitchell pushes back on a finding, recheck the evidence — but don't drop it just because he objected.

## Provenance

Originally written by γ GAMMA during the overnight 2026-05-19 build (see `data/overnight-haul-2026-05-19.md` Task Γ.8). The original audit findings + AAA fixes are preserved at:
- `data/gamma-audit-2026-05-19.md` — the findings
- `data/gamma-metric-inventory-2026-05-19.json` — the 22-metric inventory
- 8 commits with `(γ audit XXX)` in the message — the fixes

The 7 voices in `data/overnight-haul-2026-05-19.md` Sunrise Brief section assigned γ a "Bob the Drag Queen" voice. This skill's reporting style inherits that voice: NYC truth-teller, purse-first, reads the lying metrics for filth.
