# Mode: upskill -- Skill-Gap Analysis and Learning Plan

## Purpose

Turn evaluated roles into evidence-based skill priorities.

- `/career-ops upskill` aggregates recurring gaps from the tracker and reports.
- `/career-ops upskill <url|report|local:jds/file>` builds a targeted learning plan for one role.

The mode must use demand evidence from roles the user actually evaluated. It
must not produce a generic course list or invent candidate experience.

## Source-of-Truth Boundary

Candidate facts may come only from:

- `cv.md`
- `article-digest.md`
- `config/profile.yml`
- `modes/_profile.md`
- `modes/_custom.md` for workflow and style rules only
- `voice-dna.md` and `writing-samples/` for tone only
- `interview-prep/story-bank.md`
- `interview-prep/{company}-{role}.md`
- factual statements from the user in the current conversation

Tracker rows, reports, and JDs provide employer demand signals, not candidate
facts. Never use sibling repositories, auto-memory, placeholders, or inferred
authorship as evidence that the user has a skill.

## Mode Selection

### Aggregate mode

Use when no target argument is supplied. Inputs:

- `data/applications.md`
- linked files under `reports/`
- `cv.md` and `config/profile.yml`
- previous `data/upskill/report-*.md` files

### Targeted mode

Use when the argument is one of:

- a live job URL
- a report number, slug, or path under `reports/`
- `local:jds/{file}` or `jds/{file}`

Targeted mode also reads the candidate source-of-truth files above.

## Aggregate Workflow

### Step 1 - Run the deterministic aggregator

```bash
node upskill.mjs
```

Parse the JSON output:

| Key | Meaning |
|-----|---------|
| `schema_version` | Extraction-rule version used for comparable reports |
| `metadata` | Linked, readable, scored, machine-summary, and low-fit report counts |
| `gaps` | Normalized gaps sorted by weighted score |
| `excludedAsKnown` | Report gaps already evidenced in the CV/profile |
| `knownSkills` | Extracted known-skill set for transparency |

Each skill counts once per report. The weight is `5.0 - score`, so a gap from a
low-fit report contributes more than the same gap from a high-fit report.

If the script returns `error`, show it and stop gracefully. Do not fabricate a
heatmap when the tracker is missing or has fewer than the configured minimum
number of scored reports. `--min-reports N` may be used only when the user asks
to analyze a small tracker.

### Step 2 - Optional synthesis

Read the lowest-scoring source reports and add only gaps the tokenizer cannot
represent, tagged as one of:

- `[domain]`
- `[soft]`
- `[tooling]`
- `[credential]`

Every synthesized gap must cite `LLM synthesis` and a source report. Never add
a duplicate of an aggregator gap or anything in `excludedAsKnown` or
`knownSkills`. Skip synthesis on a cheap model or when evidence is ambiguous.

### Step 3 - Write the aggregate report

Write `data/upskill/report-{YYYY-MM-DD}.md`:

```markdown
# Skill-Gap Analysis -- {YYYY-MM-DD}

**Schema:** v{schema_version}
**Reports analyzed:** {reportsRead} ({reportsScored} scored, {lowFitReports} low-fit)
**Coverage note:** {reportsWithMachineSummary}/{reportsRead} reports include a Machine Summary block.

## Gap Heatmap

| Tier | Skill | Evidence | Source |
|------|-------|----------|--------|

## Already Covered

## Diff vs Previous Report

## Suggested Order
```

Compare only with the newest earlier report using the same schema version.
Classify skills as closed, new, or still open. If schema versions differ, state
that the reports are not comparable and omit the diff.

## Targeted Workflow

### Step 1 - Resolve and verify the target

- URL: use Playwright navigation and snapshot to read the JD. A title,
  description, and Apply control means active; navigation-only content means
  closed. In headless batch mode, mark verification as unconfirmed.
- Report: locate the matching report and follow its `URL` and JD evidence.
- Local JD: resolve only within `jds/`; reject path traversal.

If no readable JD or report can be resolved, stop without writing a plan.

### Step 2 - Extract demand signals

Extract and classify:

- must-have and preferred skills
- tools, platforms, and frameworks
- domain and regulatory knowledge
- seniority and experience-shape requirements
- repeated terminology worth mirroring in future materials

Normalize only clear synonyms. Do not convert adjacent experience into a
stronger claim.

### Step 3 - Compare with candidate evidence

For each demand signal, assign coverage:

| Coverage | Meaning |
|----------|---------|
| Strong | Clearly evidenced in an allowed candidate source |
| Partial | Related evidence exists but the JD asks for a sharper form |
| Missing | No allowed evidence exists |
| Unknown | The user may have it, but it is not documented |

Assign priority:

| Priority | Meaning |
|----------|---------|
| Critical | A missing must-have that blocks this target |
| High | A material preferred gap or interview risk |
| Medium | A useful differentiator |
| Low | A distraction for this target |

### Step 4 - Build an actionable plan

For Critical and High gaps include:

- a demonstrable target outcome
- one to three current resources, preferring official documentation
- an exact verification/access date for every external resource
- a realistic timebox
- a portfolio, coding, research, or interview artifact
- a prompt for evidence to record after the work is actually completed

Do not add the resulting skill to the CV or profile until the user confirms
completion. STAR sections are prompts only unless the user supplies real facts.

### Step 5 - Write the targeted plan

Write `data/upskill/plan-{YYYY-MM-DD}-{slug}.md`:

```markdown
# Targeted Skill-Gap Plan -- {role}

**Target:** {company and role}
**Source:** {URL, report, or local JD}
**Verification:** {active, closed, local, or unconfirmed}
**Generated:** {YYYY-MM-DD}

## Executive Summary

## Gap Heatmap

| Priority | Skill / Area | Demand Signal | Coverage | Evidence | Next Action |
|----------|--------------|---------------|----------|----------|-------------|

## Learning Plan

## Interview Prep Hooks

## What Not To Learn Yet
```

## Final Response

For aggregate mode, report the number of analyzed/scored roles, top three gaps,
and diff highlights. For targeted mode, report the top three priorities and the
first artifact to build. Always provide the output path.

## Rules

- All output is user layer under `data/upskill/`.
- A skill evidenced in `cv.md` or `config/profile.yml` cannot be reported as
  missing. If the user disputes an exclusion, correct the source file first.
- Every gap must cite tracker counts, a report/JD source, or `LLM synthesis`.
- External resource URLs, prices, availability, and freshness must be checked;
  never invent them.
- This mode never submits applications or modifies tracker status.
