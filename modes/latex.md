# Tryb: latex — Eksport CV do LaTeX/Overleaf

Wyeksportuj dopasowane, zoptymalizowane pod ATS CV jako plik `.tex` i skompiluj je do PDF przez `tectonic` lub `pdflatex`.

## Pipeline

1. Przeczytaj `cv.md` jako źródło prawdy
2. Przeczytaj `config/profile.yml` dla tożsamości kandydata i danych kontaktowych
3. Poproś użytkownika o ogłoszenie (JD), jeśli nie ma go w kontekście (tekst lub URL)
4. Wyciągnij 15-20 słów kluczowych z ogłoszenia
5. Wykryj język ogłoszenia → język CV (domyślnie PL)
6. Wykryj archetyp roli → dostosuj ramowanie
7. Przepisz Podsumowanie zawodowe, wstrzykując słowa kluczowe z JD (te same reguły co w trybie `pdf` — NIGDY nie zmyślaj umiejętności)
8. Wybierz 3-4 najtrafniejsze projekty pod ofertę
9. Przestaw punkty doświadczenia według trafności do JD
10. Wstrzyknij słowa kluczowe naturalnie do istniejących osiągnięć
11. Wygeneruj plik `.tex` z użyciem `templates/cv-template.tex`
12. Zapisz do `output/cv-{candidate}-{company}-{YYYY-MM-DD}.tex`
13. Uruchom: `node generate-latex.mjs output/cv-{candidate}-{company}-{YYYY-MM-DD}.tex output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf`
14. Zaraportuj: ścieżkę .tex, ścieżkę .pdf, rozmiary plików, liczbę sekcji, % pokrycia słów kluczowych

**Wymaga:** `tectonic` (preferowany — `brew install tectonic`, auto-pobiera pakiety) lub `pdflatex` (MiKTeX / TeX Live) na PATH.

## Placeholdery szablonu

Szablon w `templates/cv-template.tex` używa składni `{{PLACEHOLDER}}`:

| Placeholder | Źródło |
|-------------|--------|
| `{{NAME}}` | `profile.yml → candidate.full_name` |
| `{{CONTACT_LINE}}` | Telefon / Miasto, region / status wizowy — budowane z profile.yml |
| `{{EMAIL_URL}}` | Surowy email dla URL `mailto:` — nie może być escapowany w LaTeX (z profile.yml) |
| `{{EMAIL_DISPLAY}}` | Escapowany email do wyświetlenia — znaki specjalne LaTeX jak `_` muszą być escapowane, np. `imie\_nazwisko@example.com` |
| `{{LINKEDIN_URL}}` | Pełny URL ze schematem dla `\href{}`: np. `https://linkedin.com/in/username`. Jeśli `profile.yml` przechowuje sam host+ścieżkę (bez schematu), dodaj `https://` przed podstawieniem. |
| `{{LINKEDIN_DISPLAY}}` | Tylko tekst do wyświetlenia (bez schematu): `linkedin.com/in/username` |
| `{{GITHUB_URL}}` | Pełny URL ze schematem dla `\href{}`: np. `https://github.com/username`. Jeśli `profile.yml` przechowuje sam host+ścieżkę, dodaj `https://`. |
| `{{GITHUB_DISPLAY}}` | Tylko tekst do wyświetlenia (bez schematu): `github.com/username` |
| `{{EDUCATION}}` | Bloki LaTeX `\resumeSubheading` z sekcji Wykształcenie w cv.md |
| `{{EXPERIENCE}}` | Bloki LaTeX `\resumeSubheading` + `\resumeItem` — przestawione punkty |
| `{{PROJECTS}}` | Bloki LaTeX `\resumeProjectHeading` + `\resumeItem` — 3-4 wybrane |
| `{{SKILLS}}` | Linie LaTeX `\textbf{Kategoria}{: elementy}` z sekcji Umiejętności techniczne w cv.md |

## Reguły generowania treści LaTeX

### Wykształcenie

Każdy wpis staje się:

```latex
    \resumeSubheading
    {Instytucja}{Miasto, region}
    {Stopień}{Zakres dat}
```

Jeśli istnieją przedmioty, dodaj:

```latex
        \resumeItemListStart
            \resumeItem{\textbf{Przedmioty:} Przedmiot1, Przedmiot2, ...}
        \resumeItemListEnd
```

### Doświadczenie

Każda rola staje się:

```latex
    \resumeSubheading
      {Firma}{Zakres dat}
      {Tytuł roli}{Lokalizacja}
      \resumeItemListStart
        \resumeItem{Tekst punktu ze wstrzykniętymi słowami kluczowymi z JD}
        ...
      \resumeItemListEnd
```

### Projekty

Każdy projekt staje się:

```latex
\resumeProjectHeading{Nazwa projektu \emph{$|$ Afiliacja/Kontekst}}{Data}
\resumeItemListStart
    \resumeItem{Tekst punktu}
    ...
\resumeItemListEnd
```

### Umiejętności

```latex
    \textbf{Języki}{: C, C++, Java, ...} \\
    \textbf{Frameworki \& ML}{: PyTorch, LangChain, ...} \\
    \textbf{Narzędzia \& Cloud}{: Docker, Kubernetes, ...}
```

## Escapowanie LaTeX (KRYTYCZNE)

Cała treść tekstowa MUSI być escapowana pod LaTeX przed wstawieniem:

| Znak | Escape |
|-----------|--------|
| `&` | `\&` |
| `%` | `\%` |
| `$` | `\$` |
| `#` | `\#` |
| `_` | `\_` |
| `{` | `\{` |
| `}` | `\}` |
| `~` | `\textasciitilde{}` |
| `^` | `\textasciicircum{}` |
| `\` | `\textbackslash{}` |
| `±` | `$\pm$` |
| `→` | `$\rightarrow$` |

**Wyjątek:** NIE escapuj samych komend LaTeX (`\resumeItem`, `\textbf` itp.) — tylko treść tekstową dostarczoną przez użytkownika.

**Wyjątek dla URL-i:** NIE escapuj tekstu w pierwszym argumencie `\href{URL}{...}`. URL musi pozostać surowy (lub zakodowany procentowo wg RFC 3986). Escapuj tylko *tekst wyświetlany* (drugi argument). Na przykład:
```latex
\href{https://example.com/path_with_underscores}{Example\_Display}
```

## Reguły ATS (te same co w trybie pdf)

- Układ jednokolumnowy (wymuszony przez szablon)
- Standardowe nagłówki sekcji: Wykształcenie, Doświadczenie zawodowe, Projekty własne, Umiejętności techniczne
- UTF-8, czytelny maszynowo przez `\pdfgentounicode=1`
- Rozłożone słowa kluczowe: pierwszy punkt każdej roli, sekcja umiejętności
- Bez obrazów, bez grafiki, bez koloru w tekście

## Strategia wstrzykiwania słów kluczowych

Te same reguły etyczne co w `modes/pdf.md`:
- NIGDY nie dodawaj umiejętności, których kandydat nie ma
- Przeformułowuj tylko istniejące doświadczenie, używając słownictwa z JD
- Przykłady:
  - JD mówi „pipeline'y RAG" → przeformułuj „workflow z LLM z retrievalem" na „projektowanie pipeline'ów RAG"
  - JD mówi „MLOps" → przeformułuj „observability, ewaluacje" na „MLOps i observability"

## Kompatybilność z Overleaf

Wygenerowany plik `.tex` używa wyłącznie standardowych pakietów CTAN (bez własnych ani dołączonych zależności):

- `latexsym`, `fullpage`, `titlesec`, `marvosym`, `color`, `verbatim`, `enumitem`
- `hyperref`, `fancyhdr`, `babel`, `tabularx`, `fontawesome5`, `multicol`, `glyphtounicode`

Wgraj plik `.tex` bezpośrednio do Overleaf — kompiluje się bez dodatkowej konfiguracji.
