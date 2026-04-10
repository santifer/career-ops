# Mode: tracker — Applications Tracker

Read and display `data/applications.md`.

**Tracker format:**
```markdown
| # | Date | Company | Role | Score | Status | PDF | Report |
```

Possible statuses: `Evaluated` → `Applied` → `Responded` → `Interview` → `Offer` / `Rejected` / `Discarded` / `SKIP`

- `Applied` = the candidate submitted the application
- `Responded` = a recruiter/company replied and the candidate is engaged (inbound)
- Proactive outbound contact, such as a LinkedIn power move, should go in notes rather than as a standalone status

If the user asks to update a status, edit the corresponding row.

Also show summary statistics:
- Total applications
- By status
- Average score
- % with generated PDF
- % with generated report
