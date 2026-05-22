# Mode: typst — Typst CV Generator

Compile `cv.md` into a polished PDF using the Typst typesetting system (`templates/template.typ`).

Unlike the HTML→PDF path (`pdf` mode), this mode produces a typeset document — tighter typography, icon contacts, and consistent spacing without a browser renderer.

## Requirements

- `typst` on PATH — install with `brew install typst` (macOS) or see [typst.app](https://typst.app)
- `assets/fonts/` — Roboto font files (included in repo)
- `assets/icons/` — SVG icons for contact line (included in repo)

## Pipeline

1. Read `cv.md` as source of truth
2. Read `config/profile.yml` for candidate identity
3. Parse cv.md into structured sections (name, contact, summary, experience, certs, skills, education)
4. Generate a `.typ` source file from `templates/template.typ`
5. Compile via `typst compile` with `--input format={letter|a4}`
6. Output to `output/cv-{name}.pdf`
7. Report: path, file size

## Usage

```bash
node generate-typst-pdf.mjs                        # a4, auto filename from cv.md
node generate-typst-pdf.mjs output/my-cv.pdf       # custom output path
node generate-typst-pdf.mjs --format=letter        # US letter format
node generate-typst-pdf.mjs my-cv.pdf --format=letter
```

Or via npm:

```bash
npm run typst
```

## cv.md Structure Expected

The parser reads these sections (H2 headers):

| Section | What it reads |
|---------|--------------|
| `# Full Name` | H1 → firstname + lastname |
| `**Job Title**` | Bold line before contact list → positions |
| `- Key: Value` | Contact list items (phone, email, linkedin, github, portfolio, medium) |
| `## Summary` | Bullets or prose → professional_summary |
| `## Experience` | H3 job entries with company, title, location, duration, bullets |
| `## Certifications` | Bullet list |
| `## Skills` | `**Category:** items` lines |
| `## Education` | `**Degree — Institution**` + date line |

## Template Customization

Edit `templates/template.typ` to change:
- Colors: `font_color`, `font_color_headings`
- Font: `set text(font: ("Roboto"), ...)` — swap for any font in `assets/fonts/`
- Margins: `set page(margin: ...)` in the `resume` function
- Section order: reorder calls in `resume` body

## Format Support

Pass `--format=letter` for US Letter (8.5×11") or `--format=a4` (default) for A4.
The template reads `sys.inputs.at("format", default: "a4")` — same value is passed via `--input format=...` by the generator script.

## ATS Notes

Typst PDFs embed text as Unicode — readable by ATS parsers. The template uses:
- Single-column layout
- Standard section names
- No tables or complex layouts that confuse parsers

For maximum ATS compatibility on conservative systems, prefer the HTML→PDF path (`pdf` mode) which has been battle-tested with more ATS scanners.
