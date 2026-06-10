# Tryb: auto-pipeline — Pełny automatyczny pipeline

Gdy użytkownik wkleja ogłoszenie (tekst lub URL) bez jawnej sub-komendy, wykonaj CAŁY pipeline po kolei:

## Krok 0 — Wyciągnij ogłoszenie

Jeśli wejście to **URL** (nie wklejony tekst ogłoszenia), zastosuj tę strategię wyciągania treści:

**Kolejność priorytetów:**

1. **Playwright (preferowane):** Większość portali (Lever, Ashby, Greenhouse, Workday, ale też pracuj.pl, justjoin.it, No Fluff Jobs) to SPA. Użyj `browser_navigate` + `browser_snapshot`, by wyrenderować i przeczytać ogłoszenie.
2. **WebFetch (zapasowo):** Dla stron statycznych (strony kariery firm, niektóre portale).
3. **WebSearch (ostateczność):** Szukaj tytułu roli + firmy we wtórnych portalach indeksujących ogłoszenie w statycznym HTML.

**Jeśli żadna metoda nie działa:** Poproś kandydata o ręczne wklejenie ogłoszenia lub zrzut ekranu.

**Jeśli wejście to tekst ogłoszenia** (nie URL): użyj bezpośrednio, bez pobierania.

## Krok 1 — Ocena A-G

Wykonaj to samo co tryb `oferta` (przeczytaj `modes/oferta.md` dla wszystkich bloków A-F + Blok G Wiarygodność ogłoszenia).

## Krok 2 — Zapisz raport .md

Zapisz pełną ocenę w `reports/{###}-{company-slug}-{YYYY-MM-DD}.md` (format w `modes/oferta.md`).
Dołącz Blok G do zapisanego raportu. Dodaj **URL:** {url} i **Wiarygodność:** {poziom} do nagłówka raportu.

## Krok 3 — Wygeneruj PDF

Przeczytaj `config/profile.yml`. Sprawdź `cv.output_format`:

- Jeśli `"latex"`, wykonaj pełny pipeline z `modes/latex.md`
- W przeciwnym razie (domyślnie) wykonaj pełny pipeline z `modes/pdf.md`

## Krok 4 — Szkice odpowiedzi do aplikacji (tylko jeśli ocena >= 4.5)

Jeśli końcowa ocena to >= 4.5, wygeneruj szkic odpowiedzi do formularza aplikacyjnego:

1. **Wyciągnij pytania z formularza**: Użyj Playwright, by przejść do formularza i zrobić zrzut. Jeśli nie da się wyciągnąć, użyj pytań ogólnych.
2. **Wygeneruj odpowiedzi** zgodnie z tonem (poniżej).
3. **Zapisz w raporcie** jako sekcję `## H) Szkice odpowiedzi do aplikacji`.

### Pytania ogólne (użyj, jeśli nie da się wyciągnąć z formularza)

- Dlaczego interesuje Cię ta rola?
- Dlaczego chcesz pracować w [Firma]?
- Opowiedz o istotnym projekcie lub osiągnięciu
- Co czyni Cię dobrym dopasowaniem na to stanowisko?
- Skąd dowiedziałeś się o tej roli?

### Ton odpowiedzi w formularzu

**Pozycja: "To ja wybieram Was".** Kandydat ma opcje i wybiera tę firmę z konkretnych powodów.

**Reguły tonu:**
- **Pewnie bez arogancji**: "Ostatni rok budowałem produkcyjne systemy agentów AI — Wasza rola to miejsce, gdzie chcę zastosować to doświadczenie dalej"
- **Selektywnie bez arogancji**: "Świadomie szukam zespołu, w którym mogę realnie kontrybuować od pierwszego dnia"
- **Konkretnie**: Zawsze odwołuj się do czegoś PRAWDZIWEGO z ogłoszenia lub firmy i czegoś PRAWDZIWEGO z doświadczenia kandydata
- **Bezpośrednio, bez lania wody**: 2-4 zdania na odpowiedź. Bez "jestem pasjonatem..." czy "byłbym wdzięczny za możliwość..."
- **Hakiem jest dowód, nie deklaracja**: Zamiast "jestem świetny w X", powiedz "zbudowałem X, które robi Y"

**Schemat na pytanie:**
- **Dlaczego ta rola?** → "Wasze [konkret] mapuje się wprost na [konkret, który zbudowałem]."
- **Dlaczego ta firma?** → Wspomnij coś konkretnego o firmie. "Używam [produkt] od [czas/cel]."
- **Istotne doświadczenie?** → Skwantyfikowany proof point. "Zbudowałem [X], które [metryka]. Sprzedałem firmę w 2025."
- **Dobre dopasowanie?** → "Jestem na styku [A] i [B], czyli dokładnie tam, gdzie żyje ta rola."
- **Skąd się dowiedziałeś?** → Szczerze: "Znalazłem przez [portal/skan], oceniłem względem moich kryteriów, wypadło najlepiej."

**Język**: Zawsze po polsku (lub w języku procesu, jeśli rekrutacja prowadzona po angielsku).

## Krok 5 — Zaktualizuj tracker

Zapisz w `data/applications.md` ze wszystkimi kolumnami, w tym Raport i PDF jako ✅.

**Jeśli któryś krok się nie powiedzie**, kontynuuj kolejne i oznacz nieudany krok jako oczekujący w trackerze.
