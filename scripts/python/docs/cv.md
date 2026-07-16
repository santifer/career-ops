# CV

CV generation pipeline — HTML, LaTeX, PDF, and cover letters. Reads from `cv.md`, `config/profile.yml`, `article-digest.md`.

## Core Modules

### `generate_pdf.py`
Renders an HTML CV to PDF using Playwright.

```
python -m scripts.python.cv.generate_pdf <html_input> <pdf_output> [--format=a4|letter] [--report=001]
npm run pdf
```

### `generate_cover_letter.py`
Renders a cover letter payload to PDF.

```
python -m scripts.python.cv.generate_cover_letter --payload
npm run cover-letter
```

### `verify_cv_facts.py`
Guard against invented metrics. Validates all claims in generated CV output against the source-of-truth files (`cv.md`, `article-digest.md`).

```
python -m scripts.python.cv.verify_cv_facts
npm run cv:verify-facts
```

### `templates.py`
Discovers and resolves CV templates from `templates/`.

```
python -m scripts.python.cv.templates
```

## HTML Pipeline

### `build_html.py`
Renders structured CV JSON to HTML using the template at `templates/cv-template.html`.

```
python -m scripts.python.cv.build_html
```

## LaTeX Pipeline (legacy)

| Module | Description |
|--------|-------------|
| `build_latex.py` | Render CV JSON to LaTeX |
| `generate_latex.py` | Validate + compile `.tex` to PDF via pdflatex |
| `extract_latex_content.py` | Detect LaTeX CV family and list editable slots |
| `patch_latex_content.py` | Apply prose patches to user-owned `.tex` CV |

## Internal

| Module | Role |
|--------|------|
| `latex_content.py` | LaTeX content constants and helpers |

## Source of Truth

User-facing content is generated exclusively from:
- `cv.md` — canonical CV
- `article-digest.md` — detailed proof points
- `config/profile.yml` — candidate profile
- `modes/_profile.md` — personalization

The `verify_cv_facts.py` module guarantees no claims are invented beyond these sources.
