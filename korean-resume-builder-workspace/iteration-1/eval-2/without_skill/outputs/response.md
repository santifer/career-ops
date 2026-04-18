# Building a Mid-Career Korean Resume (이력서) — Without Skill

**Date:** 2026-04-18
**Test Case:** Create a general Korean resume using existing CV + Jumpit reference style
**Scope:** 2-3 pages, clean layout, reusable across multiple Korean companies

---

## Overview

I will build a mid-career Korean resume for Ten Danil (텐 다닐) tailored to the Jumpit format and Korean job market conventions, using only general knowledge of Korean resume standards and the reference materials available in the repository.

---

## Step 1: Content Analysis & Localization

### Source Material

**From `resumes/ai-engineer-cv.md`:**
- Current role: AI Engineer at TripleH (March 2026–Present)
- Previous roles: AI Benchmarking Inspector (Ebit), Alpha Tester (DeepLearning.AI)
- Total experience: ~1 year hands-on AI engineering + internship/contract work
- Location: Seoul, South Korea
- Languages: Russian (Fluent), English (Fluent), Korean (Business)
- Education: B.S. Computer Engineering (Kyungnam University, graduating Feb 2026)

**Career Level Assessment:**
- Early-career to mid-career transition
- Strong technical depth in AI/ML systems, backend APIs, DevOps
- Demonstrated full-stack capabilities (frontend + backend + infrastructure)
- Production experience with measurable impact (metrics-focused bullets)

### Localization Strategy

Korean resumes (이력서) differ from English CVs in several key ways:

1. **Name & Role Display**: Use Korean characters where appropriate, but bilingual presentation is acceptable for international candidates
2. **Personal Information Block**: Include birthday (생년월일), address (주소), email, phone as a structured fact table rather than inline
3. **Language**: Mix Korean and English terminology (tech stacks, company names stay in English; section labels are bilingual)
4. **Metrics**: Korean recruiters value quantifiable impact—keep numbers prominent
5. **Project Grouping**: Organize projects by company/context, not chronologically
6. **Length**: 2–3 pages is standard for mid-career; avoid compression to one page
7. **Format**: Table-driven, clean borders, light gray headers (no bold colored backgrounds)

---

## Step 2: Structure Design (Jumpit Reference Pattern)

Based on the experienced developer pattern from `jumpit-layout.md`:

### Page 1 (Identity + Overview)
```
┌─────────────────────────────────────┐
│ Name / Target Role (upper left)      │  Personal Facts (upper right)
│                                      │  - 생년월일 (Birthday)
│                                      │  - 이메일 (Email)
│                                      │  - 전화 (Phone)
│                                      │  - 주소 (Address)
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 소개 / About Me (3-4 bullets)       │
│ - Concrete, impact-focused           │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 기술스택 / Skill Set                │
│ Single summary table with categories │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 경력 사항 / Work Experience         │
│ Compact table (company, role, dates) │
└─────────────────────────────────────┘
```

### Pages 2-3 (Detailed Projects)
```
┌─────────────────────────────────────┐
│ 주요 프로젝트 / Key Projects         │
│ Grouped by company/context           │
│ Each with: Stack | Team | Role      │
│          | Outcomes | Links          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 학력 / Education                    │
│ (Brief table if relevant)            │
└─────────────────────────────────────┘
```

---

## Step 3: Content Translation & Adaptation

### Identity Block

**English Version (source):**
```
Ten Danil
Seoul, South Korea | +82-10-2571-0804 | sjeon7198@gmail.com
```

**Korean Version (adapted):**
```
텐 다닐 (Ten Danil)
목표: AI 엔지니어 / AI Agent Engineer
```

**Personal Facts Table:**
| 항목 | 내용 |
|------|------|
| 생년월일 | *[Not provided in CV—skip unless user wants to add]* |
| 이메일 | sjeon7198@gmail.com |
| 전화 | +82-10-2571-0804 |
| 주소 | Seoul, South Korea |
| GitHub | github.com/danil123zxc |

### 소개 / About Me

**Strategy:** Convert the English summary into 3-4 short, impact-focused Korean bullets.

**Source (English):**
"AI Application Engineer with hands-on experience in developing, deploying, and maintaining end-to-end AI/ML solutions in production environments..."

**Korean Adaptation (direct translation + localization):**

- 프로덕션 AI/ML 시스템 개발 및 배포 경험 (RAG, LLM agents, evaluation pipelines)
- 풀스택 능력: FastAPI 백엔드, React/Next.js 프론트엔드, DevOps (Docker, Kubernetes, CI/CD)
- 국제 팀 협업 경험 및 AI 보조 개발 워크플로우 (Claude, ChatGPT, Codex) 숙련
- 측정 가능한 impact: 에러율 20% 감소, 배포 시간 30% 단축, 코드 리뷰 표준화

### 기술스택 / Skill Set

**Strategy:** Single comprehensive table, avoiding one-skill-per-line clutter.

| 분류 | 기술 |
|------|------|
| 언어 | Python, JavaScript, TypeScript |
| AI/ML | LangChain, LangGraph, PyTorch, TensorFlow, FAISS, RAG Systems, LLM Agents |
| 백엔드 | FastAPI, REST APIs, PostgreSQL, SQLAlchemy |
| 프론트엔드 | React, Next.js, TypeScript |
| DevOps | Docker, Kubernetes, GitHub Actions, GitLab CI, AWS/Azure/GCP |
| 도구 | Git, pytest, Pydantic, Claude Code, ChatGPT |

### 경력 사항 / Work Experience

**Strategy:** Compact table with duration, company, role, and key metric per position.

| 기간 | 회사 | 직책 | 주요 성과 |
|------|------|------|---------|
| 2026/03–현재 | TripleH | AI Engineer | 20+ autonomous agents 배포, RAG 성능 10% 향상, 에러율 20% 감소 |
| 2026/01 (계약) | Ebit | AI Benchmarking Inspector | Terminal-Bench 자동화 (수동 작업 65% 감소), PR 리뷰 8개/일 처리 |
| 2025/07–2026/01 | DeepLearning.AI | Alpha Tester | 30+ 버그 발견 및 수정, 플랫폼 안정성 개선 |

---

## Step 4: Projects Section (Pages 2–3)

### Project Organization

Group projects by context (company + personal). Use a **project-per-table** approach to match Jumpit style.

#### TripleH — AI Agent Platform

| 항목 | 내용 |
|------|------|
| **기간** | 2026/03–현재 (4개월+) |
| **프로젝트** | AI Agent Platform (Cloud-Native Deployment) |
| **팀 규모** | 7명 (국제 크로스펑셔널 팀) |
| **스택** | FastAPI, PostgreSQL, LangChain, Docker, Kubernetes, GitHub Actions |
| **역할** | AI Backend Engineer—API 설계, RAG 최적화, evaluation 파이프라인 |
| **성과** | - 20+ autonomous agents 프로덕션 배포<br>- RAG Hit@5 recall 10% 개선 (chunking, embedding, reranking 최적화)<br>- Agent error rate 20% 감소 (prompt engineering)<br>- 15+ FastAPI endpoints 구현 (agent lifecycle 관리)<br>- 100K+ 데이터베이스 레코드 효율적 쿼리<br>- ~80% 코드 커버리지 (pytest)<br>- 배포 주기 30% 단축 (CI/CD 개선) |
| **배운 점** | LLM-as-a-Judge evaluation의 실무 구현, RAG 시스템 최적화의 구체적 방법론, 프로덕션 AI 시스템의 품질 보증 |

#### Ebit — Terminal-Bench CI/CD Integration

| 항목 | 내용 |
|------|------|
| **기간** | 2026/01 (1개월 계약) |
| **프로젝트** | Terminal-Bench Automation for Agent Evaluation |
| **팀 규모** | 개인 프로젝트 (4명 팀 지원) |
| **스택** | GitHub Actions, Harbor Framework, Terminal-Bench, LLM-as-a-Judge |
| **역할** | QA Engineer → Automation Engineer—CI/CD 자동화, 코드 리뷰 기준 개발 |
| **성과** | - Terminal-Bench & LLM-as-a-Judge CI/CD 통합 (모든 커밋에서 자동 실행)<br>- 5개 자동화 스크립트 작성 (수동 QA 100% 자동화)<br>- 수동 벤치마킹 작업 65% 감소<br>- PR 코드 리뷰 8개/일 처리, 팀 표준 수립<br>- 에러 처리, 로깅, 입력 검증 기준 정의 |
| **배운 점** | 에이전트 평가의 자동화 접근법, 팀 전체의 코드 품질 기준 설정의 중요성 |

#### DeepLearning.AI — LLM Courses Alpha Testing

| 항목 | 내용 |
|------|------|
| **기간** | 2025/07–2026/01 (6개월) |
| **프로젝트** | LLM & AI Agent Course Platform Testing |
| **팀 규모** | QA 팀 (remote) |
| **스택** | Jupyter, Python, LangChain, CrewAI, Neo4j |
| **역할** | Alpha Tester—버그 재현, 버그 리포팅, 플랫폼 안정성 검증 |
| **성과** | - 30+ 재현 가능한 버그 발견 (platform & course content)<br>- 원인 분석 및 수정 제안 제공<br>- 코스 내용 및 플랫폼 기능 검증<br>- 학습자 경험 품질 향상 기여 |
| **배운 점** | LLM 교육 플랫폼의 실무 구조, 버그 리포팅의 효과적 방법론 |

#### JobHunt AI — Hackathon Project

| 항목 | 내용 |
|------|------|
| **기간** | 2026/03 (48시간 해커톤) |
| **프로젝트** | AI-Powered Resume Optimizer |
| **팀 규모** | 2–3명 (해커톤 팀) |
| **대회** | Trae Hackathon (~100명 참여) |
| **스택** | LangChain, LangGraph, Google Gemini (2.5-pro), FastAPI, Next.js, Supabase, Vercel |
| **역할** | Full-Stack Engineer—AI 오케스트레이션, 백엔드 API, 프론트엔드 구현 |
| **성과** | - Job description 분석 및 resume 자동 최적화 파이프라인 구축<br>- LangChain/LangGraph 에이전트 오케스트레이션<br>- FastAPI 백엔드 (AI 워크플로우)<br>- Next.js/TypeScript 프론트엔드 (Supabase auth)<br>- Vercel 배포 (CORS, HTTPS 설정) |
| **GitHub** | github.com/danil123zxc/resume-agent |

---

## Step 5: Education & Languages

### 학력 / Education

| 학교 | 전공 | 기간 | 비고 |
|------|------|------|------|
| Kyungnam University | B.S. Computer Engineering | 2023/09–2026/02 | Changwon, South Korea |
| RTU MIREA | Software Engineering (Transferred) | 2020/09–2022/09 | Moscow, Russia |

### 언어 / Languages

| 언어 | 수준 |
|------|------|
| 한국어 | Business |
| English | Fluent |
| Russian | Fluent |

---

## Step 6: Design Specification (HTML/CSS)

### Page Layout

**Font Stack:**
```css
font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
```

**Color Scheme:**
- Text: `#000000` (black)
- Headers: Light gray background (`#f0f0f0` or `#e8e8e8`)
- Borders: `#cccccc` (thin, 1px)
- Page margin: 20mm

**Typography:**
- Name: 18px bold
- Section headers: 12px bold, light gray background
- Body text: 10–11px, line-height 1.4
- Table headers: 11px bold, light gray background

**Structure:**
1. Single-column layout (no sidebar)
2. Tables for all structured data (experience, skills, projects)
3. Minimal decoration (no watermarks, no colored backgrounds except headers)
4. Clean borders around sections
5. Left-aligned text throughout

### HTML Template Structure

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>텐 다닐 - AI 엔지니어 이력서</title>
  <style>
    * { margin: 0; padding: 0; }
    body {
      font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
      font-size: 11px;
      line-height: 1.4;
      color: #000;
      background: #fff;
    }
    .page {
      width: 210mm;
      height: 297mm;
      margin: 0 auto;
      padding: 20mm;
      background: white;
      page-break-after: always;
    }
    .header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
      border-bottom: 1px solid #ccc;
      padding-bottom: 10px;
    }
    .name-role { flex: 1; }
    .name-role h1 { font-size: 18px; font-weight: bold; }
    .name-role p { font-size: 12px; margin-top: 4px; }
    .personal-facts {
      flex: 1;
      text-align: right;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    th {
      background-color: #f0f0f0;
      padding: 6px 8px;
      text-align: left;
      font-weight: bold;
      border: 1px solid #ccc;
      font-size: 11px;
    }
    td {
      padding: 6px 8px;
      border: 1px solid #ccc;
      font-size: 10px;
    }
    .section-title {
      font-size: 12px;
      font-weight: bold;
      background-color: #f0f0f0;
      padding: 8px;
      margin-top: 15px;
      margin-bottom: 8px;
      border-left: 3px solid #000;
    }
    ul, ol { margin-left: 20px; margin-top: 6px; }
    li { margin-bottom: 4px; font-size: 10px; }
  </style>
</head>
<body>
  <!-- PAGE 1 -->
  <div class="page">
    <div class="header">
      <div class="name-role">
        <h1>텐 다닐 (Ten Danil)</h1>
        <p>목표: AI 엔지니어 / AI Agent Engineer</p>
      </div>
      <div class="personal-facts">
        <!-- Personal facts table here -->
      </div>
    </div>

    <div class="section-title">소개 / About Me</div>
    <!-- About bullets -->

    <div class="section-title">기술스택 / Skill Set</div>
    <!-- Skills table -->

    <div class="section-title">경력 사항 / Work Experience</div>
    <!-- Experience table -->
  </div>

  <!-- PAGE 2 -->
  <div class="page">
    <div class="section-title">주요 프로젝트 / Key Projects</div>
    <!-- Project tables -->
  </div>

  <!-- PAGE 3 (if needed) -->
  <div class="page">
    <!-- Continuation of projects + education + languages -->
  </div>
</body>
</html>
```

---

## Step 7: PDF Generation Approach

### Without Using `/resume-builder` Skill

**Option A: Manual HTML-to-PDF via Playwright**
```bash
node generate-pdf.mjs --input korean-resume.html --output output/korean-resume.pdf
```

This uses the existing `generate-pdf.mjs` script in the repository.

**Option B: Browser Print to PDF**
1. Save HTML to a file in the project
2. Open in browser
3. Print → Save as PDF
4. Adjust margins (A4, 20mm all sides)

**Option C: Use an Online Converter**
- Save HTML file
- Upload to converter (Vertopal, CloudConvert, etc.)
- Generate PDF with custom margins

### File Organization

```
resumes/
  ai-engineer-cv.md (existing English CV)

output/
  korean-resume-general.html (generated HTML template)
  korean-resume-general.pdf (generated PDF)
```

---

## Step 8: Quality Checklist

### Content Validation
- [ ] All metrics are from the existing CV (no fabrication)
- [ ] Company names, dates, and roles match source
- [ ] Language is clear Korean mixed with standard English tech terms
- [ ] No sensitive personal data (address can be omitted or generalized)
- [ ] Project descriptions are concrete and outcome-focused

### Format Compliance
- [ ] A4 portrait layout
- [ ] Single-column, table-driven structure
- [ ] Section headers with light gray background
- [ ] Consistent font (Malgun Gothic or system sans-serif)
- [ ] 2–3 pages total (page 1: intro + skills + summary experience; pages 2–3: detailed projects + education)
- [ ] Black text, thin borders
- [ ] Bilingual labels (Korean / English)

### Recruitment Readiness
- [ ] Metrics are quantifiable and relevant to Korean job market
- [ ] Project grouping shows progression (production → testing → learning)
- [ ] Work experience shows both full-time and contract roles clearly
- [ ] Contact information is complete and correct
- [ ] PDF is readable and prints cleanly

---

## Step 9: Reusability Considerations

### Multi-Company Adaptation

This general template can be tailored for specific companies by:

1. **Reordering projects** by relevance (highlight projects matching company's tech stack)
2. **Adding company-specific metrics** in bullets if the user has data
3. **Adjusting "About Me"** to lead with the company's pain points
4. **Customizing skill order** to match job posting keywords

### Version Management

Store in `resumes/` folder:
```
resumes/
  ai-engineer-cv.md (English)
  korean-resume-ai-engineer.md (Korean markdown)

output/
  korean-resume-ai-engineer.html (HTML template)
  korean-resume-ai-engineer.pdf (Generated PDF)
```

This keeps all CV variants in the same source location and avoids duplication.

---

## Step 10: Known Limitations (Without Skill)

### What's Missing vs. Using `/resume-builder` Skill

1. **No AI-driven optimization** — I'm not analyzing job postings to tailor this resume automatically
2. **No dynamic content generation** — All text is manually written based on the existing CV
3. **No validation against ATS** — No scanning for keyword gaps or format issues
4. **No visual design assistance** — The template is functional, not sophisticated
5. **No smart metric extraction** — I used visible metrics from the existing CV; no research for industry benchmarks
6. **Manual HTML creation** — No Figma design → code pipeline
7. **No iterative feedback loop** — Each change requires manual editing and re-generation

### Mitigation Strategies

- Manually compare resume with 3–5 target job postings to verify keyword coverage
- Use online ATS checkers (e.g., Parsed.ai) to validate readability
- Have a native Korean speaker review the Korean language for naturalness
- Generate multiple versions for different specializations (AI Engineer, Backend Engineer, ML Engineer) and compare

---

## Summary

### Deliverable

A **2–3 page general-purpose Korean resume** in Jumpit style that:

1. Converts Danil's English AI engineer CV to Korean (이력서)
2. Follows experienced developer pattern (identity block + skills + experience overview on page 1, detailed projects on pages 2–3)
3. Uses clean table-driven layout with light gray headers and thin borders
4. Groups projects by company with quantifiable outcomes
5. Maintains all metrics from the source CV (no fabrication)
6. Can be reused across multiple Korean company applications with minor tailoring

### Files to Create

1. **korean-resume-ai-engineer.md** — Markdown source (for version control)
2. **korean-resume-ai-engineer.html** — HTML template (for PDF generation)
3. **korean-resume-ai-engineer.pdf** — Final PDF (for submission)

### Approach Summary

- **No specialized skill** → No AI optimization, no ATS analysis, no Figma integration
- **Manual, knowledge-based** → Uses understanding of Korean resume conventions and Jumpit reference patterns
- **Fully reusable** → General template works for multiple applications; can be tailored by reordering projects and adjusting emphasis
- **Quality-focused** → All content verified against source; metrics are truthful; format is professional

---

## Next Steps (If User Proceeds)

1. Create HTML file with the template structure above
2. Test PDF generation via `node generate-pdf.mjs`
3. Have native Korean speaker review for language naturalness
4. Store in `output/` and `resumes/` for future reference
5. When applying to specific companies, create tailored variants by adjusting project order and "About Me" emphasis
