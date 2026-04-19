---
name: interview-prep
description: Generate company-specific interview preparation reports. Use when the user asks to prep for an interview at a specific company and role, or when a JD evaluation scores 4.0+ and status moves to "Interview". Covers 7-step process: research (Glassdoor/Blind/LeetCode), process overview, round breakdown, likely questions, story bank mapping, tech prep checklist, and company signals. Outputs a structured prep report. Trigger on "interview prep", "prep for interview", "prepare for interview at", "interview questions for".
---

# Interview Prep Skill

Company-specific interview intelligence based on real data.

## Data Sources

Read these before starting (if they exist):
- **CV:** `cv.md` (project root)
- **Article digest:** `article-digest.md` (project root, if exists)
- **Profile:** `config/profile.yml` + `modes/_profile.md`
- **Story bank:** `interview-prep/story-bank.md`
- **Evaluation report:** `reports/{company-slug}.md` (if exists)

## Inputs (Required)

1. **Company name** + **role title**
2. Evaluation report (if exists) — for archetype, gaps, matched proof points

## 7-Step Process

### Step 1 — Research

Run these `web_search` queries. Extract structured data, cite sources for every claim.

| Query | Extract |
|-------|---------|
| `"{company} {role} interview questions site:glassdoor.com"` | Actual questions, difficulty rating, experience rating, process timeline, rounds, offer/reject ratio |
| `"{company} interview process site:teamblind.com"` | Candid process descriptions, recent data points, comp negotiation, hiring bar |
| `"{company} {role} interview site:leetcode.com/discuss"` | Specific coding/technical problems, system design topics, round structure |
| `"{company} engineering blog"` | Tech stack, values, what they publish, technical priorities |
| `"{company} interview process {role}"` (general) | Blog posts, YouTube, prep guides, candidate write-ups |

For small/obscure companies with few results, broaden to role archetype at similar-stage companies. Note that intel is sparse.

Use `web_fetch` on promising URLs for deeper extraction.

**NEVER fabricate questions.** Report what sources say. Inferred questions from JD analysis must be labeled `[inferred from JD]`.

### Step 2 — Process Overview

```markdown
## Process Overview
- **Rounds:** {N} rounds, ~{X} days end-to-end
- **Format:** {recruiter screen → technical phone → take-home → onsite (4 rounds) → hiring manager}
- **Difficulty:** {X}/5 (Glassdoor avg, N reviews)
- **Positive experience rate:** {X}%
- **Known quirks:** {specific details}
- **Sources:** {links}
```

Write "unknown — not enough data" for any field lacking data. Never guess.

### Step 3 — Round-by-Round Breakdown

For each discovered round:

```markdown
### Round {N}: {Type}
- **Duration:** {X} min
- **Conducted by:** {peer / manager / skip-level / recruiter}
- **What they evaluate:** {specific skills or traits}
- **Reported questions:**
  - {question} — [source: Glassdoor 2026-Q1]
  - {question} — [source: Blind]
- **How to prepare:** {1-2 concrete actions}
```

If round structure is unknown, provide best available intel based on company size, stage, and role level.

### Step 4 — Likely Questions

Categorize all discovered and inferred questions:

**Technical** — system design, coding, architecture, domain knowledge. For each: question, source, what a strong answer looks like (reference CV proof points from `cv.md` and `article-digest.md`).

**Behavioral** — leadership, conflict, collaboration, failure. For each: question, source, which story from `story-bank.md` maps best.

**Role-Specific** — tied to JD requirements (archetype-aware). For each: question, which JD requirement it maps to, candidate's best angle.

**Background Red Flags** — questions about gaps, transitions, or unusual elements (read `cv.md` and `modes/_profile.md`). For each: likely question, why it comes up, recommended framing (honest, specific, forward-looking — never defensive).

### Step 5 — Story Bank Mapping

| # | Likely question/topic | Best story from story-bank.md | Fit | Gap? |
|---|----------------------|-------------------------------|-----|------|
| 1 | ... | [Story Title] | strong/partial/none | |

- **strong**: story directly answers the question
- **partial**: adjacent, needs reframing
- **none**: no existing story — flag for user

For each gap, suggest: "You need a story about {topic}. Consider: {specific experience from cv.md that could become a STAR+R story}."

Offer to help draft missing stories in **STAR+R format** (Situation, Task, Action, Result, Reflection) and append to `interview-prep/story-bank.md`.

### Step 6 — Technical Prep Checklist

Based on what the company actually tests, not generic advice:

```markdown
- [ ] {topic} — why: "{evidence from research}"
- [ ] {topic} — why: "{their blog/product suggests this matters}"
- [ ] {topic} — why: "{asked in N/M recent Glassdoor reviews}"
```

Max 10 items. Prioritize by frequency and relevance.

### Step 7 — Company Signals

- **Values they screen for:** name them, cite source (careers page, blog, Glassdoor)
- **Vocabulary to use:** internal terms showing homework (e.g., Stripe: "increase the GDP of the internet")
- **Things to avoid:** anti-patterns flagged in interview reviews
- **Questions to ask them:** 2-3 sharp questions tied to recent news or blog posts from Step 1

## Output

Save report to `interview-prep/{company-slug}-{role-slug}.md`:

```markdown
# Interview Intel: {Company} — {Role}

**Evaluation report:** {link or "N/A"}
**Researched:** {YYYY-MM-DD}
**Sources:** {N} Glassdoor reviews, {N} Blind posts, {N} other
```

## Post-Research

1. Ask user if they want to draft stories for gaps found in Step 5
2. If interview date is known, note remaining days and offer a review reminder
3. Suggest running `deep-research` mode if Step 1 data was thin

## Rules

- **NEVER invent interview questions** and attribute them to sources. Inferred questions must be labeled `[inferred from JD]`.
- **NEVER fabricate ratings or statistics.** If data isn't there, say so.
- **Cite everything.** Every question, stat, and claim gets a source or `[inferred]` tag.
- Generate in the language of the JD (EN default).
- Be direct. This is a working prep document, not a pep talk.
- Write in native tech English: short sentences, action verbs, no passive voice.
