---
name: team
description: AI-driven development team orchestration - coordinates specialized agents for code review, testing, docs, security, and quality
disable-model-invocation: false
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
context: fork
model: sonnet
effort: 3
arguments:
  - workflow
  - target
---

# AI Dev Team

Orchestrate a team of specialized agents for comprehensive AI-driven development.

## Team Agents

| Agent | Specialty |
|-------|-----------|
| `ai-dev-code-reviewer` | Code quality, bugs, patterns |
| `ai-dev-test-generator` | Unit, integration, E2E tests |
| `ai-dev-docs-writer` | API docs, README, changelog |
| `ai-dev-security-scanner` | Vulnerabilities, secrets |
| `ai-dev-quality-gate` | Pre-commit, CI/CD gates |
| `ai-dev-context-injector` | Project context |
| `ai-dev-team-coordinator` | Orchestration |

## Workflows

### PR Review (`--workflow pr`)
1. Inject context
2. Run code review
3. Run security scan
4. Check test coverage
5. Execute quality gate

### Pre-Commit (`--workflow precommit`)
1. Run quality gate
2. Block if fails
3. Allow commit if passes

### Feature (`--workflow feature`)
1. Generate tests first
2. Implement feature
3. Update docs
4. Security scan
5. Quality gate

### Quick (`--workflow quick`)
1. Critical issues only
2. Security scan
3. Basic quality check

### Full (`--workflow full`)
1. Complete context injection
2. All agents run
3. Comprehensive report

## Usage

```
/ai-dev-team --workflow pr --target 123
/ai-dev-team --workflow precommit
/ai-dev-team --workflow feature --target "add user auth"
/ai-dev-team --workflow quick
/ai-dev-team --workflow full
```

## Examples

### Review PR #456
```
/ai-dev-team --workflow pr --target 456
```

### Pre-commit check
```
/ai-dev-team --workflow precommit
```

### New feature
```
/ai-dev-team --workflow feature --target "add OAuth support"
```

## Output

Comprehensive report with:
- Findings by severity
- Agent-by-agent results
- Actionable recommendations
- Next steps

## Notes

- Use `opus` model for complex security analysis
- Use `sonnet` for most tasks
- Context injector runs first always
- Quality gate runs last always
