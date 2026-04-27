---
name: hooks-reference
description: Hooks reference - event types, lifecycle, and quick implementation guide
category: reference
tags: [hooks, events, lifecycle, reference]
---

# Hooks — Event Lifecycle Reference

Hooks let plugins react to Claude Code events in real-time.

## Event Types

### Session Lifecycle
| Event | When | Use Case |
|-------|------|----------|
| `SessionStart` | Claude Code starts | Inject context, set variables |
| `Stop` | Session ends | Cleanup, persist state |

### Tool Lifecycle
| Event | When | Use Case |
|-------|------|----------|
| `PreToolUse` | Before any tool runs | Validate input, deny execution |
| `PostToolUse` | After any tool completes | Log, notify, transform output |

### Code Actions
| Event | When | Use Case |
|-------|------|----------|
| `PreCommit` | Before git commit | Run checks, format |
| `PostCommit` | After git commit | Notify, update tracking |
| `PreDiff` | Before diff display | Add context |

### User Actions
| Event | When | Use Case |
|-------|------|----------|
| `PreAnswer` | Before final response | Enhance, fact-check |
| `PostAnswer` | After response sent | Log, learn |

## Matcher Patterns

Match specific tools or patterns:

```json
{
  "event": "PostToolUse",
  "matcher": "Bash",
  "script": "./hooks/bash-logger.sh"
}
```

Match by tool name pattern:
```json
{ "matcher": "Read|Glob|Grep" }  // Any read operation
```

Match everything:
```json
{ "matcher": "*" }
```

## Hook Handler Types

### Command Handler
```json
{
  "type": "command",
  "command": "./hooks/my-hook.sh"
}
```

### HTTP Handler
```json
{
  "type": "http",
  "url": "http://localhost:9000/webhook",
  "method": "POST"
}
```

### MCP Tool Handler
```json
{
  "type": "mcp_tool",
  "server": "my-mcp-server",
  "tool": "my-tool"
}
```

### Prompt Handler
```json
{
  "type": "prompt",
  "prompt": "Additional context: {context}"
}
```

## Environment Variables

Hooks receive context via environment variables:

| Variable | Description |
|----------|-------------|
| `CLAUDE_EVENT` | Event type |
| `CLAUDE_TOOL_NAME` | Tool that was invoked |
| `CLAUDE_TOOL_INPUT` | Tool input JSON |
| `CLAUDE_TOOL_OUTPUT` | Tool output JSON |
| `CLAUDE_SESSION_ID` | Current session ID |
| `CLAUDE_WORKING_DIR` | Current working directory |

## AI-Driven Development Hooks

### Auto-Test Generation
```json
{
  "event": "PostToolUse",
  "matcher": "Write|Edit",
  "type": "command",
  "command": "./hooks/auto-test.sh"
}
```

### Context Injection
```json
{
  "event": "SessionStart",
  "type": "prompt",
  "prompt": "Project: {project_name}\nTech: {tech_stack}\nLast commit: {last_commit}"
}
```

### Pre-Commit Quality Gate
```json
{
  "event": "PreCommit",
  "matcher": "*",
  "type": "command",
  "command": "./hooks/pre-commit-check.sh"
}
```

### Documentation Sync
```json
{
  "event": "PostToolUse",
  "matcher": "Write|Edit",
  "type": "command",
  "command": "./hooks/update-docs.sh"
}
```

## Best Practices

1. Keep hooks fast (async-friendly)
2. Handle errors gracefully
3. Use idempotent operations
4. Log for debugging
5. Respect capacity limits
