# Tryb: oferta -- pełna ocena A-G

Gdy użytkownik poda ofertę pracy jako URL albo tekst, zawsze przygotuj pełną ocenę: bloki A-F plus blok G dotyczący wiarygodności ogłoszenia.

## Krok 0 -- Identyfikacja arketypu

1. Przeczytaj `modes/pl/_shared.md`.
2. Przeczytaj `modes/_profile.md`, bo personalizacja użytkownika nadpisuje domyślne arketypy.
3. Sklasyfikuj ofertę jako jeden główny arketyp albo hybrydę dwóch najbliższych.

Arketyp decyduje o tym:
- jakie proof points pokazać w bloku B,
- jak zaproponować zmiany w CV w bloku E,
- jakie historie STAR+R przygotować w bloku F,
- jak ocenić realne dopasowanie, nie tylko keyword match.

## Blok A -- Podsumowanie roli

Zrób zwięzłą tabelę:

| Pole | Wartość |
|------|---------|
| Firma | ... |
| Rola | ... |
| Wykryty arketyp | ... |
| Domeny | e-commerce / SaaS / agency / product / fintech / enterprise / AI / inne |
| Funkcja | budowanie / utrzymanie / modernizacja / konsulting / leadership / delivery |
| Seniority | junior / mid / senior / lead / staff |
| Tryb pracy | zdalnie / hybrydowo / biuro / niejasne |
| Lokalizacja | Polska / EU / EMEA / global / konkretne miasto |
| Forma współpracy | UoP / B2B / kontrakt / niejasne |
| Wynagrodzenie | widełki i waluta, jeśli podane |
| Flagi decyzji | `project_based`, `fixed_term`, `temporary_relocation_candidate`, `needs_extension_check`, `needs_rate_premium` albo `brak` |
| TL;DR | jedna konkretna sentencja |

## Blok B -- Dopasowanie do CV

Przeczytaj `cv.md`. Stwórz tabelę, która mapuje wymagania z oferty na konkretne dowody z CV.

| Wymaganie z oferty | Dowód w CV | Siła dopasowania | Komentarz |
|--------------------|------------|------------------|-----------|
| ... | cytat / sekcja / metryka | Mocne / Średnie / Słabe | ... |

Zasady:
- Cytuj konkretne metryki tylko z `cv.md` albo `article-digest.md`.
- Jeśli metryka w CV ma adnotację typu "REFERENCE METRIC -- VERIFY", oznacz ją jako do potwierdzenia przed publikacją.
- Nie uznawaj samego podobieństwa technologii za pełne dopasowanie; oceń zakres odpowiedzialności.

**Sekcja luk:**
Dla każdej luki odpowiedz:
1. Czy to blocker, czy nice-to-have?
2. Czy kandydat ma doświadczenie pokrewne?
3. Czy da się to pokryć portfolio, case study albo krótką odpowiedzią w liście?
4. Jak to nazwać uczciwie w aplikacji?

## Blok C -- Poziom i strategia

Oceń:

1. Poziom z oferty vs naturalny poziom kandydata dla tego arketypu.
2. Jak sprzedać seniority bez przesady:
   - jakie metryki pokazać,
   - jaki zakres ownership podkreślić,
   - jakie słowa z JD wykorzystać.
3. Co zrobić, jeśli firma chce downlevel:
   - czy scope nadal jest wart rozmowy,
   - czy wynagrodzenie rekompensuje niższy tytuł,
   - czy prosić o 6-miesięczny review i konkretne kryteria awansu.

## Blok D -- Wynagrodzenie i popyt

Użyj WebSearch. Dla polskich ofert sprawdzaj źródła typu:
- No Fluff Jobs,
- Just Join IT,
- The Protocol,
- Bulldogjob,
- Pracuj.pl,
- Glassdoor,
- Levels.fyi, jeśli firma jest globalna,
- raporty płacowe dla IT w Polsce, jeśli są aktualne.

Tabela:

| Źródło | Dane | Jak interpretować |
|--------|------|-------------------|
| ... | ... | ... |

Uwzględnij:
- UoP vs B2B,
- brutto vs netto + VAT,
- walutę,
- płatny urlop przy B2B,
- benefit package,
- remote/hybrid policy,
- czy stawka jest zgodna z targetem z `config/profile.yml`.

Jeśli nie ma wiarygodnych danych, napisz to wprost. Nie wymyślaj widełek.

## Blok E -- Plan personalizacji

Zaproponuj zmiany pod tę konkretną ofertę.

| # | Sekcja | Obecnie | Proponowana zmiana | Dlaczego |
|---|--------|---------|--------------------|----------|
| 1 | Summary | ... | ... | ... |

Dodaj:
- top 5 zmian w CV,
- top 5 zmian w LinkedIn,
- 5-10 słów kluczowych ATS z oferty,
- czy warto robić osobny case study / portfolio note.

Nie edytuj `cv.md` automatycznie bez prośby użytkownika.

## Blok F -- Plan rozmowy rekrutacyjnej

Przygotuj 6-10 historii STAR+R:

| # | Wymaganie z oferty | Historia STAR+R | S | T | A | R | Refleksja |
|---|--------------------|-----------------|---|---|---|---|-----------|

Refleksja pokazuje seniority: czego kandydat się nauczył, co powtórzyłby inaczej, jakie trade-offy rozumie.

Jeśli istnieje `interview-prep/story-bank.md`, sprawdź, czy historia już tam jest. Jeśli nie ma, dodaj nową historię po ocenie.

Dodaj:
- najważniejsze pytania, które kandydat powinien zadać firmie,
- czerwone flagi i jak na nie odpowiedzieć,
- który proof point z CV ma być "hero story" w rozmowie.

Jeśli oferta ma flagi projektowe / fixed-term / relokacyjne, dodaj obowiązkowe pytania do rekrutera:
- dokładna data końca projektu i oczekiwany wymiar godzin,
- prawdopodobieństwo przedłużenia albo kolejnego projektu,
- płatne przerwy/urlop, okres wypowiedzenia i przerwy między projektami,
- kto jest klientem/projektem i jaki jest realny ownership,
- jak często trzeba być onsite i czy tymczasowa relokacja ma sens,
- czy stawka uwzględnia premium za ryzyko kontraktowe.

## Blok G -- Wiarygodność ogłoszenia

Oceń, czy oferta wygląda na realną i aktywną. To osobna ocena, nie część score 1-5.

**Analizuj po kolei:**

1. **Świeżość ogłoszenia**
   - data publikacji albo "X dni temu",
   - aktywny przycisk aplikacji,
   - czy URL przekierowuje na ogólną stronę karier.

2. **Jakość opisu**
   - konkretne technologie,
   - zakres pierwszych 6-12 miesięcy,
   - zespół i raportowanie,
   - realistyczne wymagania,
   - stosunek konkretów do ogólnego boilerplate.

3. **Sygnały firmy**
   - WebSearch: `"{firma}" layoffs {rok}`,
   - WebSearch: `"{firma}" hiring freeze {rok}`,
   - dla polskich firm: `"{firma}" zwolnienia`, `"{firma}" opinie praca`, `"{firma}" rekrutacja`.

4. **Reposty**
   - sprawdź `data/scan-history.tsv`, jeśli istnieje,
   - czy podobna rola wraca z nowym URL-em.

5. **Kontekst rynku**
   - czy rola jest typowa i szybko obsadzana,
   - czy to senior/niszowa rola, która naturalnie trwa dłużej,
   - czy evergreen hiring jest jawnie nazwany.

**Wynik:**
- **High Confidence**
- **Proceed with Caution**
- **Suspicious**

Pokaż tabelę sygnałów:

| Sygnał | Obserwacja | Waga | Wniosek |
|--------|------------|------|---------|

Nie przedstawiaj podejrzeń jako faktów.

---

## Wynik globalny

Podaj score `X.X/5` i decyzje:

- **Apply now** -- 4.5+
- **Apply** -- 4.0-4.4
- **Maybe, only with a reason** -- 3.5-3.9
- **Skip** -- poniżej 3.5

Jeśli score jest poniżej 4.0, wyraźnie odradź aplikowanie, chyba że użytkownik ma konkretny powód.

Pokaż też krótką sekcję `Score Breakdown`, ale bez dodatkowych kar, soft ceilingów ani osobnej logiki. Ma to być tylko czytelne rozbicie tej samej oceny globalnej:

Jeśli oferta jest projektowa, freelance, fixed-term albo wymaga potencjalnej tymczasowej relokacji, opisz to jako flagę decyzyjną. Nie odejmuj punktów tylko za sam fixed-term albo możliwość relokacji. Odejmuj punkty dopiero za konkretne problemy: słabą stawkę wobec ryzyka, niejasne przedłużenie, długoterminowy mandatory onsite, słaby fit techniczny albo nieprzejrzysty projekt/klienta.

| Wymiar | Score | Uzasadnienie |
|--------|-------|--------------|
| Dopasowanie do CV | X/5 | ... |
| Dopasowanie do North Star | X/5 | ... |
| Wynagrodzenie | X/5 | ... |
| Sygnały kultury i stabilności | X/5 | ... |
| Red flags | -X | ... |
| **Global** | **X.X/5** | Ta sama ocena co w nagłówku raportu |

## Po ocenie

### 1. Zapisz raport

Zapisz raport jako:

```text
reports/{###}-{company-slug}-{YYYY-MM-DD}.md
```

Wymagany nagłówek:

```markdown
# Evaluation: {Company} -- {Role}

**Date:** {YYYY-MM-DD}
**URL:** {job URL}
**Archetype:** {detected archetype}
**Score:** {X.X/5}
**Legitimacy:** {High Confidence | Proceed with Caution | Suspicious}
**PDF:** {path or pending}
```

W raporcie zachowaj sekcje:
- `## A) Role Summary`
- `## B) Match with CV`
- `## C) Level and Strategy`
- `## D) Comp and Demand`
- `## E) Customization Plan`
- `## F) Interview Plan`
- `## G) Posting Legitimacy`
- `## Score Breakdown`
- `## Machine Summary`

`## Machine Summary` powinno być YAML-em, jeśli repo tego wymaga w aktualnych raportach. Jeśli dotyczy, dodaj:

```yaml
decision_flags:
  - project_based
project_terms:
  end_date: unknown
  extension_path: needs_check
  onsite_or_relocation: needs_check
  rate_premium: needs_check
```

### 2. Zapisz wpis do trackera

Nie dodawaj nowych wpisów bezpośrednio do `data/applications.md`.

Zapisz TSV:

```tsv
{num}\t{date}\t{company}\t{role}\tEvaluated\t{score}/5\t{pdf_emoji}\t[{num}](reports/{num}-{slug}-{date}.md)\t{note}
```

Potem uruchom:

```bash
node merge-tracker.mjs
```

Jeśli firma + rola już istnieje, zaktualizuj istniejący wpis zamiast tworzyć duplikat.
