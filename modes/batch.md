# Modo: batch — Processamento em Massa de Ofertas

Dois modos de uso: **conductor --chrome** (navega portais em tempo real) ou **standalone** (script para URLs já coletadas).

## Arquitetura

```
Claude Conductor (claude --chrome --dangerously-skip-permissions)
  │
  │  Chrome: navega portais (sessões logadas)
  │  Lê DOM direto — o usuário vê tudo em tempo real
  │
  ├─ Oferta 1: lê JD do DOM + URL
  │    └─► claude -p worker → report .md + PDF + tracker-line
  │
  ├─ Oferta 2: click siguiente, lê JD + URL
  │    └─► claude -p worker → report .md + PDF + tracker-line
  │
  └─ Fin: merge tracker-additions → applications.md + resumen
```

Cada worker é um `claude -p` filho com contexto limpo de 200K tokens. O conductor só orchestra.

## Arquivos

```
batch/
  batch-input.tsv               # URLs (por conductor ou manual)
  batch-state.tsv               # Progresso (auto-gerado, gitignored)
  batch-runner.sh               # Script orquestrador standalone
  batch-prompt.md               # Prompt template para workers
  logs/                         # Um log por oferta (gitignored)
  tracker-additions/            # Linhas de tracker (gitignored)
```

## Modo A: Conductor --chrome

1. **Ler estado**: `batch/batch-state.tsv` → saber o que já se processou
2. **Navegar portal**: Chrome → URL de busca
3. **Extrair URLs**: Ler DOM de resultados → extrair lista de URLs → append a `batch-input.tsv`
4. **Para cada URL pendente**:
   a. Chrome: click na oferta → ler JD text do DOM
   b. Guardar JD a `/tmp/batch-jd-{id}.txt`
   c. Calcular siguiente REPORT_NUM sequencial
   d. Executar via Bash:
      ```bash
      claude -p --dangerously-skip-permissions \
        --append-system-prompt-file batch/batch-prompt.md \
        "Procesa esta oferta. URL: {url}. JD: /tmp/batch-jd-{id}.txt. Report: {num}. ID: {id}"
      ```
   e. Atualizar `batch-state.tsv` (completed/failed + score + report_num)
   f. Log a `logs/{report_num}-{id}.log`
   g. Chrome: voltar atrás → siguiente oferta
5. **Paginação**: Se não há mais ofertas → click "Next" → repetir
6. **Fin**: Merge `tracker-additions/` → `applications.md` + resumen

## Modo B: Script standalone

```bash
batch/batch-runner.sh [OPTIONS]
```

Opções:
- `--dry-run` — lista pendentes sem executar
- `--retry-failed` — só reintenta falhadas
- `--start-from N` — começa desde ID N
- `--parallel N` — N workers em paralelo
- `--max-retries N` — tentativas por oferta (default: 2)

## Formato batch-state.tsv

```
id	url	status	started_at	completed_at	report_num	score	error	retries
1	https://...	completed	2026-...	2026-...	002	4.2	-	0
2	https://...	failed	2026-...	2026-...	-	-	Error msg	1
3	https://...	pending	-	-	-	-	-	0
```

## Recuperabilidade

- Se morre → re-executar → lê `batch-state.tsv` → skip completadas
- Lock file (`batch-runner.pid`) previne execução dupla
- Cada worker é independente: falha na oferta #47 não afeta as demais

## Workers (claude -p)

Cada worker recebe `batch-prompt.md` como system prompt. É self-contained.

O worker produz:
1. Report `.md` em `reports/`
2. PDF em `output/`
3. Linha de tracker em `batch/tracker-additions/{id}.tsv`
4. JSON de resultado por stdout

## Gestão de erros

| Erro | Recuperação |
|------|-------------|
| URL inacessível | Worker falha → conductor marca `failed`, seguinte |
| JD atrás de login | Conductor tenta ler DOM. Se falha → `failed` |
| Portal muda layout | Conductor raisona sobre HTML, se adapta |
| Worker crashea | Conductor marca `failed`, seguinte. Retry com `--retry-failed` |
| Conductor morre | Re-executar → lê state → skip completadas |
| PDF falha | Report .md se guarda. PDF fica pendente |
