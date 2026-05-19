# CV Template Classic Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `templates/cv-template.html` with a clean Georgia-serif classic layout matching the Kiran Kumar reference, and update `modes/pdf.md` to match the new design and section structure.

**Architecture:** Full rewrite of `cv-template.html` CSS and HTML. Update `modes/pdf.md` design description, section order, and placeholder table. No changes to `generate-pdf.mjs`, `config/profile.yml`, or any other file — `portfolio_url` is already set to `https://manukashyap.in`.

**Tech Stack:** HTML, CSS, Georgia system serif font, existing Playwright PDF pipeline (`generate-pdf.mjs`)

---

### Task 1: Rewrite cv-template.html

**Files:**
- Modify: `templates/cv-template.html` (full rewrite)

- [ ] **Step 1: Replace the entire file with the new template**

Write the following content to `templates/cv-template.html`:

```html
<!DOCTYPE html>
<html lang="{{LANG}}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{NAME}} — CV</title>
<style>
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 11px;
    line-height: 1.6;
    color: #1a1a1a;
    background: #ffffff;
  }

  .page {
    width: 100%;
    max-width: {{PAGE_WIDTH}};
    margin: 0 auto;
    padding: 32px 40px;
  }

  /* === HEADER === */
  .header {
    text-align: center;
    margin-bottom: 16px;
  }

  .header h1 {
    font-size: 26px;
    font-weight: bold;
    color: #1a1a1a;
    letter-spacing: 0.02em;
    margin-bottom: 6px;
  }

  .contact-row {
    font-size: 10.5px;
    color: #333;
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0 2px;
    line-height: 1.6;
  }

  .contact-row a {
    color: #2563eb;
    text-decoration: none;
  }

  .separator {
    color: #888;
    margin: 0 3px;
  }

  /* === SECTIONS === */
  .section {
    margin-bottom: 14px;
  }

  .section-title {
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #2563eb;
    border-bottom: 1px solid #e2e2e2;
    padding-bottom: 2px;
    margin-bottom: 8px;
  }

  /* === PROFILE SUMMARY === */
  .summary-text {
    font-size: 11px;
    line-height: 1.7;
    color: #1a1a1a;
  }

  /* Links must never break across lines */
  a {
    white-space: nowrap;
  }

  /* === WORK EXPERIENCE === */
  .job {
    margin-bottom: 12px;
  }

  .job-title {
    font-size: 11px;
    font-weight: bold;
    color: #1a1a1a;
  }

  .job-meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .job-company {
    font-style: italic;
    font-size: 11px;
    color: #333;
  }

  .job-period {
    font-style: italic;
    font-size: 10.5px;
    color: #333;
    white-space: nowrap;
  }

  .job ul {
    padding-left: 18px;
    margin-top: 4px;
  }

  .job li {
    font-size: 10.5px;
    line-height: 1.65;
    color: #1a1a1a;
    margin-bottom: 3px;
  }

  .job li strong {
    font-weight: bold;
  }

  /* === SKILLS === */
  .skills-list {
    list-style: disc;
    padding-left: 18px;
  }

  .skills-list li {
    font-size: 10.5px;
    line-height: 1.8;
    color: #1a1a1a;
  }

  /* === EDUCATION === */
  .edu-item {
    margin-bottom: 6px;
  }

  .edu-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .edu-org {
    font-weight: bold;
    font-size: 11px;
    color: #1a1a1a;
  }

  .edu-year {
    font-style: italic;
    font-size: 10.5px;
    color: #333;
    white-space: nowrap;
  }

  .edu-degree {
    font-style: italic;
    font-size: 10.5px;
    color: #333;
  }

  .edu-gpa {
    font-size: 10.5px;
    color: #333;
  }

  /* === PRINT === */
  @media print {
    .page { padding: 0; }
  }

  /* === PAGE BREAK CONTROL === */
  .avoid-break,
  .job,
  .edu-item {
    break-inside: avoid;
    page-break-inside: avoid;
  }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header avoid-break">
    <h1>{{NAME}}</h1>
    <div class="contact-row">
      <span>{{PHONE}}</span>
      <span class="separator">·</span>
      <a href="mailto:{{EMAIL}}">{{EMAIL}}</a>
      <span class="separator">·</span>
      <a href="{{LINKEDIN_URL}}">{{LINKEDIN_DISPLAY}}</a>
      <span class="separator">·</span>
      <a href="{{PORTFOLIO_URL}}">{{PORTFOLIO_DISPLAY}}</a>
      <span class="separator">·</span>
      <span>{{LOCATION}}</span>
    </div>
  </div>

  <!-- PROFILE SUMMARY -->
  <div class="section avoid-break">
    <div class="section-title">{{SECTION_SUMMARY}}</div>
    <div class="summary-text">{{SUMMARY_TEXT}}</div>
  </div>

  <!-- WORK EXPERIENCE -->
  <div class="section">
    <div class="section-title">{{SECTION_EXPERIENCE}}</div>
    {{EXPERIENCE}}
  </div>

  <!-- TECHNICAL SKILLS -->
  <div class="section avoid-break">
    <div class="section-title">{{SECTION_SKILLS}}</div>
    {{SKILLS}}
  </div>

  <!-- EDUCATION -->
  <div class="section avoid-break">
    <div class="section-title">{{SECTION_EDUCATION}}</div>
    {{EDUCATION}}
  </div>

</div>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add templates/cv-template.html
git commit -m "feat(cv): replace template with classic Georgia serif layout"
```

---

### Task 2: Update modes/pdf.md

**Files:**
- Modify: `modes/pdf.md`

The mode has three stale sections that reference the old design. Update each one.

- [ ] **Step 1: Replace the "## Diseño del PDF" section**

Find this block in `modes/pdf.md`:

```markdown
## Diseño del PDF

- **Fonts**: Space Grotesk (headings, 600-700) + DM Sans (body, 400-500)
- **Fonts self-hosted**: `fonts/`
- **Header**: nombre en Space Grotesk 24px bold + línea gradiente `linear-gradient(to right, hsl(187,74%,32%), hsl(270,70%,45%))` 2px + fila de contacto
- **Section headers**: Space Grotesk 13px, uppercase, letter-spacing 0.05em, color cyan primary
- **Body**: DM Sans 11px, line-height 1.5
- **Company names**: color accent purple `hsl(270,70%,45%)`
- **Márgenes**: 0.6in
- **Background**: blanco puro
```

Replace with:

```markdown
## Diseño del PDF

- **Font**: Georgia, serif (system font — no embedding required)
- **Header**: nombre centrado 26px bold + fila de contacto centrada con separadores `·`
- **Section headers**: 11px, uppercase, bold, color azul `#2563eb`, línea inferior `1px solid #e2e2e2`
- **Body**: 11px, line-height 1.6
- **Márgenes**: 32px top/bottom, 40px left/right
- **Background**: blanco puro
```

- [ ] **Step 2: Replace the "## Orden de secciones" section**

Find:

```markdown
## Orden de secciones (optimizado "6-second recruiter scan")

1. Header (nombre grande, gradiente, contacto, link portfolio)
2. Professional Summary (3-4 líneas, keyword-dense)
3. Core Competencies (6-8 keyword phrases en flex-grid)
4. Work Experience (cronológico inverso)
5. Projects (top 3-4 más relevantes)
6. Education & Certifications
7. Skills (idiomas + técnicos)
```

Replace with:

```markdown
## Orden de secciones (optimizado "6-second recruiter scan")

1. Header (nombre centrado, contacto, link portfolio)
2. Profile Summary (3-4 líneas, keyword-dense)
3. Work Experience (cronológico inverso)
4. Technical Skills (bulleted list con categorías en bold)
5. Education
```

- [ ] **Step 3: Replace the placeholder table in "## Template HTML"**

Find the entire placeholder table (from `| Placeholder |` to the last row `| \`{{SKILLS}}\`` ...):

```markdown
| Placeholder | Contenido |
|-------------|-----------|
| `{{LANG}}` | `en` o `es` |
| `{{PAGE_WIDTH}}` | `8.5in` (letter) o `210mm` (A4) |
| `{{NAME}}` | (from profile.yml) |
| `{{PHONE}}` | (from profile.yml — include with its separator only when `profile.yml` has a non-empty `phone` value; omit both `<span>` and `<span class="separator">` otherwise) |
| `{{EMAIL}}` | (from profile.yml) |
| `{{LINKEDIN_URL}}` / `{{LINKEDIN_DISPLAY}}` | [from profile.yml] |
| `{{PORTFOLIO_URL}}` / `{{PORTFOLIO_DISPLAY}}` | [from profile.yml] (o /es según idioma) |
| `{{LOCATION}}` | [from profile.yml] |
| `{{SECTION_SUMMARY}}` | Professional Summary / Resumen Profesional |
| `{{SUMMARY_TEXT}}` | Summary personalizado con keywords |
| `{{SECTION_COMPETENCIES}}` | Core Competencies / Competencias Core |
| `{{COMPETENCIES}}` | `<span class="competency-tag">keyword</span>` × 6-8 |
| `{{SECTION_EXPERIENCE}}` | Work Experience / Experiencia Laboral |
| `{{EXPERIENCE}}` | HTML de cada trabajo con bullets reordenados |
| `{{SECTION_PROJECTS}}` | Projects / Proyectos |
| `{{PROJECTS}}` | HTML de top 3-4 proyectos |
| `{{SECTION_EDUCATION}}` | Education / Formación |
| `{{EDUCATION}}` | HTML de educación |
| `{{SECTION_CERTIFICATIONS}}` | Certifications / Certificaciones |
| `{{CERTIFICATIONS}}` | HTML de certificaciones |
| `{{SECTION_SKILLS}}` | Skills / Competencias |
| `{{SKILLS}}` | HTML de skills |
```

Replace with:

```markdown
| Placeholder | Contenido |
|-------------|-----------|
| `{{LANG}}` | `en` o `es` |
| `{{PAGE_WIDTH}}` | `8.5in` (letter) o `210mm` (A4) |
| `{{NAME}}` | (from profile.yml) |
| `{{PHONE}}` | (from profile.yml — include with its separator only when `profile.yml` has a non-empty `phone` value; omit both `<span>` and `<span class="separator">` otherwise) |
| `{{EMAIL}}` | (from profile.yml) |
| `{{LINKEDIN_URL}}` / `{{LINKEDIN_DISPLAY}}` | [from profile.yml] |
| `{{PORTFOLIO_URL}}` / `{{PORTFOLIO_DISPLAY}}` | [from profile.yml] — renders as website link (e.g. `manukashyap.in`) |
| `{{LOCATION}}` | [from profile.yml] |
| `{{SECTION_SUMMARY}}` | `Profile Summary` / `Resumen de Perfil` |
| `{{SUMMARY_TEXT}}` | Summary personalizado con keywords |
| `{{SECTION_EXPERIENCE}}` | `Work Experience` / `Experiencia Laboral` |
| `{{EXPERIENCE}}` | One `.job` div per role — see HTML structure below |
| `{{SECTION_SKILLS}}` | `Technical Skills` / `Habilidades Técnicas` |
| `{{SKILLS}}` | `<ul class="skills-list">` with one `<li>` per category — see HTML structure below |
| `{{SECTION_EDUCATION}}` | `Education` / `Formación` |
| `{{EDUCATION}}` | One `.edu-item` div per degree — see HTML structure below |

### HTML structures for placeholders

**`{{EXPERIENCE}}` — one block per role:**
```html
<div class="job">
  <div class="job-title">Software Engineer 2</div>
  <div class="job-meta">
    <span class="job-company">JPMorgan Chase and Co</span>
    <span class="job-period">Sep 2024 - Present</span>
  </div>
  <ul>
    <li>Designed a hybrid scheduling engine using <strong>Quartz</strong> for precise scheduling...</li>
    <li>Second bullet point here.</li>
  </ul>
</div>
```

**`{{SKILLS}}` — bulleted list with bold category labels:**
```html
<ul class="skills-list">
  <li><strong>Programming Languages:</strong> Java, Python, JavaScript</li>
  <li><strong>Backend/Frameworks:</strong> Spring Boot, Apache Spark, React</li>
  <li><strong>Cloud/DevOps:</strong> AWS, GCP, Docker, Kubernetes</li>
</ul>
```

**`{{EDUCATION}}` — one block per degree:**
```html
<div class="edu-item">
  <div class="edu-header">
    <span class="edu-org">Visvesvaraya Technological University</span>
    <span class="edu-year">Aug 2017 - Aug 2021</span>
  </div>
  <div class="edu-degree">B.E, Computer Science and Engineering</div>
  <div class="edu-gpa">CGPA: 8.0</div>
</div>
```
```

- [ ] **Step 4: Commit**

```bash
git add modes/pdf.md
git commit -m "feat(pdf-mode): update design desc and placeholders for classic serif template"
```

---

### Task 3: Visual verification

**Files:** None modified — verification only.

- [ ] **Step 1: Create a minimal filled test HTML**

Run this to create a filled sample (substitutes real values for all placeholders):

```bash
node -e "
const fs = require('fs');
let html = fs.readFileSync('templates/cv-template.html', 'utf8');
html = html
  .replace('{{LANG}}', 'en')
  .replace('{{PAGE_WIDTH}}', '210mm')
  .replace('{{NAME}}', 'Manukashyap U. V.')
  .replace('{{PHONE}}', '+91-8547517530')
  .replace('{{EMAIL}}', 'manukashyap.u.v@gmail.com')
  .replace('{{LINKEDIN_URL}}', 'https://linkedin.com/in/manukashyapuv')
  .replace('{{LINKEDIN_DISPLAY}}', 'LinkedIn')
  .replace('{{PORTFOLIO_URL}}', 'https://manukashyap.in')
  .replace('{{PORTFOLIO_DISPLAY}}', 'manukashyap.in')
  .replace('{{LOCATION}}', 'Bengaluru, India')
  .replace('{{SECTION_SUMMARY}}', 'Profile Summary')
  .replace('{{SUMMARY_TEXT}}', 'Senior Full-Stack Engineer with 5 years at Sony building supply chain systems and AI-powered developer tools at scale. Proven track record of architecting high-availability platforms handling \$2B peak order volume.')
  .replace('{{SECTION_EXPERIENCE}}', 'Work Experience')
  .replace('{{EXPERIENCE}}', \`
    <div class=\"job\">
      <div class=\"job-title\">Senior Software Engineer</div>
      <div class=\"job-meta\">
        <span class=\"job-company\">Sony India Software Centre</span>
        <span class=\"job-period\">Jul 2019 - Present</span>
      </div>
      <ul>
        <li>Architected <strong>GSOIS</strong> — global order pipeline with 99.9% uptime handling <strong>\$2B peak monthly volume</strong> across 4 regions.</li>
        <li>Built an agentic SDLC pipeline adopted by 20+ engineers, automating spec to MR with multi-agent orchestration.</li>
      </ul>
    </div>
  \`)
  .replace('{{SECTION_SKILLS}}', 'Technical Skills')
  .replace('{{SKILLS}}', \`
    <ul class=\"skills-list\">
      <li><strong>Programming Languages:</strong> Java, JavaScript, TypeScript, Python</li>
      <li><strong>Backend/Frameworks:</strong> Spring Boot, Spring Batch, Node.js, React, Vue.js</li>
      <li><strong>Cloud/DevOps:</strong> AWS (Bedrock, S3, RDS, Lambda), Docker, Kubernetes</li>
      <li><strong>Databases:</strong> Oracle RDS, PostgreSQL, pgvector, Redis</li>
      <li><strong>AI/ML:</strong> AWS Bedrock, RAG pipelines, LLM integration, Playwright automation</li>
    </ul>
  \`)
  .replace('{{SECTION_EDUCATION}}', 'Education')
  .replace('{{EDUCATION}}', \`
    <div class=\"edu-item\">
      <div class=\"edu-header\">
        <span class=\"edu-org\">Manipal Institute of Technology</span>
        <span class=\"edu-year\">2015 - 2019</span>
      </div>
      <div class=\"edu-degree\">B.E, Computer Science and Engineering</div>
    </div>
  \`);
fs.writeFileSync('/tmp/cv-test-classic.html', html);
console.log('Written to /tmp/cv-test-classic.html');
"
```

- [ ] **Step 2: Generate PDF**

```bash
node generate-pdf.mjs /tmp/cv-test-classic.html /tmp/cv-test-classic.pdf --format=a4
```

Expected output: `PDF generated: /tmp/cv-test-classic.pdf` (no errors)

- [ ] **Step 3: Open and visually verify**

```bash
open /tmp/cv-test-classic.pdf
```

Check against the Kiran Kumar reference:
- [ ] Name is centered, large, bold
- [ ] Contact line is centered with `·` separators, `manukashyap.in` is a clickable link
- [ ] Section headers are ALL CAPS blue with a thin gray rule underneath
- [ ] Job title is bold on its own line; company italic left + date italic right below it
- [ ] Skills render as a bulleted list with bold category labels
- [ ] Education shows university bold left + date right, degree below
- [ ] No gradient bar, no colored tags, no extra sections

- [ ] **Step 4: Commit verification note**

```bash
git commit --allow-empty -m "chore: classic template visual verification passed"
```
