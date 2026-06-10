# Tryb: scan — Skaner portali (odkrywanie ofert)

Skanuje skonfigurowane portale pracy, filtruje według trafności tytułu i dodaje nowe oferty do pipeline'u do późniejszej oceny.

> **Uwaga (v1.6+):** Domyślny skaner (`scan.mjs` / `npm run scan`) jest **zero-token** i korzysta ze źródeł strukturalnych: lokalnych parserów konfigurowanych per firma oraz publicznych API Greenhouse, Ashby i Lever. Poziomy z Playwright/WebSearch opisane niżej to przepływ **agentowy** (wykonywany przez Claude/Codex), a nie to, co robi `scan.mjs`. Jeśli firma nie ma ani lokalnego parsera, ani API Greenhouse/Ashby/Lever, `scan.mjs` ją pominie; w takich przypadkach agent musi ręcznie uzupełnić Poziom 1 (Playwright) lub Poziom 3 (WebSearch).
>
> **Reguła (v1.8+):** Jeśli lokalny parser firmy zakończy się sukcesem na Poziomie 0, agent **nie** powinien powtarzać tej firmy w Playwright (Poziom 1) ani w API (Poziom 2). Na Poziomie 3 ogólne zapytania pozostają aktywne, ale wyniki firm już objętych parserem są odrzucane. Zobacz [Reguła: udany lokalny parser](#reguła-udany-lokalny-parser--nie-powtarzaj-drogiego-scrapingu).

## Zalecane uruchomienie

Uruchom jako subagent, by nie zużywać kontekstu głównego:

```
Agent(
    subagent_type="general-purpose",
    prompt="[treść tego pliku + dane specyficzne]",
    run_in_background=True
)
```

## Konfiguracja

Przeczytaj `portals.yml`, który zawiera:
- `search_queries`: lista zapytań WebSearch z filtrami `site:` per portal (szerokie odkrywanie)
- `tracked_companies`: konkretne firmy z `careers_url` do bezpośredniej nawigacji
- `tracked_companies[].parser`: opcjonalny lokalny parser dla stron SSR lub stabilnego HTML
- `title_filter`: słowa kluczowe positive/negative/seniority_boost do filtrowania tytułów

## Strategia odkrywania (4 poziomy)

### Poziom 0 — Lokalny parser (NAJTAŃSZY)

**Dla każdej firmy w `tracked_companies` ze skonfigurowanym `parser:`:** uruchom lokalny parser zdefiniowany w `portals.yml`. Ten poziom jest idealny, gdy strona kariery używa SSR lub stabilnego HTML i istnieje już skrypt JavaScript, Python lub innego lokalnego runtime'u, który wyciąga oferty bez pomocy agenta.

Zalecany kontrakt:

```yaml
- name: Example Company
  careers_url: https://example.com/careers
  scan_method: local_parser
  parser:
    command: node
    script: scripts/parsers/example-company-jobs.js
    format: jobs-json-v1
  enabled: true
```

Zwykle parser jest specyficzny dla firmy i zna już URL, selektory i paginację. `args` jest opcjonalne: użyj go, jak pomaga autorowi skryptu — np. by reużyć go między firmami, przekazać `{careers_url}` lub `{company}`, włączyć flagę debugowania, zapisać snapshot JSON lub kontrolować dowolne własne zachowanie parsera.

Parser musi wypisać JSON na stdout:

Format tablicowy:

```json
[
  { "title": "Senior AI Engineer", "url": "https://example.com/jobs/123", "location": "Remote" }
]
```

Format obiektu z `jobs`:

```json
{
  "jobs": [
    { "title": "Senior AI Engineer", "url": "https://example.com/jobs/123", "location": "Remote" }
  ]
}
```

Format obiektu z `results`:

```json
{
  "results": [
    { "title": "Senior AI Engineer", "url": "https://example.com/jobs/123", "location": "Remote" }
  ]
}
```

`company` jest opcjonalne; jeśli nie przyjdzie, `scan.mjs` używa nazwy z `tracked_companies`.

Skaner nie musi zachowywać pełnego JSON-a po odczytaniu stdout. Jeśli parser generuje także artefakt do audytu lub debugowania, zapisz go w `data/parser-output/{company}/` i trzymaj poza gitem (pliki JSON w `.gitignore`; pliki `.gitkeep` zostają w gicie, by zachować strukturę).

### Reguła: udany lokalny parser — nie powtarzaj drogiego scrapingu

Celem `scan_method: local_parser` jest **redukcja tokenów**: uniknięcie ponownego scrapowania tej samej firmy przez LLM za pomocą Playwright lub redundantnych API.

Podczas skanu agenta utrzymuj w pamięci zbiór **`local_parser_ok`**: nazwy firm (`tracked_companies[].name`), gdzie Poziom 0 zakończył się sukcesem:

- `parser.command` + `parser.script` istnieją, a skrypt wykonał się bez błędu krytycznego
- stdout był poprawnym JSON-em (`[]`, `{ jobs: [] }` lub `{ results: [] }`)
- nie było timeoutu ani crashu procesu

| Poziom | Jeśli firma jest w `local_parser_ok` |
|-------|----------------------------------------|
| **1 — Playwright** | **Pomiń** — żadnego `browser_navigate` do jej `careers_url` (najdroższa metoda w tokenach) |
| **2 — API** | **Pomiń** — żadnego WebFetch jej `api:` (już objęta parserem; `scan.mjs` też nie używa API po udanym parserze) |
| **3 — WebSearch** | Wykonaj **ogólne** zapytania (`site:`, tytuły ról); **odrzuć** każdy hit, którego znormalizowana firma pokrywa się z `local_parser_ok` |

**Wyjątki:**

- Parser **zawiódł** → firma **nie** wchodzi do `local_parser_ok`; Poziomy 1 i 2 obowiązują normalnie (to samo kryterium co fallback `scan.mjs`, gdy parser zawiedzie i istnieje API ATS).
- Poziom 3: nie wyłączaj zapytań przekrojowych (`site:jobs.ashbyhq.com`, `site:boards.greenhouse.io` itp.) — służą do odkrywania **nowych** firm. Filtruj tylko wyniki firm już w `tracked_companies` z udanym parserem.
- Nie twórz dedykowanych zapytań `search_queries` dla firmy z aktywnym lokalnym parserem (np. `site:jobs.ashbyhq.com/cohere "AI Engineer"`); użyj parsera lub, jeśli zawiedzie, Playwright/API.

**Zalecany Poziom 0:** uruchom `node scan.mjs` (lub `npm run scan`) na początku workflow agenta. Pokrywa to lokalne parsery + API w jednym kroku zero-token i zwraca, które firmy użyły `local-parser` z sukcesem.

### Poziom 1 — Playwright bezpośrednio (GŁÓWNY)

**Dla każdej firmy w `tracked_companies`, która nie jest w `local_parser_ok`:** nawiguj do jej `careers_url` za pomocą Playwright (`browser_navigate` + `browser_snapshot`), przeczytaj WSZYSTKIE widoczne oferty i wyciągnij tytuł + URL każdej. To najbardziej niezawodna metoda, bo:
- Widzi stronę w czasie rzeczywistym (nie zcache'owane wyniki Google)
- Działa z SPA (Ashby, Lever, Workday)
- Wykrywa nowe oferty natychmiast
- Nie zależy od indeksowania Google

**Każda firma MUSI mieć `careers_url` w portals.yml.** Jeśli go nie ma, wyszukaj raz, zapisz i używaj w kolejnych skanach.

### Poziom 2 — API/feedy ATS (UZUPEŁNIAJĄCY)

Dla firm z publicznym API lub strukturalnym feedem **niebędących w `local_parser_ok`** użyj odpowiedzi JSON/XML jako szybkiego uzupełnienia Poziomu 1. Jest szybszy niż Playwright i redukuje błędy scrapingu wizualnego.

**Aktualne wsparcie (zmienne w `{}`):**
- **Greenhouse**: `https://boards-api.greenhouse.io/v1/boards/{company}/jobs`
- **Ashby**: `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **BambooHR**: lista `https://{company}.bamboohr.com/careers/list`; szczegół oferty `https://{company}.bamboohr.com/careers/{id}/detail`
- **Lever**: `https://api.lever.co/v0/postings/{company}?mode=json`
- **Teamtailor**: `https://{company}.teamtailor.com/jobs.rss`
- **Workday**: `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

**Konwencja parsowania per provider:**
- `greenhouse`: `jobs[]` → `title`, `absolute_url`
- `ashby`: GraphQL `ApiJobBoardWithTeams` z `organizationHostedJobsPageName={company}` → `jobBoard.jobPostings[]` (`title`, `id`; zbuduj publiczny URL, jeśli nie ma go w payload)
- `bamboohr`: lista `result[]` → `jobOpeningName`, `id`; zbuduj URL szczegółu `https://{company}.bamboohr.com/careers/{id}/detail`; by przeczytać pełne ogłoszenie, wykonaj GET szczegółu i użyj `result.jobOpening` (`jobOpeningName`, `description`, `datePosted`, `minimumExperience`, `compensation`, `jobOpeningShareUrl`)
- `lever`: tablica główna `[]` → `text`, `hostedUrl` (fallback: `applyUrl`)
- `teamtailor`: pozycje RSS → `title`, `link`
- `workday`: `jobPostings[]`/`jobPostings` (zależnie od tenanta) → `title`, `externalPath` lub URL zbudowany z hosta

### Poziom 3 — Zapytania WebSearch (SZEROKIE ODKRYWANIE)

Zapytania `search_queries` z filtrami `site:` pokrywają portale przekrojowo (wszystkie Ashby, wszystkie Greenhouse itd.). Przydatne do odkrywania NOWYCH firm, których nie ma jeszcze w `tracked_companies`, ale wyniki mogą być nieaktualne. Po odfiltrowaniu hitów firm z `local_parser_ok` pozostałe wyniki deduplikuje się z Poziomami 0-2.

**Priorytet wykonania:**
1. Poziom 0: lokalny parser → firmy ze skonfigurowanym `parser:` i istniejącym skryptem; zbuduj `local_parser_ok`
2. Poziom 1: Playwright → `tracked_companies` z `careers_url`, **z wyjątkiem** `local_parser_ok`
3. Poziom 2: API → `tracked_companies` z `api:`, **z wyjątkiem** `local_parser_ok`
4. Poziom 3: WebSearch → wszystkie `search_queries` z `enabled: true`; odrzuć hity firm z `local_parser_ok`

Poziomy są addytywne — wykonują się po kolei, wyniki łączą się i deduplikują. Firmy z `local_parser_ok` **nie** przechodzą przez Poziomy 1 ani 2; na Poziomie 3 wnoszą tylko odkrywanie przekrojowe (inne firmy na tym samym portalu).

## Workflow

1. **Przeczytaj konfigurację**: `portals.yml`
2. **Przeczytaj historię**: `data/scan-history.tsv` → URL-e już widziane
3. **Przeczytaj źródła dedup**: `data/applications.md` + `data/pipeline.md`

3.5. **Poziom 0 — Lokalny parser** (`scan.mjs`, zero-token):
   Zainicjuj `local_parser_ok = []`.
   Preferuj jednorazowe uruchomienie `node scan.mjs`, by pokryć wszystkie parsery + API zero-token; jeśli robisz to ręcznie, powtórz poniższą logikę.
   Dla każdej firmy w `tracked_companies` z `enabled: true`, `parser.command` i istniejącym skryptem:
   a. Uruchom `parser.command` ze `parser.script` + `parser.args`, używając lokalnego wykonania bez powłoki
   b. Rozwiń placeholdery `{careers_url}` i `{company}` w argumentach
   c. Przeczytaj JSON ze stdout (`[]`, `{ jobs: [] }` lub `{ results: [] }`)
   d. Znormalizuj każdą ofertę do `{title, url, company, location}`
   e. Rozwiąż względne URL-e względem `careers_url`
   f. Jeśli parser zawiedzie, zaloguj błąd, spróbuj fallbacku przez API ATS, jeśli istnieje, i kontynuuj z pozostałymi firmami (**nie** dodawaj do `local_parser_ok`)
   g. Jeśli parser zakończy się sukcesem (kroki c-e bez błędu krytycznego), dodaj `entry.name` do `local_parser_ok` i akumuluj oferty w kandydatach

4. **Poziom 1 — Skan Playwright** (równolegle w paczkach po 3-5):
   Dla każdej firmy w `tracked_companies` z `enabled: true`, zdefiniowanym `careers_url` i **nazwą niewymienioną w `local_parser_ok`**:
   a. `browser_navigate` do `careers_url`
   b. `browser_snapshot`, by przeczytać wszystkie oferty
   c. Jeśli strona ma filtry/działy, nawiguj odpowiednie sekcje
   d. Dla każdej oferty wyciągnij: `{title, url, company}`
   e. Jeśli strona stronicuje wyniki, nawiguj dodatkowe strony
   f. Akumuluj na liście kandydatów
   g. Jeśli `careers_url` zawiedzie (404, redirect), spróbuj `scan_query` jako fallbacku i odnotuj do aktualizacji URL-a

5. **Poziom 2 — API/feedy ATS** (równolegle):
   Dla każdej firmy w `tracked_companies` ze zdefiniowanym `api:`, `enabled: true` i **nazwą niewymienioną w `local_parser_ok`**:
   a. WebFetch URL-a API/feedu
   b. Jeśli `api_provider` jest zdefiniowany, użyj jego parsera; jeśli nie, wywnioskuj z domeny (`boards-api.greenhouse.io`, `jobs.ashbyhq.com`, `api.lever.co`, `*.bamboohr.com`, `*.teamtailor.com`, `*.myworkdayjobs.com`)
   c. Dla **Ashby** wyślij POST z:
      - `operationName: ApiJobBoardWithTeams`
      - `variables.organizationHostedJobsPageName: {company}`
      - zapytanie GraphQL `jobBoardWithTeams` + `jobPostings { id title locationName employmentType compensationTierSummary }`
   d. Dla **BambooHR** lista zwraca tylko podstawowe metadane. Dla każdej istotnej pozycji przeczytaj `id`, wykonaj GET do `https://{company}.bamboohr.com/careers/{id}/detail` i wyciągnij pełne ogłoszenie z `result.jobOpening`. Użyj `jobOpeningShareUrl` jako publicznego URL-a, jeśli przyjdzie; jeśli nie, użyj URL-a szczegółu.
   e. Dla **Workday** wyślij POST JSON z co najmniej `{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}` i stronicuj po `offset`, aż wyczerpiesz wyniki
   f. Dla każdej oferty wyciągnij i znormalizuj: `{title, url, company}`
   g. Akumuluj na liście kandydatów (dedup z Poziomem 1)

6. **Poziom 3 — Zapytania WebSearch** (równolegle, jeśli możliwe):
   Dla każdego zapytania w `search_queries` z `enabled: true` (ogólne zapytania per portal/rola — nie zapytania dedykowane firmie z aktywnym lokalnym parserem):
   a. Wykonaj WebSearch ze zdefiniowanym `query`
   b. Z każdego wyniku wyciągnij: `{title, url, company}`
      - **title**: z tytułu wyniku (przed „ @ " lub „ | ")
      - **url**: URL wyniku
      - **company**: po „ @ " w tytule lub wyciągnij z domeny/ścieżki
   c. **Pomiń** wynik, jeśli `company` (znormalizowane) pokrywa się z jakąś nazwą w `local_parser_ok`
   d. Resztę akumuluj na liście kandydatów (dedup z Poziomem 0+1+2)

6. **Filtruj według tytułu** używając `title_filter` z `portals.yml`:
   - Co najmniej 1 słowo kluczowe z `positive` musi pojawić się w tytule (bez rozróżniania wielkości liter)
   - 0 słów kluczowych z `negative` może się pojawić
   - Słowa `seniority_boost` dają priorytet, ale nie są obowiązkowe

6b. **Filtruj według lokalizacji (opcjonalnie)** używając `location_filter` z `portals.yml`:
   - Jeśli bloku `location_filter` brak, wszystkie lokalizacje przechodzą (zachowanie domyślne)
   - Pusta lokalizacja w ofercie → przechodzi (nie karz brakujących danych)
   - Obecne jakiekolwiek słowo z `block` → odrzuć (priorytet nad allow)
   - `allow` puste → przechodzi (już minęło block)
   - `allow` niepuste → musi pasować co najmniej jedno słowo
   - Wszystkie dopasowania to substring bez rozróżniania wielkości liter
   - Lokalizacja jest zapisywana jako 7. kolumna w `scan-history.tsv` do późniejszego audytu

7. **Deduplikuj** względem 3 źródeł:
   - `scan-history.tsv` → dokładny URL już widziany
   - `applications.md` → firma + znormalizowana rola już oceniona
   - `pipeline.md` → dokładny URL już w oczekujących lub przetworzonych

7.5. **Zweryfikuj liveness wyników WebSearch (Poziom 3)** — PRZED dodaniem do pipeline'u:

   Wyniki WebSearch mogą być nieaktualne (Google cache'uje wyniki przez tygodnie lub miesiące). By uniknąć oceny wygasłych ofert, zweryfikuj przez Playwright każdy nowy URL pochodzący z Poziomu 3. Poziomy 1 i 2 są z natury w czasie rzeczywistym i nie wymagają tej weryfikacji.

   Dla każdego nowego URL-a z Poziomu 3 (sekwencyjnie — NIGDY Playwright równolegle):
   a. `browser_navigate` do URL-a
   b. `browser_snapshot`, by przeczytać treść
   c. Sklasyfikuj:
      - **Aktywna**: widoczny tytuł stanowiska + opis roli + widoczny element Apply/Submit/Aplikuj w głównej treści. Nie licz generycznego tekstu z headera/navbara/stopki.
      - **Wygasła** (którykolwiek z tych sygnałów):
        - Końcowy URL zawiera `?error=true` (Greenhouse tak przekierowuje, gdy oferta jest zamknięta)
        - Strona zawiera: „job no longer available" / „no longer open" / „position has been filled" / „this job has expired" / „page not found"
        - Widoczne tylko navbar i stopka, bez treści ogłoszenia (treść < ~300 znaków)
   d. Jeśli wygasła: zarejestruj w `scan-history.tsv` ze statusem `skipped_expired` i odrzuć
   e. Jeśli aktywna: przejdź do kroku 8

   **Nie przerywaj całego skanu, jeśli jeden URL zawiedzie.** Jeśli `browser_navigate` da błąd (timeout, 403 itp.), oznacz jako `skipped_expired` i kontynuuj z następnym.

8. **Dla każdej nowej zweryfikowanej oferty, która przejdzie filtry**:
   a. Dodaj do `pipeline.md` sekcja „Oczekujące": `- [ ] {url} | {company} | {title}`
   b. Zarejestruj w `scan-history.tsv`: `{url}\t{date}\t{query_name}\t{title}\t{company}\tadded`

9. **Oferty odfiltrowane po tytule**: zarejestruj w `scan-history.tsv` ze statusem `skipped_title`
10. **Oferty zduplikowane**: zarejestruj ze statusem `skipped_dup`
11. **Oferty wygasłe (Poziom 3)**: zarejestruj ze statusem `skipped_expired`

## Wyciąganie tytułu i firmy z wyników WebSearch

Wyniki WebSearch przychodzą w formacie: `"Job Title @ Company"` lub `"Job Title | Company"` lub `"Job Title — Company"`.

Wzorce wyciągania per portal:
- **Ashby**: `"Senior AI PM (Remote) @ EverAI"` → title: `Senior AI PM`, company: `EverAI`
- **Greenhouse**: `"AI Engineer at Anthropic"` → title: `AI Engineer`, company: `Anthropic`
- **Lever**: `"Product Manager - AI @ Temporal"` → title: `Product Manager - AI`, company: `Temporal`

Generyczny regex: `(.+?)(?:\s*[@|—–-]\s*|\s+at\s+)(.+?)$`

## Prywatne URL-e

Jeśli znajdziesz URL niedostępny publicznie:
1. Zapisz ogłoszenie w `jds/{company}-{role-slug}.md`
2. Dodaj do pipeline.md jako: `- [ ] local:jds/{company}-{role-slug}.md | {company} | {title}`

## Historia skanów

`data/scan-history.tsv` śledzi WSZYSTKIE widziane URL-e:

```
url	first_seen	portal	title	company	status
https://...	2026-02-10	Ashby — AI PM	PM AI	Acme	added
https://...	2026-02-10	Greenhouse — SA	Junior Dev	BigCo	skipped_title
https://...	2026-02-10	Ashby — AI PM	SA AI	OldCo	skipped_dup
https://...	2026-02-10	WebSearch — AI PM	PM AI	ClosedCo	skipped_expired
```

## Podsumowanie wyjścia

```
Skan portali — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Wykonane zapytania: N
Znalezione oferty: N łącznie
Odfiltrowane po tytule: N trafnych
Zduplikowane: N (już ocenione lub w pipeline)
Wygasłe odrzucone: N (martwe linki, Poziom 3)
Nowe dodane do pipeline.md: N

  + {company} | {title} | {query_name}
  ...

→ Uruchom /career-ops pipeline, by ocenić nowe oferty.
```

## Zarządzanie careers_url

Każda firma w `tracked_companies` musi mieć `careers_url` — bezpośredni URL do jej strony z ofertami. To unika wyszukiwania za każdym razem.

**REGUŁA: Zawsze używaj korporacyjnego URL-a firmy; sięgaj po endpoint ATS tylko, gdy firma nie ma własnej strony korporacyjnej.**

`careers_url` powinien wskazywać własną stronę kariery firmy zawsze, gdy jest dostępna. Wiele firm używa pod spodem Workday, Greenhouse lub Lever, ale wystawia ID ofert tylko przez swoją domenę korporacyjną. Użycie bezpośredniego URL-a ATS, gdy istnieje strona korporacyjna, może powodować fałszywe błędy 410, bo ID stanowisk się nie zgadzają.

| ✅ Poprawne (korporacyjny) | ❌ Niepoprawne jako pierwszy wybór (bezpośredni ATS) |
|---|---|
| `https://careers.mastercard.com` | `https://mastercard.wd1.myworkdayjobs.com` |
| `https://openai.com/careers` | `https://job-boards.greenhouse.io/openai` |
| `https://stripe.com/jobs` | `https://jobs.lever.co/stripe` |

Fallback: jeśli masz tylko bezpośredni URL ATS, nawiguj najpierw do strony firmy i zlokalizuj jej korporacyjną stronę kariery. Użyj bezpośredniego URL-a ATS tylko, jeśli firma nie ma własnej strony korporacyjnej.

**Znane wzorce per platforma:**
- **Ashby:** `https://jobs.ashbyhq.com/{slug}`
- **Greenhouse:** `https://job-boards.greenhouse.io/{slug}` lub `https://job-boards.eu.greenhouse.io/{slug}`
- **Lever:** `https://jobs.lever.co/{slug}`
- **BambooHR:** lista `https://{company}.bamboohr.com/careers/list`; szczegół `https://{company}.bamboohr.com/careers/{id}/detail`
- **Teamtailor:** `https://{company}.teamtailor.com/jobs`
- **Workday:** `https://{company}.{shard}.myworkdayjobs.com/{site}`
- **Custom:** własny URL firmy (np. `https://openai.com/careers`)

**Wzorce API/feedów per platforma:**
- **Ashby API:** `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **BambooHR API:** lista `https://{company}.bamboohr.com/careers/list`; szczegół `https://{company}.bamboohr.com/careers/{id}/detail` (`result.jobOpening`)
- **Lever API:** `https://api.lever.co/v0/postings/{company}?mode=json`
- **Teamtailor RSS:** `https://{company}.teamtailor.com/jobs.rss`
- **Workday API:** `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

**Jeśli `careers_url` nie istnieje** dla firmy:
1. Spróbuj wzorca jej znanej platformy
2. Jeśli zawiedzie, zrób szybki WebSearch: `"{company}" careers jobs`
3. Nawiguj przez Playwright, by potwierdzić, że działa
4. **Zapisz znaleziony URL w portals.yml** do przyszłych skanów

**Jeśli `careers_url` zwraca 404 lub redirect:**
1. Odnotuj w podsumowaniu wyjścia
2. Spróbuj scan_query jako fallbacku
3. Oznacz do ręcznej aktualizacji

## Utrzymanie portals.yml

- **ZAWSZE zapisuj `careers_url`** przy dodawaniu nowej firmy
- Dodawaj nowe zapytania w miarę odkrywania ciekawych portali lub ról
- Wyłączaj zapytania przez `enabled: false`, jeśli generują za dużo szumu
- Dostosowuj słowa kluczowe filtrowania w miarę ewolucji ról docelowych
- Dodawaj firmy do `tracked_companies`, gdy chcesz je śledzić z bliska
- Weryfikuj `careers_url` okresowo — firmy zmieniają platformy ATS
