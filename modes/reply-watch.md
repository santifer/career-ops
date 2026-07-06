# Mode: reply-watch -- Employer Reply Digest

Summarize recruiting-related inbox replies so the candidate can answer one
daily question: "Do any employer replies need my attention?"

This mode is read-only by default. It never sends email, never clicks links,
never submits applications, and never changes tracker state without explicit
user confirmation.

Related planning issues:
- #1582 -- umbrella
- #1583 -- read-only Gmail reply scanner
- #1584 -- match reply candidates to tracker entries
- #1585 -- classify replies and generate a daily action digest

## Purpose

Detect and summarize replies from employers, recruiters, hiring managers, and
companies after the candidate has applied or followed up.

## Inputs

Read:
- `data/applications.md` -- application tracker
- `data/follow-ups.md` if present -- prior outreach history
- `config/profile.yml` if present -- candidate identity and optional email
  preferences
- `modes/_custom.md` if present -- procedural preferences only
- Normalized reply candidates supplied by an opt-in connector, plugin, or manual
  paste/export

Do not read arbitrary files outside the career-ops project for content claims.
Do not use memory as a source for facts about applications.

## Invocation

Supported forms:

1. `/career-ops reply-watch`
   - Use available normalized reply candidates from the configured inbox
     connector, if one exists.
   - If no connector is configured, explain that the mode can still classify
     pasted/exported message summaries and point to the read-only Gmail scanner
     planning issue (#1583).

2. `/career-ops reply-watch {pasted email summaries}`
   - Treat the pasted content as candidate-supplied context for this run only.
   - Extract sender, subject, date, snippet/body summary, and any visible company
     or role signals.

3. `/career-ops inbox-watch`
   - Alias for `reply-watch`.

## Step 1 -- Collect Reply Candidates

Accept normalized candidates with fields like:

```json
{
  "messageId": "provider-specific-id",
  "date": "YYYY-MM-DD",
  "from": "Recruiter Name <recruiter@example.com>",
  "subject": "Re: Senior AI Engineer application",
  "snippet": "Could you share availability for a first conversation?",
  "bodySummary": "Optional short summary from the connector",
  "source": "gmail"
}
```

If the data source is unavailable, do not fail the whole mode. Say:

> "No inbox connector is configured yet. Paste the message summaries here, or
> enable a read-only inbox plugin when one is available."

## Step 2 -- Match to Applications

Match candidates against `data/applications.md` using conservative signals:

- company name in sender, subject, snippet, body summary, or sender domain
- role title overlap
- ATS or recruiter domain hints
- application date before message date
- known contacts from tracker notes or `data/follow-ups.md`

Use confidence buckets:

| Confidence | Meaning |
|------------|---------|
| `high` | Multiple strong signals identify one tracker row |
| `medium` | One strong signal or several weak signals identify one likely row |
| `low` | Recruiting-related, but the tracker row is ambiguous |
| `unmatched` | No plausible tracker row |

Prefer false negatives over false positives. Never update the tracker from a
`medium`, `low`, or `unmatched` candidate without asking the user to choose the
row.

## Step 3 -- Classify Reply Type

Classify each candidate:

| Type | Use when |
|------|----------|
| `Interview` | The message invites the candidate to interview, screen, or schedule a call |
| `Need Action` | The candidate must pick times, complete a form, provide documents, or reply by a deadline |
| `Responded` | A human reply or next-step conversation that is not clearly an interview |
| `Rejected` | The candidate is rejected, the role is closed for them, or the company will not proceed |
| `Auto-confirmation` | Automated application receipt, newsletter, alert, or no-reply confirmation |
| `Unknown` | Recruiting-related but not confidently classifiable |

Auto-confirmations are useful context but should not be counted as employer
responses needing action.

## Step 4 -- Display Daily Digest

Show urgent/actionable replies first, then informational items.

Use this shape:

```text
Reply Watch -- {date}
{N} recruiting replies reviewed, {M} need attention

1. {Company} -- {Role} (#{num or "unmatched"})
   Type: {Interview | Need Action | Responded | Rejected | Auto-confirmation | Unknown}
   Match: {high | medium | low | unmatched}; signals: {signals}
   Summary: {one sentence}
   Suggested tracker update: {Interview | Responded | Rejected | none | ask user}
   Recommended action: {reply today | review manually | no action}
```

Keep summaries short. Do not quote long email bodies. If the pasted message
contains sensitive personal data, paraphrase rather than repeating it.

## Step 5 -- Human-in-the-Loop Tracker Updates

Suggest tracker updates, but do not apply them unless the user explicitly says
to update the tracker.

Suggested mapping:

| Reply type | Suggested tracker state |
|------------|-------------------------|
| `Interview` | `Interview` |
| `Need Action` for scheduling/interview | `Interview` |
| `Responded` | `Responded` |
| `Rejected` | `Rejected` |
| `Auto-confirmation` | no status change |
| `Unknown` | no status change |

If the user approves a tracker update:

1. Update the existing row in `data/applications.md`.
2. Do not create a new application row.
3. Keep statuses canonical from `templates/states.yml`.
4. Add a short note such as `Reply Watch: interview invite 2026-07-06`.
5. Run `node verify-pipeline.mjs`.

## Step 6 -- Summary

End with:

- number of replies reviewed
- number needing action today
- recommended tracker updates waiting for confirmation
- unmatched replies the user should review manually

If no actionable replies are found, say:

> "No employer replies need action today."
