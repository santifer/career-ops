# Korean Resume for Kakao Backend Engineer Role
## Analysis & Approach (Without Specialized Skill)

**Date:** 2026-04-18
**Task:** Generate a Korean-style resume for Danil Ten applying to Kakao backend engineer role (microservices/cloud infrastructure focus)

---

## Current Situation

**Source Material:**
- English CV: `resumes/ai-engineer-cv.md` (1-page ATS format, ~690 words)
- Profile: `config/profile.yml` (Danil Ten, Seoul, F-4 visa, AI engineer background)
- Target Role: Backend Engineer at Kakao (microservices, cloud infrastructure emphasis)
- Location: Seoul (same city as Kakao HQ) — strong advantage

---

## Korean Resume Context & Requirements

### What Makes Korean Resumes Different

Korean employers (especially at enterprise tech companies like Kakao) expect resumes that differ significantly from ATS-optimized English formats:

1. **Format & Length**
   - Traditional Korean resumes (이력서) are typically 2-3 pages, not 1 page
   - More detailed experience descriptions with context
   - Specific dates in format: 연도.월 (YYYY.MM) — not ranges like "Mar 2026 — Present"
   - Often handwritten signature or formal stamp (not applicable in digital application, but relevant for understanding cultural context)

2. **Content Structure**
   - Chronological work history with full company context
   - Project descriptions with team size and your specific contribution
   - Educational timeline from high school forward (Korean resumes are comprehensive)
   - Skills organized by category with proficiency levels
   - Certifications and awards if applicable

3. **Language & Tone**
   - More formal Korean business language (존댓말/높임말)
   - Emphasis on teamwork, harmony, and company culture fit
   - Metrics are important but less bombastic than English CVs
   - "We achieved X" rather than "I did X" in some contexts

4. **Kakao-Specific Expectations**
   - Kakao values microservices architecture knowledge (your DevOps + Docker + Kubernetes skills are relevant)
   - Cloud platforms: AWS/Azure/GCP experience is critical for backend roles
   - Database design and scalability at enterprise scale
   - Open-source or portfolio contributions (Github presence is strong asset)
   - Communication in international teams (your trilingual ability is valuable)

---

## What This Approach Would Include (Without the Skill)

### Step 1: Content Analysis & Mapping

From your English CV, the most relevant sections for a **Kakao backend engineer** role are:

**Directly Relevant:**
- TripleH AI Engineer role → demonstrates FastAPI, PostgreSQL, scalable database design, 100K+ records, microservices thinking
- Ebit CI/CD and automation work → DevOps mindset, infrastructure thinking
- Technical Skills → Python, TypeScript, Docker, CI/CD, AWS/Azure/GCP, PostgreSQL, pytest

**Moderately Relevant:**
- AI/ML frameworks could be positioned as "scalability considerations"
- API design and REST endpoint engineering
- Code quality and testing culture

**Less Relevant for Backend Role:**
- LangChain, LLMs, and AI-specific tools (unless Kakao role has AI component)
- DeepLearning.AI testing (nice-to-have, but not backend-core)
- JobHunt AI project (full-stack, but emphasizes AI more than backend infrastructure)

### Step 2: Structural Transformation

**English Format (ATS):**
- 1 page, bullet points, keyword-dense, achievement-focused metrics

**Korean Format Approach:**
- 2-3 pages, paragraph + bullet hybrid, narrative flow, context-rich
- Section: 기본정보 (Personal Info: Name, Address, Contact, Birth Date if needed)
- Section: 학력 (Education: High school forward, with graduation dates in YYYY.MM format)
- Section: 경력 (Career: Detailed company roles, 2-3 sentences context + bullets per role)
- Section: 기술스택 (Technical Skills: Organized by category with proficiency)
- Section: 프로젝트 (Projects: Detailed project descriptions with team context)
- Section: 자격증 (Certifications: If applicable — not relevant for you currently)

### Step 3: Language Adaptation Examples

**English Version:**
> "Optimize prompts across agent workflows, reducing agent error rate by ~20% through systematic prompt engineering and iterative testing"

**Korean Approach Might Be:**
> "AI 에이전트 워크플로우 전반의 프롬프트 최적화를 통해 에이전트 에러율을 약 20% 감소시켰으며, 체계적인 프롬프트 엔지니어링과 반복적 테스팅을 통해 품질을 지속적으로 개선했습니다."

(Translation: "Optimized prompts across all AI agent workflows, reducing agent error rate by approximately 20%, and continuously improved quality through systematic prompt engineering and iterative testing.")

---

## Key Decisions to Make (User Input Needed)

1. **How much detail on AI experience?**
   - Kakao backend role might downplay AI focus
   - Option A: Reframe as "backend systems for AI agents" (emphasizes backend infrastructure)
   - Option B: Create a separate backend-focused variant of your resume
   - Option C: Keep full context but prioritize infrastructure aspects

2. **Education section:**
   - Include Moscow RTU experience (shows international background)
   - Highlight Kyungnam CS degree (recent, 2026 Feb)
   - Any relevant coursework in distributed systems, database design, or networking?

3. **Project selection for Kakao:**
   - TripleH platform: DEFINITELY include (microservices, scalability, database design)
   - JobHunt AI: Maybe include, but reframe to emphasize backend/infrastructure side
   - DeepLearning.AI testing: Less relevant unless explicitly in job description

4. **Proficiency levels:**
   - How would you rate: Python, TypeScript, Docker, Kubernetes, PostgreSQL, AWS/Azure/GCP?
   - Should be honest and specific for Korean context

---

## Challenges Without the Specialized Skill

1. **Proper Korean terminology** — Technical terms have specific Korean equivalents:
   - Microservices = 마이크로서비스 아키텍처
   - CI/CD = 지속적 통합/배포
   - RESTful API = REST API
   - Code review = 코드 리뷰
   - Cannot guarantee 100% idiomatic Korean business language without domain expertise

2. **Cultural framing** — What works in English CV doesn't translate:
   - Tone of "I did this" needs reframing toward collaborative language
   - Metrics presentation changes (20% improvement sounds different in Korean context)
   - Cannot optimize for Korean recruiter expectations without cultural knowledge

3. **Format standards** — Korean resume conventions are strict:
   - Exact date formatting, spacing, and section ordering matter
   - ATS systems in Korea have different keyword weighting
   - Cannot guarantee compliance with Kakao's ATS preferences

4. **Kakao-specific positioning** — Without insider knowledge:
   - Don't know exact emphasis on AI/ML vs. pure backend infrastructure
   - Don't know internal team structure or growth areas
   - Cannot optimize for Kakao's specific architectural philosophy (KAGE, Spring Boot conventions, etc.)

---

## Recommended Approach (General Knowledge Only)

### Manual Process Without Skill:

1. **Create `resumes/kakao-backend-korean-cv.md`** with:
   - Header: Your name in Korean + English, contact info
   - Sections in order: 기본정보 → 학력 → 경력 → 기술스택 → 프로젝트 → 추가정보
   - Dates in YYYY.MM format throughout
   - Paragraph format for role descriptions + bullet points for specific achievements
   - 2-3 pages when rendered

2. **Transform your TripleH experience** to lead with backend/infrastructure:
   ```
   Original focus: "Build, deploy, and maintain 20+ autonomous AI agents"
   Backend reframe: "Designed and maintained scalable cloud-native platform
                    supporting 20+ autonomous services, with 100K+ filesystem
                    records in production PostgreSQL database"
   ```

3. **Highlight database & systems work:**
   - PostgreSQL schema design (scalability considerations)
   - API endpoint engineering (15+ RESTful endpoints)
   - Code coverage and testing culture (~80%)
   - Infrastructure automation and containerization

4. **Technical Skills section** — order by relevance to backend:
   - Backend: Python, TypeScript, FastAPI, PostgreSQL, SQLAlchemy
   - DevOps: Docker, CI/CD, Git, AWS/Azure/GCP
   - Methodologies: Microservices architecture, OOP, REST APIs

5. **Create a **self-introduction letter** (자기소개서) separately:
   - 3-4 paragraphs in formal Korean
   - Why Kakao? (vision alignment, backend infrastructure impact)
   - Why you? (experience with scalable systems, cloud platforms, team player)
   - What you'll contribute (microservices expertise, rapid iteration, code quality)
   - Call to action

---

## Expected Output Structure (Without Skill)

```
resumes/kakao-backend-korean-cv.md
├─ 기본정보 (Personal Information)
├─ 학력 (Education)
├─ 경력 (Experience) ← EXPANDED with context
├─ 기술스택 (Technical Skills) ← Backend-prioritized
├─ 프로젝트 (Projects) ← Kakao-relevant projects highlighted
└─ 추가정보 (Additional Info: Languages, Awards, etc.)

interview-prep/kakao-backend-profile.md ← Interview research
interview-prep/kakao-backend-letter.md ← Self-introduction letter (자기소개서)

output/kakao-backend-cv.pdf ← Rendered PDF (would need template adaptation)
```

---

## Critical Limitations of General Knowledge Approach

1. **No Korean language AI assistance** — Relies on manual Korean drafting, likely contains grammar/tone issues
2. **No industry-specific terminology validation** — Tech terms might not match Kakao's internal preferences
3. **No ATS optimization for Korean systems** — Format might not parse correctly in Korean ATS
4. **No cultural expertise** — May miss subtle expectations around work style, hierarchy, team integration
5. **No Kakao-specific intelligence** — Cannot research Kakao's engineering culture, tech stack, or interview patterns
6. **No native speaker review** — Output would need professional Korean review before submission

---

## Why This Task Benefits from Specialized Skill

A Korean resume builder skill would provide:

1. **Native Korean language generation** with proper business tone and terminology
2. **Kakao-specific research** — job description parsing, role analysis, company culture alignment
3. **Korean ATS optimization** — proper formatting, keyword weighting for Korean systems
4. **Cultural framing** — automatically reposition your background for Korean recruiter expectations
5. **Self-introduction letter generation** (자기소개서) — critical for Korean applications
6. **Portfolio integration** — link to GitHub, projects, with Korean context
7. **Interview prep** — cultural briefing on Kakao interview style, expected responses
8. **Version control** — track multiple tailored resume variants for different Kakao teams

---

## Summary

**Without a specialized skill,** you CAN generate a Korean resume by:
- Manually structuring your content in Korean format
- Reframing your experience for backend focus
- Using Google Translate + manual review (not ideal, but workable)
- Following standard Korean resume conventions from online templates

**You CANNOT (reliably):**
- Ensure proper Korean business language and cultural framing
- Optimize for Kakao's specific expectations and ATS
- Generate a compelling 자기소개서 (self-introduction letter) that wins with Korean recruiters
- Research Kakao's engineering culture and tailor positioning
- Guarantee that the resume will be taken seriously by Korean hiring managers

**Recommendation:** For a competitive application to Kakao (tier-1 Korean tech company), this task would significantly benefit from the specialized korean-resume-builder skill, which can handle all the above in one workflow.

---

**Generated:** 2026-04-18 | **Status:** Analysis only (no resume generated without skill invocation)
