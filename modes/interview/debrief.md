# Skill: Post-Interview Debrief

After a real interview, capture what was asked, assess what landed and what didn't, close gaps before the next round, and update the question bank.

---

## When to Run This Skill

- Immediately after a real interview (while memory is fresh)
- After a recruiter call that surfaced new information about the process
- When the candidate learns the next round format and interviewer

---

## Inputs

1. **Interview debrief from candidate** — what questions were asked, how they answered, what felt strong or weak
2. **Interviewer name and role** — informs next round prediction
3. **Round outcome** (if known) — moved forward / rejected / pending
4. **Next round details** (if known) — format, interviewers, timeline
5. **Question bank** at `interview-prep/question-bank.md` — update with real data
6. **Story bank** at `interview-prep/story-bank.md` — add new stories if surfaced
7. **CV** at `cv.md` + `article-digest.md` (if present) — to ground suggested answers in real experience
8. **Retracted claims** at `interview-prep/retracted-claims.md` (if present) — hard gate; never use a retracted claim in a suggested answer even if the candidate said it in the interview
9. **Role-specific prep file** — append debrief notes

---

## Step 1 — Capture What Was Asked

Ask the candidate to list every question they remember, in order if possible. Don't prompt with options — let them recall freely first.

For each question captured:
- What did they say?
- How did the interviewer react (positive signal, neutral, pushed back, moved on quickly)?
- Did they feel confident or uncertain?

If memory is incomplete, ask targeted prompts:
- "Were there any questions that caught you off guard?"
- "Was there anything you wished you'd answered differently?"
- "Did the interviewer follow up on anything — that usually means they wanted more?"

---

## Step 2 — Honest Assessment Per Question

For each question, produce:

```markdown
**Q: [question]**
- What was said: [summary of their answer]
- What landed: [what was good — be specific]
- What was missing: [gap — precise technical term, missing result, no reflection, etc.]
- Correct/complete answer: [what the full answer should include]
- Status: ✅ Strong / 🟡 Solid / 🔴 Gap
```

Be direct. If they missed the core concept the question was testing, say so. If an answer was genuinely strong, say that too. The debrief is the most valuable learning moment — vagueness wastes it.

---

## Step 3 — Update Question Bank

For each question debriefed, update `interview-prep/question-bank.md`:
- Change status to ✅ / 🟡 / 🔴 based on real performance
- Add gap notes from the debrief
- Add any new questions that appeared and weren't in the bank yet

If the question bank doesn't exist, create it with the questions from this interview as the seed.

---

## Step 4 — Close the Gaps

For each 🔴 gap identified:

1. **Explain the correct answer** — clear, concise, with a worked example (code, calculation, diagram) where it helps
2. **Connect to a real story** if possible — "you actually have this in your [existing story from the story bank] — here's how to use it"
3. **Add to role-specific prep file** under a "Gaps to Close Before Round N" section
4. **Add to `interview-prep/interview-prep-guide.md`** (if the candidate maintains one) when it's a reusable principle that applies beyond this role

---

## Step 5 — Extract New Stories

Sometimes a real interview surfaces a story the candidate hadn't prepared. If the candidate described an experience they hadn't formalized:

> "You mentioned [X] in your answer — that sounds like it could become a proper STAR+R story. Want to build it out now while it's fresh?"

If yes, build it out as a STAR+R story (Situation, Task, Action, Result, Reflection) and append it to `interview-prep/story-bank.md`.

---

## Step 6 — Next Round Intelligence

If the candidate knows the next round format:

1. **Predict likely questions** based on:
   - Next interviewer's role (e.g., senior practitioner → depth in the core skill, design; cross-functional peer → collaboration, domain boundaries; executive → strategy, business impact)
   - What was covered in this round (next round typically goes deeper, not wider)
   - What the interviewer in this round seemed most interested in

   Label every prediction `[inferred]` — never present a predicted question as if it were sourced from real candidates or insiders.

2. **Build a priority list** for next round prep — ordered by gap severity and likelihood of being tested

3. **Suggest running** `plan.md` with the next round details to build a full prep plan

---

## Step 7 — Probability Assessment (Optional)

If the candidate asks for an honest read on their chances:

Assess based on:
- Number and severity of gaps (🔴 on fundamentals = higher risk than 🔴 on advanced topics)
- Interviewer signals (gave specific next round details = positive; vague = neutral; short call = risk)
- Role fit (years of experience, domain match, location)
- Differentiators (things the candidate said that most candidates wouldn't)

Be honest. A probability range with clear reasoning is more useful than false confidence.

---

## Step 8 — Save Debrief

Append to `interview-prep/{company-slug}-{role-slug}.md`:

```markdown
## Round [N] Debrief — [YYYY-MM-DD]

**Interviewer:** [name, role]
**Round type:** [screening / technical / design-case-study / behavioral]
**Outcome:** [pending / moved forward / rejected]

### Questions Asked
[list]

### Gaps Identified
[list with correct answers]

### Next Round
**Format:** [if known]
**Interviewers:** [if known]
**Priority prep:** [top 3 topics to close before next round]
```

---

## Rules

- **Debrief immediately.** Memory of interview details degrades fast — within hours, specific questions and reactions are forgotten. Run this skill the same day.
- **Don't soften gaps.** A 🔴 gap that gets called 🟡 out of kindness will show up again in the next round.
- **Never put invented claims in the candidate's mouth.** Correct/complete answers may draw on general domain knowledge, but any suggested personal claim or metric must come from what the candidate said, `cv.md`, `article-digest.md`, or the story bank.
- **Retracted claims are a hard gate.** If a claim appears in `interview-prep/retracted-claims.md`, never suggest the candidate use it — even if they said it in the real interview. Flag it: "That claim is in your retracted list — it's not defensible under pressure. Here's a version that doesn't depend on it."
- **Extract vocabulary gaps explicitly.** If the candidate used an imprecise term where a precise one exists, add it to `interview-prep/interview-prep-guide.md` under the vocabulary section (if the candidate maintains one).
- **One gap = one fix.** Don't overwhelm with a full study plan for every gap. Prioritize the 1–2 most likely to be tested in the next round.
- **Celebrate what worked.** Debrief isn't only about gaps. Name what was strong — it reinforces the right behaviour and builds confidence for the next round.
