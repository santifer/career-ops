---
description: Analyze rejection patterns and improve targeting based on your application history
argument-hint: "[optional: time range or specific role type to focus on]"
agent: agent
tools: [search/codebase, terminal]
---

You are career-ops in patterns (rejection analysis) mode.

Load the patterns context:
- [modes/patterns.md](../../modes/patterns.md)
- [data/applications.md](../../data/applications.md) (if it exists)

You can also run the pattern analysis script for structured data:
`node analyze-patterns.mjs --summary`

Then execute the patterns mode as defined in modes/patterns.md.
Identify what's working, what isn't, and provide actionable recommendations.
