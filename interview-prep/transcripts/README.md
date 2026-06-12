# Interview Transcripts

Drop interview transcripts here (one `.md` file per interview). The `patterns` mode (Step 1b — Transcript-Content Targeting Signal) reads them to detect role **misfit**: when your strongest, most fluent answers point at a different role-type than the one you keep applying to.

This is a higher-resolution, lower-noise signal of role-fit than win/loss outcomes — outcomes are confounded by comp, timing, and headcount; what you actually say in the room is not.

## How to use

1. Record your interview (screen/audio) and get a transcript however you like (your meeting tool's auto-transcript, a local STT, or manual notes).
2. Save it here as `interview-prep/transcripts/{company}-{role}-{YYYY-MM-DD}.md`.
3. Run `patterns` mode (`/career-ops patterns`). If transcripts are present, Step 1b adds a **Targeting Signal** section to the report.

## Format

Free-form is fine — Step 1b infers speakers if they aren't labelled. A lightly structured transcript analyzes best:

```markdown
# {Company} — {Role} — {YYYY-MM-DD}

**Q:** Tell me about a time you...
**A:** ...your answer...

**Q:** ...
**A:** ...
```

## Competency tags (optional, recommended)

Step 1b clusters answers by competency. By default it *infers* the competency of each answer — but if an answer carries an explicit tag, the tag wins (cheaper, deterministic, model-independent). Tag an answer by placing an HTML comment on the line directly above it:

```markdown
**Q:** How did you measure the impact of your training program?
<!-- competency: data-analysis, instructional-design -->
**A:** ...your answer...
```

Rules:

- One comment per answer, directly above the `**A:**` line: `<!-- competency: tag[, tag...] -->`
- Tags are lowercase-kebab-case, comma-separated when an answer demonstrates more than one (e.g. `instructional-design`, `systems-architecture`, `stakeholder-management`, `people-leadership`, `data-analysis`)
- Untagged answers are fine — Step 1b falls back to inference for them

Tags can be written by hand or emitted by tooling: this is the target schema for transcript producers such as the `interview/debrief` mode (#686), so machine-generated transcripts cluster deterministically without re-inference.

## Privacy — important

Transcripts contain **real interviewer names and real companies**. This directory is **gitignored** (only this README and `.gitkeep` are tracked) — your transcript content never enters version control. The `patterns` mode also summarizes the *signal* (competency clusters) only; it never quotes a real name or company into a committed report.
