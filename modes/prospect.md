# Modo: prospect — Prospecção Autônoma em Top 50 Empresas

Escaneia as maiores empresas dos EUA e da Europa (marcadas com `group: [prospect]` em portals.yml), faz uma avaliação leve de compatibilidade por vaga (score 0–10), e cria issues no Linear automaticamente para as melhores oportunidades.

## Parâmetros

| Parâmetro | Padrão | Descrição |
|-----------|--------|-----------|
| `threshold` | 7.5 | Score mínimo para criação de issue no Linear (escala 0–10) |
| `max_companies` | all | Máximo de empresas a processar (útil para testes: `max_companies: 5`) |
| `dry_run` | false | Se true, exibe resultado mas NÃO cria issues no Linear |

Equivalência de escala: 7.5/10 ≈ 3.8/5 do sistema de avaliação principal.

## Ejecução recomendada

Executar como subagente background para não consumir contexto do main:

```
Agent(
    subagent_type="general-purpose",
    prompt="[conteúdo de modes/_shared.md]\n\n[conteúdo de modes/prospect.md]\n\n[lista das empresas prospect do portals.yml]",
    run_in_background=True
)
```

## Workflow

### 1. Leitura de configuração

Ler:
- `portals.yml` → filtrar `tracked_companies` com `group` contendo `prospect` e `enabled: true`
- `cv.md` → perfil do candidato (skills, experiência)
- `modes/_profile.md` → archetypes alvo, deal-breakers, preferências
- `data/scan-history.tsv` → URLs já vistas (dedup)
- `data/applications.md` → empresa + rol já avaliado (dedup)
- `data/pipeline.md` → URLs já em pendentes (dedup)

### 2. Init Linear

Antes do scan, obter o `team_id` do workspace do Linear:
```
mcp__claude_ai_Linear__list_teams({})
```
Usar o primeiro team ativo retornado. Guardar o ID para todas as criações de issues.

Labels alvo para criar se não existirem: `job-search`, `prospect`, `ai`, `remote`, `visa`.

### 3. Scan por empresa (batches de 3)

**CRÍTICO: Nunca mais de 1 empresa com Playwright em paralelo.**

Para cada empresa no grupo prospect, executar nos 3 níveis em ordem:

#### Nível 1 — Playwright (principal)
```
browser_navigate(careers_url)
browser_snapshot()
```
- Extrair todos os job listings visíveis: `{title, url, company}`
- Se a página tem filtros/departamentos, navegar seções relevantes
- Se pagina, navegar páginas adicionais
- Fallback: se 404 ou redirect, tentar `scan_query` no Nível 3 e anotar URL quebrada

#### Nível 2 — Greenhouse API (complemento, paralelo)
Para empresas com campo `api:` definido:
```
WebFetch(api_url)
```
JSON `{jobs: [{title, absolute_url, ...}]}` → extrair `{title, url, company}`

#### Nível 3 — WebSearch (complemento)
Para empresas com `scan_method: websearch` ou como fallback:
```
WebSearch(scan_query)
```
Extrair título e empresa do resultado usando o regex:
```
(.+?)(?:\s*[@|—–-]\s*|\s+at\s+)(.+?)$
```

Os 3 níveis são aditivos — deduplicar por URL antes de filtrar.

### 4. Filtrar por título

Usar `title_filter` do portals.yml:
- **positive**: ao menos 1 keyword deve aparecer no título (case-insensitive)
  - Foco prospect: AI, ML, Machine Learning, LLM, Automation, Platform, Data, Software Engineer, Applied Scientist, Research, DevRel, Solutions
- **negative**: nenhuma keyword pode aparecer
- **seniority_boost**: keywords que indicam nível compatível (Senior, Staff, Principal, Lead)

### 5. Avaliação leve (score 0–10)

Para cada vaga que passou o filtro de título, fazer avaliação rápida **sem abrir o JD completo**:

| Critério | Pontos | Condição |
|----------|--------|---------|
| Vaga AI/LLM/Automation direta | +3 | Título contém: AI, LLM, ML, Machine Learning, Automation, Agentic |
| Remoto ou híbrido | +2 | Notes/título/URL contêm: remote, hybrid, distributed |
| Empresa com histórico de sponsorship | +2 | Empresa conhecida por contratar internacionalmente (ver lista abaixo) |
| Seniority compatível | +1 | Título contém: Senior, Staff, Principal, Lead, Manager |
| Produto global com hiring cross-border | +1 | Empresa tem offices em 3+ países ou cultura remote-first |
| Área complementar com AI | +1 | Platform, Data Engineering, DevRel, Solutions Architect, Software Engineer |
| Presencial obrigatório sem base do usuário | -2 | Notas indicam on-site em cidade sem escritório do candidato |
| Sem sinal de remote/hybrid para candidato internacional | -3 | Empresa conhecida como presencial, sem menção a remote |

**Score máximo: 10 | Mínimo: 0 (floor em 0)**

**Empresas com bom histórico de sponsorship/international hiring:**
Microsoft, Google, Amazon, Meta, NVIDIA, Netflix, Databricks, Snowflake, Elastic, Wise, Adyen, Booking.com, Revolut, Monzo, Klarna, SAP, Siemens, Nokia, Ericsson

**Red flags que reduzem score:**
- Tesla, Apple: majoritariamente presencial, sem remote para roles tech
- JPMorgan: escritório obrigatório para muitos roles
- Qualquer nota com "on-site required" ou "no remote"

### 6. Deduplicar

Verificar contra 3 fontes:
1. `scan-history.tsv` → URL exata já vista → `skipped_dup`
2. `applications.md` → empresa + título normalizado já avaliado → `skipped_dup`
3. `pipeline.md` → URL exata já em pendentes → `skipped_dup`

### 7. Output estruturado

Exibir tabela ordenada por score (decrescente):

```
Prospect Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Empresas scaneadas: N
Vagas encontradas: N total
Filtradas por título: N relevantes
Duplicadas: N
Novas avaliadas: N

Empresa         | Vaga                        | País | Modalidade  | Score | Linear | Link
----------------|-----------------------------|------|-------------|-------|--------|-----
Databricks      | Senior AI Engineer          | US   | Remote      | 9.0   | ✅ #42 | https://...
Wise            | ML Platform Engineer        | UK   | Hybrid      | 8.5   | ✅ #43 | https://...
Apple           | Machine Learning Engineer   | US   | On-site     | 4.0   | ❌     | https://...
...

Vagas com score ≥ 7.5 → issues criadas no Linear: N
Vagas com score < 7.5 → listadas apenas para referência: N

→ Executa /career-ops pipeline para avaliar as melhores em detalhe.
```

### 8. Criar issues no Linear (score ≥ threshold)

Para cada vaga com score ≥ 7.5 (ou valor de `threshold`):

```
mcp__claude_ai_Linear__save_issue({
  team_id: "<team_id do step 2>",
  title: "[PROSPECT] {Empresa} — {Título da vaga}",
  description: """
## {Título da vaga} @ {Empresa}

**Score:** {score}/10
**Modalidade:** {remote/hybrid/on-site}
**País:** {país}
**Link:** {url}

### Por que esse score?
{1-2 linhas explicando os critérios que mais pesaram}

### Próxima ação
Avaliar JD completo com `/career-ops {url}` para score detalhado e geração de CV.
  """,
  label_names: ["job-search", "prospect"]  # + "ai" se score +3, "remote" se remoto
})
```

Se o MCP retornar erro por label não existir, criar a label primeiro:
```
mcp__claude_ai_Linear__create_issue_label({ name: "prospect", color: "#7C3AED" })
```

### 9. Registrar no scan-history.tsv

Para cada URL processada, adicionar linha:
```
{url}\t{YYYY-MM-DD}\tprospect\t{title}\t{company}\t{status}
```

Status possíveis: `added_linear` | `evaluated` | `skipped_title` | `skipped_dup`

### 10. Atualizar pipeline.md (vagas com score ≥ 5.0)

Vagas com score entre 5.0 e 7.4 (não chegaram ao Linear mas são relevantes):
```
- [ ] {url} | {company} | {title} | prospect-score:{score}
```
Adicionar na seção "Pendentes" do pipeline.md.

## Gestão de URLs quebradas

Se `careers_url` de uma empresa retornar 404 ou redirect:
1. Anotar no sumário: `⚠️ {empresa}: careers_url quebrada, fallback para WebSearch`
2. Tentar `scan_query` como fallback
3. Se WebSearch encontrar nova URL válida, **atualizar portals.yml** com a URL correta

## Limitações conhecidas

- **Playwright**: não rodar em paralelo. Batch de 3 empresas por vez, sequencial entre elas.
- **Linear MCP**: não cria teams, apenas issues. O `team_id` deve existir.
- **Avaliação leve**: sem leitura do JD completo. Scores são estimativas para triagem — usar `/career-ops {url}` para avaliação detalhada.
- **Batch mode (`claude -p`)**: Playwright não disponível. Usar WebFetch + WebSearch como fallback e marcar `verification: unconfirmed` no output.
