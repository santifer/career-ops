# Weekly Skill Tracker — Drop Zone

This directory is where I drop a single markdown file per ISO week. A Gemini-driven extractor reads it Sunday evening, compares against the previous week + my corpus, and proposes commits that auto-merge new evidence into `cv.md`, `config/profile.yml`, and adjacent files.

**Operationalizes:** Item 8 of `data/career-calibration-20260516-190152.md` ("Weekly skill / project tracker").
**Final design:** `data/ingest-feature-strategy-2026-05-17.md` (dealbreaker-verified, Phase 4).

---

## How I use this every week

1. **Sunday afternoon (or any time during the week):** I open `data/skill-tracker/{YYYY}-W{NN}.md` for the current ISO week. If it doesn't exist yet, copy `_TEMPLATE.md` to that filename.
2. **I dump.** No editing pass, no AI smoothing. Bullet points and run-on sentences are fine — the extractor handles the cleanup. The weekly drop is a notebook, not a deliverable.
3. **Sunday 21:00 PT (cron):** `scripts/skill-ingest.mjs --week {current}` runs automatically. It:
   - Reads `data/skill-tracker/{week}.md`
   - Calls `gemini-3.1-pro-preview` in structured-output mode against the Zod schema in `lib/skill-ingest-schema.mjs`
   - Writes the extracted JSON to `data/skill-tracker/extracted/{week}.json`
   - On `--apply`, runs the per-evidence-type merge (Phase 4 Dimension 3) and commits each touched file via `scripts/agent-commit.mjs --agent skill-ingest`
4. **Monday morning heartbeat** surfaces a "Weekly growth" section: course completions, skill bumps, TPgM signals, side-allocation deliverables, ready-to-write STAR stories.

## Filename convention

`{YYYY}-W{NN}.md` — ISO 8601 week number (Monday-start), zero-padded. Examples:
- `2026-W20.md` — week of 2026-05-11 through 2026-05-17
- `2026-W01.md` — first week of 2026
- `2026-W53.md` — only present in years with 53 ISO weeks

A pointer at `data/skill-tracker-latest.md` (symlink or generated file) always references the most recent week. Tooling reads this when the explicit week isn't passed.

## Frontmatter + section schema

Every weekly drop opens with YAML frontmatter and uses H2 headings the extractor knows about. See `_TEMPLATE.md` for the canonical scaffolding. The seven sections are:

| Section | What goes here | Maps to |
|---|---|---|
| `# Highlights` | The 1-3 things I'd tell someone over coffee | Free-text context for the LLM |
| `# Skills` | New / leveled-up skills with concrete artifacts | `cv.md` Skills cluster |
| `# TPgM Evidence` | System design, agent orchestration, on-call, integration architecture, data analysis ownership | `corpus/roles/google-xge.md` + TPgM scoring |
| `# PM / 20% Allocations` | Side-project / cross-team work that's PM-shaped | `data/side-allocations.yml` |
| `# Courses & Certifications` | What I completed or started | `cv.md` Continuous learning + `data/courses.yml` |
| `# Ship log` | Dated deliverables (`YYYY-MM-DD: thing shipped`) | `projects[].ship_date` |
| `# Notes` | Anything else — 1:1 takeaways, brand signals, what I'm noticing | LLM context only, never merged |

## Anti-hallucination guardrails

The extractor's system prompt explicitly forbids inventing facts. If a week is sparse, it returns empty arrays for the relevant sections and sets `extraction_confidence: 'low'`. The merge step writes nothing in that case. **I'd rather have a quiet week logged honestly than a padded week.**

The voice-fidelity check (`writing-samples/voice-reference.md`) is reference only — the ingest never edits the voice corpus, only consumes it. Same for the humanize-check gate: any auto-generated bullet must pass risk ≤20 before commit.

## Commands

| What I want | Command |
|---|---|
| Initialize this week's drop | `node scripts/skill-ingest.mjs --week $(date +%G-W%V) --init` (planned for Day 2) |
| Preview extraction without writing | `node scripts/skill-ingest.mjs --week 2026-W20 --dry-run` |
| Run the full pipeline | `node scripts/skill-ingest.mjs --week 2026-W20 --apply` |
| Review recent extractions | `ls -lh data/skill-tracker/extracted/ \| tail -5` |
| See what changed in the corpus | `git log --grep "Agent: skill-ingest" --oneline -20` |

## Scoring impact (Phase 4 dimensions 4-5)

Every TPgM-flavored bullet contributes to a credibility score. The five weighted signals are:

| Signal | Starting weight (additive scheme, tune after 8 weeks) |
|---|---|
| System design / architecture ownership | +15 |
| Agent orchestration / code review authorship | +10 |
| Data analysis (SQL/Python) ownership | +5 |
| Integration / API mapping | +5 |
| On-call escalation ownership | +5 |

Sustained score ≥65 for 8 consecutive weeks unlocks the dashboard's "ready to claim TPgM in title" flag. PM-Bridge-Buildability and Skill-Portability roll up separately per the calibration brief's new 5%-weight scoring dimensions.

## What stays out of this directory

- **Final cover letters or polished writing** — that's the apply pipeline, not the skill tracker.
- **Application status updates** — that's `data/applications.md`.
- **Comp / negotiation intel** — that lives in `data/comp-research/` and `corpus/companies/`.
- **Anything I want to forget** — there's no "private" subdirectory here. If I don't want it ingested, I keep it out.

---

**Last updated:** 2026-05-17 (Phase 4 scaffold ships)
**Next action:** First real drop at `2026-W20.md` (this week)
