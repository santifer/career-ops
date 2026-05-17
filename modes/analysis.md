# Modo: analysis — Análise de Posicionamento de Mercado

Gera um documento de análise consolidada a partir dos relatórios avaliados: pontos fortes, gaps, faixa salarial, ranking de oportunidades e recomendações. Exporta `reports/analysis.md` e `output/analysis.pdf`.

## Uso

```
/career-ops analysis           → analisa todos os relatórios em reports/
/career-ops analysis 032-048   → analisa somente os relatórios 032 a 048
/career-ops analysis 032,037,040  → analisa relatórios específicos
```

## Workflow

### 1. Determinar escopo

Se argumento fornecido:
- Range `032-048` → processar reports/032-*.md até reports/048-*.md
- Lista `032,037,040` → processar apenas esses números
- Sem argumento → processar TODOS os .md em reports/ com score >= 3.0/5

### 2. Ler fontes

Ler em paralelo:
- `cv.md` → perfil e proof points
- `modes/_profile.md` → archetypes alvo, deal-breakers, narrativa
- Todos os arquivos de relatório do escopo definido

### 3. Extrair dados de cada relatório

Para cada relatório, extrair:
- `company`, `role`, `score` (do header **Score:**)
- `archetype` (do bloco B — North Star alignment)
- `comp_range` (do bloco C — Comp)
- `strengths` citados (do bloco A — Match com CV)
- `gaps` citados (do bloco E — Red flags ou bloco A)
- `red_flags` (do bloco E)
- `recommendation` (do bloco F)

### 4. Gerar analysis.md

Salvar em `reports/analysis.md` com a estrutura abaixo.

---

## Estrutura do analysis.md

```markdown
# Análise de Posicionamento — {candidato} — {YYYY-MM-DD}

> Baseado em {N} avaliações de ofertas (scores {min}–{max}/5).

---

## Pontos Fortes

### Técnicos
{Lista dos skills/experiências que aparecem como match em 3+ relatórios, com contagem}
- **LLM orchestration & agentic workflows** — mencionado em X de N avaliações
- **RPA / automação de processos** — mencionado em X avaliações
- **Full-stack delivery** — mencionado em X avaliações
...

### Diferenciadores de mercado
{Proof points únicos que se destacam transversalmente}
- {proof point 1}
- {proof point 2}
...

---

## Gaps Recorrentes

| Gap | Aparece em | Mitigação possível |
|-----|-----------|-------------------|
| {gap 1} | X/N relatórios | {sugestão} |
| {gap 2} | X/N relatórios | {sugestão} |
...

---

## Faixa Salarial de Mercado

| Nível | Faixa (USD/ano) | Faixa (EUR/ano) | Fonte |
|-------|----------------|-----------------|-------|
| Mínimo observado | ${min}k | €{min}k | {empresa} |
| Mediana das avaliações | ${med}k | €{med}k | — |
| Máximo observado | ${max}k | €{max}k | {empresa} |

**Posição recomendada de negociação:** ${target}k–${stretch}k USD

---

## Ranking de Oportunidades

| # | Empresa | Role | Score | Archetype | Prioridade |
|---|---------|------|-------|-----------|-----------|
{listar todas ordenadas por score desc, com emoji de prioridade: 🔴 aplicar hoje | 🟡 aplicar esta semana | ⚪ reserva}

---

## Archetypes Mais Compatíveis

{Distribuição dos archetypes encontrados nas avaliações}
- **{archetype 1}**: X roles (score médio: Y.Y/5)
- **{archetype 2}**: X roles (score médio: Y.Y/5)
...

**Recomendação:** Focar em {archetype(s) com maior score médio} onde o match é mais consistente.

---

## Recomendações de Próximos Passos

1. **Aplicar imediatamente (score ≥ 4.5):**
   {lista das ofertas com score >= 4.5 e URL}

2. **Aplicar esta semana (score 4.0–4.4):**
   {lista}

3. **Gaps a endereçar antes de aplicar:**
   {lista dos gaps críticos com sugestão de como mitigar rapidamente}

4. **Empresas para pesquisa mais profunda:**
   {lista com /career-ops deep sugerido}

---

## Notas do Candidato

{Seção em branco para o candidato anotar manualmente insights, feedback de entrevistas, etc.}
```

---

### 5. Gerar PDF

Converter `reports/analysis.md` para HTML usando o template de análise e exportar:

```bash
node generate-pdf.mjs output/analysis-{YYYY-MM-DD}.html output/analysis-{YYYY-MM-DD}.pdf
```

**Template HTML para a análise:** `templates/analysis-template.html`

Se o template não existir, usar um HTML inline simples com:
- Fonte: Inter ou system-ui
- Cores: slate-900 para texto, blue-600 para destaques, tabelas com bordas leves
- Margens A4: 2cm top/bottom, 2.5cm left/right
- Nenhum header/footer com número de página

### 6. Output

```
Análise gerada:
  → reports/analysis.md
  → output/analysis-{YYYY-MM-DD}.pdf

{N} relatórios analisados | Score médio: X.X/5
Top match: {empresa} — {role} ({score}/5)
```
