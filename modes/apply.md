# Tryb: apply — Asystent aplikacji na żywo

Tryb interaktywny na czas, gdy kandydat wypełnia formularz aplikacyjny w Chrome. Czyta to, co jest na ekranie, ładuje wcześniejszy kontekst oferty i generuje spersonalizowane odpowiedzi na każde pytanie formularza.

## Wymagania

- **Najlepiej z Playwright w trybie widocznym**: W trybie widocznym kandydat widzi przeglądarkę, a Claude może wchodzić w interakcję ze stroną.
- **Bez Playwright**: kandydat udostępnia zrzut ekranu lub wkleja pytania ręcznie.

## Przebieg

```text
1. WYKRYJ      → Przeczytaj aktywną kartę Chrome (zrzut/URL/tytuł)
2. ZIDENTYFIKUJ → Wyciągnij firmę + rolę ze strony
3. SZUKAJ      → Dopasuj do istniejących raportów w reports/
4. ZAŁADUJ     → Przeczytaj pełny raport + Sekcję H (jeśli istnieje)
5. PORÓWNAJ    → Czy rola na ekranie zgadza się z ocenioną? Jeśli zmieniona → powiadom
6. ANALIZUJ    → Zidentyfikuj WSZYSTKIE widoczne pytania formularza
7. GENERUJ     → Dla każdego pytania wygeneruj spersonalizowaną odpowiedź
8. PREZENTUJ   → Pokaż sformatowane odpowiedzi do kopiuj-wklej
```

## Krok 1 — Wykryj ofertę

**Z Playwright:** Zrób zrzut aktywnej strony. Przeczytaj tytuł, URL i widoczną treść.

**Bez Playwright:** Poproś kandydata, by:
- Udostępnił zrzut ekranu formularza (narzędzie Read czyta obrazy)
- Lub wkleił pytania jako tekst
- Lub podał firmę + rolę, byśmy mogli ją wyszukać

## Krok 2 — Zidentyfikuj i wyszukaj kontekst

1. Wyciągnij nazwę firmy i tytuł roli ze strony
2. Szukaj w `reports/` po nazwie firmy (grep bez rozróżniania wielkości liter)
3. Jeśli jest dopasowanie → załaduj pełny raport
4. Jeśli jest Sekcja H → załaduj wcześniejsze szkice odpowiedzi jako bazę
5. Jeśli NIE ma dopasowania → powiadom i zaproponuj szybki auto-pipeline

## Krok 3 — Wykryj zmiany w roli

Jeśli rola na ekranie różni się od ocenionej:
- **Powiadom kandydata**: "Rola zmieniła się z [X] na [Y]. Mam ocenić ponownie czy dostosować odpowiedzi do nowego tytułu?"
- **Jeśli dostosować**: Dopasuj odpowiedzi do nowej roli bez ponownej oceny
- **Jeśli ocenić ponownie**: Wykonaj pełną ocenę A-F, zaktualizuj raport, wygeneruj ponownie Sekcję H
- **Zaktualizuj tracker**: Zmień tytuł roli w applications.md, jeśli dotyczy

## Krok 4 — Analizuj pytania formularza

Zidentyfikuj WSZYSTKIE widoczne pytania:
- Pola tekstowe (list motywacyjny, dlaczego ta rola itp.)
- Listy rozwijane (skąd się dowiedziałeś, prawo do pracy itp.)
- Tak/Nie (relokacja, wiza itp.)
- Pola wynagrodzenia (widełki, oczekiwania)
- Pola uploadu (CV, list motywacyjny PDF)

Sklasyfikuj każde pytanie:
- **Już odpowiedziane w Sekcji H** → dostosuj istniejącą odpowiedź
- **Nowe pytanie** → wygeneruj odpowiedź z raportu + cv.md

## Krok 5 — Generuj odpowiedzi

Dla każdego pytania wygeneruj odpowiedź zgodnie z:

1. **Kontekst raportu**: Użyj proof pointów z bloku B, historii STAR z bloku F
2. **Wcześniejsza Sekcja H**: Jeśli istnieje szkic, użyj go jako bazy i dopracuj
3. **Ton "to ja wybieram Was"**: Ten sam schemat co auto-pipeline
4. **Konkretność**: Odwołaj się do czegoś konkretnego z ogłoszenia widocznego na ekranie
5. **Proof point career-ops**: Dołącz w polu "Dodatkowe informacje", jeśli takie jest

**Format wyjścia:**

```text
## Odpowiedzi dla [Firma] — [Rola]

Na podstawie: Raport #NNN | Ocena: X.X/5 | Archetyp: [typ]

---

### 1. [Dokładne pytanie z formularza]
> [Odpowiedź gotowa do kopiuj-wklej]

### 2. [Następne pytanie]
> [Odpowiedź]

...

---

Notatki:
- [Wszelkie obserwacje o roli, zmianach itp.]
- [Sugestie personalizacji do przejrzenia przez kandydata]
```

## Krok 6 — Po aplikacji (opcjonalnie)

Jeśli kandydat potwierdzi wysłanie aplikacji:
1. Zaktualizuj status w `applications.md` z "Evaluated" na "Applied"
2. Zaktualizuj Sekcję H raportu finalnymi odpowiedziami
3. Zaproponuj kolejny krok: `/career-ops contacto` dla kontaktu na LinkedIn

## Obsługa przewijania

Jeśli formularz ma więcej pytań niż widoczne:
- Poproś kandydata, by przewinął i udostępnił kolejny zrzut
- Lub wkleił pozostałe pytania
- Przetwarzaj iteracyjnie, aż cały formularz zostanie pokryty
