---
name: ai-driven-dev-readme
description: Main README for the AI-Driven Dev Plugin - installation, features, and quick start
category: documentation
tags: [readme, installation, quick-start, overview]
---

# AI-Driven Dev Plugin

Professional Claude Code plugin for AI-driven development workflows.

## Features

- **Auto-Review** — Automatic code review on every change
- **Test Generation** — Generate tests from code changes
- **Documentation Sync** — Keep docs in sync with code
- **Quality Gates** — Pre-commit quality enforcement
- **Context Injection** — Automatic project context

## Usage

```bash
/ai-driven-dev:team --workflow pr --target 123
/ai-driven-dev:team --workflow precommit
/ai-driven-dev:team --workflow feature --target "add user auth"
```

## Structure

```
ai-driven-dev/
├── plugin.json       # Plugin manifest
├── skills/           # Slash commands
│   └── team/        # /ai-driven-dev:team
├── agents/           # Subagent definitions
├── docs/             # Knowledge base
└── README.md
```

## Documentation

See [docs/README.md](docs/README.md) for the full knowledge base.
