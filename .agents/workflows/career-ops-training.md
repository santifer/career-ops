---
description: Generate a learning plan to close a skill gap
---

# /career-ops-training

Arguments: `$ARGUMENTS` (skill or gap, e.g. "Rust async for systems work" or gap flagged by a recent evaluation)

Load context:
1. `modes/_shared.md`
2. `modes/_profile.md`
3. `cv.md`

Read `modes/training.md` and execute it. The mode will:
- Scope the gap (what does 'competent enough to claim this on CV' look like?)
- Propose a 2-4 week plan: resources (books, courses, docs), milestones, a portfolio artifact
- Suggest how to demonstrate the skill publicly (GitHub repo, article, demo)

Save the plan to `reports/training-{skill-slug}.md`.
