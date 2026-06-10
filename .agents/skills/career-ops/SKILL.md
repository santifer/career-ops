---
name: career-ops
description: Centrum dowodzenia poszukiwaniem pracy AI — oceniaj oferty, generuj CV, skanuj portale, śledź aplikacje
arguments: mode # specyficzne dla Claude Code
user-invocable: true
argument-hint: "[scan | deep | pdf | oferta | ofertas | apply | batch | tracker | pipeline | contacto | training | project | interview-prep | update]"
license: MIT
---

# career-ops — Router

## Routing trybów

Ustal tryb na podstawie `$mode`:

| Wejście | Tryb |
|---------|------|
| (puste / brak argumentów) | `discovery` — Pokaż menu komend |
| Tekst ogłoszenia lub URL (bez sub-komendy) | **`auto-pipeline`** |
| `oferta` | `oferta` |
| `ofertas` | `ofertas` |
| `contacto` | `contacto` |
| `deep` | `deep` |
| `interview-prep` | `interview-prep` |
| `pdf` | `pdf` |
| `training` | `training` |
| `project` | `project` |
| `tracker` | `tracker` |
| `pipeline` | `pipeline` |
| `apply` | `apply` |
| `scan` | `scan` |
| `batch` | `batch` |
| `patterns` | `patterns` |
| `followup` | `followup` |
| `update` | `update` |

**Wykrywanie auto-pipeline:** Jeśli `$mode` nie jest znaną sub-komendą ORAZ zawiera tekst ogłoszenia (słowa kluczowe: "obowiązki", "wymagania", "kwalifikacje", "o roli", "szukamy", "responsibilities", "requirements", nazwa firmy + stanowisko) lub URL do ogłoszenia, wykonaj `auto-pipeline`.

Jeśli `$mode` nie jest sub-komendą ORAZ nie wygląda jak ogłoszenie, pokaż discovery.

---

## Tryb Discovery (brak argumentów)

Pokaż to menu:

```
career-ops — Centrum dowodzenia

Dostępne komendy:
  /career-ops {ogłoszenie} → AUTO-PIPELINE: ocena + raport + PDF + tracker (wklej tekst lub URL)
  /career-ops pipeline  → Przetwórz oczekujące URL-e ze skrzynki (data/pipeline.md)
  /career-ops oferta    → Sama ocena A-F (bez automatycznego PDF)
  /career-ops ofertas   → Porównaj i uszereguj wiele ofert
  /career-ops contacto  → Ruch na LinkedIn: znajdź kontakty + napisz wiadomość
  /career-ops deep      → Pogłębiony research o firmie
  /career-ops interview-prep → Wygeneruj dokument przygotowania do rozmowy pod firmę
  /career-ops pdf       → Samo PDF, CV zoptymalizowane pod ATS
  /career-ops training  → Oceń kurs/certyfikat względem North Star
  /career-ops project   → Oceń pomysł na projekt do portfolio
  /career-ops tracker   → Przegląd statusów aplikacji
  /career-ops apply     → Asystent aplikacji na żywo (czyta formularz + generuje odpowiedzi)
  /career-ops scan      → Skanuj portale i odkrywaj nowe oferty
  /career-ops batch     → Przetwarzanie wsadowe z równoległymi workerami
  /career-ops patterns  → Analizuj wzorce odrzuceń i poprawiaj targetowanie
  /career-ops followup  → Tracker kadencji follow-up: oznacz zaległe, generuj szkice
  /career-ops update    → Aktualizuj pliki systemu career-ops z podglądem zmian + kontrolą zgodności

Skrzynka: dodaj URL-e do data/pipeline.md → /career-ops pipeline
Lub wklej ogłoszenie bezpośrednio, aby uruchomić pełny pipeline.
```

---

## Ładowanie kontekstu wg trybu

Po ustaleniu trybu załaduj niezbędne pliki przed wykonaniem:

### Tryby wymagające `_shared.md` + ich pliku trybu:
Przeczytaj `modes/_shared.md` + `modes/{mode}.md`

Dotyczy: `auto-pipeline`, `oferta`, `ofertas`, `pdf`, `contacto`, `apply`, `pipeline`, `scan`, `batch`

### Tryby samodzielne (tylko ich plik trybu):
Przeczytaj `modes/{mode}.md`

Dotyczy: `tracker`, `deep`, `interview-prep`, `training`, `project`, `patterns`, `followup`

### Tryby delegowane do subagenta:
Dla `scan`, `apply` (z Playwright) i `pipeline` (3+ URL-e): uruchom jako Agent z wstrzykniętą do promptu subagenta treścią `_shared.md` + `modes/{mode}.md`.

```
Agent(
  subagent_type="general-purpose",
  prompt="[treść modes/_shared.md]\n\n[treść modes/{mode}.md]\n\n[dane specyficzne dla wywołania]",
  description="career-ops {mode}"
)
```

Wykonaj instrukcje z załadowanego pliku trybu.
