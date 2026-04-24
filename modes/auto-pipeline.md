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
