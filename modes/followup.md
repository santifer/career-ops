# Tryb: followup — Tracker kadencji follow-up

## Cel

Śledź kadencję follow-upów dla aktywnych aplikacji. Oznaczaj zaległe follow-upy, wyciągaj kontakty z notatek i generuj dopasowane szkice e-maili/wiadomości LinkedIn z użyciem kontekstu raportu.

## Wejścia

- `data/applications.md` — Tracker aplikacji
- `data/follow-ups.md` — Historia follow-upów (tworzona przy pierwszym użyciu)
- `reports/` — Raporty oceny (kontekst do szkiców)
- `config/profile.yml` — Profil użytkownika (imię, tożsamość)
- `cv.md` — CV dla proof pointów w szkicach

## Krok 1 — Uruchom skrypt kadencji

Wykonaj:

```bash
node followup-cadence.mjs
```

Sparsuj wyjście JSON. Zawiera:

| Klucz | Zawartość |
|-------|-----------|
| `metadata` | Data analizy, łącznie śledzonych, liczba do działania, liczniki overdue/urgent/cold/waiting |
| `entries` | Per aplikacja: firma, rola, status, dni od aplikacji, liczba follow-upów, pilność, data kolejnego follow-up, wyciągnięte kontakty, ścieżka raportu |
| `cadenceConfig` | Reguły kadencji (applied: 7 dni, responded: 3 dni, interview: 1 dzień) |

Jeśli brak pozycji do działania, powiedz użytkownikowi:
> "Brak aktywnych aplikacji do follow-upu. Najpierw zaaplikuj na kilka ról przez `/career-ops` i wróć, gdy się postarzeją."

## Krok 2 — Pokaż dashboard

Pokaż dashboard kadencji posortowany wg pilności (urgent > overdue > waiting > cold):

```
Dashboard kadencji follow-up — {data}
{N} śledzonych aplikacji, {N} do działania

| # | Firma | Rola | Status | Dni | Follow-upy | Następny | Pilność | Kontakt |
```

Użyj wskaźników wizualnych:
- **PILNE** — odpowiedz w 24h (firma się odezwała)
- **ZALEGŁE** — follow-up po terminie
- **czeka (X dni)** — zgodnie z planem, follow-up zaplanowany
- **ZIMNE** — wysłano 2+ follow-upy, sugeruj zamknięcie

## Krok 3 — Generuj szkice follow-up

Tylko dla pozycji **overdue** lub **urgent**:

1. Przeczytaj powiązany raport (`reportPath` z JSON) dla kontekstu firmy
2. Przeczytaj `cv.md` dla proof pointów
3. Przeczytaj `config/profile.yml` dla imienia i tożsamości kandydata

### Schemat e-maila follow-up (pierwszy follow-up, followupCount == 0)

Wygeneruj e-mail na 3-4 zdania:

1. **Zdanie 1:** Odwołaj się do konkretnej roli + kiedy aplikowano. Konkretnie — podaj nazwę firmy i tytuł roli.
2. **Zdanie 2:** Jedna konkretna wartość dodana z dopasowania Bloku B raportu lub proof point z cv.md. Skwantyfikuj, jeśli możliwe.
3. **Zdanie 3:** Delikatna prośba + dostępność. Zaproponuj konkretne okno czasowe ("w tym tygodniu" lub "w przyszły wtorek").
4. **Zdanie 4 (opcjonalnie):** Krótka wzmianka o istotnym niedawnym projekcie lub osiągnięciu.

**Reguły:**
- Profesjonalnie, ale ciepło, NIE desperacko
- **NIGDY** nie używaj "tylko sprawdzam", "chciałem przypomnieć", "wracam z pytaniem", "odświeżam temat"
- Prowadź wartością, nie prośbą
- Odwołaj się do czegoś konkretnego dla TEJ firmy (z Bloku A raportu)
- Trzymaj poniżej 150 słów
- Dołącz temat wiadomości
- Użyj imienia kandydata z `config/profile.yml`

**Przykładowy ton:**
> Temat: Re: Senior PHP/Laravel Developer — IxDF
>
> Dzień dobry [imię kontaktu lub "Zespole"],
>
> Wysłałem aplikację na rolę Senior PHP/Laravel Developer 7 kwietnia. Chciałem dodać, że moja produkcyjna aplikacja w Laravel (Barbeiro.app — 120 modeli, 315 endpointów API, pełny zestaw testów) blisko odzwierciedla kulturę TDD opisaną w ogłoszeniu.
>
> Chętnie porozmawiam, jak moje 15 lat doświadczenia w PHP i praktyczny workflow z narzędziami AI mogłyby wesprzeć platformę IxDF. Czy pasowałby termin w tym tygodniu na krótką rozmowę?
>
> Pozdrawiam,
> [Imię]

### Follow-up na LinkedIn (jeśli nie znaleziono kontaktu e-mail)

Użyj ponownie schematu contacto: 3 zdania, maks. 300 znaków.
- Hak specyficzny dla firmy → proof point → delikatna prośba
- Zasugeruj użytkownikowi uruchomienie `/career-ops contacto {firma}`, by najpierw znaleźć właściwą osobę

### Drugi follow-up (followupCount == 1)

Krótszy niż pierwszy (2-3 zdania). Weź **nowy kąt**:
- Podziel się istotnym spostrzeżeniem, artykułem lub aktualizacją projektu
- Nie powtarzaj treści pierwszego follow-up
- Wciąż odwołuj się konkretnie do roli

### Zimna aplikacja (followupCount >= 2)

NIE generuj kolejnego follow-up. Zamiast tego zasugeruj:
> "Ta aplikacja miała {N} follow-upów bez odpowiedzi. Rozważ:
> - Zmianę statusu na `Discarded`, jeśli rola wydaje się obsadzona
> - Próbę innego kontaktu przez `/career-ops contacto`
> - Pozostawienie statusu `Applied`, ale z niższym priorytetem"

## Krok 4 — Prezentuj szkice

Dla każdego szkicu pokaż:

```
## Follow-up: {Firma} — {Rola} (#{num})

**Do:** {email lub "Brak kontaktu — najpierw uruchom `/career-ops contacto`"}
**Temat:** {temat}
**Dni od aplikacji:** {N}
**Wysłane follow-upy:** {N}
**Kanał:** Email / LinkedIn

{treść szkicu}
```

## Krok 5 — Zapisz follow-upy

Po tym, jak użytkownik przejrzy i powie, że wysłał follow-up, zapisz go:

1. Jeśli `data/follow-ups.md` nie istnieje, utwórz:
   ```markdown
   # Historia follow-upów

   | # | App# | Data | Firma | Rola | Kanał | Kontakt | Notatki |
   |---|------|------|-------|------|-------|---------|---------|
   ```

2. Dopisz wiersz z:
   - `#` = kolejny numer w tabeli follow-upów
   - `App#` = numer aplikacji z trackera
   - `Data` = dzisiejsza data
   - `Firma` = nazwa firmy
   - `Rola` = tytuł roli
   - `Kanał` = Email / LinkedIn / Inny
   - `Kontakt` = do kogo wysłano
   - `Notatki` = krótka notka (np. "Pierwszy follow-up, odwołanie do Barbeiro.app")

3. Opcjonalnie zaktualizuj kolumnę Notatki w `data/applications.md` o "Follow-up {N} wysłany {YYYY-MM-DD}"

**WAŻNE:** Zapisuj tylko follow-upy, których wysłanie użytkownik potwierdzi. Nigdy nie zapisuj szkicu jako wysłanego.

## Krok 6 — Podsumowanie

Po pokazaniu wszystkich szkiców podsumuj:

> **Dashboard follow-up** ({data})
> - {N} śledzonych aplikacji
> - {N} zaległych — szkice wygenerowane powyżej
> - {N} pilnych — odpowiedz dziś
> - {N} czekających — daty kolejnych follow-upów pokazane
> - {N} zimnych — rozważ zamknięcie
>
> Przejrzyj szkice powyżej i powiedz, które wysłałeś, bym je zapisał.

## Referencja reguł kadencji

| Status | Pierwszy follow-up | Kolejne | Maks. prób |
|--------|--------------------|---------|------------|
| Applied | 7 dni po aplikacji | Co 7 dni | 2 (potem oznacz zimne) |
| Responded | 1 dzień (pilna odpowiedź) | Co 3 dni | Bez limitu |
| Interview | 1 dzień po (podziękowanie) | Co 3 dni | Bez limitu |

Te domyślne wartości można nadpisać przez `node followup-cadence.mjs --applied-days N`.
