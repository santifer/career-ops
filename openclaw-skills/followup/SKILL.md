---
name: followup
description: Track follow-up cadence for active job applications. Flag overdue and urgent follow-ups, generate tailored email and LinkedIn follow-up drafts, and maintain follow-up history. Use when asked to check follow-ups, draft follow-up messages, review application cadence, or manage post-application outreach.
---

# Follow-up Cadence Tracker

Track follow-up cadence for active applications. Generate drafts and maintain history.

## Data Sources

- **Applications**: `data/applications.md`
- **Follow-up history**: `data/follow-ups.md` (created on first use)
- **Evaluation reports**: `reports/` directory
- **User profile**: `config/profile.yml`
- **CV**: `cv.md`
- **LinkedIn outreach**: Use `linkedin-outreach` skill framework

## Step 1 — Compute Cadence

Read `data/applications.md` and `data/follow-ups.md`. For each active application (status `Applied`, `Responded`, `Interview`), compute:
- Days since last status change / application date
- Follow-up count from history
- Next follow-up due date

## Step 2 — Display Dashboard

```
Follow-up Dashboard — {date}
{N} applications tracked, {N} actionable

| # | Company | Role | Status | Days | Follow-ups | Next Due | Urgency | Contact |
```

Sort by urgency: **URGENT** > **OVERDUE** > **waiting** > **COLD**

- **URGENT** — company replied, respond within 24 hours
- **OVERDUE** — follow-up past due
- **waiting (X days)** — on track
- **COLD** — 2+ follow-ups sent, no response; suggest closing

If no actionable entries, tell the user: "No active applications need follow-up right now."

## Step 3 — Generate Follow-up Drafts

Generate drafts only for **overdue** or **urgent** entries.

Read the linked evaluation report for company context. Read `config/profile.yml` for candidate name and `cv.md` for proof points.

### Email Draft Framework (first follow-up, count == 0)

4 sentences max, under 150 words:

1. **Reference** the specific role + application date. Name the company and role title.
2. **Value-add** — one concrete proof point from report or CV. Quantify if possible.
3. **Soft ask** — offer a specific time window ("this week", "next Tuesday").
4. **Optional** — brief mention of a relevant project or achievement.

**Rules:**
- Professional but warm, NOT desperate
- NEVER use "just checking in", "just following up", "touching base", or "circling back"
- Lead with value, not the ask
- Reference something specific to that company
- Include a subject line

### LinkedIn Follow-up (no email contact)

Reuse the `linkedin-outreach` skill framework: 3 sentences, 300 character max. Suggest the user find the right person first.

### Second Follow-up (count == 1)

Shorter (2-3 sentences). Take a new angle — share an insight, article, or project update. Don't repeat first follow-up content.

### Cold Application (count >= 2)

Do NOT generate another draft. Suggest:
- Update status to `Discarded` if the role seems filled
- Try a different contact
- Keep in `Applied` but deprioritize

## Step 4 — Present Drafts

```
## Follow-up: {Company} — {Role} (#{num})

**To:** {email or "No contact found"}
**Subject:** {subject line}
**Days since application:** {N}
**Follow-ups sent:** {N}
**Channel:** Email / LinkedIn

{draft text}
```

## Step 5 — Record Follow-ups

Only record follow-ups the user confirms they sent.

1. If `data/follow-ups.md` doesn't exist, create it with a header table:
   ```
   | # | App# | Date | Company | Role | Channel | Contact | Notes |
   ```
2. Append a row with all details.
3. Update the Notes column in `data/applications.md` with "Follow-up {N} sent {YYYY-MM-DD}".

## Step 6 — Summary

```
- {N} applications tracked
- {N} overdue — drafts generated above
- {N} urgent — respond today
- {N} waiting — on schedule
- {N} cold — consider closing

Review the drafts and tell me which ones you've sent so I can record them.
```

## Cadence Rules

| Status | First follow-up | Subsequent | Max attempts |
|--------|----------------|------------|-------------|
| Applied | 7 days | Every 7 days | 2 (then cold) |
| Responded | 1 day (urgent) | Every 3 days | No limit |
| Interview | 1 day (thank-you) | Every 3 days | No limit |
