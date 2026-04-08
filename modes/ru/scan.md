# Режим: scan — Сканер порталов (Обнаружение вакансий)

Сканирует настроенные порталы вакансий, фильтрует по релевантности названия и добавляет новые вакансии в pipeline для последующей оценки.

## Выполнение

Рекомендуется запускать как субагент, чтобы не расходовать контекст основного:

```
Agent(
    subagent_type="general-purpose",
    prompt="[содержимое этого файла + конкретные данные]",
    run_in_background=True
)
```

## Конфигурация

Читать `portals.yml`, который содержит:
- `search_queries`: Список WebSearch-запросов с `site:` фильтрами (широкое обнаружение)
- `tracked_companies`: Конкретные компании с `careers_url` для прямой навигации
- `russian_portals`: Российские площадки (hh.ru, Хабр Карьера, trudvsem.ru и др.)
- `title_filter`: Keywords positive/negative/seniority_boost для фильтрации названий

## Стратегия обнаружения (4 уровня)

### Уровень 1 — Playwright прямой (ОСНОВНОЙ)

**Для каждой компании в `tracked_companies`:** Перейти на `careers_url` с Playwright (`browser_navigate` + `browser_snapshot`), прочитать ВСЕ видимые вакансии, извлечь название + URL.

### Уровень 2 — Greenhouse API (ДОПОЛНИТЕЛЬНЫЙ)

Для компаний с Greenhouse — API JSON (`boards-api.greenhouse.io/v1/boards/{slug}/jobs`).

### Уровень 3 — WebSearch запросы (ШИРОКОЕ ОБНАРУЖЕНИЕ)

`search_queries` с `site:` фильтрами для обнаружения НОВЫХ компаний.

### Уровень 4 — Российские площадки 🇷🇺

**Для каждой площадки в `russian_portals`:**

- **hh.ru API**: `https://api.hh.ru/vacancies?text={query}&area={area}&per_page=20` — открытый API, не требует авторизации для поиска. `area=1` — Москва, `area=2` — Санкт-Петербург.
- **Хабр Карьера**: Playwright → `career.habr.com/vacancies?q={query}&sort=relevance`
- **trudvsem.ru API**: `https://opendata.trudvsem.ru/api/v1/vacancies?text={query}&regionCode=77&limit=20`
- **Остальные** (rabota.ru, Superjob, Geekjob, budu.jobs): Playwright → URL поиска

**Приоритет выполнения:**
1. Уровень 1: Playwright → все `tracked_companies` с `careers_url`
2. Уровень 2: API → все `tracked_companies` с `api:`
3. Уровень 3: WebSearch → все `search_queries` с `enabled: true`
4. Уровень 4: Российские площадки → все `russian_portals` с `enabled: true`

Уровни аддитивны — выполняются все, результаты объединяются и дедуплицируются.

## Workflow

1. **Прочитать конфигурацию**: `portals.yml`
2. **Прочитать историю**: `data/scan-history.tsv` → уже виденные URL
3. **Прочитать источники деdup**: `data/applications.md` + `data/pipeline.md`

4. **Уровень 1 — Playwright scan** (параллельно батчами по 3-5):
   Для каждой компании в `tracked_companies` с `enabled: true` и `careers_url`:
   a. `browser_navigate` на `careers_url`
   b. `browser_snapshot` для чтения всех вакансий
   c. Извлечь: `{title, url, company}`
   d. Накопить в список кандидатов

5. **Уровень 2 — Greenhouse APIs** (параллельно):
   Для каждой компании с `api:` — WebFetch → JSON → извлечь вакансии

6. **Уровень 3 — WebSearch запросы** (параллельно):
   Для каждого запроса с `enabled: true` — WebSearch → извлечь результаты

7. **Уровень 4 — Российские площадки** (параллельно):
   a. hh.ru API → WebFetch JSON
   b. trudvsem.ru API → WebFetch JSON
   c. Остальные → Playwright

8. **Фильтровать по названию** используя `title_filter` из `portals.yml`:
   - Минимум 1 keyword из `positive` (case-insensitive)
   - 0 keywords из `negative`
   - `seniority_boost` дают приоритет

9. **Дедуплицировать** по 3 источникам:
   - `scan-history.tsv` → точный URL
   - `applications.md` → компания + роль
   - `pipeline.md` → точный URL

10. **Верифицировать liveness** для результатов WebSearch (Уровень 3) через Playwright

11. **Для каждой новой верифицированной вакансии**:
    a. Добавить в `pipeline.md`: `- [ ] {url} | {company} | {title}`
    b. Зарегистрировать в `scan-history.tsv`

## Резюме вывода

```
Скан порталов — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Запросов выполнено: N
Вакансий найдено: N всего
Отфильтровано по названию: N релевантных
Дубликатов: N (уже оценены или в pipeline)
Истёкших отброшено: N (мёртвые ссылки, Уровень 3)
Новых добавлено в pipeline.md: N

  + {company} | {title} | {query_name}
  ...

→ Запустите /career-ops pipeline для оценки новых вакансий.
```
