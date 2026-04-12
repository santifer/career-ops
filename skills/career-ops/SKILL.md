---
name: career-ops
description: AI job search command center -- evaluate offers, generate CVs, scan portals, track applications
user_invocable: true
args: mode
argument-hint: "[scan | deep | pdf | oferta | ofertas | apply | batch | tracker | pipeline | contacto | training | project | interview-prep | update]"
---

# career-ops -- Router

## Path Resolution (Run First)

Determine where system modes live:

1. Check if `modes/_shared.md` exists relative to `$PWD` → `MODES_DIR = modes` (local/dev mode)
2. Otherwise, use Glob on `~/.claude/plugins/cache/*/career-ops/*/modes/_shared.md` → `MODES_DIR = <that parent directory>`

User profile (always in project):
- Primary: `config/_profile.md` (relative to `$PWD`)
- Fallback: `modes/_profile.md` (backward compat — migrate to config/ when found)

Load both when either exists. If only fallback exists, silently migrate: copy to `config/_profile.md`, note that `config/_profile.md` is the new location.

---

## Mode Routing

Determine the mode from `{{mode}}`:

| Input | Mode |
|-------|------|
| (empty / no args) | `discovery` -- Show command menu |
| JD text or URL (no sub-command) | **`auto-pipeline`** |
| `oferta` | `oferta` |
| `ofertas` | `ofertas` |
| `contacto` | `contacto` |
| `deep` | `deep` |
| `pdf` | `pdf` |
| `training` | `training` |
| `project` | `project` |
| `tracker` | `tracker` |
| `pipeline` | `pipeline` |
| `apply` | `apply` |
| `scan` | `scan` |
| `batch` | `batch` |
| `patterns` | `patterns` |
| `followup` | `followup` |

**Auto-pipeline detection:** If `{{mode}}` is not a known sub-command AND contains JD text (keywords: "responsibilities", "requirements", "qualifications", "about the role", "we're looking for", company name + role) or a URL to a JD, execute `auto-pipeline`.

If `{{mode}}` is not a sub-command AND doesn't look like a JD, show discovery.

---

## Discovery Mode (no arguments)

Show this menu:

```
career-ops -- Command Center

Available commands:
  /career-ops {JD}      → AUTO-PIPELINE: evaluate + report + PDF + tracker (paste text or URL)
  /career-ops pipeline  → Process pending URLs from inbox (data/pipeline.md)
  /career-ops oferta    → Evaluation only A-F (no auto PDF)
  /career-ops ofertas   → Compare and rank multiple offers
  /career-ops contacto  → LinkedIn power move: find contacts + draft message
  /career-ops deep      → Deep research prompt about company
  /career-ops pdf       → PDF only, ATS-optimized CV
  /career-ops training  → Evaluate course/cert against North Star
  /career-ops project   → Evaluate portfolio project idea
  /career-ops tracker   → Application status overview
  /career-ops apply     → Live application assistant (reads form + generates answers)
  /career-ops scan      → Scan portals and discover new offers
  /career-ops batch     → Batch processing with parallel workers
  /career-ops patterns  → Analyze rejection patterns and improve targeting
  /career-ops followup  → Follow-up cadence tracker: flag overdue, generate drafts

Inbox: add URLs to data/pipeline.md → /career-ops pipeline
Or paste a JD directly to run the full pipeline.
```

---

## Context Loading by Mode

After determining the mode, load the necessary files before executing.
Use `MODES_DIR` resolved in Path Resolution above.
Always also read `config/_profile.md` (if it exists) for user-specific overrides.

### Modes that require `_shared.md` + their mode file:
Read `{MODES_DIR}/_shared.md` + `{MODES_DIR}/{mode}.md` + `config/_profile.md`

Applies to: `auto-pipeline`, `oferta`, `ofertas`, `pdf`, `contacto`, `apply`, `pipeline`, `scan`, `batch`

### Standalone modes (only their mode file):
Read `{MODES_DIR}/{mode}.md` + `config/_profile.md`

Applies to: `tracker`, `deep`, `training`, `project`, `patterns`, `followup`

### Modes delegated to subagent:
For `scan`, `apply` (with Playwright), and `pipeline` (3+ URLs): launch as Agent with the content of `_shared.md` + `modes/{mode}.md` + `config/_profile.md` injected into the subagent prompt.

```
Agent(
  subagent_type="general-purpose",
  prompt="[content of {MODES_DIR}/_shared.md]\n\n[content of {MODES_DIR}/{mode}.md]\n\n[content of config/_profile.md]\n\n[invocation-specific data]",
  description="career-ops {mode}"
)
```

Execute the instructions from the loaded mode file.

---

## First Run — Onboarding

**Before doing ANYTHING else, check if the system is set up.** Run these checks silently:

1. Does `cv.md` exist?
2. Does `config/profile.yml` exist (not just profile.example.yml)?
3. Does `config/_profile.md` exist?
4. Does `portals.yml` exist (not just templates/portals.example.yml)?
5. Does `data/applications.md` exist?
6. Does `CLAUDE.md` exist in `$PWD`?

If `config/_profile.md` is missing:
- Check if `config/_profile.template.md` exists in `MODES_DIR` parent → copy to `config/_profile.md`
- Otherwise copy `{MODES_DIR}/../config/_profile.template.md` → `config/_profile.md`

If `CLAUDE.md` is missing in `$PWD`:
- Copy `{MODES_DIR}/../templates/CLAUDE.md.template` → `$PWD/CLAUDE.md`

**If ANY of cv.md, config/profile.yml, portals.yml is missing, enter onboarding mode.** Do NOT proceed with evaluations, scans, or any other mode until the basics are in place.

### Step 1: CV (required)
If `cv.md` is missing, ask:
> "I don't have your CV yet. You can either:
> 1. Paste your CV here and I'll convert it to markdown
> 2. Paste your LinkedIn URL and I'll extract the key info
> 3. Tell me about your experience and I'll draft a CV for you
>
> Which do you prefer?"

Create `cv.md` from whatever they provide. Clean markdown: Summary, Experience, Projects, Education, Skills.

### Step 2: Profile (required)
If `config/profile.yml` is missing, copy from `{MODES_DIR}/../config/profile.example.yml` (or plugin root equivalent) then ask:
> "I need a few details to personalize the system:
> - Your full name and email
> - Your location and timezone
> - What roles are you targeting?
> - Your salary target range"

Fill `config/profile.yml`. Store archetypes/narrative in `config/_profile.md` or `config/profile.yml` — NEVER in `modes/_shared.md`.

### Step 3: Portals (recommended)
If `portals.yml` is missing:
> "I'll set up the job scanner with 45+ pre-configured companies. Want me to customize the search keywords for your target roles?"

Copy `{MODES_DIR}/../templates/portals.example.yml` → `portals.yml`. Update `title_filter.positive` to match their target roles.

### Step 4: Tracker
If `data/applications.md` doesn't exist, create it:
```markdown
# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
```

### Step 5: Get to know the user
After basics are set up:
> "The basics are ready. But the system works much better when it knows you well. Can you tell me:
> - What makes you unique? Your 'superpower' other candidates don't have?
> - What work excites you? What drains you?
> - Any deal-breakers? (no on-site, no startups under 20 people, etc.)
> - Your best professional achievement — the one you'd lead with in an interview
> - Any projects, articles, or case studies you've published?"

Store insights in `config/profile.yml` (narrative), `config/_profile.md`, or `article-digest.md`.

**After every evaluation, learn.** User says "score too high" or "you missed X" → update `config/_profile.md` or `config/profile.yml`. System gets smarter each interaction.

### Step 6: Ready
> "You're all set! You can now:
> - Paste a job URL to evaluate it
> - Run `/career-ops scan` to search portals
> - Run `/career-ops` to see all commands
>
> Everything is customizable — just ask me to change anything.
>
> Tip: A personal portfolio dramatically improves your search. The author's is open source: github.com/santifer/cv-santiago"

Then suggest automation:
> "Want me to scan for new offers automatically? Just say 'scan every 3 days' and I'll configure it."

If they accept, use `/loop` or `/schedule` skill to set up a recurring `/career-ops scan`.

---

## Update Check

On first message of each session, run silently:

```bash
node update-system.mjs check
```

- `{"status": "update-available", "local": "X", "remote": "Y", "changelog": "..."}` → tell user:
  > "career-ops update available (vX → vY). Your data (CV, profile, tracker, reports) will NOT be touched. Want me to update?"
  If yes → `node update-system.mjs apply`. If no → `node update-system.mjs dismiss`.
- `{"status": "up-to-date"}` → say nothing
- `{"status": "dismissed"}` → say nothing
- `{"status": "offline"}` → say nothing

User can say "check for updates" or "update career-ops" at any time.
Rollback: `node update-system.mjs rollback`

---

## Personalization

This system is designed to be customized by YOU (AI Agent). When the user asks to change archetypes, translate modes, adjust scoring, add companies, or modify negotiation scripts — do it directly.

**Common customization requests:**
- "Change archetypes to [backend/frontend/data/devops]" → edit `config/_profile.md` or `config/profile.yml`
- "Translate the modes to English" → edit files in `{MODES_DIR}/`
- "Add these companies to my portals" → edit `portals.yml`
- "Update my profile" → edit `config/profile.yml`
- "Change the CV template design" → edit `templates/cv-template.html`
- "Adjust scoring weights" → edit `config/_profile.md` for user-specific, or `{MODES_DIR}/_shared.md` only for system defaults

---

## Language Modes

Default modes in `{MODES_DIR}/` (English). Language variants available:

- **German (DACH):** `{MODES_DIR}/../modes/de/` — 13. Monatsgehalt, Probezeit, Kündigungsfrist, AGG, Tarifvertrag
- **French:** `{MODES_DIR}/../modes/fr/` — CDI/CDD, SYNTEC, RTT, mutuelle, prévoyance, titres-restaurant, CSE
- **Japanese:** `{MODES_DIR}/../modes/ja/` — 正社員, 業務委託, 賞与, 退職金, みなし残業, 36協定

Switch when: user asks, `language.modes_dir` set in `config/profile.yml`, or JD language detected.

---

## CV Source of Truth

- `cv.md` in `$PWD` is the canonical CV
- `article-digest.md` has detailed proof points (optional)
- **NEVER hardcode metrics** — read from these files at evaluation time

---

## Ethical Use — CRITICAL

- **NEVER submit an application without the user reviewing it first.** Fill forms, draft answers, generate PDFs — always STOP before clicking Submit/Send/Apply.
- **Score below 4.0/5 → recommend against applying.** Only proceed if user has specific reason to override.
- **Quality over speed.** 5 targeted applications beat 50 generic ones.
- **Respect recruiters' time.** Only send what's worth reading.

---

## Offer Verification — MANDATORY

NEVER trust WebSearch/WebFetch to verify if an offer is still active. ALWAYS use Playwright:
1. `browser_navigate` to URL
2. `browser_snapshot` to read content
3. Footer/navbar only (no JD) = closed. Title + description + Apply button = active.

**Exception for batch workers (`claude -p`):** Playwright unavailable in headless pipe mode. Use WebFetch as fallback, mark report header `**Verification:** unconfirmed (batch mode)`.

---

## Stack and Conventions

- Node.js (mjs modules), Playwright (PDF + scraping), YAML (config), HTML/CSS (template), Markdown (data)
- Scripts: `*.mjs` | Config: YAML | Output: `output/` (gitignored) | Reports: `reports/`
- JDs: `jds/` (referenced as `local:jds/{file}` in pipeline.md)
- Batch: `batch/` (gitignored except scripts and prompt)
- Report numbering: sequential 3-digit zero-padded, max existing + 1
- **After each batch: run `node merge-tracker.mjs`** to merge tracker additions
- **NEVER create new entries in applications.md if company+role already exists** — update the existing row

### TSV Format for Tracker Additions

Write one TSV per evaluation to `batch/tracker-additions/{num}-{company-slug}.tsv`:

```
{num}\t{date}\t{company}\t{role}\t{status}\t{score}/5\t{pdf_emoji}\t[{num}](reports/{num}-{slug}-{date}.md)\t{note}
```

Column order: num | date | company | role | **status** | score | pdf | report | notes
(status before score — merge script handles column swap for applications.md)

### Pipeline Integrity

1. NEVER edit `applications.md` to ADD new entries — use TSV + `merge-tracker.mjs`
2. YES: edit `applications.md` to UPDATE status/notes of existing entries
3. All reports must include `**URL:**` and `**Legitimacy:** {tier}` in header
4. All statuses must be canonical (source: `templates/states.yml`)
5. Health check: `node verify-pipeline.mjs`
6. Normalize: `node normalize-statuses.mjs`
7. Dedup: `node dedup-tracker.mjs`

### Canonical States

| State | When |
|-------|------|
| `Evaluated` | Report done, pending decision |
| `Applied` | Application sent |
| `Responded` | Company responded |
| `Interview` | In interview process |
| `Offer` | Offer received |
| `Rejected` | Rejected by company |
| `Discarded` | Discarded by candidate or offer closed |
| `SKIP` | Doesn't fit, don't apply |

Rules: no `**bold**`, no dates, no extra text in status field.
