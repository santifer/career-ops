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

## Privacy — important

Transcripts contain **real interviewer names and real companies**. This directory is **gitignored** (only this README and `.gitkeep` are tracked) — your transcript content never enters version control. The `patterns` mode also summarizes the *signal* (competency clusters) only; it never quotes a real name or company into a committed report.
