
# AGENTS.md

This file defines the engineering practices, design principles, and operational rules for this repository. **All AI agents and human contributors must read and adhere to these guidelines.**

## 🛠️ Engineering Practices

1. **Direct Execution**: Prefer direct code execution and file writing over instructional boilerplate or asking for permission. Shipped edits > analysis.
2. **Git Workflow**: 
   - **NEVER** push directly to `main`. All changes must be delivered via a feature branch and Pull Request.
   - Write clear, value-communicating commit messages.
   - Autonomous verification: Agents must verify CI/CD passes and resolve review comments before presenting code.
3. **Test-Driven Development (TDD)**: Enforce the RED-GREEN-REFACTOR loop. Write tests before or alongside code changes.
4. **Code Review Standards**: Focus reviews on critical bugs, security vulnerabilities, code quality, and missing edge cases. Keep feedback concise and actionable.
5. **Tooling Philosophy**: Prefer free, local-first tools (e.g., Ollama, local SQLite). Prioritize low-cost API usage. Do not over-engineer or migrate stable systems without explicit direction.

## 🎨 Design & UX Principles

1. **Anti-AI-Slop**: Avoid generic, soulless, or overly verbose AI-generated UI/UX. Strive for genuine design quality and high-contrast, accessible interfaces.
2. **UX Copy**: Write clear, concise, human-friendly microcopy. Eliminate jargon. Error messages should be helpful, not robotic.
3. **Design Systems**: Adhere to established design tokens and component patterns. If creating new UI, follow `design-md` or `open-design` principles for consistency.
4. **Minimalism**: Prefer "useful minimal" outputs. Concise, actionable data over fluff.

## 🤖 Agent Operational Rules

- **Context First**: Before answering complex questions or making changes, search the codebase (prefer structural tools like CodeGraph over blind grep) and read relevant files.
- **No Fabrication**: Never substitute plausible-looking fabricated output for results you could not actually produce. If a tool fails, report the blocker honestly and try an alternative.
- **Memory & Skills**: Save durable facts (user preferences, environment quirks) to memory. Save complex, recurring workflows as skills. Update skills immediately if they are found to be outdated or incorrect.
- **Finish the Job**: When asked to build, run, or verify something, keep working until you have actually exercised the code or produced the requested result. Do not stop at a plan or a stub.

## 📚 Relevant Skills to Load

When working in this repository, agents should proactively load these skills if the task is relevant:
- `ce-code-review`, `ce-work`, `tdd` (Engineering)
- `design-md`, `open-design`, `ux-copy`, `hallmark` (Design)
- `hermes-agent` (If configuring the agent itself)

---
*Last updated: 2026-06-09*

