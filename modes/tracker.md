# Mode: tracker — Applications tracker

Read and display `data/applications.md`.

**Tracker format:**

```markdown
| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
```

**Allowed status values** (must match `templates/states.yml` exactly — case-insensitive):

`Evaluated` → `Applied` → `Responded` → `Interview` → `Offer` / `Rejected` / `Discarded` / `SKIP`

- **Evaluated** — Offer evaluated with report; decision pending  
- **Applied** — Application submitted  
- **Responded** — Recruiter or company reached out and the candidate replied (inbound)  
- **Interview** — Active interview process  
- **Offer** — Offer received  
- **Rejected** — Rejected by the company  
- **Discarded** — Closed or discarded by the candidate  
- **SKIP** — Poor fit; do not apply  

Use the **Notes** column for extra context (e.g. proactive LinkedIn outreach before or after apply).

If the user asks to update a status, edit the corresponding row.

Also show stats:
- Total applications  
- Count by status  
- Average score  
- % with PDF generated  
- % with report generated  
