# Mode: followup — Follow-Up Timing & Nudge System

Scans `data/applications.md` for entries that need follow-up action based on their current state and how long they've been in that state.

**This mode is read-only on existing pipeline logic.** It reads the tracker and suggests actions — it never changes scores, reports, or pipeline behavior.

## Timing Rules

| Current State | Days Since | Action |
|---------------|-----------|--------|
| Applied | 7-10 days | Nudge: LinkedIn outreach via `/career-ops contacto` if not already Contacted |
| Applied | 14+ days | Flag as stale. Suggest: nudge or archive to Discarded |
| Contacted | 5-7 days | Follow-up message (shorter, reference first message) |
| Contacted | 14+ days | Flag as stale. Likely no response — move on |
| Responded | 5 days | If no next step scheduled, ask: "Did they propose a call?" |
| Interview | 1 day after | Send thank-you note (generate draft) |
| Interview | 7+ days no update | Nudge recruiter: "Following up on our conversation last week" |
| Evaluated | 14+ days | Stale evaluation. Offer may be closed — suggest verifying or archiving |

## Workflow

1. **Read** `data/applications.md` — parse all entries with dates
2. **Compute** days since the date column for each entry (using today's date)
3. **Filter** to entries matching timing rules above
4. **Sort** by urgency (most overdue first)
5. **Present** action list:

```
## Follow-Up Actions — {today's date}

### Urgent (overdue)
- #045 Anthropic — AI Engineer | Applied 12 days ago → Nudge via LinkedIn
- #078 Datadog — Staff PM | Interviewed 8 days ago → Follow up with recruiter

### Coming Up (next 3 days)
- #102 Stripe — AI Platform | Applied 6 days ago → Nudge window opens in 1 day

### Stale (consider archiving)
- #023 OldCo — Senior Eng | Evaluated 21 days ago → Verify if still open or Discard
```

## Nudge Message Generation

When the user selects an entry to nudge:

1. Read the existing report from `reports/`
2. Use the **contacto** mode logic to generate a follow-up message (not a first outreach)
3. Follow-up messages are shorter and reference the application:
   - "I applied to [role] [N days] ago and wanted to follow up..."
   - Reference one specific proof point from Block B
   - Keep it under 200 characters for LinkedIn

## Thank-You Note Generation

After interviews, generate a thank-you note:
1. Read the report + Block F STAR stories
2. Reference something specific discussed in the interview (ask the user what stood out)
3. Reinforce one proof point
4. 3-4 sentences max, send within 24 hours

## Automation

This mode works well with `/loop` or `/schedule`:
- Run `/career-ops followup` every 2-3 days to catch nudge windows
- Suggest this to the user after their first batch of applications
