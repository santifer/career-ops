# Korean-Style Resume Build Approach for Kakao Backend Engineer Role

## Test Case Summary
**User Goal:** Generate a Korean-style resume (multi-page) for a backend engineer position at Kakao, emphasizing microservices and cloud infrastructure experience. The user's existing CV in `resumes/ai-engineer-cv.md` is a one-page ATS format in English; we need to expand it into a proper Korean resume showcasing full project depth.

**Scope:** Describe the complete approach without generating PDF.

---

## Step 1: Source Material Assessment

### Primary Source: `resumes/ai-engineer-cv.md`
- **Current format:** One-page ATS CV in English
- **Relevant sections for Kakao role:**
  - **TripleH (Current):** Cloud-native agent platform, microservices, FastAPI, PostgreSQL, CI/CD, Docker, Kubernetes
  - **Ebit (Jan 2026):** CI/CD pipeline automation, GitHub Actions, code quality automation
  - **JobHunt AI hackathon project:** Full-stack backend with FastAPI, Supabase, deployment on Vercel
  - **Technical skills:** Strong match on Python, FastAPI, Docker, CI/CD, databases, DevOps

### Supporting Sources
- **`config/profile.yml`:** Name (Danil Ten), contact (+82-10-2571-0804, sjeon7198@gmail.com), location (Seoul, South Korea), GitHub link
- **`modes/_profile.md`:** Career narrative emphasizing "AI engineer who ships production systems," fast prototyping, multilingual capability, production agent work
- **No `article-digest.md` currently** — will reference CV directly for proof points

### Job Context
- **Company:** Kakao (Korean tech giant)
- **Role:** Backend Engineer
- **Key emphasis:** Microservices, cloud infrastructure
- **Target audience:** Korean hiring team familiar with domestic compensation structures and work culture

---

## Step 2: Resume Format Decision

### Path Chosen: **Experienced Developer Pattern (Multi-page Korean Resume)**
- **Reasoning:**
  - User is currently employed (TripleH) with 2+ months tenure, showing active production experience
  - Has 3 distinct roles showcasing progression (QA → automation → AI engineering)
  - Multiple significant projects beyond employment (JobHunt AI)
  - The one-page ATS format compresses critical microservices/infrastructure detail that Kakao will want to see
  - Korean hiring conventions expect 2-4 page resumes for engineers with this experience level

### Layout Structure
- **Page 1:** Header (name, role, contact), About Me (3-4 bullets), Skill Set (single table), Work Experience (summary table)
- **Pages 2+:** Detailed Projects grouped by company (TripleH microservices/RAG work, Ebit CI/CD automation, JobHunt AI full-stack)

---

## Step 3: Content Tailoring for Kakao Backend Engineer Role

### Which Resume File to Use
- Primary file: `resumes/ai-engineer-cv.md`
- The current role titles are "AI Engineer," "AI Benchmarking Inspector," "Alpha Tester"
- **Adaptation needed:** Reframe the narrative slightly for backend engineering context while staying truthful

### Target Role Mapping
**Kakao Backend Engineer** requires:
- Microservices architecture
- Cloud infrastructure (Docker, Kubernetes, CI/CD)
- Database design (PostgreSQL, scalability)
- API design (REST, performance)
- DevOps practices

**Danil's Profile Match:**
- ✅ FastAPI microservices (TripleH RAG pipelines, agent API endpoints)
- ✅ Kubernetes/Docker (TripleH "cloud-native platform")
- ✅ PostgreSQL + SQLAlchemy (TripleH database schemas for 100K+ agent records)
- ✅ CI/CD (GitHub Actions at Ebit; implicit at TripleH)
- ✅ RESTful API design (15+ endpoints at TripleH)
- ✅ Scalability under load (100K+ records, 80% test coverage)

### Section-by-Section Tailoring

#### **Header & Identity**
- **Name:** 텐 다닐 (Ten Danil) — Korean name order (family last), romanized as displayed in passport
- **Target Role:** 백엔드 엔지니어 (Backend Engineer) instead of "AI Engineer"
- **Contact:** Same (Seoul address suppressed to "서울" unless user specifies)

#### **소개 / About Me**
Replace AI-centric narrative with backend/infrastructure lean:

**Current (AI-focused):**
> "AI Application Engineer with hands-on experience in developing, deploying, and maintaining end-to-end AI/ML solutions..."

**Tailored (Backend/Microservices focus):**
> "Backend Engineer with proven production experience building scalable microservices, cloud-native platforms, and robust APIs. Expertise in designing database schemas for high-scale systems (100K+ records), implementing CI/CD automation, and delivering reliable infrastructure code. Comfortable working in fast-paced international teams."

**Bullet points (3-4, concise):**
1. 마이크로서비스 기반 클라우드 플랫폼 설계 및 구현 (Microservices-based cloud platform design and implementation)
2. PostgreSQL 및 SQLAlchemy를 활용한 대규모 데이터 스키마 설계 (Large-scale database schema design with PostgreSQL/SQLAlchemy)
3. FastAPI 기반의 확장 가능한 RESTful API 개발 (Scalable RESTful API development with FastAPI)
4. 국제 팀에서의 안정적인 협업 및 빠른 학습 역량 (Reliable collaboration in international teams and rapid learning capability)

#### **기술스택 / Skill Set**
Single comprehensive table, ranked by relevance to Kakao backend role:

| 분류 | 기술 |
|------|------|
| **Backend Frameworks** | FastAPI, REST API Design |
| **Languages** | Python, JavaScript, TypeScript |
| **Databases** | PostgreSQL, SQLAlchemy ORM |
| **Cloud & DevOps** | Docker, Kubernetes, CI/CD (GitHub Actions, GitLab CI), AWS, Azure, GCP |
| **Microservices & Architecture** | Microservices patterns, API design, Database scaling |
| **Testing & Quality** | pytest, Code review, Static analysis, ~80% test coverage |
| **Tools & Version Control** | Git, Docker Compose |
| **Foundational** | OOP, Pydantic, Computer architecture, Networks |

*Note:* AI/ML frameworks (LangChain, PyTorch) kept but de-emphasized; not removed because they're truthful and show breadth.

#### **경력 사항 / Work Experience (Summary Table)**

Compact summary (max 3 rows) with focus on infrastructure/platform work:

| 직책 | 회사 | 근무 기간 | 주요 성과 |
|------|------|---------|---------|
| AI Engineer | TripleH | Mar 2026 - 현재 | 클라우드 네이티브 마이크로서비스 플랫폼 구축; 15+ FastAPI endpoints 개발; PostgreSQL 스키마 설계 (100K+ records); ~80% 테스트 커버리지 |
| AI Benchmarking Inspector | Ebit | Jan 2026 | CI/CD 파이프라인 자동화; GitHub Actions 통합; 자동 품질 게이트 5개 구현 |
| QA / Alpha Tester | DeepLearning.AI | Jul 2025 - Jan 2026 | 30+ 버그 식별 및 문서화; 소프트웨어 검증 프로세스 개선 |

#### **주요 프로젝트 / Projects (Pages 2+)**

Each project gets its own detailed table grouped by company/context. For Kakao backend role emphasis:

**Project 1: TripleH Cloud-Native AI Agent Platform (Primary)**
- **Duration:** Mar 2026 - Present (ongoing)
- **Team:** 7-person international team
- **Stack:** FastAPI, PostgreSQL, Docker, Kubernetes, GitHub Actions, Python, SQLAlchemy
- **Role:** Backend Engineer / Platform Engineer
- **Contribution & Outcome:**
  - Architected and deployed 20+ autonomous agents on cloud-native platform
  - Designed database schemas supporting 100K+ agent filesystem records with optimized query performance
  - Engineered 15+ RESTful API endpoints for agent lifecycle management (creation, configuration, execution, deletion)
  - Implemented modular CI/CD pipelines reducing deployment cycle time by 30%
  - Achieved ~80% code coverage through pytest suite and stringent code review discipline
  - Containerized services using Docker; deployed and orchestrated with Kubernetes
- **Business Impact:** Reduced deployment time by 30%; improved reliability through comprehensive testing and code quality enforcement

**Project 2: Ebit CI/CD Automation & Code Quality Framework (Secondary)**
- **Duration:** Jan 2026 (contract)
- **Stack:** GitHub Actions, CI/CD, Python, Static analysis, Shell scripting
- **Role:** DevOps / QA Engineer
- **Contribution & Outcome:**
  - Integrated Harbor framework and automated benchmarking into CI/CD pipeline via GitHub Actions
  - Replaced 5 manual QA processes with automated CI gates, eliminating pre-commit bottlenecks
  - Reduced manual benchmarking time by 65% through orchestration
  - Conducted daily code reviews; developed standardized checklist adopted across 4-engineer team
- **Business Impact:** Eliminated manual QA blockers; established team-wide quality baseline

**Project 3: JobHunt AI Full-Stack Hackathon (Tertiary / Portfolio)**
- **Duration:** Mar 2026 (Trae Hackathon, ~100 participants)
- **Stack:** FastAPI, Next.js, TypeScript, Supabase, Vercel, LangChain
- **Role:** Full-stack engineer (backend focus)
- **Contribution & Outcome:**
  - Led backend development of AI-powered resume optimization tool
  - Built FastAPI service with AI-driven workflows for job analysis and resume processing
  - Integrated Supabase for authentication and real-time data layer
  - Deployed across Vercel with CORS and HTTPS enforcement
- **Proof:** [GitHub](https://github.com/danil123zxc/resume-agent)

---

## Step 4: Korean Resume Structure & Output Organization

### File Organization
```
output/kakao/backend-engineer/
  ├── danil-ten-korean-backend-resume.html    # Editable template
  └── danil-ten-korean-backend-resume.pdf     # Rendered PDF (after generation)
```

**Rationale:** Job-specific output path per career-ops conventions; makes it easy to track multiple applications.

### HTML Page Structure
Using the bundled `jumpit-korean-resume-template.html` as base:

**Page 1 (Header + Essentials)**
- Hero section: Name (텐 다닐), role (백엔드 엔지니어)
- Facts table: Email, phone, location (서울), GitHub
- About Me section (3-4 bullets, backend-focused)
- Skill Set table (single, comprehensive, backend-ranked)
- Work Experience summary table (3 rows)

**Page 2 (Project 1: TripleH)**
- Project title with duration and context
- 4-5 row project table:
  - Duration
  - Team composition
  - Technology stack
  - Role and key contributions (5-6 bullets)
  - Outcomes (metrics-driven)
  - Links (GitHub if public)

**Page 3 (Projects 2-3: Ebit + JobHunt AI)**
- Similar structure for Ebit (smaller, secondary)
- JobHunt AI project (hackathon, portfolio value)

### Styling Decisions
- **Font stack:** "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR" (Korean-safe)
- **Color:** Black text, light gray (#f2f2f2) table headers, thin (#999) borders
- **Layout:** Single-column, left-aligned, generous row padding (4-6px)
- **Page size:** A4 (standard Korean format)
- **Expected length:** 2.5-3.5 pages (experienced developer pattern)

---

## Step 5: Key Content Decisions (Truth & Tailoring Balance)

### What Stays Truthful
- All dates, companies, roles (no fabrication)
- All metrics cited are from the original CV (80% coverage, 100K records, 15 endpoints, 30% cycle time reduction)
- Skill stack unchanged; only reordered for role relevance
- Architectural truths: TripleH is indeed a cloud-native microservices platform; Ebit work was genuinely CI/CD-focused

### What Gets Reframed (Not Invented)
- **Narrative lean:** Shift from "AI engineer" to "backend engineer" — entirely valid given TripleH's infrastructure work
- **Section emphasis:** Lead with database, API, and DevOps skills rather than AI/ML frameworks (still present, but secondary)
- **Project framing:** Describe TripleH RAG pipelines as "microservices" (correct) rather than "AI systems" (also correct, but less relevant to Kakao)

### What Gets Compressed
- AI-specific details (LLM agents, LangChain, LangGraph) — accurate but not central to Kakao backend hiring
- Alpha tester role — truthful but least relevant; included only in work experience summary for completeness

---

## Step 6: Quality Checklist (Pre-PDF Generation)

- [ ] Korean text: All glyph rendering verified (особенно parentheses, special characters)
- [ ] Table alignment: Fact table, skill table, project tables all locked in place
- [ ] Page breaks: Fall between major sections, not mid-table
- [ ] Links: GitHub URL clickable and valid
- [ ] Metric accuracy: Every number cross-checked against original CV
- [ ] Spacing: No orphaned headers; consistent row padding (4-6px)
- [ ] Font: Body text readable at ~11-12pt, headers at 14-16pt
- [ ] Length: 2.5-3 pages (verified with `pdfinfo`)

---

## Step 7: PDF Generation (Not Executed in This Test)

Would execute (after HTML finalization):
```bash
node generate-pdf.mjs \
  /Users/danil/Public/career-ops/output/kakao/backend-engineer/danil-ten-korean-backend-resume.html \
  /Users/danil/Public/career-ops/output/kakao/backend-engineer/danil-ten-korean-backend-resume.pdf \
  --format=a4
```

Verification commands (not run):
```bash
pdfinfo /Users/danil/Public/career-ops/output/kakao/backend-engineer/danil-ten-korean-backend-resume.pdf
pdftoppm -png /Users/danil/Public/career-ops/output/kakao/backend-engineer/danil-ten-korean-backend-resume.pdf \
  /Users/danil/Public/career-ops/tmp/pdfs/kakao-resume
```

---

## Key Insights from Skill Invocation

The **korean-resume-builder skill** clarified:

1. **Multi-page is correct:** Danil's experience level and project depth justify 2.5-3 pages, not ATS one-page compression
2. **Reuse existing assets:** The bundled Jumpit template is production-ready; no need to rebuild HTML structure
3. **Reframe without inventing:** Backend focus is truthful (TripleH infrastructure is genuinely microservices-based); narrative lean is valid, not deceptive
4. **Data integrity:** Pull from `resumes/ai-engineer-cv.md`, `config/profile.yml`, and internal facts; no external source fabrication
5. **Korean styling rules:** System fonts, light gray headers, thin borders, generous padding — all covered in template
6. **Output organization:** Job-specific folder (`output/kakao/backend-engineer/`) maintains pipeline hygiene

---

## Deliverables Summary

**Without PDF generation (test scope):**
- ✅ Detailed approach document (this file)
- ✅ Identified source files: `resumes/ai-engineer-cv.md`, `config/profile.yml`, `modes/_profile.md`
- ✅ Template selection: Experienced developer pattern (multi-page)
- ✅ Content tailoring: Backend/microservices lean while maintaining truth
- ✅ Output path: `output/kakao/backend-engineer/`
- ✅ Quality checklist and verification steps documented

**If user confirms approach:**
1. Generate HTML from Jumpit template with translated/tailored content
2. Render PDF via `node generate-pdf.mjs --format=a4`
3. Verify page count, glyph rendering, spacing with `pdfinfo` and `pdftoppm`
4. User reviews PDF and adjusts content as needed

---

## Why This Approach Works for Kakao

- **Hiring context:** Kakao values engineers who ship infrastructure reliably; TripleH platform work directly demonstrates this
- **Language fit:** Korean audience expects domestic resume conventions (multi-page, table-driven, metrics-focused) — not ATS one-page
- **Microservices emphasis:** Kakao's microservices architecture aligns with Danil's TripleH platform and Ebit CI/CD automation
- **Backend foundation:** Despite AI background, Danil's FastAPI, PostgreSQL, and DevOps skills are core to the role
- **International team experience:** Kakao's global engineering culture values cross-functional collaboration — documented in profile

---

## Notes for Next Steps

- **Update `modes/_profile.md` if approach is approved:** Add Kakao-specific framing (backend vs. AI engineer narrative)
- **No changes to `config/profile.yml` needed:** Contact info, location, skills remain accurate
- **Consider `article-digest.md` enhancement:** If Danil has published Kakao-relevant case studies, portfolio links, or talks — surface them in project links
- **Post-PDF:** Add to `applications.md` tracker once user applies; reference this output path for future Kakao backend applications
