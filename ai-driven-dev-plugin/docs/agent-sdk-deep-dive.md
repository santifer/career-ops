---
name: agent-sdk-deep-dive
description: Comprehensive Agent SDK guide - TypeScript/Python SDK, hooks, subagents, sessions, and MCP integration
category: reference
tags: [agent-sdk, TypeScript, Python, hooks, subagents, MCP]
---

# Agent SDK — Deep Dive

## O que é o Agent SDK?

O Agent SDK permite construir agentes AI autônomos usando Claude Code como biblioteca. O agente tem as mesmas ferramentas que Claude Code: ler arquivos, rodar comandos, editar código, buscar na web, etc.

**Diferença do Client SDK:**
- Client SDK: você implementa o tool loop manualmente
- Agent SDK: Claude handles tools autonomously

```python
# Client SDK: Você controla o loop
response = client.messages.create(...)
while response.stop_reason == "tool_use":
    result = your_tool_executor(response.tool_use)
    response = client.messages.create(tool_result=result, ...)

# Agent SDK: Claude autonomy
async for message in query(prompt="Fix the bug"):
    print(message)  # Claude lê arquivos, identifica bug, edita
```

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                      Agent SDK Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    Your Application                      │   │
│   │                                                          │   │
│   │   async for message in query({                         │   │
│   │     prompt: "...",                                      │   │
│   │     options: ClaudeAgentOptions(...)                    │   │
│   │   }):                                                   │   │
│   │     process(message)                                    │   │
│   │                                                          │   │
│   └──────────────────────┬──────────────────────────────────┘   │
│                          │                                        │
│   ┌──────────────────────▼──────────────────────────────────┐   │
│   │                    Agent SDK                             │   │
│   │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│   │   │ Tool       │  │ Session    │  │  Hooks     │    │   │
│   │   │ Executor   │  │ Manager    │  │  System    │    │   │
│   │   └─────────────┘  └─────────────┘  └─────────────┘    │   │
│   │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│   │   │ MCP        │  │ Subagent   │  │  Auth     │    │   │
│   │   │ Client     │  │ Router     │  │  Manager  │    │   │
│   │   └─────────────┘  └─────────────┘  └─────────────┘    │   │
│   └──────────────────────┬──────────────────────────────────┘   │
│                          │                                        │
│   ┌──────────────────────▼──────────────────────────────────┐   │
│   │               Claude API (Bedrock/Vertex/Local)         │   │
│   └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## quickstart

### Instalação

```bash
# TypeScript
npm install @anthropic-ai/claude-agent-sdk

# Python
pip install claude-agent-sdk
```

### Configuração de API Key

```bash
export ANTHROPIC_API_KEY=your-api-key
```

**Providers alternativos:**
```bash
# Amazon Bedrock
export CLAUDE_CODE_USE_BEDROCK=1
aws configure  # Setup AWS credentials

# Google Vertex AI
export CLAUDE_CODE_USE_VERTEX=1
gcloud auth application-default login

# Microsoft Azure AI Foundry
export CLAUDE_CODE_USE_FOUNDRY=1
# Configure Azure credentials
```

### Exemplo Básico

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "What files are in this directory?",
  options: { allowedTools: ["Bash", "Glob"] }
})) {
  if ("result" in message) console.log(message.result);
}
```

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions

async def main():
    async for message in query(
        prompt="What files are in this directory?",
        options=ClaudeAgentOptions(allowed_tools=["Bash", "Glob"])
    ):
        if hasattr(message, "result"):
            print(message.result)

asyncio.run(main())
```

## ClaudeAgentOptions — Referência Completa

| Opção | Tipo | Padrão | Descrição |
|-------|------|--------|-----------|
| `allowed_tools` | `string[]` | semua tools | Lista de tools permitidas |
| `permission_mode` | `string` | `"ask"` | `"acceptEdits"` ou `"ask"` |
| `hooks` | `object` | `{}` | Hook configurations |
| `agents` | `AgentDefinition[]` | `{}` | Subagent definitions |
| `mcp_servers` | `object` | `{}` | MCP server configurations |
| `resume` | `string` | `null` | Session ID para continuar |
| `setting_sources` | `object` | `null` | Config sources |
| `system` | `string` | `null` | System prompt override |

## Ferramentas Disponíveis

| Tool | Descrição | Use Case |
|------|-----------|----------|
| **Read** | Ler arquivos | Analisar código |
| **Write** | Criar arquivos | Gerar código |
| **Edit** | Editar arquivos | Modificar código |
| **Bash** | Executar comandos | Rodar tests, git |
| **Monitor** | Script watcher | Reagir a output |
| **Glob** | Find by pattern | Localizar arquivos |
| **Grep** | Search with regex | Encontrar padrões |
| **WebSearch** | Buscar web | Pesquisar documentação |
| **WebFetch** | Fetch pages | Extrair conteúdo |
| **AskUserQuestion** | Perguntas ao usuário | Clarificações |

## Hooks System

Hooks permitem executar código em pontos específicos do lifecycle do agente:

### Available Hooks

| Hook | Quando | Use Case |
|------|--------|----------|
| `PreToolUse` | Antes de qualquer tool | Validar input, deny |
| `PostToolUse` | Depois de qualquer tool | Log, notify |
| `Stop` | Fim da sessão | Cleanup |
| `SessionStart` | Início da sessão | Injetar contexto |
| `SessionEnd` | Fim da sessão | Persistir estado |
| `UserPromptSubmit` | Prompt submetido | Filtrar, transformar |

### Hook Matcher

```typescript
import { HookMatcher } from "@anthropic-ai/claude-agent-sdk";

// Matcher por nome de tool
const matcher = HookMatcher(matcher="Bash|Read");

// Matcher por padrão regex
const regexMatcher = HookMatcher(matcher="Edit|Write");

// Multiple hooks
const hooks = {
  PostToolUse: [
    HookMatcher(matcher="Edit|Write", hooks=[logChange, audit]),
    HookMatcher(matcher="Bash", hooks=[logCommand])
  ]
};
```

### Exemplo: Audit Trail

```typescript
import { query, HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { appendFile } from "fs/promises";

const auditHook: HookCallback = async (input) => {
  const { tool_name, tool_input, tool_use_id } = input;
  await appendFile("./audit.log",
    JSON.stringify({
      timestamp: new Date().toISOString(),
      tool: tool_name,
      input: tool_input,
      id: tool_use_id
    }) + "\n"
  );
  return {};
};

for await (const message of query({
  prompt: "Refactor auth module",
  options: {
    permissionMode: "acceptEdits",
    hooks: {
      PostToolUse: [{
        matcher: "Edit|Write|Delete",
        hooks: [auditHook]
      }]
    }
  }
})) {
  if ("result" in message) console.log(message.result);
}
```

### Exemplo: Quality Gate

```typescript
const preCommitHook: HookCallback = async (input) => {
  const cmd = input.tool_input?.command || "";
  if (cmd.includes("git commit")) {
    // Rodar linter antes de commit
    const lintResult = await runLint();
    if (!lintResult.success) {
      return { blocked: true, reason: "Lint failed: " + lintResult.errors };
    }
  }
  return {};
};

const hooks = {
  PreToolUse: [{
    matcher: "Bash",
    hooks: [preCommitHook]
  }]
};
```

## Subagents

Subagents são agentes especializados para tarefas específicas:

### Definindo Subagents

```typescript
const agents = {
  "code-reviewer": {
    description: "Expert code reviewer for quality and security",
    prompt: `You are an expert code reviewer.
Analyze code for:
- Logic errors
- Security vulnerabilities
- Performance issues
- Best practice violations
Provide actionable feedback with file:line references.`,
    tools: ["Read", "Glob", "Grep"]
  },

  "test-generator": {
    description: "Generates comprehensive unit tests",
    prompt: `You generate unit tests following:
- Arrange-Act-Assert pattern
- Mock external dependencies
- Cover edge cases
- Include descriptive names`,
    tools: ["Read", "Write", "Glob"]
  },

  "docs-writer": {
    description: "Writes and updates documentation",
    prompt: `You write clear documentation:
- Use simple language
- Include examples
- Keep updated with code changes`,
    tools: ["Read", "Write", "Glob"]
  }
};
```

### Spawning Subagents

```typescript
for await (const message of query({
  prompt: "Use code-reviewer to analyze the auth module",
  options: {
    allowedTools: ["Read", "Glob", "Grep", "Agent"],
    agents: {
      "code-reviewer": { /* definition */ }
    }
  }
})) {
  if ("result" in message) console.log(message.result);
}
```

### Padrão: Pipeline de Agentes

```typescript
// Sequential
const plan = await spawn("planner", { prompt: "Design the feature" });
const impl = await spawn("implementer", { prompt: plan });
const test = await spawn("tester", { prompt: impl });
const review = await spawn("reviewer", { prompt: impl + test });

// Parallel
const [securityReview, perfReview, styleReview] = await Promise.all([
  spawn("security-reviewer", { code }),
  spawn("performance-reviewer", { code }),
  spawn("style-reviewer", { code })
]);

// Hierarchical (Haiku as sub-agent of Opus)
const orchestration = {
  model: "opus",
  prompt: "Coordinate the review team"
};
const subagent = {
  model: "haiku",
  prompt: "Analyze this specific security aspect"
};
```

## MCP Integration

Conectar a servidores MCP externos:

```typescript
for await (const message of query({
  prompt: "Open example.com and describe what you see",
  options: {
    mcp_servers: {
      "playwright": {
        command: "npx",
        args: ["@playwright/mcp@latest"]
      }
    }
  }
})) {
  if ("result" in message) console.log(message.result);
}
```

### Servidores MCP Úteis

| Servidor | Capabilities | Uso |
|----------|--------------|-----|
| `@playwright/mcp` | Browser automation | E2E testing |
| `@modelcontextprotocol/server-filesystem` | File operations | Code access |
| `@modelcontextprotocol/server-git` | Git operations | VCS integration |
| `@modelcontextprotocol/server-github` | GitHub API | PR/Issue management |
| `@modelcontextprotocol/server-slack` | Slack API | Team notifications |
| `@modelcontextprotocol/server-postgres` | Database queries | Data access |

### Dynamic MCP Configuration

```typescript
// Conectar sob demanda
const mcpConfig = {
  servers: {
    // Sempre conectado
    "filesystem": { command: "npx", args: ["@modelcontextprotocol/server-filesystem"] },
  },
  dynamicServers: {
    // Conectado apenas quando necessário
    "github": async () => {
      const token = await getGitHubToken();
      return {
        command: "npx",
        args: ["@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: token }
      };
    }
  }
};
```

## Permissions System

### Permission Modes

| Mode | Comportamento |
|------|---------------|
| `"ask"` (default) | Pede confirmação antes de operations |
| `"acceptEdits"` | Aceita Edits, Bash automaticamente |

### Restringindo Tools

```typescript
// Read-only agent
options = ClaudeAgentOptions(
  allowed_tools=["Read", "Glob", "Grep"]
);

// Write-only agent (para geração de boilerplate)
options = ClaudeAgentOptions(
  allowed_tools=["Write", "Glob"]
);

// Full access (CUIDADO!)
options = ClaudeAgentOptions(
  allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"]
);
```

### Permission Integration com MCP

```typescript
// Verificar permissões antes de executar
const permissionCheck = async (tool: string, input: any) => {
  const allowed = await checkPolicy(tool, input);
  if (!allowed) {
    throw new Error(`Tool ${tool} not permitted`);
  }
  return {};
};
```

## Sessions

Sessions mantêm contexto entre múltiplas trocas:

```typescript
let sessionId: string | undefined;

// Primeira query: capturar session ID
for await (const message of query({
  prompt: "Read the authentication module",
  options: { allowedTools: ["Read", "Glob"] }
})) {
  if (message.type === "system" && message.subtype === "init") {
    sessionId = message.session_id;
  }
}

// Continuar com contexto completo
for await (const message of query({
  prompt: "Now find all places that call it",
  options: { resume: sessionId }
})) {
  if ("result" in message) console.log(message.result);
}
```

### Session Management Patterns

```typescript
// Session pool para parallel tasks
class AgentPool {
  private sessions: Map<string, Session>;
  private maxConcurrent: number;

  async acquire(): Promise<Session> {
    // Implement pool logic
  }

  release(session: Session): void {
    // Return to pool
  }
}

// Fork session para exploration
const fork1 = await session.fork();
const fork2 = await session.fork();
// Explore diferentes approaches em paralelo
```

## Error Handling

```typescript
try {
  for await (const message of query({
    prompt: "Fix the bug",
    options: { allowedTools: ["Read", "Edit"] }
  })) {
    if ("error" in message) {
      console.error("Agent error:", message.error);
      break;
    }
    process(message);
  }
} catch (err) {
  // Handle transport errors
  console.error("Connection error:", err);
  // Retry or fallback
}
```

### Error Types

| Error Type | Cause | Handling |
|------------|-------|----------|
| `tool_use_blocked` | Hook bloqueou tool | Check reason, modify hooks |
| `permission_denied` | User não aprovou | Request approval |
| `authentication_error` | Invalid API key | Refresh credentials |
| `rate_limit_error` | Too many requests | Backoff, retry |
| `context_overflow` | Context window exceeded | Summarize, continue |

## Streaming

```typescript
for await (const message of query({
  prompt: "Explain quantum computing",
  options: {}
})) {
  if (message.type === "content") {
    // Streaming de texto
    process.stdout.write(message.text);
  }
  if (message.type === "tool_use") {
    // Tool sendo executado
    showProgress(message.tool, message.input);
  }
}
```

## AI-Driven Development Patterns

### Pattern 1: Auto-Test Generation

```typescript
const testGenerationPipeline = {
  name: "auto-test-generator",
  trigger: "PostToolUse:Write|Edit",
  steps: [
    {
      hook: "PostToolUse",
      matcher: "Write|Edit",
      action: async (input) => {
        const filePath = input.tool_input?.file_path;
        if (isTestable(filePath)) {
          await spawn("test-generator", { file: filePath });
        }
        return {};
      }
    }
  ]
};
```

### Pattern 2: Continuous Code Review

```typescript
const reviewPipeline = {
  name: "continuous-review",
  hooks: {
    PreCommit: [{
      matcher: "*",
      hooks: [async (input) => {
        const diff = await getStagedDiff();
        const findings = await spawn("code-reviewer", { diff });
        if (findings.critical > 0) {
          return { blocked: true, reason: `Critical issues: ${findings.critical}` };
        }
        return {};
      }]
    }]
  }
};
```

### Pattern 3: Documentation Sync

```typescript
const docsSyncPipeline = {
  name: "docs-sync",
  hooks: {
    PostToolUse: [{
      matcher: "Write|Edit",
      hooks: [async (input) => {
        const file = input.tool_input?.file_path;
        if (isCodeFile(file)) {
          await spawn("docs-writer", { file });
        }
        return {};
      }]
    }]
  }
};
```

### Pattern 4: Context Injection

```typescript
const contextInjectionPipeline = {
  hooks: {
    SessionStart: [{
      matcher: "*",
      hooks: [async (input, context) => {
        const project = await detectProjectType();
        const relevant = await loadRelevantContext(project);
        return {
          injection: {
            type: "context",
            content: relevant
          }
        };
      }]
    }]
  }
};
```

## TypeScript vs Python

### TypeScript

```typescript
import { query, ClaudeAgentOptions, HookCallback } from "@anthropic-ai/claude-agent-sdk";

const hook: HookCallback = async (input) => {
  // Type-safe input
  const { tool_name, tool_input } = input;
  return {};
};

for await (const message of query({
  prompt: "...",
  options: {
    allowedTools: ["Read", "Write"],
    hooks: { PostToolUse: [{ matcher: ".*", hooks: [hook] }] }
  }
})) {
  if (message.type === "result") {
    console.log(message.result);
  }
}
```

### Python

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions, HookMatcher

async def hook(input_data, tool_use_id, context):
    tool_name = input_data.get("tool_name")
    tool_input = input_data.get("tool_input", {})
    return {}

async def main():
    async for message in query(
        prompt="...",
        options=ClaudeAgentOptions(
            allowed_tools=["Read", "Write"],
            hooks={
                "PostToolUse": [HookMatcher(matcher=".*", hooks=[hook])]
            }
        )
    ):
        if hasattr(message, "result"):
            print(message.result)

asyncio.run(main())
```

## Best Practices

1. **Tool Restrictions**: Sempre restrinja tools ao mínimo necessário
2. **Hook Error Handling**:Sempre retorne `{}` de hooks, ou bloqueie explicitamente
3. **Session Management**: Use sessions para manter contexto, não para todo request
4. **MCP Server Security**: Valide tokens, não passe credenciais diretamente
5. **Permission Boundaries**: Defina boundaries claros entre agent e usuário
6. **Context Management**: Para agentes com muitas tools, use progressive discovery
7. **Output Validation**: Sempre valide outputs de tools antes de usar

## Referências

- [Agent SDK Docs](https://code.claude.com/docs/en/agent-sdk)
- [Quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart)
- [Examples](https://github.com/anthropic/claude-agent-sdk-demos)
