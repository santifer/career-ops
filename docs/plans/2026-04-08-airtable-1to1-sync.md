# Airtable 1:1 Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Airtable base and career-ops pipeline to 1:1 parity — career-ops evaluates, Airtable reflects the results.

**Architecture:** Mode-integrated sync using Airtable MCP tools. No new scripts or background processes. Claude reads/writes Airtable inline during evaluations via the MCP tools already connected. Config and field IDs live in `modes/_profile.md`.

**Tech Stack:** Airtable MCP tools, YAML config, Markdown modes

**Spec:** `docs/specs/2026-04-08-airtable-1to1-sync-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `templates/states.yml` | Modify | Add 10 new states, add `airtable_value` field to all states |
| `modes/_profile.md` | Create (from template) | Add Airtable config block with base/table/field IDs |
| `modes/oferta.md` | Modify | Replace Step 3 with full sync gate + field mapping + status rules |
| `modes/import.md` | Create | One-time Airtable import mode |
| `data/pipeline.md` | Create (if missing) | Pipeline inbox for imported URLs |

**Airtable changes (via MCP tools, not local files):**
- Roles table: new `Status Direct` single-select field → rename to `Status`
- Roles table: remove Events-dependent fields
- Roles table: `Latest Date` converted from rollup to date

---

## Task 1: Migrate Airtable Status from Lookup to Single-Select

**Context:** The Roles table derives Status via a `multipleLookupValues` field linked to Events. We need to flatten this to a direct single-select so career-ops can write to it.

**Tools:** Airtable MCP (`create_field`, `list_records_for_table`, `update_records_for_table`, `update_field`)

- [ ] **Step 1: Read all Roles records to capture current Status values**

Use `list_records_for_table` on table `tblYkYOzjcWDmqHXB` in base `appPOaJgECLqBdK0D`. Page through all 94 records. For each record, save: `record_id`, current `Status` lookup value (field `fldAXajb6sgizBLdQ`), `Job` name (for logging).

Note: The Status field is `multipleLookupValues` so it may return an array. Take the first/latest value. If empty/null, record as blank.

- [ ] **Step 2: Create the new Status Direct single-select field**

Use `create_field` on table `tblYkYOzjcWDmqHXB`:
```json
{
  "name": "Status Direct",
  "type": "singleSelect",
  "options": {
    "choices": [
      {"name": "New Listing"},
      {"name": "Evaluated"},
      {"name": "Applied"},
      {"name": "Phone Screen"},
      {"name": "Interview"},
      {"name": "On-Site Interview"},
      {"name": "Assignment"},
      {"name": "Assessment Submitted"},
      {"name": "Company Responded"},
      {"name": "Dean Followed Up"},
      {"name": "Informal Chat"},
      {"name": "Offer"},
      {"name": "Accepted"},
      {"name": "Rejected"},
      {"name": "Declined"},
      {"name": "Expired"},
      {"name": "SKIP"}
    ]
  }
}
```

Save the returned field ID — this becomes the `status` field ID in `_profile.md`.

- [ ] **Step 3: Write current status values into the new field**

Use `update_records_for_table` in batches of 10 (Airtable limit). For each record from Step 1, set the new `Status Direct` field to the captured status value.

If a record's current status is blank, set it to "New Listing".
If a record's current status doesn't match any option (edge case), log a warning and skip that record.

- [ ] **Step 4: Verify migration**

Use `list_records_for_table` to read back all records. Confirm:
- Every record has a non-empty `Status Direct` value
- Values match what was captured in Step 1
- Report: "Migrated N/94 records. X had blank status (set to New Listing). Y warnings."

- [ ] **Step 5: Remove Events-dependent fields from Roles**

Delete these fields using `update_field` or the Airtable UI (MCP may not support field deletion — if not, instruct the user to delete manually):
- `Events` link field (`fld7laDZNBdNC5oMB`)
- `Events 2` link field (`fldUkAXa4WApCC8gp`)
- `Status` lookup field (`fldAXajb6sgizBLdQ`)
- `Events notes` lookup field (`fldJMTU8WcSnHFtrd`)

If MCP cannot delete fields, tell the user:
> "Please delete these 4 fields from the Roles table in Airtable: Events, Events 2, Status, Events notes. Then rename 'Status Direct' to 'Status'. Let me know when done."

- [ ] **Step 6: Rename Status Direct to Status**

Use `update_field` on the new field ID:
```json
{
  "name": "Status"
}
```

- [ ] **Step 7: Handle Latest Date field**

The `Latest Date` field (`fldhuMz4QRjq3ZiqH`) is a rollup from Events. After Events fields are removed, this field will either:
- Break (if it depended on the deleted link) — need to recreate as a date field
- Already be a plain date — just verify

Check the field type after Step 5. If it's broken or still a rollup, create a new `Latest Date` date field, copy values, and delete the old one. Save the final field ID.

- [ ] **Step 8: Commit progress note**

No local files changed yet, but record the new field IDs:
```
Status field ID: <from Step 2>
Latest Date field ID: <from Step 7, possibly unchanged>
Active Opps view ID: <read from list_tables_for_base response>
```

These will be needed for Task 3.

---

## Task 2: Expand career-ops State Vocabulary

**Files:**
- Modify: `templates/states.yml`

- [ ] **Step 1: Add new states to states.yml**

Add the following entries after the existing `skip` state in `templates/states.yml`:

```yaml
  - id: new_listing
    label: New Listing
    aliases: [new]
    description: Found or imported, not yet evaluated
    dashboard_group: evaluated
    airtable_value: New Listing

  - id: phone_screen
    label: Phone Screen
    aliases: [phone, screen]
    description: Phone screen scheduled or completed
    dashboard_group: interview
    airtable_value: Phone Screen

  - id: onsite_interview
    label: On-Site Interview
    aliases: [onsite, on-site]
    description: On-site interview stage
    dashboard_group: interview
    airtable_value: On-Site Interview

  - id: assignment
    label: Assignment
    aliases: [take-home, homework]
    description: Take-home or assessment assigned
    dashboard_group: interview
    airtable_value: Assignment

  - id: assessment_submitted
    label: Assessment Submitted
    aliases: [submitted]
    description: Assessment turned in
    dashboard_group: interview
    airtable_value: Assessment Submitted

  - id: followed_up
    label: Followed Up
    aliases: [follow-up, followup]
    description: Candidate followed up with company
    dashboard_group: applied
    airtable_value: Dean Followed Up

  - id: informal_chat
    label: Informal Chat
    aliases: [chat, coffee]
    description: Informal or networking conversation
    dashboard_group: interview
    airtable_value: Informal Chat

  - id: accepted
    label: Accepted
    aliases: [accept]
    description: Offer accepted
    dashboard_group: offer
    airtable_value: Accepted

  - id: declined
    label: Declined
    aliases: [decline, passed]
    description: Candidate declined the offer
    dashboard_group: discarded
    airtable_value: Declined

  - id: expired
    label: Expired
    aliases: [closed]
    description: Posting expired or was closed
    dashboard_group: discarded
    airtable_value: Expired
```

- [ ] **Step 2: Add airtable_value to existing states**

Add the `airtable_value` field to each existing state:

```yaml
  - id: evaluated
    airtable_value: Evaluated
    # ... keep all other fields

  - id: applied
    airtable_value: Applied

  - id: responded
    airtable_value: Company Responded

  - id: interview
    airtable_value: Interview

  - id: offer
    airtable_value: Offer

  - id: rejected
    airtable_value: Rejected

  - id: discarded
    aliases: [descartado, descartada, cerrada, cancelada, expired, closed]
    airtable_value: Expired

  - id: skip
    airtable_value: SKIP
```

Note: `discarded` gets `expired` and `closed` added to its aliases. Its `airtable_value` maps to "Expired".

- [ ] **Step 3: Verify the YAML is valid**

```bash
node -e "const yaml = require('js-yaml'); const fs = require('fs'); yaml.load(fs.readFileSync('templates/states.yml', 'utf8')); console.log('Valid YAML')"
```

If Node doesn't have js-yaml, use:
```bash
python3 -c "import yaml; yaml.safe_load(open('templates/states.yml')); print('Valid YAML')"
```

- [ ] **Step 4: Commit**

```bash
git add templates/states.yml
git commit -m "Expand states.yml with Airtable-aligned statuses

Add 10 new states (New Listing, Phone Screen, On-Site Interview,
Assignment, Assessment Submitted, Followed Up, Informal Chat,
Accepted, Declined, Expired) and airtable_value mapping to all states."
```

---

## Task 3: Create _profile.md with Airtable Config

**Files:**
- Create: `modes/_profile.md` (copy from `modes/_profile.template.md`, then add Airtable block)

- [ ] **Step 1: Copy template to _profile.md**

```bash
cp modes/_profile.template.md modes/_profile.md
```

- [ ] **Step 2: Add Airtable config block**

Append to the end of `modes/_profile.md`:

```markdown
## Your Airtable Sync

<!-- Field IDs from Job Hunting 2026 base. Updated 2026-04-08 after schema migration. -->

```yaml
base_id: appPOaJgECLqBdK0D
score_threshold: 3.0
tables:
  companies:
    id: tbllAyQwzMdiF4h3q
    fields:
      company: fldOyC4IiUpgY5ERO
  roles:
    id: tblYkYOzjcWDmqHXB
    fields:
      company: fldymXmmOPTHFNqzl
      role: fld3KO5UzCechrm9t
      link: fldeapmksGot9WO4k
      rating: flduNwmrGy4Zg7ng5
      status: STATUS_FIELD_ID_FROM_TASK_1
      notes: fldKgGvtUEduuMV2R
      salary_low: fldBYaLmBwBWff2LA
      salary_high: fldgwfJZzdirXdC03
      remote: fldmNayUujCMV0PWW
      latest_date: LATEST_DATE_FIELD_ID_FROM_TASK_1
    views:
      active_opps: ACTIVE_OPPS_VIEW_ID_FROM_TASK_1
`` `
```

Replace the three placeholder values with actual IDs captured in Task 1, Step 8.

- [ ] **Step 3: Commit**

```bash
git add modes/_profile.md
git commit -m "Create _profile.md with Airtable sync config

Includes base ID, table IDs, field IDs, score threshold (3.0),
and Active Opps view ID for import."
```

---

## Task 4: Update oferta.md Step 3 (Sync Logic)

**Files:**
- Modify: `modes/oferta.md` (lines 159-176)

- [ ] **Step 1: Replace Step 3 in oferta.md**

Replace the current `### 3. Sync to Airtable` section (lines 159-176) with:

```markdown
### 3. Sync to Airtable

If `modes/_profile.md` contains a `## Your Airtable Sync` section, run the sync gate:

#### 3a. Sync Gate Check

Read `score_threshold` from `_profile.md` Airtable config (default: 3.0).

| Condition | Action |
|---|---|
| Score >= threshold AND role NOT in Airtable | **Create** Role + Company (Step 3b) |
| Score >= threshold AND role already in Airtable | **Update** Role fields (Step 3c) |
| Score < threshold AND role already in Airtable | **Set Status to SKIP**, update Latest Date only |
| Score < threshold AND role NOT in Airtable | **Skip sync entirely** |

**Re-evaluation trigger:** If the user responds to an evaluation and the score changes, re-run this gate. A role bumped above threshold gets created/updated. A role dropped below threshold gets marked SKIP.

**Matching logic:** To find if a role exists in Airtable:
1. Use `list_records_for_table` with a filter on `Link` field matching the JD URL.
2. If no match, try filtering Companies table by name, then check linked Roles for matching title.

#### 3b. Create New Role

1. **Look up company** in Companies table (`tbllAyQwzMdiF4h3q`) by name using `search_records` or `list_records_for_table` with filter.
2. If not found, **create company** using `create_records_for_table` with just the Company name field (`fldOyC4IiUpgY5ERO`).
3. **Create Roles record** using `create_records_for_table` on table `tblYkYOzjcWDmqHXB`:
   - Company (`fldymXmmOPTHFNqzl`) → linked record ID from step 1/2
   - Role (`fld3KO5UzCechrm9t`) → role title from JD
   - Link (`fldeapmksGot9WO4k`) → JD URL
   - Rating (`flduNwmrGy4Zg7ng5`) → score rounded to nearest integer (1-5)
   - Status (field ID from `_profile.md`) → "Evaluated"
   - Notes (`fldKgGvtUEduuMV2R`) → one-line evaluation summary
   - Salary Low (`fldBYaLmBwBWff2LA`) → comp range low from Block D (USD, if available)
   - Salary High (`fldgwfJZzdirXdC03`) → comp range high from Block D (USD, if available)
   - Remote? (`fldmNayUujCMV0PWW`) → "Remote", "Hybrid", or "On-site"
   - Latest Date (field ID from `_profile.md`) → today's date (YYYY-MM-DD)
4. **Report:** "Synced to Airtable: {Company} — {Role} (new record)"

#### 3c. Update Existing Role

1. Use `update_records_for_table` on the matched record ID.
2. Update: Rating, Status (see rules below), Notes, Salary Low, Salary High, Remote?, Latest Date.
3. Do NOT overwrite Link (URL should not change).
4. **Report:** "Synced to Airtable: {Company} — {Role} (updated existing)"

**Status write-back rules:**
- On new evaluation of a role with blank or "New Listing" status → set to "Evaluated"
- On new evaluation of a role with any other status (Applied, Interview, etc.) → preserve existing status
- On explicit status change in career-ops → map using `airtable_value` from `templates/states.yml`

#### 3d. Error Handling

If Airtable MCP is unavailable (tools not loaded, auth error, timeout):
- Log: "⚠️ Airtable sync skipped — MCP unavailable. Evaluation saved locally."
- Do NOT block the evaluation. Local report and tracker are the source of truth.

Use field IDs from `_profile.md` Airtable config for all API calls.
```

- [ ] **Step 2: Verify the file is well-formed**

Read back `modes/oferta.md` and confirm:
- The new Step 3 integrates cleanly after Step 2
- No duplicate sections
- All field IDs reference `_profile.md` config, not hardcoded values (except as documentation)

- [ ] **Step 3: Commit**

```bash
git add modes/oferta.md
git commit -m "Replace oferta.md Airtable sync with full sync gate logic

Adds score threshold check, create vs update vs SKIP logic,
status preservation rules, re-evaluation trigger, and error handling."
```

---

## Task 5: Create Import Mode

**Files:**
- Create: `modes/import.md`
- Create (if missing): `data/pipeline.md`

- [ ] **Step 1: Create data/pipeline.md if it doesn't exist**

```markdown
# Pipeline

## Pendientes
<!-- URLs pending evaluation -->

## Procesadas
<!-- Evaluated URLs -->
```

- [ ] **Step 2: Create modes/import.md**

```markdown
# Mode: import — One-Time Airtable Import

Import unevaluated roles from the Airtable "Active Opps" view into the career-ops pipeline.

## When to Use

- First-time setup: bootstrap pipeline from existing Airtable data
- The user says "import from Airtable" or "pull roles from Airtable"

## Process

### 1. Read Active Opps

Read `modes/_profile.md` Airtable config to get:
- `base_id` → `appPOaJgECLqBdK0D`
- `tables.roles.id` → `tblYkYOzjcWDmqHXB`
- `tables.roles.views.active_opps` → view ID

Use `list_records_for_table` with the view parameter to read all Roles in the Active Opps view. Page through all results.

For each record, extract:
- Company name (resolve from linked Company record if needed)
- Role title (`fld3KO5UzCechrm9t`)
- URL (`fldeapmksGot9WO4k`)
- Current Status (new single-select field)
- Notes (`fldKgGvtUEduuMV2R`)

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
```

- [ ] **Step 3: Commit**

```bash
git add modes/import.md data/pipeline.md
git commit -m "Add import mode for one-time Airtable Active Opps import

New mode reads from Active Opps view, filters against pipeline.md,
and adds unevaluated roles to the pipeline for processing."
```

---

## Task 6: Add import to CLAUDE.md Skill Modes Table

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add import row to the Skill Modes table**

In the `### Skill Modes` table in `CLAUDE.md`, add:

```markdown
| Imports roles from Airtable | `import` |
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Add import mode to CLAUDE.md skill modes table"
```

---

## Task 7: End-to-End Verification

**Tools:** Airtable MCP tools

- [ ] **Step 1: Verify Airtable schema is correct**

Use `get_table_schema` on `tblYkYOzjcWDmqHXB`. Confirm:
- `Status` field exists as `singleSelect` (not lookup)
- `Latest Date` field exists as `date` (not rollup)
- `Events`, `Events 2`, old `Status` lookup, `Events notes` are gone
- All 17 status options are present in the single-select choices

- [ ] **Step 2: Verify states.yml has all states with airtable_value**

```bash
grep -c "airtable_value:" templates/states.yml
```

Expected: 18 (8 original + 10 new)

- [ ] **Step 3: Verify _profile.md has Airtable config with real field IDs**

Read `modes/_profile.md` and confirm:
- No placeholder values (no `STATUS_FIELD_ID_FROM_TASK_1` etc.)
- All field IDs are valid Airtable format (`fldXXXXXXXXXXXXXX`)
- `score_threshold: 3.0` is set

- [ ] **Step 4: Verify oferta.md Step 3 references _profile.md**

Read `modes/oferta.md` and confirm:
- Step 3 references field IDs from `_profile.md`, not hardcoded
- Sync gate table has all 4 conditions
- Status preservation rules are documented
- Error handling section is present

- [ ] **Step 5: Verify import.md references the correct view**

Read `modes/import.md` and confirm it references the Active Opps view from `_profile.md` config.

- [ ] **Step 6: Run pipeline health check**

```bash
node verify-pipeline.mjs
```

Should pass with no errors (or expected warnings for missing data files on first run).

- [ ] **Step 7: Final commit and summary**

If any fixes were needed, commit them. Then report to user:

> "Airtable 1:1 sync is ready. Here's what's set up:
> - Airtable Status is now a direct single-select (Events decoupled)
> - 18 unified states in states.yml with Airtable mapping
> - Evaluation sync gate: score >= 3.0 creates/updates in Airtable, < 3.0 marks SKIP
> - Import mode ready: run `/career-ops import` to pull Active Opps into pipeline
> - All changes flow from career-ops → Airtable going forward"
