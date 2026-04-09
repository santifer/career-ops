# Mode: import — One-Time Airtable Import

Import unevaluated roles from the Airtable "Active Opps" view into the career-ops pipeline.

## When to Use

- First-time setup: bootstrap pipeline from existing Airtable data
- The user says "import from Airtable" or "pull roles from Airtable"

## Process

### 1. Read Active Opps

Read `modes/_profile.md` Airtable config to get:
- `base_id`
- `tables.roles.id`
- `tables.roles.views.active_opps`

Use `list_records_for_table` with the view parameter to read all Roles in the Active Opps view. Page through all results.

For each record, extract:
- Company name (resolve from linked Company record if needed)
- Role title (field: `role`)
- URL (field: `link`)
- Current Status (field: `status`)
- Notes (field: `notes`)

### 2. Filter Against Pipeline

Read `data/pipeline.md`. Extract all URLs from both Pendientes and Procesadas sections.

For each Airtable role:
- If the URL already appears in `pipeline.md` → skip (already tracked)
- If the URL is blank/missing → skip (can't evaluate without a URL, log warning)

### 3. Add to Pipeline

Append matching roles to the `## Pendientes` section of `data/pipeline.md`:

```
- [ ] {url} | {company} | {role}
```

### 4. Report

Tell the user:
> "Found N roles in Airtable Active Opps. Added M to pipeline (K already tracked, J had no URL)."
>
> "Run evaluations with normal career-ops flow. Roles scoring >= 3.0 will sync back to Airtable. For roles already past 'New Listing' status in Airtable, their status will be preserved."

### 5. Post-Evaluation Write-Back

After evaluating imported roles, the sync gate in `modes/oferta.md` Step 3 handles write-back automatically. The key rule for imported roles:

- If the role's Airtable Status was blank or "New Listing" → overwrite with "Evaluated"
- If the role's Airtable Status was anything else → preserve it, only update Rating, Notes, Salary, Remote, Latest Date

This is handled by the standard sync logic — no special import-specific code needed.
