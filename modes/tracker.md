# Mode: tracker -- Application Tracker

Read and display `data/applications.md`.

**Tracker format:**
```markdown
| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
```

Canonical states (from `templates/states.yml`):
`Evaluated` → `Applied` → `Responded` / `Contacted` → `Interview` → `Offer` / `Rejected` / `Discarded` / `SKIP`

- `Applied` = candidate submitted their application
- `Responded` = a recruiter/company reached out and the candidate replied (inbound)
- `Contacted` = candidate proactively reached out to someone at the company (outbound, e.g. LinkedIn power move)

If the user asks to update a status, edit the corresponding row.

Also show statistics:
- Total applications
- By status
- Average score
- % with PDF generated
- % with report generated
