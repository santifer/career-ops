# Career-Ops Starter Guide (Antigravity native)

A runbook for running [santifer/career-ops](https://github.com/santifer/career-ops) inside **Google Antigravity** using the native `.agents/` workflow system — with Claude Opus 4.6 as the reasoning model.

The repo was built primarily for Claude Code, but the `.agents/` folder in this guide adds first-class Antigravity support. After copying it in, you get the full `/career-ops*` slash-command set natively — no priming prompt, no manual workflow driving.

---

## Part 1 — Files to copy onto your target system

On this machine I generated a complete Antigravity adapter under:

```
C:\Users\vikalp.agrawal\Desktop\career-ops\
```

Copy these additions onto the career-ops clone on your other system:

| Path (relative to repo root) | What it is |
|---|---|
| `.agents/workflows/career-ops.md` | Main router (handles `/career-ops <JD>` and discovery) |
| `.agents/workflows/career-ops-evaluate.md` | `/career-ops-evaluate` — A-G scoring only |
| `.agents/workflows/career-ops-pdf.md` | `/career-ops-pdf` — ATS CV PDF |
| `.agents/workflows/career-ops-scan.md` | `/career-ops-scan` — portal scanner |
| `.agents/workflows/career-ops-batch.md` | `/career-ops-batch` — parallel eval |
| `.agents/workflows/career-ops-apply.md` | `/career-ops-apply` — draft form answers |
| `.agents/workflows/career-ops-tracker.md` | `/career-ops-tracker` |
| `.agents/workflows/career-ops-pipeline.md` | `/career-ops-pipeline` — integrity checks |
| `.agents/workflows/career-ops-deep.md` | `/career-ops-deep` — company research |
| `.agents/workflows/career-ops-compare.md` | `/career-ops-compare` — side-by-side |
| `.agents/workflows/career-ops-contact.md` | `/career-ops-contact` — outreach |
| `.agents/workflows/career-ops-training.md` | `/career-ops-training` |
| `.agents/workflows/career-ops-project.md` | `/career-ops-project` |
| `.agents/agents.md` | 5 personas for batch Agent Manager runs |
| `docs/ANTIGRAVITY.md` | Setup reference doc |

Everything else already exists in the upstream repo. The adapter is **purely additive** — `modes/`, `.claude/`, `.opencode/` are untouched, so you can still use Claude Code or OpenCode later if you want.

The quickest way to transfer: zip the two folders (`.agents/` + `docs/ANTIGRAVITY.md`) on this machine, move to the other system, and drop them into the cloned `career-ops` root.

---

## Part 2 — Step-by-step setup on the target system

### Step 0 — Prerequisites

| Tool | Why | Install |
|---|---|---|
| Node.js 20+ | Runs npm scripts + Playwright | nodejs.org |
| Git | Clone repo | git-scm.com |
| Google Antigravity | Your IDE/CLI | antigravity.google |
| Claude Opus 4.6 access | The reasoning model | Via your Antigravity plan |

Optional: **Go** (only for the terminal dashboard — not required).

### Step 1 — Clone and install

```bash
git clone https://github.com/santifer/career-ops.git
cd career-ops
npm install
npx playwright install chromium
npm run doctor
```

### Step 2 — Drop in the Antigravity adapter

Copy the two folders described in Part 1 (`.agents/` and `docs/ANTIGRAVITY.md`) into the repo root.

After copying, your repo should have:

```
career-ops/
├── .agents/              <-- NEW
│   ├── agents.md
│   └── workflows/
│       ├── career-ops.md
│       ├── career-ops-evaluate.md
│       ├── career-ops-pdf.md
│       └── ... (13 files total)
├── .claude/              (existing)
├── .opencode/            (existing)
├── modes/                (existing — the prompt library, shared by all CLIs)
├── docs/
│   ├── ANTIGRAVITY.md    <-- NEW
│   ├── CODEX.md
│   ├── SETUP.md
│   └── ...
├── AGENTS.md             (existing — Antigravity reads this natively)
├── CLAUDE.md             (existing)
├── README.md             (existing)
└── ...
```

### Step 3 — Configure your profile

```bash
cp config/profile.example.yml config/profile.yml
cp templates/portals.example.yml portals.yml
```

Then edit:
- **`config/profile.yml`** → target roles, seniority, location, must-haves, hard-nos
- **`portals.yml`** → 5-10 companies to start with (add more later)

### Step 4 — Add your CV

Create **`cv.md`** at the repo root. Plain markdown — be generous with content; the `/career-ops-pdf` step tailors per job.

Minimum skeleton:

```markdown
# Your Name
Email · Phone · City · LinkedIn · GitHub

## Summary
One to three sentences. What you do, how long, main strength.

## Experience

### Job Title — Company (YYYY–YYYY)
- Achievement with a number
- Scope / tech stack
- Notable project

## Skills
- Languages: ...
- Frameworks: ...
- Tools: ...

## Education
Degree, Institution, Year
```

### Step 5 — Open in Antigravity

1. Open the `career-ops` folder in Antigravity.
2. In Agent Manager, set the model to **Claude Opus 4.6**.
3. Antigravity auto-loads `AGENTS.md` + everything under `.agents/`. No priming prompt needed.

### Step 6 — First run: translate modes to English (optional)

The mode library under `modes/` is in Spanish by default. If you prefer English:

> Translate every file in `modes/` from Spanish to English in place. Preserve the markdown structure and the file names. Do not change scoring logic or thresholds.

Do this once per fresh clone. Takes 2-3 minutes of Opus time.

### Step 7 — Verify the slash commands are loaded

In the Agent Manager chat, type `/` — you should see a dropdown listing all `career-ops*` commands. If you don't see them, restart Antigravity to rescan project files.

### Step 8 — Customize for yourself (one-time)

> Read `cv.md` and `config/profile.yml` and tell me what to strengthen before my first evaluation.

Opus will flag thin spots in your CV and mismatches in your profile.

> Review `modes/_profile.template.md` and help me write `modes/_profile.md` with my archetypes, narrative, and negotiation preferences.

This file is your personal extension of the system — it encodes how you want to be positioned.

---

## Part 3 — Your first real job application

### Step 1 — Evaluate

Copy the JD (full text — title, responsibilities, requirements, nice-to-haves, about the company).

In Agent Manager chat:

```
/career-ops
[paste full JD here, or a URL]
```

(If you pass a URL, career-ops will Playwright into it. Lever, Ashby, Greenhouse, Workday all work.)

What you get back:
- **Block A-F scoring** (Match with CV, North Star alignment, Comp, Cultural signals, Red flags, Personalization)
- **Block G Posting Legitimacy** — is this a real live opening or a ghost post?
- **Global score 1-5** + recommendation

**Hard filter:** if score < 4.0, stop. Below 3.5 the system actively recommends against applying.

### Step 2 — Review the output

The full pipeline auto-ran:
- Report saved to `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`
- PDF generated in `output/`
- Tracker entry written to `data/applications.md`

Open the report — read the analysis carefully. Opus is rigorous but not infallible; you have final veto.

### Step 3 — If score ≥ 4.5: draft form answers

```
/career-ops-apply reports/042-company-2026-04-17.md
```

Returns 2-4 sentence answers for common form questions ("Why this role?", "Why us?", etc.) in "I'm choosing you" tone.

### Step 4 — Interview prep (once you land one)

```
/career-ops interview-prep reports/042-company-2026-04-17.md
```

Generates STAR+Reflection stories tailored to the top 5 requirements of the JD.

### Step 5 — Submit manually

1. Open the job URL
2. Upload the PDF from `output/`
3. Copy-paste the drafted answers from the report
4. Click submit
5. Back in Antigravity: `/career-ops-tracker` — confirm the entry is marked `applied`

**The system never submits for you. That's by design.**

---

## Part 4 — Daily / weekly workflows

### Daily: triage

```
/career-ops-scan
```

Scans `portals.yml`, returns a ranked shortlist of new listings that passed preliminary archetype match. Dedupes against your existing tracker.

For each ≥ 4.0: `/career-ops <paste URL>` for the full pipeline.

### Weekly: batch

```
/career-ops-batch jds/this-week.txt
```

Where `jds/this-week.txt` has one URL per line. Spawns N parallel Agent Manager workers (using `.agents/agents.md` personas), each runs the A-G evaluation. Aggregated ranked table comes back. No auto-PDFs.

### Weekly: hygiene

```
/career-ops-pipeline
```

Runs `normalize → dedup → merge → liveness → verify`. Keeps `data/applications.md` clean and flags postings that went dead.

### Weekly: follow-ups

```
/career-ops-tracker stale
```

Shows applications > 7 days with no response. Then:

```
/career-ops-contact <recruiter name>
```

Drafts a short, specific follow-up.

---

## Command reference

| Command | Purpose |
|---|---|
| `/career-ops` | Discovery menu (list all commands) |
| `/career-ops <JD or URL>` | **Main entry** — evaluate + PDF + tracker |
| `/career-ops-evaluate <JD>` | Scoring only, no PDF |
| `/career-ops-pdf [report]` | Tailored CV PDF |
| `/career-ops-apply <report>` | Draft form answers |
| `/career-ops-scan [portal]` | Scan portals.yml |
| `/career-ops-batch <file>` | Parallel eval of many JDs |
| `/career-ops-deep <company>` | Company deep-dive |
| `/career-ops-compare <JDs>` | Side-by-side offer comparison |
| `/career-ops-tracker [filter]` | Pipeline view / management |
| `/career-ops-pipeline [op]` | Integrity checks |
| `/career-ops-contact <person>` | Draft intro / follow-up |
| `/career-ops-training <gap>` | Learning plan for a skill gap |
| `/career-ops-project <idea>` | Scope a portfolio project |

---

## File reference

| File | Purpose | You edit? |
|---|---|---|
| `cv.md` | Master CV | Yes, once + maintain |
| `article-digest.md` | Detailed proof points for cited work | Optional, recommended |
| `config/profile.yml` | Identity + targets | Yes, once |
| `modes/_profile.md` | Your archetypes, narrative, negotiation | Yes, once |
| `portals.yml` | Target companies | Yes, grow over time |
| `reports/` | Generated evaluations, tailored CVs, stories | Auto-populated |
| `data/applications.md` | Pipeline tracker | Auto-populated + manual status updates |
| `output/` | Rendered PDFs | Auto-populated |
| `modes/*.md` | Prompt library (shared by all CLIs) | No unless customizing scoring |
| `.agents/` | Antigravity slash commands + personas | No |
| `AGENTS.md` | Antigravity reads this for rules | No |
| `CLAUDE.md` | The canonical behavioural spec | No |

---

## Gotchas

- **Modes in Spanish.** Ask Opus to translate `modes/` in-place on first run. Output language is independent — you can get English output without translating the internal prompts.
- **`npm run doctor` green-lights a half-empty repo.** It checks wiring, not content quality. Quality check = Opus reading your `cv.md`.
- **Opus quota.** A full auto-pipeline (evaluate + PDF + tracker) is roughly 40-80k tokens. Batch of 10 JDs ≈ 300-500k tokens. Size your sessions accordingly.
- **Never auto-submit.** The workflows are designed with a human gate. A single wrong submission to a dream company is expensive. Keep it that way.
- **Playwright on Windows.** If `npm run pdf` fails with a browser launch error, re-run `npx playwright install chromium`. Antivirus/EDR sometimes quarantines the headless browser.
- **`.agents/` not loading.** Must be at repo root, not nested. Restart Antigravity to force a rescan of workflow files.

---

## What to ask Opus when stuck

- *"Explain what each file in `modes/` does."*
- *"Why did this JD score 3.4? Which block pulled it down the most?"*
- *"My `modes/_profile.md` feels generic — rewrite it based on my cv.md and last 3 evaluations."*
- *"Compare reports 041 and 042. Which should I prioritize and why?"*
- *"Run `/career-ops-pipeline liveness` and tell me which applications are dead postings."*
- *"I got an interview at X — run `/career-ops interview-prep reports/0XX-x.md` and prep me."*

Good hunting.
