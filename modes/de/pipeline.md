# Modus: pipeline — URL-Inbox (Second Brain)

Verarbeitet URLs von Stellenanzeigen, die in `data/pipeline.md` gesammelt wurden. Der Kandidat wirft URLs ins Inbox, wann immer er eine entdeckt, und führt später `/career-ops pipeline` aus, um sie alle in einem Rutsch zu verarbeiten.

## Workflow

1. **Lesen** von `data/pipeline.md` → alle Items mit `- [ ]` im Abschnitt "Pendientes" / "Pending" / "Offen" finden
2. **Für jede offene URL**:
   a. Nächste fortlaufende `REPORT_NUM` berechnen (in `reports/` lesen, höchste Nummer + 1)
   b. **Stellenanzeige extrahieren:**
      - **`local:jds/...`:** Datei `jds/...` ab Career-Ops-Wurzel **mit Read** lesen — **kein** Playwright für die Datei selbst.
      - **HTTPS-URL:** Playwright (`browser_navigate` + `browser_snapshot`) → WebFetch → WebSearch
   c. Wenn die URL nicht erreichbar ist → als `- [!]` mit Notiz markieren und weitermachen
   d. **Vollständige Auto-Pipeline ausführen**: A-F-Bewertung → Report .md → PDF (wenn Score >= 3.0) → Tracker
   e. **Von "Offen" nach "Verarbeitet" verschieben**: `- [x] #NNN | URL | Firma | Rolle | Score/5 | PDF ✅/❌`
3. **Bei 3+ offenen URLs** Agenten parallel starten (Agent-Tool mit `run_in_background`), um Tempo zu machen.
4. **Am Ende** eine Zusammenfassungstabelle ausgeben:

```
| # | Firma | Rolle | Score | PDF | Empfohlene Aktion |
```

## Format von pipeline.md

```markdown
## Offen
- [ ] https://jobs.example.com/posting/123
- [ ] https://boards.greenhouse.io/company/jobs/456 | Company GmbH | Senior PM
- [!] https://private.url/job — Fehler: Login erforderlich

## Verarbeitet
- [x] #143 | https://jobs.example.com/posting/789 | Acme GmbH | AI PM | 4.2/5 | PDF ✅
- [x] #144 | https://boards.greenhouse.io/xyz/jobs/012 | BigCo | SA | 2.1/5 | PDF ❌
```

> Hinweis: Die Sektion-Überschriften können auf EN ("Pending"/"Processed"), ES ("Pendientes"/"Procesadas") oder DE ("Offen"/"Verarbeitet") sein. Beim Lesen flexibel sein, beim Schreiben dem Stil der bestehenden Datei treu bleiben.

## Intelligente Erkennung der Stellenanzeige aus der URL

**Reihenfolge:** Steht der Eintrag auf **`local:jds/...`**, nur **Read** auf diesem Pfad verwenden (Abschnitt **Lokale JD-Dateien** unten). Sonst:

1. **Playwright (bevorzugt):** `browser_navigate` + `browser_snapshot`. Funktioniert mit allen SPAs.
2. **WebFetch (Fallback):** Für statische Seiten oder wenn Playwright nicht verfügbar ist.
3. **WebSearch (letzter Ausweg):** In sekundären Portalen suchen, die die Stellenanzeige indexieren.

**Sonderfälle:**
- **LinkedIn**: Kann Login erfordern → mit `[!]` markieren und den Kandidaten bitten, den Text einzufügen
- **PDF**: Wenn die URL auf ein PDF zeigt, direkt mit dem Read-Tool lesen
- **`local:`-Präfix**: Lokale Datei lesen. Beispiel: `local:jds/linkedin-pm-ai.md` → `jds/linkedin-pm-ai.md` ab Career-Ops-Wurzel lesen
- **StepStone / XING / kununu**: Häufig deutscher Markt, oft Cookie-Banner. Playwright kann in Snapshot scrollen, um den Anzeigentext zu erfassen
- **Bundesagentur für Arbeit (arbeitsagentur.de)**: Strukturierte Stellenanzeigen, gut maschinenlesbar. WebFetch reicht meist

### Lokale JD-Dateien (`local:jds/...`) — URL im Report

Gespeicherte JD-Markdown-Dateien haben oft YAML-Frontmatter mit dem echten Bewerbungs-/Stellenlink. **Jeder Report braucht `**URL:**` (siehe `_shared.md`).**

Wenn die Pipeline-Zeile auf eine lokale Datei zeigt:

1. Nach dem Lesen von `jds/{datei}.md` Frontmatter **`application_url`** bevorzugen — vollständige HTTPS-URL im Report-Header: **`**URL:** https://...`**
2. Ohne `application_url`: **`url`**, **`source_url`** oder **`job_url`** im Frontmatter versuchen.
3. Nur wenn kein Link im Frontmatter steht: **`**URL:** (keine URL im JD-Frontmatter — application_url in jds-Datei ergänzen)**` und Nutzer bitten, `application_url:` nachzutragen.
4. **`**URL:** (local JD)`** nicht verwenden, wenn `application_url` (oder gleichwertig) in der Datei steht.

Die verarbeitete Pipeline-Zeile kann weiter `local:jds/...` zeigen; der **Report** enthält die menschenlesbare Bewerbungs-/Posting-URL, wenn bekannt.

## Automatische Nummerierung

1. Alle Dateien in `reports/` listen
2. Aus dem Präfix die Nummer extrahieren (z. B. `142-medispend...` → 142)
3. Neue Nummer = höchste gefundene + 1

## Synchronisierung der Quellen

Vor dem Verarbeiten irgendeiner URL die Sync prüfen:

```bash
node cv-sync-check.mjs
```

Bei Abweichungen den Kandidaten warnen, bevor weitergearbeitet wird.
