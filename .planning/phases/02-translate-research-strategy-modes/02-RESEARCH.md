# Phase 2: Translate Research & Strategy Modes

## Context
This phase implements the translation of 6 strategic AI modes (`interview-prep.md`, `deep.md`, `contacto.md`, `ofertas.md`, `patterns.md`, and `followup.md`) into Turkish (`modes/tr/`). This requires mapping English-centric recruitment/HR semantics to their standard Turkish equivalents while strictly preserving the underlying AI instruction architecture (system prompts, JSON schemas, placeholders, and markdown structures).

## Standard Stack
- **Source Files:** The original English modes located at the project root (`modes/*.md`).
- **Target Location:** The `modes/tr/` directory.
- **Context Dependencies:** `modes/tr/_shared.md` and `modes/tr/is-ilani.md` must be read first to ensure consistent terminology alignment.
- **Execution Mechanism:** In-place LLM markdown translation ensuring structural syntax and variables are preserved exactly.
- **Reference Terminology:** Established Turkish HR standards and job portals (Kariyer.net, Glassdoor TR, vb.).

## Architecture Patterns
To ensure the LLM executing these translated modes works seamlessly, the following structure MUST be preserved:
- **Strict Structural Preservation:** Markdown headers (e.g., `## Step 1`), bullet points, and table structures are part of the operational logic. Their depth and ordering must remain exactly the same, even if the header text is translated (`## Adım 1 — Araştırma`).
- **Literal Variable Passthrough:** Tokens enclosed in braces (`{company}`, `{role}`, `{N}`) and tracking tags (`[inferred from JD]`) must NOT be translated.
- **Execution Block Integrity:** Fenced code blocks that execute CLI scripts (like ```bash node analyze-patterns.mjs ```) or define expected markdown schemas (like ```markdown ## Süreç Özeti ```) must remain syntactically identical.
- **Imperative Persona:** The tone must be instructional, direct, and authoritative ("Tablo oluştur", "Analiz et", "Uydurma"). The LLM agent relies on direct commands to execute pipelines.

## Don't Hand-Roll
Do not invent localized terms for standard HR/recruiting concepts. Use these established Turkish equivalents across all 6 domains:
- **Compensation & Offers (`ofertas.md`, `interview-prep.md`)**
  - Base salary -> "Net / Brüt Maaş"
  - Equity / Stock Options -> "Hisse / Çalışan Pay Senedi Opsiyonu"
  - Signing bonus -> "İşe Başlama Primi"
  - Time-to-offer -> "Teklife Kadar Geçen Süre"
- **Interview Stages (`interview-prep.md`)**
  - Recruiter screen -> "İK / İşe Alım Uzmanı Ön Görüşmesi"
  - Hiring Manager -> "İşe Alım Yöneticisi Görüşmesi"
  - Peer/Tech panel -> "Teknik Değerlendirme / Ekip Görüşmesi"
  - Take-home assignment -> "Ev Ödevi / Vaka Çalışması (Case Study)"
  - Onsite / Loop -> "Yerinde Görüşme / Çoklu Görüşme Bloğu"
- **Outreach & Cadence (`contacto.md`, `followup.md`)**
  - Cold email -> "Soğuk E-posta / Direkt Mesaj"
  - Follow-up -> "Takip / Durum Kontrolü"
  - Ghosting -> "Yanıtsızlık (Ghosting)"
- **Analytics (`patterns.md`)**
  - Funnel -> "Dönüşüm Hunisi"
  - Hard blockers -> "Kesin Engeller"
  - Self-filtered -> "Aday Tarafından Elenen"
- **Company Research (`deep.md`)**
  - CI/CD -> "CI/CD"
  - Monorepo/Multirepo -> "Monorepo / Multirepo"
  - Remote-first -> "Uzaktan-Öncelikli (Remote-first)"

## Common Pitfalls
- **Translating JSON Keys & System Filenames:** Accidentally translating `.mjs` file names (e.g., `node analyze-patterns.mjs` -> `node desen-analizi.mjs`) or JSON object keys parsed from script outputs (`metadata`, `funnel`, `scoreComparison`). Doing so will break the integration pipeline.
- **Translating Tool/Platform Names:** Localizing targets like `Glassdoor`, `LinkedIn`, `Levels.fyi`, `LeetCode`, or `Teamblind`. These are literal search targets and must remain in English.
- **Translating WebSearch Operators:** Translating search operators inside queries (e.g., `OR`, `site:`). The exact query syntax must be retained, though augmenting with local sites (like `site:kariyer.net`) is acceptable if adapting the query.
- **Soft/Polite Directives:** Softening commands (e.g., "Lütfen bir tablo oluşturun" instead of "Tablo oluştur"). Agents perform substantially worse with polite requests.
- **Breaking Table Alignments:** Dropping or misaligning Markdown table pipes (`|---|---|`) during the translation process.

## Code Examples

### 1. Preserving Variables, Tags, and Syntax (`interview-prep.md`)
```markdown
**Etiket kuralları** (bunları karıştırma):

- `[inferred from JD]` — aday raporundan ziyade iş tanımından çıkarılan sorular.
- `[inferred]` — `Conducted by` bilinmediğinde süre / pozisyona göre yapılan kitle sınıflandırmaları (Adım 2.5).

## Adım 2 — Süreç Özeti

\`\`\`markdown
## Süreç Özeti
- **Aşamalar:** {N} aşama, uçtan uca ~{X} gün
- **Format:** {örn. İK ön görüşmesi → teknik telefon → vaka çalışması → ofiste (4 görüşme) → işe alım yöneticisi}
- **Zorluk:** {X}/5 (Glassdoor ortalaması, N değerlendirme)
\`\`\`
```

### 2. Preserving CLI execution and JSON Key parsing (`patterns.md`)
```markdown
## Adım 1 — Analiz Komut Dosyasını Çalıştır

Şunu çalıştır:

\`\`\`bash
node analyze-patterns.mjs
\`\`\`

JSON çıktısını ayrıştır. Şunları içerir:

| Anahtar | İçerik |
|-----|----------|
| `metadata` | Toplam kayıt, tarih aralığı, analiz tarihi, sonuca göre sayılar |
| `funnel` | Durum aşamasına göre sayı (evaluated, applied, interview, offer, vb.) |
| `scoreComparison` | Sonuç grubuna göre ortalama/min/maks puan (positive, negative, self_filtered, pending) |
```
