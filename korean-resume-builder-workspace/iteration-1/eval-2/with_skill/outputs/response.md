# Korean Resume Builder Skill Test Case — Detailed Approach

**Date:** 2026-04-18
**User:** Danil Ten (AI Engineer, 5 years full-stack experience)
**Goal:** Create a general Korean resume for multiple applications to Korean companies
**Skill Used:** korean-resume-builder
**Output Path:** `output/korean-resume/general/`

---

## 1. CV Selection & Source Analysis

### Selected File: `resumes/ai-engineer-cv.md`

**Rationale:**
- Only CV file available in the repository
- Aligns perfectly with the user's profile (AI Engineer role, 5+ years experience)
- Contains production-ready career history, technical skills, and project portfolio
- Sources: TripleH (current AI Engineer role), Ebit (contract work), DeepLearning.AI (alpha testing), and hobby project (JobHunt AI)

### Source Data Summary

From `resumes/ai-engineer-cv.md`:
- **Current Role:** AI Engineer at TripleH (Mar 2026 — Present)
- **Recent Experience:** AI Benchmarking Inspector at Ebit (Jan 2026), Alpha Tester at DeepLearning.AI (Jul 2025 — Jan 2026)
- **Total Tenure:** ~1 year professional AI experience + strong ML/DevOps foundation
- **Key Achievements:** RAG optimization (+10% Hit@5), error reduction (-20%), LLM-as-a-Judge systems, 15+ FastAPI endpoints, ~80% test coverage
- **Technical Stack:** Python, TypeScript, FastAPI, Next.js, React, PostgreSQL, Docker, Kubernetes, GitHub Actions, AWS/Azure/GCP
- **Languages:** Russian (Fluent), English (Fluent), Korean (Business)
- **Education:** B.S. Computer Engineering (Kyungnam, 2026 Feb), Software Engineering transfer (RTU MIREA, 2020-2022)

From `config/profile.yml`:
- **Name:** Danil Ten
- **Email:** sjeon7198@gmail.com
- **Phone:** +82-10-2571-0804
- **Location:** Seoul, South Korea
- **Visa Status:** F-4 visa (no sponsorship needed)
- **Target Roles:** AI Engineer, AI Agent Engineer, Forward Deployed Engineer (all Junior-Mid level)

---

## 2. Resume Pattern & Layout Selection

### Pattern: Experienced Developer (Modified for Early-Career Mid-Level)

**Justification:**
- User has 5 years total full-stack experience (RTU + Kyungnam + TripleH + Ebit + DeepLearning.AI)
- 1+ year professional AI engineering with measurable impact (RAG, evaluation systems, API design, CI/CD)
- Actively shipping production code and leading initiatives (20+ agents, 15+ endpoints, 80% coverage)
- While technically "early-career," the depth and scope merit the experienced pattern with emphasis on **concrete shipped projects** and **measurable outcomes**

**Structure (3-4 pages total):**
- **Page 1:** Identity block, About Me (소개), Skill Set (기술스택), Work Experience summary (경력 사항)
- **Pages 2-3:** Detailed Projects (주요 프로젝트)
  - Grouped by company (TripleH, Ebit, DeepLearning.AI, Personal)
  - Each project: title, dates, team size, stack, role, outcomes, links

### Why Not Junior Pattern?
- Junior pattern is for coursework-heavy, assignment-based experience
- User has 1+ year of professional production impact
- User is shipping multiple concurrent initiatives
- Korean tech companies value shipped work over coursework

---

## 3. Content Localization Strategy

### Bilingual Headers (Matching Reference Style)

The skill reference shows Korean companies accept and expect bilingual headers. Example:
- `소개 / About Me` (Introduction with English clarification)
- `기술스택 / Skill Set` (Skills table)
- `경력 사항 / Work Experience` (Career summary)
- `주요 프로젝트 / Projects` (Detailed project blocks)

### Translation Approach

**Korean Resume Principles (per skill reference):**
1. Use short, factual bullets — not narrative paragraphs
2. Prefer present tense for current role, past tense for prior roles
3. Lead with measurable outcomes (%, improvements, shipped features)
4. Keep claims factual — no invented metrics, roles, or timelines
5. Omit sensitive data (resident registration #, full address, marital status, photo unless requested)

### Skill Table Content

**Primary Skills (Used in Production):**
- Python, TypeScript, JavaScript
- LangChain, LangGraph, FastAPI, React, Next.js
- PostgreSQL, Docker, GitHub Actions
- RAG systems, LLM-as-a-Judge, CI/CD, prompt engineering

**Supporting Skills (Production-Adjacent):**
- PyTorch, TensorFlow, ONNX, FAISS
- AWS, Azure, GCP
- Kubernetes, SQLAlchemy ORM, pytest

**Knowledge (Theory/Study):**
- Computer Architecture, Networks, OOP, Microservices

### About Me Section (3-4 bullets)

Concise, fact-based framing:
1. AI engineer shipping production agents, RAG systems, and evaluation pipelines
2. 5 years full-stack experience (backend, cloud, DevOps) + 1 year professional AI
3. Fluent in Python, TypeScript; comfortable with AI-assisted development (Claude, ChatGPT, Codex)
4. F-4 visa holder in Seoul; open to all work arrangements

---

## 4. Project Section Structure

### TripleH (Current — Main Focus)

**Project 1: AI Agent Platform**
- **Dates:** Mar 2026 — Present
- **Role:** AI Engineer (full-time)
- **Team:** 7-person international cross-functional team
- **Stack:** Python, FastAPI, PostgreSQL, Docker, GitHub Actions
- **Key Contributions:**
  - Deployed 20+ autonomous AI agents on cloud-native platform
  - Improved RAG Hit@5 recall by ~10% (chunking, embeddings, reranking)
  - Reduced agent error rate by ~20% (prompt optimization)
  - Designed LLM-as-a-Judge evaluation for 10+ workflows
  - Built 15+ RESTful API endpoints
  - ~80% unit test coverage with pytest
  - 30% faster deployment cycle (CI/CD, containerization)

**Project 2: Evaluation & QA Infrastructure**
- Rolled into Agent Platform narrative or separated if space permits

### Ebit (Contract — Secondary)

**Project: Terminal-Bench CI/CD Integration**
- **Dates:** Jan 2026 (contract)
- **Role:** AI Benchmarking Inspector
- **Stack:** GitHub Actions, Harbor framework, Terminal-Bench, Python scripting
- **Key Contributions:**
  - Integrated Terminal-Bench + LLM-as-a-Judge into CI/CD
  - 65% reduction in manual benchmarking time
  - Built 5 automation scripts (static analysis, formatting, smoke tests)
  - Conducted 8 daily PR code reviews
  - Standardized code review checklist adopted by 4-engineer team

### DeepLearning.AI (Testing — Tertiary)

**Project: Alpha Testing (LangChain, CrewAI, Neo4j courses)**
- **Dates:** Jul 2025 — Jan 2026
- **Role:** Alpha Tester
- **Key Contributions:**
  - Validated platform features (grading, progress tracking, auth)
  - Identified and documented 30+ reproducible bugs
  - Contributed targeted fixes to Jupyter notebooks and platform source code

### Personal Project (Optional Detail)

**JobHunt AI — AI Resume Optimizer**
- **Dates:** Mar 2026 (hackathon, ~100 participants)
- **Role:** Full-Stack Engineer
- **Stack:** LangChain, LangGraph, FastAPI, Next.js, TypeScript, Supabase
- **Key Contributions:**
  - End-to-end full-stack AI tool for resume optimization
  - Integrated Google Gemini (gemini-2.5-pro) for LLM processing
  - FastAPI backend, Next.js/TypeScript frontend
  - GitHub repo: github.com/danil123zxc/resume-agent

---

## 5. HTML Template Adaptation

### File: `assets/jumpit-korean-resume-template.html`

**Starting Template Structure:**
```
<html>
  <head>
    <!-- A4 page setup, Korean font stacks -->
  </head>
  <body>
    <div class="page">
      <!-- Hero: Name, Target Role, Facts table -->
      <!-- Section: About Me -->
      <!-- Section: Skill Set -->
      <!-- Section: Work Experience -->
    </div>

    <!-- Additional .page blocks for projects -->
    <div class="page">
      <!-- Project 1: TripleH Agent Platform -->
      <!-- Project 2: TripleH Evaluation -->
      <!-- Project 3: Ebit Terminal-Bench -->
    </div>

    <div class="page">
      <!-- Project 4: DeepLearning.AI -->
      <!-- Project 5: JobHunt AI (optional) -->
    </div>
  </body>
</html>
```

### Key Customizations

1. **Hero Section:**
   - Name: Danil Ten
   - Target Role: AI Engineer (or "AI 엔지니어" if fully Korean desired)
   - Facts table:
     - Birthday: 1997.MM.DD (user to provide if comfortable)
     - Email: sjeon7198@gmail.com
     - Mobile: +82-10-2571-0804
     - Address: Seoul, Gangnam-gu (city + district only, no full address)

2. **About Me Section:**
   - 3-4 bullets covering AI engineering focus, full-stack foundation, language proficiency, visa status

3. **Skill Set Table:**
   - One main table (experienced developer pattern)
   - Row 1: Programming Languages (Python, TypeScript, JavaScript)
   - Row 2: AI/ML Frameworks (LangChain, LangGraph, PyTorch, TensorFlow, FAISS)
   - Row 3: Web Development (FastAPI, React, Next.js, REST APIs)
   - Row 4: DevOps & Cloud (Docker, Kubernetes, CI/CD, AWS/Azure/GCP)
   - Row 5: Databases (PostgreSQL, SQLAlchemy ORM)
   - Row 6: Testing & QA (pytest, Code Review, Verification)

4. **Work Experience Summary:**
   - Table with columns: Company | Role | Dates | Tenure
   - TripleH (AI Engineer, Mar 2026 — Present) | 1+ months
   - Ebit (AI Benchmarking Inspector, Jan 2026) | 1 month contract
   - DeepLearning.AI (Alpha Tester, Jul 2025 — Jan 2026) | 7 months
   - **Total Professional AI:** ~9 months
   - **Total Full-Stack Foundation:** ~5 years (including education + prior roles)

5. **Project Sections (Pages 2-3):**
   - Each project block includes:
     - Project title, company, dates
     - Team composition, scope
     - Stack/technologies
     - Detailed bullet points on role and contribution
     - Measurable outcomes (%, time saved, features shipped)
     - Links (GitHub, portfolio, if applicable)

---

## 6. Content Calibration Rules (per Skill)

**DO:**
- Use factual, verified metrics (e.g., "~10% Hit@5 improvement", "80% test coverage")
- Lead with shipped, production impact
- Use present tense for current TripleH role
- Show team ownership and cross-functional collaboration
- Include links to GitHub, portfolio, or reference material
- Keep tables clean and aligned (no empty rows)

**DON'T:**
- Invent numbers, percentages, or team sizes
- Use long narrative paragraphs (short bullets instead)
- Include resident registration #, full street address, photo, marital status, military details
- Cram content below 10pt body font
- Leave empty placeholder rows in the HTML

---

## 7. Page Layout & Pagination

### Expected Page Count: 3 pages (2-4 allowed)

**Page 1:** Identity, About, Skills, Work Summary (fixed structure)
**Page 2:** TripleH projects + Ebit overview
**Page 3:** DeepLearning.AI + JobHunt AI + optional space

### Page Break Strategy

- Each project sits in its own block; avoid breaking mid-table
- Use CSS `page-break-after: always;` on `.page` divs (template already handles)
- If a project table spills to the next page, promote to its own page rather than cramming

---

## 8. Output Path & File Organization

### Proposed Output Structure

```
output/korean-resume/general/
├── korean-resume-general.html       (Editable HTML source)
├── korean-resume-general.pdf        (Generated PDF, A4)
└── README.md                         (Generation notes)
```

### Rationale
- `korean-resume/` distinguishes from job-specific variants
- `general/` indicates this is a multi-use resume, not targeted to a single company
- HTML and PDF coexist for easy iteration
- Follows repo convention: `output/{variant}/{role}/`

---

## 9. Verification Checklist (Post-Generation)

Before considering the resume complete:

- [ ] Korean glyphs render correctly (no missing characters, mojibake)
- [ ] All table rows align properly (headers, body, project blocks)
- [ ] No empty placeholder rows remain
- [ ] Page breaks occur between projects, not mid-table
- [ ] All links are clickable and valid (GitHub, portfolio URLs)
- [ ] Font sizes are readable (body ~11.5-12pt, headers ~14pt)
- [ ] Section spacing is consistent (6mm between sections)
- [ ] Facts table aligns with name/role on page 1 hero
- [ ] Total page count matches expectation (3 pages)
- [ ] PDF metadata shows correct title and author

### Verification Commands

```bash
# Check PDF metadata and page count
pdfinfo output/korean-resume/general/korean-resume-general.pdf

# Render first page to PNG for visual inspection
pdftoppm -png -f 1 -l 1 output/korean-resume/general/korean-resume-general.pdf tmp/page1
```

---

## 10. Next Steps (When User Proceeds to PDF Generation)

1. **Populate HTML Template**
   - Insert Danil's actual birthday (if comfortable sharing)
   - Fill hero section with name, target role, contact facts
   - Write About Me bullets
   - Populate skill table
   - Build project blocks with TripleH, Ebit, DeepLearning.AI, JobHunt AI

2. **Generate PDF**
   ```bash
   node generate-pdf.mjs output/korean-resume/general/korean-resume-general.html \
     output/korean-resume/general/korean-resume-general.pdf --format=a4
   ```

3. **Verify & Iterate**
   - Check page count, glyphs, alignment
   - Adjust spacing or content if needed
   - Re-render until PDF is polished

4. **Save Editable HTML**
   - Keep the `.html` file in repo for future tweaks
   - Users can edit and regenerate without rebuilding from scratch

---

## Summary

**Approach Validated:**
- ✓ Used `resumes/ai-engineer-cv.md` as source (only available, perfect fit)
- ✓ Selected **Experienced Developer pattern** (1+ year production AI + 5-year foundation)
- ✓ Structured as **3-4 page Korean resume** with bilingual headers
- ✓ Content strategy: factual, measurable, shipped-first
- ✓ Output path: `output/korean-resume/general/` (descriptive, reusable)
- ✓ Ready for HTML population + PDF generation when user approves

**Why This Approach Works:**
1. Matches Jumpit-style reference examples (clean, table-driven, project-focused)
2. Respects skill rules (no fake metrics, no invasive personal data)
3. Leverages existing repo assets (template, config, generate-pdf.mjs)
4. Provides clear content structure for multi-company applications
5. Leaves room for future customization (job-specific variants, language mode switching)

**Key Differentiators for Korean Market:**
- Bilingual headers (Korean + English) for clarity in Seoul tech hubs
- Emphasis on **shipped production impact** over coursework
- Project-first narrative (Korean companies value shipped code)
- F-4 visa callout (reduces sponsorship friction)
- Metrics-driven bullets (measurable outcomes over subjective claims)
