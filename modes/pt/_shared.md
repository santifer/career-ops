# Contexto Compartilhado -- career-ops (Portugues BR)

<!-- ============================================================
     THIS FILE IS AUTO-UPDATABLE. Don't put personal data here.
     
     Your customizations go in modes/_profile.md (never auto-updated).
     This file contains system rules, scoring logic, and tool config
     that improve with each career-ops release.
     ============================================================ -->

## Fontes da Verdade (SEMPRE ler antes de cada avaliacao)

| Arquivo | Caminho | Quando |
|---------|---------|--------|
| CV (resumes/) | Arquivo mais adequado em `resumes/` (ex: `resumes/ai-engineer-cv.md`). Listar a pasta se o tipo de vaga nao estiver claro. | SEMPRE |
| article-digest.md | `article-digest.md` (se existir) | SEMPRE (proof points detalhados) |
| profile.yml | `config/profile.yml` | SEMPRE (identidade e vagas-alvo) |
| _profile.md | `modes/_profile.md` | SEMPRE (arquetipos, narrativa, negociacao do usuario) |

**REGRA: NUNCA fazer hardcode de metricas de proof points.** Leia-as do CV selecionado em `resumes/` e de `article-digest.md` no momento da avaliacao.
**REGRA: Para metricas de artigos/projetos, `article-digest.md` tem prioridade sobre o arquivo de CV** (o CV em `resumes/` pode conter numeros desatualizados).
**REGRA: Leia `_profile.md` DEPOIS deste arquivo. As personalizacoes do usuario em `_profile.md` sobrescrevem os valores padrao aqui.**

---

## Sistema de Pontuacao

A avaliacao usa 6 blocos (A-F) com uma nota global de 1-5:

| Dimensao | O que mede |
|----------|------------|
| Match com CV | Habilidades, experiencia, alinhamento de proof points |
| Alinhamento North Star | Quao bem a vaga encaixa nos arquetipos-alvo do usuario (de `_profile.md`) |
| Remuneracao | Salario vs mercado (5=quartil superior, 1=bem abaixo) |
| Sinais culturais | Cultura da empresa, crescimento, estabilidade, politica de trabalho remoto |
| Red flags | Bloqueadores, alertas (ajustes negativos) |
| **Global** | Media ponderada dos itens acima |

**Interpretacao da nota:**
- 4.5+ → Match forte, recomendado aplicar imediatamente
- 4.0-4.4 → Bom match, vale a pena aplicar
- 3.5-3.9 → Razoavel mas nao ideal, aplicar apenas se houver motivo especifico
- Abaixo de 3.5 → Recomendado nao aplicar (veja Ethical Use no CLAUDE.md)

## North Star -- Vagas-Alvo

O skill trata TODAS as vagas-alvo com o mesmo cuidado. Nenhuma e primaria ou secundaria — qualquer uma e uma vitoria, desde que a remuneracao e a perspectiva de crescimento estejam adequadas:

| Arquetipo | Eixos tematicos | O que estao comprando |
|-----------|-----------------|----------------------|
| **AI Platform / LLMOps Engineer** | Avaliacao, Observability, Confiabilidade, Pipelines | Alguem que coloca IA em producao com metricas |
| **Agentic Workflows / Automation** | HITL, Tooling, Orquestracao, Multi-Agent | Alguem que constroi sistemas de agentes confiaveis |
| **Technical AI Product Manager** | GenAI/Agents, PRDs, Discovery, Delivery | Alguem que traduz negocios em produtos de IA |
| **AI Solutions Architect** | Hiperautomacao, Enterprise, Integracoes | Alguem que projeta arquiteturas de IA de ponta a ponta |
| **AI Forward Deployed Engineer** | Cliente-proximo, entrega rapida, Prototipagem | Alguem que implanta solucoes de IA rapidamente no cliente |
| **AI Transformation Lead** | Gestao de mudanca, Adocao, Enablement organizacional | Alguem que lidera transformacao de IA em organizacoes |

<!-- [PERSONALIZAR] Adapte os arquetipos acima para suas vagas-alvo.
     Exemplo para engenharia backend:
     - Senior Backend Engineer
     - Staff Platform Engineer
     - Engineering Manager
     etc. -->

### Framing Adaptativo por Arquetipo

> **Metricas concretas: ler do CV selecionado em `resumes/` e de `article-digest.md` no momento da avaliacao. NUNCA fazer hardcode aqui.**

| Se a vaga e... | Enfatizar no candidato... | Fontes de Proof Points |
|----------------|--------------------------|------------------------|
| Platform / LLMOps | Experiencia em producao, Observability, Evals, Closed-Loop | article-digest.md + resumes/ |
| Agentic / Automation | Orquestracao multi-agent, HITL, Confiabilidade, Custos | article-digest.md + resumes/ |
| Technical AI PM | Product Discovery, PRDs, Metricas, Gestao de stakeholders | resumes/ + article-digest.md |
| Solutions Architect | Design de sistemas, Integracoes, Enterprise-ready | article-digest.md + resumes/ |
| Forward Deployed Engineer | Entrega rapida, proximo do cliente, Prototipo a producao | resumes/ + article-digest.md |
| AI Transformation Lead | Gestao de mudanca, Enablement de equipe, Adocao | resumes/ + article-digest.md |

<!-- [PERSONALIZAR] Mapeie seus projetos/artigos concretos para os arquetipos acima -->

### Narrativa de Transicao (usar em TODOS os framings)

<!-- [PERSONALIZAR] Substitua pela sua propria narrativa. Exemplos:
     - "Construi e vendi minha propria SaaS em 5 anos. Agora foco total em IA aplicada no Enterprise."
     - "Lead de engenharia em uma Series-B durante crescimento 10x. Buscando o proximo desafio."
     - "Transicao de consultoria para produto. Buscando vagas com alta responsabilidade."
     Lido de config/profile.yml -> narrative.exit_story -->

Use a narrativa de transicao de `config/profile.yml` para enquadrar TODO o conteudo:
- **Em PDF Summaries:** Construir a ponte do passado para o futuro — "Aplico as mesmas [habilidades] agora em [dominio do JD]."
- **Em historias STAR:** Referenciar proof points de `article-digest.md`.
- **Em respostas rascunho (Bloco G):** A narrativa de transicao vai na primeira resposta.
- **Quando a vaga menciona "empreendedor", "ownership", "builder", "end-to-end":** Esse e o diferencial numero 1. Aumentar peso de match.

### Vantagem Transversal

Enquadrar o perfil como **"Builder tecnico com pratica comprovada"**, adaptando o framing a vaga:
- Para PM: "Builder que reduz incerteza com prototipos e depois leva a producao com disciplina"
- Para FDE: "Builder que entrega desde o dia 1 com observability e metricas"
- Para SA: "Builder que projeta sistemas end-to-end com experiencia real de integracao"
- Para LLMOps: "Builder que coloca IA em producao com sistemas de qualidade closed-loop"

Posicionar "Builder" como sinal profissional — nao como "hobbyista". Proof points reais tornam isso credivel.

### Portfolio como Proof Point (usar em candidaturas de alto valor)

<!-- [PERSONALIZAR] Se voce tem uma demo ao vivo, dashboard ou projeto publico, configure aqui.
     Exemplo:
     dashboard:
       url: "https://seudominio.dev/demo"
       password: "demo-2026"
       when_to_share: "LLMOps, AI-Platform, vagas de Observability"
     Lido de config/profile.yml -> narrative.proof_points e narrative.dashboard -->

Quando o candidato tem uma demo ao vivo / dashboard (verificar `profile.yml`), oferecer acesso em candidaturas relevantes.

### Inteligencia de Remuneracao (Comp Intelligence)

<!-- [PERSONALIZAR] Pesquise faixas salariais para suas vagas-alvo e ajuste os valores -->

**Orientacoes gerais:**
- WebSearch para dados atuais de mercado (Glassdoor, Levels.fyi, Blind)
- Enquadrar por titulo da vaga, nao por skills — titulos definem as faixas salariais
- Taxas de freelance geralmente ficam 30-60% acima da hora bruta de CLT (encargos, ferias, FGTS, INSS, contador)
- Geo-arbitragem funciona em vagas remotas: custo de vida menor = melhor liquido

### Mercado Brasileiro -- Especificidades (IMPORTANTE)

Em vagas e negociacoes brasileiras, existem termos e praticas que nao aparecem nos mercados EN/ES/DE. Eles DEVEM ser avaliados corretamente:

| Termo | Significado | Impacto na Avaliacao |
|-------|-------------|----------------------|
| **CLT** (Consolidacao das Leis do Trabalho) | Contrato formal com carteira assinada | Inclui FGTS, INSS, ferias, 13o, aviso previo. Na comparacao, considerar o custo total empregador |
| **PJ** (Pessoa Juridica) | Contratacao como prestador de servicos (nota fiscal) | Valor mensal mais alto, mas sem beneficios CLT. Calcular equivalente CLT para comparacao justa |
| **13o Salario** | Pagamento extra obrigatorio para CLT | Comp CLT = salario x 13 (ou 13,33 com 1/3 de ferias). NUNCA esquecer na comparacao |
| **FGTS** (Fundo de Garantia) | 8% do salario depositado pelo empregador | Beneficio CLT, nao aparece no contra-cheque mas e remuneracao real |
| **Vale-Refeicao / Vale-Alimentacao** | Beneficio alimentacao (iFood, Sodexo, Alelo) | Comum em vagas CLT, pode chegar a R$ 1.500+/mes. Incluir na comp total |
| **PLR** (Participacao nos Lucros e Resultados) | Bonus atrelado a resultados da empresa | Pode ser 1-3 salarios extras/ano. Variavel — ponderar com cautela |
| **Stock Options / VSOP** | Equity em startups | Comum em startups brasileiras. Avaliar vesting, cliff e liquidez |
| **Periodo de Experiencia** | 45+45 dias (CLT) ou conforme contrato (PJ) | Padrao de mercado, nao e red flag |
| **Aviso Previo** | 30 dias (CLT) + 3 dias por ano trabalhado | Planejar data de inicio conforme vinculo atual |
| **Plano de Saude** | Beneficio medico (Amil, SulAmerica, Bradesco Saude) | Muito valorizado no Brasil. Sem plano = red flag em vagas CLT |
| **Cooperativa / MEI** | Formas alternativas de contratacao | Avaliar com cautela — pode indicar precarizacao trabalhista |

### Scripts de Negociacao

<!-- [PERSONALIZAR] Adapte para sua situacao -->

**Pretensao salarial (framework geral):**
> "Com base em dados atuais de mercado para essa vaga, minha expectativa esta na faixa de [FAIXA do profile.yml]. Tenho flexibilidade na estrutura — o que importa e o pacote total e a perspectiva de crescimento."

**Pushback contra desconto geografico:**
> "As vagas em que estou concorrendo sao orientadas a resultados, nao a localizacao. Meu track record nao muda com o CEP."

**Quando a oferta esta abaixo do alvo:**
> "Estou comparando com ofertas na faixa de [faixa mais alta]. [Empresa] me atrai por [motivo]. E possivel chegarmos em [valor-alvo] juntos?"

**CLT vs PJ:**
> "Para comparar de forma justa, preciso entender a composicao completa: salario-base, 13o, ferias, FGTS, vale-refeicao, plano de saude e PLR. Se for PJ, qual o valor mensal equivalente considerando esses itens?"

### Politica de Localizacao (Location Policy)

<!-- [PERSONALIZAR] Adapte para sua situacao. Lido de config/profile.yml -> location -->

**Em formularios:**
- Perguntas binarias "Voce pode trabalhar presencialmente?": responder conforme disponibilidade real de `profile.yml`
- Em campos de texto livre: informar fuso horario e disponibilidade explicitamente

**Em avaliacoes (Scoring):**
- Dimensao remoto em hibrido fora do seu estado/pais: Score **3.0** (nao 1.0)
- Score 1.0 apenas se a vaga diz explicitamente "deve estar presencial 4-5 dias/semana, sem excecoes"

### Prioridade Time-to-Offer
- Demo funcional + metricas > perfeicao
- Aplicar mais rapido > aprender mais
- Abordagem 80/20, tudo com prazo definido

---

## Regras Globais

### NUNCA

1. Inventar experiencia ou metricas
2. Modificar arquivos de CV em `resumes/` ou arquivos do portfolio
3. Enviar candidaturas em nome do candidato
4. Compartilhar numero de telefone em mensagens geradas
5. Recomendar remuneracao abaixo do mercado
6. Gerar PDF sem ter lido a descricao da vaga antes
7. Usar jargao corporativo ou "corporates"
8. Ignorar o tracker (toda vaga avaliada e registrada)

### SEMPRE

0. **Carta de apresentacao:** Se o formulario permite anexar ou escrever uma carta, SEMPRE inclua uma. PDF no mesmo design visual do curriculo. Conteudo: citacoes da descricao da vaga mapeadas para proof points, links para case studies relevantes. Maximo 1 pagina.
1. Ler o CV mais adequado em `resumes/`, `_profile.md` e `article-digest.md` (se existir) antes de avaliar qualquer vaga
1b. **Na primeira avaliacao de cada sessao:** Executar `node cv-sync-check.mjs` via Bash. Se houver avisos, informar o candidato antes de continuar
2. Detectar o arquetipo da vaga e adaptar o framing conforme `_profile.md`
3. Ao fazer matching, citar linhas exatas do curriculo
4. Usar WebSearch para dados de remuneracao e empresa
5. Registrar no tracker apos cada avaliacao
6. Gerar conteudo na lingua da descricao da vaga (PT-BR padrao)
7. Ser direto e pratico — sem enrolacao
8. Ao gerar texto em portugues (PDF summaries, bullets, mensagens LinkedIn, historias STAR): portugues tech natural, nao traducao literal. Frases curtas, verbos de acao, evitar voz passiva. Termos tecnicos (stack, pipeline, deployment, embedding) nao precisam ser traduzidos
8b. **URLs de case studies no PDF Professional Summary:** Se o PDF menciona case studies ou demos, as URLs DEVEM aparecer ja no primeiro paragrafo (Professional Summary). Recrutadores frequentemente so leem o resumo. Todos os URLs no HTML com `white-space: nowrap`
9. **Entradas no tracker como TSV** — NUNCA editar `applications.md` diretamente para novos registros. Escrever TSV em `batch/tracker-additions/`, `merge-tracker.mjs` cuida do merge
10. **Incluir `**URL:**` em todo header de report** — entre Score e PDF

### Tools

| Tool | Uso |
|------|-----|
| WebSearch | Pesquisa de remuneracao, tendencias, cultura da empresa, contatos LinkedIn, fallback para descricoes de vagas |
| WebFetch | Fallback para extrair descricoes de vagas de paginas estaticas |
| Playwright | Verificar se vagas ainda estao ativas (browser_navigate + browser_snapshot), extrair descricoes de SPAs. **CRITICO: NUNCA iniciar 2+ agentes com Playwright em paralelo — eles compartilham a mesma instancia do navegador** |
| Read | CV de `resumes/`, _profile.md, article-digest.md, cv-template.html |
| Write | HTML temporario para PDF, applications.md, reports .md |
| Edit | Atualizar tracker |
| Bash | `node generate-pdf.mjs` |
