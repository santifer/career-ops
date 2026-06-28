# Interview Sessions

Drop interview transcripts here (one `.md` file per interview round). The `patterns` mode (Step 1b — Session-Content Targeting Signal) reads them to detect role **misfit**: when your strongest, most fluent answers point at a different role-type than the one you keep applying to.

This is a higher-resolution, lower-noise signal of role-fit than win/loss outcomes — outcomes are confounded by comp, timing, and headcount; what you actually say in the room is not.

## How to use

1. Record your interview (screen/audio) and get a transcript however you like (your meeting tool's auto-transcript, a local STT, or manual notes).
2. Save it here as `interview-prep/sessions/{company}-{role}-{round}-{YYYY-MM-DD}.md`.
3. Run `patterns` mode (`/career-ops patterns`). If sessions are present, Step 1b adds a **Targeting Signal** section to the report.

## Format

Use speaker labels — `**Interviewer:**` / `**Candidate:**` — so all session consumers (patterns, interview-redflag) can read either side without re-inferring speakers:

```markdown
---
company: Acme Corp
role: Instructional Designer
round: behavioral
date: 2026-06-01
interviewer_role: Senior HR Partner
source: manual
---

## Q1
**Interviewer:** Tell me about a time you...
**Candidate:** ...your answer...

## Q2
**Interviewer:** ...
**Candidate:** ...
```

## Competency tags (optional, recommended)

Step 1b clusters answers by competency. By default it *infers* the competency of each answer — but if an answer carries an explicit tag, the tag wins (cheaper, deterministic, model-independent). Tag an answer by placing an HTML comment on the line directly above the `**Candidate:**` line:

```markdown
## Q3
**Interviewer:** How did you measure the impact of your training program?
<!-- competency: data-analysis, instructional-design -->
**Candidate:** ...your answer...
```

Rules:

- One comment per answer, directly above the `**Candidate:**` line: `<!-- competency: tag[, tag...] -->`
- Tags are lowercase-kebab-case, comma-separated when an answer demonstrates more than one (e.g. `instructional-design`, `systems-architecture`, `stakeholder-management`, `people-leadership`, `data-analysis`)
- Untagged answers are fine — Step 1b falls back to inference for them

Tags can be written by hand or emitted by tooling (e.g. the `interview/debrief` mode writes session files in this format after a real or practice round).

## Privacy — important

Sessions contain **real interviewer names and real companies**. This directory is **gitignored** (only this README and `.gitkeep` are tracked) — your session content never enters version control. The `patterns` mode also summarizes the *signal* (competency clusters) only; it never quotes a real name or company into a committed report.
