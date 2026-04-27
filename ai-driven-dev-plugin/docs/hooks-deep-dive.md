---
name: hooks-deep-dive
description: Comprehensive guide to Claude Code hooks system - event lifecycle, implementation patterns, and automation
category: reference
tags: [hooks, events, lifecycle, automation, deep-dive]
---

# Hooks — Event Lifecycle (Deep Dive)

## Conceito

Hooks permitem que plugins reajam a eventos do Claude Code em tempo real. São o backbone da automação em AI-driven development.

## Event Types

### Session Lifecycle

| Event | Trigger | Input | Use Case |
|-------|---------|-------|----------|
| `SessionStart` | Claude Code inicia | `{ session_id, working_directory }` | Injetar contexto, set variables |
| `Stop` | Sessão termina | `{ session_id, exit_code }` | Cleanup, persist state |
| `SessionEnd` | Após Stop | `{ session_id, summary }` | Logging final, analytics |

### Tool Lifecycle

| Event | Trigger | Input | Use Case |
|-------|---------|-------|----------|
| `PreToolUse` | Antes de qualquer tool | `{ tool_name, tool_input, tool_use_id }` | Validar, deny, transform |
| `PostToolUse` | Após tool completar | `{ tool_name, tool_input, tool_output, tool_use_id }` | Log, notify, chain actions |

### Code Actions

| Event | Trigger | Input | Use Case |
|-------|---------|-------|----------|
| `PreCommit` | Antes de git commit | `{ files, message }` | Run checks, format |
| `PostCommit` | Após git commit | `{ commit_hash, files }` | Notify, update tracking |
| `PreDiff` | Antes de mostrar diff | `{ files }` | Add context |
| `PostDiff` | Após diff | `{ files, diff }` | Transform diff output |

### User Actions

| Event | Trigger | Input | Use Case |
|-------|---------|-------|----------|
| `PreAnswer` | Antes da resposta final | `{ prompt, context }` | Enhance, fact-check |
| `PostAnswer` | Após resposta | `{ prompt, answer }` | Log, learn |

### Agent Actions

| Event | Trigger | Input | Use Case |
|-------|---------|-------|----------|
| `PreAgent` | Antes de spawn agent | `{ agent_name, prompt }` | Validate, inject context |
| `PostAgent` | Após agent completar | `{ agent_name, result }` | Process results |

## Matcher Patterns

Matchers determinam quais events um hook responde:

```json
// Matcher exato
{ "matcher": "Bash" }

// Multiple tools
{ "matcher": "Read|Glob|Grep" }

// Regex pattern
{ "matcher": "^(Read|Write|Edit)$" }

// Wildcard - todos
{ "matcher": "*" }

// Negation - todos exceto
{ "matcher": "!*Bash" }
```

### Matcher Examples

| Pattern | Matches | Doesn't Match |
|---------|---------|---------------|
| `"Bash"` | `Bash` | `bash`, `Bash-command` |
| `"Read\|Glob"` | `Read`, `Glob` | `Grep` |
| `"*Test*"` | `Bash` com command contendo "test" | Outras Bash |
| `"!Bash"` | Todos exceto Bash | Apenas Bash |

## Handler Types

### 1. Command Handler

```json
{
  "type": "command",
  "command": "./hooks/my-hook.sh"
}
```

**Environment Variables Passadas:**
```bash
CLAUDE_EVENT=PostToolUse
CLAUDE_TOOL_NAME=Read
CLAUDE_TOOL_INPUT={"file_path":"src/app.py"}
CLAUDE_TOOL_OUTPUT={"content":"..."}
CLAUDE_TOOL_USE_ID="tool_abc123"
CLAUDE_SESSION_ID="sess_xyz"
CLAUDE_WORKING_DIR="/path/to/project"
```

**Exit Codes:**
- `0`: Success, continue
- `1`: failure, mas continua
- `2`+: failure, para execution

### 2. HTTP Handler

```json
{
  "type": "http",
  "url": "http://localhost:9000/webhook",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer ${WEBHOOK_TOKEN}",
    "Content-Type": "application/json"
  },
  "timeout": 5000
}
```

**Request Body:**
```json
{
  "event": "PostToolUse",
  "tool": "Read",
  "input": { "file_path": "src/app.py" },
  "session": "sess_xyz",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 3. MCP Tool Handler

```json
{
  "type": "mcp_tool",
  "server": "my-mcp-server",
  "tool": "notify-slack",
  "parameters": {
    "channel": "#engineering",
    "username": "Claude Bot"
  }
}
```

### 4. Prompt Handler

```json
{
  "type": "prompt",
  "prompt": "Project: {project_name}\nTech Stack: {tech_stack}\nLast Change: {last_commit}\n\n{original_context}"
}
```

**Available Variables:**
| Variable | Description |
|----------|-------------|
| `{project_name}` | Nome do projeto |
| `{tech_stack}` | Stack detectado |
| `{last_commit}` | Último commit |
| `{working_directory}` | Diretório atual |
| `{session_id}` | ID da sessão |
| `{original_context}` | Contexto original |

## Hook Handler Examples

### Example 1: Auto-Test Generation

```bash
#!/bin/bash
# hooks/auto-test.sh

if [ "$CLAUDE_TOOL_NAME" == "Write" ] || [ "$CLAUDE_TOOL_NAME" == "Edit" ]; then
  FILE_PATH=$(echo $CLAUDE_TOOL_INPUT | jq -r '.file_path')

  # Só para arquivos de código
  if [[ "$FILE_PATH" == *.py ]]; then
    # Gerar testes
    python -m pytest --generate-tests "$FILE_PATH"
  fi
fi
```

### Example 2: Quality Gate

```bash
#!/bin/bash
# hooks/pre-commit-check.sh

# Verificar se há erros de lint
LINT_OUTPUT=$(npm run lint 2>&1)
if [ $? -ne 0 ]; then
  echo "❌ Lint failed:"
  echo "$LINT_OUTPUT"
  exit 1
fi

# Verificar tipos
TYPE_OUTPUT=$(npm run typecheck 2>&1)
if [ $? -ne 0 ]; then
  echo "❌ Type check failed:"
  echo "$TYPE_OUTPUT"
  exit 1
fi

# Rodar testes rápidos
TEST_OUTPUT=$(npm test -- --passWithNoTests 2>&1)
if [ $? -ne 0 ]; then
  echo "❌ Tests failed:"
  echo "$TEST_OUTPUT"
  exit 1
fi

echo "✅ All checks passed"
exit 0
```

### Example 3: Context Injection

```json
{
  "event": "SessionStart",
  "type": "prompt",
  "prompt": "You are working on {project_name}.\n\nProject context:\n{context}\n\nTech stack: {tech_stack}\n\nRecent changes:\n{recent_changes}\n\nRemember: {project_specific_rules}"
}
```

### Example 4: Slack Notification

```bash
#!/bin/bash
# hooks/notify.sh

WEBHOOK_URL="https://hooks.slack.com/services/XXX"
TOOL_NAME=$CLAUDE_TOOL_NAME
FILE_PATH=$(echo $CLAUDE_TOOL_INPUT | jq -r '.file_path // empty')

PAYLOAD="{\"text\": \"📝 *$TOOL_NAME*: \`$FILE_PATH\` by $(git config user.name)\"}"

curl -s -X POST \
  -H 'Content-type: application/json' \
  -d "$PAYLOAD" \
  $WEBHOOK_URL > /dev/null
```

### Example 5: Documentation Sync

```bash
#!/bin/bash
# hooks/update-docs.sh

if [ "$CLAUDE_TOOL_NAME" == "Write" ] || [ "$CLAUDE_TOOL_NAME" == "Edit" ]; then
  FILE=$(echo $CLAUDE_TOOL_INPUT | jq -r '.file_path')

  # Detectar se é API
  if grep -q "export.*function\|export.*class" "$FILE"; then
    # Atualizar API docs
    ./scripts/update-api-docs.sh "$FILE"
  fi

  # Detectar se mudou README
  if [ "$FILE" == "README.md" ]; then
    ./scripts/validate-readme.sh
  fi
fi
```

## AI-Driven Development Hook Patterns

### Pattern 1: Continuous Integration

```json
{
  "event": "PreCommit",
  "matcher": "*",
  "type": "command",
  "command": "./hooks/ci-check.sh",
  "timeout": 300000
}
```

**ci-check.sh:**
```bash
#!/bin/bash
set -e

echo "🔍 Running CI checks..."

# 1. Lint
echo "Lint..."
npm run lint --if-present || { echo "Lint failed"; exit 1; }

# 2. Type check
echo "Type check..."
npm run typecheck --if-present || { echo "Type check failed"; exit 1; }

# 3. Unit tests
echo "Unit tests..."
npm test || { echo "Tests failed"; exit 1; }

# 4. Build
echo "Build..."
npm run build --if-present || { echo "Build failed"; exit 1; }

echo "✅ CI passed"
```

### Pattern 2: Test Coverage Guard

```json
{
  "event": "PostToolUse",
  "matcher": "Write|Edit",
  "type": "command",
  "command": "./hooks/coverage-check.sh"
}
```

**coverage-check.sh:**
```bash
#!/bin/bash

FILE=$(echo $CLAUDE_TOOL_INPUT | jq -r '.file_path')

# Verificar se arquivo é testável
if [[ ! "$FILE" =~ \.(py|js|ts|go|rs)$ ]]; then
  exit 0
fi

# Rodar coverage
COVERAGE=$(python -m pytest --cov="$FILE" --cov-report=term 2>/dev/null | grep TOTAL | awk '{print $4}' | tr -d '%')

if [ -n "$COVERAGE" ] && [ "$COVERAGE" -lt 80 ]; then
  echo "⚠️  Coverage for $FILE is ${COVERAGE}% (threshold: 80%)"
  exit 1
fi

exit 0
```

### Pattern 3: Dependency Analysis

```json
{
  "event": "PostToolUse",
  "matcher": "Write|Edit",
  "type": "command",
  "command": "./hooks/dep-check.sh"
}
```

**dep-check.sh:**
```bash
#!/bin/bash

FILE=$(echo $CLAUDE_TOOL_INPUT | jq -r '.file_path')

# Extrair imports
if [ -f "$FILE" ]; then
  case "$FILE" in
    *.py)
      IMPORTS=$(grep "^import\|^from" "$FILE" | cut -d' ' -f2 | sort -u)
      ;;
    *.js|*.ts)
      IMPORTS=$(grep "^import\|require(" "$FILE" | grep -oP "['\"]\K[^'\"]+" | sort -u)
      ;;
  esac

  # Verificar se há imports não documentados
  for imp in $IMPORTS; do
    if ! grep -q "$imp" "dependencies.json" 2>/dev/null; then
      echo "⚠️  Untracked dependency: $imp"
    fi
  done
fi
```

### Pattern 4: Changelog Update

```json
{
  "event": "PostCommit",
  "matcher": "*",
  "type": "command",
  "command": "./hooks/update-changelog.sh"
}
```

### Pattern 5: Security Scan

```json
{
  "event": "PreToolUse",
  "matcher": "Bash",
  "type": "command",
  "command": "./hooks/security-check.sh"
}
```

**security-check.sh:**
```bash
#!/bin/bash

CMD=$(echo $CLAUDE_TOOL_INPUT | jq -r '.command // empty')

# Verificar commands perigosos
DANGEROUS_PATTERNS=(
  "rm -rf /"
  "curl.*\|.*sh"
  "wget.*\|.*sh"
  "chmod 777"
  "chmod +x"
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$CMD" | grep -qE "$pattern"; then
    echo "⚠️  Suspicious command pattern detected: $pattern"
    echo "Command: $CMD"
    exit 1
  fi
done

exit 0
```

## Environment Variables Reference

| Variable | Type | Description |
|----------|------|-------------|
| `CLAUDE_EVENT` | string | Event type (e.g., `PostToolUse`) |
| `CLAUDE_TOOL_NAME` | string | Tool that was invoked |
| `CLAUDE_TOOL_INPUT` | JSON string | Tool input as JSON string |
| `CLAUDE_TOOL_OUTPUT` | JSON string | Tool output as JSON string |
| `CLAUDE_TOOL_USE_ID` | string | Unique ID for this tool use |
| `CLAUDE_SESSION_ID` | string | Current session identifier |
| `CLAUDE_WORKING_DIR` | string | Current working directory |
| `CLAUDE_USER_ID` | string | User identifier |
| `CLAUDE_CLI_VERSION` | string | Claude Code version |

## Hook Chaining

Múltiplos hooks podem formar uma chain:

```json
{
  "hooks": [
    {
      "event": "PostToolUse",
      "matcher": "Edit",
      "chain": [
        { "type": "command", "command": "./hooks/log.sh" },
        { "type": "command", "command": "./hooks/notify.sh" },
        { "type": "prompt", "prompt": "Remember this change: {summary}" }
      ]
    }
  ]
}
```

## Error Handling

### Retry Logic

```bash
#!/bin/bash
# hooks/retry.sh

MAX_RETRIES=3
RETRY_DELAY=1

for i in $(seq 1 $MAX_RETRIES); do
  if "$@"; then
    exit 0
  fi
  echo "Retry $i/$MAX_RETRIES in ${RETRY_DELAY}s..."
  sleep $RETRY_DELAY
  RETRY_DELAY=$((RETRY_DELAY * 2))
done

echo "Failed after $MAX_RETRIES retries"
exit 1
```

### Timeout Handling

```bash
#!/bin/bash
# hooks/timeout.sh

TIMEOUT=30  # seconds

timeout $TIMEOUT "$@" || {
  EXIT_CODE=$?
  if [ $EXIT_CODE -eq 124 ]; then
    echo "Command timed out after ${TIMEOUT}s"
    exit 1
  fi
  exit $EXIT_CODE
}
```

## Best Practices

1. **Idempotência**: Hooks devem poder rodar múltiplas vezes sem efeito colateral
2. **Fast Fail**:Falhar rápido em caso de erro
3. **Logging**: Log suficiente para debug
4. **Timeout**: Sempre defina timeout para operations longas
5. **Error Handling**: Nunca deixar hook falhar silenciosamente
6. **Security**: Nunca hardcode secrets, use env vars
7. **Performance**: Hooks síncronos bloqueiam — prefira async quando possível

## Debugging Hooks

```bash
# Verbose mode
CLAUDE_HOOKS_DEBUG=1 claude ...

# Single hook test
CLAUDE_EVENT=PostToolUse CLAUDE_TOOL_NAME=Read \
CLAUDE_TOOL_INPUT='{"file_path":"test.py"}' \
./hooks/my-hook.sh
```

## Configuration

### Global Hooks (plugin.json)

```json
{
  "hooks": [
    {
      "event": "SessionStart",
      "type": "command",
      "command": "./hooks/global-context.sh"
    }
  ]
}
```

### Project Hooks (.claude/hooks.json)

```json
{
  "hooks": [
    {
      "event": "PreCommit",
      "matcher": "*",
      "type": "command",
      "command": "./hooks/local-check.sh"
    }
  ]
}
```

## Anti-Patterns

❌ **NÃO FAÇA:**
```bash
# Hardcoded credentials
curl -H "Authorization: Bearer abc123" ...

# Blocking slow operations
./very-slow-hook.sh  # 10+ seconds

# Ignoring errors
./hook.sh || true

# Mutations globais
git stash  # Nunca faça isso em hooks
```

✅ **FAÇA:**
```bash
# Use env vars
curl -H "Authorization: Bearer $API_TOKEN" ...

# Async ou timeout
timeout 5 ./hook.sh &

# Handle errors properly
./hook.sh || { echo "Hook failed"; exit 1; }

# Use temp files
TMP=$(mktemp)
```
