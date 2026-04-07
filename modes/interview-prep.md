# Mode: interview-prep — Company-Specific Interview Intelligence

When the user asks to prep for an interview at a specific company+role, or when an evaluation scores 4.0+ and the user updates status to `Interview`, run this mode.

## Inputs

1. **Company name** and **role title** (required)
2. **Evaluation report** in `reports/` (if exists) — read for archetype, gaps, matched proof points
3. **Story bank** at `interview-prep/story-bank.md` — read for existing prepared stories
4. **CV** at `cv.md` + `article-digest.md` — read for proof points
5. **Profile** at `config/profile.yml` + `modes/_profile.md` — read for candidate context

## Step 1 — Research

Run these WebSearch queries. Extract structured data, not summaries. Cite sources for every claim.

| Query | What to extract |
|-------|-----------------|
| `"{company} {role} interview questions site:glassdoor.com"` | Actual questions asked, difficulty rating, experience rating, process timeline, number of rounds, offer/reject ratio |
| `"{company} interview process site:teamblind.com"` | Candid process descriptions, recent data points, comp negotiation details, hiring bar |
| `"{company} {role} interview site:leetcode.com/discuss"` | Specific coding/technical problems, system design topics, round structure |
| `"{company} engineering blog"` | Tech stack, values, what they publish about, technical priorities |
| `"{company} interview process {role}"` (general) | Fills gaps from above — blog posts, YouTube, prep guides, candidate write-ups |

If the company is small or obscure and yields few results, broaden: search for the role archetype at similar-stage companies, and note that intel is sparse.

**Do NOT fabricate questions.** If a source says "they asked about distributed systems," report that. Do not invent a specific distributed systems question. When generating likely questions from JD analysis, label them clearly as `[inferred from JD]` not sourced from candidates.

## Step 2 — Process Overview

```markdown
## Process Overview
- **Rounds:** {N} rounds, ~{X} days end-to-end
- **Format:** {e.g., recruiter screen → technical phone → take-home → onsite (4 rounds) → hiring manager}
- **Difficulty:** {X}/5 (Glassdoor avg, N reviews)
- **Positive experience rate:** {X}%
- **Known quirks:** {e.g., "pair programming instead of whiteboard", "no LeetCode, all practical", "take-home is 4 hours"}
- **Sources:** {links}
```

If data is insufficient for any field, write "unknown — not enough data" rather than guessing.

## Step 3 — Round-by-Round Breakdown

For each round discovered in research:

```markdown
### Round {N}: {Type}
- **Duration:** {X} min
- **Conducted by:** {peer / manager / skip-level / recruiter — if known}
- **What they evaluate:** {specific skills or traits}
- **Reported questions:**
  - {question} — [source: Glassdoor 2026-Q1]
  - {question} — [source: Blind]
- **How to prepare:** {1-2 concrete actions}
```

If round structure is unknown, state that and provide the best available intel on what types of rounds to expect based on company size, stage, and role level.

## Step 4 — Likely Questions

Categorize all discovered and inferred questions:

### Technical
Questions about system design, coding, architecture, domain knowledge.
For each: the question, source, and what a strong answer looks like for this candidate specifically (reference CV proof points).

### Behavioral
Questions about leadership, conflict, collaboration, failure.
For each: the question, source, and which story from `story-bank.md` maps best.

### Role-Specific
Questions tied to the specific job description (archetype-aware).
For each: the question, why they're likely asking it (what JD requirement it maps to), and the candidate's best angle.

### Background Red Flags
Questions the interviewer will probably ask about gaps, transitions, or unusual elements in the candidate's background. Read `_profile.md` and `cv.md` to identify what might raise questions.
For each: the likely question, why it comes up, and a recommended framing (honest, specific, forward-looking — never defensive).

## Step 5 — Story Bank Mapping

| # | Likely question/topic | Best story from story-bank.md | Fit | Gap? |
|---|----------------------|-------------------------------|-----|------|
| 1 | ... | [Story Title] | strong/partial/none | |

- **strong**: story directly answers the question
- **partial**: story is adjacent, needs reframing
- **none**: no existing story — flag for the user

For each gap, suggest: "You need a story about {topic}. Consider: {specific experience from cv.md that could become a STAR+R story}."

If the user wants to draft missing stories, help them build STAR+R format and append to `interview-prep/story-bank.md`.

## Step 6 — Technical Prep Checklist

Based on what the company actually tests, not generic advice:

```markdown
- [ ] {topic} — why: "{evidence from research}"
- [ ] {topic} — why: "{their blog/product suggests this matters}"
- [ ] {topic} — why: "{asked in N/M recent Glassdoor reviews}"
```

Prioritize by frequency and relevance to the role. Max 10 items.

## Step 7 — Company Signals

Things to say, do, and avoid based on research:

- **Values they screen for:** name them, cite source (careers page, blog, Glassdoor reviews)
- **Vocabulary to use:** terms the company uses internally — shows homework (e.g., Stripe says "increase the GDP of the internet", Anthropic says "safety" not "alignment")
- **Things to avoid:** specific anti-patterns flagged in interview reviews
- **Questions to ask them:** 2-3 sharp questions that demonstrate you've researched the company, tied to recent news or blog posts discovered in Step 1

## Output

Save the full report to `interview-prep/{company-slug}-{role-slug}.md` with this header:

```markdown
# Interview Intel: {Company} — {Role}

**Report:** {link to evaluation report if exists, or "N/A"}
**Researched:** {YYYY-MM-DD}
**Sources:** {N} Glassdoor reviews, {N} Blind posts, {N} other
```

## Post-Research

After delivering the report:

1. Ask the user if they want to draft stories for any gaps found in Step 5
2. If they have a scheduled interview date, note it: "Your interview is in {X} days. Want me to set a reminder to review this prep?"
3. Suggest running `deep` mode if the company research in Step 1 was thin — deep mode covers strategy, culture, and competitive landscape in more depth

## Rules

- **NEVER invent interview questions and attribute them to sources.** Inferred questions must be labeled `[inferred from JD]`.
- **NEVER fabricate Glassdoor ratings or statistics.** If the data isn't there, say so.
- **Cite everything.** Every question, every stat, every claim gets a source or an `[inferred]` tag.
- Generate in the language of the JD (EN default).
- Be direct. This is a working prep document, not a pep talk.
