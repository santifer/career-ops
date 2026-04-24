# Reports Context

`reports/` is user layer. It stores evaluation reports and related generated review artifacts.

Report names follow:

```text
{###}-{company-slug}-{role-slug}-{YYYY-MM-DD}.md
```

Use the next 3-digit number by checking existing reports and tracker entries.

Reports must include a header with at least:

- score
- URL
- PDF status/link when applicable
- legitimacy tier

Do not overwrite an existing report unless the user asks for a revision. If revising, preserve the old decision trail when useful.

After creating a report for a new evaluation, write the tracker addition as TSV under `batch/tracker-additions/` and run `node merge-tracker.mjs`.
