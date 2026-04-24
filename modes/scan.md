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

## Estratégia de descoberta (3 níveis)

### Nível 1 — Playwright direto (PRINCIPAL)

**Para cada empresa em `tracked_companies`:** Navegar a sua `careers_url` com Playwright (`browser_navigate` + `browser_snapshot`), ler TODOS os job listings visíveis, e extrair título + URL de cada um. Este é o método mais confiável porque:
- Vê a página em tempo real (não resultados cacheados do Google)
- Funciona com SPAs (Ashby, Lever, Workday)
- Detecta vagas novas instantaneamente
- Não depende da indexação do Google

**Cada empresa DEVE ter `careers_url` em portals.yml.** Se não tiver, buscá-la uma vez, guardar, e usar em futuros scans.

### Nível 2 — ATS APIs / Feeds (COMPLEMENTAR)

Para empresas com API pública ou feed estruturado, usar a resposta JSON/XML como complemento rápido do Nível 1. É mais rápido que Playwright e reduz erros de scraping visual.

**Suporte atual (variáveis entre `{}`):**
- **Greenhouse**: `https://boards-api.greenhouse.io/v1/boards/{company}/jobs`
- **Ashby**: `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **BambooHR**: lista `https://{company}.bamboohr.com/careers/list`; detalhe de uma vaga `https://{company}.bamboohr.com/careers/{id}/detail`
- **Lever**: `https://api.lever.co/v0/postings/{company}?mode=json`
- **Teamtailor**: `https://{company}.teamtailor.com/jobs.rss`
- **Workday**: `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

**Convenção de parsing por provider:**
- `greenhouse`: `jobs[]` → `title`, `absolute_url`
- `ashby`: GraphQL `ApiJobBoardWithTeams` com `organizationHostedJobsPageName={company}` → `jobBoard.jobPostings[]` (`title`, `id`; construir URL pública se não vier no payload)
- `bamboohr`: lista `result[]` → `jobOpeningName`, `id`; construir URL de detalhe `https://{company}.bamboohr.com/careers/{id}/detail`; para ler a JD completa, fazer GET do detalhe e usar `result.jobOpening` (`jobOpeningName`, `description`, `datePosted`, `minimumExperience`, `compensation`, `jobOpeningShareUrl`)
- `lever`: array raiz `[]` → `text`, `hostedUrl` (fallback: `applyUrl`)
- `teamtailor`: RSS items → `title`, `link`
- `workday`: `jobPostings[]`/`jobPostings` (segundo tenant) → `title`, `externalPath` ou URL construída desde o host

### Nível 3 — WebSearch queries (DESCOBERTA AMPLA)

Os `search_queries` com filtros `site:` cobrem portais de forma transversal (todos os Ashby, todos os Greenhouse, etc.). Útil para descobrir empresas NOVAS que ainda não estão em `tracked_companies`, mas os resultados podem estar defasados.

**Prioridade de execução:**
1. Nível 1: Playwright → todas as `tracked_companies` com `careers_url`
2. Nível 2: API → todas as `tracked_companies` com `api:`
3. Nível 3: WebSearch → todos os `search_queries` com `enabled: true`

Os níveis são aditivos — executam todos, os resultados se misturam e deduplicam.

## Workflow

1. **Ler configuração**: `portals.yml`
2. **Ler histórico**: `data/scan-history.tsv` → URLs já vistas
3. **Ler fontes dedup**: `data/applications.md` + `data/pipeline.md`

4. **Nível 1 — Playwright scan** (paralelo em batches de 3-5):
   Para cada empresa em `tracked_companies` com `enabled: true` e `careers_url` definida:
   a. `browser_navigate` à `careers_url`
   b. `browser_snapshot` para ler todos os job listings
   c. Se a página tem filtros/departamentos, navegar as seções relevantes
   d. Para cada job listing extrair: `{title, url, company}`
   e. Se a página pagina resultados, navegar páginas adicionais
   f. Acumular em lista de candidatos
   g. Se `careers_url` falhar (404, redirect), tentar `scan_query` como fallback e anotar para atualizar a URL

5. **Nível 2 — ATS APIs / feeds** (paralelo):
   Para cada empresa em `tracked_companies` com `api:` definida e `enabled: true`:
   a. WebFetch da URL de API/feed
   b. Se `api_provider` estiver definido, usar seu parser; se não estiver definido, inferir por domínio (`boards-api.greenhouse.io`, `jobs.ashbyhq.com`, `api.lever.co`, `*.bamboohr.com`, `*.teamtailor.com`, `*.myworkdayjobs.com`)
   c. Para **Ashby**, enviar POST com:
      - `operationName: ApiJobBoardWithTeams`
      - `variables.organizationHostedJobsPageName: {company}`
      - query GraphQL de `jobBoardWithTeams` + `jobPostings { id title locationName employmentType compensationTierSummary }`
   d. Para **BambooHR**, a lista só traz metadados básicos. Para cada item relevante, ler `id`, fazer GET a `https://{company}.bamboohr.com/careers/{id}/detail`, e extrair a JD completa desde `result.jobOpening`. Usar `jobOpeningShareUrl` como URL pública se vier; se não, usar a URL de detalhe.
   e. Para **Workday**, enviar POST JSON com pelo menos `{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}` e paginar por `offset` até agotar resultados
   f. Para cada job extrair e normalizar: `{title, url, company}`
   g. Acumular em lista de candidatos (dedup com Nível 1)

6. **Nível 3 — WebSearch queries** (paralelo se possível):
   Para cada query em `search_queries` com `enabled: true`:
   a. Executar WebSearch com a `query` definida
   b. De cada resultado extrair: `{title, url, company}`
      - **title**: do título do resultado (antes do " @ " ou " | ")
      - **url**: URL do resultado
      - **company**: depois do " @ " no título, ou extrair do domínio/path
   c. Acumular em lista de candidatos (dedup com Nível 1+2)

6. **Filtrar por título** usando `title_filter` de `portals.yml`:
   - Pelo menos 1 keyword de `positive` deve aparecer no título (case-insensitive)
   - 0 keywords de `negative` devem aparecer
   - Keywords de `seniority_boost` dão prioridade mas não são obrigatórios

7. **Deduplicar** contra 3 fontes:
   - `scan-history.tsv` → URL exata já vista
   - `applications.md` → empresa + cargo normalizado já avaliado
   - `pipeline.md` → URL exata já em pendentes ou processadas

7.5. **Verificar liveness de resultados de WebSearch (Nível 3)** — ANTES de adicionar ao pipeline:

   Os resultados de WebSearch podem estar desatualizados (Google faz cache de resultados durante semanas ou meses). Para evitar avaliar vagas expiradas, verificar com Playwright cada URL nova que provenha do Nível 3. Os Níveis 1 e 2 são inerentemente em tempo real e não requerem esta verificação.

   Para cada URL nova do Nível 3 (sequencial — NUNCA Playwright em paralelo):
   a. `browser_navigate` à URL
   b. `browser_snapshot` para ler o conteúdo
   c. Classificar:
      - **Ativa**: título do posto visível + descrição do cargo + controle visível de Apply/Submit/Solicitar dentro do conteúdo principal. Não contar texto genérico de header/navbar/footer.
      - **Expirada** (qualquer um destes sinais):
        - URL final contém `?error=true` (Greenhouse redireciona assim quando a vaga está fechada)
        - Página contém: "job no longer available" / "no longer open" / "position has been filled" / "this job has expired" / "page not found"
        - Só navbar e footer visíveis, sem conteúdo JD (conteúdo < ~300 chars)
   d. Se expirada: registrar em `scan-history.tsv` com status `skipped_expired` e descartar
   e. Se ativa: continuar ao passo 8

   **Não interromper o scan inteiro se uma URL falhar.** Se `browser_navigate` der erro (timeout, 403, etc.), marcar como `skipped_expired` e continuar com a seguinte.

8. **Para cada vaga nova verificada que passe filtros**:
   a. Adicionar a `pipeline.md` seção "Pendentes": `- [ ] {url} | {company} | {title}`
   b. Registrar em `scan-history.tsv`: `{url}\t{date}\t{query_name}\t{title}\t{company}\tadded`

9. **Vagas filtradas por título**: registrar em `scan-history.tsv` com status `skipped_title`
10. **Vagas duplicadas**: registrar com status `skipped_dup`
11. **Vagas expiradas (Nível 3)**: registrar com status `skipped_expired`

## Extração de título e empresa de resultados WebSearch

Os resultados de WebSearch vêm em formato: `"Job Title @ Company"` ou `"Job Title | Company"` ou `"Job Title — Company"`.

Padrões de extração por portal:
- **Ashby**: `"Senior AI PM (Remote) @ EverAI"` → title: `Senior AI PM`, company: `EverAI`
- **Greenhouse**: `"AI Engineer at Anthropic"` → title: `AI Engineer`, company: `Anthropic`
- **Lever**: `"Product Manager - AI @ Temporal"` → title: `Product Manager - AI`, company: `Temporal`

Regex genérico: `(.+?)(?:\s*[@|—–-]\s*|\s+at\s+)(.+?)$`

## URLs privadas

Se encontrar uma URL não acessível publicamente:
1. Guardar a JD em `jds/{company}-{role-slug}.md`
2. Adicionar ao pipeline.md como: `- [ ] local:jds/{company}-{role-slug}.md | {company} | {title}`

## Scan History

`data/scan-history.tsv` rastreia TODAS as URLs vistas:

```
url	first_seen	portal	title	company	status
https://...	2026-02-10	Ashby — AI PM	PM AI	Acme	added
https://...	2026-02-10	Greenhouse — SA	Junior Dev	BigCo	skipped_title
https://...	2026-02-10	Ashby — AI PM	SA AI	OldCo	skipped_dup
https://...	2026-02-10	WebSearch — AI PM	PM AI	ClosedCo	skipped_expired
```

## Resumo de saída

```
Portal Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Queries executadas: N
Vagas encontradas: N total
Filtradas por título: N relevantes
Duplicadas: N (já avaliadas ou em pipeline)
Expiradas descartadas: N (links mortos, Nível 3)
Novas adicionadas a pipeline.md: N

  + {company} | {title} | {query_name}
  ...

→ Executa /career-ops pipeline para avaliar as novas vagas.
```

## Gestão de careers_url

Cada empresa em `tracked_companies` deve ter `careers_url` — a URL direta à página de vagas. Isso evita buscá-la cada vez.

**Padrões conhecidos por plataforma:**
- **Ashby:** `https://jobs.ashbyhq.com/{slug}`
- **Greenhouse:** `https://job-boards.greenhouse.io/{slug}` ou `https://job-boards.eu.greenhouse.io/{slug}`
- **Lever:** `https://jobs.lever.co/{slug}`
- **BambooHR:** lista `https://{company}.bamboohr.com/careers/list`; detalhe `https://{company}.bamboohr.com/careers/{id}/detail`
- **Teamtailor:** `https://{company}.teamtailor.com/jobs`
- **Workday:** `https://{company}.{shard}.myworkdayjobs.com/{site}`
- **Custom:** A URL própria da empresa (ex: `https://openai.com/careers`)

**Padrões de API/feed por plataforma:**
- **Ashby API:** `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **BambooHR API:** lista `https://{company}.bamboohr.com/careers/list`; detalhe `https://{company}.bamboohr.com/careers/{id}/detail` (`result.jobOpening`)
- **Lever API:** `https://api.lever.co/v0/postings/{company}?mode=json`
- **Teamtailor RSS:** `https://{company}.teamtailor.com/jobs.rss`
- **Workday API:** `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

**Se `careers_url` não existir** para uma empresa:
1. Tentar o padrão da plataforma conhecida dela
2. Se falhar, fazer um WebSearch rápido: `"{company}" careers jobs`
3. Navegar com Playwright para confirmar que funciona
4. **Guardar a URL encontrada em portals.yml** para futuros scans

**Se `careers_url` devolver 404 ou redirect:**
1. Anotar no resumo de saída
2. Tentar scan_query como fallback
3. Marcar para atualização manual

## Manutenção do portals.yml

- **SEMPRE guardar `careers_url`** quando se adiciona uma empresa nova
- Adicionar novos queries conforme se descubram portais ou cargos interessantes
- Desativar queries com `enabled: false` se gerarem muito ruído
- Ajustar keywords de filtrado conforme evoluam os cargos target
- Adicionar empresas a `tracked_companies` quando interessar segui-las de perto
- Verificar `careers_url` periodicamente — empresas mudam de plataforma ATS
