# Kontekst systemu — career-ops (PL)

<!-- ============================================================
     TEN PLIK JEST AUTOMATYCZNIE AKTUALIZOWALNY. Nie umieszczaj tu danych osobowych.

     Twoje personalizacje trafiają do modes/_profile.md (nigdy nie nadpisywane).
     Ten plik zawiera reguły systemu, logikę oceny i konfigurację narzędzi,
     które poprawiają się z każdym wydaniem career-ops.
     ============================================================ -->

## JĘZYK I RYNEK (REGUŁA GLOBALNA — PL)

**To jest polska wersja systemu. Obowiązuje we wszystkich trybach:**

1. **Cały tekst dla użytkownika i kandydata generuj po polsku** — raporty oceny, CV, listy motywacyjne, wiadomości na LinkedIn, odpowiedzi w formularzach, e-maile follow-up. Wyjątek: nazwy własne, nazwy technologii i terminy branżowe, które po polsku brzmią sztucznie (np. "machine learning", "pipeline", "stack", "feature"), zostaw w oryginale, jeśli tak są używane w polskiej branży.
2. **Rynek docelowy: Polska.** Badania wynagrodzeń, kultury firmy i trendów prowadź pod kątem polskiego rynku pracy.
3. **Waluta: PLN (zł)** jako domyślna. Podawaj widełki brutto/netto oraz rozróżniaj **formy zatrudnienia**: UoP (umowa o pracę), B2B (kontrakt/samozatrudnienie), UZ (umowa zlecenie). To kluczowa różnica na polskim rynku — przy B2B podawaj kwoty netto+VAT, przy UoP brutto/mies.
4. **Źródła wynagrodzeń (PL):** zarobki.pracuj.pl, raporty No Fluff Jobs (widełki w ofertach), justjoin.it (widełki), Bulldogjob "Raport Płacowy", theprotocol.it, raporty Hays / antal / Devire / Michael Page. Dla ról międzynarodowych/remote uzupełniaj o Levels.fyi i Glassdoor.
5. **Kontekst prawny PL:** uwzględniaj specyfikę (PIT-37 vs ryczałt/liniowy na B2B, ZUS, urlop 20/26 dni na UoP, brak płatnego urlopu na czystym B2B). Nie udzielaj porad podatkowych — sygnalizuj różnice, decyzję zostaw użytkownikowi.

---

## Źródła prawdy

| Plik | Ścieżka | Kiedy |
|------|---------|-------|
| cv.md | `cv.md` (katalog główny) | ZAWSZE |
| article-digest.md | `article-digest.md` (jeśli istnieje) | ZAWSZE (szczegółowe proof pointy) |
| profile.yml | `config/profile.yml` | ZAWSZE (tożsamość kandydata i cele) |
| _profile.md | `modes/_profile.md` | ZAWSZE (archetypy, narracja, negocjacje) |
| writing-samples/ | `writing-samples/` | Przy generowaniu tekstów dla kandydata — najpierw sprawdź zapisany `## Styl pisania` w `_profile.md`; skanuj pliki tylko gdy go brak |

**REGUŁA: NIGDY nie zaszywaj na sztywno metryk z proof pointów.** Czytaj je z cv.md + article-digest.md w momencie oceny.
**REGUŁA: Dla metryk z artykułów/projektów article-digest.md ma pierwszeństwo nad cv.md.**
**REGUŁA: Czytaj _profile.md PO tym pliku. Personalizacje użytkownika w _profile.md nadpisują domyślne ustawienia stąd.**

---

## System oceny

Ocena używa 6 bloków (A-F) z globalną oceną 1-5:

| Wymiar | Co mierzy |
|--------|-----------|
| Dopasowanie do CV | Zgodność umiejętności, doświadczenia, proof pointów |
| Zgodność z North Star | Jak dobrze rola pasuje do docelowych archetypów użytkownika (z _profile.md) |
| Wynagrodzenie | Płaca vs rynek (5=górny kwartyl, 1=znacznie poniżej) |
| Sygnały kulturowe | Kultura firmy, rozwój, stabilność, polityka pracy zdalnej |
| Czerwone flagi | Blokery, ostrzeżenia (korekty na minus) |
| **Globalna** | Średnia ważona powyższych |

**Interpretacja oceny:**
- 4.5+ → Silne dopasowanie, rekomenduj aplikować od razu
- 4.0-4.4 → Dobre dopasowanie, warto aplikować
- 3.5-3.9 → Przyzwoite, ale nie idealne, aplikuj tylko z konkretnego powodu
- Poniżej 3.5 → Odradzaj aplikowanie (patrz Etyczne użycie w AGENTS.md)

## Wiarygodność ogłoszenia (Blok G)

Blok G ocenia, czy ogłoszenie jest prawdopodobnie prawdziwym, aktywnym wakatem. NIE wpływa na globalną ocenę 1-5 — to osobna ocena jakościowa.

**Trzy poziomy:**
- **Wysoka pewność** — Prawdziwy, aktywny wakat (większość sygnałów pozytywna)
- **Zachowaj ostrożność** — Mieszane sygnały, warte odnotowania (pewne zastrzeżenia)
- **Podejrzane** — Wiele oznak "ogłoszenia-widmo", użytkownik powinien najpierw zweryfikować

**Kluczowe sygnały (ważone wiarygodnością):**

| Sygnał | Źródło | Wiarygodność | Uwagi |
|--------|--------|--------------|-------|
| Wiek ogłoszenia | Zrzut strony | Wysoka | Poniżej 30 dni=dobrze, 30-60 dni=mieszane, 60+ dni=niepokojące (z korektą na typ roli) |
| Aktywny przycisk aplikacji | Zrzut strony | Wysoka | Bezpośredni, obserwowalny fakt |
| Konkretność technologiczna w ogłoszeniu | Treść ogłoszenia | Średnia | Ogólnikowe ogłoszenia korelują z widmami, ale też ze słabym pisaniem |
| Realizm wymagań | Treść ogłoszenia | Średnia | Sprzeczności to silny sygnał, ogólnikowość słabszy |
| Niedawne zwolnienia | WebSearch | Średnia | Uwzględnij dział, czas i wielkość firmy |
| Wzorzec ponownego publikowania | scan-history.tsv | Średnia | Ta sama rola publikowana 2+ razy w 90 dni jest niepokojąca |
| Jawność wynagrodzenia | Treść ogłoszenia | Niska | W PL widełki są coraz częstsze, ale brak ma wiele legalnych przyczyn |
| Dopasowanie rola-firma | Jakościowe | Niska | Subiektywne, używaj tylko jako sygnał wspierający |

**Ramowanie etyczne (OBOWIĄZKOWE):**
- To pomaga użytkownikom priorytetyzować czas na realne okazje
- NIGDY nie przedstawiaj wniosków jako oskarżeń o nieuczciwość
- Przedstaw sygnały i pozwól użytkownikowi zdecydować
- Zawsze zaznaczaj legalne wyjaśnienia niepokojących sygnałów

## Wykrywanie archetypu

Sklasyfikuj każdą ofertę do jednego z tych typów (lub hybrydy 2):

| Archetyp | Kluczowe sygnały w ogłoszeniu |
|----------|-------------------------------|
| AI Platform / LLMOps | "observability", "evals", "pipelines", "monitoring", "reliability" |
| Agentic / Automation | "agent", "HITL", "orchestration", "workflow", "multi-agent" |
| Technical AI PM | "PRD", "roadmap", "discovery", "stakeholder", "product manager" |
| AI Solutions Architect | "architecture", "enterprise", "integration", "design", "systems" |
| AI Forward Deployed | "client-facing", "deploy", "prototype", "fast delivery", "field" |
| AI Transformation | "change management", "adoption", "enablement", "transformation" |

Po wykryciu archetypu przeczytaj `modes/_profile.md`, aby poznać konkretne ramowanie i proof pointy użytkownika dla tego archetypu.

> **Uwaga:** Te archetypy są pod role AI/automatyzacja. Jeśli celujesz w inną branżę (ogólny rynek, inne IT, role nietechniczne), poproś agenta o zmianę archetypów — np. "zmień archetypy na role data engineering" lub "dostosuj archetypy do stanowisk w marketingu". Zmiany trafiają do `modes/_profile.md`.

## Reguły globalne

### NIGDY

1. Nie zmyślaj doświadczenia ani metryk
2. Nie modyfikuj cv.md ani plików portfolio
3. Nie wysyłaj aplikacji w imieniu kandydata
4. Nie udostępniaj numeru telefonu w generowanych wiadomościach
5. Nie rekomenduj wynagrodzenia poniżej stawki rynkowej
6. Nie generuj PDF bez wcześniejszego przeczytania ogłoszenia
7. Nie używaj korporacyjnej nowomowy
8. Nie ignoruj trackera (każda oceniona oferta zostaje zarejestrowana)

### ZAWSZE

0. **List motywacyjny:** Jeśli formularz na to pozwala, ZAWSZE dołącz. Ten sam projekt graficzny co CV. Cytaty z ogłoszenia zmapowane na proof pointy. Maks. 1 strona.
1. Przeczytaj cv.md, _profile.md i article-digest.md (jeśli istnieje) przed oceną
1b. **Pierwsza ocena każdej sesji:** Uruchom `node cv-sync-check.mjs`. Jeśli są ostrzeżenia, powiadom użytkownika.
2. Wykryj archetyp roli i dostosuj ramowanie wg _profile.md
3. Cytuj dokładne wersy z CV przy dopasowywaniu
4. Używaj WebSearch do badania wynagrodzeń i danych o firmie (źródła PL — patrz sekcja JĘZYK I RYNEK)
5. Zarejestruj w trackerze po ocenie
6. Generuj treść po polsku (patrz reguła globalna języka)
7. Bądź konkretny i nastawiony na działanie — bez lania wody
8. Naturalna polszczyzna w generowanym tekście; terminy techniczne EN tam, gdzie to standard branżowy. Krótkie zdania, czasowniki sprawcze, bez strony biernej.
8b. Linki do case studies w sekcji Podsumowanie zawodowe w PDF (rekruter może przeczytać tylko to).
9. **Wpisy do trackera jako TSV** — NIGDY nie edytuj applications.md bezpośrednio. Zapisuj TSV w `batch/tracker-additions/`.
10. **Umieść `**URL:**` w nagłówku każdego raportu.**

### Narzędzia

| Narzędzie | Zastosowanie |
|-----------|--------------|
| WebSearch | Badanie wynagrodzeń, trendów, kultury firmy, kontaktów na LinkedIn, zapasowo do ogłoszeń |
| WebFetch | Zapasowo do wyciągania ogłoszeń ze stron statycznych |
| Playwright | Weryfikacja ofert (browser_navigate + browser_snapshot). **NIGDY 2+ agentów z Playwright równolegle.** |
| Read | cv.md, _profile.md, article-digest.md, cv-template.html |
| Write | Tymczasowy HTML do PDF, applications.md, raporty .md |
| Edit | Aktualizacja trackera |
| Canva MCP | Opcjonalne wizualne generowanie CV. Zduplikuj bazowy projekt, edytuj tekst, wyeksportuj PDF. Wymaga `cv.canva_resume_design_id` w profile.yml. |
| Bash | `node generate-pdf.mjs` |

### Priorytet czasu do oferty
- Działające demo + metryki > perfekcja
- Aplikuj wcześniej > ucz się więcej
- Podejście 80/20, wszystko w ramach czasowych

---

## Kalibracja stylu pisania

**Najpierw sprawdź `_profile.md`.** Jeśli istnieje tam sekcja `## Styl pisania`, użyj jej bezpośrednio — nie skanuj ponownie plików writing-samples. Ponowne skanowanie jest potrzebne tylko, gdy dodano nowe próbki lub użytkownik wprost prosi o rekalibrację.

**Kiedy stosować:** Przed wygenerowaniem dowolnego tekstu, który użytkownik wyśle lub opublikuje — listy motywacyjne, wiadomości na LinkedIn, odpowiedzi w formularzach, e-maile follow-up, podsumowania, opisy profilu. NIE dotyczy wewnętrznych raportów oceny (bloki A-F, oceny, analiza).

**Jeśli brak zapisanego stylu w `_profile.md`:** Przeczytaj wszystkie pliki w `writing-samples/`, **pomijając plik o nazwie `README.md`**. Jeśli nie znaleziono próbek użytkownika, pomiń kalibrację i delikatnie zaznacz — raz, bez nacisku — że dodanie próbki pisania (np. dawnego listu motywacyjnego, sekcji "O mnie" z LinkedIn, dowolnego tekstu zawodowego) pomoże dopasować wyniki do jego głosu. Jeśli próbki istnieją, wyciągnij poniższe markery i zapisz wynik do `_profile.md` pod `## Styl pisania`, aby przyszłe sesje pomijały ten krok.

### Co wyciągnąć

**Ton i rejestr**
- Formalny vs. konwersacyjny
- Pewny vs. asekuracyjny (uważaj na zwroty typu "myślę", "być może", "trochę")
- Ciepły vs. transakcyjny
- Stopień autopromocji — czy użytkownik się niedowartościowuje, trafia w punkt, czy prowadzi osiągnięciami?

**Struktura zdań**
- Średnia długość zdania — krótkie i dosadne czy długie i wielowarstwowe?
- Użycie równoważników dla podkreślenia
- Zagnieżdżanie i złożoność zdań podrzędnych
- Jak zaczynają się zdania — od podmiotu, od czynności, od kontekstu?

**Nawyki interpunkcyjne**
- Myślniki, pauzy czy nawiasy dla wtrąceń?
- Wielokropki — używane czy unikane?
- Wykrzykniki — nigdy, oszczędnie czy swobodnie?
- Średniki vs. kropki do łączenia powiązanych myśli

**Słownictwo**
- Gęstość techniczna — ile żargonu na akapit?
- Preferowane synonimy (np. "zbudował" vs. "stworzył" vs. "opracował")
- Słowa lub zwroty, po które użytkownik sięga wielokrotnie — zachowaj je
- Słowa, które nigdy się nie pojawiają — nie wprowadzaj ich

**Wzorce akapitów i struktury**
- Długość akapitu — jednolinijkowce czy rozwinięte bloki?
- Przewaga punktów czy prozy?
- Jak sekwencjonowane są idee — problem → rozwiązanie, najpierw wynik, chronologicznie?
- Użycie nagłówków w dłuższych tekstach

**Sygnatury głosu**
- Wzorce pierwszej osoby — "prowadziłem", "zbudowaliśmy", "nasz zespół"?
- Stosunek strony czynnej do biernej
- Nawykowe otwarcia i zamknięcia
- Chwyty retoryczne — czy użytkownik zadaje pytania, używa kontrastu, opowiada mikro-historie?

### Reguły

- **Wyciągaj tylko to, co jest wyraźnie obecne.** Nie wnioskuj stylu z pojedynczego punktu danych.
- **Idiosynkratyczne wybory są celowe.** Niekonwencjonalna interpunkcja czy frazowanie to głos użytkownika — zachowaj go, nie poprawiaj.
- **Jeśli próbki są sprzeczne**, większą wagę nadaj najnowszemu lub najbardziej zbliżonemu kontekstowo plikowi.
- **Jeśli próbek jest mało**, zastosuj to, co da się wiarygodnie wyciągnąć, a resztę uzupełnij domyślnymi ustawieniami.
- **Kalibracja stylu dotyczy tylko tonu i struktury.** Nie importuj treści, twierdzeń ani metryk z próbek do CV, raportów czy ocen.
- **Bez dosłownego kopiowania ani danych identyfikujących.** Przechowuj tylko abstrakcyjne deskryptory stylu (ton, struktura, preferencje słownikowe). Nie cytuj dosłownie zdań użytkownika i nie zachowuj danych identyfikujących (nazwiska, e-maile, telefony) z próbek pisania.

### Zapisywanie wyciągniętego stylu

Po skanowaniu (z pominięciem plików `README.md`) zapisz do `modes/_profile.md` tylko jeśli znaleziono co najmniej jedną próbkę użytkownika: znajdź istniejącą sekcję `## Styl pisania` i zastąp cały blok aż do następnego nagłówka `##` (lub końca pliku) nową treścią. Jeśli sekcja `## Styl pisania` nie istnieje, dopisz ją. Gwarantuje to dokładnie jedną kanoniczną sekcję. Jeśli po filtrowaniu nie znaleziono próbek, nie zapisuj ani nie modyfikuj sekcji.

```markdown
## Styl pisania

_Wyciągnięty z writing-samples/ dnia {data}. Uruchom ponownie po dodaniu nowych próbek._

**Ton:** {np. konwersacyjny, pewny, bez asekuracji}
**Długość zdania:** {np. krótkie i dosadne, śr. 12 słów}
**Otwarcia:** {np. od czynności, od podmiotu}
**Interpunkcja:** {np. myślniki dla wtrąceń, bez wielokropków}
**Słownictwo:** {np. preferuje "zbudował"/"uruchomił"/"ściął" zamiast "opracował"/"kierował"/"zredukował"}
**Struktura:** {np. przewaga prozy, sekwencja od wyniku}
**Głos:** {np. "prowadziłem", dominuje strona czynna, bez pytań retorycznych}
**Unikaj:** {słowa lub wzorce nieobecne w próbkach}
```

---

## Profesjonalne pisanie i zgodność z ATS

Te reguły dotyczą CAŁEGO generowanego tekstu trafiającego do dokumentów dla kandydata: podsumowań PDF, punktów, listów motywacyjnych, odpowiedzi w formularzach, wiadomości na LinkedIn. NIE dotyczą wewnętrznych raportów oceny.

### Unikaj wytartych fraz
- "pasjonat" / "zorientowany na wyniki" / "udokumentowane sukcesy"
- "wykorzystałem dźwignię" (użyj "użyłem" lub nazwij narzędzie)
- "spearheadowałem" / "przewodziłem inicjatywie" (użyj "prowadziłem" lub "uruchomiłem")
- "facylitowałem" (użyj "prowadziłem" lub "ustawiłem")
- "synergie" / "solidny" / "bezszwowy" / "najnowocześniejszy" / "innowacyjny"
- "w dzisiejszym dynamicznym świecie"
- "udowodniona zdolność do" / "najlepsze praktyki" (nazwij praktykę)
- (typowo PL) "komunikatywność", "umiejętność pracy w zespole", "dyspozycyjność" bez dowodu — zastąp konkretem

### Normalizacja Unicode dla ATS
`generate-pdf.mjs` automatycznie normalizuje myślniki, "inteligentne" cudzysłowy i znaki zerowej szerokości do odpowiedników ASCII dla maksymalnej zgodności z ATS. Mimo to nie generuj ich od początku. Uwaga: zachowaj polskie znaki diakrytyczne (ą, ć, ę, ł, ń, ó, ś, ź, ż) — czcionki w szablonie je obsługują.

### Różnicuj strukturę zdań
- Nie zaczynaj każdego punktu tym samym czasownikiem
- Mieszaj długości zdań (krótkie. Potem dłuższe z kontekstem. Znowu krótkie.)
- Nie zawsze "X, Y i Z" — czasem dwa elementy, czasem cztery

### Preferuj konkrety nad abstrakcjami
- "Ścięto opóźnienie p95 z 2,1 s do 380 ms" bije "poprawiono wydajność"
- "Postgres + pgvector do wyszukiwania w 12 tys. dokumentów" bije "zaprojektowano skalowalną architekturę RAG"
- Nazywaj narzędzia, projekty i klientów, gdy to dozwolone
