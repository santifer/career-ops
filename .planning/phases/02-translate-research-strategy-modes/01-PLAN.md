---
wave: 1
depends_on: []
files_modified:
  - modes/tr/interview-prep.md
  - modes/tr/deep.md
  - modes/tr/contacto.md
  - modes/tr/ofertas.md
  - modes/tr/patterns.md
  - modes/tr/followup.md
autonomous: true
---

# Phase 2: Translate Research & Strategy Modes

## Goal
Translate 6 research and strategy AI modes (`interview-prep.md`, `deep.md`, `contacto.md`, `ofertas.md`, `patterns.md`, and `followup.md`) from English to Turkish under `modes/tr/`, maintaining the same structural syntax, variables, and imperative tone.

## Requirements
- **REQ-1.6**: Translate `interview-prep.md` to `modes/tr/interview-prep.md`
- **REQ-1.7**: Translate `patterns.md` to `modes/tr/patterns.md`
- **REQ-1.9**: Translate `deep.md`, `contacto.md`, `ofertas.md`, `followup.md`.

## Must Haves
- **must_have**: Original filenames are preserved (`modes/tr/ofertas.md`, not `teklifler.md`). This intentionally overrides REQ-1.9 per Decision D-01 in `02-CONTEXT.md` to avoid breaking the CLI router without modifying `SKILL.md`.
- **must_have**: Markdown structure (headers, lists, tables) is identical to English source.
- **must_have**: Variable placeholders (e.g., `{company}`) and code block commands remain in English and unmodified.
- **must_have**: Tone is direct imperative (Sen), avoiding polite/plural forms ("-in/-un").
- **must_have**: Translate markdown headers but preserve markdown anchor links format where possible, mapping to the localized slugs if required.
- **must_have**: Do not translate tool/platform names (e.g., `Levels.fyi`, `LeetCode`, `Teamblind`, `Glassdoor`, `LinkedIn`) or WebSearch operators (e.g., `OR`, `site:`).

## Tasks

### Wave 1

#### Task 1.1: Translate `interview-prep.md`
<read_first>
- modes/tr/_shared.md
- modes/tr/is-ilani.md
- modes/interview-prep.md
- .planning/phases/02-translate-research-strategy-modes/02-RESEARCH.md
- modes/tr/scan.md
</read_first>
<action>
Create `modes/tr/interview-prep.md` by translating `modes/interview-prep.md` to Turkish.
Rules to apply:
1. Use direct imperative tone (e.g., "Analiz et", "Oluştur").
2. Do not translate variables (e.g., `{company}`, `{role}`, `[inferred from JD]`, `[inferred]`).
3. Keep standard tech terms in English ("STAR formatı", "CI/CD").
4. Translate standard HR terms as specified in 02-RESEARCH.md:
   - "Recruiter screen" -> "İK / İşe Alım Uzmanı Ön Görüşmesi"
   - "Hiring Manager" -> "İşe Alım Yöneticisi Görüşmesi"
   - "Peer/Tech panel" -> "Teknik Değerlendirme / Ekip Görüşmesi"
   - "Take-home assignment" -> "Ev Ödevi / Vaka Çalışması (Case Study)"
   - "Onsite / Loop" -> "Yerinde Görüşme / Çoklu Görüşme Bloğu"
   - "Base salary" -> "Net / Brüt Maaş"
   - "Equity / Stock Options" -> "Hisse / Çalışan Pay Senedi Opsiyonu"
   - "Signing bonus" -> "İşe Başlama Primi"
   - "Time-to-offer" -> "Teklife Kadar Geçen Süre"
5. Preserve tool/platform names (e.g., `Levels.fyi`, `LeetCode`, `Teamblind`, `Glassdoor`) and WebSearch operators (`OR`, `site:`).
6. Do not rename the output file; it MUST be `modes/tr/interview-prep.md`.
</action>
<acceptance_criteria>
- `ls modes/tr/interview-prep.md` succeeds.
- `grep -q "{company}" modes/tr/interview-prep.md` succeeds (or file contains `{company}`).
- `grep -q "İşe Alım Yöneticisi Görüşmesi" modes/tr/interview-prep.md` succeeds.
- `grep -q "Net / Brüt Maaş" modes/tr/interview-prep.md` succeeds.
</acceptance_criteria>

#### Task 1.2: Translate `deep.md`
<read_first>
- modes/tr/_shared.md
- modes/tr/is-ilani.md
- modes/deep.md
- .planning/phases/02-translate-research-strategy-modes/02-RESEARCH.md
</read_first>
<action>
Create `modes/tr/deep.md` by translating `modes/deep.md` to Turkish.
Rules to apply:
1. Use direct imperative tone.
2. Do not translate variables (e.g., `{company}`).
3. Keep standard tech terms in English ("CI/CD", "Monorepo / Multirepo", "Glassdoor", "LinkedIn").
4. Translate "Remote-first" to "Uzaktan-Öncelikli (Remote-first)" as specified in 02-RESEARCH.md.
5. Preserve tool/platform names (e.g., `Levels.fyi`, `Teamblind`, `Glassdoor`) and WebSearch operators (`OR`, `site:`).
6. Do not rename the output file; it MUST be `modes/tr/deep.md`.
</action>
<acceptance_criteria>
- `ls modes/tr/deep.md` succeeds.
- `grep -iq "CI/CD" modes/tr/deep.md` succeeds.
- `grep -iq "Glassdoor" modes/tr/deep.md` succeeds.
</acceptance_criteria>

#### Task 1.3: Translate `contacto.md`
<read_first>
- modes/tr/_shared.md
- modes/tr/is-ilani.md
- modes/contacto.md
- .planning/phases/02-translate-research-strategy-modes/02-RESEARCH.md
</read_first>
<action>
Create `modes/tr/contacto.md` by translating `modes/contacto.md` to Turkish.
Rules to apply:
1. Use direct imperative tone.
2. Do not translate variables.
3. Translate standard HR terms as specified in 02-RESEARCH.md:
   - "Cold email" -> "Soğuk E-posta / Direkt Mesaj"
4. Preserve tool/platform names (e.g., `LinkedIn`) and WebSearch operators (`OR`, `site:`).
5. Do not rename the output file; it MUST be `modes/tr/contacto.md`.
</action>
<acceptance_criteria>
- `ls modes/tr/contacto.md` succeeds.
- `grep -q "Soğuk E-posta" modes/tr/contacto.md` succeeds.
</acceptance_criteria>

#### Task 1.4: Translate `ofertas.md`
<read_first>
- modes/tr/_shared.md
- modes/tr/is-ilani.md
- modes/ofertas.md
- .planning/phases/02-translate-research-strategy-modes/02-RESEARCH.md
</read_first>
<action>
Create `modes/tr/ofertas.md` by translating `modes/ofertas.md` to Turkish.
Rules to apply:
1. Use direct imperative tone.
2. Do not translate variables.
3. Translate standard HR terms as specified in 02-RESEARCH.md:
   - "Base salary" -> "Net / Brüt Maaş"
   - "Equity / Stock Options" -> "Hisse / Çalışan Pay Senedi Opsiyonu"
   - "Signing bonus" -> "İşe Başlama Primi"
   - "Time-to-offer" -> "Teklife Kadar Geçen Süre"
4. Do not rename the output file; it MUST be `modes/tr/ofertas.md`.
</action>
<acceptance_criteria>
- `ls modes/tr/ofertas.md` succeeds.
- `grep -q "Net / Brüt Maaş" modes/tr/ofertas.md` succeeds.
</acceptance_criteria>

#### Task 1.5: Translate `patterns.md`
<read_first>
- modes/tr/_shared.md
- modes/tr/is-ilani.md
- modes/patterns.md
- .planning/phases/02-translate-research-strategy-modes/02-RESEARCH.md
</read_first>
<action>
Create `modes/tr/patterns.md` by translating `modes/patterns.md` to Turkish.
Rules to apply:
1. Use direct imperative tone.
2. Do not translate script commands (`node analyze-patterns.mjs`) or JSON keys (`metadata`, `funnel`, `scoreComparison`, `positive`, `negative`, `self_filtered`, `pending`, `evaluated`, `applied`, `interview`, `offer`).
3. Translate standard HR terms as specified in 02-RESEARCH.md:
   - "Funnel" -> "Dönüşüm Hunisi"
   - "Hard blockers" -> "Kesin Engeller"
   - "Self-filtered" -> "Aday Tarafından Elenen"
4. Do not rename the output file; it MUST be `modes/tr/patterns.md`.
</action>
<acceptance_criteria>
- `ls modes/tr/patterns.md` succeeds.
- `grep -q "node analyze-patterns.mjs" modes/tr/patterns.md` succeeds.
- `grep -q "scoreComparison" modes/tr/patterns.md` succeeds.
- `grep -q "Dönüşüm Hunisi" modes/tr/patterns.md` succeeds.
</acceptance_criteria>

#### Task 1.6: Translate `followup.md`
<read_first>
- modes/tr/_shared.md
- modes/tr/is-ilani.md
- modes/followup.md
- .planning/phases/02-translate-research-strategy-modes/02-RESEARCH.md
</read_first>
<action>
Create `modes/tr/followup.md` by translating `modes/followup.md` to Turkish.
Rules to apply:
1. Use direct imperative tone.
2. Do not translate variables.
3. Translate standard HR terms as specified in 02-RESEARCH.md:
   - "Follow-up" -> "Takip / Durum Kontrolü"
   - "Ghosting" -> "Yanıtsızlık (Ghosting)"
4. Do not rename the output file; it MUST be `modes/tr/followup.md`.
</action>
<acceptance_criteria>
- `ls modes/tr/followup.md` succeeds.
- `grep -q "Takip / Durum Kontrolü" modes/tr/followup.md` succeeds.
- `grep -q "Yanıtsızlık" modes/tr/followup.md` succeeds.
</acceptance_criteria>

## Verification
- Check all 6 files are created in `modes/tr/` using `ls modes/tr/`.
- Verify variables are untouched: `grep -r "{company}" modes/tr/` should return matches.
- Verify `node analyze-patterns.mjs` is untouched: `grep -r "analyze-patterns.mjs" modes/tr/patterns.md` should match.
