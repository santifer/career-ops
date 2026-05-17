# Modo: dashboard — Visualização Interativa

Gera e abre o dashboard HTML interativo com todas as informações do pipeline de job search.

## Uso

```
/career-ops dashboard
```

## O que gera

Executa `node generate-dashboard.mjs` no diretório do projeto e abre o arquivo resultante (`output/dashboard.html`) no browser.

## Views disponíveis

| Tab | Conteúdo |
|-----|---------|
| **Overview** | KPIs (total, aplicadas, entrevistas, score médio) + gráficos de distribuição de score, status e archetypes + lista "Apply Now" |
| **Applications** | Tabela completa e ordenável de todas as ofertas avaliadas — filtros por texto, status e score mínimo |
| **Companies** | Cards agrupados por empresa — max score, avg score, todos os roles avaliados |
| **Pipeline** | URLs pendentes de avaliação + prospect pipeline não avaliado |
| **Follow-up** | Apenas Applied/Responded/Interview/Offer — dias desde aplicação, próxima ação |
| **Scan History** | Histórico completo do scanner com filtros por status |

## Execução

```bash
node generate-dashboard.mjs          # gera + abre no browser
node generate-dashboard.mjs --no-open  # só gera, não abre
```

## Workflow do modo

1. Ler `data/applications.md`, `data/pipeline.md`, `data/scan-history.tsv`, `reports/*.md`
2. Executar: `node generate-dashboard.mjs`
3. Confirmar que `output/dashboard.html` foi gerado
4. O arquivo abre automaticamente no browser padrão

## Atualização

O dashboard é estático — regenerar com `/career-ops dashboard` a qualquer momento para dados frescos. Leva menos de 1 segundo.
