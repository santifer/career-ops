# Profile Feedback Queue

This example shows the structured learning records described in `docs/candidate-learning-loop.md`.

## 2026-06-15 - example-company-senior-ai-engineer

- type: scoring_correction
- status: pending
- source: reports/123-example-company-2026-06-15.md
- feedback: "The score is too high because the role is mostly frontend platform work."
- proposed_update: config/profile.yml
- note: "Lower weight for frontend-heavy platform roles unless there is applied AI ownership."

## 2026-06-15 - example-startup-ml-engineer

- type: hard_constraint
- status: proposed
- source: reports/124-example-startup-2026-06-15.md
- feedback: "I do not want companies under 20 people."
- proposed_update: config/profile.yml
- note: "Add company-size minimum to target filters after user approval."

