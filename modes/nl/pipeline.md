# Modus: pipeline - URL-inbox (tweede brein)

Processen bieden URL's aan die zijn verzameld in `data/pipeline.md`. De kandidaat voegt URL's toe wanneer hij maar wil en voert vervolgens `/career-ops pipeline` uit om ze allemaal in één keer te verwerken.

## Werkstroom

1. **Lees** `data/pipeline.md` -> zoek de items `- [ ]` in de sectie "In afwachting" / "Pending" / "Pendientes"
2. **Voor elke openstaande URL**:
heeft. Reserveer de volgende opeenvolgende `REPORT_NUM` atomair door `node reserve-report-num.mjs` uit te voeren (en geef de sentinel vrij door `node reserve-report-num.mjs uit te voeren --release <num>` zodra het rapport is geschreven)
B. **Extraheer de vacature** met Playwright (`browser_navigate` + `browser_snapshot`) -> WebFetch -> WebSearch
C. Als de URL niet toegankelijk is -> benadruk als `- [!]` met een opmerking en ga verder
D. **Voer de volledige auto-pipeline uit**: Evaluatie A-F -> Rapport .md -> PDF (indien score >= 3.0) -> Tracker
e. **Verplaats van "In afwachting" naar "Verwerkt"**: `- [x] #NNN | URL | Zakelijk | Rol | Score/5 | Pdf ja/nee
3. **Als er meer dan 3 URL's wachten**, voer agenten parallel uit (Agent-tool met `run_in_background`) om de snelheid te maximaliseren.
4. **Aan het einde** geeft u een samenvattende tabel weer:

```
| # | Bedrijf | Functie | Score | PDF | Aanbevolen actie |
```

## Pipeline.md-indeling

```markdown
## In afwachting
- [ ] https://jobs.example.com/posting/123
- [ ] https://boards.greenhouse.io/company/jobs/456 | Company SAS | Senior PM
- [!] https://private.url/job -- Fout: inloggen vereist

## Verwerkt
- [x] #143 | https://jobs.example.com/posting/789 | Acme SAS | AI PM | 4,2/5 | PDF ja
- [x] #144 | https://boards.greenhouse.io/xyz/jobs/012 | BigCo | SA | 2,1/5 | PDF nee
```

> Opmerking: Sectiekoppen kunnen in EN ("Pending"/"Processed"), ES ("Pendientes"/"Procesadas"), DE ("Offen"/"Verarbeitet"), FR ("En attente"/"Traitees") of NL ("In afwachting"/"Verwerkt") zijn. Lees flexibel en blijf bij het schrijven trouw aan de bestaande stijl.

## Intelligente vacaturesdetectie via URL

1. **Playwright (bij voorkeur):** `browser_navigate` + `browser_snapshot`. Werkt met alle SPA's.
- **Optie — CLI-extractor (`scan.extractor: cli` in `config/profile.yml`):** voer in plaats daarvan `node browser-extract.mjs <url>` (`--mode jd`) uit — `{ "url", "title", "text" }` compact, minder tokens (afhankelijk van de site). **Stille terugval** naar `browser_navigate` + `browser_snapshot` in geval van een fout of afwezigheid.
2. **WebFetch (fallback):** Voor statische pagina's of wanneer Playwright niet beschikbaar is.
3. **WebSearch (laatste redmiddel):** Zoeken op secundaire portals die het vacature indexeren.

**Speciale gevallen:**
- **LinkedIn**: Mogelijk is een login vereist -> benadruk `[!]` en vraag de kandidaat om de tekst te plakken
- **PDF**: als de URL naar een PDF verwijst, kunt u deze direct lezen met de Leestool
- **Prefix `local:`**: Lees het lokale bestand. Voorbeeld: `local:jds/linkedin-pm-ai.md` -> lees `jds/linkedin-pm-ai.md`
- **Welcome to the Jungle / Indeed FR / APEC**: veelgebruikte Nederlandstalige portalen. Playwright beheert cookiebanners goed
- **France Travail (ex-Pole emploi)**: Gestructureerde vacatures, duidelijk machinaal leesbaar. WebFetch is meestal voldoende

## Automatische nummering

1. Voer `node reserve-report-num.mjs` uit om het volgende volgnummer atomair te reserveren (stdout retourneert `{###}`).
2. Schrijf het rapport met dit nummer.
3. Geef de sentinel vrij door `node reserve-report-num.mjs --release {###}` uit te voeren zodra het rapport is geschreven.

## Bronsynchronisatie

Controleer de synchronisatie voordat u een URL verwerkt:

```bash
node cv-sync-check.mjs
```

In geval van desynchronisatie dient u de kandidaat te waarschuwen voordat u verdergaat.
