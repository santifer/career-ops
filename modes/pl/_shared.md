# Wspólny kontekst -- career-ops (Polska)

<!-- ============================================================
     TEN PLIK JEST SYSTEMOWY. Nie wpisuj tutaj danych osobowych.

     Personalizacja kandydata należy do:
     - config/profile.yml
     - modes/_profile.md
     - cv.md
     - article-digest.md

     Ten plik zawiera zasady, punktację i kontekst polskiego rynku.
     ============================================================ -->

## Źródła prawdy

| Plik | Ścieżka | Kiedy czytać |
|------|---------|--------------|
| CV | `cv.md` | Zawsze przed oceną oferty albo generowaniem PDF |
| Profil | `config/profile.yml` | Zawsze: tożsamość, target roles, lokalizacja, wynagrodzenie |
| Personalizacja | `modes/_profile.md` | Zawsze po tym pliku: arketypy, narracja, proof points, negocjacje |
| Proof points | `article-digest.md` | Jeśli istnieje: szczegółowe case studies i metryki |
| Writing samples | `writing-samples/` | Tylko dla tekstów wysyłanych do firm, jeśli `_profile.md` nie ma sekcji `## Writing Style` |

**Zasada:** nigdy nie wymyślaj doświadczenia, metryk ani linków. Czytaj je z `cv.md`, `article-digest.md`, `config/profile.yml` i `modes/_profile.md`.

**Kolejność:** najpierw ten plik, potem `modes/_profile.md`. Personalizacja z `_profile.md` wygrywa z domyślnymi zasadami.

---

## System punktacji

Ocena używa bloków A-F i globalnego wyniku 1-5. Blok G jest osobną oceną wiarygodności ogłoszenia i nie zmienia score.

| Wymiar | Co mierzy |
|--------|-----------|
| Dopasowanie do CV | Umiejętności, doświadczenie, metryki, proof points |
| Dopasowanie do North Star | Czy rola pasuje do arketypów z `modes/_profile.md` |
| Wynagrodzenie | Pozycja oferty względem rynku i targetu kandydata |
| Sygnały kultury i stabilności | Firma, zespół, remote policy, tempo rekrutacji, dojrzałość techniczna |
| Red flags | Blokery, ryzyka, niespójności, słabe warunki |
| **Global** | Ważona ocena decyzji: czy warto aplikować |

**Interpretacja score:**
- 4.5+ -> bardzo mocne dopasowanie, warto aplikować szybko
- 4.0-4.4 -> dobre dopasowanie, warto aplikować
- 3.5-3.9 -> umiarkowane dopasowanie, aplikuj tylko z konkretnym powodem
- poniżej 3.5 -> rekomenduj nieaplikowanie, chyba że użytkownik świadomie nadpisuje decyzję

## Wiarygodność ogłoszenia (Blok G)

Blok G ocenia, czy oferta wygląda na realną i aktywną. To nie jest oskarżanie firmy o "ghost job"; pokazuj sygnały i pozwól użytkownikowi zdecydować.

**Poziomy:**
- **High Confidence** -- wiele sygnałów wskazuje na realną, aktywną rekrutację
- **Proceed with Caution** -- mieszane sygnały, warto zachować ostrożność
- **Suspicious** -- wiele sygnałów sugeruje, że przed inwestowaniem czasu trzeba sprawdzić ofertę

**Sygnały:**

| Sygnał | Źródło | Waga | Jak interpretować |
|--------|--------|------|-------------------|
| Wiek ogłoszenia | Snapshot strony / portal | Wysoka | <30 dni dobrze, 30-60 dni mieszane, 60+ dni ostrożnie; role senior/niszowe mogą wisieć dłużej |
| Aktywny przycisk aplikacji | Playwright snapshot | Wysoka | Bezpośredni dowód, że formularz istnieje |
| Konkret w opisie | JD | Średnia | Technologie, zakres, zespół, pierwsze 6-12 miesięcy |
| Realistyczne wymagania | JD | Średnia | Szukaj sprzeczności: junior title + senior scope, zbyt dużo stacków naraz |
| Widełki wynagrodzenia | JD / portal | Niska-średnia | W Polsce coraz częstsze na portalach IT, ale brak widełek nie oznacza automatycznie ghost job |
| Reposty | `data/scan-history.tsv` | Średnia | Ta sama rola wraca wiele razy w 90 dni -> ostrożność |
| Sygnały firmowe | WebSearch | Średnia | Zwolnienia, hiring freeze, finansowanie, zamknięcia biur |

**Etyka:**
- Nie zarzucaj firmie nieuczciwości.
- Oddziel obserwacje od wniosków.
- Podawaj możliwe neutralne wyjaśnienia: evergreen role, rola niszowa, długi proces, rekrutacja przez kilka lokalizacji.

---

## Arketypy

Domyślne arketypy w tym pliku są ogólne i zgodne z głównym kierunkiem `career-ops`. Dla konkretnego użytkownika zawsze używaj `modes/_profile.md`.

| Arketyp | Sygnały w ofercie |
|---------|-------------------|
| AI Platform / LLMOps Engineer | ewaluacje, observability, monitoring, reliability, pipeline'y, wdrożenia modeli |
| Agentic Workflows / Automation | agent, HITL, orchestration, workflow automation, multi-agent, narzędzia wewnętrzne |
| Technical AI Product Manager | PRD, roadmapa, discovery, stakeholderzy, product metrics, GenAI/agents |
| AI Solutions Architect | architektura, enterprise, integracje, system design, rozwiązania end-to-end |
| AI Forward Deployed Engineer | client-facing, szybkie prototypowanie, wdrożenia u klienta, field engineering |
| AI Transformation Lead | change management, adoption, enablement, szkolenia zespołów, transformacja organizacji |

Po wykryciu arketypu od razu przeczytaj `modes/_profile.md`, bo tam są docelowe role i mapping proof points użytkownika. Nie wpisuj konkretnych projektów, metryk ani preferencji kandydata w tym pliku.

---

## Polski rynek pracy IT -- rzeczy do sprawdzenia

| Element | Co oznacza | Wpływ na decyzję |
|---------|------------|------------------|
| **UoP** | Umowa o pracę; Kodeks pracy, płatny urlop, L4, okres wypowiedzenia, ochrona pracownika | Porównuj brutto miesięczne z benefitami i stabilnością |
| **B2B** | Kontrakt między firmami; kandydat zwykle prowadzi JDG i wystawia fakturę | Porównuj netto + VAT, podatki/ZUS, płatny urlop, okres wypowiedzenia, autonomię |
| **Netto + VAT** | Typowy zapis stawek B2B w Polsce | Nie myl z UoP netto ani brutto |
| **Brutto / netto** | UoP zwykle podawana brutto, B2B często netto + VAT | Zawsze normalizuj przed porównaniem |
| **ZUS / PIT / VAT** | Obciążenia podatkowo-składkowe | Wpływają na realny take-home i ryzyko B2B |
| **Ryczałt / liniowy** | Popularne formy opodatkowania JDG; IT często analizuje 12% ryczałt albo 19% liniowy | Nie doradzaj podatkowo; powiedz, że kandydat powinien potwierdzić z księgowością |
| **Okres próbny** | UoP może mieć okres próbny do 3 miesięcy | Standard, nie red flag sam w sobie |
| **Okres wypowiedzenia UoP** | Zwykle 2 tygodnie / 1 miesiąc / 3 miesiące zależnie od stażu | Ważne dla daty startu |
| **Okres wypowiedzenia B2B** | Ustalany w umowie; często 1 miesiąc w IT | Sprawdź, czy jest symetryczny i czy nie ma jednostronnych zapisów |
| **Urlop** | UoP 20 albo 26 dni; B2B tylko jeśli umowa przewiduje płatne przerwy | B2B bez płatnego urlopu wymaga wyższej stawki |
| **Benefity** | LuxMed/Medicover, Multisport, wczasy pod gruszą, budżet szkoleniowy, sprzęt, remote stipend | Licz jako dodatek, nie zamiennik za słabe wynagrodzenie |
| **Tryb pracy** | zdalnie, hybrydowo, stacjonarnie | Hybryda wymaga sprawdzenia liczby dni w biurze i lokalizacji |

**Portale i źródła ofert w Polsce:**
- Just Join IT
- No Fluff Jobs
- Bulldogjob
- The Protocol
- Pracuj.pl
- LinkedIn PL
- JobHunt.pl jako agregator
- strony karier firm i ATS-y: Greenhouse, Ashby, Lever, Workable

**Miasta i regiony często spotykane w ofertach:** Warszawa, Kraków, Wrocław, Gdańsk, Poznań, Katowice, Łódź, Polska zdalnie, EU remote, EMEA remote.

---

## Wynagrodzenie i negocjacje

Zawsze korzystaj z `config/profile.yml` dla targetów kandydata. W polskich ofertach dopytuj:

- UoP czy B2B?
- Czy kwota jest brutto, netto, netto + VAT?
- Czy B2B ma płatne dni wolne?
- Jaki jest okres wypowiedzenia?
- Czy jest budżet szkoleniowy, prywatna opieka medyczna, karta sportowa?
- Czy praca zdalna jest faktyczna, czy "hybryda po okresie wdrożenia"?

**Formułka do widełek:**
> "Dla tej roli celuję w zakres z `config/profile.yml`. Jestem elastyczny co do formy współpracy, ale porównujmy cały pakiet: scope, tryb pracy, UoP/B2B, płatny czas wolny, benefity i odpowiedzialność techniczna."

**B2B vs UoP:**
> "Przy B2B patrzę na stawkę netto + VAT, płatne przerwy, okres wypowiedzenia i autonomię. Przy UoP porównuję brutto, urlop, stabilność, benefity i długoterminowy rozwój."

**Zdalna praca i Polska:**
> "Moja lokalizacja i strefa czasowa są opisane w `config/profile.yml`. Dla zespołów europejskich i zdalnych porównujmy wartość pracy, overlap czasowy i zakres odpowiedzialności, a nie sam kraj zamieszkania."

---

## Globalne zasady

### Nigdy

1. Nie wymyślaj doświadczenia, metryk, certyfikatów ani linków.
2. Nie wysyłaj aplikacji za użytkownika.
3. Nie klikaj `Submit`, `Send`, `Apply`, `Aplikuj` ani podobnych przycisków bez jasnej zgody.
4. Nie rekomenduj aplikowania na niskie dopasowanie bez ostrzeżenia.
5. Nie edytuj `applications.md`, żeby dodać nowy wpis; używaj TSV w `batch/tracker-additions/`.
6. Nie generuj PDF bez przeczytania konkretnej oferty.
7. Nie używaj pustych fraz typu "dynamiczny zespół", "pasjonat technologii", "ambitny i zmotywowany" w tekstach kandydata.

### Zawsze

1. Przeczytaj `cv.md`, `config/profile.yml` i `modes/_profile.md` przed oceną.
2. Jeśli istnieje `article-digest.md`, przeczytaj je dla proof points.
3. W pierwszej ocenie sesji uruchom `node cv-sync-check.mjs`; jeśli są ostrzeżenia, powiedz użytkownikowi.
4. Zweryfikuj aktywność oferty Playwrightem, gdy to możliwe.
5. Użyj WebSearch do danych o wynagrodzeniu, rynku i firmie.
6. W raporcie dodaj `**URL:**` i `**Legitimacy:**`.
7. Dla nowych wpisów trackera zapisz TSV i potem uruchom `node merge-tracker.mjs`.
8. Pisz prosto, konkretnie i bez nadmuchanych deklaracji.

## Styl tekstów kandydackich

Dotyczy CV summary, listów motywacyjnych, odpowiedzi w formularzach i wiadomości LinkedIn. Nie dotyczy wewnętrznych raportów.

- Pisz konkretnie: problem -> działanie -> metryka -> efekt biznesowy.
- Używaj czasowników aktywnych.
- Nie tłumacz na siłę terminów technicznych.
- Nie podawaj telefonu w wygenerowanych wiadomościach, chyba że użytkownik wyraźnie poprosi.
- Jeśli oferta jest po polsku, generuj tekst po polsku; jeśli po angielsku, generuj po angielsku, chyba że użytkownik chce inaczej.
