# Mode: outreach — Hiring Manager Discovery + Outreach Pipeline

**Trigger:** `/career-ops outreach`, "find the hiring manager", "draft outreach", "who should I contact at [company]"

**Relationship to `contacto.md`:** `contacto` is quick LinkedIn-only outreach — fast and lightweight. `outreach` is the OSINT-enhanced evolution: it adds multi-source discovery, email inference, dual confidence scoring, Gmail draft creation, and a structured intelligence report. Both modes can coexist. Use `contacto` for quick pings; use `outreach` when a role scores >= 4.0 and you want to do it properly.

---

## Prerequisites

Before running, check which files are available:

| File | Required | Purpose |
|------|----------|---------|
| `data/outreach.md` | Create if missing | Pipeline tracker |
| `config/profile.yml` | Required | Candidate identity and proof points |
| `config/voice-profile.md` | Required for drafting | Tone and voice guidelines |
| `config/strategy-ledger.md` | Recommended | What's working, what's not |
| `config/intel.yml` | Required for enrichment APIs | API keys and rate limits |
| `cv.md` | Required | Source of proof points |
| `article-digest.md` | Recommended | Detailed proof points |
| `intel/market/us-outreach-norms.md` | Required for drafting | Market-specific conventions |

If `data/outreach.md` is missing, create it with the table structure defined in the **Tracker Format** section below.

If `config/voice-profile.md` or `config/strategy-ledger.md` are missing, proceed with drafting but note that drafts will be less calibrated. Prompt the user to fill them in after the session.

---

## Display Mode (when data/outreach.md has entries)

When the user runs `/career-ops outreach` without providing a company or role, show the pipeline status before prompting for a new target:

```
Outreach Pipeline — {date}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Queue         N  (Drafted / Gmail Draft created, not sent)
Waiting       N  (Sent — awaiting response)
Action needed N  (Replied with a question — needs response)
Won           N  (Replied positively — meeting booked or application advanced)
Closed        N  (No response after follow-up cadence, or role closed)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total tracked: N
```

Then ask: "Which company/role do you want to run outreach for? Paste a job URL, a company name + role, or a report number."

---

## Input Handling

Accept any of:
- A job URL (pull company + role from the JD, or from the existing report if already evaluated)
- A company name + role title
- A report number (e.g., `042`) — read the corresponding report from `reports/`
- "all" — run discovery for every entry in `data/outreach.md` with status `Queue` (batch mode, requires confirmation)

If a report exists for this company + role, read it to extract archetype, score, and key proof points before drafting. Cross-reference `interview-prep/story-bank.md` for relevant STAR stories to use as proof points.

---

## HM Discovery Pipeline

Run all 7 stages sequentially. Show a progress line after each stage completes.

### Stage 1 — Org Mapping

Goal: identify 3-5 candidate hiring managers before spending API budget on enrichment.

1. **Exa people search** — semantic query: `"[Company] [department] manager OR director OR VP OR head" site:linkedin.com`
2. **Parallel FindAll** (if configured in `config/intel.yml`) — query for people with manager-level titles at the company
3. **Firecrawl team/leadership pages** — scrape `{company_domain}/team`, `{company_domain}/about`, `{company_domain}/leadership` for names and titles

Build a candidate list. For each person found, record: name, title, LinkedIn URL (if found), source.

**Priority title signals** (highest to lowest):
- "Head of [relevant domain]"
- "Director of [relevant domain]"
- "VP of [relevant domain]"
- "[relevant domain] Lead" or "Engineering Manager" or "Product Manager"
- Any title containing the same function as the target role

If fewer than 3 candidates are found, widen the search: try alternate department names, parent/sibling teams, or recent press mentions of team leads.

### Stage 2 — Signal Enrichment

Enrich the top 3 candidates from Stage 1. Run in parallel where possible.

1. **BrightData LinkedIn profiles** — fetch full profile for each candidate (rate-limited to 10 lookups/session, enforced — see HARD RULES below). Extract: current title, tenure, previous companies, recent posts, education.
2. **Tavily search** — `"[Name]" "[Company]" site:linkedin.com OR twitter.com OR medium.com OR substack.com` — look for recent talks, posts, articles, podcasts, conference appearances.
3. **Exa semantic search** — `"[Name]" "[Company]" [relevant domain keywords]` — surface less obvious signals: papers, OSS contributions, interviews.

For each candidate, build a signal summary: what they care about, what they've shipped, what their communication style seems like.

### Stage 3 — Hierarchy Inference

Using the signal data from Stages 1-2, determine who is the most likely hiring manager for this specific role.

**LLM analysis prompt (run internally):**
> Given this role ([title] at [company], [brief description]), and these candidates ([list with titles and signals]), who is the most likely direct hiring manager? Consider: title seniority, team scope, recent hiring activity, domain match.

**Confidence scoring:**

| Level | Threshold | Meaning |
|-------|-----------|---------|
| HIGH | 80%+ | Strong title match + org signals confirm direct authority |
| MEDIUM | 50–80% | Plausible match but ambiguous org structure or title |
| LOW | <50% | Best guess — org chart unclear or no strong signals |

If confidence is LOW, flag it clearly and provide 2 alternative contacts as fallbacks.

Record: primary HM name, title, LinkedIn, confidence level, rationale.

### Stage 4 — Contact Discovery

Find the best way to reach the hiring manager identified in Stage 3. Run in parallel:

1. **Firecrawl team pages** — check if the company lists emails on its site (rare but exists for some companies)
2. **Exa search** — `"@{company_domain}" "[First Name]"` — surface email patterns from public sources (press releases, GitHub commits, OSS projects)
3. **Pattern detection** — infer the most likely email format from known patterns:
   - `firstname@company.com`
   - `firstname.lastname@company.com`
   - `flastname@company.com` (first initial + last name)
   - `f.lastname@company.com`

   Cross-reference with any emails found in Exa/Firecrawl to confirm the pattern.

**Dual confidence scores** — report BOTH independently:

| Score | Type | Meaning |
|-------|------|---------|
| P.Conf (Person Confidence) | Inherited from Stage 3 | How sure we are this person is the right HM |
| E.Conf (Email Confidence) | From Stage 4 | How sure we are the email address is correct |

Email confidence levels:
- **HIGH** — email verified against a public source (GitHub commit, press release, company site)
- **MEDIUM** — email pattern confirmed from multiple employees at the company, but this specific address is inferred
- **LOW** — single pattern source or ambiguous name (e.g., common first name with many employees)

If no email can be found or inferred with at least LOW confidence, default to LinkedIn DM only and note it.

### Stage 5 — Outreach Drafting

Read `config/voice-profile.md` before drafting. If it does not exist, default to: direct, specific, confident, no corporate-speak.

Read `intel/market/us-outreach-norms.md` for channel-specific constraints and structure.

Read `cv.md` and `article-digest.md` to select the most relevant proof point for this role + HM. Prefer metrics-backed proof points. Cross-reference `interview-prep/story-bank.md` if it exists.

**Find something specific about the HM.** Use signal data from Stage 2 (a recent post, a shipped feature, a talk they gave). Generic messages are ignored. If no signal was found, reference something concrete about the team's work or a recent company announcement instead.

Draft **2 variants**:

#### Variant A — LinkedIn DM (connection request note)

- **300 character maximum** (hard limit — count characters)
- Structure: specific reference → one proof point → clear ask
- No "I hope this finds you well", no "I'm passionate about", no multi-clause sentences
- Mobile-readable: short sentences, no markdown, no lists

#### Variant B — Email

- **3-5 sentences maximum**
- Subject line: `[Role Title] — [Your relevant credential in 5 words or fewer]`
- Open with the reason for writing — no preamble
- One proof point with a number
- Clear ask: 15 minutes, specific topic
- Structure from `us-outreach-norms.md`

Show both variants to the user before proceeding to Stage 6. Label confidence scores. Ask: "Should I create Gmail drafts for these? (y/n)"

If the user says no, stop here and record as `Drafted` in `data/outreach.md`.

### Stage 6 — Create Drafts

Only proceed if the user confirmed in Stage 5.

1. **Gmail draft** — use `gmail_create_draft` to create the email draft. Record the Gmail draft ID in `data/outreach.md`.
2. **Personalized CV (if configured)** — if `config/profile.yml` has `google.docs_mcp: true` and the role score was >= 4.0, generate a Google Doc with the tailored CV for this application. Link it in `data/outreach.md` under GDoc URL.
3. **Update outreach tracker** — add or update the entry in `data/outreach.md` (see Tracker Format below). Status: `Gmail Draft`.

### Stage 7 — HM Intelligence Report

Save discovery findings to `data/intelligence.md` using the template at `intel/templates/hm-report.md`.

If `data/intelligence.md` does not exist, create it.

Append a new entry — do not overwrite previous entries. Format:

```markdown
---
## {Company} — {Role} ({YYYY-MM-DD})

[Filled-in content from intel/templates/hm-report.md]
```

Also create or update the outreach draft file at `data/outreach-drafts/{###}-{company-slug}-{YYYY-MM-DD}.md` using the template at `intel/templates/outreach-draft.md`. The `###` matches the report number from `reports/` if an evaluation report exists; otherwise assign a new sequential number.

---

## Outreach Tracker Format (data/outreach.md)

```markdown
# Outreach Tracker

| # | Date | Company | Role | HM Name | Title | P.Conf | E.Conf | Channel | Status | Gmail ID | GDoc URL |
|---|------|---------|------|---------|-------|--------|--------|---------|--------|----------|----------|

---

## Queue (not yet sent)

| # | Date | Company | Role | HM Name | Title | P.Conf | E.Conf | Channel | Status | Gmail ID | GDoc URL |
|---|------|---------|------|---------|-------|--------|--------|---------|--------|----------|----------|

---

## Sent (waiting for response)

| # | Date | Company | Role | HM Name | Title | P.Conf | E.Conf | Channel | Status | Gmail ID | GDoc URL |
|---|------|---------|------|---------|-------|--------|--------|---------|--------|----------|----------|

---

## Closed

| # | Date | Company | Role | HM Name | Title | P.Conf | E.Conf | Channel | Status | Gmail ID | GDoc URL |
|---|------|---------|------|---------|-------|--------|--------|---------|--------|----------|----------|
```

**Column definitions:**

| Column | Format | Notes |
|--------|--------|-------|
| # | Integer | Sequential, matches report number if available |
| Date | YYYY-MM-DD | Date outreach was drafted |
| Company | Short name | |
| Role | Job title | |
| HM Name | Full name | |
| Title | HM's current title | |
| P.Conf | HIGH / MEDIUM / LOW | Person confidence from Stage 3 |
| E.Conf | HIGH / MEDIUM / LOW | Email confidence from Stage 4 |
| Channel | LinkedIn / Email / Both | Primary outreach channel |
| Status | See canonical states below | |
| Gmail ID | Gmail draft/thread ID | From `gmail_create_draft` response |
| GDoc URL | Google Docs URL or — | Tailored CV doc, if generated |

**Canonical outreach statuses:**

| Status | Meaning |
|--------|---------|
| `Drafted` | Message written, not yet in Gmail |
| `Gmail Draft` | Gmail draft created, not sent |
| `Sent` | Message sent (user confirmed) |
| `Replied — Question` | HM replied with a question, needs response |
| `Replied — Positive` | HM replied positively (meeting booked, referral offered) |
| `No Response` | Sent, follow-up sent, no reply after full cadence |
| `Closed` | Role closed or candidate withdrew |

**Move entries between sections** (Queue / Sent / Closed) when status changes. The top table is the full log and is never pruned.

---

## Follow-Up Cadence

After sending, follow the cadence defined in `intel/market/us-outreach-norms.md`:

- Day 0: send
- Day 7: one follow-up if no response — add new value, do not just repeat the ask
- Day 14+: stop — update status to `No Response`, move to Closed section

If the user asks to draft a follow-up, read the original outreach draft and the signal data to add something new and relevant.

---

## Updating Status

When the user says "they replied" or "mark as sent" or updates the status of an outreach:
1. Update the status column in `data/outreach.md`
2. Move the entry to the correct section (Sent or Closed)
3. If `Replied — Positive`: suggest running `/career-ops deep` on the company and booking prep time

---

## HARD RULES

- **NEVER auto-send.** This mode only drafts. Gmail drafts are created but not sent. The user clicks Send. Always confirm before creating a Gmail draft.
- **Always label both confidence scores.** P.Conf and E.Conf must be shown explicitly on every outreach draft.
- **Rate-limit BrightData to 10 LinkedIn lookups per session.** Read the limit from `config/intel.yml` (`brightdata.max_linkedin_lookups_per_session`). Count across all candidates in the current session. If the limit is reached, stop enrichment and note which candidates were not enriched.
- **Never fabricate signals.** If no relevant HM signal was found, say so and draft a generic-but-specific-to-company message instead. Do not invent quotes or attribute posts that were not found.
- **Quality over quantity.** Do not run outreach for roles with scores below 4.0 unless the user explicitly overrides.
