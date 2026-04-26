# Modo: auto-pipeline — Pipeline Completo Automático

Quando o usuário cola uma JD (texto ou URL) sem sub-comando explícito, executar TODO o pipeline em sequência:

## Passo 0 — Extrair JD

Se o input é uma **URL** (não texto de JD colado), seguir esta estratégia para extrair o conteúdo:

**Ordem de prioridade:**

1. **Playwright (preferido):** A maioria dos portais de emprego (Lever, Ashby, Greenhouse, Workday) são SPAs. Usar `browser_navigate` + `browser_snapshot` para renderizar e ler a JD.
2. **WebFetch (fallback):** Para páginas estáticas (ZipRecruiter, WeLoveProduct, páginas de carreiras de empresas).
3. **WebSearch (último recurso):** Buscar título do cargo + empresa em portais secundários que indexam a JD em HTML estático.

**Se nenhum método funcionar:** Pedir ao candidato que cole a JD manualmente ou compartilhe um screenshot.

**Se o input é texto de JD** (não URL): usar diretamente, sem necessidade de fetch.

## Passo 1 — Avaliação A-G

Executar exatamente igual ao modo `oferta` (ler `modes/oferta.md` para todos os blocos A-F + Bloco G Legitimidade da Vaga).

## Passo 2 — Salvar Relatório .md

Salvar a avaliação completa em `reports/{###}-{company-slug}-{YYYY-MM-DD}.md` (ver formato em `modes/oferta.md`).
Incluir Bloco G no relatório salvo. Adicionar `**Legitimidade:** {nível}` no cabeçalho do relatório.

## Passo 3 — Gerar PDF

Executar o pipeline completo de `pdf` (ler `modes/pdf.md`).

## Passo 4 — Rascunho de Respostas da Aplicação (só se score >= 4.5)

Se o score final é >= 4.5, gerar rascunho de respostas para o formulário de candidatura:

1. **Extrair perguntas do formulário**: Usar Playwright para navegar ao formulário e fazer snapshot. Se não puder extrair, usar as perguntas genéricas.
2. **Gerar respostas** seguindo o tom (ver abaixo).
3. **Salvar no relatório** como seção `## H) Rascunho de Respostas da Aplicação`.

### Perguntas genéricas (usar se não puder extrair do formulário)

- Why are you interested in this role?
- Why do you want to work at [Company]?
- Tell us about a relevant project or achievement
- What makes you a good fit for this position?
- How did you hear about this role?

### Tom para Respostas de Formulário

**Posição: "I'm choosing you."** o candidato tem opções e está escolhendo esta empresa por razões concretas.

**Regras de tom:**
- **Confiante sem arrogância**: "I've spent the past year building production AI agent systems — your role is where I want to apply that experience next"
- **Seletivo sem soberba**: "I've been intentional about finding a team where I can contribute meaningfully from day one"
- **Específico e concreto**: Sempre referenciar algo REAL da JD ou da empresa, e algo REAL da experiência do candidato
- **Direto, sem fluff**: 2-4 frases por resposta. Sem "I'm passionate about..." nem "I would love the opportunity to..."
- **O gancho é a prova, não a afirmação**: Em vez de "I'm great at X", dizer "I built X that does Y"

**Framework por pergunta:**
- **Why this role?** → "Your [specific thing] maps directly to [specific thing I built]."
- **Why this company?** → Mencionar algo concreto sobre a empresa. "I've been using [product] for [time/purpose]."
- **Relevant experience?** → Um proof point quantificado. "Built [X] that [metric]. Sold the company in 2025."
- **Good fit?** → "I sit at the intersection of [A] and [B], which is exactly where this role lives."
- **How did you hear?** → Honesto: "Found through [portal/scan], evaluated against my criteria, and it scored highest."

**Idioma**: Sempre no idioma da JD (EN como padrão). Aplicar `/tech-translate`.

## Passo 5 — Atualizar Tracker

Registrar em `data/applications.md` com todas as colunas incluindo Report e PDF em ✅.

**Se algum passo falhar**, continuar com os seguintes e marcar o passo falhado como pendente no tracker.

## Passo 6 — Sugerir escalonamento para /headhunter (se aplicável)

> **SSOT canônico:** a regra completa de roteamento, thresholds de score, mapeamento score↔match rate e tratamento por modo vivem em [`.claude/references/routing-rules.md`](../.claude/references/routing-rules.md). Este passo executa as regras de lá; **se houver divergência, routing-rules.md vence.**

Após completar os Passos 1-5, consultar `routing-rules.md` §3 (thresholds) e §5 (modos de execução):

### Resumo executável (referência rápida)

**Por faixa de score** (alinhado com cutoff ético em `CLAUDE.md` seção "Ethical Use" — ver routing-rules.md §3 para tabela completa):

- **Score ≥ 4.0:** ao apresentar o resumo final, incluir sugestão:
  > "Score alto ({X}/5). Quer um CV hiper-personalizado pela ótica do recrutador desta vaga? Rode `/headhunter {URL ou texto da JD}` — pipeline premium com 3 agents (modelagem do recrutador, análise + estratégia + auditoria de fidelidade)."
- **Score 3.0 – 3.9:** NÃO sugerir escalação. Faixa borderline; CV padrão é suficiente, vaga é incerta. Recomendação: aplicar só com razão específica.
- **Score < 3.0:** NÃO sugerir escalação. Recomendação ética é **não aplicar** — ver `CLAUDE.md` seção "Ethical Use" (mesmo cutoff de 4.0 que aciona a sugestão acima; mexer num exige mexer no outro).

**Por modo de execução** (ver routing-rules.md §5 para detalhes):

- **Modo single (interativo):** comportamento default acima.
- **Modo batch (`/career-ops batch`):** NÃO sugerir per-vaga. O orquestrador batch agrega no relatório final um bloco único: "Vagas com score ≥ 4.0 que valem `/headhunter`: [lista]". Evita poluir output com N nudges duplicados.
- **Modo headless (`claude -p`):** NÃO sugerir. `/headhunter` requer Playwright interativo (Passo 0d da skill) que headless não tem. Substituir por nota: `**Personalização premium:** disponível via /headhunter em sessão interativa`.

**Por que existe esta sugestão:** `/headhunter <URL>` é o caminho SSOT para personalização premium (ver `routing-rules.md` §1, trigger #1). O auto-pipeline aqui faz a avaliação A-G genérica (caminho rápido, default da §1 trigger #5). Quando a vaga vale o investimento extra (score alto), o usuário ganha um nudge claro para o caminho canônico — sem ambiguidade de roteamento.

**Onde isto se conecta:** o pipeline `/headhunter` reaproveita `modes/pdf.md` na Fase 5. O CV gerado pelo auto-pipeline (Passo 3 acima) e o CV gerado pelo `/headhunter` compartilham a mesma base visual e ATS — a diferença é a camada de modelagem do recrutador (filtro mental + auditoria de fidelidade) que `/headhunter` adiciona antes de invocar `pdf.md`.
