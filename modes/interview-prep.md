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

The first round of most processes is a recruiter / HR screen, not a technical panel — so research has to cover both. Group queries by the audience they inform:

**Recruiter / HR screen** (early-round fit, comp, logistics):

| Query | What to extract |
|-------|-----------------|
| `"{company} {role} salary site:levels.fyi OR site:glassdoor.com/Salary"` | Comp ranges (base / equity / bonus) by level |
| `"{company} interview process site:glassdoor.com"` (filter for recruiter / HR screen) | Process timeline, screening criteria, common screening questions, recruiter behavior |
| `"{company} site:teamblind.com" comp negotiation OR offer` | Candid comp/leverage details, what recruiters push back on |
| `"{company} careers"` + `"{company} benefits"` | Official comp/benefits framing, work-auth/visa policy, location policy |

**Hiring manager / leadership** (motivation, scope alignment, team fit):

| Query | What to extract |
|-------|-----------------|
| `"{company} engineering blog"` and `"{company} {team} blog"` | Team's recent work, technical priorities, named challenges |
| `"{company}" news OR launch OR roadmap` (last 12 months) | Recent milestones, public bets, hiring drivers |
| `"{company} {role} interview process"` (general) | Hiring-manager round structure, what they evaluate, candidate write-ups |

**Peer / technical panel** (depth, collaboration, on-the-job realism):

| Query | What to extract |
|-------|-----------------|
| `"{company} {role} interview questions site:glassdoor.com"` | Actual questions asked, difficulty rating, experience rating, number of rounds, offer/reject ratio |
| `"{company} {role} interview site:leetcode.com/discuss"` | Specific coding/technical problems, system design topics, round structure |
| `"{company} interview process site:teamblind.com"` (filter for tech rounds) | Hiring bar, recent technical interview data points |

If the company is small or obscure and yields few results, broaden: search for the role archetype at similar-stage companies, and note that intel is sparse. Do the recruiter-screen queries even when intel is sparse — comp/logistics data exists for almost every company.

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

## Step 2.5 — Audience Map

Classify each round from Step 2 into exactly one audience. The audience drives what gets prioritized in Steps 4 and 7.

| Audience            | Typical round                                | Primary evaluation                                              |
|---------------------|----------------------------------------------|-----------------------------------------------------------------|
| `recruiter-screen`  | First call (15–30 min, recruiter / HR / TA)  | Fit gate: motivation, comp, location/visa, timeline             |
| `hiring-manager`    | Manager / skip-level (30–45 min)             | Why this role, scope alignment, leadership signals              |
| `peer-tech`         | IC technical (live coding, system design, take-home review) | Depth + collaboration on the actual stack                       |
| `panel-mixed`       | Onsite / loop with multiple interviewer types in one block  | Cross-cuts the above                                            |

If `Conducted by` is unknown for a round, infer from duration + position in the process: round 1 short call → `recruiter-screen`; round 2 longer call → `hiring-manager` (default for mid-process); deep technical block → `peer-tech`. Mark inferred audiences with `[inferred]` and keep going — sparse intel is normal early in research.

```markdown
## Audience Map
- **Round 1** ({type}) → `recruiter-screen`
- **Round 2** ({type}) → `hiring-manager`
- **Round 3** ({type}) → `peer-tech`
- ...
```

## Step 3 — Round-by-Round Breakdown

For each round discovered in research:

```markdown
### Round {N}: {Type} — audience: `{audience}`
- **Duration:** {X} min
- **Conducted by:** {peer / manager / skip-level / recruiter — if known}
- **What they evaluate:** {specific skills or traits}
- **Reported questions:**
  - {question} — [source: Glassdoor 2026-Q1]
  - {question} — [source: Blind]
- **How to prepare:** {1-2 concrete actions, audience-appropriate — see Step 4 for the full per-audience pack}
```

If round structure is unknown, state that and provide the best available intel on what types of rounds to expect based on company size, stage, and role level.

## Step 4 — Likely Questions (per audience)

Group all discovered and inferred questions by the audience that asks them, not by question type. Within each audience, draft candidate-specific answers using `cv.md`, `article-digest.md`, `config/profile.yml`, and `modes/_profile.md`. **Never fabricate questions** — sourced questions must cite, inferred questions must be tagged `[inferred from JD]`.

### Audience: `recruiter-screen`

The recruiter is screening for fit, not testing skill. Wrong-foot answers (vague comp, fuzzy motivation, missing logistics) end the process before any technical signal is collected. Cover at minimum:

- **"Walk me through your CV / why are you looking?"** — 60–90s narrative anchored to `modes/_profile.md` narrative + the role's archetype.
- **Comp expectation** — concrete range pulled from Step 1 Levels.fyi/Glassdoor data, anchored to `config/profile.yml` `compensation.target`. Note the leverage hand: if comp data is thin or the candidate has no competing offer, recommend deferring with a clean script ("I'm calibrating to market for {level}, can you share the band for this role?").
- **Why this company** — 2–3 sentences referencing public signals from Step 1 (recent launch, named values, team work). Avoid generic praise.
- **Location / remote / visa** — answer derived from `config/profile.yml` location policy and the role's posted policy. Flag deal-breakers from `modes/_profile.md` so the recruiter can route correctly.
- **Timeline / availability / notice period** — numbers, not vibes.
- **Other processes in flight** — recommended framing only; never push the candidate to lie.
- **Background red flags** — gaps, transitions, unusual elements from `cv.md` + `_profile.md`. Honest, specific, forward-looking framing — never defensive.

### Audience: `hiring-manager`

The HM is screening for motivation + scope fit. They've already trusted the recruiter's logistics gate; they care whether you'd own the work. Cover at minimum:

- **"Why this role, why now?"** — connect candidate's last 1–2 roles + `_profile.md` narrative to the team's named challenge from Step 1.
- **"What would your first 90 days look like here?"** — derived from JD scope + the team's recent work (engineering blog, public roadmap).
- **Leadership / collaboration questions** — map to `interview-prep/story-bank.md`.
- **Sharp questions to ask back** — 2–3 tied to a specific recent thing the team shipped or wrote about, not generic "what's the team like".

### Audience: `peer-tech`

This is where the original Technical / Role-Specific buckets live. Peers are evaluating depth and collaboration on the actual stack.

- **Technical questions** (system design, coding, architecture, domain) — for each: the question, source, and what a strong answer looks like for this candidate specifically (reference CV proof points).
- **Role-specific questions** tied to the JD archetype — for each: the question, why they're likely asking it (which JD requirement it maps to), and the candidate's best angle.
- **Reverse questions** — about on-call, code review culture, deployment cadence, what surprised them when they joined.

### Audience: `panel-mixed`

Pull material from the three audience packs above per interviewer slot. Flag who-asks-what when the data exists; otherwise label as mixed and prep all three packs.

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

## Step 7 — Company Signals (per audience)

Things to say, do, and avoid — segmented by who's listening. The same fact can be a strength to a peer engineer and a yellow flag to a recruiter; framing matters.

### To the recruiter / HR screen

- **What to volunteer**: motivation, location/visa fit, timeline, why this company.
- **What NOT to volunteer**: hard comp number when leverage is uncertain (defer to band); ongoing process details; opinions on the company's recent layoffs / press.
- **Vocabulary**: official company language for benefits and policies (from careers page).
- **Red flags they screen for**: visa surprises, comp mismatch, "looking everywhere" energy.

### To the hiring manager

- **What to lead with**: connection between candidate narrative (`_profile.md`) and a named team challenge from Step 1.
- **Vocabulary to use**: terms the company uses internally — shows homework (e.g., Stripe says "increase the GDP of the internet", Anthropic says "safety" not "alignment").
- **Sharp questions to ask back**: 2–3 tied to recent news / blog posts from Step 1.

### To the peer / technical panel

- **What to lead with**: stack-relevant proof points from `cv.md` / `article-digest.md`.
- **Things to avoid**: anti-patterns flagged in Glassdoor / Blind reviews specific to this company.
- **Reverse questions**: on-call rotation, code review norms, deployment cadence, what surprised them when they joined.

## Output

Save the full report to `interview-prep/{company-slug}-{role-slug}.md` with this header:

```markdown
# Interview Intel: {Company} — {Role}

**URL:** {job posting URL or company careers URL, or "N/A" if recruiter-sourced}
**Report:** {link to evaluation report if exists, or "N/A"} (legitimacy tier lives there)
**Researched:** {YYYY-MM-DD}
**Sources:** {N} Glassdoor reviews, {N} Blind posts, {N} other
**Audiences covered:** {recruiter-screen, hiring-manager, peer-tech, panel-mixed}
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
