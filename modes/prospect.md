# Mode: prospect — Proactive Job Discovery

Surfaces matching roles before you go looking for them. Combines semantic similarity from your best-scoring evaluations, company-level hiring signals, and broad market sweeps to build a prioritized prospect list — then learns from every action you take.

## Trigger

- `/career-ops prospect` or `/prospect`
- "find me matching roles"
- "show prospects"
- "find more [roles / companies / opportunities]"

## Prerequisites

Read these files before doing anything:

| File | Purpose |
|------|---------|
| `data/prospects.md` | Existing prospect list (may not exist yet) |
| `config/profile.yml` | Archetypes, narrative, deal-breakers, comp targets |
| `config/strategy-ledger.md` | Historical signals: what got approved, what got dismissed |
| `config/intel.yml` | Tracked companies and signal configuration |
| `data/applications.md` | Already-evaluated roles → dedup source |
| `data/pipeline.md` | Already-queued URLs → dedup source |
| `data/scan-history.tsv` | All URLs ever seen → dedup source |

If `data/prospects.md` does not exist, create it with the empty template (see **Prospects Tracker Format** below) and proceed directly to Discovery Mode.

---

## Display Mode (default — when prospects.md has unreviewed entries)

Show this summary first:

```
Prospect Intel — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{N} new prospects since {last_discovery_date}
{N_total} total unreviewed | {N_pipeline} moved to pipeline | {N_dismissed} dismissed

```

Then list each unreviewed prospect, sorted by match score descending:

```
#{N} ★{score}/5 — {Company} · {Role}
    Why it fits you: {1-2 sentences mapping role to user's narrative/archetypes}
    Approach angle: {cold outreach / referral / direct apply / warm connection}
    Source: {discovery_method} | {date_found}
    URL: {url}
```

### User actions in Display Mode

| User says | Action |
|-----------|--------|
| "evaluate #N" | Add URL to `data/pipeline.md` pending section. Mark prospect as `pipeline` in prospects.md. Record signal in strategy-ledger.md: approved. |
| "evaluate #N, #M, #K" | Batch-add all to pipeline.md. |
| "dismiss #N" | Ask: "Why? (role, company culture, comp, location, stack, other)". Record reason in prospects.md Dismissed section. Write learning signal to strategy-ledger.md. |
| "stop showing me [X]" | X can be a company name, role title pattern, or source. Add to negative filters: company → `intel.yml` dismissed_companies, title pattern → `portals.yml` title_filter.negative. Confirm what was added. |
| "find more" | Enter Discovery Mode immediately. |
| "show expired" | Display the Expired section of prospects.md. |

---

## Discovery Mode (when no unreviewed prospects, or user says "find more")

Run all three modes in parallel. Each mode produces a list of `{title, url, company, score, why_it_fits, approach_angle, source}`. Merge, dedup, rank, write to prospects.md.

---

### Mode 1 — Semantic Match

Find roles structurally similar to what has already worked.

**Step 1 — Seed from high-scoring evaluations:**
Read `data/applications.md`. Extract URLs of all roles with score >= 4.0.
Use Exa `findSimilar` on each seed URL to discover structurally similar postings.
Run in parallel — one Exa call per seed URL.

**Step 2 — Archetype-parallel search:**
From `config/profile.yml`, read the archetypes list. For each archetype, run a parallel Exa semantic search using the archetype label + user narrative keywords (e.g., "Head of Applied AI LLM automation pipeline").
Also run `findSimilar` against the user's best-performing report (highest score in reports/).

**Step 3 — Filter and score:**
Filter all results through `portals.yml` title_filter (positive/negative/seniority_boost rules).
Score each candidate 1–5:
- +2 title matches primary archetype
- +1 seniority_boost keyword present
- +1 company is in `intel.yml` tracked_companies
- +1 company has recent positive signal (funding, growth — check strategy-ledger.md)
- -2 company is in dismissed_companies
- -1 title matches a pattern previously dismissed (strategy-ledger.md)

---

### Mode 2 — Signal-Based Discovery

Surface roles at companies showing strong hiring intent signals — even before they post publicly.

**Step 1 — Pull signals for tracked companies:**
From `config/intel.yml`, read `tracked_companies`. For each company, run these in parallel:

| Signal source | Tool | What to look for |
|---------------|------|-----------------|
| Funding / hiring news | Tavily search: `"{company}" (raised OR hiring OR headcount OR layoffs) {current_year}` | Funding rounds, headcount changes, leadership hires |
| Financial health | Valyu search: `{company} revenue growth financials` | ARR growth, profitability signals |
| Engineering blog | Exa search: `site:{company_domain} blog engineering AI` | Stack signals, team culture, open problems |
| Headcount trajectory | BrightData LinkedIn: `{company} employees count` | Growing vs shrinking |

**Step 2 — Score each signal:**

| Signal | Score delta |
|--------|------------|
| Raised funding round (Series A+) | +3 |
| Headcount growth >10% YoY | +2 |
| New leadership hire in relevant function | +2 |
| Hiring manager posted publicly about building team | +2 |
| Tech stack matches user's core skills | +1 |
| Glassdoor rating >= 4.0 | +1 |
| Company previously dismissed by user | -3 |
| Layoffs in last 6 months | -2 |
| No remote / against user location policy | -1 |

**Step 3 — Search for open roles at high-signal companies:**
For companies with total signal score >= 3, navigate their careers page (Playwright `browser_navigate` + `browser_snapshot`) to find open roles matching archetypes.
Fall back to WebSearch if Playwright unavailable.

---

### Mode 3 — Market Sweep

Cast a wide net for roles not captured by tracked companies or seed URLs.

**Run all in parallel:**

1. **Exa semantic search** — use the user's narrative from `config/profile.yml` as the query string (2–3 sentences describing who they are and what they do). Search against job board domains.
2. **BrightData LinkedIn Jobs** — search by role titles from `config/profile.yml` archetypes + location preference.
3. **Exa FindAll** — targeted queries per archetype: `"{archetype_title}" OR "{archetype_title_variant}" site:jobs.ashbyhq.com OR site:job-boards.greenhouse.io OR site:jobs.lever.co`

Cross-reference all results against `portals.yml` company list to prioritize known-good companies.

---

## Cross-Source Deduplication

Run after all three modes complete, before writing to prospects.md.

**Dedup rules:**

1. **URL match** — exact URL already in scan-history.tsv, applications.md, or pipeline.md → drop.
2. **Normalized company + role tuple** — normalize both fields:
   - Strip seniority prefixes: `Senior`, `Staff`, `Principal`, `Lead`, `Junior`, `Head of`, `Director of`, `VP of`
   - Strip location suffixes: `(Remote)`, `(NYC)`, `(Berlin)`, `— Europe`, `- EMEA`, etc.
   - Lowercase + trim whitespace
   - If normalized company + normalized role already seen → merge into single entry, keep highest-confidence URL, note all sources.
3. **Cross-mode merge** — if same role found by Mode 1 and Mode 2, merge records, combine source labels, keep higher score.

---

## Prospects Tracker Format

`data/prospects.md` uses three sections. Write the full file on first creation; append to sections thereafter.

```markdown
# Prospects

_Last discovery: {YYYY-MM-DD} | Next recommended: {YYYY-MM-DD + 3 days}_

## New (unreviewed)

| # | Found | Company | Role | Match | Why It Fits You | Approach Angle | Source | URL |
|---|-------|---------|------|-------|-----------------|---------------|--------|-----|
| 1 | 2026-04-06 | Acme AI | Head of Applied AI | 4.2/5 | Matches automation pipeline archetype; they're building LLM orchestration layer | Direct apply | Exa/semantic | https://... |

## Reviewed → Pipeline

| # | Found | Moved | Company | Role | Match | URL |
|---|-------|-------|---------|------|-------|-----|
| 2 | 2026-04-01 | 2026-04-03 | Beta Corp | AI Platform Lead | 4.5/5 | https://... |

## Dismissed

| # | Found | Dismissed | Company | Role | Reason | URL |
|---|-------|-----------|---------|------|--------|-----|
| 3 | 2026-03-28 | 2026-03-29 | Gamma Inc | ML Engineer | comp too low | https://... |

## Expired

| # | Found | Expired | Company | Role | URL |
|---|-------|---------|---------|------|-----|
```

**Column definitions:**

- `#` — sequential integer, never reused
- `Found` — date prospect was first discovered (YYYY-MM-DD)
- `Match` — score 1.0–5.0 from discovery scoring
- `Why It Fits You` — 1 sentence connecting the role to the user's narrative/archetypes (read from profile.yml)
- `Approach Angle` — `direct apply` / `cold outreach` / `warm intro` / `referral` / `inbound`
- `Source` — discovery method: `Exa/semantic`, `Exa/findSimilar`, `Signal/funding`, `Signal/blog`, `BrightData/LinkedIn`, `Market/sweep`

---

## Prospect Expiry

- Unreviewed prospects older than **30 days** → auto-move to Expired section on next run.
- Expired prospects do NOT generate negative signals. They are neutral — the role may have closed, not that the user disliked it.
- **90-day compact**: Expired entries older than 90 days are removed entirely from the file (no signals written).
- User can say **"show expired"** to review the Expired section at any time and still evaluate or dismiss individual entries.

On each run, before Discovery Mode, check for expiry candidates and move them silently. Note count in the summary: `{N} prospects auto-expired`.

---

## Learning Loop

Every user action is a training signal. After each action, append to `config/strategy-ledger.md`:

```markdown
## {YYYY-MM-DD} — Prospect Signal

- **Action**: approved | dismissed
- **Company**: {company}
- **Role**: {role}
- **Source**: {discovery_method}
- **Match score at discovery**: {score}
- **Reason** (if dismissed): {reason}
- **Notes**: {any pattern worth noting}
```

After every 5+ new signals, the strategy engine analyzes `config/strategy-ledger.md` and updates discovery behavior:

1. **Which queries correlate with approval** → increase weight for those archetypes / source types in future runs.
2. **Which companies have multiple dismissals** → add to `intel.yml` dismissed_companies automatically (confirm with user first).
3. **Which dismissal reasons recur** → surface as a suggested filter update: "You've dismissed 3 roles for 'comp too low' from early-stage startups. Want me to add Series A or earlier to your negative filters?"
4. **Which signal types predicted approved roles** → prioritize those in Mode 2 for next run.

Strategy-ledger insights are shown at the top of each Display Mode run when there are >= 3 new learnings since the last insight summary.

---

## Output Summary

At the end of each Discovery Mode run:

```
Prospect Discovery — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode 1 (Semantic):   {N} candidates → {N_pass} passed filters
Mode 2 (Signals):    {N} companies checked → {N_roles} roles found
Mode 3 (Market):     {N} results → {N_pass} passed filters
Deduped:             {N} dropped (already seen)
Auto-expired:        {N} prospects moved to Expired
──────────────────────────────────────────────
New prospects added: {N}

Top prospects:
  ★{score} {Company} · {Role} [{source}]
  ...

→ Say "show prospects" to review, or "evaluate #N" to queue for evaluation.
```
