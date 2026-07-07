# career-ops — Deutsche Modi (`modes/de/`)

Dieser Ordner enthält die deutschen Übersetzungen der wichtigsten career-ops-Modi für Bewerber:innen, die im DACH-Raum (Deutschland, Österreich, Schweiz) suchen oder mit deutschen Stellenanzeigen arbeiten.

## Wann diese Modi nutzen?

Verwende `modes/de/`, wenn mindestens eine der folgenden Bedingungen zutrifft:

- Du bewirbst dich vor allem auf **deutschsprachige Stellenanzeigen** (StepStone, XING, kununu, Bundesagentur für Arbeit, deutsche Karriereseiten)
- Deine **Lebenslauf-Sprache** ist Deutsch oder du wechselst je nach Stellenanzeige zwischen DE und EN
- Du brauchst Antworten und Anschreiben in **natürlichem Tech-Deutsch**, nicht maschinenübersetzt
- Du musst mit **DACH-spezifischen Vertragselementen** umgehen: 13. Monatsgehalt, Probezeit, Kündigungsfrist, AGG, Tarifvertrag, Festanstellung vs. Freelance, VWL, bAV, Arbeitszeugnisse

Wenn die meisten deiner Stellenanzeigen auf Englisch sind, bleib bei den Standard-Modi unter `modes/`. Die englischen Modi greifen automatisch zu deutschen Anzeigen, sobald Claude sie als deutschsprachig erkennt — aber sie kennen die DACH-Marktbesonderheiten nicht im selben Detail.

## Wie aktivieren?

career-ops hat keinen "Sprach-Schalter" als Code-Flag. Stattdessen gibt es zwei Wege:

### Weg 1 — Pro Session, per Befehl

Sag Claude zu Beginn der Session ausdrücklich:

> "Nutze ab jetzt die deutschen Modi unter `modes/de/`."

oder

> "Bewerten und Bewerbungen auf Deutsch — verwende `modes/de/_shared.md` und `modes/de/angebot.md`."

Claude liest dann die Dateien aus diesem Ordner statt aus `modes/`.

### Weg 2 — Dauerhaft, per Profil

Trage in `config/profile.yml` eine Sprach-Präferenz ein, z. B.:

```yaml
language:
  primary: de
  modes_dir: modes/de
```

Erinnere Claude in deiner ersten Session daran, dieses Feld zu respektieren ("Schau in `profile.yml`, ich habe `language.modes_dir` gesetzt"). Ab dann nimmt Claude automatisch die deutschen Modi.

> Hinweis: Das `language.modes_dir`-Feld ist eine Konvention dieser PR, kein hartcodiertes Schema. Wenn die Maintainer es anders strukturieren wollen, kann das Feld jederzeit umbenannt werden.

## Was ist übersetzt?

Diese erste Iteration deckt die vier Modi mit dem höchsten Hebel ab:

| Datei | Übersetzt aus | Zweck |
|-------|---------------|-------|
| `_shared.md` | `modes/_shared.md` (EN) | Geteilter Kontext, Archetypen, globale Regeln, DACH-Markt-Spezifika |
| `angebot.md` | `modes/oferta.md` (ES) | Vollständige Bewertung einer einzelnen Stellenanzeige (Blöcke A-F) |
| `bewerben.md` | `modes/apply.md` (EN) | Live-Assistent fürs Bewerbungsformular |
| `cover.md` | `modes/cover.md` (EN) | Anschreiben-Generator nach DIN 5008 für den deutschen Arbeitsmarkt 2026 |
| `pdf.md` | `modes/pdf.md` (EN) | ATS-optimierte PDF-Erzeugung nach DIN 5008 und DACH-Markt-Konventionen |
| `pipeline.md` | `modes/pipeline.md` (ES) | URL-Inbox / Second Brain für gesammelte Stellenanzeigen |

Die übrigen Modi (`scan`, `batch`, `tracker`, `auto-pipeline`, `deep`, `contacto`, `ofertas`, `project`, `training`) sind absichtlich nicht in diesem PR dabei. Sie funktionieren weiter über die EN/ES-Originale, weil ihr Inhalt zu großen Teilen aus Tooling, Pfaden und Konfigurationskommandos besteht — diese sollen sprachunabhängig bleiben.

Wenn die Community die deutschen Modi annimmt, werden weitere Modi in einem Folge-PR übersetzt.

## Was bleibt englisch?

Bewusst nicht eingedeutscht, weil Standard-Tech-Vokabular:

- `cv.md`, `pipeline`, `tracker`, `report`, `score`, `archetype`, `proof point`
- Tool-Namen (`Playwright`, `WebSearch`, `WebFetch`, `Read`, `Write`, `Edit`, `Bash`)
- Status-Werte im Tracker (`Evaluated`, `Applied`, `Interview`, `Offer`, `Rejected`)
- Code-Snippets, Pfade, Befehle

Die Modi verwenden deutsches Tech-Deutsch, wie es in echten Engineering-Teams in Berlin, München oder Zürich gesprochen wird: deutscher Fließtext, englische Fachbegriffe da, wo sie üblich sind. Keine erzwungene Eindeutschung von "Pipeline" zu "Förderband", kein "Lebenslauf-Datei" für `cv.md`.

## Vokabular-Spickzettel

Wenn du Modi anpasst oder erweiterst, halte dich an dieses Vokabular — so bleibt der Ton konsistent:

| Englisch | Deutsch (in dieser Codebase) |
|----------|------------------------------|
| Job posting | Stellenanzeige |
| Application | Bewerbung |
| Cover letter | Anschreiben |
| Resume / CV | Lebenslauf |
| Salary | Gehalt / Vergütung |
| Compensation | Vergütung |
| Skills | Kenntnisse / Fähigkeiten |
| Interview | Vorstellungsgespräch |
| Hiring manager | Personalleiter / Hiring Manager |
| Recruiter | Recruiter (etabliertes Lehnwort) |
| AI | KI (Künstliche Intelligenz) |
| Requirements | Anforderungen / Voraussetzungen |
| Career history | Werdegang / Berufserfahrung |
| Notice period | Kündigungsfrist |
| Probation | Probezeit |
| Vacation | Urlaub |
| 13th month salary | 13. Monatsgehalt / Weihnachtsgeld |
| Permanent employment | Festanstellung |
| Freelance | Freelance / freie Mitarbeit |
| Collective agreement | Tarifvertrag |
| Anti-discrimination law | AGG (Allgemeines Gleichbehandlungsgesetz) |
| Works council | Betriebsrat |
| Reference letter | Arbeitszeugnis |
| Pension scheme | Betriebliche Altersvorsorge (bAV) |
| Capital formation benefit | Vermögenswirksame Leistungen (VWL) |

## Beitragen

Wenn du eine Übersetzung verbessern oder einen weiteren Modus eindeutschen willst:

1. Öffne ein Issue mit dem Vorschlag (laut `CONTRIBUTING.md`)
2. Halte dich an das Vokabular oben, um den Ton konsistent zu halten
3. Übersetze sinngemäß und idiomatisch — keine wörtlichen Wort-für-Wort-Übersetzungen
4. Behalte die strukturellen Elemente (Block A-F, Tabellen, Code-Blöcke, Tool-Anweisungen) exakt bei
5. Teste mit einer echten deutschen Stellenanzeige (z. B. von StepStone oder XING), bevor du den PR aufmachst
