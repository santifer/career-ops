# Mode: answer -- Application Question Answer Writer

Use this mode when the candidate pastes one or more job application questions and wants polished answers for manual submission.

This mode drafts answers only. It never submits applications, never clicks buttons, and never claims experience that is not supported by the candidate context.

## Inputs

The user may provide:

- A question only
- Question + company + role
- Question + pasted JD
- Question + existing report path
- Multiple questions from a form

If company, role, or JD context is missing, proceed with the best available context when the question is generic. Ask for more context only when the missing detail would materially change the answer.

## Context Loading

Always read:

1. `modes/_shared.md`
2. `modes/_profile.md`
3. `config/profile.yml`
4. `cv.md`
5. `article-digest.md` if it exists

Then find job-specific context:

1. If a report path is provided, read it.
2. If company/role is provided, search `reports/` for the closest match.
3. If a JD is pasted, use it directly.
4. If no report/JD exists, use profile and CV only, and keep company-specific claims conservative.

For CLI-assisted context packaging, run:

```bash
node application-answer.mjs --company "{Company}" --role "{Role}" --question "{Question}" --save
```

Then read `output/application-answer-brief.md` and draft from that brief.

## Answer Strategy

For each question:

1. Identify what the employer is really testing:
   - Motivation / why this company
   - Role fit
   - Technical depth
   - Ownership / collaboration
   - Work authorization / location
   - Compensation
   - Gap or transition
2. Choose the strongest matching proof point from `cv.md`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, or the report.
3. Tie the proof point to a specific need in the JD or report.
4. Bridge any gap honestly:
   - Use adjacent systems, scale, tooling, or domain experience.
   - Say what transfers.
   - Do not fabricate direct experience.
5. End with a forward-looking sentence that explains what the candidate would bring to this team.

## Voice Rules

Write like a strong engineer who is selective about roles:

- Specific, warm, confident, and slightly energetic
- First person, natural contractions allowed
- Concrete nouns and verbs over adjectives
- One memorable proof point per answer unless the form allows a longer response
- Human rhythm: vary sentence length and avoid perfect essay structure

Avoid:

- "I am excited to apply..."
- "I am passionate about..."
- "This is a unique opportunity..."
- "I would be a perfect fit..."
- "My background has prepared me..."
- "I have a proven track record..."
- Any claim that sounds like the company website rewritten back to them

Good openings:

- "The part of this role that stands out to me is..."
- "I tend to do my best work where..."
- "What maps most directly from my background is..."
- "I have spent the last few years building..."
- "For this role, I would bring..."

## Length Defaults

Unless the form specifies otherwise:

- Short text box: 60-90 words
- Standard application question: 90-140 words
- Cover-letter style question: 180-260 words
- Logistics questions: one direct sentence

Do not exceed 170 words for normal answers unless the user explicitly asks.

## Output Format

Return copy-paste-ready answers first:

```markdown
## Answer

[Final answer]
```

For multiple questions:

```markdown
## Answers

### 1. [Exact question]

[Final answer]

### 2. [Exact question]

[Final answer]
```

Then add a compact review note only if useful:

```markdown
## Notes

- Assumption: [company/role/context assumption]
- Review: [one thing the candidate should verify before pasting]
```

Do not include long explanations of the writing process.

## Special Cases

### Work Authorization

Use the profile facts exactly. For Ishaan:

> I am a Canadian citizen and open to US relocation. I would need an employer familiar with TN or cross-border hiring workflows for US-based roles.

Do not imply US citizenship, permanent residency, or existing US work authorization unless the profile explicitly says so.

### Salary Expectations

Use the compensation guidance from `config/profile.yml` and `modes/_profile.md`. Prefer range flexibility when the form allows it:

> I am targeting roles competitive with top-tier backend and platform engineering opportunities, and I care about the full package, scope, and team quality. For US roles, my target range is USD 180K-250K total compensation, with flexibility based on level, location, and equity.

### Gaps

If the candidate lacks a direct requirement, do not dodge it. Use this shape:

1. Acknowledge the adjacent experience.
2. Name the transferable mechanism.
3. Explain how the candidate would ramp.

### "Anything Else?"

Use the highest-signal answer:

- 1 concrete proof point
- 1 sentence on why this team/role
- Optional logistics note only if relevant

Never write a generic mini cover letter.
