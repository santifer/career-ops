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

Use `role.jd_text` if present and non-empty (roles discovered by the cron carry
the full JD text directly). Otherwise read the file at `jd_path`. If neither is
available, note it in the reason and set `confidence: "low"`.

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
| `no-jd` | `jd_text` is absent/empty AND `jd_path` file is missing or empty |

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

### Step 1 — Resolve form fields with the layered resolver (minimum tokens)

Field answers are produced by three layers, cheapest first. The first two run
deterministically with **zero model tokens**; you (the agent) only answer the
few fields that survive to Layer 3.

1. **Run Layer 1 + Layer 2 (a script, no tokens):**

   ```
   node queue-resolve.mjs --pre <role-id>
   ```

   - **Layer 1 — profile rules** (`field-rules.mjs`): exact/keyword matches for
     the fixed fields (name, email, phone, salary, notice/availability, visa
     dropdown, hours, resume attach) **and** employer-independent custom fields
     (country, residence, relocation, office-days, work-rights free-text,
     website, verification consent). Values come from `config/profile.yml`.
     Select fields are mapped to an exact option.
   - **Layer 2 — semantic answer cache** (`answer-cache.mjs` + local
     embeddinggemma via `embed.mjs`): any field not caught by Layer 1 is
     embedded and matched against previously answered questions. A cached answer
     is reused only if cosine ≥ threshold AND it is marked `reusable` AND its
     entities match. **Never** reused when the answer depends on a differing
     location, number, date, or dollar amount.
   - Resolved answers are written into `role.drafts` with provenance. The
     command prints a JSON `novel` list — the only fields needing Layer 3.

   You do **not** read the form DOM. You only act on the printed `novel` list.

2. **Layer 3 — answer the novel fields, then teach the cache.** For each item in
   the `novel` list, write an answer grounded in `config/profile.yml`, `cv.md`,
   and the JD (`role.jd_text` if present and non-empty, else `jd_path`; use `article-digest.md` if present; never invent).
   For each, decide whether the answer is **employer-independent** (safe to
   reuse → `reusable: true`) or company/role-specific (`reusable: false`), and
   note any key `entities` it is tied to. Then store + teach in one call:

   ```
   node queue-resolve.mjs --teach <role-id> '@/path/to/answers.json'
   ```

   where each item is `{ "label", "type", "answer", "reusable", "entities", "confidence" }`.
   This writes the answers into `role.drafts` (provenance `model`) and stores
   each question + its embedding in the cache so future paraphrases hit Layer 2
   for free.

Motivational / "why this company/role" questions are employer-specific →
`reusable: false`. Behavioural or skills questions ("describe your SQL
experience") are usually employer-independent → `reusable: true`.

### Step 2 — Generate tailored CV PDF

Run the existing PDF generation pipeline:

1. Read cv.md + article-digest.md.
2. Extract keywords from the JD: use `role.jd_text` if present and non-empty, otherwise read `jd_path`.
3. Tailor and rewrite as per `modes/pdf.md` (keyword injection, summary rewrite,
   project reorder — never invent experience).
4. Generate: `node generate-pdf.mjs /tmp/cv-{candidate}-{company-slug}.html output/cv-{candidate}-{company-slug}-{date}.pdf`
5. Store the output path in `cv_pdf`.

### Step 3 — Update the record

**Do not mark a role `prepared` until `queue-resolve.mjs --pre` has run** and
`role.drafts` is populated (or the role has no `free_text_fields` at all). The
failure mode to avoid: a shortcut script that only writes `cv_pdf` +
`cover_letter_paths` and flips status to `"prepared"` without running the resolver —
this leaves `drafts` empty, which means every field is regenerated by the LLM at fill
time on every portal. This is exactly what happened in the 2026-06-25 session (all 40
roles had `drafts: {}`). Always go through `queue-resolve.mjs --pre` (Layers 1+2) then
`queue-resolve.mjs --teach` (Layer 3 novel answers) before writing status.

Write these fields via `saveQueue()`:

```
drafts, cv_pdf,
status: "prepared", prepared_at: <ISO timestamp>
```

### Step 4 — Summary

```
Prepared N role(s):

EasyGo – Senior Data Analyst – Kick
  CV: output/cv-{candidate}-{company-slug}-{date}.pdf
  Fields: 13 resolved (11 deterministic, 0 cache, 0 model) · 0 novel
  Tokens: 0 (all Layer 1)

→ Open the dashboard to review and fill: node dashboard-server.mjs
   (form-fill applies the resolved drafts deterministically and attaches the CV;
    it labels each field deterministic / reused-from-cache / model-reasoned and
    never clicks submit.)
```

---

## Login-gated portals

Roles with `flags` containing `login-required` use portals that gate the form behind
a candidate account. Follow the standing procedure in `modes/apply.md →
## Login-gated portals` for the login/registration flow. `form-fill.mjs` handles
login-wall detection and polling automatically for deterministic-fill ATSes; for
custom ATSes, the agent apply path handles it interactively.

---

## Hard rules (both phases)

- **Never auto-submit.** This mode writes to apply-queue.json only.
- **Never modify** cv.md, portals.yml, or the locked scoring rules.
- **Never duplicate** scoring literals from `_profile.md` into this file.
  Always delegate: "as per `modes/_profile.md`" — not "cap at 3.4".
- **Part-time = same score weight** as full-time. Score on fit, not on type.
- **Ambiguous employment → never guess.** Flag it and route to review-carefully.
- **Minimum tokens.** Always run `queue-resolve.mjs --pre` first; only answer the
  printed `novel` fields. Never read the form DOM to answer fields.
- **No `prepared` without drafts.** A role must not be marked `status: "prepared"`
  until `queue-resolve.mjs --pre` has run and `role.drafts` is populated (or the role
  has no `free_text_fields`). Shortcut scripts that flip status without running `--pre`
  break the fill pipeline on every portal — see Step 3 above.
- **Cache safety.** Mark an answer `reusable: true` only when it is genuinely
  employer-independent and not tied to a specific location/number/date/amount.
  The resolver enforces this on lookup, but set the flag honestly.
