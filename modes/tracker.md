# Mode: tracker — Applications Tracker

Read and display `data/applications.md`.

**Tracker format:**
```markdown
| # | Date | Company | Role | Score | Status | PDF | Report |
```

Possible statuses: `Evaluated` → `Applied` → `Responded` → `Contact` → `Interview` → `Offer` / `Rejected` / `Discarded` / `SKIP`

- `Applied` = candidate submitted their application
- `Responded` = a recruiter/company contacted and the candidate responded (inbound)
- `Contact` = candidate proactively reached out to someone at the company (outbound, e.g., LinkedIn outreach)

If the user asks to update a status, edit the corresponding row.

Also display statistics:
- Total applications
- By status
- Average score
- % with PDF generated
- % with report generated
