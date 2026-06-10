# Tryb: tracker — Tracker aplikacji

Przeczytaj i pokaż `data/applications.md`.

**Format trackera:**
```markdown
| # | Data | Firma | Rola | Ocena | Status | PDF | Raport |
```

Możliwe statusy (wartości kanoniczne EN czytane przez dashboard; w nawiasach polski alias):
`Evaluated` (Oceniona) → `Applied` (Wysłana) → `Responded` (Odpowiedź) → `Interview` (Rozmowa) → `Offer` (Oferta) / `Rejected` (Odrzucona) / `Discarded` (Odrzucona przez kandydata) / `SKIP` (Nie aplikować)

- `Applied` = kandydat wysłał aplikację
- `Responded` = rekruter/firma odezwał się, a kandydat odpowiedział (inbound)
- `Interview` = aktywny proces rozmów
- Ruch wychodzący (kandydat sam pisze do kogoś z firmy, np. ruch na LinkedIn) odnotowuj w notce, status pozostaje `Applied`/`Evaluated`

W kolumnie Status używaj wartości kanonicznej EN (dla zgodności z dashboardem i normalizatorem). Polskie aliasy są akceptowane przy wpisywaniu — `normalize-statuses.mjs` zmapuje je na kanoniczne.

Jeśli użytkownik prosi o aktualizację statusu, edytuj odpowiedni wiersz.

Pokaż też statystyki:
- Łączna liczba aplikacji
- Wg statusu
- Średnia ocena
- % z wygenerowanym PDF
- % z wygenerowanym raportem
