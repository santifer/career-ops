# Candidate Learning Loop

Issue: #1027

The learning loop turns explicit user feedback about evaluations into auditable user-layer records. It does not silently mutate the profile.

## Feedback Record

Feedback records live in `data/profile-feedback.md` and use a small Markdown block format:

```markdown
## 2026-06-15 - company-role-slug

- type: preference
- status: pending
- source: reports/123-example-2026-06-15.md
- feedback: "This score is too high; I would never apply here."
- proposed_update: config/profile.yml
- note: "Consider adding an exclusion for companies under 20 people."
```

## Types

Use one of these values:

- `preference`: taste, energy, role shape, company size, work style, or domain preference
- `hard_constraint`: non-negotiable location, compensation, visa, schedule, or company constraint
- `missing_evidence`: candidate has evidence the evaluation failed to use
- `scoring_correction`: score, weight, or fit assessment was too high or too low
- `narrative_correction`: positioning, cover letter angle, CV emphasis, or interview story should change

## Statuses

- `pending`: captured but not yet reviewed
- `proposed`: a concrete patch has been suggested
- `accepted`: user accepted the profile/story/tracker update
- `rejected`: user rejected the learning
- `archived`: retained for history but not active

## Allowed Update Targets

Proposed updates may target user-layer files only:

- `config/profile.yml`
- `modes/_profile.md`
- `article-digest.md`
- `interview-prep/story-bank.md`
- `data/applications.md`
- `data/follow-ups.md`

System-layer prompts and scripts must not be edited to encode a single user's preferences.

## Agent Flow

1. Capture the user's feedback as a structured record.
2. Classify it by type.
3. Leave it `pending` unless the user approves a patch.
4. Before future evaluations, summarize unresolved `pending` and `proposed` records.
5. Apply accepted updates only to user-layer files.

