# Modo: scan — Portal Scanner (Descoberta de Vagas)

Escaneia portais de emprego configurados, filtra por relevância de título, e adiciona novas vagas ao pipeline para avaliação posterior.

## Execução recomendada

Executar como subagente para não consumir contexto do main:

```
Agent(
    subagent_type="general-purpose",
    prompt="[conteúdo deste arquivo + dados específicos]",
    run_in_background=True
)
```

## Configuração

Ler `portals.yml` que contém:
- `search_queries`: Lista de queries WebSearch com filtros `site:` por portal (descoberta ampla)
- `tracked_companies`: Empresas específicas com `careers_url` para navegação direta
- `title_filter`: Keywords positive/negative/seniority_boost para filtrado de títulos

## REGRA OBRIGATÓRIA: Auth Gate (Portais com Login)

**Antes de escanear QUALQUER portal que requeira autenticação, o sistema DEVE verificar se o usuário está logado.** Isso se aplica a:

| Portal | URL de verificação | Indicador de "não logado" |
|--------|-------------------|--------------------------|
| LinkedIn | `https://www.linkedin.com/jobs/search/?keywords=Controller&location=Brazil` | Página de login/auth wall, botão "Sign in" proeminente |
| Indeed Brazil | `https://br.indeed.com/jobs?q=Controller&l=Sao+Paulo` | Pode funcionar sem login, mas preferencial logado |
| Vagas.com.br | `https://www.vagas.com.br/vagas-de-controller-em-sao-paulo` | Banner de login, conteúdo limitado |
| Robert Half | `https://www.roberthalf.com.br/vagas` | Formulário de login visível |

### Workflow de Auth Gate

1. **Para cada portal autenticado (na ordem: LinkedIn → Indeed → Vagas.com.br → Robert Half):**
   a. `browser_navigate` à URL de verificação
   b. `browser_snapshot` para checar estado de autenticação
   c. **Se logado:** prosseguir com o scan normalmente
   d. **Se NÃO logado:**
      - PAUSAR o scan
      - Informar ao usuário: `"Portal [NOME] requer autenticação. Por favor, faça login no browser que abriu e me avise quando estiver pronto."`
      - Esperar o usuário confirmar
      - `browser_snapshot` novamente para confirmar login
      - Prosseguir com o scan
   e. **Se o usuário não quiser autenticar naquele momento:** pular o portal e continuar para o próximo

2. **Cache de sessão:** Se o browser já está aberto com uma sessão autenticada de um scan anterior (mesma sessão Claude Code), reutilizar sem pedir login novamente.

3. **Ordem de verificação:** Sempre verificar na mesma ordem (LinkedIn primeiro, depois Indeed, Vagas.com.br, Robert Half) para minimizar interrupções.

## Estratégia de descoberta (4 níveis, em ORDEM DE PRIORIDADE)

### Nível 0 — Portais brasileiros com autenticação (PRINCIPAL)

**Portais:** LinkedIn, Indeed Brazil, Vagas.com.br, Robert Half

**Para cada portal (após Auth Gate):**
1. `browser_navigate` à página de busca de vagas
2. Usar os termos de busca do `title_filter.positive` adaptados ao portal:
   - Buscas recomendadas (executar TODAS por portal):
     - `"Controller"` + Brazil/Sao Paulo
     - `"Head of Accounting"` OR `"Accounting Director"` + Brazil/Sao Paulo
     - `"Consolidation"` OR `"Consolidação"` + Brazil/Sao Paulo
     - `"FP&A Manager"` OR `"Finance Manager"` + Brazil/Sao Paulo
3. `browser_snapshot` para ler resultados
4. Se houver paginação, navegar até 3 páginas por busca
5. Para cada vaga: extrair `{title, url, company, location, source_portal}`
6. Acumular em lista de candidatos

**Por que primeiro:** Estes 4 portais concentram a maior parte das vagas brasileiras. Um scan de 4 portais cobre mais vagas do que bater em 45 sites individuais.

### Nível 1 — Google WebSearch nos sites das empresas (DESCOBERTA AMPLA)

Os `search_queries` com filtros `site:` em `portals.yml`. Cobrem Greenhouse, Ashby, Lever, Indeed, Glassdoor etc. por meio de busca web.

**Para cada query em `search_queries` com `enabled: true`:**
1. Executar WebSearch com a `query` definida
2. De cada resultado extrair: `{title, url, company}`
   - **title**: do título do resultado (antes do " @ " ou " | ")
   - **url**: URL do resultado
   - **company**: depois do " @ " no título, ou extrair do domínio/path
3. Acumular em lista de candidatos (dedup com Nível 0)

### Nível 2 — ATS APIs / Feeds (COMPLEMENTAR RÁPIDO)

Para empresas com API pública ou feed estruturado, usar a resposta JSON/XML. Mais rápido que Playwright.

**Suporte atual:**
- **Greenhouse**: `https://boards-api.greenhouse.io/v1/boards/{company}/jobs`
- **Ashby**: `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **BambooHR**: lista `https://{company}.bamboohr.com/careers/list`; detalhe `https://{company}.bamboohr.com/careers/{id}/detail`
- **Lever**: `https://api.lever.co/v0/postings/{company}?mode=json`
- **Teamtailor**: `https://{company}.teamtailor.com/jobs.rss`
- **Workday**: `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

### Nível 3 — Sites individuais das empresas (COMPLEMENTO DIRECIONADO)

**Para cada empresa em `tracked_companies`:** Navegar à `careers_url` com Playwright (`browser_navigate` + `browser_snapshot`), ler os job listings visíveis, extrair título + URL de cada um.

- Vê a página em tempo real
- Funciona com SPAs (Ashby, Lever, Workday)
- Não depende de indexação do Google

**Cada empresa DEVE ter `careers_url` em portals.yml.** Se não tiver, buscá-la uma vez, guardar, e usar em futuros scans.

## Workflow completo

### Pré-scan (obrigatório)

1. **Ler configuração**: `portals.yml`
2. **Ler histórico**: `data/scan-history.tsv` → URLs já vistas
3. **Ler fontes dedup**: `data/applications.md` + `data/pipeline.md`
4. **Auth Gate**: Verificar autenticação nos 4 portais (ver seção "REGRA OBRIGATÓRIA" acima)

### Scan — Nível 0: Portais brasileiros

Para cada portal autenticado (LinkedIn → Indeed → Vagas.com.br → Robert Half):
a. `browser_navigate` à página de busca
b. `browser_snapshot` para ler resultados
c. Para cada vaga: extrair `{title, url, company, location, source_portal}`
d. Se houver paginação, navegar até 3 páginas
e. Acumular em lista de candidatos

### Scan — Nível 1: WebSearch queries (paralelo se possível)

Para cada query em `search_queries` com `enabled: true`:
a. Executar WebSearch com a `query` definida
b. Extrair `{title, url, company}` dos resultados
c. Acumular (dedup com Nível 0)

### Scan — Nível 2: ATS APIs (paralelo)

Para cada empresa em `tracked_companies` com `api:` definida e `enabled: true`:
a. WebFetch da URL de API/feed
b. Parser por provider (greenhouse, ashby, lever, bamboohr, teamtailor, workday)
c. Extrair `{title, url, company}` (dedup com Níveis 0-1)

### Scan — Nível 3: Sites individuais (batches de 3-5)

Para cada empresa em `tracked_companies` com `enabled: true` e `careers_url`:
a. `browser_navigate` à `careers_url`
b. `browser_snapshot` para ler job listings
c. Se a página tem filtros/departamentos, navegar seções relevantes
d. Extrair `{title, url, company}` (dedup com Níveis 0-2)
e. Se `careers_url` falhar, tentar `scan_query` como fallback

### Pós-scan

6. **Filtrar por título** usando `title_filter` de `portals.yml`:
   - Pelo menos 1 keyword de `positive` deve aparecer (case-insensitive)
   - 0 keywords de `negative` devem aparecer
   - `seniority_boost` dá prioridade mas não é obrigatório

7. **Deduplicar** contra 3 fontes:
   - `scan-history.tsv` → URL exata já vista
   - `applications.md` → empresa + cargo normalizado já avaliado
   - `pipeline.md` → URL exata já em pendentes ou processadas

8. **Verificar liveness de resultados do Nível 1** (WebSearch pode ter cache):
   Para cada URL nova do Nível 1 (sequencial — NUNCA Playwright em paralelo):
   a. `browser_navigate` à URL
   b. `browser_snapshot` para ler o conteúdo
   c. **Ativa**: título + descrição + Apply visíveis
   d. **Expirada**: "job no longer available" / só navbar/footer / URL `?error=true`
   e. Se expirada: registrar `skipped_expired` e descartar

9. **Para cada vaga nova verificada**:
   a. Adicionar a `pipeline.md` seção "Pendentes": `- [ ] {url} | {company} | {title}`
   b. Registrar em `scan-history.tsv`: `{url}\t{date}\t{query_name}\t{title}\t{company}\tadded`

10. **Status tracking em scan-history.tsv**:
    - `added` — vaga nova adicionada ao pipeline
    - `skipped_title` — não passou no filtro de título
    - `skipped_dup` — duplicada (já existe)
    - `skipped_expired` — link morto/expirada

## Extração de título e empresa de resultados WebSearch

Os resultados de WebSearch vêm em formato: `"Job Title @ Company"` ou `"Job Title | Company"` ou `"Job Title — Company"`.

Regex genérico: `(.+?)(?:\s*[@|—–-]\s*|\s+at\s+)(.+?)$`

## URLs privadas

Se encontrar uma URL não acessível publicamente:
1. Guardar a JD em `jds/{company}-{role-slug}.md`
2. Adicionar ao pipeline.md como: `- [ ] local:jds/{company}-{role-slug}.md | {company} | {title}`

## Scan History

`data/scan-history.tsv` rastreia TODAS as URLs vistas:

```
url	first_seen	portal	title	company	status
https://...	2026-02-10	LinkedIn	Controller	SP	Acme	added
https://...	2026-02-10	Indeed	BigCo	Junior Dev	BigCo	skipped_title
https://...	2026-02-10	LinkedIn	SP	OldCo	skipped_dup
https://...	2026-02-10	WebSearch	PM AI	ClosedCo	skipped_expired
```

## Resumo de saída

```
Portal Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━

AUTH STATUS:
  LinkedIn:      ✅ logado / ⏳ aguardando login
  Indeed:        ✅ logado / ⏳ aguardando login
  Vagas.com.br:  ✅ logado / ⏳ aguardando login
  Robert Half:   ✅ logado / ⏳ aguardando login

Nível 0 — Portais brasileiros:
  LinkedIn:       N vagas | N relevantes
  Indeed:         N vagas | N relevantes
  Vagas.com.br:   N vagas | N relevantes
  Robert Half:    N vagas | N relevantes

Nível 1 — WebSearch: N resultados | N relevantes
Nível 2 — ATS APIs:   N resultados | N relevantes
Nível 3 — Sites individuais: N resultados | N relevantes

Total encontrado:  N
Filtradas (título): N removidas
Duplicadas:        N (já avaliadas ou em pipeline)
Expiradas:         N (links mortos, Nível 1)
Novas adicionadas: N

  + {company} | {title} | {portal}
  ...

→ Executa /career-ops pipeline para avaliar as novas vagas.
```

## Gestão de careers_url

Cada empresa em `tracked_companies` deve ter `careers_url` — a URL direta à página de vagas.

**Padrões conhecidos por plataforma:**
- **Ashby:** `https://jobs.ashbyhq.com/{slug}`
- **Greenhouse:** `https://job-boards.greenhouse.io/{slug}` ou `https://job-boards.eu.greenhouse.io/{slug}`
- **Lever:** `https://jobs.lever.co/{slug}`
- **BambooHR:** lista `https://{company}.bamboohr.com/careers/list`; detalhe `https://{company}.bamboohr.com/careers/{id}/detail`
- **Teamtailor:** `https://{company}.teamtailor.com/jobs`
- **Workday:** `https://{company}.{shard}.myworkdayjobs.com/{site}`
- **Custom:** A URL própria da empresa (ex: `https://openai.com/careers`)

**Se `careers_url` não existir** para uma empresa:
1. Tentar o padrão da plataforma conhecida
2. Se falhar, WebSearch rápido: `"{company}" careers jobs`
3. Navegar com Playwright para confirmar
4. **Guardar a URL em portals.yml** para futuros scans

## Manutenção do portals.yml

- **SEMPRE guardar `careers_url`** quando se adiciona empresa nova
- Adicionar queries conforme se descubram portais interessantes
- Desativar queries com `enabled: false` se gerarem ruído
- Ajustar keywords conforme evoluam os cargos target
- Verificar `careers_url` periodicamente — empresas mudam de plataforma ATS
