# Modus: solliciteren - Live assistent voor sollicitatieformulieren

Interactieve modus voor wanneer de kandidaat een sollicitatieformulier in Chrome invult. Leest wat er op het scherm staat, laadt context uit de vorige vacature-evaluatie en genereert gepersonaliseerde antwoorden voor elke vraag op het formulier.

## Vereisten

- **Ideaal met zichtbare Playwright-browser**: in de zichtbare modus ziet de kandidaat de browser en kan Claude communiceren met de pagina.
- **Zonder Playwright**: de kandidaat deelt een screenshot of plakt de vragen handmatig.

## Werkstroom

```text
1. DETECTEREN     -> Lees het actieve Chrome-tabblad (screenshot/URL/titel)
2. IDENTIFICEREN  -> Haal bedrijf en functie uit de pagina
3. ZOEKEN         -> Zoek een match in de bestaande rapporten in reports/
4. LADEN          -> Lees het volledige rapport en blok G (indien aanwezig)
5. VERGELIJKEN    -> Komt de functie overeen met de evaluatie? Waarschuw bij wijzigingen
6. ANALYSEREN     -> Identificeer ALLE zichtbare vragen in het formulier
7. GENEREREN      -> Genereer voor elke vraag een persoonlijk antwoord
8. PRESENTEREN    -> Toon de antwoorden in een formaat dat direct kan worden gekopieerd
```

## Stap 1 -- Ontdek de vacature

**Met Playwright:** Maak een snapshot van de actieve pagina. Lees titel, URL en zichtbare inhoud.

**Zonder Playwright:** Vraag de kandidaat om:
- Deel een screenshot van het formulier (de Read-tool leest de afbeeldingen)
- Of plak de vragen uit het formulier in de tekst
- Of geef bedrijf + rol aan zodat we op zoek kunnen gaan naar de context

## Stap 2 -- Identificeer en laad de context

1. Haal de bedrijfsnaam en functietitel uit de pagina
2. Zoek `reports/` op bedrijfsnaam (Grep zonder onderscheid tussen hoofdletters en kleine letters)
3. Indien match -> laad het volledige rapport
4. Als Blok G aanwezig is -> laad eerdere conceptantwoorden als basis
5. Indien GEEN match -> waarschuw de kandidaat en stel een snelle auto-pipeline voor

## Stap 3 -- Detecteer rolwijzigingen

Als de rol op het scherm afwijkt van de geëvalueerde rol:
- **Waarschuw de kandidaat**: "De rol is veranderd van [X] in [Y]. Wil je dat ik de antwoorden opnieuw evalueer of aanpas aan de nieuwe titel?"
- **Indien aangepast**: Pas de reacties op de nieuwe rol aan zonder opnieuw te evalueren
- **Indien opnieuw geëvalueerd**: start de volledige A-F-evaluatie, update het rapport, genereer blok G opnieuw
- **Update de tracker**: schrijf de gewijzigde roltitel als TSV-toevoeging in `batch/tracker-additions/` en voer `node merge-tracker.mjs` uit; bewerk `applications.md` niet rechtstreeks

## Stap 4 -- Analyseer de formuliervragen

Identificeer ALLE zichtbare vragen:
- Vrije tekstvelden (sollicitatiebrief, "waarom deze functie", motivatie, etc.)
- Keuzelijsten (hoe kende u het bedrijf, werkvergunning, etc.)
- Ja/Nee (mobiliteit, visum, beschikbaarheid, enz.)
- Salarisvelden (bereik, salarisverwachtingen en of vakantiegeld/vaste extra's zijn inbegrepen)
- Upload velden (CV, pdf-sollicitatiebrief, referenties)

Classificeer elke vraag:
- **Al beantwoord in Blok G** -> herhaal het bestaande antwoord
- **Nieuwe vraag** -> genereer het antwoord uit het rapport + `cv.md`

## Stap 5 -- Genereer de antwoorden

Construeer voor elke vraag het antwoord volgens dit diagram:

1. **Context van het rapport**: Gebruik de proof points uit blok B, de STAR-verhalen uit blok F
2. **Vorig blok G**: Als er een concept bestaat, neem dit dan als basis en verfijn het
3. **“Ik kies jou”-toon**: hetzelfde raamwerk als in de automatische pipeline: zelfverzekerd, niet smekend
4. **Specificiteit**: citeer iets concreets uit het vacature dat zichtbaar is op het scherm
5. **career-ops proof point**: vermeld in 'Aanvullende informatie' als een dergelijk veld bestaat

**Velden die vaak voorkomen in Nederlandse en Belgische formulieren:**
- **Salarisverwachtingen (jaarlijks bruto)** -> Bereik van `profile.yml`, in EUR, met vermelding "bespreekbaar volgens het totaalpakket"
- **Beschikbaarheidsdatum** -> Realistische datum rekening houdend met de contractuele opzegtermijn
- **Werkvergunning / Nationaliteit** -> Eerlijk en beknopt; voor EU-burgers: "Geen verblijfsvergunning nodig (EU-burger)"
- **Talen** -> Niveaus volgens het ERK (A1-C2)
- **Mobiliteit** -> Specificeer het aanvaardbare geografische gebied en de reisfrequentie

**Uitvoerformaat:**

```text
## Antwoorden voor [Bedrijf] -- [Functie]

Basis: Rapport #NNN | Score: X,X/5 | Archetype: [type]

---

### 1. [Exacte vraag uit het formulier]
> [Antwoord dat direct kan worden gekopieerd]

### 2. [Volgende vraag]
> [Antwoord]

...

---

Opmerkingen:
- [Observaties over de functie, wijzigingen, enz.]
- [Personalisatiesuggesties die de kandidaat moet controleren]
```

## Stap 6 -- Na de aanvraag (optioneel)

Als de kandidaat bevestigt dat de sollicitatie is verzonden:
1. Update de status naar "Applied" via de canonieke CLI: `node set-status.mjs <report#> Applied` (bewerk de tabel `applications.md` niet met de hand)
2. Update blok G van het rapport met de definitieve antwoorden
3. Stel de volgende stap voor: `/career-ops contacto` voor LinkedIn-contact met de rekruteringsmanager

## Scrollbeheer

Als het formulier meer vragen bevat dan zichtbaar is:
- Vraag de kandidaat om naar beneden te scrollen en nog een screenshot te delen
- Of plak de overige vragen
- Verwerk door iteraties totdat het hele formulier bedekt is
