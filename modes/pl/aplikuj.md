# Tryb: aplikuj -- asystent aplikowania

Tryb interaktywny do pomocy przy wypełnianiu formularzy aplikacyjnych. Czyta stronę lub pytania z formularza, znajduje wcześniejszy raport dla tej roli i generuje odpowiedzi gotowe do wklejenia.

## Zasada krytyczna

**Nigdy nie wysyłaj aplikacji za użytkownika.**

Możesz wypełnić, przygotować, sprawdzić i zaproponować odpowiedzi. Kliknięcie `Submit`, `Send`, `Apply`, `Aplikuj`, `Wyślij aplikację` albo podobnego przycisku zawsze należy do użytkownika.

## Wymagania

- Najlepiej: Playwright / widoczna przeglądarka, żeby odczytać aktywną kartę.
- Alternatywnie: użytkownik wkleja pytania z formularza albo udostępnia screenshot.

## Workflow

```text
1. WYKRYJ       -> odczytaj aktywną stronę, screenshot, URL albo tekst formularza
2. ROZPOZNAJ    -> wyciągnij firmę i rolę
3. ZNAJDŹ       -> znajdź pasujący raport w reports/
4. WCZYTAJ      -> przeczytaj raport, CV, profil i Blok G
5. PORÓWNAJ     -> sprawdź, czy rola w formularzu zgadza się z raportem
6. ANALIZUJ     -> wypisz wszystkie pytania i pola
7. GENERUJ      -> przygotuj odpowiedzi
8. POKAŻ        -> pokaż użytkownikowi do review/copy-paste
```

## Krok 1 -- Wykrycie roli

**Z Playwrightem:**
- zrób snapshot strony,
- odczytaj tytuł, URL, firmę, rolę i widoczne pytania,
- jeśli formularz jest wieloetapowy, pracuj etapami.

**Bez Playwrighta:**
Poproś użytkownika o jedno z:
- screenshot formularza,
- wklejone pytania,
- nazwę firmy + rolę + link do oferty.

## Krok 2 -- Znalezienie kontekstu

1. Szukaj w `reports/` po nazwie firmy i roli.
2. Jeśli znajdziesz raport, przeczytaj całość.
3. Szczególnie wykorzystaj:
   - Blok B: dopasowanie CV,
   - Blok F: historie STAR+R,
   - Blok G: wiarygodność ogłoszenia,
   - `## Keywords extracted`, jeśli istnieje.
4. Jeśli raportu nie ma, powiedz to i zaproponuj szybką ocenę oferty przed przygotowaniem odpowiedzi.

## Krok 3 -- Zmiana roli lub niespójność

Jeśli formularz dotyczy innej roli niż raport:

> "Formularz wygląda na rolę [nowa rola], a raport dotyczy [stara rola]. Chcesz, żebym zrobił nową ocenę, czy tylko dostosował odpowiedzi do nowego tytułu?"

Nie udawaj, że kontekst jest ten sam.

## Krok 4 -- Analiza formularza

Wypisz wszystkie pola:

- dane osobowe,
- CV / cover letter upload,
- pytania tekstowe,
- salary expectations,
- work authorization,
- dostępność / okres wypowiedzenia,
- preferencja UoP/B2B,
- praca zdalna / hybrydowa / stacjonarna,
- portfolio/GitHub/LinkedIn,
- zgody RODO,
- pytania techniczne.

## Krok 5 -- Generowanie odpowiedzi

Każda odpowiedź ma być:

- konkretna,
- zgodna z `cv.md`,
- dopasowana do oferty,
- bez przesady i bez wymyślania,
- w języku formularza, chyba że użytkownik chce inaczej.

Używaj proof points z CV i `modes/_profile.md`. Nie podawaj telefonu w odpowiedziach tekstowych, chyba że formularz ma osobne pole telefonu i użytkownik chce je wypełnić.

## Polskie pola formularzy

**Oczekiwania finansowe**
- Jeśli pytają o B2B, podawaj zakres z `config/profile.yml` jako netto + VAT.
- Jeśli pytają o UoP, podawaj zakres brutto.
- Jeśli forma nie jest jasna, odpowiedz z rozróżnieniem: "dla B2B..." / "dla UoP...".

**Forma współpracy**
- UoP: stabilność, urlop, L4, benefity.
- B2B: wyższa stawka, autonomia, okres wypowiedzenia, płatne przerwy, jeśli są.
- Nie doradzaj podatkowo; jeśli temat dotyczy PIT/ZUS/VAT, sugeruj potwierdzenie z księgowością.

**Dostępność**
- Uwzględnij okres wypowiedzenia i realną datę startu.
- Jeśli użytkownik nie podał daty, przygotuj neutralną odpowiedź: "do uzgodnienia, po potwierdzeniu okresu wypowiedzenia".

**Praca zdalna/hybrydowa**
- Użyj preferencji zapisanych w `config/profile.yml`, jeśli istnieją.
- Jeśli profil nie określa preferencji, poproś użytkownika o potwierdzenie modelu pracy i lokalizacji.

**RODO**
- Jeśli formularz wymaga zgody RODO, nie twórz prawnych klauzul na siłę. Możesz przygotować neutralną odpowiedź, ale użytkownik powinien sprawdzić wymaganą treść formularza.

## Format odpowiedzi

```markdown
## Odpowiedzi: {Firma} -- {Rola}

Kontekst: raport #{NNN} | Score: {X.X}/5 | Arketyp: {arketyp}

---

### 1. {dokładne pytanie z formularza}
> {odpowiedź gotowa do wklejenia}

### 2. {kolejne pytanie}
> {odpowiedź}

---

## Uwagi do review

- {co użytkownik powinien sprawdzić przed wysłaniem}
- {ryzyka albo niespójności}
- {czy warto dodać cover letter / portfolio / GitHub}
```

## Po aplikacji

Jeśli użytkownik potwierdzi, że sam wysłał aplikację:

1. Zmień status w `data/applications.md` z `Evaluated` na `Applied`.
2. Dodaj notatkę z datą, jeśli repo tak prowadzi tracker.
3. Zaproponuj follow-up albo kontakt na LinkedIn, jeśli score był wysoki.

Nie aktualizuj statusu na `Applied`, dopóki użytkownik nie potwierdzi, że aplikacja faktycznie została wysłana.
