# Career-Ops

[English](README.md) | [Polski](README.pl.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [한국어](README.ko-KR.md) | [日本語](README.ja.md) | [简体中文](README.cn.md) | [繁體中文](README.zh-TW.md) | [Українська](README.ua.md) | [Русский](README.ru.md)

<p align="center">
  <a href="https://x.com/santifer"><img src="docs/hero-banner.jpg" alt="Career-Ops Multi-Agent Job Search System" width="800"></a>
</p>

<p align="center">
  <em>Spędziłem miesiące, aplikując na trudnym poziomie. Więc zbudowałem system, który chciałbym mieć.</em><br>
  Firmy używają AI, by filtrować kandydatów. <strong>Ja po prostu dałem kandydatom AI, by <em>wybierali</em> firmy.</strong><br>
  <em>Teraz jest open source.</em>
</p>

<p align="center">
  <a href="https://trendshift.io/repositories/25195" target="_blank"><img src="https://trendshift.io/api/badge/repositories/25195" alt="santifer%2Fcareer-ops | Trendshift" style="width: 245px; height: 54px; vertical-align: middle;" width="245" height="54"/></a>
  &nbsp;&nbsp;
  <a href="https://www.producthunt.com/products/santifer-io?utm_source=badge-featured&utm_medium=badge" target="_blank"><img src="docs/press/producthunt.svg" alt="Career-Ops on Claude | Product Hunt" style="width: 206px; height: 54px; vertical-align: middle;" width="206" height="54"/></a>
</p>

<p align="center"><sub>OPISANE W</sub></p>

<p align="center">
  <a href="https://wired.com.gr/article/to-ai-ergaleio-pou-fernei-epanastasi-ston-tropo-pou-psachnoume-douleia/" rel="noopener noreferrer nofollow"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/press/wired-dark.svg"><img src="docs/press/wired.svg" alt="WIRED" height="32"></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.businessinsider.com/how-i-built-tool-filter-job-listings-landed-head-ai-2026-4" rel="noopener noreferrer nofollow"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/press/business-insider-dark.svg"><img src="docs/press/business-insider.svg" alt="Business Insider" height="32"></picture></a>
</p>

---

<p align="center">
  <img src="docs/demo.gif" alt="Career-Ops Demo" width="800">
</p>

<p align="center"><strong>740+ ocenionych ofert · 100+ spersonalizowanych CV · 1 wymarzona rola zdobyta</strong></p>

<p align="center"><a href="https://discord.gg/8pRpHETxa4"><img src="https://img.shields.io/badge/Do%C5%82%C4%85cz_do_spo%C5%82eczno%C5%9Bci-Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a></p>

<p align="center">
  <sub>Zbudowane z</sub><br>
  <img src="https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white" alt="Claude Code">
  <img src="https://img.shields.io/badge/OpenCode-111827?style=flat&logo=terminal&logoColor=white" alt="OpenCode">
  <img src="https://img.shields.io/badge/Gemini_CLI-4285F4?style=flat&logo=google&logoColor=white" alt="Gemini CLI">
  <img src="https://img.shields.io/badge/Codex-412991?style=flat&logo=openai&logoColor=white" alt="Codex">
  <img src="https://img.shields.io/badge/Qwen-615CED?style=flat" alt="Qwen">
  <img src="https://img.shields.io/badge/GitHub_Copilot-000?style=flat&logo=githubcopilot&logoColor=white" alt="GitHub Copilot">
  <br>
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white" alt="Go">
  <img src="https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white" alt="Playwright">
  <img src="https://img.shields.io/badge/Bubble_Tea-FF75B5?style=flat&logo=go&logoColor=white" alt="Bubble Tea">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
  <a href="TRADEMARK.md"><img src="https://img.shields.io/badge/Trademark-Policy-blue.svg" alt="Trademark Policy"></a>
</p>

## Co to jest

Career-Ops ([career-ops.org](https://career-ops.org), znane też jako **careerops**) zamienia dowolne AI-owe CLI do kodowania w pełne centrum dowodzenia poszukiwaniem pracy. Zamiast ręcznie śledzić aplikacje w arkuszu, dostajesz napędzany przez AI pipeline, który:

- **Ocenia oferty** strukturalnym systemem punktacji A-F (10 ważonych wymiarów)
- **Generuje dopasowane PDF-y** -- CV zoptymalizowane pod ATS, dostosowane do każdego ogłoszenia
- **Skanuje portale** automatycznie (Greenhouse, Ashby, Lever, strony firmowe)
- **Przetwarza wsadowo** -- oceniaj 10+ ofert równolegle z sub-agentami
- **Śledzi wszystko** w jednym źródle prawdy z kontrolą integralności

> **Ważne: to NIE jest narzędzie do masowego rozsyłania.** Career-ops to filtr -- pomaga znaleźć te kilka ofert wartych Twojego czasu spośród setek. System stanowczo odradza aplikowanie na cokolwiek z oceną poniżej 4,0/5. Twój czas jest cenny, podobnie jak czas rekrutera. Zawsze przejrzyj zanim wyślesz.

Career-ops jest agentowy: Claude Code nawiguje strony kariery przez Playwright, ocenia dopasowanie, rozumując o Twoim CV względem ogłoszenia (a nie dopasowując słowa kluczowe), i dostosowuje Twoje CV do każdej oferty.

> **Uwaga: pierwsze oceny nie będą świetne.** System jeszcze Cię nie zna. Nakarm go kontekstem -- Twoim CV, historią kariery, proof pointami, preferencjami, tym, w czym jesteś dobry i czego chcesz unikać. Im bardziej go pielęgnujesz, tym lepszy się staje. Pomyśl o tym jak o wdrażaniu nowego rekrutera: pierwszy tydzień musi się o Tobie uczyć, potem staje się nieoceniony.

Zbudowane przez kogoś, kto użył tego, by ocenić 740+ ofert, wygenerować 100+ dopasowanych CV i zdobyć rolę Head of Applied AI. [Przeczytaj pełne studium przypadku](https://santifer.io/career-ops-system).

## Funkcje

| Funkcja                  | Opis                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Auto-Pipeline**        | Wklej URL, dostań pełną ocenę + PDF + wpis w trackerze                                                                                    |
| **Ocena 6-blokowa**      | Podsumowanie roli, dopasowanie CV, strategia poziomu, research wynagrodzeń, personalizacja, przygotowanie do rozmowy (STAR+R)             |
| **Bank historii (interview)** | Akumuluje historie STAR+Refleksja w trakcie ocen -- 5-10 historii-wzorców, które odpowiadają na dowolne pytanie behawioralne          |
| **Skrypty negocjacyjne** | Ramy negocjacji wynagrodzenia, odpieranie zniżek geograficznych, dźwignia konkurencyjnych ofert                                          |
| **Generowanie PDF pod ATS** | CV ze wstrzykniętymi słowami kluczowymi w designie Space Grotesk + DM Sans                                                            |
| **Skaner portali**       | Firmy wstępnie skonfigurowane + własne zapytania w Ashby, Greenhouse, Lever, Wellfound oraz polskie tablice (justjoin.it, NoFluffJobs, pracuj.pl...) |
| **Przetwarzanie wsadowe**| Równoległa ocena z workerami `claude -p`                                                                                                  |
| **Dashboard TUI**        | Terminalowy interfejs do przeglądania, filtrowania i sortowania pipeline'u                                                                |
| **Człowiek w pętli**     | AI ocenia i rekomenduje, Ty decydujesz i działasz. System nigdy nie wysyła aplikacji -- ostateczna decyzja zawsze należy do Ciebie        |
| **Integralność pipeline'u** | Automatyczne scalanie, deduplikacja, normalizacja statusów, health-checki                                                             |

## Szybki start

```bash
# 1. Sklonuj i zainstaluj
git clone https://github.com/vinciipl/career-ops-pl.git
cd career-ops-pl && npm install
npx playwright install chromium   # Wymagane do generowania PDF

# 2. Sprawdź konfigurację
npm run doctor                     # Waliduje wszystkie wymagania wstępne

# 3. Skonfiguruj
cp config/profile.example.yml config/profile.yml  # Edytuj swoimi danymi
cp templates/portals.example.yml portals.yml       # Dostosuj firmy (lub użyj dołączonego portals.yml)

# 4. Dodaj swoje CV
# Utwórz cv.md w katalogu głównym projektu z CV w markdown

# 5. Spersonalizuj z Claude
claude   # Otwórz Claude Code w tym katalogu

# Następnie poproś Claude, by dostosował system do Ciebie:
# "Zmień archetypy na role backendowe"
# "Dodaj te 5 firm do portals.yml"
# "Zaktualizuj mój profil tym CV, które wklejam"

# 6. Zacznij korzystać
# Wklej URL oferty lub uruchom /career-ops
```

> **System jest zaprojektowany tak, by dostosowywał go sam Claude.** Tryby, archetypy, wagi punktacji, skrypty negocjacyjne -- po prostu poproś Claude, by je zmienił. Czyta te same pliki, których używa, więc wie dokładnie, co edytować.

Pełny przewodnik konfiguracji znajdziesz w [docs/SETUP.md](docs/SETUP.md).

## Użycie

Career-ops to pojedyncza komenda slash z wieloma trybami:

```
/career-ops                → Pokaż wszystkie dostępne komendy
/career-ops {wklej JD}     → Pełny auto-pipeline (ocena + PDF + tracker)
/career-ops scan           → Skanuj portale w poszukiwaniu nowych ofert
/career-ops pdf            → Generuj CV zoptymalizowane pod ATS
/career-ops batch          → Oceń wsadowo wiele ofert
/career-ops tracker        → Zobacz status aplikacji
/career-ops apply          → Wypełniaj formularze aplikacyjne z AI
/career-ops pipeline       → Przetwórz oczekujące URL-e
/career-ops contacto       → Wiadomość outreach na LinkedIn
/career-ops deep           → Pogłębiony research firmy
/career-ops training       → Oceń kurs/certyfikat
/career-ops project        → Oceń projekt do portfolio
```

Albo po prostu wklej URL lub opis oferty bezpośrednio -- career-ops wykryje go automatycznie i uruchomi pełny pipeline.

## Jak to działa

```
Wklejasz URL lub opis oferty
        │
        ▼
┌──────────────────┐
│  Wykrywanie      │  Klasyfikuje: LLMOps / Agentic / PM / SA / FDE / Transformacja
│  archetypu       │
└────────┬─────────┘
         │
┌────────▼─────────┐
│  Ocena A-F       │  Dopasowanie, luki, research wynagrodzeń, historie STAR
│  (czyta cv.md)   │
└────────┬─────────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
 Raport  PDF  Tracker
  .md   .pdf   .tsv
```

## Wstępnie skonfigurowane portale

Skaner jest gotowy do działania na polskim rynku: zapytania do polskich tablic IT (justjoin.it, NoFluffJobs, theprotocol.it, pracuj.pl, bulldogjob, rocketjobs.pl, solid.jobs) oraz wyselekcjonowane firmy europejskie/globalne rekrutujące zdalnie kandydatów z Polski. Skopiuj `templates/portals.example.yml` do `portals.yml` (lub edytuj dołączony `portals.yml`) i dodaj własne.

**Polskie firmy / biura w PL:** Allegro, DocPlanner (ZnanyLekarz), Brainly
**Laby AI:** Anthropic, Mistral, Cohere, LangChain, Pinecone, DeepL
**Automatyzacja:** n8n, Zapier
**Europejskie:** Celonis, Synthesia, Parloa, Hugging Face, Vercel, Supabase

**Przeszukiwane tablice:** justjoin.it, NoFluffJobs, theprotocol.it, pracuj.pl, bulldogjob, rocketjobs.pl, solid.jobs, Ashby, Greenhouse, Lever, LinkedIn

Domyślnie `node scan.mjs` (czyli `npm run scan`) ufa temu, co zwraca feed każdego ATS. Niektóre firmy zostawiają nieaktualne ogłoszenia w publicznym API nawet po zamknięciu roli, więc te wygasłe wpisy mogą trafić do `pipeline.md`. Dodaj `--verify`, by uruchomić Playwright po przejściu API i odrzucić wygasłe ogłoszenia, zanim trafią do pipeline'u:

```bash
node scan.mjs --verify          # odkrywanie zero-token + sprawdzenie liveness przez Playwright
```

Weryfikacja jest sekwencyjna i działa tylko na nowych ofertach (po deduplikacji), więc koszt pozostaje ograniczony.

## Dashboard TUI

Wbudowany terminalowy dashboard pozwala wizualnie przeglądać pipeline:

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..
```

Funkcje: 6 zakładek filtrów, 4 tryby sortowania, widok grupowany/płaski, leniwie ładowane podglądy, zmiana statusu inline.

## Stack technologiczny

![Claude Code](https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white)
![Go](https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white)
![Bubble Tea](https://img.shields.io/badge/Bubble_Tea-FF75B5?style=flat&logo=go&logoColor=white)

- **Agent**: Claude Code z własnymi skillami i trybami
- **PDF**: Playwright/Puppeteer + szablon HTML (oraz eksport LaTeX/Overleaf)
- **Skaner**: Playwright + API Greenhouse + WebSearch
- **Dashboard**: Go + Bubble Tea + Lipgloss (motyw Catppuccin Mocha)
- **Dane**: tabele Markdown + konfiguracja YAML + pliki wsadowe TSV

## Także open source

- **[cv-santiago](https://github.com/santifer/cv-santiago)** -- strona portfolio (santifer.io) z chatbotem AI, dashboardem LLMOps i studiami przypadków. Jeśli potrzebujesz portfolio do pokazania obok poszukiwania pracy, sforkuj je i uczyń swoim.

## O autorze

Jestem Santiago -- Head of Applied AI, były founder (zbudowałem i sprzedałem biznes, który wciąż działa z moim nazwiskiem). Zbudowałem career-ops, by zarządzać własnym poszukiwaniem pracy. Zadziałało: użyłem go, by zdobyć obecną rolę.

Moje portfolio i inne projekty open source → [santifer.io](https://santifer.io)

> **Uwaga o tej wersji:** to spolszczona wersja career-ops ([vinciipl/career-ops-pl](https://github.com/vinciipl/career-ops-pl)). Tryby, menu i szablony są przetłumaczone na polski, a portale i CV dostosowane do polskiego rynku pracy. Oryginał: [santifer/career-ops](https://github.com/santifer/career-ops).

## Zastrzeżenie

**career-ops to lokalne, open-source'owe narzędzie, NIE usługa hostowana.** Korzystając z tego oprogramowania, przyjmujesz do wiadomości:

1. **Kontrolujesz swoje dane.** Twoje CV, dane kontaktowe i dane osobowe zostają na Twojej maszynie i są wysyłane bezpośrednio do wybranego przez Ciebie dostawcy AI (Anthropic, OpenAI itp.). Nie zbieramy, nie przechowujemy ani nie mamy dostępu do żadnych Twoich danych.
2. **Kontrolujesz AI.** Domyślne prompty instruują AI, by nie wysyłało automatycznie aplikacji, ale modele AI mogą zachowywać się nieprzewidywalnie. Jeśli modyfikujesz prompty lub używasz innych modeli, robisz to na własne ryzyko. **Zawsze sprawdzaj treści wygenerowane przez AI pod kątem poprawności przed wysłaniem.**
3. **Przestrzegasz regulaminów stron trzecich.** Musisz korzystać z tego narzędzia zgodnie z regulaminami portali kariery, z którymi wchodzisz w interakcję (Greenhouse, Lever, Workday, LinkedIn itp.). Nie używaj tego narzędzia do spamowania pracodawców ani przeciążania systemów ATS.
4. **Brak gwarancji.** Oceny to rekomendacje, nie prawda objawiona. Modele AI mogą halucynować umiejętności lub doświadczenie. Autorzy nie ponoszą odpowiedzialności za wyniki zatrudnienia, odrzucone aplikacje, ograniczenia kont ani jakiekolwiek inne konsekwencje.

Pełne szczegóły w [LEGAL_DISCLAIMER.md](LEGAL_DISCLAIMER.md). Oprogramowanie dostarczane na [licencji MIT](LICENSE) „tak jak jest", bez jakiejkolwiek gwarancji.

## Licencja i znak towarowy

Kod jest licencjonowany na [MIT](LICENSE). Nazwa i marka „career-ops" podlegają [Polityce znaku towarowego](TRADEMARK.md), liberalnej dla użytku społecznościowego, zastrzeżonej dla komercyjnego nazewnictwa produktów i rekomendacji.
