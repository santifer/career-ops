# Mode: tracker — Application Tracker

Read and display `data/applications.md`.

**Tracker format:**
```markdown
| # | Date | Company | Role | Score | Status | PDF | Report |
```

Canonical status values (see `templates/states.yml`): `Evaluated` → `Applied` → `Responded` → `Interview` → `Offer` / `Rejected` / `Discarded` / `SKIP`

- `Applied` = the candidate submitted their application
- `Responded` = a recruiter/company reached out and the candidate replied (inbound)
- Proactive outreach (e.g. LinkedIn) can be noted in the **Notes** column; it is not a separate canonical status

If the user asks to update a status, edit the matching row.

Also show stats:
- Total applications
- By status
- Average score
- % with PDF generated
- % with report generated
