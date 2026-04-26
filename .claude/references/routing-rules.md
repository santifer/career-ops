---
title: Routing Rules — /career-ops vs /headhunter (SSOT único)
type: reference
purpose: Fonte canônica e única da regra de roteamento entre o auto-pipeline genérico (/career-ops) e o pipeline premium de personalização (/headhunter), incluindo precedência de triggers, thresholds de score, mapeamento score↔match rate, e tratamento por modo de execução
last_updated: 2026-04-26
version: 1.0.0
authority: SSOT — quando outros arquivos descreverem roteamento, devem apontar para cá em vez de duplicar a regra
consumed_by:
  - .claude/skills/headhunter/SKILL.md
  - .claude/skills/career-ops/SKILL.md
  - modes/auto-pipeline.md
  - modes/oferta.md
  - CLAUDE.md
  - AGENTS.md
  - INSTRUCOES_DE_USO.md
related:
  - .claude/skills/headhunter/SKILL.md
  - .claude/skills/career-ops/SKILL.md
  - modes/auto-pipeline.md
  - modes/_shared.md
---

# Routing Rules — `/career-ops` vs `/headhunter`

> **Regra única e canônica.** Se você está editando este arquivo, está mexendo no comportamento de roteamento de todo o sistema. Outros arquivos devem APONTAR pra cá, não duplicar.

## 1. Precedência de triggers (ordem de avaliação)

Quando o usuário envia um input, o sistema avalia os triggers nesta ordem. **A primeira condição que casar vence; as demais são ignoradas.**

| # | Trigger | Roteamento | Justificativa |
|---|---------|------------|---------------|
| 1 | Comando explícito `/headhunter <URL ou JD>` | `/headhunter` (SSOT premium) | Comando direto sempre vence — usuário declarou intenção |
| 2 | Comando explícito `/cv-analyze`, `/cv-strategy`, `/cv-recruiter-check`, `/tailor-cv` | comando granular ou alias correspondente | Comando direto sempre vence |
| 3 | Frase de intenção de personalização (ver §2 abaixo) **mesmo se acompanhada de URL** | `/headhunter` | Frase declara intenção de personalização premium; URL é dado, não trigger |
| 4 | Comando explícito `/career-ops <subcomando>` | `/career-ops <subcomando>` | Comando direto |
| 5 | Cola de URL/JD pura sem comando ou frase de intenção | `/career-ops` auto-pipeline | Caminho default; entrega A-G + PDF + tracker |
| 6 | Conversa genérica de carreira (sem URL, sem frase de intenção, sem comando) | Nenhuma skill — resposta direta | Não há vaga específica para processar |

**Resumo:** comando vence frase, frase vence URL, URL pura cai no padrão. **Nunca dois caminhos disparam para o mesmo input.**

## 2. Frases de intenção de personalização (multi-idioma)

A frase de intenção é qualquer enunciado declarando que o usuário quer **personalizar o CV para uma vaga específica**. Os triggers cobrem:

### Português (PT-BR e PT-PT)
- "personaliza meu CV", "personalize meu currículo", "personaliza pra esta vaga"
- "tailor CV", "tailoring CV", "tailorizar CV"
- "ajusta meu currículo", "adapta meu CV", "customiza meu CV"
- "gera CV pela ótica do recrutador", "CV hiper-personalizado"
- "headhunter mode", "modo recrutador"

### Espanhol
- "personaliza mi CV", "personaliza mi currículum", "personaliza mi hoja de vida"
- "adapta mi CV para esta vacante", "ajusta mi CV"
- "CV optimizado para reclutador", "CV personalizado"

### Inglês
- "tailor my CV", "tailor my resume", "personalize my CV/resume"
- "customize my CV/resume for this role"
- "recruiter-optimized CV", "headhunter mode"

### Francês
- "adapte mon CV", "personnalise mon CV", "ajuste mon CV"
- "CV optimisé pour le recruteur", "CV sur mesure"

### Alemão
- "passe meinen Lebenslauf an", "personalisiere meinen Lebenslauf"
- "Lebenslauf optimieren für die Stelle", "maßgeschneiderter Lebenslauf"

### Japonês
- "履歴書をカスタマイズ" (rirekisho wo kasutamaizu)
- "履歴書を求人に合わせて調整"
- "リクルーター視点で履歴書を最適化"

**Heurística geral:** se o input contém um verbo de personalização (ajustar/adaptar/customizar/personalizar/tailor/anpassen/adapter) **+** um substantivo de CV (CV/currículo/resume/Lebenslauf/履歴書) **+** uma vaga (URL ou contexto declarado), aciona `/headhunter`.

## 3. Thresholds de score (alinhados com regra ética)

O auto-pipeline gera score global 1-5 (média ponderada dos blocos A-F). A interpretação e ações por faixa estão alinhadas com a seção "Ethical Use" de `CLAUDE.md`/`AGENTS.md`:

| Faixa de score | Recomendação | Sugere `/headhunter`? | Justificativa |
|----------------|--------------|----------------------|---------------|
| **≥ 4.5** | Aplicar imediatamente — match forte | ✅ Sim, recomendado para personalização premium | Vaga vale o investimento extra de 3 agents + recruiter-lens |
| **4.0 – 4.4** | Vale aplicar — bom match | ✅ Sim, sugere escalonar | Match sólido + premium pode fazer diferença na competição |
| **3.5 – 3.9** | Aplicar apenas se houver razão específica | ❌ Não sugere | CV padrão é suficiente; vaga é borderline |
| **3.0 – 3.4** | Recomenda **NÃO aplicar** (cutoff ético) | ❌ Não sugere | Match fraco demais; tempo do candidato e do recrutador valem mais |
| **< 3.0** | Recomenda **descartar** | ❌ Não sugere | Vaga não está alinhada minimamente |

**Cutoff ético = 4.0:** o mesmo threshold que dispara recomendação positiva no auto-pipeline e dispara sugestão de escalar pro `/headhunter`. Mexer em um exige mexer no outro.

## 4. Mapeamento aproximado: score (1-5) ↔ match rate (%)

O auto-pipeline (`modes/oferta.md`) usa **score 1-5** (blocos A-F). O pipeline `/headhunter` (Fase 3, `cv-strategist`) usa **match rate em %** (cobertura de keywords P0+P1 do briefing). São dimensões correlacionadas mas distintas.

Mapeamento aproximado para alinhar expectativas (baseado em calibração de uso real):

| Score (1-5) | Match Rate aproximado (%) | Veredicto típico do `/headhunter` |
|-------------|--------------------------|------------------------------------|
| 4.5 – 5.0 | 80% – 95% | GO confortável |
| 4.0 – 4.4 | 65% – 79% | GO com 1-2 reframes |
| 3.5 – 3.9 | 55% – 64% | REVISE (gaps materiais) |
| 3.0 – 3.4 | 45% – 54% | STOP ou REVISE com cover letter forte |
| < 3.0 | < 45% | STOP — não vale gerar PDF |

**Importante:** o mapeamento é aproximado, não determinístico. Score reflete fit holístico (incluindo cultura, comp, growth); match rate reflete só cobertura de keywords da JD vs CV. Vaga com score 4.2 (forte em fit cultural) pode ter match rate 62% (fraco em keywords técnicas) ou vice-versa. Use como guia, não como contrato.

## 5. Tratamento por modo de execução

### Modo single (interativo) — comportamento default
- Auto-pipeline sugere `/headhunter` per-vaga conforme tabela §3.
- `/headhunter` opera com Playwright + AskUserQuestion normalmente.

### Modo batch (`/career-ops batch`)
- **Auto-pipeline NÃO sugere `/headhunter` em cada vaga** — poluiria o output com nudges duplicados.
- O orquestrador `/career-ops batch` agrega no relatório final único bloco:
  > "Vagas com score ≥ 4.0 que valem `/headhunter`: [lista]"
- Cada vaga ainda recebe seu relatório A-G e PDF padrão. A escalação fica explícita para o usuário decidir caso a caso.

### Modo headless (`claude -p`)
- Auto-pipeline **NÃO sugere `/headhunter`** — `/headhunter` requer Playwright interativo (Passo 0d) que headless não tem.
- Substituído por nota: `**Personalização premium:** disponível via /headhunter em sessão interativa (não acessível em batch headless)`.

## 6. Como editar este arquivo

**Quando atualizar:**
- Mudar threshold de score (ex: cutoff ético vira 3.5) — atualize §3 e §4.
- Adicionar idioma novo aos triggers — atualize §2.
- Adicionar comando granular novo — atualize §1.
- Detectar novo modo de execução (ex: pipe via API) — atualize §5.

**Quando NÃO atualizar:**
- Mudanças que afetam só `/headhunter` internamente (Fases 1-6) → editar `.claude/skills/headhunter/SKILL.md`.
- Mudanças que afetam só `auto-pipeline` internamente (Passos 1-5) → editar `modes/auto-pipeline.md`.
- Personalização do candidato (arquétipos, narrativa, scoring weights) → editar `modes/_profile.md` ou `config/profile.yml`.

**Princípio:** este arquivo descreve **como o sistema decide qual caminho rodar**. Não descreve o que cada caminho faz internamente.

## 7. Histórico de mudanças

- **1.0.0 (2026-04-26):** criação como SSOT após 3 reviewers convergirem sobre fragmentação da regra em 5 arquivos (CLAUDE.md, AGENTS.md, SKILL.md, auto-pipeline.md, INSTRUCOES_DE_USO.md). Os 5 arquivos agora apontam pra cá.
