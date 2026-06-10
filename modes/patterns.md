# Tryb: patterns — Detektor wzorców odrzuceń

## Cel

Analizuj wszystkie śledzone aplikacje, by znaleźć wzorce w wynikach i wydobyć praktyczne wnioski. Identyfikuje, co działa (archetypy, polityki remote, zakresy ocen) i co marnuje czas (role z ograniczeniem geo, niedopasowanie stacku, aplikacje o niskiej ocenie).

## Wejścia

- `data/applications.md` — Tracker aplikacji
- `reports/` — Pojedyncze raporty oceny
- `config/profile.yml` — Profil użytkownika (kontekst rekomendacji)
- `modes/_profile.md` — Archetypy i ramowanie użytkownika
- `portals.yml` — Konfiguracja portali (rekomendacje aktualizacji filtrów)

## Próg minimalny

Przed uruchomieniem analizy sprawdź: czy `data/applications.md` ma co najmniej 5 wpisów ze statusem poza "Evaluated" (tj. Applied, Responded, Interview, Offer, Rejected, Discarded, SKIP)?

Jeśli nie, powiedz użytkownikowi:
> "Za mało danych — {N}/5 aplikacji przeszło poza ocenę. Aplikuj dalej i wróć, gdy będziesz mieć więcej wyników do analizy."

Zakończ łagodnie.

## Krok 1 — Uruchom skrypt analizy

Wykonaj:

```bash
node analyze-patterns.mjs
```

Sparsuj wyjście JSON. Zawiera:

| Klucz | Zawartość |
|-------|-----------|
| `metadata` | Łącznie wpisów, zakres dat, data analizy, liczniki wg wyniku |
| `funnel` | Liczba per etap statusu (evaluated, applied, interview, offer itp.) |
| `scoreComparison` | Śr./min/maks. ocena per grupa wyniku (positive, negative, self_filtered, pending) |
| `archetypeBreakdown` | Per archetyp: total, positive, negative, self_filtered, współczynnik konwersji |
| `blockerAnalysis` | Najczęstsze twarde blokery: geo-restriction, stack-mismatch, seniority, onsite |
| `remotePolicy` | Per koszyk polityki: total, positive, negative, współczynnik konwersji |
| `companySizeBreakdown` | Per koszyk wielkości: startup, scaleup, enterprise |
| `scoreThreshold` | Rekomendowana minimalna ocena + uzasadnienie |
| `techStackGaps` | Najczęstsze luki technologiczne w wynikach negatywnych |
| `recommendations` | Top 5 działań z uzasadnieniem i poziomem wpływu |

Jeśli skrypt zwróci `error`, wyświetl komunikat błędu i zakończ.

## Krok 2 — Wygeneruj raport

Zapisz raport do `reports/pattern-analysis-{YYYY-MM-DD}.md`.

### Struktura raportu

```markdown
# Analiza wzorców — {YYYY-MM-DD}

**Przeanalizowane aplikacje:** {total}
**Zakres dat:** {od} do {do}
**Wyniki:** {positive} pozytywnych, {negative} negatywnych, {self_filtered} odfiltrowanych, {pending} oczekujących

---

## Lejek konwersji

Pokaż każdy status z liczbą i procentem całości. Użyj prostej tabeli:

| Etap | Liczba | % |
|------|--------|---|
| Evaluated | X | X% |
| Applied | X | X% |
| ... | | |

## Ocena vs wynik

| Wynik | Śr. ocena | Min | Maks | Liczba |
|-------|-----------|-----|------|--------|
| Pozytywny | X.X/5 | X.X | X.X | X |
| Negatywny | ... | | | |
| Odfiltrowany | ... | | | |
| Oczekujący | ... | | | |

## Skuteczność archetypów

Tabela z każdym archetypem, łączną liczbą aplikacji, wynikami pozytywnymi, współczynnikiem konwersji.
Wyróżnij najlepiej i najgorzej działający archetyp.

## Główne blokery

Tabela częstotliwości powracających twardych blokerów (geo-restriction, stack-mismatch itp.).
Odnotuj procent wszystkich aplikacji dotkniętych każdym.

## Wzorce polityki remote

Tabela pokazująca współczynnik konwersji wg koszyka polityki remote (global, regional, geo-restricted, hybrid/onsite).

## Luki w stacku technologicznym

Lista najczęstszych brakujących umiejętności w wynikach negatywnych/odfiltrowanych z częstotliwością.

## Rekomendowany próg oceny

Podaj oparty na danych minimalny próg oceny i uzasadnienie.

## Rekomendacje

Ponumeruj główne rekomendacje (z wyjścia skryptu). Dla każdej:
1. **[WPŁYW]** Działanie do podjęcia
   Uzasadnienie rekomendacji.
```

## Krok 3 — Prezentuj podsumowanie

Pokaż użytkownikowi skondensowaną wersję z:
1. Jednowierszowym podsumowaniem statystyk (X aplikacji, Y% zaaplikowanych, Z% pozytywnych)
2. Top 3 ustaleniami (najbardziej wpływowe wzorce)
3. Linkiem do pełnego raportu

Przykład:
> **Analiza wzorców gotowa** (24 aplikacje, 7-8 kwietnia)
>
> Kluczowe ustalenia:
> - Role z ograniczeniem geo mają 0% konwersji (7 z 24) — przestań oceniać ogłoszenia tylko US/Kanada
> - Role regional/global remote konwertują na poziomie 57-67% — to Twój słodki punkt
> - Brak pozytywnych wyników poniżej 4.2/5 — rozważ to jako Twój próg
>
> Pełny raport: `reports/pattern-analysis-2026-04-08.md`

## Krok 4 — Zaproponuj wdrożenie rekomendacji

Zapytaj użytkownika, czy chce działać na rekomendacjach:

> "Chcesz, bym wdrożył którąś z tych rekomendacji? Mogę:
> - Zaktualizować `portals.yml`, by odfiltrować role z ograniczeniem geo
> - Ustawić próg oceny w `_profile.md` dla generowania PDF
> - Dostosować targetowanie archetypów na podstawie tego, co konwertuje
>
> Powiedz które, lub 'wszystkie', by wdrożyć całość."

Jeśli użytkownik się zgodzi:
- Dla zmian filtrów portali: edytuj `portals.yml`
- Dla zmian profilu/archetypów: edytuj `modes/_profile.md` (NIGDY `_shared.md`)
- Dla progu oceny: dodaj do `config/profile.yml` pod kluczem `patterns`

## Klasyfikacja wyników

Dla referencji wyniki klasyfikuje się jako:

| Status | Wynik |
|--------|-------|
| Interview, Offer, Responded, Applied | **Pozytywny** (zainwestowano wysiłek lub jest trakcja) |
| Rejected, Discarded | **Negatywny** (firma odmówiła lub oferta zamknięta) |
| SKIP, NO APLICAR | **Odfiltrowany** (użytkownik zdecydował nie aplikować) |
| Evaluated | **Oczekujący** (brak działania) |
