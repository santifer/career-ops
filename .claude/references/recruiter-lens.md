---
title: Lente do Recrutador — Filtro mental por nível e família funcional
type: reference
purpose: Complementa cv-playbook-2026.md com o filtro mental específico do recrutador segmentado por nível (IC, manager, director, VP, C-level) e família funcional (Controller, Consolidation, FP&A, Financeiro). Cada agent dos 3 do time consulta este arquivo no prompt inicial para que decisões de personalização sejam tomadas pela ótica do recrutador.
target_roles:
  primary:
    - Head of Accounting and Controlling (canônico)
    - Head of Accounting / Controladoria
    - Controller (Financial / Regional / LATAM / Corporate / Business)
    - Head de Consolidação / Gerente de Consolidação
  # Anti-target: NUNCA "Director" / "Diretor" como cargo-alvo (restringe busca).
  # Exceções permitidas: Audit Director, Tax Director, Post-Integration Director (especialistas).
  secondary:
    - Head/Gerente de FP&A
    - Head/Gerente Financeiro
last_updated: 2026-04-26
version: 1.1.0
consumed_by:
  - .claude/skills/headhunter/SKILL.md
  - .claude/agents/vaga-analyst.md
  - .claude/agents/cv-strategist.md
  - .claude/agents/recruiter-reviewer.md
  - .claude/commands/cv-analyze.md
  - .claude/commands/cv-strategy.md
  - .claude/commands/cv-recruiter-check.md
related:
  - .claude/references/cv-playbook-2026.md
  - config/profile.yml
  - modes/_profile.md
---

# Lente do Recrutador — Como recrutadores filtram CVs

> Complementa `cv-playbook-2026.md`. Aqui está o **filtro mental do recrutador**: o que ele busca em 3 segundos, o que dispara descarte automático, e como o filtro varia por nível e família funcional.
> Os agents `vaga-analyst`, `cv-strategist` e `recruiter-reviewer` consultam este arquivo no prompt inicial para que toda decisão de personalização seja tomada **pelos olhos do recrutador**, não pelos olhos da JD.

## Princípio operacional

O recrutador **não é um cobrador de checklist**. Ele faz **pattern matching** com um modelo mental do "candidato ideal" da vaga, formado por (a) experiência cumulativa em vagas semelhantes, (b) briefing do hiring manager, (c) cultura da empresa. Sua decisão em 6 segundos é: **este CV se parece com candidatos que avançaram em vagas como esta?**.

Implicação: cobrir a JD não basta. O CV precisa **se parecer** com o que recrutadores daquela família funcional/nível esperam ver. Há padrões visuais, narrativos e de sequência que sinalizam credibilidade antes do conteúdo ser lido.

## Os 3 sinais de tracking (3 segundos)

Recrutadores buscam, no padrão F (varredura horizontal no topo + vertical pela margem esquerda):

1. **Direção** — a sequência de cargos progride coerentemente? Não é "marketer → engenheiro → product manager → marketer" sem narrativa.
2. **Velocidade** — promoções ou mudanças com peso aconteceram em ritmo razoável? IC sênior leva 5–8 anos, manager mais 3–5, director mais 4–7. Velocidade alta demais (3 anos pra director sem contexto) ou lenta demais (15 anos no mesmo cargo) levanta bandeira.
3. **Escopo crescente** — cada cargo deve ter mais responsabilidade que o anterior. Headcount, P&L, geografia, complexidade. O número aumenta no tempo.

Se os 3 sinais são lidos rapidamente nos títulos+empresas+datas, o recrutador entra na Fase 2 (leitura). Se não, descarte.

## Patterns de descarte automático (smell test)

Sinais que disparam descarte sem leitura profunda:

- **Gap inexplicado** > 6 meses sem narrativa (sabático, formação, busca ativa).
- **Job hopping** sem padrão (4 empresas em 4 anos, todas similares, sem promoção). Tolerado em consultoria/Big4 ou startups; suspeito em corporate.
- **Cargo-alvo inexistente no histórico recente.** Vaga é Controller; CV mostra contadora pleno + 3 anos sem atualização. Provável overreach.
- **Métricas vagas** — "improved efficiency", "led key initiatives" sem número. Lê como inflado.
- **Empresa anônima** sem descritor. "Worked at Acme Corp" — quê tipo, tamanho, indústria?
- **Buzzwords sem prova.** "Strategic thinker", "passionate leader", "results-driven" — som de currículo template.
- **Soft skills isoladas em lista** — "communication, leadership, teamwork" sem contexto. Mata credibilidade sênior.
- **Idioma errado pra vaga.** CV em português pra vaga clara em inglês = recrutador internacional descarta.
- **Tipografia inconsistente** ou layout multi-coluna quebrando ATS = sinal de descuido com craft.
- **Foto inadequada** pra mercado (foto em mercado que não usa: EUA, UK, Canadá, Austrália, partes da Europa).

## Filtro por nível

### IC (Individual Contributor) — pleno e sênior

**O recrutador busca:** profundidade técnica + ferramentas hands-on + impacto mensurável em projetos. Quer ver código, dashboards, modelos, fluxos — o que a pessoa **fez com as mãos**.

**Dispara confiança:**
- Stack/ferramentas explícitas com versão (ex.: "SAP S/4HANA, Excel avançado com Power Query, Tableau").
- Métricas de delivery em projetos (ex.: "reduzi tempo de fechamento de 12 para 5 dias").
- Certificações relevantes (CFA L2, CPA, CRC ativo).

**Dispara dúvida:**
- Excesso de "led", "managed" sem hands-on.
- Ausência total de ferramentas no Skills section.
- Métricas só de equipe, nunca individuais.

### Manager / Coordenador

**O recrutador busca:** transição IC→gestão evidente + tamanho de equipe + sinais de tração organizacional. A pergunta é "será que essa pessoa consegue fazer outros entregarem?".

**Dispara confiança:**
- "Managed team of N" com N específico (5, 12, 30).
- Mix de delivery próprio e delivery do time (com diferenciação).
- Sinais de processo (implementou rituais, redesenhou fluxos, contratou X pessoas).

**Dispara dúvida:**
- Cargo "manager" mas bullets idênticos a IC.
- Sem menção a headcount, contratação ou desenvolvimento de pessoas.
- "Mentored junior team members" — fraco demais pra cargo de gestão real.

### Director / Senior Manager

**O recrutador busca:** escopo cross-functional + P&L ou orçamento + influência sobre decisões da empresa. A pergunta é "essa pessoa joga no nível tático-estratégico?".

**Dispara confiança:**
- "Owned $X budget" / "managed $X P&L" / "delivered X% of company revenue".
- Liderou transformação, M&A, expansão geográfica, mudança de stack/ERP.
- Reporta a CFO/CEO/COO.

**Dispara dúvida:**
- Cargo "director" mas escopo de manager.
- Sem números financeiros (orçamento, custo, receita).
- Bullets de execução tática, sem decisões estratégicas.

### VP / C-level / Head

**O recrutador busca:** business case storytelling + reputação de mercado + capacidade de mover a empresa de A pra B. A pergunta é "essa pessoa traz uma resposta pra dor do CEO/board?".

**Dispara confiança:**
- Career Highlights/Selected Achievements no topo.
- Resultados em escala (M, MM, % market share).
- Board reporting, investor decks, exits, IPOs, transformações declaradas.
- Network/awards/publicações como capital simbólico.

**Dispara dúvida:**
- CV de C-level com formato de IC (cronológico simples, sem highlights, sem differenciador).
- Sem business case na primeira página.
- Vocabulário tático em vez de estratégico.

## Filtro por família funcional (cargos-alvo do usuário)

Esta seção é a mais valiosa porque o filtro mental varia drasticamente por área. Os agents devem identificar a família funcional da vaga antes de personalizar.

### Controller / Controladoria

**Recrutador busca:** rigor de fechamento + compliance regulatório + governança financeira + comando de ERP.

**Vocabulário que ressoa:**
- "Fechamento mensal/trimestral/anual em D+X dias", "redução do close cycle de Y para Z dias".
- "IFRS, USGAAP, BR GAAP, IFRS 16, IFRS 9, IFRS 15".
- "SOX compliance", "controles internos COSO", "auditoria externa limpa por X anos".
- "SAP S/4HANA, Oracle, Totvs Protheus, Microsiga, RM" — versão exata.
- "CRC ativo", "CPA", "Big4 background" se houver.
- "Consolidação multi-entity", "intercompany reconciliation", "transfer pricing".

**Sinais de credibilidade visual:**
- Skills section com seção dedicada "ERPs / Systems".
- Certificações destacadas (CRC, CPA, CFA, MBA Controladoria).
- Bullets quantificados em D+X (dias após fechamento), R$ MM, headcount supervisionado.

**Red flags pra Controller:**
- Excesso de "growth", "go-to-market", "customer acquisition" — som de FP&A/Revenue, não Controller.
- Ausência de menção a auditoria, compliance, ERP.
- "CRC inativo" ou ausente quando o nível exige.
- Métricas só de receita/margem sem mencionar accuracy, timing, controles.

### Consolidation / Consolidação Internacional

**Recrutador busca:** experiência em multi-entity + multi-currency + multi-GAAP + ferramentas de consolidação (Hyperion HFM, Tagetik, OneStream, Cognos Controller, BPC).

**Vocabulário que ressoa:**
- "Consolidação de N entidades em M países" com números específicos.
- "Conversão cambial CTA/FX impact".
- "Eliminations, intercompany, minority interest, equity method".
- "Hyperion HFM / Tagetik / OneStream / SAP BPC / Cognos Controller" — citar a ferramenta exata.
- "GAAP differences reconciliation IFRS ↔ USGAAP / IFRS ↔ BR GAAP".
- "Statutory reporting, regulatory filings".

**Sinais de credibilidade visual:**
- Project highlight "implementação Hyperion / Tagetik / OneStream".
- Mapa geográfico explícito ("operações em LatAm, EMEA, APAC").
- Métricas de redução de tempo de consolidação.

**Red flags:**
- Cargo "Consolidação" mas só menção a uma entidade local.
- Sem menção à ferramenta de consolidação.
- Sem menção a multi-GAAP.

### FP&A / Financeiro Estratégico

**Recrutador busca:** business partnering + modelagem dinâmica + storytelling para executivos + scenario planning + KPI design.

**Vocabulário que ressoa:**
- "Budgeting, forecasting, rolling forecast".
- "Variance analysis, plan vs actual, walk-the-bridge".
- "Scenario modeling, sensitivity analysis, what-if".
- "Anaplan, Adaptive Insights, Vena, Pigment, Workday Adaptive" — ferramenta moderna.
- Excel **avançado** explícito (Power Query, Power Pivot, dashboards dinâmicos, VBA quando relevante).
- "Business partnering com VP/SVP de Sales, Operations, Marketing".
- "Decks pra board / executive committee".

**Sinais de credibilidade visual:**
- Bullets que conectam análise → recomendação → decisão tomada → resultado.
- Menção a stakeholders sêniores específicos.
- Tools modernas + Excel reforçado.

**Red flags:**
- Excesso de fechamento, accuracy, controles — som de Controller, não FP&A.
- Bullets só de "produzi relatórios" sem influência em decisões.
- Sem menção a Excel avançado ou ferramenta FP&A moderna.
- Sem business partnering visível.

### Financeiro genérico (Tesouraria, Custos, Análise)

**Recrutador busca:** especialização clara dentro do guarda-chuva.
- Tesouraria: cash flow, hedge, derivativos, gestão de liquidez, banking relationships.
- Custos: standard cost, ABC, custos por produto/SKU, rateio, análise de margem.
- Análise: BI, dashboards, queries SQL, automação de relatório.

Personalizar a lente conforme o subdomínio que a JD enfatize.

## Filtro por indústria (camada secundária)

Secundário ao nível e família funcional, mas importante:

- **Tech / SaaS** — busca métricas SaaS (ARR, MRR, NRR, GRR, CAC, LTV, CAC payback, burn rate, runway). Linguagem em inglês comum mesmo em vagas no Brasil.
- **Fintech** — KYC, AML, compliance bancário, regulatório (Bacen, CVM, SEC). Velocidade de scale-up.
- **Indústria / Manufatura** — custo de produção, eficiência operacional, supply chain finance, consolidação de plantas.
- **Varejo / E-commerce** — same-store sales, conversão, ticket médio, estoque, GMV.
- **Consultoria (Big4, MBB)** — projetos diversos, exposure a múltiplos clientes, cargos com nomes próprios (Senior Associate, Manager, Senior Manager, Partner).
- **Family office / Private equity** — IRR, MOIC, due diligence, valuation, deal track record.

## Como modelar o recrutador específico (quando há sinal)

Se a vaga vier com sinais explícitos do recrutador (LinkedIn da pessoa, descrição "About us" detalhada, perfil do hiring manager mencionado), incorpore:

1. **Identifique o recrutador.** Nome, tempo na empresa, vagas anteriores que preencheu, perfil próprio.
2. **Veja o padrão.** Recrutador externo (agência) vs interno (TA da empresa). Internos conhecem cultura; externos enfocam fit técnico.
3. **Hiring manager visível?** Se sim, qual o background dele/dela? CFO ex-Big4 → busca rigor de Big4. CFO ex-startup → busca scrappiness e velocidade.
4. **"About us" sinaliza cultura?** "Move fast" vs "build with care" vs "data-driven" — vocabulário do candidato deve casar.

Quando não há sinal, use o arquétipo de indústria/nível como default e marque `[hipótese]`.

## Aplicação prática nos 3 agents

**`vaga-analyst`** consulta esta lente para:
- Identificar a família funcional e o nível.
- Sintetizar o perfil arquetípico buscado em 1-2 frases que **soam como o recrutador pensa**, não como a JD escreve.
- Antecipar disqualifiers específicos da família funcional.

**`cv-strategist`** consulta esta lente para:
- Escolher vocabulário do Summary baseado no que o recrutador da família funcional ressona com.
- Priorizar Core Competencies pelo modelo mental, não só pela frequência na JD.
- Reordenar bullets pra que o **smell test do recrutador** seja superado nos primeiros 3 segundos.

**`recruiter-reviewer`** consulta esta lente para:
- Simular o filtro mental específico da vaga, não um recrutador genérico.
- Aplicar os patterns de descarte automático apropriados ao nível e família.
- Avaliar se o CV "se parece" com candidatos que tipicamente avançam em vagas como esta.

## Limitações deste documento

- Heurísticas são padrões observados, não regras universais. Alguns recrutadores quebram o padrão.
- A segmentação por família funcional reflete o mercado brasileiro/LatAm + multinacionais. Para mercados muito específicos (Japão, países nórdicos), pode haver desvios.
- Atualizar este documento quando o usuário trouxer feedback de vagas reais ("o recrutador da empresa X reclamou de Y" ou "elogiou Z").

## Fontes

Síntese baseada em:
- `cv-playbook-2026.md` (mesmo diretório).
- Conversas com recrutadores executivos de Big4 e RH corporativo (mercado brasileiro).
- Práticas observadas em job descriptions reais de Controller, FP&A e Consolidation publicadas em Greenhouse, Lever, Ashby e Workday entre 2024 e 2026.
- Material da Robert Half e PageGroup sobre filtros de recrutamento financeiro.

Quando atualizar:
1. Quando o usuário receber feedback explícito de recrutador.
2. Quando uma vaga real revelar uma heurística não capturada aqui.
3. Quando o usuário mudar de família funcional alvo.
