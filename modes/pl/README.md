# career-ops -- Polskie tryby (`modes/pl/`)

Ten folder zawiera polskie wersje najważniejszych trybów career-ops dla osób, które aplikują na polskie oferty IT albo chcą oceniać oferty przez pryzmat polskiego rynku pracy.

## Kiedy używać?

Użyj `modes/pl/`, jeśli przynajmniej jeden warunek jest prawdziwy:

- aplikujesz na **polskie oferty pracy** lub role w firmach zatrudniających w Polsce,
- chcesz, żeby raporty i odpowiedzi do formularzy były pisane naturalnym polskim językiem technicznym,
- porównujesz **UoP, B2B, kontrakt, netto/brutto, VAT, ZUS, PIT, urlop i okres wypowiedzenia**,
- chcesz dobrze oceniać pracę zdalną, hybrydową i oferty "Poland remote".

Jeśli oferta jest po angielsku i dotyczy firmy międzynarodowej, nadal możesz użyć standardowych `modes/`. Jeśli jednak oferta dotyczy polskiego rynku, polskie tryby lepiej interpretują lokalne warunki.

## Jak włączyć?

### Opcja 1 -- na daną sesję

Na początku sesji powiedz agentowi:

> "Używaj polskich trybów z `modes/pl/`."

albo:

> "Oceniaj polskie oferty przez `modes/pl/_shared.md` i `modes/pl/oferta.md`."

### Opcja 2 -- na stałe w profilu

Dodaj do `config/profile.yml`:

```yaml
language:
  primary: pl
  modes_dir: modes/pl
```

To jest konwencja career-ops, nie twardy mechanizm w kodzie. Agent powinien najpierw przeczytać `config/profile.yml`, zobaczyć `language.modes_dir`, a potem dla polskich ofert czytać pliki z tego folderu. Brakujące tryby nadal korzystają z głównych plików w `modes/`.

## Przetłumaczone tryby

| Plik | Źródło | Cel |
|------|--------|-----|
| `_shared.md` | `modes/_shared.md` | Wspólny kontekst, punktacja, zasady, polski rynek pracy |
| `oferta.md` | `modes/oferta.md` | Pełna ocena pojedynczej oferty, bloki A-G |
| `aplikuj.md` | `modes/apply.md` | Asystent do wypełniania formularzy aplikacyjnych |
| `pipeline.md` | `modes/pipeline.md` | Przetwarzanie URL-i z `data/pipeline.md` |

Pozostałe tryby (`scan`, `batch`, `pdf`, `tracker`, `auto-pipeline`, `deep`, `contacto`, `ofertas`, `project`, `training`, `patterns`, `followup`, `update`) zostają w wersji bazowej. Zawierają głównie komendy, ścieżki, formaty danych i instrukcje narzędziowe, więc nie wymagają pełnej lokalizacji na start.

## Co zostaje po angielsku?

Celowo nie tłumaczymy:

- nazw plikow i folderow: `cv.md`, `config/profile.yml`, `modes/_profile.md`, `reports/`, `output/`, `data/pipeline.md`,
- nazw narzędzi: `Playwright`, `WebSearch`, `WebFetch`, `Read`, `Write`, `Edit`, `Shell`,
- statusów w trackerze: `Evaluated`, `Applied`, `Responded`, `Interview`, `Offer`, `Rejected`, `Discarded`, `SKIP`,
- standardowych terminów technicznych, kiedy polski odpowiednik brzmiałby sztucznie: `pipeline`, `tracker`, `report`, `score`, `archetype`, `proof point`, `deploy`, `backend`, `frontend`.

Tryby używają polskiego technicznego stylu tak, jak mówi się w zespołach IT w Warszawie, Krakowie, Wrocławiu, Gdańsku czy zdalnych zespołach międzynarodowych: polski tekst, angielskie terminy tam, gdzie są standardem.

## Słownik

| English | Polski w tej codebase |
|---------|-----------------------|
| Job posting | Oferta pracy / ogłoszenie |
| Application | Aplikacja / zgłoszenie / proces rekrutacyjny |
| Cover letter | List motywacyjny |
| Resume / CV | CV |
| Salary | Wynagrodzenie |
| Compensation | Pakiet / całkowite wynagrodzenie |
| Salary range | Widełki wynagrodzenia |
| Gross / net | Brutto / netto |
| Employment contract | Umowa o pracę / UoP |
| B2B contract | Kontrakt B2B |
| Mandate contract | Umowa zlecenie |
| Specific-task contract | Umowa o dzieło |
| Notice period | Okres wypowiedzenia |
| Probation | Okres próbny |
| Annual leave | Urlop wypoczynkowy |
| Sick leave | Zwolnienie chorobowe / L4 |
| Social security | ZUS |
| Income tax | PIT |
| VAT invoice | Faktura VAT |
| Remote / hybrid / onsite | Zdalnie / hybrydowo / stacjonarnie |
| Private healthcare | Prywatna opieka medyczna |
| Gym card | Karta sportowa / Multisport |
| Holiday subsidy | Wczasy pod gruszą |
| Training budget | Budżet szkoleniowy |
| Recruiter | Rekruter / rekruterka |
| Hiring manager | Hiring manager / manager rekrutujący |
| Interview | Rozmowa rekrutacyjna |

## Wskazówki dla rozbudowy

1. Tłumacz sens, nie słowo w słowo.
2. Zachowuj strukturę bloków A-G, tabele, formaty TSV i ścieżki plików.
3. Nie dodawaj danych osobowych do `modes/pl/*`; personalizacja należy do `modes/_profile.md` i `config/profile.yml`.
4. Testuj tryb na prawdziwych polskich ofertach przed PR-em.
