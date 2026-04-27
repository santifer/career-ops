# Modus: angebot — Vollständige Bewertung A-F

Wenn der Kandidat eine Stellenanzeige einfügt (Text oder URL), IMMER alle 6 Blöcke liefern.

## Schritt 0 — Archetyp-Erkennung

Die Stellenanzeige einem der 6 Archetypen zuordnen (siehe `_shared.md`). Bei Hybriden die zwei nächstliegenden angeben. Daraus folgt:
- Welche Proof Points in Block B Vorrang haben
- Wie das Summary in Block E umgeschrieben wird
- Welche STAR-Stories in Block F vorbereitet werden

## Schritt 0.5 — Scoring-Loop-Kalibrierung laden

`data/scoring-calibration.yml` lesen. Für jeden Eintrag mit `active: true`, dessen `archetype` zum erkannten Archetyp aus Schritt 0 passt (exakter Match ODER `archetype: "*"` für alle), wird das `adjustment` auf den finalen Score angewendet.

**Anwendung:**
- Wenn `dimension` mit `score_bucket.high|mid|low` beginnt: `adjustment` zum Gesamtscore addieren, falls predicted_score in den jeweiligen Bucket fällt.
- Wenn `dimension` mit `signals.X` beginnt: anpassen, falls die Stelle dieses Signal aufweist (z. B. `signals.company_size_lt_50` falls Teamgröße < 50).
- Wenn `dimension` mit `Block_X_*` beginnt: als qualitative Notiz im entsprechenden Block vermerken — nicht direkt addieren.

**Im Report-Header:**
- Zeile `**Kalibrierungen aktiv:** N` hinzufügen, wobei N die Zahl der angewandten Einträge ist.
- Wenn N > 0: in der nächsten Zeile IDs nennen (`**Angewandte Kalibrierungen:** {id1}, {id2}`).
- Wenn calibration.yml leer ist oder kein Match: `**Kalibrierungen aktiv:** 0` schreiben — nicht weglassen, das signalisiert, dass das System geprüft hat.

**Prinzip:** Die Kalibrierung ist ein Hinweis, keine Formel. Wenn sie qualitativen Befunden eindeutig widerspricht (z. B. offensichtlicher Mismatch), darfst du sie ignorieren und in einem Satz begründen.

## Block A — Rollen-Zusammenfassung

Tabelle mit:
- Erkannter Archetyp
- Domain (Platform / Agentic / LLMOps / ML / Enterprise)
- Funktion (Build / Consult / Manage / Deploy)
- Seniorität
- Remote (Vollremote / Hybrid / Vor Ort)
- Teamgröße (falls erwähnt)
- TL;DR in einem Satz

## Block B — Match mit dem Lebenslauf

`cv.md` lesen. Tabelle erstellen, in der jede Anforderung aus der Stellenanzeige auf exakte Zeilen aus dem Lebenslauf gemappt wird.

**Angepasst an den Archetyp:**
- FDE → Proof Points zu schneller Lieferung und Kundennähe priorisieren
- SA → Systemdesign und Integrationen priorisieren
- PM → Product Discovery und Metriken priorisieren
- LLMOps → Evals, Observability, Pipelines priorisieren
- Agentic → Multi-Agent, HITL, Orchestrierung priorisieren
- Transformation → Change Management, Adoption, Skalierung priorisieren

Abschnitt **Lücken (Gaps)** mit Mitigationsstrategie für jede einzelne. Pro Gap:
1. Ist das ein Hard Blocker oder ein Nice-to-have?
2. Kann der Kandidat angrenzende Erfahrung nachweisen?
3. Gibt es ein Portfolio-Projekt, das diesen Gap abdeckt?
4. Konkreter Mitigationsplan (Satz fürs Anschreiben, schnelles Mini-Projekt, etc.)

## Block C — Level und Strategie

1. **Erkanntes Level** in der Stellenanzeige vs **natürliches Level des Kandidaten für diesen Archetyp**
2. **Plan "Senior verkaufen, ohne zu lügen"**: konkrete Formulierungen, an den Archetyp angepasst, hervorzuhebende Erfolge, wie Founder-Erfahrung als Vorteil positioniert wird
3. **Plan "Wenn ich downgelevelt werde"**: akzeptieren, wenn die Vergütung fair ist; Review nach 6 Monaten verhandeln; klare Beförderungskriterien festlegen

## Block D — Vergütung und Nachfrage

WebSearch nutzen für:
- Aktuelle Gehälter für die Rolle (Glassdoor, Levels.fyi, Kununu, Gehalt.de, StepStone-Reports)
- Vergütungs-Reputation des Unternehmens (Kununu, Glassdoor)
- Nachfrage-Trend für die Rolle im DACH-Markt

Tabelle mit Daten und zitierten Quellen. Wenn keine Daten gefunden werden, das offen sagen — nichts erfinden.

**Deutscher Markt — Pflichtchecks:**
- 13. Monatsgehalt / Weihnachtsgeld erwähnt? In die Brutto-Berechnung einrechnen.
- Variable Anteile (Bonus, Provision, RSUs / VSOP)?
- VWL und bAV erwähnt?
- Tarifvertrag (TVöD, IG Metall) im Spiel? Wenn ja, Verhandlungsspielraum kleiner — dafür mehr Sicherheit.
- Festanstellung oder Freelance? Bei Freelance: Tagessatz, Scheinselbstständigkeits-Risiko.

## Block E — Personalisierungs-Plan

| # | Abschnitt | Aktueller Stand | Vorgeschlagene Änderung | Begründung |
|---|-----------|-----------------|-------------------------|------------|
| 1 | Summary | ... | ... | ... |
| ... | ... | ... | ... | ... |

Top 5 Änderungen am Lebenslauf + Top 5 Änderungen am LinkedIn-Profil, um den Match zu maximieren.

## Block F — Vorstellungsgesprächs-Plan

6-10 STAR+R-Stories, gemappt auf Anforderungen der Stellenanzeige (STAR + **Reflection**):

| # | JD-Anforderung | STAR+R-Story | S | T | A | R | Reflection |
|---|----------------|--------------|---|---|---|---|------------|

Die Spalte **Reflection** erfasst, was gelernt wurde oder was man heute anders machen würde. Das signalisiert Seniorität — Junior-Kandidaten beschreiben, was passiert ist; Senior-Kandidaten ziehen Lehren daraus.

**Story Bank:** Wenn `interview-prep/story-bank.md` existiert, prüfen, ob die Stories schon dort stehen. Falls nicht, neue ergänzen. Mit der Zeit entsteht so eine wiederverwendbare Bank von 5-10 Master-Stories, die sich an jede Frage im Vorstellungsgespräch anpassen lassen.

**Ausgewählt und an den Archetyp angepasst:**
- FDE → Lieferungs-Tempo und Kundennähe betonen
- SA → Architektur-Entscheidungen betonen
- PM → Discovery und Trade-offs betonen
- LLMOps → Metriken, Evals, Production-Hardening betonen
- Agentic → Orchestrierung, Error Handling, HITL betonen
- Transformation → Adoption und organisatorischen Wandel betonen

Außerdem aufnehmen:
- 1 empfohlene Case Study (welches Projekt vorgestellt wird und wie)
- Red-Flag-Fragen und wie man darauf antwortet (z. B. "Warum haben Sie Ihre Firma verkauft?", "Hatten Sie ein Team, das an Sie berichtet hat?", "Warum ein Wechsel nach so kurzer Zeit?")

---

## Nach der Bewertung

**IMMER** nach den Blöcken A-F ausführen:

### 1. Report .md speichern

Die vollständige Bewertung in `reports/{###}-{company-slug}-{YYYY-MM-DD}.md` ablegen.

- `{###}` = nächste fortlaufende Nummer (3-stellig, mit führenden Nullen)
- `{company-slug}` = Firmenname in Kleinbuchstaben, ohne Leerzeichen (Bindestriche verwenden)
- `{YYYY-MM-DD}` = aktuelles Datum

**Report-Format:**

```markdown
# Bewertung: {Firma} — {Rolle}

**Datum:** {YYYY-MM-DD}
**Archetyp:** {erkannt}
**Score:** {X/5}
**URL:** {URL der Stellenanzeige}
**PDF:** {Pfad oder ausstehend}

---

## A) Rollen-Zusammenfassung
(vollständiger Inhalt von Block A)

## B) Match mit dem Lebenslauf
(vollständiger Inhalt von Block B)

## C) Level und Strategie
(vollständiger Inhalt von Block C)

## D) Vergütung und Nachfrage
(vollständiger Inhalt von Block D)

## E) Personalisierungs-Plan
(vollständiger Inhalt von Block E)

## F) Vorstellungsgesprächs-Plan
(vollständiger Inhalt von Block F)

## G) Draft-Antworten für die Bewerbung
(nur bei Score >= 4.5 — Entwürfe für die Antwortfelder im Bewerbungsformular)

---

## Extrahierte Keywords
(Liste mit 15-20 Keywords aus der Stellenanzeige für ATS-Optimierung)
```

### 2. Im Tracker eintragen

**IMMER** in `data/applications.md` eintragen:
- Nächste fortlaufende Nummer
- Aktuelles Datum
- Firma
- Rolle
- Score: Match-Durchschnitt (1-5)
- Status: `Evaluated`
- PDF: ❌ (oder ✅, wenn Auto-Pipeline ein PDF erzeugt hat)
- Report: relativer Link zur Report-Datei (z. B. `[001](reports/001-company-2026-01-01.md)`)

**Tracker-Format:**

```markdown
| # | Datum | Firma | Rolle | Score | Status | PDF | Report |
```
