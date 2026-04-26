---
name: headhunter
description: Gera CV hiper-personalizado para vaga específica, orquestrando 3 agents (vaga-analyst, cv-strategist, recruiter-reviewer) com perspectiva de recrutador, sem inventar conteúdo. **Caminho SSOT (canônico):** comando explícito `/headhunter <URL ou JD>`. Também aciona em frases de intenção de personalização em PT/EN/ES/FR/DE/JA — exemplos: "personaliza/ajusta/adapta/customiza meu CV/currículo", "tailor/personalize my CV/resume", "personaliza mi CV/currículum", "adapte mon CV", "passe meinen Lebenslauf an", "履歴書をカスタマイズ" (lista completa em `.claude/references/routing-rules.md` §2). **NÃO aciona** em cola de URL pura sem comando — esse caminho vai pelo `/career-ops` auto-pipeline (avaliação A-G), que sugere escalonar pra `/headhunter` se score ≥ 4.0. Regra completa de roteamento, precedência de triggers, thresholds e tratamento por modo: ver `.claude/references/routing-rules.md` (SSOT).
user_invocable: true
args: input
argument-hint: "<URL da vaga | texto colado da JD>"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Agent, WebFetch
version: 1.1.0
last_updated: 2026-04-26
related:
  - .claude/agents/vaga-analyst.md
  - .claude/agents/cv-strategist.md
  - .claude/agents/recruiter-reviewer.md
  - .claude/references/cv-playbook-2026.md
  - .claude/references/recruiter-lens.md
---

# /headhunter — CV hiper-personalizado pela ótica do recrutador

Você está orquestrando o time de assessores de carreira do Career-Ops. O usuário entregou uma vaga (URL ou texto) e quer um CV ATS-otimizado, fiel ao `cv.md`, que maximize chances no processo seletivo específico **pensando como o recrutador da vaga**.

## Argumento recebido
$ARGUMENTS

## Princípio fundamental (NÃO NEGOCIÁVEL)

Você só **realça e reorganiza** o que já existe em `cv.md`, `article-digest.md` e `modes/_profile.md`. **NUNCA** adiciona skill, ferramenta, certificação ou métrica que não esteja documentada. Se a vaga pede algo que o candidato não tem, você admite o gap — não inventa.

## O reframe — Recruiter-first

Diferença vs `/tailor-cv` antigo: aqui o **filtro mental do recrutador** é injetado no início, antes da análise da JD começar. Os 3 agents recebem esse contexto adicional e respondem à pergunta "o recrutador desta vaga compraria isto em 6s?" em vez de só "isto cobre a JD?".

## Pipeline obrigatório

### Fase 0 — Pré-flight

**Passo 0a — Validação do argumento (FAIL-FAST):**
Verifique `$ARGUMENTS`. Se estiver vazio ou não contiver URL identificável (http/https) nem texto reconhecível de JD (com pelo menos um dos sinais "Responsibilities", "Requirements", "Qualifications", "Sobre a vaga", "About the role", ou similar em outro idioma):
- **PARE** o pipeline imediatamente.
- Pergunte ao usuário via prompt direto: *"Para qual vaga? Cole a URL do anúncio ou o texto da JD."*
- Não invente vaga. Não rode pipeline com argumento ausente.
- Quando o usuário responder, recomece a Fase 0 com o novo input.

**Passo 0b — Verifique arquivos do usuário** (SSOT do candidato): `cv.md`, `config/profile.yml`, `modes/_profile.md` existem. Se faltarem, encaminhe ao onboarding do `CLAUDE.md` antes de seguir.

**Passo 0c — Verifique dependências do pipeline** (fail-fast em vez de fail-late):
- `modes/pdf.md` existe (Fase 5 depende dele para gerar o PDF).
- `.claude/references/cv-playbook-2026.md` existe (consultado pelos 3 agents).
- `.claude/references/recruiter-lens.md` existe (consultado pelos 3 agents e pela Fase 1 abaixo).
- Diretório `output/` é gravável.

Se algum arquivo de dependência faltar, **STOP** e reporte ao usuário com caminho exato esperado. Não tente continuar.

**Passo 0d — Confirme o argumento.** Se for URL, diga ao usuário "vou buscar via Playwright/WebFetch e confirmar conteúdo antes de processar". Se for texto, mostre as primeiras 5 linhas e confirme empresa+título.

**Passo 0e — Crie diretório de saída:** `output/tailor-runs/{YYYY-MM-DD}-{slug-empresa}/` para artefatos da rodada.

### Fase 1 — Modelagem do recrutador (NOVO)
Antes de despachar qualquer agent, leia `.claude/references/recruiter-lens.md`. Identifique:
- **Nível** da vaga (IC, manager, director, VP, C-level) — afeta o filtro.
- **Família funcional** (Controller, Consolidation, FP&A, Financeiro, outra) — afeta as heurísticas.
- **Indústria/setor** se sinalizado (tech, fintech, indústria, consultoria).

Sintetize em 3-5 linhas o **perfil do recrutador desta vaga**: o que ele filtra em 3s, quais red flags dispara, qual arquétipo busca. Esse mini-briefing vai dentro do prompt dos 3 agents.

Salve em `output/tailor-runs/{...}/00-recruiter-framing.md`.

### Fase 2 — Análise da vaga (vaga-analyst)
Despache o agente `vaga-analyst` com:
- A JD completa.
- O **recruiter-framing** da Fase 1.
- Instrução: "leia `.claude/references/cv-playbook-2026.md` e `.claude/references/recruiter-lens.md` antes de analisar".

Espere o briefing estruturado. Salve em `output/tailor-runs/{...}/01-vaga-briefing.md`.

**Gate:** se o briefing trouxer "JD insuficiente para análise profunda", pause e pergunte ao usuário antes de continuar.

### Fase 3 — Estratégia de personalização (cv-strategist)
Despache o agente `cv-strategist` passando como prompt:
- O **recruiter-framing** da Fase 1.
- O briefing da Fase 2 (íntegra).
- Caminho do `cv.md` para ele ler.
- Instrução: "leia também `.claude/references/cv-playbook-2026.md`, `.claude/references/recruiter-lens.md`, `cv.md`, `article-digest.md` se existir, e `modes/_profile.md`".

Espere o blueprint. Salve em `output/tailor-runs/{...}/02-blueprint.md`.

**Gate:** se o match rate estimado < 65%, pause e mostre ao usuário: "match rate baixo (X%). Quer mesmo continuar? Recomendação: pode haver vagas melhor alinhadas".

### Fase 4 — Crítica do recrutador (recruiter-reviewer)
Despache `recruiter-reviewer` passando recruiter-framing + briefing + blueprint + caminho do `cv.md`.

Espere o veredicto. Salve em `output/tailor-runs/{...}/03-recruiter-review.md`.

**Gate por veredicto:**
- **GO** — segue para Fase 5.
- **REVISE** — aplique as correções pontuais no blueprint (você mesmo edita) e siga.
- **STOP** — devolva o blueprint ao `cv-strategist` com as objeções específicas; espere blueprint v2; revise novamente. Máximo 2 iterações antes de pausar e pedir ao usuário.

### Fase 5 — Geração do CV final
Com o blueprint aprovado, gere o PDF seguindo o pipeline em `modes/pdf.md` (que já tem 15 passos detalhados, regras ATS, e injection ética de keywords). Diferenças vs uso direto do `pdf.md`:

- **Você já tem o Summary, Core Competencies, ordem de bullets e seleção de projetos** vindas do blueprint da Fase 3. Use esses outputs em vez de gerar do zero.
- **Use o idioma, page size e comprimento decididos no blueprint.**
- **Após gerar o PDF, rode auditoria final:** confirme que cada bullet do PDF tem origem rastreável em `cv.md` ou `article-digest.md`. Se não tiver, regenere.

Saída: `output/cv-{candidate}-{empresa}-{YYYY-MM-DD}.pdf`.

### Fase 6 — Relatório consolidado
Crie `output/tailor-runs/{...}/00-summary.md` com:
- Snapshot da vaga (empresa, título, modalidade, localização).
- Perfil do recrutador modelado (Fase 1).
- Match rate final (estimado vs realizado).
- Decisões de formato (idioma, páginas, page size).
- Top 5 keywords cobertas + 3-5 keywords NÃO cobertas (transparência).
- Score do recruiter-reviewer.
- Red flags pendentes e como foram tratados.
- Cover letter beats (3–4 frases-chave para o usuário usar na carta).
- Caminho do PDF final.
- Caminhos dos artefatos intermediários.

Apresente ao usuário um resumo de 8–12 linhas com:
1. Match rate alcançado (% e veredicto).
2. Top 3 destaques do CV personalizado (o que está mais forte na ótica do recrutador).
3. Top 2 gaps reais (o que não foi possível cobrir e como tratar).
4. Beats sugeridos para cover letter.
5. Caminho do PDF.
6. Recomendação: aplicar ou não, com 1 razão.

## Atualização do tracker

Após gerar PDF com sucesso, **NÃO** edite `applications.md` diretamente. Em vez disso, escreva TSV em `batch/tracker-additions/{num}-{slug}.tsv` seguindo o formato em `CLAUDE.md`. O `merge-tracker.mjs` consolida quando o usuário rodar manualmente.

Status canônico inicial: `Evaluated` (relatório gerado mas não submetido).

## Comandos granulares (uso cirúrgico)

Esta skill faz o pipeline ponta-a-ponta. Para uso parcial:
- `/cv-analyze <URL ou JD>` — só decodifica a vaga.
- `/cv-strategy` — só monta blueprint, dado um briefing existente.
- `/cv-recruiter-check` — só audita um CV existente contra uma vaga.

## Regras de qualidade e segurança

- **Ética acima de score.** Nunca esticar a verdade. Gaps reais são admitidos e tratados (cover letter ou skill adjacente).
- **Confirmação antes de aplicar.** Após gerar o PDF, **NUNCA** faça submissão automática. Apresente ao usuário e espere review explícito.
- **Discourage low-fit.** Se o `recruiter-reviewer` deu < 5/10, comunique honestamente e recomende não aplicar. Quality > quantity.
- **Idiomas.** O idioma do CV gerado deve seguir o idioma da JD (regra do usuário em `cv-rules.md`). Se a JD está em português, o CV sai em português; se em inglês, em inglês; se em espanhol, em espanhol. Default EN só quando a JD estiver em idioma ambíguo. Para JDs em DE/FR/JA, use `modes/de|fr|ja/` como modos auxiliares.
- **Logs.** Cada artefato é salvo em `output/tailor-runs/`. Auditoria local.
- **Honestidade brutal no resumo final.** O usuário precisa saber se o CV é forte ou se há gaps. Não maquie.

## Quando NÃO usar

- Para evaluação inicial sem geração de CV → use `/career-ops oferta`.
- Para batch processamento de várias vagas → use `/career-ops batch`.
- Para revisão de CV genérico sem vaga específica → use `/career-ops pdf`.
- Para conversa exploratória sobre carreira sem JD específica → não invocar esta skill.
