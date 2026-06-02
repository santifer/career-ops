# Mode: queue — Incremental Score + Prepare

Two phases in one mode, invoked by `/career-ops queue [score|prepare]`.
Default (no sub-argument) runs the **score** phase.

Both phases operate on `data/apply-queue.json`. Read the file first; update
only the records relevant to the current phase; write the file back.

---

## Sources of truth (read before either phase)

| File | When |
|---|---|
| `data/apply-queue.json` | ALWAYS — the queue |
| `config/profile.yml` | ALWAYS — visa/work-rights, comp targets |
| `modes/_profile.md` | ALWAYS — scoring overlays, visa-answer rule, employment-type policy |
| `modes/_shared.md` | ALWAYS — A-F scoring framework and global rules |
| `cv.md` | ALWAYS — proof points for scoring and drafting |
| `article-digest.md` | If present — richer proof points |

---

## Phase 1: Score

**Trigger:** `/career-ops queue` or `/career-ops queue score`

Find every role in `data/apply-queue.json` with `"status": "new"`. For each:

### Step 1 — Read the JD

Read the file at `jd_path`. If the file is missing or empty, note it in the
reason and set `confidence: "low"`.

### Step 2 — Determine employment type (do this while reading the JD)

Classify as `"full-time"`, `"part-time"`, or `"ambiguous"`:

- `"full-time"`: JD says "full-time", "permanent", "40 hours/week", or does not
  mention hours at all and does not use part-time language.
- `"part-time"`: JD explicitly says "part-time", "casual", specifies hours below
  35/week, or uses "flexible hours" alongside other part-time signals.
- `"ambiguous"`: the JD is genuinely unclear — e.g. "flexible hours" with no
  other signal, or conflicting signals. **Never guess. Set ambiguous and flag.**

Store the result in `employment_type`.

### Step 3 — Select visa answer (locked rule — DO NOT CHANGE)

Read the locked rule from `modes/_profile.md` → `## Location Policy →
Visa status dropdown — locked rule`. Apply it exactly:

- Full-time role → `visa_form_answer_fulltime` from `config/profile.yml`
- Part-time role → `visa_form_answer_parttime` from `config/profile.yml`
- Ambiguous → `null` (add flag `ambiguous-employment`; route to review-carefully)

Store in `visa_answer`.

### Step 4 — Score (A-F framework)

Apply the scoring framework from `modes/_shared.md` with the user overlays
from `modes/_profile.md`. Read the JD; match against cv.md.

Produce:
- `score_raw` — weighted score before caps
- `score` — final score after all caps (use the strictest if multiple apply)
- `size_bucket` — "startup" | "mid" | "large" | "unknown" (research headcount)
- `eligibility` — "ok" | "cap" | "blocked" (see _profile.md eligibility rules)
- `confidence` — "high" | "medium" | "low"
- `reason` — one sentence explaining the score and the single biggest factor

Do NOT write a full A-G report. Do NOT generate a PDF. This is a lightweight
score pass only. The score caps and visa-eligibility rules in `modes/_profile.md`
apply exactly as they do in the full evaluation.

**Part-time scoring:** Do NOT downscore solely because a role is part-time.
Apply scoring preference #6 from `modes/_profile.md`. Score on data quality,
tech stack, and fit exactly as you would a full-time role.

### Step 5 — Flags

Populate `flags[]` with any active signals:

| Flag | When |
|---|---|
| `ambiguous-employment` | `employment_type == "ambiguous"` |
| `large-co-visa-cap` | large company + student-visa window active, cap applied |
| `pr-citizenship-required` | eligibility == "blocked" |
| `low-confidence` | `confidence == "low"` |
| `custom-form-fields` | any `free_text_fields` entry has `kind: "custom"` |
| `no-jd` | JD file missing or empty |

### Step 6 — Update the record

Write these fields back into the role object in `apply-queue.json`:

```
employment_type, visa_answer, score_raw, score, size_bucket,
eligibility, confidence, reason, flags (merge, don't replace),
status: "scored", scored_at: <ISO timestamp>
```

Leave all other fields unchanged. Write the updated queue file.

### Step 7 — Summary

After processing all new roles, print a summary table:

```
Scored N role(s):

Company           | Title                        | Type      | Score | Lane
------------------|------------------------------|-----------|-------|------------------
EasyGo            | Senior Data Analyst – Kick   | full-time | 4.4   | ready
...

→ Open the dashboard: node dashboard-server.mjs
→ Or set threshold and prepare: /career-ops queue prepare
```

---

## Phase 2: Prepare

**Trigger:** `/career-ops queue prepare`

Find every role with `"status": "prepare-queued"`. For each:

### Step 1 — Draft free text (only if the form needs it)

Look at `free_text_fields`. For each field where `kind == "standard"` and the
key matches a cover-letter or motivation-type question (cover_letter,
why_company, why_role, about_yourself, motivation, etc.):

- Draft a response using the tone framework from `modes/auto-pipeline.md`
  → "I'm choosing you" tone, 2–4 sentences, specific to this role and company.
- Use proof points from cv.md + article-digest.md (if present). Never invent.
- Store in `drafts[field.key]`.

Do NOT draft responses for custom fields (`kind: "custom"`) — those require
the candidate's input and are flagged `needs-input`.

Do NOT draft anything if the role has no standard free-text fields.

### Step 2 — Generate tailored CV PDF

Run the existing PDF generation pipeline:

1. Read cv.md + article-digest.md.
2. Extract keywords from the JD at `jd_path`.
3. Tailor and rewrite as per `modes/pdf.md` (keyword injection, summary rewrite,
   project reorder — never invent experience).
4. Generate: `node generate-pdf.mjs /tmp/cv-{candidate}-{company-slug}.html output/cv-{candidate}-{company-slug}-{date}.pdf`
5. Store the output path in `cv_pdf`.

### Step 3 — Update the record

```
drafts, cv_pdf,
status: "prepared", prepared_at: <ISO timestamp>
```

### Step 4 — Summary

```
Prepared N role(s):

EasyGo – Senior Data Analyst – Kick
  CV: output/cv-{candidate}-{company-slug}-{date}.pdf
  Drafts: cover_letter, why_company

→ Open the dashboard to review and fill: node dashboard-server.mjs
```

---

## Hard rules (both phases)

- **Never auto-submit.** This mode writes to apply-queue.json only.
- **Never modify** cv.md, portals.yml, or the locked scoring rules.
- **Never duplicate** scoring literals from `_profile.md` into this file.
  Always delegate: "as per `modes/_profile.md`" — not "cap at 3.4".
- **Part-time = same score weight** as full-time. Score on fit, not on type.
- **Ambiguous employment → never guess.** Flag it and route to review-carefully.
