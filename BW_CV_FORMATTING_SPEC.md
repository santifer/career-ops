# Brian Washington — CV Formatting Spec
# Extracted via XML analysis of: Brian_Washington_CV_monday_PM.docx
# Source of truth for all future CV generation. Do not deviate from these values.
# All measurements in DXA unless noted. 1440 DXA = 1 inch. Sizes in half-points (hp). 1pt = 2hp.

---

## PAGE SETUP

| Property        | Value  | Human-readable  |
|-----------------|--------|-----------------|
| Page width      | 12240  | 8.5"            |
| Page height     | 15840  | 11" (US Letter) |
| Margin top      | 500    | ~0.35"          |
| Margin bottom   | 450    | ~0.31"          |
| Margin left     | 620    | ~0.43"          |
| Margin right    | 620    | ~0.43"          |
| Content width   | 11000  | page_w - left - right |

---

## COLOR PALETTE

| Token           | Hex       | Used for                                 |
|-----------------|-----------|------------------------------------------|
| COLOR_NAME      | `1a1a1a`  | Name, job titles, bullet bold labels     |
| COLOR_BLUE      | `2b5c8a`  | Subtitle, section headings, comp labels  |
| COLOR_GRAY      | `444444`  | Body text, contact line, job desc italic |
| COLOR_LINK      | `1155cc`  | Email hyperlink                          |
| COLOR_LINK_ALT  | `0563c1`  | Portfolio / LinkedIn / GitHub links      |
| COLOR_RULE      | `2b5c8a`  | Section heading underrule                |

---

## TYPOGRAPHY

All text uses **Arial** exclusively. No other fonts.

| Element                    | Size (hp) | Size (pt) | Bold | Italic | Color         | Alignment |
|----------------------------|-----------|-----------|------|--------|---------------|-----------|
| Name                       | 26        | 13        | ✓    | —      | COLOR_NAME    | CENTER    |
| Subtitle (title line)      | 18        | 9         | —    | —      | COLOR_BLUE    | CENTER    |
| Contact line               | 16        | 8         | —    | —      | COLOR_GRAY    | CENTER    |
| Section heading            | 19        | 9.5       | ✓    | —      | COLOR_BLUE    | LEFT      |
| Competency sub-label       | 16        | 8         | ✓    | —      | COLOR_BLUE    | LEFT      |
| Competency body text       | 16        | 8         | —    | —      | COLOR_GRAY    | LEFT      |
| Job header — role          | 17        | 8.5       | ✓    | —      | COLOR_NAME    | LEFT      |
| Job header — co + loc      | 17        | 8.5       | —    | —      | COLOR_GRAY    | LEFT      |
| Job header — date          | 17        | 8.5       | ✓    | —      | COLOR_GRAY    | RIGHT (via tab stop) |
| Job descriptor (italic)    | 16        | 8         | —    | ✓      | COLOR_GRAY    | LEFT — **8–10 words max** |
| Bullet label (bold part)   | 17        | 8.5       | ✓    | —      | COLOR_NAME    | LEFT      |
| Bullet body text           | 17        | 8.5       | —    | —      | COLOR_NAME    | LEFT      |
| Education degree           | 16        | 8         | ✓    | —      | COLOR_NAME    | LEFT      |
| Education school/date      | 16        | 8         | —    | —      | COLOR_GRAY    | LEFT      |
| Education note (italic)    | 16        | 8         | —    | ✓      | COLOR_GRAY    | LEFT      |
| Tech background label      | 16        | 8         | ✓    | —      | COLOR_NAME    | LEFT      |
| Tech background value      | 16        | 8         | —    | —      | COLOR_GRAY    | LEFT      |
| Hyperlinks                 | 16        | 8         | —    | —      | COLOR_LINK(_ALT) + underline | CENTER (in header) |

---

## PARAGRAPH SPACING (before / after in DXA)

| Element                    | Before | After | Notes                         |
|----------------------------|--------|-------|-------------------------------|
| Name                       | 0      | 30    |                               |
| Subtitle                   | 0      | 40    |                               |
| Contact line               | 0      | 60    |                               |
| Section heading            | 200    | 70    | Has bottom border rule        |
| Summary body               | 30     | 40    |                               |
| Competency cell label      | 0      | 15    | Inside table cell             |
| Competency cell body       | 0      | 0     | Inside table cell             |
| Job header                 | 120    | 18    |                               |
| Job descriptor (italic)    | 0      | 30    |                               |
| Bullet paragraph           | 25     | 0     |                               |
| Education line             | 0      | 0     | (rows flow naturally)         |
| Tech background row        | 0      | 0     | Inside table cell             |

---

## SECTION HEADING RULE (bottom border)

| Property   | Value       |
|------------|-------------|
| Style      | SINGLE      |
| Size       | 4 (0.5pt)   |
| Color      | `2b5c8a`    |
| Space      | 2           |

---

## BULLET LIST

| Property           | Value                                |
|--------------------|--------------------------------------|
| Bullet character   | • (standard bullet via numbering)    |
| Left indent        | 425 DXA (~0.295")                    |
| Hanging indent     | 285 DXA (~0.198")                    |
| Spacing before     | 25 DXA                               |
| Spacing after      | 0                                    |
| Font size          | 17hp (8.5pt)                         |

---

## COMPETENCY TABLE (Core Competencies section)

| Property           | Value                         |
|--------------------|-------------------------------|
| Table width        | 11000 DXA                     |
| Column 1 width     | 5500 DXA                      |
| Column 2 width     | 5500 DXA                      |
| All borders        | nil (no visible borders)      |
| Cell top margin    | 20 DXA                        |
| Cell bottom margin | 20 DXA                        |
| Col 1 right margin | 80 DXA (inner gap)            |
| Col 2 left margin  | 80 DXA (inner gap)            |
| Col 1 left margin  | 0                             |
| Col 2 right margin | 0                             |

---

## TECHNICAL BACKGROUND TABLE

| Property           | Value                         |
|--------------------|-------------------------------|
| Table width        | 11000 DXA (inferred)          |
| All borders        | nil                           |
| Cell top margin    | 15 DXA                        |
| Cell bottom margin | 15 DXA                        |
| Label col right    | 40 DXA                        |
| Value col left     | 40 DXA                        |

---

## JOB HEADER TAB STOP + ALIGNMENT PATTERN

| Property   | Value                      |
|------------|----------------------------|
| Type       | RIGHT                      |
| Position   | 9026 DXA (right-align date)|

**Critical:** The job header line mixes two alignment rules on a single paragraph:
- Role title + company/location = LEFT-aligned (natural flow)
- Date = RIGHT-aligned at 9026 DXA (via right tab stop)

**Exact run structure (3 runs):**
1. `[bold, COLOR_NAME]` — role title text
2. `[not bold, COLOR_GRAY]` — `"  |  Company, Location"` + `\t` (tab triggers right-align at 9026)
3. `[bold, COLOR_GRAY]` — date text only (right-aligned at 9026)

The tab character must be in a separate run from the date text. Date run: bold, COLOR_GRAY, sz=17.

---

## GENERATION RULES (enforce every time)

1. **Font is always Arial.** Never Times New Roman, Calibri, or any other font.
2. **One page only.** If content overflows, reduce bullet `after` spacing before touching font sizes.
3. **Section heading pattern:** Bold + COLOR_BLUE + sz=19 + bottom border rule (sz=4, color=2b5c8a, space=2) + spacing before=150, after=60.
4. **Bullet body is not bold.** sz=17, COLOR_NAME. No label prefixes.
5. **Job header date is bold + COLOR_GRAY** (not italic). Tab-stop at 9026 DXA right-aligns it. Use THREE runs: [bold role] + [gray company + `\t`] + [bold gray date]. Tab and date must be in separate runs.
6. **Job descriptor line is italic + COLOR_GRAY + sz=16**, spacing after=22. **8–10 words maximum — one clause, no second sentence.**
7. **Competency table has no visible borders.** Use nil on all sides.
8. **Table cell margins are asymmetric** — inner edge gets 80 DXA gap, outer edge gets 0. Creates column separation without a divider.
9. **Colors:** Never use pure black `000000` for body text. Use `444444` for gray body, `1a1a1a` for near-black labels, `2b5c8a` for all blue elements.
10. **Page margins:** top=500, bottom=450, left=620, right=620. Content width = 11000 DXA.
11. **Name, subtitle, and contact line are CENTER-ALIGNED.** All three header paragraphs use `AlignmentType.CENTER`. Every other element is left-aligned.

---

## USAGE INSTRUCTIONS FOR FUTURE CV GENERATION

### career-ops (Cursor / Claude Code / agents)

When generating a tailored CV PDF:

1. Read **content** from `cv.md`
2. Read **layout** from this file (`BW_CV_FORMATTING_SPEC.md`)
3. Follow `modes/pdf.md` for JD tailoring (keywords, bullet reorder, truth-based only)
4. Fill `templates/cv-template.html` placeholders — Arial, letter, 1-page target
5. Run: `node generate-pdf.mjs /tmp/cv-{candidate}-{company}.html output/cv-...pdf --format=letter`

No formatting decisions from memory. This spec + `templates/cv-template.html` are the design source of truth.

### Standalone docx pipeline (optional)

When Brian provides a new JD outside career-ops:

1. Run the standard JD audit (systemic challenges → experience map → gaps → counter-positioning)
2. Draft content edits against the Master CV
3. Generate `.docx` using these constants — copy the values above verbatim into the script's constants block
4. Validate with `python validate.py` — must pass
5. Convert to PDF and confirm: **Pages: 1**

No formatting decisions should be made from memory or defaults. Always reference this file.
