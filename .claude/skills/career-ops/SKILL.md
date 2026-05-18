---
name: career-ops
description: AI job search command center — evaluate offers, generate CVs, scan portals, track applications, and run apply-pack pipelines
user_invocable: true
args: mode
argument-hint: "[scan | deep | pdf | oferta | ofertas | apply | batch | tracker | pipeline | contacto | training | project | interview-prep | patterns | followup | latex | update]"
---

# career-ops — Router

## Mode Routing

Determine the mode from `{{mode}}`:

| Input | Mode |
|---|---|
| (empty / no args) | `discovery` — show command menu |
| JD text or URL (no sub-command) | **`auto-pipeline`** |
| `oferta` | `oferta` |
| `ofertas` | `ofertas` |
| `contacto` | `contacto` |
| `deep` | `deep` |
| `pdf` | `pdf` |
| `latex` | `latex` |
| `training` | `training` |
| `project` | `project` |
| `tracker` | `tracker` |
| `pipeline` | `pipeline` |
| `apply` | `apply` |
| `scan` | `scan` |
| `batch` | `batch` |
| `interview-prep` | `interview-prep` |
| `patterns` | `patterns` |
| `followup` | `followup` |

**Auto-pipeline detection:** If `{{mode}}` is not a known sub-command AND contains JD text (keywords: "responsibilities", "requirements", "qualifications", "about the role", "we're looking for", or a company-name + role-title combination) or a URL pointing at a JD board (Greenhouse / Ashby / Lever / Workday / company careers page), execute `auto-pipeline`.

If `{{mode}}` is not a sub-command AND doesn't look like a JD, show discovery.

---

## Discovery Mode (no arguments)

Show this menu:

```
career-ops — Command Center

Job evaluation:
  /career-ops {JD or URL}   → AUTO-PIPELINE: evaluate + report + PDF + tracker
  /career-ops oferta        → Evaluation only (Blocks A–G, no auto PDF)
  /career-ops ofertas       → Compare and rank multiple offers
  /career-ops deep          → Deep research prompt about a company

Pipeline + portal scanning:
  /career-ops scan          → Scan portals (Greenhouse / Ashby / Lever) for new offers
  /career-ops pipeline      → Process pending URLs in data/pipeline.md
  /career-ops batch         → Batch processing with parallel workers

Application building:
  /career-ops pdf           → Render the master CV PDF (Typst is the preferred path)
  /career-ops latex         → Render via the legacy LaTeX template
  /career-ops apply         → Live application assistant (reads form + drafts answers)
  /career-ops contacto      → LinkedIn power move: find contacts + draft outreach
  /career-ops interview-prep → STAR+R + company-specific intel pack for an upcoming interview

Analytics + cadence:
  /career-ops tracker       → Application status overview (data/applications.md)
  /career-ops patterns      → Rejection pattern detector
  /career-ops followup      → Follow-up cadence + next-touch recommendation

Portfolio:
  /career-ops project       → Evaluate a portfolio project idea
  /career-ops training      → Evaluate a course or cert against North Star

Inbox: paste a JD URL into data/pipeline.md, then `/career-ops pipeline`.
Or paste a JD text/URL directly to run the full pipeline.
```

---

## Context Loading by Mode

After determining the mode, load the necessary files before executing:

### Modes that require `_shared.md` + their mode file
Read `modes/_shared.md` + `modes/{mode}.md`.

Applies to: `auto-pipeline`, `oferta`, `ofertas`, `pdf`, `latex`, `contacto`, `apply`, `pipeline`, `scan`, `batch`.

### Standalone modes (only their mode file)
Read `modes/{mode}.md`.

Applies to: `tracker`, `deep`, `training`, `project`, `interview-prep`, `patterns`, `followup`.

### Modes delegated to subagent
For `scan`, `apply` (with Playwright), and `pipeline` (3+ URLs): launch as an Agent with the content of `_shared.md` + `modes/{mode}.md` injected into the subagent prompt.

```
Agent(
  subagent_type="general-purpose",
  prompt="[content of modes/_shared.md]\n\n[content of modes/{mode}.md]\n\n[invocation-specific data]",
  description="career-ops {mode}"
)
```

Execute the instructions from the loaded mode file.

---

## Notes

- The user-layer personalization (cv.md, config/profile.yml, modes/_profile.md, portals.yml) is gitignored — everything in modes/_shared.md reads it but never writes it directly. To customize archetypes, narrative, scoring weights, or comp targets, edit `modes/_profile.md` or `config/profile.yml`.
- The Typst CV path (`scripts/render-cv-typst.mjs` + `templates/cv-template.typ`) is the preferred renderer as of 2026-05-18. The HTML (Playwright) and LaTeX paths remain available as alternates — they're documented in `scripts/build-apply-pack.mjs` stubs.
- Cost-gated phases (council research, batch tailoring) follow `MONTHLY_BUDGET_USD` in `.env` — see `AGENTS.md` for the cost guard policy.
