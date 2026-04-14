# Mode: tracker — Applications Tracker (US Pipeline)

Read and display `data/applications.md`.

**This is the US pipeline tracker.** Only show entries with `geo: US` or no geo specified. UK/EMEA roles belong in the co-uk pipeline and should not appear here.

**Format:**
```markdown
| # | Date | Company | Role | Location | Remote | Score | Status | PDF | Report | Notes |
```

- **Location**: city/country from JD (e.g. `San Francisco, CA`, `Remote US`, `London, UK`)
- **Remote**: `remote`, `on-site`, or `unknown`

Canonical statuses: `Evaluated` → `Applied` → `Responded` → `Interview` → `Offer` / `Rejected` / `Discarded` / `SKIP`

- `Applied` = application submitted by candidate
- `Responded` = recruiter/company reached out and candidate replied (inbound)
- `Interview` = active interview process

If the user asks to update a status, edit the row directly in `data/applications.md`.

Also show stats:
- Total evaluations
- By status
- Average score
- % with PDF generated
- % with report generated
