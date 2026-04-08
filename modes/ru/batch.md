# Режим: batch — Пакетная обработка вакансий

Два режима: **conductor --chrome** (навигация по порталам в реальном времени) или **standalone** (скрипт для уже собранных URL).

## Архитектура

```
Claude Conductor (claude --chrome --dangerously-skip-permissions)
  │
  │  Chrome: навигация по порталам (залогиненные сессии)
  │  Чтение DOM напрямую — пользователь видит всё в реальном времени
  │
  ├─ Вакансия 1: чтение JD из DOM + URL
  │    └─► claude -p worker → отчёт .md + PDF + строка трекера
  │
  ├─ Вакансия 2: клик далее, чтение JD + URL
  │    └─► claude -p worker → отчёт .md + PDF + строка трекера
  │
  └─ Конец: merge tracker-additions → applications.md + резюме
```

Каждый worker — `claude -p` с чистым контекстом 200K токенов. Conductor только оркестрирует.

## Файлы

```
batch/
  batch-input.tsv               # URL-ы (от conductor или вручную)
  batch-state.tsv               # Прогресс (авто-генерируется, gitignored)
  batch-runner.sh               # Скрипт-оркестратор standalone
  batch-prompt.md               # Шаблон промта для workers
  logs/                         # Один лог на вакансию (gitignored)
  tracker-additions/            # Строки трекера (gitignored)
```

## Режим A: Conductor --chrome

1. **Прочитать состояние**: `batch/batch-state.tsv` → что уже обработано
2. **Перейти на портал**: Chrome → URL поиска
3. **Извлечь URL**: Чтение DOM результатов → список URL → append в `batch-input.tsv`
4. **Для каждого URL**:
   a. Chrome: клик на вакансию → чтение JD из DOM
   b. Сохранить JD в `/tmp/batch-jd-{id}.txt`
   c. Вычислить следующий REPORT_NUM
   d. Запустить worker через Bash
   e. Обновить `batch-state.tsv`
   f. Лог в `logs/{report_num}-{id}.log`
   g. Chrome: назад → следующая вакансия
5. **Пагинация**: Нет вакансий → клик "Далее" → повтор
6. **Конец**: Merge `tracker-additions/` → `applications.md` + итоги

## Режим B: Script standalone

```bash
batch/batch-runner.sh [OPTIONS]
```

Опции:
- `--dry-run` — показать ожидающие без выполнения
- `--retry-failed` — повторить только упавшие
- `--start-from N` — начать с ID N
- `--parallel N` — N workers параллельно
- `--max-retries N` — попыток на вакансию (по умолчанию: 2)

## Формат batch-state.tsv

```
id	url	status	started_at	completed_at	report_num	score	error	retries
1	https://...	completed	2026-...	2026-...	002	4.2	-	0
2	https://...	failed	2026-...	2026-...	-	-	Ошибка	1
3	https://...	pending	-	-	-	-	-	0
```

## Возобновляемость

- Если упал → перезапустить → прочитать `batch-state.tsv` → пропустить завершённые
- Lock file (`batch-runner.pid`) предотвращает двойной запуск
- Каждый worker независим: сбой в вакансии #47 не влияет на остальные

## Workers (claude -p)

Каждый worker получает `batch-prompt.md` как system prompt. Самодостаточен.

Worker производит:
1. Отчёт `.md` в `reports/`
2. PDF в `output/`
3. Строку трекера в `batch/tracker-additions/{id}.tsv`
4. JSON результата в stdout

## Управление ошибками

| Ошибка | Восстановление |
|--------|----------------|
| URL недоступен | Worker падает → conductor ставит `failed`, следующий |
| JD за логином | Conductor пытается прочитать DOM. Если не удаётся → `failed` |
| Портал сменил layout | Conductor анализирует HTML, адаптируется |
| Worker упал | Conductor ставит `failed`, следующий. Повтор через `--retry-failed` |
| Conductor умер | Перезапустить → прочитать state → пропустить завершённые |
| PDF не удался | Отчёт .md сохраняется. PDF остаётся в ожидании |
