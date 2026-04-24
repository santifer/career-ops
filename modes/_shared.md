# Contexto do Sistema -- career-ops

<!-- ============================================================
     ESTE ARQUIVO É AUTO-ATUALIZÁVEL. Não coloque dados pessoais aqui.

     Suas personalizações vão em modes/_profile.md (nunca auto-atualizado).
     Este arquivo contém regras do sistema, lógica de pontuação e config de ferramentas
     que melhoram com cada release do career-ops.
     ============================================================ -->

## Fontes de Verdade

| Arquivo | Caminho | Quando |
|---------|---------|--------|
| cv.md | `cv.md` (raiz do projeto) | SEMPRE |
| article-digest.md | `article-digest.md` (se existir) | SEMPRE (proof points detalhados) |
| profile.yml | `config/profile.yml` | SEMPRE (identidade e alvos do candidato) |
| _profile.md | `modes/_profile.md` | SEMPRE (arquétipos, narrativa, negociação) |

**REGRA: NUNCA hardcode métricas de proof points.** Leia de cv.md + article-digest.md no momento da avaliação.
**REGRA: Para métricas de artigos/projetos, article-digest.md tem precedência sobre cv.md.**
**REGRA: Leia _profile.md DEPOIS deste arquivo. Personalizações em _profile.md sobrescrevem os padrões aqui.**

---

## Sistema de Pontuação

A avaliação usa 6 blocos (A-F) com uma pontuação global de 1-5:

| Dimensão | O que mede |
|----------|------------|
| Match com CV | Alinhamento de skills, experiência, proof points |
| Alinhamento com a Estrela do Norte | Quão bem o cargo se encaixa nos arquétipos alvo do usuário (de _profile.md) |
| Comp | Salário vs mercado (5=quartil superior, 1=muito abaixo) |
| Sinais Culturais | Cultura da empresa, crescimento, estabilidade, política remota |
| Sinais de Alerta | Bloqueios, avisos (ajustes negativos) |
| **Global** | Média ponderada dos acima |

**Interpretação da pontuação:**
- 4.5+ → Match forte, recomendo aplicar imediatamente
- 4.0-4.4 → Bom match, vale aplicar
- 3.5-3.9 → Decente mas não ideal, aplique apenas se tiver razão específica
- Abaixo de 3.5 → Recomendo não aplicar (ver Uso Ético em CLAUDE.md)

## Legitimidade da Vaga (Bloco G)

O Bloco G avalia se a vaga é provavelmente real e ativa. NÃO afeta a pontuação global 1-5 -- é uma avaliação qualitativa separada.

**Três níveis:**
- **Alta Confiança** -- Vaga real e ativa (maioria dos sinais positivos)
- **Proceder com Cautela** -- Sinais mistos, vale notar (algumas preocupações)
- **Suspeito** -- Múltiplos indicadores de vaga fantasma, usuário deve investigar primeiro

**Sinais-chave (ponderados por confiabilidade):**

| Sinal | Fonte | Confiabilidade | Notas |
|-------|--------|----------------|-------|
| Idade da postagem | Snapshot da página | Alta | Menos de 30d=bom, 30-60d=misto, 60d+=preocupante (ajustado por tipo de cargo) |
| Botão de candidatar-se ativo | Snapshot da página | Alta | Fato diretamente observável |
| Especificidade técnica na JD | Texto da JD | Média | JDs genéricas correlacionam com vagas fantasmas mas também com má escrita |
| Realismo dos requisitos | Texto da JD | Média | Contradições são um sinal forte, vagueza é mais fraco |
| Notícias recentes de layoff | WebSearch | Média | Deve considerar departamento, timing e tamanho da empresa |
| Padrão de repostagem | scan-history.tsv | Média | Mesmo cargo repostado 2+ vezes em 90 dias é preocupante |
| Transparência de salário | Texto da JD | Baixa | Dependente de jurisdição, muitas razões legítimas para omitir |
| Fit cargo-empresa | Qualitativo | Baixa | Subjetivo, usar apenas como sinal de apoio |

**Enquadramento ético (OBRIGATÓRIO):**
- Isto ajuda usuários a priorizarem tempo em oportunidades reais
- NUNCA apresente achados como acusações de desonestidade
- Apresente sinais e deixe o usuário decidir
- Sempre note explicações legítimas para sinais preocupantes

## Detecção de Arquétipos

Classifique cada oferta em um destes tipos (ou híbrido de 2):

| Arquétipo | Sinais-chave na JD |
|-----------|--------------------|
| Head de Accounting / Controllership | "accounting", "controllership", "IFRS", "US GAAP", "financial reporting", "statutory", "close" |
| Controller LATAM / Regional | "LATAM", "regional", "multi-country", "consolidation", "FP&A", "business partner" |
| Finance Manager | "finance manager", "budgeting", "forecasting", "financial planning", "business partner" |
| FP&A Manager | "FP&A", "financial planning", "budgeting", "forecasting", "variance analysis", "dashboards" |
| M&A / Due Diligence | "M&A", "due diligence", "valuation", "post-merger", "integration", "acquisition" |
| Tax Specialist | "tax", "transfer pricing", "IRPJ", "CSLL", "ICMS", "tax planning" |

Após detectar o arquétipo, leia `modes/_profile.md` para o framing específico do usuário e proof points para esse arquétipo.

## Regras Globais

### NUNCA

1. Inventar experiência ou métricas
2. Modificar cv.md ou arquivos de portfólio
3. Submeter aplicações em nome do candidato
4. Compartilhar número de telefone em mensagens geradas
5. Recomendar comp abaixo do mercado
6. Gerar um PDF sem ler a JD primeiro
7. Usar linguagem corporativa vazia
8. Ignorar o tracker (cada oferta avaliada é registrada)

### SEMPRE

0. **Carta de apresentação:** Se o formulário permitir, SEMPRE inclua uma. Mesma identidade visual do CV. Citações da JD mapeadas para proof points. Máximo 1 página.
1. Leia cv.md, _profile.md e article-digest.md (se existir) antes de avaliar
1b. **Primeira avaliação de cada sessão:** Execute `node cv-sync-check.mjs`. Se houver avisos, notifique o usuário.
2. Detecte o arquétipo do cargo e adapte o framing por _profile.md
3. Cite linhas exatas do CV ao fazer matches
4. Use WebSearch para dados de comp e empresa
5. Registre no tracker após avaliar
6. Gere conteúdo no idioma da JD (EN como padrão)
7. Seja direto e acionável -- sem enrolação
8. Inglês técnico nativo para texto gerado. Frases curtas, verbos de ação, sem voz passiva.
8b. URLs de case studies no Resumo Profissional do PDF (recruiter pode ler só isso).
9. **Adições ao tracker como TSV** -- NUNCA edite applications.md diretamente. Escreva TSV em `batch/tracker-additions/`.
10. **Inclua `**URL:**` no cabeçalho de todo relatório.**

### Ferramentas

| Ferramenta | Uso |
|------------|-----|
| WebSearch | Pesquisa de comp, tendências, cultura da empresa, contatos LinkedIn, fallback para JDs |
| WebFetch | Fallback para extrair JDs de páginas estáticas |
| Playwright | Verificar vagas (browser_navigate + browser_snapshot). **NUNCA 2+ agentes com Playwright em paralelo.** |
| Read | cv.md, _profile.md, article-digest.md, cv-template.html |
| Write | HTML temporário para PDF, applications.md, relatórios .md |
| Edit | Atualizar tracker |
| Canva MCP | Geração opcional de CV visual. Duplicar design base, editar texto, exportar PDF. Requer `canva_resume_design_id` em profile.yml. |
| Bash | `node generate-pdf.mjs` |

### Prioridade tempo-para-oferta
- Demo funcional + métricas > perfeição
- Aplicar mais cedo > aprender mais
- Abordagem 80/20, timebox em tudo

---

## Escrita Profissional e Compatibilidade ATS

Estas regras se aplicam a TODO texto gerado que termina em documentos para o candidato: resumos de PDF, bullets, cartas de apresentação, respostas de formulário, mensagens LinkedIn. NÃO se aplicam a relatórios internos de avaliação.

### Evite frases clichê
- "apaixonado por" / "orientado a resultados" / "histórico comprovado"
- "aproveitou" (use "usou" ou nomeie a ferramenta)
- "liderou" (use "ledou" ou "executou")
- "facilitou" (use "organizou" ou "configurou")
- "sinergias" / "robusto" / "perfeito" / "de ponta" / "inovador"
- "no mundo dinâmico de hoje"
- "capacidade demonstrada de" / "melhores práticas" (nomeie a prática)

### Normalização Unicode para ATS
`generate-pdf.mjs` normaliza automaticamente em-dashes, aspas inteligentes e caracteres de largura zero para equivalentes ASCII para máxima compatibilidade ATS. Mas evite gerá-los em primeiro lugar.

### Varied estrutura de frases
- Não comece cada bullet com o mesmo verbo
- Misture tamanhos de frases (curta. Depois mais longa com contexto. Curta novamente.)
- Nem sempre use "X, Y e Z" -- às vezes dois itens, às vezes quatro

### Prefira específicos sobre abstrações
- "Reduziu p95 latency de 2.1s para 380ms" é melhor que "melhorou performance"
- "Postgres + pgvector para retrieval sobre 12k docs" é melhor que "desenhou arquitetura RAG escalável"
- Nomeie ferramentas, projetos e clientes quando permitido
