# Modus: pipeline - URL-inbox (tweede brein)

Processen bieden URL's aan die zijn verzameld in `data/pipeline.md`. De kandidaat voegt URL's toe wanneer hij maar wil en voert vervolgens `/career-ops pipeline` uit om ze allemaal in één keer te verwerken.

## Werkstroom

1. **Lees** `data/pipeline.md` -> zoek de items `- [ ]` in de sectie "In afwachting" / "Pending" / "Pendientes" / "Offen" / "En attente"
2. **Voor elke openstaande URL**:
   a. **Extraheer de vacature** met Playwright (`browser_navigate` + `browser_snapshot`) -> WebFetch -> WebSearch
   b. Als de URL niet toegankelijk is -> markeer als `- [!]` met een opmerking en ga verder; er is dan nog geen rapportnummer gereserveerd
   c. Reserveer het volgende `REPORT_NUM` atomair met `node reserve-report-num.mjs`
   d. Voer de volledige auto-pipeline uit binnen een cleanup-pad: Evaluatie A-F -> Rapport .md -> PDF (indien score >= 3.0) -> tracker-TSV in `batch/tracker-additions/`
   e. Voer in een `finally`-stap altijd `node reserve-report-num.mjs --release <num>` uit, ook als een vervolgstap, evaluatie, PDF-generatie of trackerregistratie mislukt
   f. **Verplaats van "In afwachting" naar "Verwerkt"**: `- [x] #NNN | URL | Bedrijf | Rol | Score/5 | PDF ja/nee`
3. **Als er meer dan 3 URL's wachten**, voer agenten parallel uit (Agent-tool met `run_in_background`) om de snelheid te maximaliseren.
4. **Na alle agents:** wacht tot elke agent klaar is en voer daarna, in deze volgorde, `node merge-tracker.mjs`, `node verify-pipeline.mjs`, `node normalize-statuses.mjs` en `node dedup-tracker.mjs` uit.
5. **Aan het einde** geeft u een samenvattende tabel weer:

```text
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
- **Indeed NL/BE, Nationale Vacaturebank, Intermediair, Jobat, StepStone, VDAB en Werkenvoor.be**: veelgebruikte bronnen voor Nederlandstalige vacatures. Gebruik Playwright voor dynamische pagina's en cookiebanners

## Automatische nummering

1. Voer `node reserve-report-num.mjs` uit om het volgende volgnummer atomair te reserveren (stdout retourneert `{###}`).
2. Schrijf het rapport met dit nummer.
3. Geef de sentinel in een `finally`-stap altijd vrij met `node reserve-report-num.mjs --release {###}`, zowel na succes als na een fout.

## Bronsynchronisatie

Controleer de synchronisatie voordat u een URL verwerkt:

```bash
node cv-sync-check.mjs
```

In geval van desynchronisatie dient u de kandidaat te waarschuwen voordat u verdergaat.
