---
title: Scan Strategy — Regra de Negócio
type: rule
priority: high
description: Define cargos-alvo (PRIMARY/SECONDARY) e ordem de prioridade para escaneamento de portais (Tier 0-3) com auth gate obrigatório para portais autenticados. Carregada como contexto sempre que o assistente atua sobre busca de vagas neste projeto.
applies_when:
  - Executando /career-ops scan ou /career-ops scan-aware
  - Editando portals.yml ou modes/scan.md
  - Discutindo cargos-alvo, scoring de vagas ou estratégia de descoberta
  - Configurando pairings de portais autenticados
globs:
  - portals.yml
  - modes/scan.md
  - scan.mjs
  - check-liveness.mjs
  - liveness-core.mjs
  - data/scan-history.tsv
ssot:
  - config/profile.yml
last_updated: 2026-04-26
version: 1.1.0
related:
  - config/profile.yml
  - modes/scan.md
  - .claude/rules/20-project-governance.md
---

# Scan Strategy — Regra de Negócio

## Target Roles (Source of Truth: config/profile.yml)

**PRIMARY (score mais alto, aplicar sempre):**
- Head of Accounting / Head de Contabilidade
- Controller (Financial / Regional / LATAM / Corporate)
- Diretor de Contabilidade / Accounting Director
- Head de Consolidacao / Gerente de Consolidacao

**SECONDARY (score menor, aplicar quando houver fit):**
- Head de FP&A / Gerente de FP&A
- Head Financeiro / Gerente Financeiro

## Scan Priority (obrigatório em toda execução de /career-ops scan)

A busca de vagas segue esta ordem de prioridade:

**Tier 0 — Portais brasileiros (PRIMEIRO, via Playwright):**
1. LinkedIn Jobs
2. Indeed Brazil
3. Vagas.com.br
4. Robert Half

**Tier 1 — WebSearch (Google, descoberta ampla):**
- Greenhouse, Lever, Ashby, Workable, Glassdoor + Google broad

**Tier 2 — ATS APIs (complementar rápido):**
- Empresas com API Greenhouse/Ashby/Lever detectável

**Tier 3 — Sites individuais (complemento direcionado):**
- Empresas em tracked_companies (portals.yml)

## Auth Gate (OBRIGATÓRIO)

Antes de escanear qualquer portal autenticado (LinkedIn, Indeed, Vagas.com.br, Robert Half):
1. Abrir browser Playwright e navegar ao portal
2. Verificar se o usuário está logado
3. Se NÃO logado → PAUSAR e pedir que o usuário faça login
4. Se logado → prosseguir com o scan
5. Sessões anteriores na mesma sessão Claude Code são reutilizadas

Configuração detalhada em `modes/scan.md` e `portals.yml` (seção `auth_portals`).
