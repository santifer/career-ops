---
name: tracker
description: Read and display the applications tracker, show statistics, and update application statuses on request.
---

# Mode: tracker — Application Tracker

Read and display `data/applications.md`.

**Tracker format:**
```markdown
| # | Date | Company | Role | Score | Status | PDF | Report |
```

Possible statuses: `Evaluated` → `Applied` → `Responded` → `Contacted` → `Interview` → `Offer` / `Rejected` / `Discarded` / `DO NOT APPLY`

- `Applied` = the candidate submitted their application
- `Responded` = A recruiter/company contacted the candidate and they responded (inbound)
- `Contacted` = The candidate proactively contacted someone at the company (outbound, e.g. LinkedIn power move)

If the user asks to update a status, edit the corresponding row.

Also show statistics:
- Total applications
- By status
- Average score
- % with PDF generated
- % with report generated
