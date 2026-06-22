# Supabase Migration: Schema, PII Boundary, and Sync Rules

> Design document for migrating career-ops discovery data from local
> `data/apply-queue.json` to a Supabase Postgres backend, enabling a GitHub
> Actions cron to insert fresh roles while the laptop is off.

**Status:** DRAFT -- needs review before implementation.
**Repo visibility:** PUBLIC. Every design decision assumes an attacker can read
every column definition and every RLS policy.

---

## 1. Schema

Two tables. One holds roles you are actively working on. The other remembers
every URL you have already seen so the cron never re-inserts it.

### 1.1 `active_roles` -- the working queue

Only roles in open states live here. A role is deleted from this table (and
inserted into `seen_urls`) the moment it reaches a terminal state.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `id` | `text` | PK | Stable role ID (`greenhouse:easygo:5097649007`, `custom:sha256prefix`). Same scheme as current `queue-store.mjs:stableId()`. |
| `company` | `text` | NOT NULL | Company name from pipeline/API. |
| `title` | `text` | NOT NULL | Role title from pipeline/API. |
| `url` | `text` | NOT NULL, UNIQUE | Canonical posting URL. |
| `ats` | `text` | NOT NULL | `greenhouse`, `lever`, `ashby`, `custom`. |
| `location` | `text` | | Location string from ATS API or pipeline. |
| `jd_text` | `text` | | Plain-text JD body (stripped HTML). Cloud-safe discovery data. |
| `jd_path` | `text` | | Relative path to local JD file (`jds/slug.md`). Informational only; the cron writes `jd_text`, local writes `jd_path`. |
| `status` | `text` | NOT NULL, DEFAULT `'new'` | One of the open statuses: `new`, `scored`, `prepare-queued`, `prepared`, `prefilled`, `filled`. CHECK constraint enforces this enum. |
| `score` | `numeric(2,1)` | | Final score after caps (0.0-5.0). |
| `score_raw` | `numeric(2,1)` | | Raw weighted score before caps. |
| `size_bucket` | `text` | | `startup`, `mid`, `large`, `unknown`. |
| `eligibility` | `text` | | `ok`, `cap`, `blocked`. |
| `employment_type` | `text` | | `full-time`, `part-time`, `ambiguous`. |
| `confidence` | `text` | | `high`, `medium`, `low`. |
| `flags` | `text[]` | DEFAULT `'{}'` | Array of flag strings (`login-required`, `ksc-required`, etc.). |
| `free_text_fields` | `jsonb` | | Form field metadata from ATS API (label, type, kind, options). Discovery data only -- no answers. |
| `upload_fields` | `jsonb` | | File upload field metadata (label, kind). |
| `ksc_criteria` | `text[]` | | Extracted KSC criterion headings from JD. |
| `cover_letter_required` | `boolean` | DEFAULT `false` | Whether the JD or form requires a cover letter. |
| `requirements_snippet` | `text` | | First 300 chars of Requirements section. |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | When the stub was first inserted. |
| `scored_at` | `timestamptz` | | When the agent scored this role. |
| `prepared_at` | `timestamptz` | | When prepare phase completed. |
| `prefilled_at` | `timestamptz` | | When headless fill completed. |
| `filled_at` | `timestamptz` | | When headed fill completed. |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | Last modification timestamp (auto-updated by trigger). |

**Indexes:**

- `UNIQUE(url)` -- enforced at DB level; the cron's INSERT uses `ON CONFLICT (url) DO NOTHING`.
- `idx_active_roles_status` on `(status)` -- the dashboard reads a WHERE slice.
- `idx_active_roles_company_title` on `(lower(company), lower(title))` -- dedup.

**Check constraint on `status`:**

```sql
CHECK (status IN ('new','scored','prepare-queued','prepared','prefilled','filled'))
```

This constraint is the structural guarantee that only open roles exist in this
table. Terminal states (`submitted`, `skipped`, `reviewed`, `closed`) are
rejected by the DB; the local write-back must DELETE + INSERT into `seen_urls`
instead.

### 1.2 `seen_urls` -- dedup memory

Cloud equivalent of `data/scan-history.tsv` + the DONE rows currently in
`apply-queue.json` + the URL/company-role pairs extracted from
`data/applications.md`.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `url` | `text` | PK | Canonical posting URL. |
| `company` | `text` | | Company name (for company::title dedup). |
| `title` | `text` | | Role title (for company::title dedup). |
| `final_status` | `text` | NOT NULL | Terminal status: `submitted`, `skipped`, `reviewed`, `closed`, `expired`, `filtered`. |
| `first_seen` | `date` | NOT NULL, DEFAULT `CURRENT_DATE` | Date the URL was first discovered (migrated from scan-history `first_seen`). |
| `decided_at` | `timestamptz` | | When the terminal decision was made (NULL for cron-evicted/filtered roles). |

**Indexes:**

- PK on `url`.
- `idx_seen_company_title` on `(lower(company), lower(title))` -- dedup by pair.

**How this replaces the three current dedup sources:**

| Current source | What it holds | Migrated to |
|----------------|---------------|-------------|
| `data/scan-history.tsv` | Every URL the scanner has ever seen, with `added` / `filtered` / `expired` status. | `seen_urls` rows with `final_status = 'filtered'` or `'expired'`. The cron writes these directly. |
| `data/apply-queue.json` (DONE roles) | Roles with `submitted` / `skipped` / `reviewed` / `closed` status. | `seen_urls` rows written by the local decision write-back. |
| `data/applications.md` | URL and company::title pairs from the tracker. | Bootstrapped into `seen_urls` during migration. After migration, the tracker is the downstream record; `seen_urls` is the upstream dedup gate. |

**Dedup rule for the cron:** Before inserting into `active_roles`, check:
1. `url` NOT IN `active_roles`.
2. `url` NOT IN `seen_urls`.
3. `(lower(company), lower(title))` NOT IN either table.

If any match, skip. This is a single SQL query with `NOT EXISTS` subqueries.

---

## 2. PII Boundary

> **The most important section.** This repo is public. The Supabase project will
> have RLS enabled and the anon key will never be committed, but defense in
> depth requires that the schema itself cannot leak personal information even if
> every row were dumped.

### 2.1 The rule (enforceable by any agent)

> **CLOUD ALLOWLIST RULE:** The Supabase database may contain DISCOVERY DATA
> only -- information about the job, not about the candidate. Any column whose
> value is generated ABOUT the candidate (referencing their background, skills,
> work history, visa status, or personal details) is LOCAL-ONLY and must never
> appear in any cloud column, query parameter, or RLS policy.

### 2.2 Column classification

**PERMITTED in cloud (discovery data about the role):**

| Column | Why it is safe |
|--------|----------------|
| `id`, `company`, `title`, `url` | Public job posting metadata. |
| `ats`, `location` | ATS type and posted location. |
| `jd_text` | The employer wrote this; it is already public on the ATS. |
| `jd_path` | A relative path string; contains no PII. |
| `status` | An enum value (`new`, `scored`, etc.). |
| `score`, `score_raw` | Numeric scores. They reveal fit preference, not identity. |
| `size_bucket`, `eligibility`, `employment_type`, `confidence` | Enum classifiers about the role. |
| `flags` | Strings like `login-required`, `ksc-required`. |
| `free_text_fields` | ATS form metadata (labels, types, options). No answers. |
| `upload_fields`, `ksc_criteria`, `cover_letter_required`, `requirements_snippet` | Extracted from the JD. |
| `created_at`, `scored_at`, `prepared_at`, `prefilled_at`, `filled_at`, `updated_at` | Timestamps. |

**BANNED from cloud (candidate-generated data, LOCAL-ONLY):**

| Current field in `apply-queue.json` | Why it is banned | Where it stays |
|-------------------------------------|------------------|----------------|
| `reason` | Scoring rationale references the candidate's background ("the candidate does not yet have...", "seniority mismatch"). | Local `apply-queue.json` or a local sidecar file. |
| `visa_answer` | The candidate's visa selection (e.g. `<visa-type>`). Reveals immigration status. | Local only. |
| `drafts` | Form answers: name, email, phone, LinkedIn, visa consent, cover letter text, custom field answers. Pure PII. | Local only. |
| `cv_pdf` | Path to a tailored CV PDF. The path contains the candidate's name. | Local only. |
| `cover_letter_path`, `cover_letter_paths` | Path(s) to generated cover letter files. | Local only. |
| `ksc_path` | Path to a Key Selection Criteria response document. | Local only. |
| `decided_at` (in `active_roles`) | Not banned, but only written locally as part of the decision flow. Appears in `seen_urls` after the role leaves. | In `seen_urls` after decision. |

### 2.3 How local-only fields are handled

The local dashboard continues to read `apply-queue.json` (or a local sidecar
cache) for `reason`, `visa_answer`, `drafts`, `cv_pdf`, `cover_letter_path`,
and `ksc_path`. These are merged client-side with the cloud row by matching on
`id`. The cloud row provides the discovery skeleton; the local file provides the
candidate-specific flesh.

**Sidecar structure (local file, gitignored):**

```
data/local-enrichments.json  (or kept in apply-queue.json during transition)
{
  "greenhouse:easygo:5097649007": {
    "reason": "Strong data analytics match...",
    "visa_answer": "<visa-type>",
    "drafts": { ... },
    "cv_pdf": "output/cv-<candidate>-<role>-<date>.pdf",
    "cover_letter_path": null,
    "ksc_path": null
  }
}
```

`queue-store.mjs` merges cloud + local on every `loadQueue()` call.

### 2.4 Violation flags in current data

These fields in the current `apply-queue.json` would violate the PII boundary
if uploaded to Supabase:

| Field | Example value | Violation type |
|-------|---------------|----------------|
| `reason` | "Lead-level role requiring team leadership and mentoring experience the candidate does not yet have" | References candidate's background. |
| `visa_answer` | `"<visa-type>"` | Immigration status. |
| `drafts.*` | `{"answer": "<candidate-name>", "source": "deterministic"}` | PII: name, email, phone, visa consent, custom answers. |
| `cv_pdf` | `"output/cv-<candidate>-<role>-<date>.pdf"` | Candidate name in path. |

---

## 3. State/Sync Rules

### 3.1 Who can write what

| Writer | INSERT new rows | UPDATE status | UPDATE score/metadata | DELETE (evict) |
|--------|:-:|:-:|:-:|:-:|
| **Cron (GitHub Actions)** | YES -- `new` stubs only | NO | NO | YES -- liveness eviction of `status = 'new'` rows only |
| **Local agent/dashboard** | YES (manual pipeline ingest) | YES (full lifecycle) | YES | YES (decision write-back: DELETE from `active_roles` + INSERT into `seen_urls`) |

### 3.2 The conflict rule

> **CRON PROTECTION RULE:** The cron may only modify rows with `status = 'new'`.
> Any row where `status != 'new'` has been touched by the local session and is
> under local control. The cron must never UPDATE or DELETE such rows.

This is enforced at three levels:

1. **Application logic:** The cron's SQL uses `WHERE status = 'new'` for liveness
   eviction and `ON CONFLICT (url) DO NOTHING` for inserts.
2. **RLS policy:** The cron's `career_ops_cron` role has a policy:
   `USING (status = 'new')` on UPDATE and DELETE. Rows the user has advanced
   past `new` are invisible to the cron's write operations.
3. **CHECK constraint:** The `status` CHECK on `active_roles` rejects terminal
   states, so the cron cannot accidentally mark a role as `submitted`.

### 3.3 Cron insert flow

```
1. Fetch ATS APIs (Greenhouse/Lever/Ashby) -- same logic as scan.mjs.
2. For each discovered role:
   a. Check seen_urls -- if url or (company, title) exists, skip.
   b. Check active_roles -- if url or (company, title) exists, skip.
   c. Fetch JD text (API call, zero tokens).
   d. INSERT INTO active_roles (...) ON CONFLICT (url) DO NOTHING.
      Status = 'new'. All candidate-specific columns are NULL.
3. Log to GitHub Actions summary.
```

### 3.4 Cron liveness eviction

After inserting new stubs, the cron re-checks all `status = 'new'` rows for
liveness using HTTP-based signals (the same `classifyLiveness()` from
`liveness-core.mjs`, but without Playwright -- HTTP status codes, redirect
patterns, and body-text pattern matching only).

```sql
-- Cron eviction: only touches 'new' rows
DELETE FROM active_roles WHERE id = $1 AND status = 'new';
INSERT INTO seen_urls (url, company, title, final_status, first_seen)
  VALUES ($2, $3, $4, 'expired', $5);
```

Roles with `status != 'new'` are never evicted by the cron, even if the posting
has expired. The local session decides what to do with them.

> **Why HTTP-only liveness in the cron?** Playwright is not available in GitHub
> Actions (or is expensive/fragile). The `liveness-core.mjs` classifier works on
> HTTP status + body text without a browser. The `liveness-browser.mjs` layer is
> local-only. This means the cron may miss some expired SPAs that require JS
> hydration; those are caught when the local session opens the role.

### 3.5 Local decision write-back

When the dashboard records a decision (`submitted`, `skipped`, `reviewed`), or
when form-fill detects a closed posting:

```sql
BEGIN;
  DELETE FROM active_roles WHERE id = $1;
  INSERT INTO seen_urls (url, company, title, final_status, decided_at)
    VALUES ($2, $3, $4, $5, now())
    ON CONFLICT (url) DO UPDATE SET final_status = EXCLUDED.final_status,
                                    decided_at = EXCLUDED.decided_at;
COMMIT;
```

This is atomic. The role disappears from the dashboard and becomes dedup memory
in a single transaction. The local `writeTrackerTsv()` flow continues unchanged
(TSV + merge-tracker for `applications.md`).

### 3.6 Dashboard read filter

The dashboard's `GET /api/queue` reads only open rows:

```sql
SELECT * FROM active_roles ORDER BY score DESC NULLS LAST, created_at;
```

Since the `active_roles` table structurally contains only open-state rows (CHECK
constraint), no WHERE filter on status is needed. `computeLane()` and
`computeStats()` remain pure functions that operate on the returned row set, not
on SQL.

---

## 4. Migration Sequencing

### Step 1: This schema doc (current step)

Produce this document. No code changes, no Supabase project created.

### Step 2: Swap local store to Supabase, dashboard stays local

**What changes:**

- `queue-store.mjs` gets a new backend: `loadQueue()` reads from Supabase
  (`active_roles` + local sidecar for PII fields), `saveQueue()` writes to
  Supabase + local sidecar. Atomic write guarantee shifts from filesystem
  rename to Postgres transaction.
- A new `supabase-client.mjs` module handles Supabase REST calls. Two credential
  paths (read from `.env`, gitignored):
  - **Dashboard** (`SUPABASE_DASHBOARD_KEY`): `sb_secret_` key → resolves to
    `service_role`, intentionally bypasses RLS (trusted local high-privilege
    client). Only on localhost.
  - **Cron** (`SUPABASE_CRON_PUBLISHABLE_KEY` + `SUPABASE_CRON_JWT`): publishable
    key on the `apikey` header plus a minted `career_ops_cron` JWT on the
    `Authorization: Bearer` header. RLS is enforced; the cron sees only
    what its policies allow.
- `queue-ingest.mjs` writes stubs to Supabase instead of local JSON.
- `dashboard-server.mjs` reads from Supabase via `queue-store.mjs` (no direct
  SQL). The active-lanes filter is structural (the table only holds open roles).
- Local sidecar `data/local-enrichments.json` (gitignored) holds PII fields.
- `data/apply-queue.json` is kept as a read-only local backup/cache during
  transition, then deprecated.

**What must be preserved from `queue-store.mjs`:**

| Contract | Preserved how |
|----------|---------------|
| Single I/O source | `queue-store.mjs` remains the only module that reads/writes the queue. All callers (`queue-ingest`, `dashboard-server`, `form-fill`) go through it. |
| Atomic writes | Postgres transactions replace filesystem tmp+rename. |
| `computeLane(role)` is pure | Unchanged. Operates on a role object, no I/O. The Supabase row is mapped to the same shape before passing to `computeLane`. |
| `computeStats(queue)` is pure | Unchanged. Operates on an array of role objects. |
| `ACTIVE_STATUSES`, `DONE_STATUSES`, `LANE_STATUSES` | Unchanged. Used for in-memory filtering and validation. |
| `buildQueueSeenSets(queue)` | Replaced by SQL `NOT EXISTS` queries against `active_roles` + `seen_urls`. The in-memory Set approach does not scale to cloud. |

**Proven against the existing test suite:**

- `test-all.mjs` must pass at 109/109 (or higher if new tests are added).
- `verify-pipeline.mjs` must stay clean.
- New integration tests: round-trip `loadQueue` / `saveQueue` against a test
  Supabase project (or a local Postgres via `supabase start`).

### Step 3: Add GitHub Actions cron (last)

**What changes:**

- `.github/workflows/scan-cron.yml` runs on a schedule (e.g. every 12 hours).
- The workflow runs a new script `cron-discover.mjs` that:
  1. Reads `portals.yml` (committed, public -- contains company names and
     search queries, no PII).
  2. Hits ATS APIs (Greenhouse/Lever/Ashby) for job listings.
  3. Dedup-checks against `seen_urls` and `active_roles`.
  4. INSERTs new `status = 'new'` stubs with `ON CONFLICT DO NOTHING`.
  5. Re-checks liveness of existing `status = 'new'` rows (HTTP-only).
  6. Evicts expired `new` rows.
- The workflow uses `SUPABASE_CRON_PUBLISHABLE_KEY` and `SUPABASE_CRON_JWT`
  secrets (repo secrets, never in code). The cron JWT is minted with
  `role=career_ops_cron` (ES256) and scoped by RLS to INSERT/DELETE `new` rows.
- The workflow does NOT score, prepare, fill, or decide. It only inserts stubs
  and evicts expired ones.
- `portals.yml` is safe to commit: it contains company names and search
  keywords, not candidate data. It is already in the user layer but is not
  gitignored. If the user wants to keep their company list private, they can
  move it to a repo secret or a private config repo and inject it at workflow
  runtime.

**Why last:** The cron is additive-only and depends on the schema + dedup
tables being stable. Building it before the local store is proven against the
test suite risks schema drift and a broken dedup contract.

---

## 5. Open Questions

These need your decision before Step 2 begins.

### 5.1 Table naming

The spec uses `active_roles` and `seen_urls`. Alternatives:

- `queue` / `seen` (shorter but generic)
- `roles` / `dedup_history`
- `discovery_queue` / `discovery_seen`

Decide on names now; they appear in RLS policies, indexes, and the cron script.

### 5.2 `portals.yml` privacy

`portals.yml` contains your target company list and search queries. It is
currently committed to the public repo. The cron needs it. Options:

- **Keep it public.** Company names and search keywords are not PII. Risk:
  someone can see which companies you are targeting.
- **Move to a repo secret / private file.** The cron reads it from a secret
  or a separate private repo. Adds complexity.

### 5.3 Score history

Currently, re-scoring a role overwrites `score` and `score_raw` in place. Once
the store is Postgres, we could add a `score_history` JSONB column or a
separate `score_log` table to track how scores change over time (e.g. after
re-evaluation with new JD text). Is this worth the complexity now, or defer?

### 5.4 Supabase project region

Supabase free tier allows one project. Region options include Sydney
(`ap-southeast-2`) for lowest latency from Melbourne, or US/EU if you plan to
share the project with other tooling. Decide before creating the project.

### 5.5 `reason` field: cloud or local?

The spec bans `reason` from the cloud because it currently references the
candidate ("the candidate does not yet have..."). However, if the scoring agent were
instructed to write reasons that reference only the role (e.g., "Lead-level
role; marketing analytics domain"), the field would be cloud-safe. Options:

- **Keep banned** (simplest, safest). Reasons stay local.
- **Sanitize at write time.** Enforce a rule: reasons must not reference the
  candidate by name or personal details. Add a lint check. Then allow in cloud.

### 5.6 Local fallback when offline

When Supabase is unreachable (airplane, outage), `loadQueue()` needs a fallback.
Options:

- **Fail loud:** throw an error; the dashboard shows "offline".
- **Read-only cache:** `saveQueue()` always writes a local JSON shadow. If
  Supabase is down, `loadQueue()` reads the shadow. Writes are queued and
  replayed on reconnect.
- **Full offline mode:** the local JSON file remains the primary during offline
  sessions; sync on reconnect.

Full offline mode is the most robust but adds reconciliation complexity.
Recommendation: start with fail-loud + local shadow read, add write queue later.

### 5.7 RLS: split dashboard / cron credential model — DECIDED

**Dashboard (localhost:7777):** `SUPABASE_DASHBOARD_KEY` is an `sb_secret_` key.
Supabase resolves this to `service_role`, which intentionally bypasses RLS. This
is the trusted local high-privilege path. The key is stored in `.env` (gitignored)
and never committed.

**Cron (GitHub Actions):** `SUPABASE_CRON_PUBLISHABLE_KEY` is the project's anon
key (sent on the `apikey` header). `SUPABASE_CRON_JWT` is a minted ES256 JWT with
`role=career_ops_cron` (sent on `Authorization: Bearer`). The anon role has no
RLS grants; the cron JWT role has RLS policies that allow only:
- `INSERT` into `active_roles` where `status = 'new'`
- `DELETE` from `active_roles` where `status = 'new'`
- `SELECT` on `seen_urls` and `active_roles` (for dedup checks)
- `INSERT` into `seen_urls`

`supabase-client.mjs` enforces that neither cron credential is an `sb_secret_`
key or a JWT with a privileged role (`service_role`, `supabase_admin`, `postgres`).

The live boundary test (`test-cron-rls-negative.mjs`) proved this 6/6.

### 5.8 Migration of existing data

The current `apply-queue.json` has 21 roles (17 scored, 4 submitted). On first
connect:

- The 17 scored roles go into `active_roles` (discovery columns only; PII stays
  in local sidecar).
- The 4 submitted roles go into `seen_urls`.
- The 23 rows in `data/scan-history.tsv` go into `seen_urls`.
- The URL/company-title pairs from `data/applications.md` go into `seen_urls`.

This is a one-time migration script. Confirm you want it automated or manual.

---

## What to review before Step 2

1. **Table names** (5.1) -- pick final names.
2. **`portals.yml` privacy** (5.2) -- keep public or hide?
3. **`reason` field** (5.5) -- cloud or local?
4. **Offline fallback** (5.6) -- fail-loud + shadow, or full offline?
5. ~~**RLS granularity** (5.7)~~ -- **Decided:** split dashboard (`sb_secret_` / service_role) + cron (`career_ops_cron` JWT, RLS-enforced). See §5.7.
6. **Migration approach** (5.8) -- automated script or manual?
7. **Supabase region** (5.4) -- Sydney or elsewhere?
8. **PII boundary** (Section 2) -- confirm the banned-fields list is complete.
9. **Conflict rule** (Section 3.2) -- confirm "cron touches only `new` rows" is
   the right boundary.

Once these are decided, I will create the Supabase project, write the migration
script, and refactor `queue-store.mjs` with the test suite proving every change.
