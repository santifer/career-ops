# Airtable 1:1 Sync Design

**Date:** 2026-04-08
**Status:** Draft
**Goal:** Bring the Airtable base (Job Hunting 2026) and career-ops pipeline to 1:1 parity, with career-ops as the source of truth for all changes.

---

## Context

The user has an existing Airtable base (`appPOaJgECLqBdK0D`) with 94 Roles, 174 Companies, and 142 Events. Career-ops has a designed-but-not-implemented Airtable sync in `modes/oferta.md`. The two systems have divergent schemas, state vocabularies, and no live integration.

**Direction of flow:** Career-ops analyzes and evaluates roles. Airtable is the downstream consumer for viewing, filtering, and sharing. After a one-time import of existing Airtable roles, all changes originate in career-ops.

---

## Part 1: Airtable Schema Migration

### 1.1 Flatten Status from Events lookup to direct single-select

The Roles table currently derives Status via a `multipleLookupValues` field linked to the Events table. This needs to become a direct single-select on Roles.

**Steps:**

1. Read all 94 Roles records, capturing each record's current `Status` lookup value (the latest event status).
2. Create a new single-select field `Status Direct` on Roles with the unified option set:
   - New Listing, Evaluated, Applied, Phone Screen, Interview, On-Site Interview, Assignment, Assessment Submitted, Company Responded, Dean Followed Up, Informal Chat, Offer, Accepted, Rejected, Declined, Expired, SKIP
3. Write each Role's current status value into the new `Status Direct` field.
4. Verify all 94 records have their status preserved correctly.
5. Remove from Roles: `Events` link field (`fld7laDZNBdNC5oMB`), `Events 2` link field (`fldUkAXa4WApCC8gp`), `Status` lookup field (`fldAXajb6sgizBLdQ`), `Events notes` lookup field (`fldJMTU8WcSnHFtrd`).
6. Rename `Status Direct` to `Status`.

### 1.2 Convert Latest Date to a writable date field

The `Latest Date` field (`fldhuMz4QRjq3ZiqH`) is currently a rollup from Events. After unlinking Events, convert it to a plain date field. Preserve existing values. Career-ops will update this to today's date on every write.

**After migration, the Events table is fully decoupled.** It can be kept for historical reference or deleted at the user's discretion.

---

## Part 2: Career-ops State Expansion

### 2.1 New states for `templates/states.yml`

Add these states to align with Airtable's vocabulary:

| id | label | aliases | Airtable value |
|----|-------|---------|----------------|
| `new_listing` | New Listing | `new` | New Listing |
| `phone_screen` | Phone Screen | `phone`, `screen` | Phone Screen |
| `onsite_interview` | On-Site Interview | `onsite`, `on-site` | On-Site Interview |
| `assignment` | Assignment | `take-home`, `homework` | Assignment |
| `assessment_submitted` | Assessment Submitted | `submitted` | Assessment Submitted |
| `followed_up` | Followed Up | `follow-up`, `followup` | Dean Followed Up |
| `informal_chat` | Informal Chat | `chat`, `coffee` | Informal Chat |
| `accepted` | Accepted | `accept` | Accepted |
| `declined` | Declined | `decline`, `passed` | Declined |
| `expired` | Expired | `closed` | Expired |

### 2.2 Existing state updates

- `discarded` becomes an alias for `expired` (offer closed) or `declined` (user passed). Keep as alias in states.yml pointing to `expired` by default.

### 2.3 Full mapping table (career-ops to Airtable)

| Career-ops label | Airtable single-select value |
|---|---|
| New Listing | New Listing |
| Evaluated | Evaluated |
| Applied | Applied |
| Phone Screen | Phone Screen |
| Interview | Interview |
| On-Site Interview | On-Site Interview |
| Assignment | Assignment |
| Assessment Submitted | Assessment Submitted |
| Responded | Company Responded |
| Followed Up | Dean Followed Up |
| Informal Chat | Informal Chat |
| Offer | Offer |
| Accepted | Accepted |
| Rejected | Rejected |
| Declined | Declined |
| Expired | Expired |
| SKIP | SKIP |

---

## Part 3: Sync Behavior (career-ops to Airtable)

### 3.1 Sync gate

Every evaluation or score change triggers a sync gate check:

| Condition | Action |
|---|---|
| Score >= 3.0 AND not in Airtable | Create Role + Company |
| Score >= 3.0 AND already in Airtable | Update Role fields |
| Score < 3.0 AND already in Airtable | Set Status to SKIP, update Latest Date |
| Score < 3.0 AND not in Airtable | No sync |

The threshold (3.0) is configurable in `_profile.md` as `score_threshold`.

**Re-evaluation:** When the user responds to an evaluation and the score changes (up or down), career-ops re-runs the sync gate. A role at 2.5 bumped to 3.2 gets created in Airtable. A role at 3.5 revised to 2.8 gets marked SKIP in Airtable.

### 3.2 Fields written to Roles

| Airtable field | Source | When |
|---|---|---|
| Company | Linked record (lookup/create in Companies) | Create + Update |
| Role | Role title from JD | Create + Update |
| Link | JD URL | Create only |
| Rating | Score rounded to nearest integer (1-5) | Create + Update |
| Status | Career-ops state mapped to Airtable value | Create + Update (see 3.3) |
| Notes | One-line evaluation summary | Create + Update |
| Salary Low | From Block D comp research (USD) | Create + Update |
| Salary High | From Block D comp research (USD) | Create + Update |
| Remote? | "Remote", "Hybrid", or "On-site" | Create + Update |
| Latest Date | Today's date | Every write |

### 3.3 Status write-back rules

- On new evaluation: set Status to "Evaluated"
- On status change in career-ops: map to Airtable value per Section 2.3
- **Exception (import batch only):** If Airtable Status is anything other than blank or "New Listing", preserve the existing Status. Only overwrite blank/"New Listing" with "Evaluated".

### 3.4 Matching logic

To find an existing Role in Airtable:
1. **Primary:** Match by `Link` field (URL). Most reliable.
2. **Fallback:** Match by Company name + Role title (fuzzy on company name).

### 3.5 Company handling

1. Look up company by name in Companies table (`tbllAyQwzMdiF4h3q`).
2. If not found, create a new Companies record.
3. Link the Role to the Company record.

### 3.6 Error handling

- If Airtable MCP is unavailable (tools not loaded, auth error), log a warning and continue. Don't block evaluation.
- Report sync result to user: "Synced to Airtable: Clay -- Solutions Engineer (updated existing)" or "Airtable sync skipped: score 2.3 below threshold".

---

## Part 4: One-Time Import from Airtable

### 4.1 Import mode

New mode: `modes/import.md`

**Purpose:** Pull unevaluated roles from Airtable's Active Opps view into career-ops for evaluation. This runs once to bootstrap the pipeline, then all future roles enter through career-ops.

### 4.2 Import process

1. Read all Roles from the "Active Opps" view of the Roles table.
2. For each Role, extract: company name, role title, URL, current Status, any existing notes.
3. Filter out any whose URL already appears in `data/pipeline.md`.
4. Add remaining URLs to `data/pipeline.md` as pending items (format: `- [ ] {url} | {company} | {role}`).
5. Report: "Found N unevaluated roles in Airtable Active Opps. Added M to pipeline (K already tracked)."

### 4.3 Post-evaluation write-back (import batch)

After evaluating imported roles:
- Sync gate applies (only roles scoring >= 3.0 get written back).
- **Status preservation:** If the role's current Airtable Status is blank or "New Listing", set to "Evaluated". If it's anything else (Applied, Interview, etc.), leave Status as-is. Still update Rating, Salary, Notes, Remote, Latest Date.

---

## Part 5: Config & File Changes

### 5.1 `modes/_profile.md` -- Airtable config block

```yaml
## Your Airtable Sync
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
      status: <TBD -- new field ID after migration>
      notes: fldKgGvtUEduuMV2R
      salary_low: fldBYaLmBwBWff2LA
      salary_high: fldgwfJZzdirXdC03
      remote: fldmNayUujCMV0PWW
      latest_date: fldhuMz4QRjq3ZiqH
    views:
      active_opps: <TBD -- view ID>
```

### 5.2 `templates/states.yml` -- expand with new states

Per Section 2.1.

### 5.3 `modes/oferta.md` -- update Step 3

Replace the current Step 3 with:
- Sync gate check (Section 3.1)
- Field mapping (Section 3.2)
- Status write-back rules (Section 3.3)
- Matching logic (Section 3.4)
- Re-evaluation trigger on score changes

### 5.4 New file: `modes/import.md`

Import mode per Section 4.

### 5.5 State mapping reference

Add a mapping file or section that career-ops modes can reference for the career-ops-label to Airtable-value translation (Section 2.3). Could live in `_profile.md` or as a lookup in `states.yml` (new `airtable_value` field per state).

---

## Out of Scope

- Bidirectional sync (Airtable to career-ops for ongoing changes)
- Background/scheduled sync (no scripts or cron -- Claude does inline sync)
- Syncing full evaluation reports to Airtable (reports stay local)
- Syncing PDFs or interview prep to Airtable
- Deleting the Events table (user decides separately)
