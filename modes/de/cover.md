# Modus: cover — Anschreiben-Generator (Deutscher Markt, DIN 5008)

Erzeugt ein maßgeschneidertes Anschreiben für den deutschen Arbeitsmarkt 2026. Folgt der DIN 5008 für Geschäftsbriefe UND den ATS-Kompatibilitätsanforderungen moderner Bewerbermanagement-Systeme (Personio, Softgarden, SAP SuccessFactors, Workday, Greenhouse).

Arbeitet in zwei Modi:
- **Slug-Modus:** `/career-ops cover {slug}` — lädt den bestehenden Bewertungs-Report als Ausgangspunkt
- **Paste-Modus:** `/career-ops cover` oder JD direkt eingefügt — startet von vorne

---

## Schritt 0 — JD-Gate (Pflicht)

Vor jeder Aktion prüfen, ob eine Stellenanzeige vorliegt.

Eine gültige Stellenanzeige enthält mindestens: Stellentitel, Firmenname, Aufgabenbeschreibung oder Anforderungsliste.

- **Keine JD vorhanden** → Stopp. Sagen: "Bitte füge die Stellenanzeige ein — ich brauche sie, um das Anschreiben individuell zuzuschneiden."
- **Slug angegeben** → In `reports/` den passenden Report suchen. Den Abschnitt `## Cover Letter Draft` als Ausgangspunkt extrahieren. Dann die Original-JD-URL aus dem Report-Header abrufen.
- **JD vorhanden** → Weiter zu Schritt 1.

Unter keinen Umständen ein generisches oder Platzhalter-Anschreiben erzeugen.

---

## Schritt 1 — Kandidatenprofil laden

`config/profile.yml` lesen für:
- `candidate.name`, `email`, `phone`, `location`, `linkedin`, `github`
- `candidate.credentials` (aus cv.md Ausbildung + Zertifikate ableiten, falls nicht in profile.yml)
- `candidate.signature` (Pfad zur eingescannten Unterschrift, falls vorhanden)
- `cover_letter.notice_period_days` (Standard: weglassen wenn Schlüssel fehlt)
- `cover_letter.primary_domain` (Standard: aus cv.md ableiten wenn fehlt)
- `cover_letter.salary_expectation` (Brutto-Jahresgehalt, falls konfiguriert)
- `cover_letter.language_learning` (Standard: leere Liste wenn fehlt)

`cv.md` lesen für:
- Professional Summary (Quelle für Profilabsatz)
- Alle Achievement-Bullets über alle Stationen (Auswahl-Pool)

`article-digest.md` lesen, falls vorhanden — ergänzende Proof Points und Kennzahlen haben Vorrang vor cv.md bei Überschneidungen.

`modes/_profile.md` lesen, falls vorhanden — Personalisierungsdatei des Kandidaten. Deren Regeln **steuern Stimme und Struktur des Anschreibens und überschreiben die generischen Standards dieses Modus**.

---

## Schritt 2 — Stellenanzeige analysieren

Extrahieren:
- **Stellentitel** (exakter Wortlaut aus der Anzeige)
- **Firmenname**
- **Standort / Stadt**
- **Ansprechpartner** (Name, Titel, Anrede — für Anschriftfeld und persönliche Anrede)
- **Referenz-/Kennziffer** (für die Betreffzeile)
- **Top 3-4 Muss-Kompetenzen** (aus Anforderungsprofil)
- **Missions-/Visions-Sprache** des Unternehmens (einleitende Absätze)
- **Domain** (z. B. FinTech, Healthcare, Logistik) — Abgleich mit `cover_letter.primary_domain`
- **Startdatum-Signale** ("sofort", "zum nächstmöglichen Zeitpunkt", "ab sofort")
- **Sprachanforderung** (z. B. "Deutsch C1 erforderlich")
- **Gehaltsangabe gefordert** (ja/nein — entscheidet, ob Gehaltsvorstellung ins Anschreiben kommt)
- **Branchen-Einordnung** (für sektorspezifische Anpassung, siehe Branchentabelle unten)
- **JD-Ton** (formell / direkt / locker)

### Branchenspezifische Relevanz des Anschreibens

| Sektor | Stellenwert des Anschreibens | Anpassung |
|--------|------------------------------|-----------|
| Kaufmännisch & Administration | Sehr hoch — erste Arbeitsprobe für formale Präzision | Strenge DIN-5008-Einhaltung, detaillierte Prozess-/Budgetverantwortung |
| IT, Tech & Engineering | Gering bis mittel — oft durch Portfolio/GitHub ersetzt | Kurz und technisch, Keyword-Fokus, Projektreferenzen priorisieren |
| Gesundheits- & Sozialwesen | Mittel — schnelle Kontaktaufnahme im Vordergrund | Empathie + Belastbarkeit belegen, staatliche Anerkennungen erwähnen |
| Handwerk & Gewerbliche Berufe | Sehr gering — oft mobile/kurze Kontaktformate | Nur wenn explizit gefordert; extrem kurz halten |
| Kreativwirtschaft & Marketing | Mittel — Motivationsschreiben statt Standardformat | Storytelling, visuelle Originalität, nachweisbare Kampagnenerfolge |

Wenn die Branche IT/Tech ist und die Anzeige KEIN Anschreiben fordert: dem Kandidaten empfehlen, stattdessen ein Kurzprofil im Lebenslauf zu stärken (siehe `modes/de/pdf.md` → Kurzprofil). Wenn ein Anschreiben-Upload möglich ist: trotzdem eines liefern — es differenziert.

---

## Schritt 3 — Unternehmensrecherche (Pflicht)

Drei WebSearch-Anfragen ausführen (aktuelles Jahr einsetzen):
1. `"{Firma}" Produktstrategie OR Roadmap {Jahr}`
2. `"{Firma}" Herausforderungen OR Probleme OR Prioritäten {Jahr}`
3. `"{Firma}" News OR Finanzierung OR Akquisition {Jahr}`

Ergebnisse in 2-3 Sätzen zusammenfassen: Woran arbeitet das Unternehmen, welche Herausforderungen hat es, welche Ziele hat es öffentlich kommuniziert.

Dem Kandidaten präsentieren:

```text
Das habe ich über {Firma} herausgefunden:

{2-3 Sätze Zusammenfassung}

Deckt sich das mit dem, was du weißt? Korrigiere oder ergänze, bevor ich das Anschreiben schreibe.
```

Wenn WebSearch kein brauchbares Signal liefert: "Ich konnte keine aktuellen Informationen über {Firma} finden. Kannst du mir etwas über deren aktuelle Herausforderungen oder Ziele erzählen?"

Auf Bestätigung warten. Diese Synthese fließt direkt in den Nutzen-Absatz ein.

---

## Schritt 4 — Keyword-Extraktion

Die Top 8-10 exakten Phrasen extrahieren, die das Unternehmen in der Anzeige verwendet. In zwei Gruppen aufteilen:

**ATS-kritisch** — exakte Begriffe, die ATS-Systeme scannen:
- Rollentitel, Tool-Namen, Methoden-Namen, Zertifikate

**Menschliche Vertrauenssignale** — Sprache, die zeigt, dass die Anzeige gelesen wurde:
- Aktionsverben des Unternehmens ("verantworten", "gestalten", "vorantreiben")
- Produkt-/Domain-Begriffe so, wie das Unternehmen sie benennt
- Ergebnis-Sprache ("Geschäftswirkung", "Wertschöpfung")
- Team-Framing ("eingebettet in", "in enger Zusammenarbeit mit")

Dem Kandidaten präsentieren und auf Bestätigung warten.

**Anwendungsregeln (werden beim Schreiben durchgesetzt):**
- Deren Vokabular spiegeln, nicht deren Struktur
- Inhalt kommt aus cv.md — nur das Vokabular passt sich an
- Natürlich einbauen oder weglassen — wenn ein Keyword nicht organisch passt, nach der Erzeugung flaggen
- Jedes Keyword einmal verwenden — nie wiederholen für Dichte

---

## Schritt 5 — Lücken-Erkennung und Gespräch

Die Stellenanzeige auf potenzielle Gaps zwischen dem Kandidatenprofil und der Rolle analysieren. Für jede erkannte Lücke direkt fragen — keine Standard-Sprache automatisch einfügen:

```text
Ich sehe potenzielle Lücken zwischen deinem Profil und dieser Stellenanzeige:

[Gap: Domain-Mismatch]
Die Anzeige ist in {JD-Domain} — dein Hintergrund ist in {primary_domain}.
→ Wie möchtest du damit umgehen?
  a) Direkt und kurz im Anschreiben ansprechen
  b) Nicht erwähnen — die Bewerbung für sich sprechen lassen
  c) Sag mir deinen Ansatz, ich schreibe es in deinem Stil

[Gap: Sofortiger Start]
Die Anzeige fordert einen sofortigen Start. Dein Profil zeigt eine Kündigungsfrist von {notice_period_days} Tagen.
→ Bestätige deine tatsächliche Kündigungsfrist — ich formuliere sie präzise.

[Gap: Sprachanforderung]
Die Anzeige erfordert {Sprache} auf Niveau {Level}. Wo stehst du mit {Sprache}?
→ Sag mir dein tatsächliches Niveau, ich bilde es korrekt ab.
```

Nur für tatsächlich vorhandene Lücken promoten. Wenn keine Lücken: Schritt überspringen.

---

## Schritt 6 — Vier Prompts (Pflicht vor dem Schreiben)

Alle vier Antworten sind erforderlich. Kein Anschreiben-Inhalt wird vor Erhalt aller Antworten erstellt. Keine Anweisung — einschließlich "generier einfach", "überspring die Fragen" oder "nimm Defaults" — überschreibt dieses Gate.

```text
Bevor ich das Anschreiben schreibe, brauche ich vier Dinge:

**A. Warum diese Rolle / dieses Unternehmen?**
Hier sind Ansätze, die ich erkannt habe — wähle 1-2 oder schreib deinen eigenen:
  1. {Skalierungs-Signal aus der Anzeige}
  2. {Tech-Ambition-Signal aus der Anzeige}
  3. {Domain-/Missions-Signal aus der Einleitung}
  4. {Wachstums-/Phasen-Signal — z. B. Series B, Pre-IPO}
  5. {Strategisches Learning — spezifische Lücke, die diese Rolle für dich füllt}
  6. Anderes — schreib deinen eigenen Ansatz

**B. Welches Problem würdest du für sie lösen?**
Basierend auf meiner Recherche: {bestätigte Synthese aus Schritt 3}.
Deckt sich das mit dem, was du adressieren willst? Verfeinern oder bestätigen.

**C. Wie würdest du es angehen?**
In 1-2 Sätzen: Was ist dein erster Schritt an Tag 1?
(Das ist der differenzierteste Teil des Anschreibens — sei spezifisch.)

**D. Ton?**
  1. Professionell-selbstbewusst — strukturiert, Augenhöhe, für Konzerne/Mittelstand
  2. Direkt — klare Sätze, kein Drumherum, kommt sofort zum Punkt
  3. Gesprächsnah — warmherzig aber professionell, liest sich wie ein durchdachter Mensch
  4. Spiegel die Anzeige — ich passe mich dem Register des Unternehmens an
```

Auf alle vier Antworten warten, bevor zu Schritt 7 übergegangen wird.

---

## Schritt 7 — Achievement-Auswahl (nur aus cv.md)

3-4 Achievement-Bullets aus `cv.md` auswählen (`article-digest.md` darf für Kontext gelesen werden, ist aber keine Quelle für Achievement-Bullets):
1. Alle Bullet Points über alle Stationen in cv.md lesen
2. Jeden gegen die Top 3-4 Muss-Kompetenzen der Anzeige bewerten
3. Die 3-4 mit dem höchsten Score auswählen, mindestens eine Kennzahl pro Bullet
4. Exakten Wortlaut und Kennzahlen aus cv.md verwenden — nie paraphrasieren oder erfinden
5. Keyword-Spiegelung aus Schritt 4 auf das Vokabular um die Bullets anwenden (nicht auf die Kennzahlen)

**Formulierungsformat:** Evidenzbasiertes Storytelling — aktive Verben, konkrete Zahlen, kein Passiv.

**Schlecht:** "Es wurde eine signifikante Verbesserung der Prozesse erreicht."
**Gut:** "Durch Einführung eines agilen Task-Management-Systems die Projektabschlusszeiten um 20 % verkürzt."

---

## Schritt 8 — Anschreiben im Chat entwerfen (Pflicht vor PDF)

Das vollständige Anschreiben als Klartext im Chat schreiben. Die folgende DIN-5008-Struktur (Form B) einhalten:

```text
[Absender-Block — oben rechts oder zentriert]
{Vorname Nachname}
{Straße Hausnummer}
{PLZ Ort}
{Telefon: +49 XXX XXXXXXXX}
{E-Mail: xxx@xxx.de}

[Empfänger-Anschriftfeld — linksbündig, DIN 5008 Form B]
{Firmenname}
{ggf. Abteilung}
{Anrede + akadem. Grad + Name}
{Straße Hausnummer}
{PLZ Ort}

[Datum — rechtsbündig, 2 Leerzeilen unter Anschriftfeld]
{Ort, DD.MM.YYYY}

[Betreffzeile — fett, 2 Leerzeilen unter Datum]
Bewerbung als {exakter Stellentitel} {ggf. — Kennziffer: XXX}

[Anrede — 2 Leerzeilen unter Betreff]
Sehr geehrte/r {Anrede} {akadem. Grad} {Nachname},

[Eröffnungsabsatz — 1 Leerzeile nach Anrede, 5-8 Zeilen]
Direkter, nutzenorientierter Einstieg. Perspektive des Arbeitgebers spiegeln.
Herausforderung des Unternehmens adressieren und sofort aufzeigen, wie der
Bewerber diese lösen kann. Aus Angle A + Unternehmensrecherche (Schritt 3) ableiten.

[Qualifikations-Absatz — 1 Leerzeile Abstand, 5-8 Zeilen]
Berufserfahrung, aktuelle/letzte Position, Domain. Aus cv.md Summary lesen.
Ausgewählte Achievements einweben (Schritt 7). Aktive Verben, quantifizierbare
Resultate. Keywords aus der Anzeige natürlich einflechten.

[Nutzen-Absatz — 1 Leerzeile Abstand, 5-8 Zeilen]
Konkreter Mehrwert für das Unternehmen. Aus bestätigter Recherche (Schritt 3)
+ Angle B + Angle C ableiten. Spezifisch auf die tatsächliche Situation des
Unternehmens eingehen. Nicht generisch.

[Administrativer Schluss — 1 Leerzeile Abstand]
Eintrittstermin (konkret, z. B. "Unter Berücksichtigung meiner vertraglichen
Kündigungsfrist von drei Monaten stehe ich Ihnen ab dem {Datum} zur Verfügung.").
Gehaltsvorstellung NUR wenn die Anzeige explizit danach fragt (Brutto-Jahresgehalt,
präzise krumme Zahl). Einladung zum Gespräch.

[Grußformel — 1 Leerzeile Abstand]
Mit freundlichen Grüßen

[3 Leerzeilen Platz für Unterschrift]

{Vorname Nachname}

[Anlagen — 1+ Leerzeile unter dem Namen, fett]
Anlagen
- Lebenslauf
- Arbeitszeugnisse
- {weitere Dokumente}

[Optionales Postskriptum — unter Anlagen]
PS: {Quantifizierter Teaser, der Neugier weckt und erst im Gespräch aufgelöst wird}
```

Ende des Entwurfs mit: "Wie liest sich das? Sobald du es freigibst, erzeuge ich das PDF."

**Kein PDF erzeugen, bis der Kandidat explizit freigibt.** Freigabe bedeutet "sieht gut aus", "generier es", "ja", spezifische Änderungen. Eine Frage oder Stille ist keine Freigabe.

---

## Sprachregeln (in jedem Satz durchgesetzt)

### Zwingend

1. **Aktive Stimme** — nie "wurde übertragen", "wurde erreicht", "konnte verbessert werden"
2. **Keine Abkürzungen** außer branchenüblichen (z. B., ggf., etc.) — Fachbegriffe beim ersten Auftreten ausschreiben
3. **Keine Gedankenstriche (—)** — durch Komma, Punkt oder Umformulierung ersetzen
4. **Konkret statt abstrakt** — jede Behauptung braucht eine Zahl, einen Systemnamen oder ein konkretes Ergebnis
5. **350-450 Wörter** Gesamtkörper (Absender/Empfänger/Datum nicht gezählt). Maximal eine DIN-A4-Seite
6. **Absätze: 5-8 Zeilen**, getrennt durch je eine Leerzeile
7. **Selbst-Check** — vor der Finalisierung jeden Satz prüfen: Könnte dieser Satz in jedem Anschreiben für jede Firma stehen? Wenn ja, umschreiben
8. **Ton-Konsistenz** — den gewählten Ton (Schritt 6D) durchgängig anwenden

### Verbotene Formulierungen (Ausschlussgrund bei HR-Professionals)

| Verboten | Warum | Alternative |
|----------|-------|-------------|
| "Mit großem Interesse habe ich Ihre Anzeige gelesen" | Floskelhaft, redundant, zeigt keine Auseinandersetzung | Direkter Einstieg über Unternehmens-Herausforderung oder Nutzenversprechen |
| "Hiermit bewerbe ich mich als..." | Wiederholt eine offensichtliche Tatsache | Stellentitel gehört in die Betreffzeile, nicht in den Eröffnungssatz |
| "Ich bin teamfähig, flexibel, belastbar" | Reine Behauptungen ohne Evidenz | Konkretes Beispiel: "In meinem Team von 8 Kollegen koordiniere ich internationale Projekte über 3 Zeitzonen" |
| "Ich bin hochmotiviert / begeistert" | Subjektive Eigenschaftsauflistung | Stattdessen zeigen, nicht behaupten: konkretes Ergebnis, das Motivation belegt |
| "Ich würde mich freuen, von Ihnen zu hören" | Unterwürfig, passiv | "Gerne erläutere ich Ihnen im persönlichen Gespräch, wie..." |
| "Zu Händen" (z. Hd.) im Anschriftfeld | Veraltet | Name direkt: "Frau Dr. Müller" / "Herrn Schmidt" |
| "den" im Datumsstring ("München, den 20.01.2026") | Veraltetes Relikt | "München, 20.01.2026" oder "20. Januar 2026" |
| Passivkonstruktionen ("wurde mir übertragen") | Signalisiert mangelnde Eigeninitiative | Aktiv: "Ich habe eigenverantwortlich die Neukundenakquise gesteuert" |
| "Betreff:" als Wort vor der Betreffzeile | Veraltet nach DIN 5008 | Betreffzeile direkt schreiben, fett formatiert |

### Evidenz-Prinzip

Jede angeführte Stärke MUSS durch eines der folgenden belegt werden:
- Quantifizierbares Ergebnis (Prozentsätze, Beträge, Zeiträume)
- Konkretes Projektbeispiel (Name, Scope, Ergebnis)
- Spezifische Situation (Team, Kontext, Herausforderung)

Unbelegte Behauptungen sind verboten. Wenn kein Beleg in cv.md existiert, die Stärke weglassen.

---

## Schritt 9 — Gehaltsvorstellung (nur wenn gefordert)

Gehalt NUR ins Anschreiben aufnehmen, wenn die Stellenanzeige **explizit** danach fragt.

### Regeln für die Gehaltsdeklaration

1. **Immer als Brutto-Jahresgehalt** — alle regulären Monatsgehälter eingeschlossen
2. **Keine geldwerten Vorteile nennen** — Weihnachtsgeld, VWL, bAV gehören in die Vertragsverhandlung
3. **Präzise krumme Zahl** statt runder Betrag — signalisiert fundierte Marktrecherche
   - Schlecht: "50.000 EUR"
   - Gut: "48.750 EUR" oder "52.300 EUR"
4. **Verhandlungsbereitschaft** ausdrücken durch:
   - Spanne: "zwischen 48.500 und 52.000 EUR"
   - Oder: "Meine Gehaltsvorstellung liegt bei einem Brutto-Jahresgehalt von 54.200 Euro. Gerne erläutere ich Ihnen weitere Details im persönlichen Gespräch."
5. **Markübliche Steigerung** bei Wechsel: 10-20 %, bei signifikant höherer Position mit Personalverantwortung bis 30 %
6. Quelle für den Betrag: `cover_letter.salary_expectation` in profile.yml oder `compensation.target_range`. Wenn beides fehlt, den Kandidaten fragen

### Formulierungsbeispiel

> "Unter Berücksichtigung meiner vertraglichen Kündigungsfrist von drei Monaten stehe ich Ihnen ab dem 1. Oktober 2026 zur Verfügung. Meine Gehaltsvorstellung liegt bei einem Brutto-Jahresgehalt von 67.500 Euro."

---

## Schritt 10 — Eintrittstermin und Kündigungsfrist

### Regeln

1. **Immer konkret** — "nach Absprache" wirkt unentschlossen
2. **Konkretes Datum** oder Verweis auf die vertragliche/gesetzliche Frist
3. Berechnung: aktuelles Datum + Kündigungsfrist (aus profile.yml) + ggf. Rest des laufenden Monats (bei Kündigung zum Monatsende)
4. Falls Kandidat aktuell nicht angestellt: "Ab sofort verfügbar" oder "Zum nächstmöglichen Zeitpunkt"

### Formulierungsbeispiele

- "Unter Berücksichtigung meiner vertraglichen Kündigungsfrist von drei Monaten stehe ich Ihnen ab dem 1. April 2026 zur Verfügung."
- "Nach Ablauf meiner gesetzlichen Kündigungsfrist von vier Wochen zum Monatsende bin ich ab dem 1. September 2026 einsatzbereit."

---

## Schritt 11 — PDF erzeugen

Erst nach expliziter Freigabe durch den Kandidaten.

JSON-Payload zusammenbauen:

```json
{
  "locale": "de",
  "candidate": {
    "name": "{aus profile.yml}",
    "email": "{aus profile.yml}",
    "phone": "{aus profile.yml, DIN 5008 Format}",
    "location": "{aus profile.yml}",
    "street": "{Straße + Hausnr., falls in profile.yml}",
    "zip_city": "{PLZ + Ort, falls in profile.yml}",
    "linkedin": "{aus profile.yml, weglassen wenn leer}",
    "github": "{aus profile.yml, weglassen wenn leer}",
    "credentials": ["{Abschluss}", "{Zertifikat}"],
    "signature": "{Pfad zur Unterschrift-Datei, weglassen wenn leer}"
  },
  "recipient": {
    "company": "{Firmenname}",
    "department": "{Abteilung, optional}",
    "salutation_name": "{z.B. 'Frau Dr. Müller' oder 'Herrn Schmidt'}",
    "street": "{Straße Hausnummer}",
    "zip_city": "{PLZ Ort}"
  },
  "letter": {
    "role_title": "{exakt aus der Anzeige}",
    "reference_number": "{Kennziffer, optional}",
    "company": "{Firmenname}",
    "city": "{Stadt des Kandidaten}",
    "date": "{DD.MM.YYYY}",
    "betreff": "{Fett formatierte Betreffzeile}",
    "anrede": "{Sehr geehrte/r ...}",
    "opening": "{Freigegebener Eröffnungsabsatz}",
    "qualifications": "{Freigegebener Qualifikations-Absatz}",
    "value_proposition": "{Freigegebener Nutzen-Absatz}",
    "administrative_close": "{Eintrittstermin + ggf. Gehalt}",
    "grussformel": "Mit freundlichen Grüßen",
    "printed_name": "{Vorname Nachname}",
    "anlagen": ["Lebenslauf", "Arbeitszeugnisse"],
    "postskriptum": "{Optionaler PS-Teaser oder null}"
  },
  "output_path": "output/{company-slug}-{role-slug}-anschreiben.pdf"
}
```

Payload nach `/tmp/cover-payload-{company-slug}.json` schreiben.

Ausführen:
```bash
node generate-cover-letter.mjs --payload /tmp/cover-payload-{company-slug}.json
```

Ausgabe-Pfad und Dateigröße melden.

---

## Schritt 12 — Nachbereitung

Nach PDF-Bestätigung:

- Alle JD-Keywords aus Schritt 4, die nicht natürlich eingebaut werden konnten (zum manuellen Review flaggen)
- Welche Lücken-Erklärungen aufgenommen / weggelassen wurden und warum
- Ob der Wortzähler das 350-450-Ziel erreicht hat
- Hinweis auf das optionale Postskriptum, falls nicht genutzt: "Ein PS mit einem quantifizierten Teaser kann die Einladungsquote erhöhen. Beispiel: 'PS: Gerne erzähle ich Ihnen im Gespräch, wie ich die Conversion-Rate unserer Kampagnen um 35 % steigern konnte.'"

---

## Slug-Modus — Besonderheiten

Wenn als `/career-ops cover {slug}` aufgerufen:

1. Passenden Report in `reports/` per Slug finden
2. Den Abschnitt `## Cover Letter Draft` extrahieren — als vorausgefüllter Ausgangspunkt
3. Alle Schritte normal durchlaufen (Recherche, Keywords, Prompts, Gaps)
4. Beim Präsentieren in Schritt 8 zeigen, was automatisch generiert und was auf Basis der Antworten geändert wurde
5. Nach PDF-Erzeugung den Report mit Vermerk aktualisieren: `PDF generiert: output/{Pfad} am {Datum}`

---

## E-Mail-Bewerbung als Anschreiben-Äquivalent

Wenn die Bewerbung per E-Mail versendet wird (nicht über ein Portal):

1. **E-Mail-Betreff:** Referenznummer + exakter Stellentitel, z. B. "Bewerbung als Senior Developer (Ref: 2026-0815)"
2. **E-Mail-Text:** Verkürzte Version des Anschreibens (max. 200 Wörter):
   - Motivation in 2-3 Sätzen
   - Kernmehrwert in 1-2 Sätzen
   - Verweis auf angehängte Unterlagen
3. **Anhänge:** Vollständiges Anschreiben als PDF + Lebenslauf + Zeugnisse
4. **Dateinamen ohne Umlaute:** `Nachname_Vorname_Anschreiben.pdf`, `Nachname_Vorname_Lebenslauf.pdf`

---

## DIN 5008 — Technische Formatierungsvorgaben

### Seitenränder (Form B)
- Links: 2,5 cm
- Rechts: 2,0 cm (mind. 1,0 cm)
- Oben: 4,5 cm (inkl. Absenderfeld)
- Unten: 2,0–2,5 cm

### Typografie
- Serifenlose Systemschriften: Arial, Calibri, Helvetica, Verdana
- Fließtext: 11-12 pt
- Betreffzeile: fett, gleiche Schriftgröße wie Fließtext
- Zeilenabstand: 1,15- bis 1,2-fach
- Linksbündiger Flattersatz (kein Blocksatz ohne Silbentrennung)

### Anschriftfeld (Form B)
- Höhe: 4,5 cm, Breite: 8,5 cm
- Max. 9 Zeilen, davon 3 für postalische Vermerke (z. B. "Einschreiben")
- Anrede im Feld: "Herrn" (Akkusativ, nicht "Herr") / "Frau"
- Akademischer Grad vor dem Namen: "Frau Dr. Müller"
- Bachelor/Master hinter dem Namen: "Herrn Schmidt, M.Sc."

### Abstände
- 2 Leerzeilen zwischen Anschriftfeld und Datum
- 2 Leerzeilen zwischen Datum und Betreffzeile
- 2 Leerzeilen zwischen Betreff und Anrede
- 1 Leerzeile zwischen Anrede und erstem Absatz
- 1 Leerzeile zwischen Absätzen
- 1 Leerzeile zwischen letztem Absatz und Grußformel
- 3 Leerzeilen zwischen Grußformel und gedrucktem Namen (Platz für Unterschrift)
- "Mit freundlichen Grüßen" OHNE nachfolgendes Komma
- "Anlagen" fett, OHNE Doppelpunkt

### Dateiformat
- Textbasiertes PDF (kein Scan)
- Dateiname: `Nachname_Vorname_Anschreiben.pdf` (keine Umlaute im Dateinamen)

---

## ATS-Sicherheit und Anti-Manipulations-Check

**NIEMALS** in das PDF einbauen:
- Unsichtbaren Text (weiße Schrift auf weißem Grund)
- Versteckte Metadaten oder Kommentare mit Anweisungen an Screening-KI
- Indirect Prompt Injections jeglicher Art

Diese Praktiken führen bei modernen Systemen zum sofortigen Ausschluss. Das PDF muss transparent, integer und frei von versteckten Strukturen sein.

**IMMER:**
- Textbasiertes PDF erzeugen (keine Scans, keine Bildschichten)
- Einfache, flache HTML-Struktur ohne verschachtelte Layouts
- Keine Grafiken, Icons, Fortschrittsbalken oder Textboxen
- Einfache Aufzählungszeichen (Bindestrich) statt komplexer Symbole
