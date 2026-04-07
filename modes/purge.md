# Mode: PII Purge

**Trigger:** `/career-ops purge-pii`

## Purpose

Scan data files for PII (Personally Identifiable Information) tags and redact expired entries on user confirmation.

## Workflow

1. Scan all files in `data/`, `reports/`, and `intel/` for `<!-- PII: Name, source, date -->` tags.
2. Present a summary to the user:
   - Total PII tags found
   - Breakdown by age (older than retention period vs. recent)
   - List of names and sources
3. **NEVER auto-purge.** Always ask the user for confirmation before redacting any content.
4. On confirmation, redact the selected PII blocks using `redactPII()` from `intel/purge-pii.mjs`.
5. Report what was redacted.

## PII Tag Format

```markdown
<!-- PII: Contact Name, data source, YYYY-MM-DD -->
Sensitive content here (emails, phone numbers, personal details).
<!-- END PII -->
```

## Safety Rules

- **NEVER automatically purge PII.** Always present findings and wait for explicit user confirmation.
- Default retention: 90 days. User can override with `purge-pii --retention 30`.
- Redacted blocks are replaced with `<!-- PII REDACTED: YYYY-MM-DD -->` markers.
- Only redact blocks matching the confirmed date/criteria.
