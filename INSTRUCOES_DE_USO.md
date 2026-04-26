---
title: Instruções de Uso — Skills /headhunter e família
type: user-guide
audience: usuário final (você)
language: pt-BR
last_updated: 2026-04-26
version: 1.1.0
changelog:
  - "1.1.0 (2026-04-26): adicionado routing-rules.md como SSOT de roteamento; expandidos triggers i18n (6 idiomas); tabela score↔match rate; cenários batch/headless; comportamento /headhunter sem argumento (fail-fast); gates éticos alinhados ao cutoff 4.0"
  - "1.0.0 (2026-04-26): versão inicial cobrindo 5 skills/comandos"
related:
  - .claude/references/routing-rules.md
  - .claude/skills/headhunter/SKILL.md
  - .claude/skills/career-ops/SKILL.md
  - .claude/commands/cv-analyze.md
  - .claude/commands/cv-strategy.md
  - .claude/commands/cv-recruiter-check.md
  - .claude/commands/tailor-cv.md
  - .claude/agents/vaga-analyst.md
  - .claude/agents/cv-strategist.md
  - .claude/agents/recruiter-reviewer.md
  - .claude/references/cv-playbook-2026.md
  - .claude/references/recruiter-lens.md
  - USAGE.md
  - CLAUDE.md
---

# Instruções de Uso — Skills `/headhunter` e família

> Este arquivo é o seu guia rápido para usar as skills criadas neste projeto, com exemplos concretos.
> Para o guia completo do Career-Ops (todas as skills antigas: scan, oferta, batch, etc.), veja [`USAGE.md`](USAGE.md).
> Este arquivo cobre **especificamente** as 5 skills/comandos novos que pensam como recrutador.

---

## Visão geral em 30 segundos

| Skill / comando | O que faz | Quando usar |
|-----------------|-----------|-------------|
| `/headhunter` | Pipeline completo: analisa vaga, monta estratégia, audita pelo recrutador, gera PDF | Você decidiu aplicar e quer o melhor CV possível |
| `/cv-analyze` | Só decodifica a vaga, sem gerar CV | Você ainda está decidindo se vale aplicar |
| `/cv-strategy` | Só monta a estratégia (a partir de um briefing que já existe) | Você quer iterar o blueprint sem refazer a análise |
| `/cv-recruiter-check` | Só audita um CV pronto contra uma vaga | Você fez o CV à mão e quer um filtro brutalmente honesto |
| `/tailor-cv` | Atalho/alias do `/headhunter` | Compatibilidade com o nome antigo |

Princípio comum: **realçar nunca inventar.** O sistema só reformula o conteúdo real do seu `cv.md`. Se a vaga pede skill que você não tem, ele admite o gap em vez de inventar.

---

## 1. `/headhunter` — Pipeline completo (uso principal)

### O que é

Skill auto-invocável que orquestra um time de 3 agents-assessores especializados. Pensa como o recrutador da vaga específica em vez de só fazer keyword matching contra a JD.

### Como invocar (caminho SSOT)

**`/headhunter <URL ou texto da JD>` é o caminho canônico (SSOT).** Cola pura de URL sem comando NÃO ativa `/headhunter` — vai pelo `/career-ops` auto-pipeline (que ao final sugere `/headhunter` se a vaga valer o investimento extra).

> **Regra completa de roteamento:** [`.claude/references/routing-rules.md`](.claude/references/routing-rules.md) tem precedência de triggers, frases de intenção em 6 idiomas (PT/EN/ES/FR/DE/JA), thresholds de score alinhados com cutoff ético (4.0 = mesmo limite que dispara recomendação positiva e sugestão de escalonar), mapeamento aproximado score (1-5) ↔ match rate (%), e tratamento por modo (single/batch/headless). Quando o que está aqui parecer divergir, o routing-rules.md vence — esta seção é só síntese.

**Forma 1 — Comando explícito com URL:**
```
/headhunter https://boards.greenhouse.io/anthropic/jobs/5234567
```

**Forma 2 — Comando explícito com texto colado:**
```
/headhunter
Senior Controller — Empresa X
São Paulo, Brasil

Responsibilities:
- Lead the monthly close cycle in 5 days
- IFRS and BR GAAP reconciliation
...
```

**Forma 3 — Frase de intenção explícita (multi-idioma).**

A skill aciona automaticamente quando o input contém uma frase de intenção declarando que você quer personalizar CV pra uma vaga específica. **A frase vence sobre URL** — mesmo se a frase vier acompanhada de URL, o roteamento vai pro `/headhunter` (não pro auto-pipeline). Idiomas suportados: PT/EN/ES/FR/DE/JA. Exemplos:

| Idioma | Frases que acionam |
|--------|--------------------|
| **Português** | "personaliza meu CV pra esta vaga", "ajusta meu currículo", "adapta meu CV", "customiza meu CV pra [empresa]", "gera CV pela ótica do recrutador", "modo recrutador" |
| **Inglês** | "tailor my CV/resume", "personalize my CV/resume", "customize my CV for this role", "recruiter-optimized CV", "headhunter mode" |
| **Espanhol** | "personaliza mi CV", "personaliza mi currículum", "adapta mi CV para esta vacante", "ajusta mi CV", "CV optimizado para reclutador" |
| **Francês** | "adapte mon CV", "personnalise mon CV", "ajuste mon CV", "CV optimisé pour le recruteur", "CV sur mesure" |
| **Alemão** | "passe meinen Lebenslauf an", "personalisiere meinen Lebenslauf", "Lebenslauf optimieren für die Stelle", "maßgeschneiderter Lebenslauf" |
| **Japonês** | "履歴書をカスタマイズ", "履歴書を求人に合わせて調整", "リクルーター視点で履歴書を最適化" |

**Heurística geral (para variantes não listadas):** verbo de personalização (ajustar/adaptar/customizar/personalizar/tailor/anpassen/adapter) + substantivo de CV (CV/currículo/resume/Lebenslauf/履歴書) + vaga (URL ou contexto declarado) = aciona `/headhunter`.

Exemplo prático com URL:
```
personaliza meu CV pra esta vaga: https://jobs.lever.co/empresa/abc-123
```
Isso aciona `/headhunter` (frase vence URL), não o auto-pipeline.

**Lista canônica completa:** [`.claude/references/routing-rules.md`](.claude/references/routing-rules.md) §2.

**O que NÃO ativa `/headhunter`:**
- Cola pura de URL sem comando ou frase de intenção (vai pro auto-pipeline padrão).
- Cola de texto de JD sem comando ou frase de intenção (mesmo com "Responsibilities/Requirements" presentes).
- Conversa genérica sobre carreira.

**Por quê:** evita roteamento ambíguo entre `/career-ops` auto-pipeline (avaliação A-G genérica) e `/headhunter` (personalização premium). Cada caminho tem trigger explícito; você decide qual rodar.

**Sem argumento → pausa e pergunta (NÃO trava).**

Se você digitar `/headhunter` sem nenhuma URL ou texto, a skill **não invoca o pipeline** com argumento vazio. Em vez disso, faz pausa e pergunta:

> "Para qual vaga? Cole a URL do anúncio ou o texto da JD."

Quando você responder, o pipeline recomeça a Fase 0 com o input novo. Garantia: o sistema nunca tenta processar sem saber qual vaga você está mirando.

### O que acontece (6 fases automáticas)

1. **Pré-flight** — verifica se `cv.md`, `modes/pdf.md`, `recruiter-lens.md` existem. Se faltar algo, para e avisa.
2. **Modelagem do recrutador** — identifica nível (manager/director/VP), família funcional (Controller/FP&A/Consolidation), indústria. Sintetiza em 3-5 linhas o filtro mental específico desta vaga.
3. **Análise da vaga** (subagent `vaga-analyst`) — extrai 15-25 keywords classificadas em P0/P1/P2, requisitos must/nice, perfil arquetípico do candidato buscado, gaps potenciais vs seu CV.
4. **Estratégia** (subagent `cv-strategist`) — produz blueprint: Summary reescrito, Core Competencies (6-8), reordenação de bullets, top projetos, mapa de match. Mostra "atual vs proposto" lado a lado para você validar honestidade.
5. **Crítica do recrutador** (subagent `recruiter-reviewer`) — simula scan de 6 segundos, audita fidelidade contra `cv.md` (qualquer invenção é bloqueador), retorna **GO / REVISE / STOP** com score 0-10.
6. **Geração do PDF** — usa o pipeline de `modes/pdf.md` com os outputs do blueprint. Salva em `output/cv-{seu-nome}-{empresa}-{data}.pdf`.

### Exemplo completo (entrada → saída)

**Você:**
```
/headhunter https://www.linkedin.com/jobs/view/3987654321
```

**Sistema (resumo final, 8-12 linhas):**
```
Vaga: Anthropic — Senior Financial Controller (San Francisco, Hybrid)
Match rate: 78% (alvo: ≥65%, ideal: 70-80%)

Top 3 destaques do CV personalizado:
- Summary reescrito com "IFRS-USGAAP reconciliation" + "5-day close cycle"
- Core Competencies grid agora cobre 7/8 requisitos must-have
- Cargo atual posicionado como "Senior Controller" (era "Gerente de Contabilidade")

Top 2 gaps reais:
- SOX compliance: você tem governança de controles internos mas não SOX
  formal. Mencionar no cover letter como "SOX-equivalent controls".
- Big4 background: ausente. Compensar destacando auditoria externa
  limpa por 5 anos consecutivos.

Beats para cover letter:
1. "Reduzi close cycle de 12 para 5 dias"
2. "Lidero 4-pessoas em ambiente multi-currency, multi-entity"
3. "BR GAAP + IFRS reconciliation cross-border"

PDF: output/cv-fernando-anthropic-2026-04-26.pdf
Recomendação: APLICAR. Score do recrutador: 7.5/10.
Razão: gaps são tratáveis no cover letter; tracking de carreira coerente.
```

### Onde os artefatos ficam salvos

```
output/tailor-runs/2026-04-26-anthropic/
├── 00-recruiter-framing.md      # filtro mental do recrutador
├── 00-summary.md                # relatório consolidado
├── 01-vaga-briefing.md          # briefing do vaga-analyst
├── 02-blueprint.md              # blueprint do cv-strategist
└── 03-recruiter-review.md       # crítica do recruiter-reviewer
output/cv-fernando-anthropic-2026-04-26.pdf
```

Você pode abrir qualquer um desses arquivos para auditar o raciocínio do sistema.

### Gates éticos (o sistema te protege)

**Tabela de thresholds por faixa de score** (alinhada com seção "Ethical Use" do `CLAUDE.md` — mesmo cutoff de 4.0 dispara recomendação positiva e sugestão de escalonar pra `/headhunter`; mexer num exige mexer no outro):

| Faixa de score (1-5) | Match rate aprox. (%) | Recomendação | Sugere `/headhunter`? |
|----------------------|----------------------|--------------|----------------------|
| **≥ 4.5** | 80-95% | Aplicar imediatamente — match forte | ✅ Recomendado |
| **4.0 – 4.4** | 65-79% | Vale aplicar — bom match | ✅ Recomendado |
| **3.5 – 3.9** | 55-64% | Aplicar só com razão específica | ❌ Não sugere |
| **3.0 – 3.4** | 45-54% | **NÃO aplicar** (cutoff ético) | ❌ Não sugere |
| **< 3.0** | < 45% | **Descartar** | ❌ Não sugere |

**Outros gates além do score:**

- **Veredicto STOP** do `recruiter-reviewer` → bloqueia geração até resolver. Geralmente significa que o blueprint tentou inventar algo.
- **Score do recruiter-reviewer < 5/10** → comunica honestamente que a candidatura é fraca, mesmo se gerar o PDF.
- **Conteúdo inventado** em qualquer ponto → marcado **CRITICAL**, exige correção.

**Tabela completa e canônica:** [`.claude/references/routing-rules.md`](.claude/references/routing-rules.md) §3 e §4.

---

## 2. `/cv-analyze` — Decodificar a vaga sem gerar CV

### O que é

Despacha **só** o `vaga-analyst` em modo isolado. Devolve briefing estruturado da vaga. Não gera CV, não monta estratégia, não roda o pipeline completo.

### Quando usar

- Você tem 5-10 vagas no radar e não quer rodar o pipeline completo em todas. Use `/cv-analyze` em cada uma para triar quais valem o tempo do `/headhunter`.
- Você está estudando o mercado: qual vocabulário aparece mais? Quais empresas pedem o quê?
- Você quer ver os gaps potenciais antes de decidir investir 30 minutos no `/headhunter`.

### Como invocar

```
/cv-analyze https://jobs.ashbyhq.com/empresa/posicao-financeiro
```

Ou:

```
/cv-analyze
[cole o texto da JD aqui]
```

### Exemplo de saída (briefing estruturado)

```markdown
# Análise de Vaga — Empresa X / FP&A Manager

## Snapshot
- Empresa: Empresa X (SaaS B2B, Series C)
- Título oficial: FP&A Manager
- Nível: manager (managing IC team)
- Modalidade: hybrid — São Paulo
- Stack/área: FP&A com foco em SaaS metrics

## Dor do negócio
Empresa em fase de pré-IPO precisa profissionalizar FP&A:
forecasting dinâmico, dashboards de board, scenario planning.
[explícito] "Build scalable FP&A function as we approach IPO".

## Top 5 keywords prioritárias (P0)
| # | Keyword | Categoria | Frequência JD |
|---|---------|-----------|---------------|
| 1 | Anaplan | hard skill | 4× |
| 2 | rolling forecast | hard skill | 3× |
| 3 | SaaS metrics (ARR, NRR, CAC) | industry | 3× |
| 4 | board reporting | soft skill+ | 2× |
| 5 | scenario modeling | hard skill | 2× |

## Gaps potenciais do candidato vs JD
| Gap | Status | Reframe sugerido |
|-----|--------|------------------|
| Anaplan | adjacente | Você usa Adaptive Insights — citar como "Anaplan-equivalent FP&A platform" |
| SaaS metrics | gap real | Não há nada em SaaS no cv.md. Não forçar. |

## Recomendação para o cv-strategist
- Match rate viável: ~62% (borderline)
- Gap de SaaS metrics é material — recomendo NÃO aplicar a menos
  que tenha exposição não documentada no cv.md.
```

### Onde fica salvo

`output/cv-analyses/2026-04-26-empresa-x.md`

---

## 3. `/cv-strategy` — Iterar o blueprint sem refazer análise

### O que é

Despacha **só** o `cv-strategist`, dado um briefing que já existe (de uma rodada anterior do `/cv-analyze` ou `/headhunter`).

### Quando usar

- Você gerou um CV ontem e quer testar uma estratégia diferente para a mesma vaga (ex: mudar o ângulo do Summary, priorizar projetos diferentes) sem refazer a análise.
- Você está testando hipóteses: "e se eu posicionasse mais como Controller do que como FP&A?".

### Como invocar

```
/cv-strategy output/tailor-runs/2026-04-26-anthropic/01-vaga-briefing.md
```

Ou cole o briefing direto:

```
/cv-strategy
[cole o briefing markdown aqui]
```

### Exemplo de saída (blueprint)

```markdown
# Blueprint de Personalização — Anthropic / Senior Controller

## Decisões macro
- Idioma: en
- Page size: letter (US)
- Comprimento alvo: 2 páginas
- Match rate estimado: 78%

## Professional Summary

### Atual (do cv.md)
"Experienced Controller with 12 years in financial reporting,
team management, and process improvement."

### Proposto (3-5 linhas, top 5 keywords)
"Senior Controller with 12 years building governance frameworks for
multi-entity organizations across Brazil and LATAM. Reduced monthly
close cycle from 12 to 5 days at last role. Led IFRS-BR GAAP
reconciliation and statutory reporting for 8 entities, R$2B revenue.
Now applying systems thinking to FinOps at scale."

## Core Competencies grid (6-8)
1. IFRS / USGAAP / BR GAAP Reconciliation
2. Multi-Entity Consolidation
3. SAP S/4HANA Implementation
4. SOX-Equivalent Internal Controls
5. Close Cycle Optimization
6. Audit Coordination (Big4 Externa)
7. Statutory Reporting (Brazil)

[continuação...]
```

### Onde fica salvo

`output/cv-strategies/2026-04-26-anthropic.md`

---

## 4. `/cv-recruiter-check` — Auditar um CV existente

### O que é

Despacha **só** o `recruiter-reviewer`. Audita um CV (PDF, markdown ou texto colado) contra uma vaga, simulando o filtro do recrutador. Não gera nem modifica o CV — só revisa.

### Quando usar

- Você editou um CV à mão (sem o `/headhunter`) e quer um filtro brutalmente honesto antes de submeter.
- Você gerou um CV no `/headhunter` há semanas e quer revalidar contra uma vaga similar nova.
- Você quer second opinion depois de rodar o `/headhunter` e ainda está em dúvida.

### Como invocar

```
/cv-recruiter-check output/cv-fernando-anthropic-2026-04-26.pdf https://url-da-vaga
```

Ou cole o CV em texto e a vaga depois:

```
/cv-recruiter-check
[cole o CV em texto aqui]
---
[cole o JD aqui]
```

### Exemplo de saída

```markdown
# Crítica de Recrutador — Anthropic / Senior Controller

## Veredicto
**REVISE**
Razão em 1 linha: Summary forte, mas primeiro bullet do cargo atual
é genérico demais para o nível.

## Score do match (0-10)
- Pattern recognition (3s): 3/3 (cargo, empresa, datas claros)
- Reading for detail (3s): 1/3 (primeiro bullet fraco)
- Profundidade: 3/4
- Total: 7/10

## Auditoria de fidelidade
| Item | Status | Comentário |
|------|--------|------------|
| Summary L2 métrica "5 dias" | [VERIFICADO] | Está em cv.md linha 15 |
| Bullet 1 cargo atual "ESG" | [INVENTADO] | **CRITICAL** — não há
  menção a ESG em cv.md. Remover ou substituir. |

## Top 3 problemas
1. **CRITICAL:** Bullet com "ESG reporting" inventado.
2. **HIGH:** Summary genérico no L1 ("Experienced controller") —
   substituir por título-alvo específico ("Senior Controller").
3. **MEDIUM:** Skills section não cita SAP versão (S/4HANA vs ECC).

## Recomendações finais
1. Remover bullet de ESG imediatamente (CRITICAL).
2. Reescrever L1 do Summary com título-alvo + número.
3. Especificar "SAP S/4HANA" em Skills.

Após correção, score esperado: 8.5/10. Pode submeter.
```

### Onde fica salvo

`output/cv-checks/2026-04-26-anthropic.md`

---

## 5. `/tailor-cv` — Alias do `/headhunter`

Existe só por compatibilidade. Faz exatamente a mesma coisa que `/headhunter`. Use o nome que preferir:

```
/tailor-cv https://url-da-vaga
```

É equivalente a:

```
/headhunter https://url-da-vaga
```

Se você está começando agora, prefira `/headhunter` (é o nome canônico, deixa explícito o ângulo de "pensar como recrutador").

---

## Os 3 agents por trás (referência rápida)

Cada agent é um especialista isolado. Você normalmente não invoca eles diretamente — o `/headhunter` ou os comandos `/cv-*` fazem isso por você. Mas saber o que cada um faz ajuda a interpretar os outputs.

### `vaga-analyst`

Decodifica vagas em três passes (escaneamento, requisitos, sinais implícitos), extrai keywords classificadas em P0/P1/P2, identifica a "dor do negócio" da vaga, desenha o perfil arquetípico buscado e antecipa gaps. Output: briefing estruturado.

### `cv-strategist`

Recebe o briefing + seu `cv.md` e produz o blueprint de personalização: Summary reescrito, Core Competencies grid, reordenação de bullets, seleção de projetos, mapa de match keyword-a-keyword. **Nunca inventa** — se a vaga pede algo que você não tem, admite o gap.

### `recruiter-reviewer`

Assume o papel do head-hunter da vaga e revisa criticamente. Simula scan de 6 segundos, audita fidelidade contra `cv.md` (qualquer skill ou métrica inventada é bloqueador), lista as 5 perguntas que faria na call, devolve veredicto **GO / REVISE / STOP** com score 0-10.

---

## As bases de conhecimento (o que torna o sistema sofisticado)

Os 3 agents consultam dois arquivos-chave no início de cada execução. Saber o que tem dentro deles ajuda você a **personalizar e melhorar** o sistema.

### `.claude/references/cv-playbook-2026.md`

Síntese de melhores práticas de fontes confiáveis: Harvard Mignone Center for Career Success, Harvard Business School Online, Jobscan, The Muse, ZipRecruiter (eye-tracking research), Columbia Career Education, Indeed, Coursera, Goodwill. Cobre: princípios não-negociáveis, filtros ATS e recrutador, fórmulas de bullet point (XYZ, STAR, CAR), estrutura de seções recomendada, comprimento ideal, professional summary perfeito, ética de keyword injection, checklist final.

**Quando atualizar:** quando uma fonte nova relevante aparecer, ou quando você descobrir prática que funcionou na sua experiência.

### `.claude/references/recruiter-lens.md`

Filtro mental do recrutador segmentado por nível (IC, manager, director, VP, C-level) e família funcional (Controller, Consolidation, FP&A, Financeiro genérico). Para cada segmento: vocabulário que ressoa, sinais de credibilidade visual, red flags específicos.

**Quando atualizar (importante):** sempre que você receber feedback real de recrutador. Por exemplo:
- "O head-hunter da empresa X reclamou que meu CV estava muito 'tech' para uma vaga de Controller tradicional" → adicione essa heurística no segmento Controller.
- "Recrutadora X comentou que adorou ter visto SAP S/4HANA explícito" → reforce a heurística de versionamento de ferramentas.

Pode pedir pra mim: "atualiza a recruiter-lens com este feedback que recebi: [...]". Eu edito o arquivo.

---

## Cenários de uso completos (end-to-end)

### Cenário A — Você acabou de receber URL de uma vaga interessante

```
1. Cole a URL: /headhunter https://url-da-vaga
2. Aguarde ~3-5 min (o sistema roda 6 fases automaticamente).
3. Leia o relatório consolidado no final.
4. Se a recomendação foi APLICAR: abra o PDF e revise.
5. Se a recomendação foi NÃO APLICAR: respeite. Use o tempo
   em melhor target.
6. Se aplicou, atualize o tracker manualmente (status: Applied).
```

### Cenário B — Você tem 8 vagas no inbox e precisa triar

```
1. Para cada vaga, rode /cv-analyze <URL>.
2. Compare os match rates dos briefings.
3. Identifique as top 3 com match ≥ 70%.
4. Rode /headhunter só nas top 3.
5. Submeta as melhores.
```

Isso economiza ~80% do tempo vs rodar `/headhunter` em todas.

### Cenário C — Você editou um CV manualmente e quer validar

```
1. Faça suas edições no CV (editor de PDF, Word, etc).
2. Exporte como PDF: meu-cv-empresa.pdf
3. Rode /cv-recruiter-check meu-cv-empresa.pdf https://url-da-vaga
4. Leia a auditoria de fidelidade.
5. Se aparecer [INVENTADO], CORRIJA antes de submeter
   (geralmente significa que você acidentalmente inflou algo).
6. Se veredicto for GO ou REVISE com fixes triviais, submeta.
```

### Cenário D — Você quer iterar a estratégia sem refazer análise

```
1. Você já rodou /headhunter na vaga X ontem.
2. O relatório está em output/tailor-runs/2026-04-25-empresaX/
3. Você quer testar um ângulo diferente (ex: posicionar como
   FP&A em vez de Controller).
4. Rode /cv-strategy output/tailor-runs/2026-04-25-empresaX/01-vaga-briefing.md
5. O cv-strategist gera blueprint alternativo.
6. Compare os dois blueprints e decida.
```

### Cenário E — Você roda batch de várias vagas via `/career-ops batch`

```
1. /career-ops batch processa N vagas em paralelo (auto-pipeline em cada).
2. NENHUMA das vagas dispara /headhunter individualmente —
   isso pouparia output do batch com nudges duplicados.
3. No relatório consolidado final, /career-ops batch agrega:
   "Vagas com score ≥ 4.0 que valem /headhunter:
    - #143 Anthropic — Senior AI PM (4.3/5)
    - #145 OpenAI — Staff Engineer (4.6/5)
    - #147 Temporal — Technical PM (4.1/5)"
4. Você decide caso a caso qual escalar pra /headhunter
   (rodando /headhunter <URL> em sessão interativa).
```

**Por que é assim:** evita poluir output de batch com N nudges idênticos. Você vê uma lista única ao final e prioriza você mesmo.

### Cenário F — Você roda em modo headless (`claude -p`)

```
1. Em pipe mode (claude -p), Playwright NÃO está disponível.
2. /headhunter requer Playwright para fetch de URLs e pode pedir
   confirmação interativa — ambos quebram em headless.
3. Auto-pipeline em headless usa WebFetch como fallback e marca
   relatórios com "Verification: unconfirmed (batch mode)".
4. Sugestão de /headhunter é SUPRIMIDA em headless. Substituída por:
   "Personalização premium: disponível via /headhunter em sessão
    interativa (não acessível em batch headless)".
5. Quando voltar à sessão interativa, abra o relatório do batch e
   rode /headhunter <URL> nas vagas que valeram a pena.
```

**Por que é assim:** evita sugerir comando que falharia no mesmo modo. O nudge só aparece quando é acionável.

---

## Resolução de problemas (FAQ)

### "Colei URL e foi pro auto-pipeline em vez do `/headhunter`"

**Comportamento esperado.** A partir da v1.1.0, cola pura de URL **NÃO** ativa `/headhunter` — vai pelo `/career-ops` auto-pipeline (avaliação A-G). Para forçar `/headhunter`, use uma das três formas explícitas:

1. Comando direto: `/headhunter <URL>`
2. Frase de intenção + URL: "personaliza meu CV pra esta vaga: <URL>"
3. Aceitar a sugestão automática: o auto-pipeline ao final sugere escalar pra `/headhunter` se score ≥ 4.0.

Por que mudou: a auto-invocação por URL pura criava roteamento ambíguo entre os dois caminhos. Versão atual exige intenção declarada.

### "Digitei `/headhunter` sem URL/JD e o sistema travou"

**Não trava.** A skill detecta argumento vazio na Fase 0 (Passo 0a) e pausa para perguntar:

> "Para qual vaga? Cole a URL do anúncio ou o texto da JD."

Quando você responder, o pipeline retoma. Se ainda assim parecer travado, é provável que o input tenha algo que confundiu o detector (URL sem `https://`, texto sem nenhum sinal de JD). Recomende: cole a URL completa ou texto com seções claras (Responsibilities, Requirements).

### "O sistema disse que match rate é < 65% e não recomendou aplicar"

Isso é proteção, não censura. Significa que o gap entre seu perfil e a vaga é grande o bastante para tornar a candidatura fraca. Você pode:
- **Respeitar a recomendação** (uso do seu tempo em melhor target).
- **Forçar mesmo assim** se tem razão estratégica não capturada (ex: contato interno na empresa). Diga "rode mesmo assim" e o sistema gera.

Cutoff ético: 4.0/5 (mesmo limite que dispara recomendação positiva). Score < 3.0 → descarte. Tabela completa em `.claude/references/routing-rules.md` §3.

### "Frase em outro idioma não acionou `/headhunter`"

Os triggers de frase de intenção cobrem PT/EN/ES/FR/DE/JA. Lista exaustiva está em `.claude/references/routing-rules.md` §2. Se uma variante sua não está coberta:

- Use comando explícito: `/headhunter <URL ou texto>`.
- Ou me peça: "adiciona '<sua frase>' como trigger de personalização" — eu atualizo a lista de frases na lens.

### "Em batch eu queria nudge per-vaga e tô vendo só a lista consolidada"

**Comportamento intencional.** Quando você roda `/career-ops batch` com N vagas, o sistema **não** mostra sugestão de `/headhunter` em cada relatório (poluiria com N nudges idênticos). Em vez disso, agrega no relatório final:

> "Vagas com score ≥ 4.0 que valem `/headhunter`: [lista]"

Você decide caso a caso quais escalar (rodando `/headhunter <URL>` em sessão interativa).

Em modo headless (`claude -p`), nem a lista consolidada disparra `/headhunter` — substituída por nota informativa, porque `/headhunter` requer Playwright que headless não tem.

### "O recruiter-reviewer marcou CRITICAL — conteúdo inventado"

Significa que em algum lugar do blueprint apareceu skill/métrica que não está no seu `cv.md`. Pode ter sido:
- Reframe que esticou demais a verdade.
- Erro de leitura do cv.md (raro).

Você tem duas opções:
- **Adicionar ao `cv.md`** se você realmente tem aquela experiência mas esqueceu de documentar (atualize o master, depois rode de novo).
- **Aceitar o gap** (deixar o sistema reescrever sem aquela skill).

Nunca force o sistema a manter conteúdo inventado. O CV vai ser lido por humanos que fazem entrevista — eles vão pegar.

### "Quero atualizar a `recruiter-lens.md` com feedback que recebi"

Diga pra mim: "atualiza a recruiter-lens com este feedback: [colei o que o recrutador falou]". Eu interpreto e edito o arquivo, marcando a fonte. Próxima execução do `/headhunter` já usa o feedback novo.

### "Quero mexer na regra de roteamento (thresholds, frases, modos)"

A regra **canônica** vive em `.claude/references/routing-rules.md`. Editar lá propaga pra todos os 5 arquivos que apontam pra ela (CLAUDE.md, AGENTS.md, SKILL.md do headhunter, modes/auto-pipeline.md, este arquivo). Diga pra mim: "altera a regra de roteamento: [o que]". Eu edito o SSOT e atualizo as referências.

### "Quero adicionar um comando granular novo"

Diga: "cria um comando `/cv-X` que faz Y". Eu crio o wrapper em `.claude/commands/`, despachando o agent correto, com frontmatter completo no padrão profissional.

---

## Onde tudo isso vive (mapa de arquivos)

```
D:/Career Ops/
├── INSTRUCOES_DE_USO.md           # ESTE ARQUIVO
├── USAGE.md                        # guia das skills antigas (career-ops)
├── CLAUDE.md / AGENTS.md          # instruções para agents IA
├── README.md                       # apresentação pública
├── PROJECT_CONTEXT.md             # entrypoint rápido
├── DATA_CONTRACT.md                # user layer vs system layer
├── cv.md                           # SEU CV master (fonte de verdade)
├── modes/pdf.md                    # pipeline de geração de PDF (compartilhado)
└── .claude/
    ├── skills/
    │   ├── career-ops/SKILL.md    # roteador antigo
    │   └── headhunter/SKILL.md    # ★ skill principal
    ├── agents/
    │   ├── vaga-analyst.md         # decodifica vagas
    │   ├── cv-strategist.md        # monta blueprint
    │   └── recruiter-reviewer.md   # audita pelo recrutador
    ├── commands/
    │   ├── cv-analyze.md           # /cv-analyze
    │   ├── cv-strategy.md          # /cv-strategy
    │   ├── cv-recruiter-check.md   # /cv-recruiter-check
    │   └── tailor-cv.md            # alias /tailor-cv
    ├── references/
    │   ├── routing-rules.md        # ★ SSOT — regra canônica /career-ops vs /headhunter
    │   ├── cv-playbook-2026.md     # melhores práticas globais
    │   └── recruiter-lens.md       # filtro mental do recrutador
    ├── rules/                      # regras de projeto com globs
    └── designs/
        └── headhunter-design-2026-04-26.md  # design doc da Fase 1
```

---

## Próximos passos sugeridos

1. **Use o sistema em uma vaga real** de Controller, Consolidation ou FP&A (suas famílias-alvo). Idealmente uma que você esteja em dúvida se aplica.
2. **Avalie honestamente** o que funcionou e o que ficou raso. Anote.
3. **Volte aqui e me diga** os 2 sinais: (a) onde a `recruiter-lens` foi rasa ou inadequada para o tipo de recrutador específico, (b) onde o `recruiter-reviewer` foi muito severo ou muito frouxo. Esses dois sinais alimentam a Fase 2 do roadmap.

A Fase 2 (recruiter-driven completo) inverte a ordem mental do pipeline e introduz "scan score" como métrica nova. Hoje a `recruiter-lens` é consultada como contexto adicional; na Fase 2 ela conduz todo o fluxo. Mas vale fazer a Fase 1 viver no mundo real antes de partir pra refatorar.

---

**Última atualização:** 2026-04-26
**Versão:** 1.1.0
**Mantido por:** o usuário deste projeto + o agente IA assistente

**Changelog:**
- **1.1.0 (2026-04-26):** adicionado `routing-rules.md` como SSOT canônico de roteamento; expandidos triggers em 6 idiomas (PT/EN/ES/FR/DE/JA) com tabela exemplos; tabela de gates éticos alinhada ao cutoff 4.0 (`CLAUDE.md` "Ethical Use") com mapeamento score↔match rate; cenários E (batch consolidado) e F (headless) adicionados; documentado comportamento `/headhunter` sem argumento (fail-fast com pausa+pergunta); FAQ atualizado com 3 entradas novas (URL pura → auto-pipeline, sem argumento, regra i18n).
- **1.0.0 (2026-04-26):** versão inicial cobrindo as 5 skills/comandos novos (/headhunter, /cv-analyze, /cv-strategy, /cv-recruiter-check, /tailor-cv) com 4 cenários end-to-end e 5 entradas de FAQ.
