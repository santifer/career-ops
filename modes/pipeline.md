# Tryb: pipeline — Skrzynka URL (drugi mózg)

Przetwarzaj URL-e ofert zapisane w `data/pipeline.md`. Użytkownik dodaje URL-e w dowolnym momencie, a potem wykonuje `/career-ops pipeline`, aby przetworzyć je wszystkie.

## Przebieg

1. **Przeczytaj** `data/pipeline.md` → szukaj pozycji `- [ ]` w sekcji "Oczekujące" ("Pending")
2. **Dla każdego oczekującego URL-a**:
   a. Oblicz kolejny numer sekwencyjny `REPORT_NUM` (przeczytaj `reports/`, weź najwyższy numer + 1)
   b. **Wyciągnij ogłoszenie** przez Playwright (browser_navigate + browser_snapshot) → WebFetch → WebSearch
   c. Jeśli URL niedostępny → oznacz jako `- [!]` z notką i kontynuuj
   d. **Wykonaj pełny auto-pipeline**: Ocena A-F → Raport .md → PDF (jeśli ocena >= `auto_pdf_score_threshold`) → Tracker
   e. **Przenieś z "Oczekujące" do "Przetworzone"**: `- [x] #NNN | URL | Firma | Rola | Ocena/5 | PDF ✅/❌`

   **O bramce PDF (konfigurowalna):** Przeczytaj `config/profile.yml` → `auto_pdf_score_threshold`. Jeśli klucz nie istnieje, domyślnie `3.0` (pierwotna bramka tego trybu). Jeśli ocena jest mniejsza niż próg, pomiń generowanie PDF: zapisz raport normalnie, pokaż w nagłówku `**PDF:** nie wygenerowano — uruchom /career-ops pdf {company-slug}, by stworzyć na żądanie`, i oznacz PDF ❌ w trackerze. Jeśli ocena ≥ próg, wygeneruj PDF jak zwykle.

   **Strojenie:** Generowanie dopasowanego PDF kosztuje ~30–60 s na wpis (start Playwright + render HTML) i produkuje pliki często nieużywane — większość ról dostaje 2.x/3.x i nigdy nie dochodzi do etapu aplikacji. Podnieś `auto_pdf_score_threshold` (np. `4.0`), aby dla ofert granicznych zapisywać tylko raport i tworzyć PDF na żądanie przez `/career-ops pdf {slug}`; ustaw `0`, by generować dla każdej oferty. Oba tryby (Ścieżka A `/career-ops pipeline` i Ścieżka B `batch/batch-runner.sh`) czytają ten sam klucz, więc zachowanie jest identyczne niezależnie od ścieżki.
3. **Jeśli są 3+ oczekujące URL-e**, uruchom agentów równolegle (narzędzie Agent z `run_in_background`), by zmaksymalizować szybkość.
4. **Na końcu** pokaż tabelę podsumowania:

```
| # | Firma | Rola | Ocena | PDF | Rekomendowane działanie |
```

## Format pipeline.md

```markdown
## Oczekujące
- [ ] https://jobs.example.com/posting/123
- [ ] https://boards.greenhouse.io/company/jobs/456 | Company Inc | Senior PM
- [!] https://private.url/job — Błąd: wymagane logowanie

## Przetworzone
- [x] #143 | https://jobs.example.com/posting/789 | Acme Corp | AI PM | 4.2/5 | PDF ✅
- [x] #144 | https://boards.greenhouse.io/xyz/jobs/012 | BigCo | SA | 2.1/5 | PDF ❌
```

## Inteligentne wykrywanie ogłoszenia z URL

1. **Playwright (preferowane):** `browser_navigate` + `browser_snapshot`. Działa ze wszystkimi SPA.
2. **WebFetch (zapasowo):** Dla stron statycznych lub gdy Playwright niedostępny.
3. **WebSearch (ostateczność):** Szukaj w wtórnych portalach indeksujących ogłoszenie.

**Przypadki specjalne:**
- **LinkedIn**: Może wymagać logowania → oznacz `[!]` i poproś użytkownika o wklejenie tekstu
- **PDF**: Jeśli URL wskazuje na PDF, przeczytaj go bezpośrednio narzędziem Read
- **Prefiks `local:`**: Przeczytaj plik lokalny. Przykład: `local:jds/linkedin-pm-ai.md` → przeczytaj `jds/linkedin-pm-ai.md`

## Automatyczne numerowanie

1. Wylistuj wszystkie pliki w `reports/`
2. Wyciągnij numer z prefiksu (np. `142-medispend...` → 142)
3. Nowy numer = maksymalny znaleziony + 1

## Synchronizacja źródeł

Przed przetworzeniem dowolnego URL-a zweryfikuj synchronizację:
```bash
node cv-sync-check.mjs
```
Jeśli jest rozsynchronizowanie, ostrzeż użytkownika przed kontynuacją.
