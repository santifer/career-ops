---
name: skills-reference
description: Complete reference for Claude Code skills - format, arguments, tool access, and routing
category: reference
tags: [skills, slash-commands, arguments, routing]
---

# Skills — Slash Commands Reference

Skills are slash commands that extend Claude Code capabilities.

## Skill File Format

```markdown
---
name: my-skill
description: What the skill does
disable-model-invocation: false
allowed-tools:
  - Read
  - Write
  - Bash
context: fork
model: sonnet
effort: 2
arguments:
  - name: target
    description: Target file or directory
    required: true
    type: string
---

# My Skill

Your skill implementation here...

## Steps

1. First step
2. Second step
```

## Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Skill identifier |
| `description` | string | One-line description |
| `disable-model-invocation` | boolean | Skip AI for this skill |
| `allowed-tools` | string[] | Tools the skill can use |
| `context` | string | Context mode (fork/inherit) |
| `model` | string | Model preference |
| `effort` | number | Estimated effort (1-5) |

## Context Modes

| Mode | Description |
|------|-------------|
| `fork` | Start fresh context |
| `inherit` | Continue current conversation |

## AI-Driven Development Skills

### Code Review Skill
```yaml
name: review
description: Reviews code for bugs and quality
allowed-tools:
  - Read
  - Grep
  - Glob
effort: 2
arguments:
  - name: path
    description: Path to review
    required: true
```

### Test Generator Skill
```yaml
name: test
description: Generates unit tests
allowed-tools:
  - Read
  - Write
  - Glob
effort: 3
arguments:
  - name: file
    description: File to test
    required: true
```

### Document Generator Skill
```yaml
name: docs
description: Generates documentation
allowed-tools:
  - Read
  - Write
  - Glob
effort: 2
```

## Skill Patterns

### Analysis Skills
- Code analysis
- Pattern detection
- Dependency mapping

### Generation Skills
- Test generation
- Documentation generation
- Boilerplate generation

### Automation Skills
- CI/CD integration
- Deployment automation
- Monitoring setup

### Research Skills
- Architecture research
- Library comparison
- Best practices lookup

## Best Practices

1. Write clear descriptions
2. Specify all allowed tools
3. Set realistic effort estimates
4. Use fork context for isolation
5. Handle arguments validation
