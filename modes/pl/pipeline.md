# Tryb: pipeline -- skrzynka URL-i z ofertami

Przetwarza URL-e zapisane w `data/pipeline.md`. Użytkownik może zbierać linki do ofert przez kilka dni, a potem uruchomić `/career-ops pipeline`, żeby przetworzyć je zbiorczo.

## Workflow

1. **Przeczytaj** `data/pipeline.md` i znajdź pozycje `- [ ]` w sekcji "Pending" albo jej lokalnym odpowiedniku.
2. **Dla każdego pending URL-a**:
   a. Zarezerwuj kolejny `REPORT_NUM` przez `node reserve-report-num.mjs` i zwolnij sentinel po zapisaniu raportu przez `node reserve-report-num.mjs --release <num>`.
   b. Wyciągnij JD: Playwright (`browser_navigate` + `browser_snapshot`) → WebFetch → WebSearch.
   c. Jeśli URL jest niedostępny, oznacz go jako `- [!]` z krótką notatką i przejdź dalej.
   d. Uruchom pełny auto-pipeline: ocena A-F → raport `.md` → PDF według progu `auto_pdf_score_threshold` → tracker.
   e. Przenieś wpis z "Pending" do "Processed": `- [x] #NNN | URL | Company | Role | Score/5 | PDF ✅/❌`.

**Próg PDF:** przeczytaj `config/profile.yml` → `auto_pdf_score_threshold`. Jeśli klucz nie istnieje, domyślnie użyj `3.0`. Jeśli score jest niższy niż próg, zapisz raport bez PDF, wpisz w nagłówku `**PDF:** not generated — run /career-ops pdf {company-slug} to create on demand` i oznacz PDF jako ❌ w trackerze. Jeśli score jest równy lub wyższy od progu, wygeneruj PDF normalnie.

3. **Jeśli są 3+ pending URL-e**, uruchom agentów równolegle zgodnie z bazowym trybem pipeline.
4. **Na końcu** pokaż tabelę:

```markdown
| # | Firma | Rola | Score | PDF | Rekomendowany następny krok |
```

## Format `data/pipeline.md`

```markdown
## Pending
- [ ] https://jobs.example.com/posting/123
- [ ] https://boards.greenhouse.io/company/jobs/456 | Company Inc | Senior PM
- [!] https://private.url/job -- Error: login required

## Processed
- [x] #143 | https://jobs.example.com/posting/789 | Acme Corp | AI PM | 4.2/5 | PDF ✅
- [x] #144 | https://boards.greenhouse.io/xyz/jobs/012 | BigCo | SA | 2.1/5 | PDF ❌
```

Polskie nagłówki też są akceptowalne, jeśli już istnieją w pliku:

```markdown
## Oczekujące
- [ ] https://example.com/jobs/123

## Przetworzone
- [x] #001 | https://example.com/jobs/123 | Example | Senior Engineer | 4.2/5 | PDF ✅
```

Przy zapisie zachowaj styl nagłówków, który już istnieje w pliku.

## Wykrywanie JD z URL-a

1. **Playwright (preferowane):** `browser_navigate` + `browser_snapshot`. Działa z większością SPA.
2. **WebFetch (fallback):** dla statycznych stron lub gdy Playwright jest niedostępny.
3. **WebSearch (ostatnia opcja):** szukaj w portalach wtórnych, które indeksują JD.

Przypadki specjalne:

- **LinkedIn:** może wymagać logowania; oznacz `[!]` i poproś użytkownika o wklejenie treści.
- **PDF:** jeśli URL prowadzi do PDF, odczytaj plik bezpośrednio.
- **`local:` prefix:** czytaj lokalny plik, np. `local:jds/linkedin-pm-ai.md` → `jds/linkedin-pm-ai.md`.

## Automatyczna numeracja

1. Uruchom `node reserve-report-num.mjs`, żeby zarezerwować kolejny numer raportu.
2. Zapisz raport z tym numerem.
3. Po zapisaniu raportu uruchom `node reserve-report-num.mjs --release {###}`.

## Synchronizacja źródeł

Przed przetwarzaniem pierwszego URL-a uruchom:

```bash
node cv-sync-check.mjs
```

Jeśli są ostrzeżenia o niespójności CV/profilu, pokaż je użytkownikowi przed kontynuacją.

## Polskie niuanse przy ocenie z pipeline

- Rozróżniaj UoP, B2B, umowę zlecenie i kontrakt. Nie porównuj brutto UoP bezpośrednio z netto + VAT na B2B.
- Jeśli widełki są podane jako netto + VAT, traktuj je jako B2B, chyba że JD mówi inaczej.
- Jeśli oferta nie określa formy współpracy, oznacz to jako lukę do wyjaśnienia.
- Zwracaj uwagę na okres wypowiedzenia, płatny urlop przy B2B, L4, benefity i realny model pracy.
- Nie udzielaj porad podatkowych. Przy PIT/ZUS/VAT zasugeruj potwierdzenie z księgowością.

## Podsumowanie końcowe

Po zakończeniu pokaż:

```markdown
| # | Firma | Rola | Score | Legitimacy | PDF | Rekomendacja |
```

Dla ofert poniżej 4.0/5 jasno napisz, że aplikowanie nie jest rekomendowane, chyba że użytkownik ma strategiczny powód.
