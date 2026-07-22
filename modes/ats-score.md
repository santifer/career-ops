# Mode: ats-score — Candidate ATS Self-Score

Trigger: user asks how an ATS would score their resume, "score my resume", "run the ATS scorer", "candidate score", "ats score".

This mode is the mirror image of `oferta.md`. `oferta.md` scores how well a JOB fits the candidate. This mode scores how well the CANDIDATE'S resume would survive automated ATS screening, useful for finding and fixing gaps in `cv.md` before applying, not for deciding whether to apply.

**Scope note (not to be confused with):** this mode scores the candidate's underlying signal (open source activity, project complexity, production experience). It does not check CV *parseability*/structure (single-column layout, standard headings, embeddable fonts, see #2064) and does not check *JD keyword coverage* (see #1285). Those are both about the generated document, this is about the person behind it. All three can coexist.

## Attribution

The scoring rubric below is a direct adaptation of HackerRank's open-source ATS, [`hiring-agent`](https://github.com/interviewstreet/hiring-agent), specifically its `resume_evaluation_criteria.jinja` and `resume_evaluation_system_message.jinja` prompts. The category names, point bands, bonus values, and deduction ranges below are carried over from those two files, reworded into standalone instructions and restructured for candidate-side use instead of the original's company-side hiring flow. career-ops repurposes the same scoring logic candidate-side: instead of a company scoring the candidate, the candidate scores themselves first, so the gaps a real ATS would penalize get fixed before a real ATS ever sees the resume.

`hiring-agent` is MIT licensed:

```
MIT License

Copyright (c) 2025 HackerRank

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Inputs

1. Read `cv.md` (canonical resume, never hardcode metrics, read them live)
2. Read `article-digest.md` if it exists (extra proof points)
3. Read `config/profile.yml` for `narrative.proof_points`, these carry project URLs needed for the link-quality scoring below
4. If a GitHub URL is present (`config/profile.yml` `candidate.github`, or in `cv.md`), check the public GitHub profile for contributions to OTHER people's repositories, not just self-owned ones. This is the single biggest lever in the rubric below. **Deterministic order:** try `gh api search/issues -f q="author:{username} type:pr"` first. This is a real contributions source (every PR the user authored, anywhere, including repos they don't own), unlike `.../repos` which only lists repos they own. Fall back to `gh api users/{username}/events/public` if search is unavailable. Use `gh api users/{username}/repos` only to confirm a self-owned-only profile when neither contributions source is reachable (fast, structured, no fabrication risk, but cannot by itself show external contribution). Fall back to WebFetch of the profile page only if `gh` is unavailable entirely, and use WebSearch only as a last resort if all of the above fail. **If none succeed** (no GitHub URL, or every check fails outright), do not guess. Score Open Source in the 0-4 band (no verifiable presence) and say so explicitly in Evidence, rather than leaving it undefined or inferring from resume text alone.

## Fairness constraint

Scores must **never** depend on: name, gender, college/university name, GPA, city/location, or any other demographic signal. Score only on: technical skills, project complexity/impact, open source contributions, production/work experience, and technical communication. If a finding would be excluded by this rule (e.g. "went to a good school"), do not use it as evidence for any category.

## Scoring rubric

### Open Source (0-35 pts), the single biggest category

- **25-35:** contributions to popular projects (1,000+ stars), or GSoC-caliber program participation
- **15-24:** contributions to smaller external projects, active GitHub presence with commits to OTHER people's repos
- **5-14:** only personal/self-owned repos, minimal external contribution
- **0-4:** no GitHub presence, or only tutorial-style repos

**Hard rule:** personal repositories are NOT open-source contributions. If every repo in the candidate's GitHub activity is self-owned, this category is capped at 10 regardless of how polished those repos are.

**Calibration note:** this category was built for early-career/developer hiring, where public OSS activity is a common, strong signal. For senior or leadership-track archetypes (see `_shared.md`'s archetype table) whose strongest evidence is production/organizational impact rather than public commits, weight Production more heavily in the written summary and say so explicitly. A low Open Source score should read as "not this candidate's strongest lever," not as a flaw.

### Self Projects (0-30 pts)

- **20-30:** complex, real-world impact, advanced architecture, live users/adoption
- **10-19:** some complexity, good documentation, multiple features
- **1-9:** simple/tutorial-tier (todo apps, calculators, basic CRUD, weather apps, note apps)
- **0:** no projects, or only trivial ones

**Link penalty (this is the only place link quality gets scored, do not also apply it under Deductions below):**

Apply this to each project's raw tier score (from the bands above) right after you assign that score, before summing projects into the category total. Round each adjusted project score to the nearest whole number, then sum, then clamp the category total to 0 through 30.

- No GitHub link and no live demo at all: multiply that project's raw score by 0.5 to 0.7 (a 30% to 50% cut)
- GitHub link present but broken, or a link with no live demo: multiply by 0.7 to 0.8 (a 20% to 30% cut)
- GitHub link and a working live demo: multiply by 1.10 to 1.20 (a 10% to 20% bonus), never letting the adjusted score exceed 30

### Production (0-25 pts)

Work, internship, or volunteer experience with real-world or production impact. Give extra weight to founder/co-founder roles or early-employee roles (first 10-20 people) at a startup, since these demonstrate initiative and ownership that a standard internship doesn't.

### Technical Skills (0-10 pts)

Breadth and depth shown in the skills list, languages used, and problem-solving evidence surfaced across projects and work experience.

### Bonus (max +20 total, hard cap)

- +5 GSoC or equivalent flagship open-source program participation
- +3 other recognized OSS program (e.g. Outreachy, Season of Docs)
- +3 to +5 startup founder/co-founder experience
- +2 to +3 early-stage engineer (first 10-20 employees)
- +2 portfolio site or GitHub URL listed on the resume
- +1 LinkedIn listed
- +1 to +3 quality technical writing (blog/published articles), if any exists

### Deductions

- -2 to -5 if the resume contains only tutorial-tier projects
- -1 to -3 for each simple project beyond the first
- -1 for generic project names ("Calculator", "Todo App", "Weather App")

Link quality is already scored in the Self Projects link penalty above, so it does not get deducted again here.

**Total cap: 120 points** (100 from the four categories plus 20 bonus, deductions subtracted after). Round every category subtotal to the nearest whole number before summing. The final total can never go below 0, even after deductions, and never above 120.

## Output format

```markdown
## ATS Self-Score — {YYYY-MM-DD}

| Category | Score | Max | Evidence |
|---|---|---|---|
| Open Source | X | 35 | ... |
| Self Projects | X | 30 | ... |
| Production | X | 25 | ... |
| Technical Skills | X | 10 | ... |

**Bonus:** +X — {breakdown}
**Deductions:** -X — {reasons}
**Total:** X / 120

**Key strengths** (max 5, evidence-backed)
1. ...

**Areas for improvement** (max 3, concrete and actionable, e.g. "Add a live demo link to your top project," not "improve projects")
1. ...
```

## Post-scoring

Append the run to `interview-prep/ats-score.md` (create if missing). Do not overwrite prior runs. This builds a dated history so the candidate can see the score trend as `cv.md` improves over time, the same pattern `interview-prep/story-bank.md` uses for STAR+R stories.

Do not write anything to `data/applications.md` or `reports/`. This mode scores the candidate, not a specific job offer, so it does not belong in the job pipeline or tracker.
