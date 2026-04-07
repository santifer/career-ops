# Prompt de Continuacao — Browser Autonomy Enhancement Pipeline

> Cole este prompt inteiro em uma nova sessao do Claude Code para continuar a execucao.
> Diretorio de trabalho: `C:/Projetos/Carrer Ops`

---

## Contexto do Projeto

Estou no projeto **career-ops** (`C:/Projetos/Carrer Ops`) — um pipeline de busca de emprego AI-powered construido sobre Claude Code. Stack: Node.js (mjs), Playwright MCP (^1.58.1), YAML config, Markdown data. O projeto usa "mode files" (arquivos .md em `modes/`) como instrucoes para o Claude executar workflows de automacao.

## O que ja foi feito (sessao anterior)

Na sessao anterior, executamos o workflow completo do `/skill-advisor:advisor` + `/sdd:plan` para gerar uma spec de implementacao refinada. Isso produziu:

### Artefatos gerados (TODOS existem no disco — nao recriar):

1. **Task Spec** (1295 linhas, completa e refinada):
   `C:/Projetos/Carrer Ops/.specs/tasks/todo/browser-autonomy.feature.md`
   - Contem: Description, 14 Acceptance Criteria (Given/When/Then), 6 User Scenarios, Architecture Overview, 12 Implementation Steps paralelizados, 15 Verification rubrics LLM-as-Judge
   - **IMPORTANTE**: A task tem um Required Skill block no topo — voce DEVE ler a skill antes de qualquer modificacao

2. **Skill File** (reusavel, 8 patterns de browser autonomy):
   `C:/Users/ferna/.claude/skills/playwright-mcp-autonomy/SKILL.md`
   - Patterns: Snapshot-Decide-Act loop, Session Persistence, Multi-Step Flow, CAPTCHA/2FA Detection, Cookie Banner, Retry with Verification, Overlay Detection, Action Logging
   - Inclui `extractRefFromSnapshot()` implementation e code examples

3. **Codebase Analysis**:
   `C:/Projetos/Carrer Ops/.specs/analysis/analysis-browser-autonomy.md`
   - 11 arquivos afetados mapeados, 8 integration points, risk assessment

4. **Pipeline Spec**:
   `C:/Projetos/Carrer Ops/.specs/pipelines/browser-autonomy-2026-04-07.md`
   - 5 fases: Clarification -> Planning -> Cookie Setup -> Implementation -> Quality

### Quality Gates da sessao anterior (sdd:plan com threshold 3.5/5.0):

| Phase | Score | Verdict |
|-------|-------|---------|
| Research (skill) | 3.20/5.0 | PROCEEDED (max iter — phantom function e URL foram fixados na iter 3) |
| Codebase Analysis | 3.85/5.0 | PASS |
| Business Analysis | 3.85/5.0 | PASS |
| Architecture Synthesis | 3.55/5.0 | PASS |
| Decomposition | 3.50/5.0 | PASS |
| Parallelization | 3.80/5.0 | PASS |
| Verifications | 3.80/5.0 | PASS |

## O que precisa ser feito agora

Executar o pipeline de 5 fases definido em `.specs/pipelines/browser-autonomy-2026-04-07.md`. As fases sao:

### Fase 1: Clarification (`/sdd:brainstorm`) ~10min
**Objetivo**: Refinar os requisitos de autonomia para cada modo antes de implementar.
**Prompt para o brainstorm**: Refinar requisitos de autonomia para navegacao browser do career-ops. Definir o que "autonomo" significa para cada modo (scan, apply, evaluate, pipeline). Identificar failure modes (CAPTCHA, 2FA, session expiry). Clarificar boundaries de human-in-the-loop. Usar task spec em `.specs/tasks/todo/browser-autonomy.feature.md` como input.
**Input**: Task spec + CLAUDE.md + modes/*.md
**Output esperado**: Documento de requisitos refinados com definicoes de autonomia por modo
**Gate de saida**: Requisitos cobrem todas as 5 areas de capability da task spec

### Fase 2: Planning (`/superpowers:writing-plans`) ~15min
**Objetivo**: Criar plano de implementacao estruturado.
**Prompt para o plan**: Criar plano de implementacao para browser autonomy enhancement baseado na task spec em `.specs/tasks/todo/browser-autonomy.feature.md`. O plano deve cobrir: criacao do browser-session.md, updates nos mode files (scan, apply, pipeline, auto-pipeline), cookie management, HITL gates, action logging. Seguir os 12 steps de implementacao ja decompostos na task spec.
**Input**: Task spec (com arquitetura e steps), skill file
**Output esperado**: Plano executavel com mudancas por arquivo
**Gate de saida**: Plano cobre todos os 12 implementation steps da task spec

### Fase 3: Cookie Setup (`/setup-browser-cookies`) ~10min
**Objetivo**: Importar cookies do Chrome real para sessoes headless.
**Prompt**: Importar cookies do browser Chrome do usuario para estabelecer sessoes autenticadas em portais de emprego. Salvar storageState JSON em `data/sessions/`. Testar com pelo menos um portal.
**Input**: Sessao Chrome do usuario
**Output esperado**: Arquivos `data/sessions/<portal>.json` com cookies validos
**Gate de saida**: Pelo menos uma sessao de portal verificada como autenticada
**NOTA**: Esta fase requer interacao com o usuario (escolher browser, selecionar cookies). Pode ser adiada se o usuario preferir.

### Fase 4: Implementation (`/feature-dev:feature-dev`) ~40min — FASE PRINCIPAL
**Objetivo**: Implementar todos os 12 steps do task spec.
**Prompt**: Implementar browser autonomy enhancement seguindo a task spec em `.specs/tasks/todo/browser-autonomy.feature.md`. Executar todos os 12 implementation steps na ordem paralelizada definida na spec. Deliverables chave:
- `modes/browser-session.md` (NOVO — ~200-300 linhas, central reference file)
- Updates em `CLAUDE.md`, `modes/_shared.md`, `scan.md`, `apply.md`, `pipeline.md`, `auto-pipeline.md`
- German mirrors em `modes/de/`
- `portals.example.yml` update com campos de sessao

**Os 12 steps (ordem paralelizada)**:
```
Phase A (parallel):
  Step 1: portals.example.yml update (haiku — trivial config)
  Step 2: CLAUDE.md governance update (opus — safety-critical)
  Step 3: _shared.md tool rules + HITL (opus — foundational)

Phase B (after Steps 2+3):
  Step 4: browser-session.md creation (opus — CRITICAL PATH, largest step)

Phase C (after Step 4, parallel):
  Step 5: scan.md update (opus)
  Step 6: pipeline.md update (opus)
  Step 7: auto-pipeline.md update (opus)
  Step 8: apply.md major rewrite (opus — CRITICAL PATH, most complex)

Phase D (after Step 3, parallel with C):
  Step 9: de/_shared.md German mirror (sonnet)

Phase E (after Steps 5-8):
  Step 10: de/pipeline.md German mirror (sonnet)
  Step 11: de/bewerben.md German mirror (sonnet)

Phase F (after all):
  Step 12: Cross-reference verification (opus/qa-engineer)
```

**Input**: Task spec, skill file, analysis file, plano da Fase 2
**Output esperado**: Todos os mode files criados/atualizados conforme spec
**Gate de saida**: Todos os 14 acceptance criteria enderecados, HITL gates implementados

### Fase 5: Quality (`/webapp-testing`) ~15min
**Objetivo**: Validar flows autonomos contra portal real.
**Prompt**: Validar flows de browser autonomy contra um portal de emprego real. Testar: execucao do decision loop, navegacao autenticada com cookies, dismissal de obstacles (cookie banners), triggers de HITL gates, action logging. Usar ferramentas Playwright MCP.
**Input**: Mode files atualizados, sessoes de cookies
**Output esperado**: Relatorio de teste com pass/fail por acceptance criterion
**Gate de saida**: Todos os acceptance criteria funcionais verificados

## Decisoes arquiteturais ja tomadas (NAO mudar):

1. **Single new file**: `modes/browser-session.md` e o unico arquivo novo — segue o padrao mode-per-concern do projeto
2. **No YAML flow runner**: O runtime do projeto e Claude lendo Markdown. Patterns de portais sao documentados como prosa, nao YAML configs
3. **No new npm dependencies**: Tudo via Playwright MCP tool calls + storageState JSON + NDJSON para logs
4. **Ethical constraint**: NUNCA submeter aplicacao sem revisao do usuario (CLAUDE.md rule)
5. **Sequential Playwright**: Apenas UMA instancia Playwright por vez (constraint do projeto em _shared.md)

## Como executar

1. Leia a task spec: `.specs/tasks/todo/browser-autonomy.feature.md`
2. Leia a skill: `.claude/skills/playwright-mcp-autonomy/SKILL.md`
3. Execute as fases em ordem (1 -> 2 -> 3 -> 4 -> 5)
4. Para cada fase, use a skill correspondente via `Skill('skill-name')`
5. Apos cada fase, pergunte se devo continuar
6. Na Fase 4 (implementacao), use subagentes paralelos conforme o diagrama de paralelizacao
7. Na Fase 5, use Playwright MCP tools para testar contra um portal real

**Shortcut**: Se quiser pular direto para implementacao (Fases 1-2 ja estao substancialmente cobertas pela task spec refinada), diga "pular para implementacao" e eu comeco pela Fase 4 usando a task spec como plano.

## Warnings da sessao anterior

- **Skill file (Phase 2a)**: Score 3.20 — o judge flagou que community sources nao estao cross-listados e que a reusabilidade ainda tem residuos project-specific. Nao e blocking mas vale revisar durante implementacao.
- **Architecture Decision #2 conflita com AC #3**: A arquitetura rejeita YAML flow configs, mas o AC #3 pede "YAML flow definition exists for a portal." Resolver durante implementacao: interpretar como "YAML config em portals.yml com campos de sessao", nao como um flow runner separado.
- **apply.md rewrite (Step 8)**: O judge recomendou decompor em 2-3 sub-steps (active workflow, HITL gates, logging/form preservation). Considerar durante implementacao.
