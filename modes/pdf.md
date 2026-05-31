# Mode: pdf — ATS-Optimized PDF Generation

## Source files (read both before generating)

| File | Role |
|------|------|
| `cv.md` | **Content** source of truth — experience, metrics, education (never invent) |
| `BW_CV_FORMATTING_SPEC.md` | **Layout** source of truth — fonts, colors, spacing, tables, 1-page rule |
| `templates/cv-template.html` | HTML implementation of the formatting spec |
| `config/profile.yml` | Contact fields, `cv.formatting_spec`, `cv.default_format` |

**No formatting decisions from memory.** If `BW_CV_FORMATTING_SPEC.md` and this file disagree, the spec wins.

## Full pipeline

1. Read `cv.md` and `BW_CV_FORMATTING_SPEC.md`
2. Ask the user for the JD if it is not in context (text, URL, or evaluation report)
3. Extract 15-20 keywords from the JD
4. Detect JD language → CV language (EN default)
5. Paper format: use `config/profile.yml` → `cv.default_format` if set; otherwise US/Canada → `letter`, rest → `a4`. Brian's default is **letter** (per formatting spec).
6. Detect role archetype → adapt framing
7. Rewrite Summary by injecting JD keywords (truth-based only)
8. Reorder experience bullets by JD relevance; keep **bold label + body** bullet pattern
9. Tailor competency columns (PRODUCT & STRATEGY | TECHNICAL & RESEARCH) from JD — do not use tag chips
10. Trim job descriptor lines to **8–10 words** (italic, one clause)
11. Inject keywords naturally into existing achievements (NEVER invent)
12. Generate HTML from `templates/cv-template.html` + personalized content
13. Read `candidate.full_name` from `config/profile.yml` → kebab-case → `{candidate}`
14. Write HTML to `/tmp/cv-{candidate}-{company}.html`
15. Execute: `node generate-pdf.mjs /tmp/cv-{candidate}-{company}.html output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf --format={letter|a4}`
16. Report: PDF path, page count (**target: 1 page** per spec), keyword coverage %

## Layout rules (from BW_CV_FORMATTING_SPEC.md)

- **Font:** Arial only — never Space Grotesk, DM Sans, Calibri, or Times
- **Colors:** `#1a1a1a` labels/titles, `#2b5c8a` section headings & subtitle, `#444444` body, `#1155cc` / `#0563c1` links
- **Header:** name, subtitle, contact — all **center-aligned**
- **Section headings:** bold blue, left-aligned, bottom rule `#2b5c8a`
- **Job header:** `[bold role]` + ` | ` + `[gray company, location]` + `[bold gray date right-aligned]`
- **Job descriptor:** italic gray, 8–10 words max, under job header
- **Bullets:** `<strong>Label:</strong>` + body; body not bold; 8.5pt
- **Core competencies:** 2-column table, no visible borders, fixed column labels
- **Technical background:** label | value table rows from `cv.md`
- **One page only:** if overflow, shorten bullets/descriptor spacing before reducing font sizes

## Section order (Brian master CV)

1. Header (name, subtitle line, contact)
2. Summary
3. Core Competencies (2-column table)
4. Professional Experience (reverse chronological)
5. Education
6. Technical Background

Do **not** add a separate Projects section unless the user explicitly requests it.

## ATS rules

- Single-column layout
- Standard section titles: Summary, Core Competencies, Professional Experience, Education, Technical Background
- No text in images; UTF-8 selectable text
- Keywords in Summary, first bullet per relevant role, competency columns, Technical Background

## Keyword injection (ethical)

Rephrase real experience using JD vocabulary. Never add skills or metrics not in `cv.md` / `article-digest.md`.

## Template placeholders (`templates/cv-template.html`)

| Placeholder | Content |
|-------------|---------|
| `{{LANG}}` | `en` or `es` |
| `{{PAGE_SIZE}}` | `letter` or `A4` |
| `{{NAME}}` | Full name (profile.yml or cv.md header) |
| `{{SUBTITLE}}` | Title line under name |
| `{{CONTACT_ROW}}` | Phone, email, portfolio, LinkedIn, GitHub, location — HTML with `sep` spans |
| `{{SECTION_SUMMARY}}` | `SUMMARY` |
| `{{SUMMARY_TEXT}}` | Tailored summary paragraph |
| `{{SECTION_COMPETENCIES}}` | `CORE COMPETENCIES` |
| `{{COMPETENCY_COL1}}` | PRODUCT & STRATEGY bullet list (middle dot separated) |
| `{{COMPETENCY_COL2}}` | TECHNICAL & RESEARCH bullet list |
| `{{SECTION_EXPERIENCE}}` | `PROFESSIONAL EXPERIENCE` |
| `{{EXPERIENCE}}` | Job blocks (see structure below) |
| `{{SECTION_EDUCATION}}` | `EDUCATION` |
| `{{EDUCATION}}` | Education lines + italic notes |
| `{{SECTION_TECH}}` | `TECHNICAL BACKGROUND` |
| `{{TECH_BACKGROUND}}` | `<tr>` rows for tech table |

### Job block HTML pattern

```html
<div class="job">
  <div class="job-header">
    <div class="job-header-left">
      <span class="job-role">Role Title</span>
      <span class="job-meta">  |  Company, Location</span>
    </div>
    <span class="job-date">2023 – 2025</span>
  </div>
  <div class="job-desc">Eight to ten word italic context line here.</div>
  <ul>
    <li><strong>Label:</strong> Achievement text with metrics from cv.md.</li>
  </ul>
</div>
```

## Canva CV Generation (optional)

If `config/profile.yml` has `cv.canva_resume_design_id` set, offer HTML/PDF vs Canva before generating. If unset, use HTML/PDF only.

(Canva workflow unchanged — see previous version for steps; apply same content rules and BW spec character discipline.)

## Post-generation

Update tracker/report if registered: PDF ❌ → ✅. Warn if page count &gt; 1.
