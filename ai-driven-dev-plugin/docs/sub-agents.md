---
name: sub-agents-reference
description: Guide to Claude Code subagents - types, definition format, tool access, and spawning
category: reference
tags: [subagents, agents, spawning, tool-access]
---

# Subagents — Specialized AI Agents

Subagents are specialized AI agents that can be spawned for specific tasks.

## Built-in Agent Types

| Type | Use Case |
|------|----------|
| `Explore` | Codebase exploration, file search |
| `Plan` | Implementation planning |
| `general-purpose` | Multi-task automation |

## Agent Definition Format

```yaml
---
name: code-reviewer
description: Reviews code for bugs and quality issues
model: sonnet  # opus, sonnet, or haiku
tools:
  - Read
  - Grep
  - Glob
  - Bash
memory: session  # session, project, or global
---

# Code Reviewer Agent

You are an expert code reviewer. Analyze the provided code for:
- Logic errors
- Security vulnerabilities
- Performance issues
- Best practice violations

Provide actionable feedback with file:line references.
```

## Spawning Agents

From a skill or hook:

```javascript
await claude.agent.spawn('code-reviewer', {
  prompt: 'Review the auth module in src/security/',
  context: { files: ['auth.ts', 'session.ts'] }
});
```

## Tool Restrictions

Agents can be limited to specific tools:

```yaml
tools:
  - Read      # Only reading files
  - Grep      # And searching
  - Glob
```

## Memory Scopes

| Scope | Lifetime | Use Case |
|-------|----------|----------|
| `session` | Current session | Task-specific |
| `project` | Project lifetime | Shared context |
| `global` | Permanent | Cross-project knowledge |

## AI-Driven Development Agent Patterns

### Architecture Reviewer
```yaml
name: architecture-reviewer
description: Reviews system design
model: opus
tools: [Read, Glob, Grep, Bash]
memory: project
```

### Test Generator
```yaml
name: test-generator
description: Generates unit tests
model: sonnet
tools: [Read, Write, Glob]
memory: session
```

### Documentation Writer
```yaml
name: docs-writer
description: Writes and updates documentation
model: sonnet
tools: [Read, Write, Glob]
memory: project
```

### Bug Investigator
```yaml
name: bug-investigator
description: Root cause analysis
model: opus
tools: [Read, Grep, Glob, Bash]
memory: session
```

## Multi-Agent Orchestration

```javascript
// Sequential
const plan = await claude.agent.spawn('planner', { prompt });
const implementation = await claude.agent.spawn('implementer', { prompt: plan });

// Parallel
const [reviews] = await Promise.all([
  claude.agent.spawn('security-reviewer', { code }),
  claude.agent.spawn('performance-reviewer', { code }),
  claude.agent.spawn('style-reviewer', { code })
]);
```

## Best Practices

1. Give agents clear, specific prompts
2. Set appropriate memory scope
3. Restrict tools to minimum needed
4. Use sonnet for most tasks, opus for complex analysis
5. Handle agent errors gracefully
