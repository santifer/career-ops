# Tryb: interview-prep — Wywiad rekrutacyjny pod konkretną firmę

Gdy użytkownik prosi o przygotowanie do rozmowy w konkretnej firmie+roli, lub gdy ocena daje 4.0+ i użytkownik zmienia status na `Interview`, uruchom ten tryb.

## Wejścia

1. **Nazwa firmy** i **tytuł roli** (wymagane)
2. **Raport oceny** w `reports/` (jeśli istnieje) — przeczytaj dla archetypu, luk, dopasowanych proof pointów
3. **Bank historii** w `interview-prep/story-bank.md` — przeczytaj dla istniejących przygotowanych historii
4. **CV** w `cv.md` + `article-digest.md` — przeczytaj dla proof pointów
5. **Profil** w `config/profile.yml` + `modes/_profile.md` — przeczytaj dla kontekstu kandydata

## Krok 1 — Research

Uruchom te zapytania WebSearch. Wyciągaj dane ustrukturyzowane, nie streszczenia. Cytuj źródła dla każdego twierdzenia.

Pierwsza runda większości procesów to screening rekrutera / HR, nie panel techniczny — więc research musi pokryć oba. Grupuj zapytania wg odbiorcy, którego informują:

**Screening rekrutera / HR** (dopasowanie wczesnej rundy, wynagrodzenie, logistyka):

| Zapytanie | Co wyciągnąć |
|-----------|--------------|
| `"{firma} {rola} zarobki"` na zarobki.pracuj.pl, No Fluff Jobs, justjoin.it; dla międzynarodowych `"{company} {role} salary" site:levels.fyi` i site:glassdoor.com | Widełki (B2B/UoP, baza/equity/bonus) wg poziomu |
| `"{firma} proces rekrutacji"` na GoWork/Glassdoor, potem ręcznie odfiltruj opinie opisujące screening rekrutera/HR | Harmonogram procesu, kryteria screeningu, częste pytania, zachowanie rekrutera |
| `"{firma} site:teamblind.com" comp negotiation OR offer` (dla firm międzynarodowych) | Szczere szczegóły o wynagrodzeniu/dźwigni negocjacyjnej |
| `"{firma} kariera"` + `"{firma} benefity"` | Oficjalne ramowanie wynagrodzeń/benefitów, polityka wiz/lokalizacji |

**Hiring manager / kierownictwo** (motywacja, dopasowanie zakresu, dopasowanie do zespołu):

| Zapytanie | Co wyciągnąć |
|-----------|--------------|
| `"{firma} engineering blog"` i `"{firma} {zespół} blog"` | Niedawna praca zespołu, priorytety techniczne, nazwane wyzwania |
| `"{firma}" news OR launch OR roadmap` (ostatnie 12 mies.) | Niedawne kamienie milowe, publiczne zakłady, motory rekrutacji |
| `"{firma} {rola} proces rekrutacji"` (ogólnie) | Struktura rundy hiring managera, co oceniają |

**Osoby z zespołu / panel techniczny** (głębia, współpraca, realizm pracy):

| Zapytanie | Co wyciągnąć |
|-----------|--------------|
| `"{firma} {rola} pytania rekrutacyjne"` na GoWork/Glassdoor | Faktyczne pytania, ocena trudności, liczba rund, stosunek oferta/odrzucenie |
| `"{firma} {rola} interview site:leetcode.com/discuss"` | Konkretne problemy coding/system design, struktura rund |
| `"{firma} proces rekrutacji site:teamblind.com"`, potem ręcznie odfiltruj wątki opisujące rundy techniczne | Poprzeczka, niedawne dane z rozmów technicznych |

Jeśli firma jest mała lub mało znana i daje niewiele wyników, poszerz: szukaj archetypu roli w firmach o podobnym etapie i odnotuj, że danych jest mało. Zapytania o screening rekrutera rób nawet przy skąpych danych — dane o wynagrodzeniu/logistyce istnieją niemal dla każdej firmy.

**NIE zmyślaj pytań.** Jeśli źródło mówi "pytali o systemy rozproszone", zaraportuj to. Nie wymyślaj konkretnego pytania o systemy rozproszone. Generując prawdopodobne pytania z analizy ogłoszenia, oznaczaj je jasno jako `[inferred from JD]`, a nie jako pochodzące od kandydatów.

**Konwencje tagów** (nie mieszaj ich):

- `[inferred from JD]` — pytania wyprowadzone z ogłoszenia, nie z raportu kandydata.
- `[inferred]` — klasyfikacje odbiorców (Krok 2.5) z czasu/pozycji rundy, gdy `Prowadzone przez` jest nieznane.

## Krok 2 — Przegląd procesu

```markdown
## Przegląd procesu
- **Rundy:** {N} rund, ~{X} dni od początku do końca
- **Format:** {np. screening rekrutera → telefon techniczny → zadanie domowe → onsite (4 rundy) → hiring manager}
- **Trudność:** {X}/5 (śr. Glassdoor/GoWork, N opinii)
- **Odsetek pozytywnych doświadczeń:** {X}%
- **Znane osobliwości:** {np. "pair programming zamiast tablicy", "bez LeetCode, same praktyczne", "zadanie domowe na 4h"}
- **Źródła:** {linki}
```

Jeśli danych do pola brakuje, napisz "nieznane — za mało danych" zamiast zgadywać.

## Krok 2.5 — Mapa odbiorców

Sklasyfikuj każdą rundę z Kroku 2 do dokładnie jednego odbiorcy. Odbiorca decyduje, co priorytetyzować w Krokach 4 i 7.

| Odbiorca | Typowa runda | Główna ocena |
|----------|--------------|--------------|
| `recruiter-screen` | Pierwsza rozmowa (15–30 min, rekruter / HR / TA) | Bramka dopasowania: motywacja, wynagrodzenie, lokalizacja/wiza, harmonogram |
| `hiring-manager` | Menedżer / skip-level (30–45 min) | Dlaczego ta rola, dopasowanie zakresu, sygnały przywódcze |
| `peer-tech` | Techniczna IC (live coding, system design, przegląd zadania) | Głębia + współpraca na realnym stacku |
| `panel-mixed` | Onsite / loop z wieloma typami rozmówców w jednym bloku | Przecina powyższe |

Jeśli `Prowadzone przez` jest nieznane dla rundy, wnioskuj ostrożnie z czasu, pozycji i sygnałów z ogłoszenia. Typowe wzorce:

- Runda 1, krótka (15–30 min) → niemal zawsze `recruiter-screen`.
- Runda 2 — **nie zakładaj domyślnie**. Wiele firm wstawia tu techniczny screening prowadzony przez osobę z zespołu, inne hiring managera. Wybierz `peer-tech`, jeśli rundę opisano jako "screening techniczny" lub ma komponent coding/system-design; wybierz `hiring-manager`, jeśli opisano ją jako rozmowę menedżerską/skip-level; w innym razie oznacz jako `panel-mixed [inferred]` i przygotuj oba pakiety.
- Głęboki blok techniczny (live coding, system design, przegląd zadania) → `peer-tech`.
- Onsite / loop z wieloma rundami pod rząd → `panel-mixed`.

Oznacz wywnioskowanych odbiorców `[inferred]` i kontynuuj — skąpe dane na wczesnym etapie są normalne.

```markdown
## Mapa odbiorców
- **Runda 1** (screening rekrutera, 30 min) → `recruiter-screen`
- **Runda 2** (techniczny telefon, 60 min) → `peer-tech`
- **Runda 3** (rozmowa z hiring managerem, 45 min) → `hiring-manager`
- **Runda 4** (onsite loop, 4× 45 min) → `panel-mixed`
- ...
```

Powyższy przykład pokazuje typowy wzorzec, ale nie jest domyślny. Sklasyfikuj każdą rundę z faktycznego researchu — szczególnie runda 2 to często `peer-tech`, nie `hiring-manager`.

## Krok 3 — Rozbicie runda po rundzie

Dla każdej rundy odkrytej w researchu:

```markdown
### Runda {N}: {Typ} — odbiorca: `{audience}`
- **Czas:** {X} min
- **Prowadzone przez:** {osoba z zespołu / menedżer / skip-level / rekruter — jeśli znane}
- **Co oceniają:** {konkretne umiejętności lub cechy}
- **Zgłaszane pytania:**
  - {pytanie} — [źródło: Glassdoor/GoWork (URL/data)]
  - {pytanie} — [źródło: Blind (URL/data)]
- **Jak się przygotować:** {1-2 konkretne działania, dopasowane do odbiorcy — pełny pakiet w Kroku 4}
```

Jeśli struktura rundy jest nieznana, powiedz to i podaj najlepsze dostępne dane o typach rund spodziewanych na podstawie wielkości firmy, etapu i poziomu roli.

## Krok 4 — Prawdopodobne pytania (per odbiorca)

Pogrupuj wszystkie odkryte i wywnioskowane pytania wg odbiorcy, który je zadaje, nie wg typu pytania. W każdym odbiorcy przygotuj odpowiedzi specyficzne dla kandydata z `cv.md`, `article-digest.md`, `config/profile.yml` i `modes/_profile.md`. **Nigdy nie zmyślaj pytań** — pytania ze źródeł muszą mieć cytat, wywnioskowane muszą mieć tag `[inferred from JD]`.

Jeśli któryś z plików profilu brakuje, jest niekompletny lub nieaktualny, odnotuj lukę w treści (np. "cel wynagrodzeniowy nieznany — odwołaj do widełek rekrutera") i kontynuuj z tym, co dostępne, zamiast blokować przygotowanie. Wartością trybu jest output częściowy-ale-uczciwy, nie perfekcyjny-albo-nic.

### Odbiorca: `recruiter-screen`

Rekruter sprawdza dopasowanie, nie testuje umiejętności. Złe odpowiedzi (ogólnikowe widełki, mglista motywacja, brakująca logistyka) kończą proces, zanim zbierze się sygnał techniczny. Pokryj minimum:

- **"Opowiedz mi o swoim CV / czemu szukasz?"** — narracja 60–90 s zakotwiczona w narracji `modes/_profile.md` + archetyp roli.
- **Oczekiwania płacowe** — konkretne widełki z danych Kroku 1 (zarobki.pracuj.pl/No Fluff Jobs/Levels.fyi), zakotwiczone w `config/profile.yml` `compensation.target`. Rozróżnij B2B vs UoP. Odnotuj dźwignię: jeśli danych jest mało lub kandydat nie ma konkurencyjnej oferty, zarekomenduj odroczenie czystym skryptem ("Kalibruję do rynku dla {poziom}, możesz podać widełki tej roli?").
- **Dlaczego ta firma** — 2–3 zdania odwołujące się do publicznych sygnałów z Kroku 1 (niedawna premiera, nazwane wartości, praca zespołu). Unikaj ogólnych pochwał.
- **Lokalizacja / remote / wiza** — odpowiedź z polityki lokalizacji `config/profile.yml` i polityki z ogłoszenia. Oznacz deal-breakery z `modes/_profile.md`, by rekruter dobrze poprowadził.
- **Harmonogram / dostępność / okres wypowiedzenia** — liczby, nie ogólniki.
- **Inne procesy w toku** — tylko rekomendowane ramowanie; nigdy nie namawiaj kandydata do kłamstwa.
- **Czerwone flagi w tle** — przerwy, zmiany, nietypowe elementy z `cv.md` + `_profile.md`. Uczciwe, konkretne, zorientowane na przyszłość — nigdy defensywne.

### Odbiorca: `hiring-manager`

HM sprawdza motywację + dopasowanie zakresu. Już zaufał bramce logistycznej rekrutera; obchodzi go, czy weźmiesz odpowiedzialność za pracę. Pokryj minimum:

- **"Czemu ta rola, czemu teraz?"** — połącz 1–2 ostatnie role kandydata + narrację `_profile.md` z nazwanym wyzwaniem zespołu z Kroku 1.
- **"Jak wyglądałyby Twoje pierwsze 90 dni tutaj?"** — z zakresu ogłoszenia + niedawnej pracy zespołu (blog inżynierski, publiczny roadmap).
- **Pytania o przywództwo / współpracę** — mapuj na `interview-prep/story-bank.md`.
- **Ostre pytania zwrotne** — 2–3 powiązane z konkretną niedawną rzeczą, którą zespół wdrożył lub o niej pisał, nie ogólne "jak jest w zespole".

### Odbiorca: `peer-tech`

Tu żyją pierwotne koszyki Techniczny / Specyficzny dla roli. Osoby z zespołu oceniają głębię i współpracę na realnym stacku.

- **Pytania techniczne** (system design, coding, architektura, domena) — dla każdego: pytanie, źródło i jak wygląda mocna odpowiedź dla TEGO kandydata (odwołaj się do proof pointów z CV).
- **Pytania specyficzne dla roli** powiązane z archetypem ogłoszenia — dla każdego: pytanie, czemu pewnie pytają (które wymaganie mapuje) i najlepszy kąt kandydata.
- **Pytania zwrotne** — o on-call, kulturę code review, kadencję deploymentu, co ich zaskoczyło po dołączeniu.

### Odbiorca: `panel-mixed`

Onsite loopy i panele mieszane rzadko dają czas na przełączanie kontekstu — przygotowanie musi być wstępnie ułożone. Dla każdego slotu panelu:

- **Jeśli rozmówca jest nazwany w harmonogramie**, zrób szybki research LinkedIn/blog i przypisz go do jednego z trzech odbiorców (rekruter / HM / peer-tech). Potem czerp z pakietu tego odbiorcy.
- **Jeśli slot jest nieoznaczony**, przygotuj wszystkie trzy pakiety, ale ogranicz każdy do 3–5 najważniejszych pozycji, by kandydat się nie pogubił.
- **Dyscyplina przekazania**: powiedz kandydatowi wprost, czego NIE powtarzać słowo w słowo między slotami (ten sam proof point opowiedziany identycznie dwa razy sygnalizuje wyuczone odpowiedzi; zmieniaj kąt).
- **Zarządzanie energią**: 4-godzinne onsite najpierw wykańczają mniej doświadczonych. Oznacz slot najpewniej testujący głębię (zwykle peer-tech) i zachowaj na niego najświeższy materiał.

## Krok 5 — Mapowanie banku historii

Uruchom to mapowanie **per pakiet odbiorcy** z Kroku 4 — ta sama historia może mapować się inaczej do pytania rekrutera niż do pytania behawioralnego peer-tech, a jedna niesegmentowana tabela grozi dryfem między odbiorcami.

| # | Odbiorca | Prawdopodobne pytanie/temat | Najlepsza historia z story-bank.md | Dopasowanie | Luka? |
|---|----------|-----------------------------|------------------------------------|-------------|-------|
| 1 | recruiter-screen | ... | [Tytuł historii] | mocne/częściowe/brak | |
| 2 | hiring-manager | ... | [Tytuł historii] | mocne/częściowe/brak | |
| 3 | peer-tech | ... | [Tytuł historii] | mocne/częściowe/brak | |

- **mocne**: historia wprost odpowiada na pytanie
- **częściowe**: historia jest sąsiadująca, wymaga przeformułowania
- **brak**: brak istniejącej historii — oznacz dla użytkownika

Dla każdej luki zasugeruj: "Potrzebujesz historii o {temat}. Rozważ: {konkretne doświadczenie z cv.md, które może stać się historią STAR+R}."

Jeśli użytkownik chce naszkicować brakujące historie, pomóż zbudować format STAR+R i dopisz do `interview-prep/story-bank.md`.

## Krok 6 — Checklista przygotowania technicznego

Na podstawie tego, co firma faktycznie testuje, nie ogólnych porad:

```markdown
- [ ] {temat} — czemu: "{dowód z researchu}"
- [ ] {temat} — czemu: "{ich blog/produkt sugeruje, że to ważne}"
- [ ] {temat} — czemu: "{pytane w N/M niedawnych opiniach Glassdoor/GoWork}"
```

Priorytetyzuj wg częstotliwości i istotności dla roli. Maks. 10 pozycji.

## Krok 7 — Sygnały firmy (per odbiorca)

Co mówić, robić i czego unikać — z podziałem wg tego, kto słucha. Ten sam fakt może być siłą dla inżyniera z zespołu i żółtą flagą dla rekrutera; ramowanie ma znaczenie.

### Do rekrutera / screeningu HR

- **Co ujawnić**: motywacja, dopasowanie lokalizacji/wizy, harmonogram, czemu ta firma.
- **Czego NIE ujawniać**: twardej kwoty wynagrodzenia, gdy dźwignia niepewna (odwołaj do widełek); szczegółów innych procesów; opinii o niedawnych zwolnieniach / prasie firmy.
- **Słownictwo**: oficjalny język firmy o benefitach i politykach (ze strony kariery).
- **Czerwone flagi, których szukają**: niespodzianki wizowe, niedopasowanie wynagrodzenia, energia "szukam wszędzie".

### Do hiring managera

- **Od czego zacząć**: połączenie narracji kandydata (`_profile.md`) z nazwanym wyzwaniem zespołu z Kroku 1.
- **Słownictwo do użycia**: terminy używane wewnętrznie przez firmę — pokazuje przygotowanie.
- **Ostre pytania zwrotne**: 2–3 powiązane z niedawnymi newsami / wpisami z Kroku 1.

### Do osób z zespołu / panelu technicznego

- **Od czego zacząć**: proof pointy istotne dla stacku z `cv.md` / `article-digest.md`.
- **Czego unikać**: antywzorce oznaczone w opiniach Glassdoor / GoWork / Blind specyficznych dla tej firmy.
- **Pytania zwrotne**: rotacja on-call, normy code review, kadencja deploymentu, co ich zaskoczyło po dołączeniu.

### Do panelu mieszanego

- **Od czego zacząć**: pojedyncze 2-zdaniowe ramowanie trafiające do wszystkich trzech odbiorców — zwykle narracja + nazwane wyzwanie zespołu — potem pozwól każdemu rozmówcy sterować.
- **Czego nie powtarzać**: tego samego proof pointu opowiedzianego identycznie między slotami; zmieniaj kąt (rekruter słyszy liczbę-nagłówek, HM słyszy ramowanie wpływu na zespół, peer-tech słyszy szczegół techniczny).
- **Słownictwo**: trzymaj język przyjazny rekruterowi (wpływ, zakres), gdy w pokoju jest kierownictwo; przełącz na język peer (architektura, kompromisy, on-call), gdy są tylko IC.
- **Czego unikać**: zaprzeczania sobie między slotami co do wynagrodzenia, harmonogramu lub tego, co Cię ekscytuje. Rozmówcy porównują notatki.

## Wyjście

Zapisz pełny raport do `interview-prep/{company-slug}-{role-slug}.md` z tym nagłówkiem:

```markdown
# Wywiad rekrutacyjny: {Firma} — {Rola}

**URL:** {URL ogłoszenia lub strony kariery firmy, lub "N/A" jeśli z polecenia rekrutera}
**Wiarygodność:** {poziom skopiowany z Bloku G raportu oceny, lub "nieznana" jeśli brak raportu}
**Raport:** {link do raportu oceny jeśli istnieje, lub "N/A"}
**Research z dnia:** {YYYY-MM-DD}
**Źródła:** {N} opinii Glassdoor/GoWork, {N} postów Blind, {N} innych
**Pokryci odbiorcy:** {recruiter-screen, hiring-manager, peer-tech, panel-mixed}
```

## Po researchu

Po dostarczeniu raportu:

1. Zapytaj użytkownika, czy chce naszkicować historie do luk znalezionych w Kroku 5
2. Jeśli ma umówioną datę rozmowy, odnotuj ją: "Twoja rozmowa jest za {X} dni. Mam ustawić przypomnienie o powtórce tego przygotowania?"
3. Zasugeruj uruchomienie trybu `deep`, jeśli research firmy w Kroku 1 był skąpy — tryb deep pokrywa strategię, kulturę i krajobraz konkurencyjny głębiej

## Reguły

- **NIGDY nie wymyślaj pytań rekrutacyjnych i nie przypisuj ich do źródeł.** Wywnioskowane pytania muszą być oznaczone `[inferred from JD]`.
- **NIGDY nie zmyślaj ocen ani statystyk Glassdoor/GoWork.** Jeśli danych nie ma, powiedz to.
- **Cytuj wszystko.** Każde pytanie, każda statystyka, każde twierdzenie dostaje źródło lub tag `[inferred]`.
- Generuj po polsku (lub w języku procesu, jeśli rekrutacja po angielsku).
- Bądź konkretny. To roboczy dokument przygotowawczy, nie mowa motywacyjna.
