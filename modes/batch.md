# Tryb: batch — Masowe przetwarzanie ofert

Dwa tryby użycia: **conductor --chrome** (nawiguje portale w czasie rzeczywistym) lub **standalone** (skrypt dla już zebranych URL-i).

## Architektura

```text
Conductor (tryb przeglądarki z UI)
  │
  │  Chrome: nawiguje portale (zalogowane sesje)
  │  Czyta DOM bezpośrednio — użytkownik widzi wszystko na żywo
  │
  ├─ Oferta 1: czyta ogłoszenie z DOM + URL
  │    └─► headless worker → raport .md + PDF + linia trackera
  │
  ├─ Oferta 2: kliknij następną, czytaj ogłoszenie + URL
  │    └─► headless worker → raport .md + PDF + linia trackera
  │
  └─ Koniec: scal tracker-additions → applications.md + podsumowanie
```

Każdy worker to headless proces potomny z czystym kontekstem 200K tokenów. Conductor tylko orkiestruje. Patrz tabela **Headless / Batch Mode** w `AGENTS.md` dla poprawnej komendy per CLI.

## Pliki

```text
batch/
  batch-input.tsv               # URL-e (z conductora lub ręcznie)
  batch-state.tsv               # Postęp (auto-generowany, gitignored)
  batch-runner.sh               # Skrypt orkiestratora standalone
  batch-prompt.md               # Szablon promptu dla workerów
  logs/                         # Jeden log na ofertę (gitignored)
  tracker-additions/            # Linie trackera (gitignored)
```

## Tryb A: Conductor --chrome

1. **Przeczytaj stan**: `batch/batch-state.tsv` → zidentyfikuj, co już przetworzono
2. **Nawiguj portal**: Chrome → URL wyszukiwania
3. **Wyciągnij URL-e**: Przeczytaj DOM wyników → wyciągnij listę URL-i → dopisz do `batch-input.tsv`
4. **Dla każdego oczekującego URL-a**:
   a. Chrome: kliknij ofertę → przeczytaj tekst ogłoszenia z DOM
   b. Zapisz ogłoszenie do `/tmp/batch-jd-{id}.txt`
   c. Oblicz kolejny numer sekwencyjny REPORT_NUM
   d. Wykonaj przez Bash:

      ```bash
      # Użyj komendy headless swojego CLI (patrz AGENTS.md — Headless / Batch Mode)
      <headless-cmd> "Przetwórz tę ofertę. URL: {url}. Ogłoszenie: /tmp/batch-jd-{id}.txt. Raport: {num}. ID: {id}"
      ```

   e. Zaktualizuj `batch-state.tsv` (completed/failed + ocena + report_num)
   f. Zaloguj do `logs/{report_num}-{id}.log`
   g. Chrome: wróć → następna oferta
5. **Paginacja**: Jeśli brak ofert → kliknij "Następna" → powtórz
6. **Koniec**: Scal `tracker-additions/` → `applications.md` + podsumowanie

## Tryb B: Skrypt standalone

```bash
batch/batch-runner.sh [OPCJE]
```

Opcje:
- `--dry-run` — wylistuj oczekujące oferty bez wykonywania
- `--retry-failed` — ponów tylko nieudane oferty
- `--start-from N` — zacznij od ID N
- `--parallel N` — N workerów równolegle
- `--max-retries N` — próby na ofertę (domyślnie: 2)

## Format batch-state.tsv

```text
id	url	status	started_at	completed_at	report_num	score	error	retries
1	https://...	completed	2026-...	2026-...	002	4.2	-	0
2	https://...	failed	2026-...	2026-...	-	-	Error msg	1
3	https://...	pending	-	-	-	-	-	0
```

## Wznawialność

- Jeśli się wywali → uruchom ponownie → czyta `batch-state.tsv` → pomija ukończone oferty
- Plik blokady (`batch-runner.pid`) zapobiega podwójnemu wykonaniu
- Każdy worker jest niezależny: porażka oferty #47 nie wpływa na pozostałe

## Workery (tryb headless)

Każdy worker dostaje `batch-prompt.md` jako prompt systemowy. Jest samowystarczalny. Użyj komendy headless swojego CLI — patrz tabela **Headless / Batch Mode** w `AGENTS.md`.

Worker produkuje:
1. Raport `.md` w `reports/`
2. PDF w `output/`
3. Linię trackera w `batch/tracker-additions/{id}.tsv`
4. Wynik JSON przez stdout

## Obsługa błędów

| Błąd | Naprawa |
|------|---------|
| URL niedostępny | Worker pada → conductor oznacza `failed`, kontynuuje |
| Ogłoszenie za logowaniem | Conductor próbuje czytać DOM. Jeśli pada → `failed` |
| Portal zmienia layout | Conductor wnioskuje o HTML, adaptuje się |
| Worker pada | Conductor oznacza `failed`, kontynuuje. Ponów z `--retry-failed` |
| Conductor pada | Uruchom ponownie → czyta stan → pomija ukończone oferty |
| PDF pada | Raport .md jest zapisany. PDF pozostaje oczekujący |
