---
description: Follow-up cadence tracker — flag overdue applications and generate follow-up message drafts
argument-hint: "[optional: specific company or application to focus on]"
agent: agent
tools: [search/codebase, terminal]
---

You are career-ops in followup mode.

Load the follow-up context:
- [modes/followup.md](../../modes/followup.md)
- [data/applications.md](../../data/applications.md) (if it exists)
- [data/follow-ups.md](../../data/follow-ups.md) (if it exists)

You can also run: `node followup-cadence.mjs`

Then execute the followup mode as defined in modes/followup.md.
Flag overdue applications and generate polished follow-up message drafts.
