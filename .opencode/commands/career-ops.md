---
description: Job search command center - evaluate offers, scan portals, generate CVs
agent: general
---

# Career-Ops Command Center

You're running the career-ops job search automation system.

Arguments provided: $ARGUMENTS

**What to do:**

1. Load the career-ops skill to figure out what mode to run
2. The skill will route based on the arguments:
   - No args → show discovery menu
   - JD text or URL → run auto-pipeline
   - Subcommand (scan, offer, pdf, etc.) → run that mode
3. Load the appropriate mode files from `modes/` and execute them

**Important:** The mode files (in `modes/`) are in Spanish. Read them, understand the workflow, and execute while talking to the user in English.

**Quick routing guide:**
- Empty/no args: show discovery menu
- URL or JD text: auto-pipeline (full evaluation + PDF + tracker)
- `scan`: portal scanner
- `offer`: single evaluation (no PDF)
- `pdf`: CV generation only
- `tracker`: view application status
- Other modes: see skill router for full list
