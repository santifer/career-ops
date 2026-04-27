---
name: agent-sdk-reference
description: Agent SDK quick reference - creating autonomous agents, tool use, and session management
category: reference
tags: [agent-sdk, reference, tools, sessions]
---

# Agent SDK — Build Custom Agents

Build autonomous agents using the Agent SDK.

## Overview

The Agent SDK lets you create agents that can:
- Query Claude for decisions
- Use tools (Read, Write, Bash, etc.)
- Run in loops until task completion
- Integrate with external systems

## TypeScript SDK

```typescript
import { ClaudeAgent } from '@anthropic-ai/claude-agent-sdk';

const agent = new ClaudeAgent({
  name: 'code-reviewer',
  model: 'opus',
  system: 'You are an expert code reviewer...'
});

const result = await agent.query({
  prompt: 'Review src/auth.ts for security issues'
});
```

## Python SDK

```python
from claude_agent_sdk import ClaudeAgent

agent = ClaudeAgent(
    name="code-reviewer",
    model="opus",
    system="You are an expert code reviewer..."
)

result = agent.query(prompt="Review src/auth.ts for security issues")
```

## ClaudeAgentOptions

| Option | Type | Description |
|--------|------|-------------|
| `name` | string | Agent identifier |
| `model` | string | Model to use (opus/sonnet/haiku) |
| `system` | string | System prompt |
| `tools` | string[] | Allowed tools |
| `maxTokens` | number | Max response tokens |
| `temperature` | number | Response variability |

## Tool Use in Agents

Agents can use all Claude Code tools:

```typescript
const agent = new ClaudeAgent({
  name: 'file-generator',
  system: 'Create files based on user request'
});

await agent.tool('Write', {
  file_path: 'src/utils.ts',
  content: 'export function foo() { return 42; }'
});
```

## Streaming Responses

```typescript
for await (const chunk of agent.stream({
  prompt: 'Explain quantum computing'
})) {
  process.stdout.write(chunk);
}
```

## AI-Driven Development Use Cases

### Automated Code Review Pipeline
```typescript
const reviewAgent = new ClaudeAgent({
  name: 'pipeline-reviewer',
  model: 'sonnet',
  system: 'Review PRs for quality and security'
});

const findings = await reviewAgent.query({
  prompt: `Review changes in ${diff}`,
  context: { rules: projectRules }
});
```

### Documentation Generator
```typescript
const docsAgent = new ClaudeAgent({
  name: 'docs-generator',
  model: 'sonnet',
  tools: ['Read', 'Write', 'Glob']
});
```

### Test Automation
```typescript
const testAgent = new ClaudeAgent({
  name: 'test-generator',
  model: 'sonnet',
  tools: ['Read', 'Write']
});
```

## Best Practices

1. Use opus for complex reasoning
2. Set appropriate tool restrictions
3. Handle streaming for long responses
4. Implement proper error handling
5. Use session management for state
