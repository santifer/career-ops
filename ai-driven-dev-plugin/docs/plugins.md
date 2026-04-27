---
name: plugins-reference
description: Complete guide to Claude Code plugin architecture, manifest format, and plugin types
category: reference
tags: [plugins, architecture, manifest, guide]
---

# Claude Code Plugins — Full Guide

## What is a Plugin?

A plugin is a self-contained package that extends Claude Code with new capabilities:
- Custom skills (slash commands)
- Subagents with specialized roles
- Event hooks for lifecycle automation
- MCP server integrations
- Custom UI panels and monitors

## Plugin Structure

```
plugin-name/
├── plugin.json          # Plugin manifest (required)
├── skills/              # Skill definitions (*.md)
│   └── my-skill.md
├── agents/              # Agent definitions (*.md)
│   └── my-agent.md
├── hooks/               # Hook handler scripts
│   └── my-hook.sh
├── .mcp.json           # MCP server configurations
├── .lsp.json           # Language server configs
├── monitors/            # Custom UI panels
│   └── my-monitor.md
├── bin/                 # Executable scripts
├── settings.json        # Plugin-specific settings
└── docs/               # Documentation
```

## plugin.json Manifest

```json
{
  "identifier": "my-plugin",
  "name": "My Plugin",
  "description": "What it does",
  "version": "1.0.0",
  "authors": [{ "name": "Dev", "email": "dev@example.com" }],
  "homepage": "https://example.com",
  "repository": "https://github.com/user/plugin",
  "readme": "README.md",
  "tags": ["productivity", "ai"],
  "license": "MIT",
  "icon": "icon.svg",
  "capacity": {
    "skills": { "count": 5 },
    "agents": { "count": 3 }
  }
}
```

## Installing Plugins

- User plugins: `~/.claude/plugins/PLUGIN_NAME/`
- Project plugins: `.claude/plugins/PLUGIN_NAME/`
- Built-in plugins: bundled with Claude Code

## Skill Routing

Plugins can define skills that appear as `/plugin-name:skill-name`:

```markdown
---
name: my-skill
description: Does something useful
---

# My Skill

Your skill content here...
```

## Hooks

Plugins can register event hooks:

```json
{
  "hooks": [{
    "event": "PostToolUse",
    "matcher": "bash",
    "script": "./hooks/my-hook.sh"
  }]
}
```

## MCP Servers

```json
{
  "mcpServers": [{
    "name": "my-server",
    "command": "npx",
    "args": ["@org/server"],
    "env": { "API_KEY": "..." }
  }]
}
```

## AI-Driven Development Use Cases

1. **Context Hooks**: Inject project context on session start
2. **Quality Gates**: Auto-check code before commits
3. **Documentation Sync**: Update docs when code changes
4. **Test Generation**: Trigger test creation on new functions
5. **Code Review**: Run linters/formatters post-commit
6. **Knowledge Retrieval**: RAG-style context injection from codebase

## Best Practices

- Keep plugins focused (single responsibility)
- Document all skills and hooks
- Use semantic versioning
- Test across Claude Code versions
- Follow capacity limits in manifest
