# Tryb: pdf — Generowanie PDF zoptymalizowanego pod ATS

## Pełny pipeline

1. Przeczytaj `cv.md` jako źródło prawdy
2. Poproś użytkownika o ogłoszenie (JD), jeśli nie ma go w kontekście (tekst lub URL)
3. Wyciągnij 15-20 słów kluczowych z ogłoszenia
4. Wykryj język ogłoszenia → język CV (domyślnie PL)
5. Wykryj lokalizację firmy → format papieru:
   - USA/Kanada → `letter`
   - Reszta świata → `a4`
6. Wykryj archetyp roli → dostosuj ramowanie
7. Przepisz Podsumowanie zawodowe, wstrzykując słowa kluczowe z JD + pomost narracyjny (np. „Zbudowałem i rozwinąłem produkcyjne systemy. Teraz stosuję myślenie systemowe w [domena z JD].")
8. Wybierz 3-4 najtrafniejsze projekty pod tę rolę
9. Przestaw punkty doświadczenia według trafności do JD
10. Zbuduj siatkę kompetencji z wymagań JD (6-8 fraz kluczowych)
11. Wstrzyknij słowa kluczowe naturalnie do istniejących osiągnięć (NIGDY nie zmyślaj)
12. Wygeneruj pełny HTML z szablonu + spersonalizowana treść
13. Przeczytaj `name` z `config/profile.yml` → znormalizuj do kebab-case małymi literami (np. „Jan Kowalski" → „jan-kowalski") → `{candidate}`
14. Zapisz HTML do `/tmp/cv-{candidate}-{company}.html`
15. Wykonaj: `node generate-pdf.mjs /tmp/cv-{candidate}-{company}.html output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf --format={letter|a4}`
16. Zaraportuj: ścieżkę PDF, liczbę stron, % pokrycia słów kluczowych

## Reguły ATS (czyste parsowanie)

- Układ jednokolumnowy (bez pasków bocznych, bez kolumn równoległych)
- Standardowe nagłówki: „Podsumowanie zawodowe", „Doświadczenie zawodowe", „Wykształcenie", „Umiejętności", „Certyfikaty", „Projekty"
- Bez tekstu w obrazach/SVG
- Bez kluczowych informacji w nagłówkach/stopkach PDF (ATS je ignoruje)
- UTF-8, tekst zaznaczalny (nie rasteryzowany)
- Bez zagnieżdżonych tabel
- Rozłożone słowa kluczowe z JD: Podsumowanie (top 5), pierwszy punkt każdej roli, sekcja Umiejętności

## Projekt PDF

- **Fonty**: Space Grotesk (nagłówki, 600-700) + DM Sans (tekst, 400-500)
- **Fonty self-hosted**: `fonts/`
- **Nagłówek**: imię i nazwisko w Space Grotesk 24px bold + linia gradientu `linear-gradient(to right, hsl(187,74%,32%), hsl(270,70%,45%))` 2px + wiersz kontaktowy
- **Nagłówki sekcji**: Space Grotesk 13px, wielkie litery, letter-spacing 0.05em, kolor cyjan podstawowy
- **Tekst**: DM Sans 11px, line-height 1.5
- **Nazwy firm**: akcentowy fioletowy `hsl(270,70%,45%)`
- **Marginesy**: 0.6in
- **Tło**: czysta biel

## Kolejność sekcji (zoptymalizowana pod „6-sekundowy skan rekrutera")

1. Nagłówek (duże imię i nazwisko, gradient, kontakt, link do portfolio)
2. Podsumowanie zawodowe (3-4 linie, gęste w słowa kluczowe)
3. Kluczowe kompetencje (6-8 fraz kluczowych w flex-grid)
4. Doświadczenie zawodowe (chronologia odwrotna)
5. Projekty (3-4 najtrafniejsze)
6. Wykształcenie i certyfikaty
7. Umiejętności (języki + techniczne)

## Strategia wstrzykiwania słów kluczowych (etyczna, oparta na prawdzie)

Przykłady legalnego przeformułowania:
- JD mówi „pipeline'y RAG", a CV mówi „workflow z LLM z retrievalem" → zmień na „projektowanie pipeline'ów RAG i orkiestracja workflow z LLM"
- JD mówi „MLOps", a CV mówi „observability, ewaluacje, obsługa błędów" → zmień na „MLOps i observability: ewaluacje, obsługa błędów, monitoring kosztów"
- JD mówi „zarządzanie interesariuszami", a CV mówi „współpracowałem z zespołem" → zmień na „zarządzanie interesariuszami w obszarach inżynierii, operacji i biznesu"

**NIGDY nie dodawaj umiejętności, których kandydat nie ma. Przeformułowuj tylko realne doświadczenie, używając dokładnego słownictwa z JD.**

## Szablon HTML

Użyj szablonu w `cv-template.html`. Zastąp placeholdery `{{...}}` spersonalizowaną treścią:

| Placeholder | Treść |
|-------------|-----------|
| `{{LANG}}` | `pl`, `en` lub `es` |
| `{{PAGE_WIDTH}}` | `8.5in` (letter) lub `210mm` (A4) |
| `{{NAME}}` | (z profile.yml) |
| `{{PHONE}}` | (z profile.yml — dołącz wraz z separatorem tylko, gdy `profile.yml` ma niepuste pole `phone`; w przeciwnym razie pomiń oba `<span>` i `<span class="separator">`) |
| `{{EMAIL}}` | (z profile.yml) |
| `{{LINKEDIN_URL}}` | [z profile.yml] |
| `{{LINKEDIN_DISPLAY}}` | [z profile.yml] |
| `{{PORTFOLIO_URL}}` | [z profile.yml] (lub /pl zależnie od języka) |
| `{{PORTFOLIO_DISPLAY}}` | [z profile.yml] (lub /pl zależnie od języka) |
| `{{LOCATION}}` | [z profile.yml] |
| `{{SECTION_SUMMARY}}` | Podsumowanie zawodowe |
| `{{SUMMARY_TEXT}}` | Spersonalizowane podsumowanie ze słowami kluczowymi |
| `{{SECTION_COMPETENCIES}}` | Kluczowe kompetencje |
| `{{COMPETENCIES}}` | `<span class="competency-tag">słowo-kluczowe</span>` × 6-8 |
| `{{SECTION_EXPERIENCE}}` | Doświadczenie zawodowe |
| `{{EXPERIENCE}}` | HTML każdej pracy z przestawionymi punktami |
| `{{SECTION_PROJECTS}}` | Projekty |
| `{{PROJECTS}}` | HTML 3-4 najlepszych projektów |
| `{{SECTION_EDUCATION}}` | Wykształcenie |
| `{{EDUCATION}}` | HTML wykształcenia |
| `{{SECTION_CERTIFICATIONS}}` | Certyfikaty |
| `{{CERTIFICATIONS}}` | HTML certyfikatów |
| `{{SECTION_SKILLS}}` | Umiejętności |
| `{{SKILLS}}` | HTML umiejętności |

## Generowanie CV w Canva (opcjonalne)

Jeśli `config/profile.yml` ma ustawione `cv.canva_resume_design_id`, zaproponuj użytkownikowi wybór przed generowaniem:
- **„HTML/PDF (szybkie, zoptymalizowane pod ATS)"** — istniejący przepływ powyżej
- **„CV w Canva (wizualne, zachowuje projekt graficzny)"** — nowy przepływ poniżej

Jeśli użytkownik nie ma `cv.canva_resume_design_id`, pomiń ten monit i użyj przepływu HTML/PDF.

### Przepływ Canva

#### Krok 1 — Zduplikuj projekt bazowy

a. `export-design` projektu bazowego (z użyciem `cv.canva_resume_design_id`) jako PDF → uzyskaj URL pobierania
b. `import-design-from-url` z tym URL-em pobierania → tworzy nowy edytowalny projekt (duplikat)
c. Zanotuj nowe `design_id` duplikatu

#### Krok 2 — Przeczytaj strukturę projektu

a. `get-design-content` na nowym projekcie → zwraca wszystkie elementy tekstowe (richtexts) z ich treścią
b. Zmapuj elementy tekstowe na sekcje CV przez dopasowanie treści:
   - Szukaj imienia i nazwiska kandydata → sekcja nagłówka
   - Szukaj „Podsumowanie" lub „Podsumowanie zawodowe" → sekcja podsumowania
   - Szukaj nazw firm z cv.md → sekcje doświadczenia
   - Szukaj nazw stopni/uczelni → sekcja wykształcenia
   - Szukaj słów kluczowych umiejętności → sekcja umiejętności
c. Jeśli mapowanie zawiedzie, pokaż użytkownikowi, co znaleziono, i poproś o wskazówki

#### Krok 3 — Wygeneruj dopasowaną treść

To samo generowanie treści co w przepływie HTML (Kroki 1-11 powyżej):
- Przepisz Podsumowanie zawodowe ze słowami kluczowymi z JD + narracja
- Przestaw punkty doświadczenia według trafności do JD
- Wybierz najlepsze kompetencje z wymagań JD
- Wstrzyknij słowa kluczowe naturalnie (NIGDY nie zmyślaj)

**WAŻNE — reguła budżetu znaków:** Każdy tekst zastępujący MUSI mieć w przybliżeniu taką samą długość jak oryginał, który zastępuje (w granicach ±15% liczby znaków). Jeśli dopasowana treść jest dłuższa, skondensuj ją. Projekt w Canva ma pola tekstowe o stałym rozmiarze — dłuższy tekst powoduje nakładanie się na sąsiednie elementy. Policz znaki w każdym oryginalnym elemencie z Kroku 2 i egzekwuj ten budżet przy generowaniu zamienników.

#### Krok 4 — Zastosuj edycje

a. `start-editing-transaction` na zduplikowanym projekcie
b. `perform-editing-operations` z `find_and_replace_text` dla każdej sekcji:
   - Zastąp tekst podsumowania dopasowanym podsumowaniem
   - Zastąp każdy punkt doświadczenia przestawionymi/przepisanymi punktami
   - Zastąp tekst kompetencji/umiejętności terminami dopasowanymi do JD
   - Zastąp opisy projektów najtrafniejszymi projektami
c. **Przeporządkuj układ po zastąpieniu tekstu:**
   Po zastosowaniu wszystkich zamian tekstu pola tekstowe auto-skalują się, ale sąsiednie elementy zostają w miejscu. Powoduje to nierówne odstępy między sekcjami doświadczenia. Napraw to:
   1. Przeczytaj zaktualizowane pozycje i wymiary elementów z odpowiedzi `perform-editing-operations`
   2. Dla każdej sekcji doświadczenia (z góry na dół) oblicz, gdzie kończy się pole tekstowe punktów: `end_y = top + height`
   3. Nagłówek następnej sekcji powinien zaczynać się na `end_y + consistent_gap` (użyj oryginalnego odstępu z szablonu, zwykle ~30px)
   4. Użyj `position_element`, by przesunąć datę, nazwę firmy, tytuł roli i punkty następnej sekcji, zachowując równe odstępy
   5. Powtórz dla wszystkich sekcji doświadczenia
d. **Zweryfikuj układ przed zatwierdzeniem:**
   - `get-design-thumbnail` z transaction_id i page_index=1
   - Wizualnie sprawdź miniaturę pod kątem: nakładania tekstu, nierównych odstępów, ucięcia tekstu, zbyt małego tekstu
   - Jeśli problemy pozostają, dostosuj przez `position_element`, `resize_element` lub `format_text`
   - Powtarzaj, aż układ będzie czysty
e. Pokaż użytkownikowi finalny podgląd i poproś o akceptację
f. `commit-editing-transaction`, by zapisać (TYLKO po akceptacji użytkownika)

#### Krok 5 — Eksportuj i pobierz PDF

a. `export-design` duplikatu jako PDF (format: a4 lub letter na podstawie lokalizacji z JD)
b. **NATYCHMIAST** pobierz PDF przez Bash:
   ```bash
   curl -sL -o "output/cv-{candidate}-{company}-canva-{YYYY-MM-DD}.pdf" "{download_url}"
   ```
   URL eksportu to wstępnie podpisany link S3, który wygasa po ~2 godzinach. Pobierz go od razu.
c. Zweryfikuj pobranie:
   ```bash
   file output/cv-{candidate}-{company}-canva-{YYYY-MM-DD}.pdf
   ```
   Musi pokazać „PDF document". Jeśli pokazuje XML lub HTML, URL wygasł — eksportuj ponownie i spróbuj jeszcze raz.
d. Zaraportuj: ścieżkę PDF, rozmiar pliku, URL projektu Canva (do ręcznych poprawek)

#### Obsługa błędów

- Jeśli `import-design-from-url` zawiedzie → wróć do pipeline'u HTML/PDF z komunikatem
- Jeśli nie da się zmapować elementów tekstowych → ostrzeż użytkownika, pokaż, co znaleziono, poproś o ręczne mapowanie
- Jeśli `find_and_replace_text` nie znajdzie dopasowań → spróbuj szerszego dopasowania po fragmencie
- Zawsze podawaj URL projektu Canva, by użytkownik mógł edytować ręcznie, gdy auto-edycja zawiedzie

## Po wygenerowaniu

Zaktualizuj tracker, jeśli oferta jest już zarejestrowana: zmień PDF z ❌ na ✅.
