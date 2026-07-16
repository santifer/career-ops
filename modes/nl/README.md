# career-ops -- Nederlandstalige modi (`modes/nl/`)

Dit bestand bevat Nederlandse vertalingen van de belangrijkste carrièremodi voor kandidaten die zich richten op de Nederlandstalige arbeidsmarkt (Nederland en Vlaanderen).

## Wanneer gebruik je deze modi?

Gebruik `modes/nl/` als aan minstens één van deze voorwaarden is voldaan:

- Je solliciteert voornamelijk op **jobvacatures in het Nederlands** (Welcome to the Jungle, Indeed FR, APEC, Pole emploi / France Travail, LinkedIn FR, carrièresites)
- Je **CV is in het Nederlands** of je wisselt af tussen FR en EN, afhankelijk van het vacature
- U heeft antwoorden en sollicitatiebrieven nodig in **natuurlijk technisch Nederlands**, niet vertaald door een machine
- Je beheert **Nederlandstalige contractuele bijzonderheden**: cao, RTT, onderlinge verzekering, vooruitziende blik, 13e maand, proefperiode, opzegtermijn, maaltijdcheques, rente/deelname, salarisoverdracht

Als de meeste van uw vacatures in het Engels zijn, houd u dan aan de standaardmodi in `modes/`. De Engelse modi werken voor Nederlandstalige vacatures, maar kennen de specifieke kenmerken van de Nederlandstalige markt niet in detail.

## Hoe activeren?

### Optie 1 -- Per sessie

Vertel Claude aan het begin van de sessie:

> "Gebruik Nederlandse modi onder `modes/nl/`."

Claude zal dan bestanden uit deze map lezen in plaats van `modes/`.

### Optie 2 -- Permanent

Voeg in `config/profile.yml` toe:

```yaml
language:
  primary: nl
  modes_dir: modes/nl
```

Herinner Claude hieraan tijdens je eerste sessie ("Kijk in `profile.yml`, ik heb `taal.modes_dir` geconfigureerd"). Claude gebruikt automatisch de Nederlandse modi.

## Welke modi zijn vertaald?

Deze eerste iteratie omvat de vier modi met de hoogste impact:

| Bestand | Vertaald uit | Rol |
|--------|----------------|------|
| `_shared.md` | `modes/_shared.md` (EN) | Gedeelde context, archetypen, algemene regels, Nederlandstalige marktspecifieke kenmerken |
| `vacature.md` | `modes/oferta.md` (ES) | Volledige evaluatie van een vacature (blokken A-F) |
| `solliciteren.md` | `modes/apply.md` (EN) | Live assistent bij het invullen van sollicitatieformulieren |
| `pipeline.md` | `modes/pipeline.md` (ES) | URL inbox / Second Brain voor verzamelde vacatures |

De andere modi (`scan`, `batch`, `pdf`, `tracker`, `auto-pipeline`, `deep`, `contacto`, `ofertas`, `project`, `training`) blijven in EN/ES. Hun inhoud bestaat voornamelijk uit tools, paden en commando's - het moet taalonafhankelijk blijven.

## Wat blijft in het Engels

Opzettelijk niet vertaald vanwege standaard technische woordenschat:

- `cv.md`, `pipeline`, `tracker`, `report`, `score`, `archetype`, `bewijspunt`
- Toolnamen (`Playwright`, `WebSearch`, `WebFetch`, `Read`, `Write`, `Edit`, `Bash`)
- Statuswaarden in de tracker (`Geëvalueerd`, `Toegepast`, `Interview`, `Aanbieding`, `Afgewezen`)
- Codefragmenten, paden, opdrachten

De modi maken gebruik van natuurlijk technisch Nederlands, zoals het wordt gesproken in technische teams in Parijs, Lyon of Genève: alledaagse tekst in het Nederlands, technische termen in het Engels waar het wordt gebruikt. Geen geforceerde vertaling van "Pipeline" naar "Pipeline", noch van "Deploy" naar "Application deployment".

## Referentiewoordenlijst

Om een ​​consistente toon te behouden als u de modi wijzigt of uitbreidt:

| Engels | Nederlands (in deze codebase) |
|---------|----------------------------|
| Vacature | Vacature / aankondiging |
| Toepassing | Toepassing |
| Sollicitatiebrief | Sollicitatiebrief |
| CV / CV | CV |
| Salaris | Salaris / Bezoldiging |
| Vergoeding | Verloning / Pakket |
| Vaardigheden | Vaardigheden |
| Interview | Interview |
| Wervingsmanager | Recruitermanager / Hiringsmanager |
| Recruiter | Recruiter (of Recruiter) |
| AI | AI (kunstmatige intelligentie) |
| Vereisten | Vereisten / Vereisten |
| Carrièregeschiedenis | Professionele carrière |
| Opzegtermijn | Let op |
| Proeftijd | Proefperiode |
| Vakantie | Betaald verlof (CP) |
| 13e maand salaris | 13e maand / Eindejaarsbonus |
| Vast dienstverband | CDI (Contract van onbepaalde duur) |
| Contract van bepaalde duur | CDD (Contract voor bepaalde duur) |
| Freelance | Freelance / Zelfstandig / Zelfstandig |
| Collectieve overeenkomst | Collectieve overeenkomst |
| Ondernemingsraad | CSE (Sociaal en Economisch Comité) |
| Winstdeling | Interesse / Deelname |
| Maaltijdcheques | Maaltijdcheques / Lunchcheques |
| Ziektekostenverzekering | Maatschappelijke onderlinge verzekeringen |
| Invaliditeits-/levensverzekering | Vooruitziendheid |
| RTT | RTT (arbeidstijdverkorting) |
| Statusframe | Kaderstatus |
| SYNTEK | SYNTEC-conventie (IT/consulting) |

## Bijdragen

Om een ​​vertaling te verbeteren of een modus toe te voegen:

1. Open een probleem met uw voorstel (zie `CONTRIBUTING.md`)
2. Respecteer de bovenstaande woordenlijst om de toon consistent te houden
3. Vertaal idiomatisch - geen woord-voor-woordvertaling
4. Houdt structurele elementen (blokken A-F, tabellen, codeblokken, gereedschapsinstructies) identiek
5. Test met een echte Nederlandstalige vacature (LinkedIn, Indeed NL, Nationale Vacaturebank) voordat je de PR indient
