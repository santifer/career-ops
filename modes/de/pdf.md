# Modus: pdf — Deutscher Lebenslauf (DIN-5008-konform, ATS-optimiert)

Dieser Modus erweitert `modes/pdf.md` um die spezifischen Anforderungen des deutschen Rekrutierungsmarkts. Er wird automatisch verwendet, wenn `language.modes_dir: modes/de` in `config/profile.yml` gesetzt ist oder die Stellenanzeige deutsch ist.

**Basis-Pipeline:** Lies zuerst `modes/pdf.md` — die Schritte 1-18 gelten weiterhin. Dieses Dokument definiert die deutschen Anpassungen, die in jedem Schritt greifen.

---

## Deutsche Anpassungen pro Pipeline-Schritt

### Schritt 4 — Sprache

Wenn die Stellenanzeige auf Deutsch ist → Lebenslauf auf Deutsch erzeugen. Abschnitte, Kurzprofil und Bullets auf Deutsch, Fachbegriffe (Stack, Pipeline, Deployment, Embedding) NICHT zwanghaft eindeutschen.

### Schritt 5 — Papierformat und Seitenränder

- **Format:** immer `a4` (kein Letter im DACH-Markt)
- **Seitenränder:** `--margins=din5008` an `generate-pdf.mjs` übergeben → linker Rand 2,5 cm, rechter Rand 2,0 cm, oben 1,5 cm, unten 1,5 cm (DIN-5008-Empfehlung für Lesbarkeit bei Heftung)

### Schritt 14 — HTML erzeugen

Beim Befüllen des Templates die folgenden deutschen Konventionen beachten:

#### Abschnitts-Überschriften (Section Headers)

| Platzhalter | Deutscher Wert |
|-------------|---------------|
| `{{LANG}}` | `de` |
| `{{SECTION_SUMMARY}}` | `Kurzprofil` |
| `{{SECTION_COMPETENCIES}}` | `Kernkompetenzen` |
| `{{SECTION_EXPERIENCE}}` | `Berufserfahrung` |
| `{{SECTION_PROJECTS}}` | `Projekte` |
| `{{SECTION_EDUCATION}}` | `Ausbildung` |
| `{{SECTION_CERTIFICATIONS}}` | `Zertifikate & Weiterbildungen` |
| `{{SECTION_SKILLS}}` | `Kenntnisse` |

#### Datumsformat (DIN 5008)

Einheitlich `MM/YYYY – MM/YYYY` (z. B. `04/2021 – 12/2025`). Kein Ausschreiben von Monaten, kein Weglassen der Monatsangabe. Das sichert maschinenlesbare ATS-Erfassung UND menschliche Lücken-Erkennung.

Für die aktuelle Position: `MM/YYYY – heute` (nicht "bis heute", nicht "present").

#### Telefonnummer (DIN 5008)

Format: `+49 176 12345678` — Leerzeichen zwischen Vorwahl und Rufnummer, keine Klammern, keine Schrägstriche. Landesvorwahl ohne führende Null.

#### Bewerbungsfoto (`{{PHOTO}}`)

Im DACH-Raum ist ein professionelles Bewerbungsfoto trotz AGG-Freiwilligkeit ein starker Empfehlungsstandard. Wenn `candidate.photo` in `profile.yml` gesetzt ist:
- Foto als `<img class="cv-photo">` rendern (35 × 45 mm Seitenverhältnis bevorzugt)
- Positionierung: rechts oben, Header-Text fließt links daneben
- Wenn ein Deckblatt verwendet wird → Foto NUR auf dem Deckblatt, NICHT im Lebenslauf

Wenn kein Foto gesetzt: `{{PHOTO}}` entfernen, Layout bleibt identisch.

#### Unterschrift (`{{SIGNATURE}}`)

Am Ende des Lebenslaufs einen Unterschriftsblock erzeugen:

```html
<div class="signature-block">
  <div class="signature-location-date">{{CITY}}, {{DATE_FULL}}</div>
  <div class="signature-line"></div>
  <div class="signature-name">{{NAME}}</div>
</div>
```

- `{{CITY}}` aus `profile.yml → location.city`
- `{{DATE_FULL}}` im Format `DD.MM.YYYY` (deutsches Datumsformat, nicht ISO)
- Wenn `candidate.signature` in `profile.yml` gesetzt ist (Pfad zu einer freigestellten PNG/SVG), als `<img class="signature-image">` über der Namenslinie einbetten
- Die Unterschrift bezeugt formell die Richtigkeit der Angaben — 2/3 der Personalverantwortlichen schließen bei Falschangaben sofort aus

#### Seitennummerierung

Bei mehrseitigen Lebensläufen `--page-numbers` an `generate-pdf.mjs` übergeben. Das erzeugt in der Fußzeile `Seite 1 von 2` etc. — ein Zeichen formaler Präzision im gehobenen HR-Kontext.

Bei einseitigen Lebensläufen: KEINE Seitennummerierung (redundant).

### Schritt 17 — PDF-Kommando (deutsches Beispiel)

```bash
node generate-pdf.mjs output/cv-{candidate}-{company}.html output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf --format=a4 --margins=din5008 --page-numbers --report={NNN}
```

---

## Seitenanzahl nach Karrierestufe

Die optimale Länge korreliert mit Berufserfahrung. Starre 1-Seiten-Regel gilt NUR für Einsteiger.

| Karrierestufe | Empfohlene Seitenzahl | Inhaltlicher Schwerpunkt |
|---------------|-----------------------|--------------------------|
| Studierende / Auszubildende | Max. 1 Seite | Höchster Abschluss, Praktika, IT- und Sprachkenntnisse |
| Berufseinsteiger (< 3 Jahre) | 1 Seite | Akademische Schwerpunkte, Abschlussarbeit, erste Projekte |
| Professionals (3–10 Jahre) | 1–2 Seiten | Fachstationen, messbare Projekterfolge, Fortbildungen |
| Senior Experts / Führungskräfte | 2–3 Seiten | Strategische Meilensteine, Budget-/Personalverantwortung |
| Wissenschaft / Medizin | 3+ Seiten (flexibel) | Publikationsverzeichnisse, Drittmittel, klinische Rotationen |

**Faustformel:** 1 Seite pro 10 Jahre Erfahrung, max. 3 Seiten. Primärer Fokus auf die letzten 10–15 Jahre.

**Ermittlung der Karrierestufe:** Lies `cv.md` und zähle die Jahre Berufserfahrung. Wähle die Seitenzahl entsprechend und teile dem Kandidaten die Empfehlung explizit mit, BEVOR du das PDF erzeugst.

---

## Die 1,5-Seiten-Falle (KRITISCH)

Wenn der Inhalt die erste Seite nur geringfügig überschreitet (~1,2 Seiten), entstehen auf der zweiten Seite störende „weiße Löcher". Das wirkt unvollständig und visuell asymmetrisch.

**Pflicht-Prüfung nach PDF-Erzeugung:**

1. PDF erzeugen
2. Seitenzahl aus der Ausgabe von `generate-pdf.mjs` ablesen
3. Wenn 2 Seiten: prüfen, ob die zweite Seite ausreichend gefüllt ist
   - **Gut gefüllt (≥ 2/3 der Seite):** OK, so lassen
   - **Dünn gefüllt (< 2/3):** Zwei Strategien:
     - **Komprimieren auf 1 Seite:** Seitenränder auf min. 1,5 cm reduzieren, Schriftgröße nicht unter 10pt, ältere Stationen auf Einzeiler kürzen
     - **Auffüllen auf 2 volle Seiten:** Mehr Bullets zu relevanten Stationen hinzufügen, Projekte-Sektion erweitern, Skills-Sektion detaillierter
4. Den Kandidaten über die gewählte Strategie informieren

---

## Kurzprofil (Executive Summary)

Das Kurzprofil ist der erste inhaltliche Block — der schriftliche Elevator Pitch. 3–5 prägnante Sätze direkt unter den persönlichen Daten.

**Muss beantworten:**
1. Aktuelle fachliche Rolle / Positionierung
2. Kernkompetenzen (belegt durch 1–2 messbare Erfolge)
3. Strategisches Karriereziel / warum diese Rolle

**ATS-Funktion:** Bewusste Verwendung von Schlüsselwörtern aus der Stellenanzeige — das Kurzprofil fungiert als Keyword-Katalysator für die maschinelle Vorauswahl.

**Beispiel-Struktur:**
> {Titel} mit {X} Jahren Erfahrung in {Kerndomäne}. {Stärkster messbarer Erfolg}. {Differenzierungsmerkmal / Exit-Narrativ-Brücke}. Suche {Zielrolle}, um {Wertversprechen für das Unternehmen}.

---

## Ergebnisorientierte Darstellung (Achievement Bullets)

Traditionelle deutsche Lebensläufe listen Zuständigkeiten auf. Der moderne Standard ist ergebnisorientiert — aktive Verben + quantifizierbare Resultate.

**Schlecht (Aufgabenliste):**
> Verantwortlich für die Neukundenakquise.

**Gut (Ergebnis mit Messgröße):**
> Steigerung des B2B-Neukundenumsatzes um 18 % in 12 Monaten durch Implementierung eines digitalisierten Lead-Nurturing-Prozesses.

**Formulierungs-Regeln:**
- Aktive Verben am Satzanfang: Entwickelt, Implementiert, Optimiert, Reduziert, Skaliert, Automatisiert
- NICHT: "War verantwortlich für", "Zuständig für", "Betreuung von"
- Zahlen, Prozentsätze, Zeiträume, Teamgrößen, Budgets — wo immer möglich
- Bei deutschen Bullets: natürliches Tech-Deutsch, keine erzwungene Eindeutschung

---

## Strategische Kürzungsmechaniken

### 10-Jahres-Regel

- Stationen der letzten 10 Jahre: vollständig mit Bullets beschreiben
- Stationen 10–15 Jahre zurück: 1–2 Bullets, reduziert auf Kernleistungen
- Stationen > 15 Jahre: einzeilige Nennung (Unternehmen, Zeitraum, Position), keine Bullets
- Veraltete Tätigkeiten ohne Bezug zur Zielposition: komplett eliminieren

### 70-Prozent-Prinzip

- Anforderungen der Stellenanzeige in "Muss" und "Kann" unterteilen
- Der Lebenslauf muss die Muss-Anforderungen zu ≥ 70 % abdecken
- Muss-Treffer in den ersten Bullets jeder relevanten Station hervorheben
- Weniger relevante Weiterbildungen weglassen — Rubrik ggf. in "Zertifikate (Auszug)" umbenennen

### Platz sparen (Header)

Im modernen Lebenslauf NICHT aufnehmen:
- Konfession
- Staatsangehörigkeit (es sei denn, Arbeitserlaubnis ist relevant)
- Familienstand
- Namen und Berufe der Eltern
- Generische Hobbies ("Lesen, Reisen, Schwimmen")

Nur aufnehmen, wenn rollenbezogen:
- Spezifische Freizeitaktivitäten, die Soft Skills belegen (z. B. Mannschaftskapitän → Führung)

---

## Lücken im Werdegang

Unterbrechungen > 2–3 Monate gelten als erklärungsbedürftige "Lücke".

**Regeln:**
- Lücken < 3 Monate: unbedenklich, keine Erklärung nötig
- Lücken ≥ 3 Monate: sachlich und positiv deklarieren:
  - "Berufliche Neuorientierung" (Jobsuche)
  - "Elternzeit" (geschützt, kein negativer Faktor)
  - "Pflege von Angehörigen"
  - "Weiterbildung: {konkretes Zertifikat/Studium}"
- NIEMALS durch ungenaue Jahresangaben (nur "2021–2022" statt "03/2021 – 09/2021") kaschieren — Recruiter erkennen das

---

## ATS-Kompatibilität (deutsche Besonderheiten)

75 % der deutschen Unternehmen nutzen ATS zur Vorselektion. Filter-Prioritäten:
1. Erfahrungsniveau (73 %)
2. Fachliche Hard Skills (64,9 %)
3. Jobtitel (59,2 %)

**Layout-Regeln für ATS:**
- **Einspaltiges Layout** — keine zweispaltigen Tabellen, keine Sidebar
- Keine Grafiken, Textboxen, Icons oder Fortschrittsbalken für Skills
- Keine eingebetteten Informationen in Bildern
- Einfache, flache HTML-Struktur (kein verschachteltes CSS-Grid)
- Standard-Sektionsüberschriften (Kurzprofil, Berufserfahrung, Ausbildung, Kenntnisse)

**Typografie (DIN 5008):**
- Max. 2 Schriftarten (eine für Überschriften, eine für Fließtext)
- Serifenlose Schriften: Arial, Calibri, Roboto, Liberation Sans
- Fließtext: 11–12pt (nie unter 10pt)
- Überschriften: +1–3pt und fett
- Einheitliche Hierarchie durch Schriftgröße, nicht durch Farbe/Rahmen

---

## Anti-KI-Erkennbarkeit (WICHTIG)

81,6 % der HR-Profis haben KI-generierte Bewerbungen erhalten. 54 % bewerten uneditierte KI-Texte negativ.

**KI-Indikatoren, die Recruiter erkennen:**
- Mangelnde Personalisierung (61,1 %)
- Unnatürlich glatter Schreibstil (59,8 %)
- Phrasenhafte Standardformulierungen (57,4 %)

**Gegenmaßnahmen (IMMER anwenden):**
1. Spezifische Zahlen und Projektnamen aus `cv.md` einbauen — keine generischen Formulierungen
2. Variierte Satzlängen und Satzanfänge
3. Fachliche Tiefe zeigen, die nur jemand mit echter Erfahrung kennt
4. Wenn `voice-dna.md` existiert: Tier-1-Regeln (Anti-Slop) anwenden
5. Konkretes JD-Vokabular natürlich einflechten, nicht copy-pasten

98,7 % der HR-Entscheider wünschen authentische, verifizierbare und messbare Erfolge.

---

## PDF-Design-Anpassungen für den deutschen Markt

Das HTML-Template (`cv-template.html`) hat `lang="de"`-spezifische CSS-Regeln:

- **Seitenränder:** Breiter links (2,5 cm / DIN 5008), etwas schmaler rechts (2,0 cm)
- **Schriftgröße Fließtext:** 11px (statt 10.5px) — DIN 5008 empfiehlt 11–12pt
- **Unterschriftsblock:** Ort + Datum, optionale Unterschrift, Name — am Ende des Dokuments
- **Seitennummerierung:** Bei mehrseitigen PDFs via `--page-numbers` in der Fußzeile

Farbschema, Typografie-Stack und Header-Gradient bleiben identisch zum Basis-Template — das sichert visuelle Konsistenz über Sprachvarianten hinweg.

---

## Abschnitts-Reihenfolge (deutscher Standard)

1. Header (Name, Kontaktdaten, optional Foto)
2. Kurzprofil (3–5 Sätze, keyword-optimiert)
3. Kernkompetenzen (6–8 Keyword-Phrasen)
4. Berufserfahrung (umgekehrt chronologisch, letzte 10 Jahre im Detail)
5. Projekte (Top 3–4 relevanteste)
6. Ausbildung
7. Zertifikate & Weiterbildungen (ggf. "(Auszug)")
8. Kenntnisse (Sprachen + technische Skills)
9. Unterschrift (Ort, Datum, Name)

---

## Keyword-Injection (deutsch)

Gleiche Regeln wie im Basis-Modus — NIEMALS erfinden, NUR umformulieren:

- JD sagt "Digitalisierungsprojekte" und CV sagt "Automatisierung" → "Digitalisierungs- und Automatisierungsprojekte"
- JD sagt "Stakeholder-Management" und CV sagt "Zusammenarbeit mit Teams" → "Stakeholder-Management in crossfunktionalen Teams"
- JD sagt "Personalverantwortung" und CV sagt "Team geleitet" → "Personalverantwortung für ein Team von X Mitarbeitenden"

---

## Checkliste vor Abgabe

Vor der finalen Ausgabe an den Kandidaten prüfen:

- [ ] Seitenanzahl passt zur Karrierestufe
- [ ] Keine 1,5-Seiten-Falle (zweite Seite ≥ 2/3 gefüllt ODER alles auf 1 Seite)
- [ ] Kurzprofil enthält ≥ 3 JD-Keywords
- [ ] Bullets sind ergebnisorientiert (Verben + Zahlen), nicht aufgabenbezogen
- [ ] Datumsformat einheitlich MM/YYYY
- [ ] Keine obsoleten persönlichen Daten (Konfession, Familienstand, Eltern)
- [ ] Lücken > 3 Monate sind deklariert
- [ ] Telefonnummer im DIN-5008-Format
- [ ] Unterschriftsblock am Ende (Ort + Datum + Name)
- [ ] ATS-kompatibles Layout (einspaltig, keine Grafiken in Skills)
- [ ] Foto nur wenn `candidate.photo` gesetzt
- [ ] Seitennummerierung bei > 1 Seite
