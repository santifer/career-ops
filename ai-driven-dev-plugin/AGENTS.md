---
name: ai-dev-team-directory
description: Documentation for the AI-driven development agent team
---

# AI Dev Agents — Team Directory

Specialized agents for AI-driven development workflows.

## Available Agents

### Code Review
**`ai-dev-code-reviewer`**
- Reviews code for bugs, quality, security
- Provides actionable feedback with file:line references
- Supports TypeScript, Python, Go, Rust

### Test Generation
**`ai-dev-test-generator`**
- Generates unit, integration, E2E tests
- Follows Arrange-Act-Assert pattern
- Supports Jest, pytest, Go test, cargo test

### Documentation
**`ai-dev-docs-writer`**
- Generates API docs, README, changelog
- AUTO-GENERATED sections with markers
- Keeps docs in sync with code

### Security Scanning
**`ai-dev-security-scanner`**
- Detects secrets, vulnerabilities
- OWASP Top 10 coverage
- Compliance checks (PCI, HIPAA, GDPR)

### Quality Gate
**`ai-dev-quality-gate`**
- Pre-commit and CI/CD enforcement
- Lint, type check, tests, coverage
- Blocking with detailed reports

### Context Injection
**`ai-dev-context-injector`**
- Loads project context at session start
- Adapts to task type
- Provides relevant rules and patterns

### Team Coordination
**`ai-dev-team-coordinator`**
- Orchestrates multiple agents
- Parallel and sequential workflows
- Result aggregation

## Usage

### Via Skill Command
```
/ai-dev-team --workflow pr --target 123
/ai-dev-team --workflow precommit
/ai-dev-team --workflow feature --target "add auth"
```

### Via Agent Tool (individual agents)
```
Use the ai-dev-code-reviewer agent to review PR #123
Use the ai-dev-test-generator agent to create tests for auth.ts
Use the ai-dev-security-scanner agent to scan for secrets
```

### Via Agent Tool (team)
```
Use the ai-dev-team-coordinator agent to run full PR review
```

## Invocation Examples

```typescript
// Single agent
await agent.spawn('ai-dev-code-reviewer', {
  prompt: 'Review the authentication module for security issues'
});

// Team workflow
await agent.spawn('ai-dev-team-coordinator', {
  prompt: 'Run full PR review for #456'
});

// Parallel agents
const [review, tests, docs] = await Promise.all([
  agent.spawn('ai-dev-code-reviewer', { code }),
  agent.spawn('ai-dev-test-generator', { code }),
  agent.spawn('ai-dev-docs-writer', { code })
]);
```

## Model Selection

| Agent | Model | Reason |
|-------|-------|--------|
| ai-dev-code-reviewer | sonnet | Speed + quality balance |
| ai-dev-test-generator | sonnet | Fast generation |
| ai-dev-docs-writer | sonnet | Fast generation |
| ai-dev-security-scanner | opus | Complex security analysis |
| ai-dev-quality-gate | sonnet | Fast execution |
| ai-dev-context-injector | sonnet | Quick context load |
| ai-dev-team-coordinator | opus | Complex orchestration |

## Memory Scope

| Agent | Scope | Persistence |
|-------|-------|-------------|
| ai-dev-code-reviewer | session | Single task |
| ai-dev-test-generator | session | Single task |
| ai-dev-docs-writer | project | Survives sessions |
| ai-dev-security-scanner | session | Single task |
| ai-dev-quality-gate | session | Single task |
| ai-dev-context-injector | project | Survives sessions |
| ai-dev-team-coordinator | session | Single workflow |

## Tool Access

Each agent has minimal tool access for security:

```typescript
// Code reviewer - read-only plus grep
tools: ['Read', 'Glob', 'Grep']

// Test generator - read/write
tools: ['Read', 'Write', 'Glob', 'Bash']

// Security scanner - read + execute scanners
tools: ['Read', 'Glob', 'Grep', 'Bash']

// Quality gate - execute commands
tools: ['Read', 'Bash', 'Glob']

// Context injector - read project files
tools: ['Read', 'Glob', 'Grep', 'Bash']
```
