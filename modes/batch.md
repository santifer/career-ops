# Modo: batch - Procesamiento Masivo de Ofertas

Dos modos de uso: **conductor --chrome** (navega portales en tiempo real) o **standalone** (script para URLs ya recolectadas).

Importante: los prompts batch pueden incluir contenido de terceros o scraping de portales. Los providers integrados (`claude`, `codex`) omiten flags peligrosos por defecto. El modo inseguro solo debe activarse explicitamente en un entorno local de confianza con `CAREER_OPS_UNSAFE_AGENT_EXEC=1`.

## Arquitectura

```
Agent Conductor (runtime interactivo con navegador)
  |
  |  Chrome: navega portales (sesiones logueadas)
  |  Lee DOM directo; el usuario ve todo en tiempo real
  |
  |- Oferta 1: lee JD del DOM + URL
  |    `-> worker batch -> report .md + PDF + tracker-line
  |
  |- Oferta 2: click siguiente, lee JD + URL
  |    `-> worker batch -> report .md + PDF + tracker-line
  |
  `- Fin: merge tracker-additions -> applications.md + resumen
```

Cada worker es un proceso hijo con contexto limpio. El conductor solo orquesta.

## Archivos

```
batch/
  batch-input.tsv               # URLs (por conductor o manual)
  batch-state.tsv               # Progreso (auto-generado, gitignored)
  batch-runner.sh               # Script orquestador standalone
  batch-prompt.md               # Prompt template para workers
  logs/                         # Un log por oferta (gitignored)
  tracker-additions/            # Lineas de tracker (gitignored)
```

## Modo A: Conductor --chrome

1. **Leer estado**: `batch/batch-state.tsv` para saber que ya se proceso
2. **Navegar portal**: Chrome -> URL de busqueda
3. **Extraer URLs**: leer DOM de resultados -> extraer lista de URLs -> append a `batch-input.tsv`
4. **Para cada URL pendiente**:
   a. Chrome: click en la oferta -> leer JD text del DOM
   b. Guardar JD a `/tmp/batch-jd-{id}.txt`
   c. Calcular siguiente REPORT_NUM secuencial
   d. Ejecutar via Bash (safe by default):
      ```bash
      CAREER_OPS_AGENT=claude ./batch/batch-runner.sh --start-from {id}
      ```
      O, si se necesita automatizacion insegura en un entorno local de confianza:
      ```bash
      CAREER_OPS_AGENT=claude CAREER_OPS_UNSAFE_AGENT_EXEC=1 ./batch/batch-runner.sh --start-from {id}
      ```
   e. Actualizar `batch-state.tsv` (completed/failed + score + report_num)
   f. Log a `logs/{report_num}-{id}.log`
   g. Chrome: volver atras -> siguiente oferta
5. **Paginacion**: si no hay mas ofertas -> click "Next" -> repetir
6. **Fin**: merge `tracker-additions/` -> `applications.md` + resumen

## Modo B: Script standalone

```bash
batch/batch-runner.sh [OPTIONS]
```

Opciones:
- `--dry-run` - lista pendientes sin ejecutar
- `--retry-failed` - solo reintenta fallidas
- `--start-from N` - empieza desde ID N
- `--parallel N` - N workers en paralelo
- `--max-retries N` - intentos por oferta (default: 2)

## Formato batch-state.tsv

```
id	url	status	started_at	completed_at	report_num	score	error	retries
1	https://...	completed	2026-...	2026-...	002	4.2	-	0
2	https://...	failed	2026-...	2026-...	-	-	Error msg	1
3	https://...	pending	-	-	-	-	-	0
```

## Resumabilidad

- Si muere -> re-ejecutar -> lee `batch-state.tsv` -> skip completadas
- Lock file (`batch-runner.pid`) previene ejecucion doble
- Cada worker es independiente: fallo en oferta #47 no afecta a las demas

## Workers

Cada worker recibe `batch-prompt.md` como system prompt. Es self-contained. Los providers integrados actuales son `claude` y `codex`; otros runtimes pueden entrar por el contrato de adapter documentado en `AGENTS.md`.

El worker produce:
1. Report `.md` en `reports/`
2. PDF en `output/`
3. Linea de tracker en `batch/tracker-additions/{id}.tsv`
4. JSON de resultado por stdout

## Gestion de errores

| Error | Recovery |
|-------|----------|
| URL inaccesible | Worker falla -> conductor marca `failed`, siguiente |
| JD detras de login | Conductor intenta leer DOM. Si falla -> `failed` |
| Portal cambia layout | Conductor razona sobre HTML, se adapta |
| Worker crashea | Conductor marca `failed`, siguiente. Retry con `--retry-failed` |
| Conductor muere | Re-ejecutar -> lee state -> skip completadas |
| PDF falla | Report .md se guarda. PDF queda pendiente |
