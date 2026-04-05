# Mode: rejection — Rejection Analysis & Learning Loop

When the user reports a rejection, capture structured data and surface patterns over time.

**This mode is additive.** It uses the existing notes column in applications.md (no new columns) and appends a section to existing reports (no changes to report format).

## When to Trigger

- User says "I got rejected from [company]"
- User updates a tracker entry to Rejected
- User runs `/career-ops rejection` to review patterns

## Step 1 — Record the Rejection

Update the entry in `data/applications.md`:
- Status → `Rejected`
- Notes → append rejection info in compact format: `REJ@{stage}:{reason}`

**Stages** (ask the user which applies):
| Stage | Code | Meaning |
|-------|------|---------|
| Resume screen | `resume` | Rejected before any human contact |
| Phone screen | `phone` | Rejected after initial call |
| Technical interview | `tech` | Rejected after technical assessment |
| Hiring manager | `hm` | Rejected after HM interview |
| Final round | `final` | Rejected at final stage |
| Offer pulled | `offer` | Offer was extended then retracted |
| Unknown | `unk` | User doesn't know |

**Reasons** (ask the user if they have signal, otherwise `unk`):
- `exp` — not enough experience / seniority
- `skill` — missing specific technical skill
- `culture` — culture/team fit
- `comp` — comp expectations too high
- `geo` — location/timezone mismatch
- `internal` — went with internal candidate
- `closed` — role was closed/frozen
- `unk` — no feedback given

Example notes: `REJ@tech:skill — failed system design round`

## Step 2 — Append to Report

If a report exists in `reports/`, append a `## Rejection` section:

```markdown
## Rejection
**Date:** YYYY-MM-DD
**Stage:** Technical interview
**Reason:** Missing specific skill (system design at scale)
**Signal:** What this tells us about future applications for this archetype
```

## Step 3 — Pattern Analysis

When the user runs `/career-ops rejection` (without a specific company), analyze ALL rejected entries:

1. **Read** `data/applications.md` — filter to Rejected entries
2. **Parse** `REJ@{stage}:{reason}` from notes column
3. **Aggregate** patterns:

```
## Rejection Patterns — {date}

### By Stage
- Resume screen: N rejections (N% of all rejections)
- Technical: N rejections
- ...

### By Archetype
- LLMOps roles: N/M rejected (N% rejection rate)
- Platform roles: N/M rejected
- ...

### By Score Range
- Score 4.0+: N/M rejected (should be low — if high, scoring model needs recalibration)
- Score 3.0-3.9: N/M rejected
- Score <3.0: N/M rejected (expected to be high)

### Signals
- [If 3+ resume-screen rejections for same archetype]: "Consider stronger keyword injection for {archetype} roles — see pdf.md anti-AI-detection rules"
- [If high-score offers getting rejected]: "Scoring model may be inflated — review calibration anchors in _shared.md"
- [If rejections cluster at tech stage]: "Story bank may need stronger technical stories for {archetype} — review interview-prep/story-bank.md"
- [If comp rejections]: "Consider adjusting target range in config/profile.yml"
```

## What This Mode Does NOT Do

- Does NOT change the scoring model or thresholds automatically
- Does NOT modify reports retroactively (only appends Rejection section)
- Does NOT add new columns to applications.md (uses notes column)
- Does NOT require any changes to merge-tracker, dedup, or verify scripts
