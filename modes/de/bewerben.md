# Modus: bewerben — Live-Assistent fürs Bewerbungsformular

Interaktiver Modus für den Moment, in dem der Kandidat in Chrome ein Bewerbungsformular ausfüllt. Liest, was auf dem Bildschirm steht, lädt den Kontext der vorherigen Bewertung der Stellenanzeige und erzeugt passgenaue Antworten für jede Frage des Formulars.

> **Browser-Autonomie-Muster**: Decision Loop, Session-Management, Obstacle Dismissal, CAPTCHA/2FA-Erkennung, Submission Gate, Retry, Action Logging — siehe `modes/browser-session.md`

## Voraussetzungen

- **Playwright-first (Standard)**: Playwright MCP-Tools (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_fill_form`, `browser_type`, `browser_wait_for`) für aktive Browser-Interaktion nutzen. Der Agent liest den Seitenzustand, füllt Felder aus und behandelt Hindernisse autonom — stoppt nur an HITL-Gates (Submission, CAPTCHA, 2FA).
- **Ohne Playwright (Fallback)**: Wenn Playwright nicht verfügbar ist, teilt der Kandidat einen Screenshot oder fügt die Fragen manuell ein. Siehe Abschnitt "Ohne Playwright" unten.

## Workflow

```
1. ERKENNEN     → aktiven Chrome-Tab lesen (Screenshot / URL / Titel)
2. IDENTIFIZIEREN → Firma + Rolle aus der Seite extrahieren
3. SUCHEN       → mit bestehenden Reports unter reports/ abgleichen
4. LADEN        → vollständigen Report lesen + Block G (falls vorhanden)
5. VERGLEICHEN  → Stimmt die Rolle auf dem Bildschirm mit der bewerteten überein? Wenn sie sich geändert hat → warnen
6. ANALYSIEREN  → ALLE sichtbaren Fragen des Formulars identifizieren
7. ERZEUGEN     → Für jede Frage eine passgenaue Antwort generieren
8. PRÄSENTIEREN → Antworten formatiert zum Copy-Paste ausgeben
```

## Schritt 1 — Stellenanzeige erkennen

**Mit Playwright:**
1. Wenn das Portal in `portals.yml` den Eintrag `requires_login: true` hat, Session aus `data/sessions/<portal>.json` laden gemäß `modes/browser-session.md` → Session Management.
2. `browser_navigate` zur Bewerbungs-URL.
3. `browser_snapshot`, um den Seitenzustand zu lesen.
4. **Obstacle-Check**: Wenn Cookie-Banner oder Popup-Overlay erkannt wird, gemäß `modes/browser-session.md` → Obstacle Dismissal schließen. Danach erneut snapshot.
5. Das Bewerbungsformular aus dem bereinigten Snapshot identifizieren — Firmennamen, Rollentitel und Formularstruktur extrahieren.

**Ohne Playwright:** Den Kandidaten bitten, eines der folgenden zu tun:
- Einen Screenshot des Formulars teilen (das Read-Tool kann Bilder lesen)
- Die Fragen des Formulars als Text einfügen
- Firma + Rolle nennen, damit wir den Kontext suchen können

## Schritt 2 — Identifizieren und Kontext laden

1. Firmennamen und Rollentitel von der Seite extrahieren
2. In `reports/` per Grep (case-insensitive) nach dem Firmennamen suchen
3. Bei Treffer → vollständigen Report laden
4. Wenn Block G vorhanden ist → die früheren Draft-Antworten als Basis laden
5. Wenn KEIN Treffer → den Kandidaten warnen und eine schnelle Auto-Pipeline anbieten

## Schritt 3 — Änderungen an der Rolle erkennen

Wenn die Rolle auf dem Bildschirm von der bewerteten abweicht:
- **Den Kandidaten warnen**: "Die Rolle hat sich von [X] zu [Y] geändert. Soll ich neu bewerten oder die Antworten an den neuen Titel anpassen?"
- **Wenn anpassen**: Antworten ohne Neu-Bewertung an den neuen Titel angleichen
- **Wenn neu bewerten**: vollständige A-F-Bewertung durchführen, Report aktualisieren, Block G neu erzeugen
- **Tracker aktualisieren**: in `applications.md` den Rollentitel anpassen, falls nötig

## Schritt 4 — Fragen des Formulars analysieren

ALLE sichtbaren Fragen identifizieren mit **Decision Loop** gemäß `modes/browser-session.md`:
1. `browser_snapshot` → alle sichtbaren Formularfelder identifizieren (textboxes, dropdowns, checkboxes, textareas)
2. ARIA-Ref jedes Feldes notieren (z.B. `textbox "Anschreiben" [ref=e12]`) und Label
3. Wenn die Seite scrollbar ist oder mehrere Abschnitte hat: `browser_evaluate` mit `window.scrollTo(0, document.body.scrollHeight)` → erneut snapshot für neu sichtbare Felder
4. Auf "Weiter"/"Continue"-Buttons prüfen, die auf mehrseitige Formulare hindeuten → klicken → erneut snapshot
5. Wiederholen, bis alle Felder gefunden sind (max. 50 Iterationen gemäß `modes/browser-session.md`)
6. Jedes Feld mit Profildaten aus `cv.md` und `config/profile.yml` abgleichen

Zu identifizierende Feldtypen:
- Freitextfelder (Anschreiben, "Warum diese Rolle", Motivation, etc.)
- Dropdowns (Wie haben Sie von uns erfahren, Arbeitserlaubnis, etc.)
- Ja/Nein (Umzug, Visum, Verfügbarkeit, etc.)
- Gehaltsfelder (Spanne, Gehaltsvorstellung — in Brutto-Jahresgehalt für DE)
- Upload-Felder (Lebenslauf, Anschreiben als PDF, Zeugnisse)

Jede Frage klassifizieren:
- **Bereits in Block G beantwortet** → bestehende Antwort übernehmen
- **Neue Frage** → Antwort aus dem Report + `cv.md` generieren

## Schritt 5 — Antworten erzeugen

Für jede Frage die Antwort nach folgendem Schema bauen:

1. **Kontext aus dem Report**: Proof Points aus Block B, STAR-Stories aus Block F nutzen
2. **Vorheriger Block G**: Wenn ein Draft existiert, als Basis nehmen und nachschärfen
3. **Ton "Ich entscheide mich für euch"**: gleiches Framework wie in der Auto-Pipeline — selbstbewusst, nicht bittend
4. **Spezifität**: etwas Konkretes aus der sichtbaren Stellenanzeige zitieren
5. **career-ops Proof Point**: in "Zusätzliche Informationen" einbauen, falls ein solches Feld existiert

**Spezielle deutsche Formularfelder, die häufig auftauchen:**
- **Gehaltsvorstellung (brutto, jährlich)** → Spanne aus `profile.yml`, in EUR, mit Hinweis "verhandelbar je nach Gesamtpaket"
- **Eintrittsdatum / Verfügbarkeit** → Realistisches Datum unter Berücksichtigung der Kündigungsfrist (oft 1-3 Monate)
- **Arbeitserlaubnis / Aufenthaltsstatus** → ehrlich und knapp; bei EU-Bürgern explizit "Keine Arbeitserlaubnis erforderlich (EU-Bürger:in)"
- **Sprachkenntnisse** → Deutsch / Englisch nach GER-Niveau (A1-C2) angeben
- **Anrede** → bei deutschen Formularen oft Pflichtfeld (Herr / Frau / Divers / Keine)

**Output-Format:**

```
## Antworten für [Firma] — [Rolle]

Basis: Report #NNN | Score: X.X/5 | Archetyp: [Typ]

---

### 1. [Exakte Frage aus dem Formular]
> [Antwort, fertig zum Kopieren]

### 2. [Nächste Frage]
> [Antwort]

...

---

Hinweise:
- [Beobachtungen zur Rolle, Änderungen, etc.]
- [Personalisierungs-Vorschläge, die der Kandidat nochmal prüfen sollte]
```

## Schritt 5b — Formularfelder ausfüllen (nur mit Playwright)

Für jedes in Schritt 4 identifizierte Formularfeld mit Playwright-Tools ausfüllen:

1. **Textfelder**: `browser_fill_form` mit `{ref, value}`-Paaren, oder `browser_type` für einzelne Felder
2. **Dropdowns**: `browser_click` zum Öffnen des Dropdowns → Option-Ref finden → `browser_click` zum Auswählen
3. **Checkboxes**: `browser_click` zum Umschalten
4. **Mehrseitige Formulare**: Nach dem Ausfüllen der sichtbaren Felder auf "Weiter"/"Continue" prüfen → `browser_click` → `browser_snapshot` für die Felder der nächsten Seite
5. **Nach jedem Ausfüllen**: Erneut snapshot, um zu prüfen, ob der Wert akzeptiert wurde
6. **Action Logging**: Jede Ausfüll-Aktion gemäß `modes/browser-session.md` → Action Logging protokollieren

**CAPTCHA/2FA während des Ausfüllens**: Wenn während des Ausfüllens ein CAPTCHA oder 2FA erkannt wird, SOFORT STOPPEN gemäß `modes/browser-session.md`. Auf die Lösung durch den Nutzer warten und auf "resume" warten.

**Teilweiser Formularstand**: Wenn der Flow unterbrochen wird, protokolliert das Action Log alle ausgefüllten Felder und Werte für die Wiederaufnahme.

## SUBMISSION GATE (KRITISCH — ZWINGEND)

**Bevor ein Submit/Absenden/Bewerben/Send-Button geklickt wird:**

1. **STOPP.** Den Absenden-Button NICHT klicken.
2. **Zusammenfassung** dem Nutzer präsentieren:
   ```
   ## Absende-Review — [Firma] / [Rolle]

   Ausgefüllte Felder:
   - Name: [Wert]
   - E-Mail: [Wert]
   - Anschreiben: [erste 100 Zeichen]...
   - [Alle weiteren Felder mit Werten]

   Hochgeladene Dateien: [Liste]

   ⚠️ Sorgfältig prüfen. "go" eingeben zum Absenden oder "abort" zum Abbrechen.
   ```
3. **Auf Antwort des Nutzers warten**:
   - Nutzer tippt `"go"` → `browser_click` auf den Absenden-Button
   - Nutzer tippt `"abort"` → NICHT absenden. Fragen, ob der Fortschritt gespeichert werden soll.
4. **Die Absende-Entscheidung** im Action Log protokollieren.

**KEINE AUSNAHMEN.** Dies setzt die CLAUDE.md-Ethikregel um: "NIEMALS ohne Prüfung durch den Nutzer absenden."

## Schritt 6 — Nach dem Absenden (optional)

Wenn der Kandidat bestätigt, dass die Bewerbung raus ist:
1. Status in `applications.md` von "Evaluated" auf "Applied" setzen
2. Block G im Report mit den finalen Antworten aktualisieren
3. Nächsten Schritt vorschlagen: `/career-ops contacto` für LinkedIn-Outreach an den Personalleiter / Hiring Manager

## Scroll-Handling (mit Playwright)

Wenn das Formular mehr Fragen hat als sichtbar:
- `browser_evaluate` mit `window.scrollTo(0, document.body.scrollHeight)` verwenden, um nach unten zu scrollen → erneut snapshot für neue Felder
- Bei SPAs mit lazy-loaded Abschnitten: `browser_wait_for` mit `networkidle` → erneut snapshot
- **Manueller Fallback**: Wenn `browser_evaluate` fehlschlägt, den Kandidaten bitten, manuell zu scrollen und "done" zu tippen, wenn fertig → erneut snapshot

## Ohne Playwright (Fallback-Workflow)

Wenn Playwright nicht verfügbar ist, den manuellen Workflow verwenden:
1. Der Kandidat teilt einen Screenshot des Formulars (Read-Tool kann Bilder lesen)
2. Oder fügt die Fragen des Formulars als Text ein
3. Oder nennt Firma + Rolle, um in `reports/` zu suchen
4. Antworten generieren und zum Copy-Paste ausgeben
5. Beim Absenden: immer die Bestätigung des Kandidaten einholen, bevor er absendet
