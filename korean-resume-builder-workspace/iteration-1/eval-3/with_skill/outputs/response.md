# Korean Resume Builder Decision: Naver Senior Full Stack Developer Role

## Executive Summary

**YES, you should use the Korean resume builder for this role.** A Korean-language job posting from a major Korean company (Naver) signals that they expect a Korean-style resume formatted to Korean hiring norms. Using the korean-resume-builder skill is appropriate here, and here's why.

---

## Decision Framework: When to Use korean-resume-builder

The korean-resume-builder skill is designed to be used when:

1. **Job posting is in Korean** ✅ (Your case: Naver careers page in Korean)
2. **Target company is Korean-based and hiring locally** ✅ (Naver is Korea's largest tech company)
3. **Role targets the Korean job market** ✅ (On-site or hybrid in Korea, or targeting Korean tech companies)
4. **Candidate is comfortable with Korean language and market norms** ✅ (You're based in Seoul with F-4 visa; profile is already configured for Korea)
5. **Multi-page A4 format is acceptable or preferred** ✅ (Korean resumes typically run 2-4 pages; ATS concerns don't apply to Korean recruiting)

**When NOT to use korean-resume-builder:**
- If the posting is in English but the company is Korean (→ use default `modes/pdf.md`)
- If you're applying to a global role with English-language hiring (→ use default one-page ATS CV)
- If visual design is a constraint (→ stick to the Jumpit-style reference layouts the skill provides)

---

## Your Situation Analysis

### Profile Fit
- **Location:** Seoul, South Korea ✅
- **Visa Status:** F-4 visa (no sponsorship needed) ✅
- **Target Roles:** AI Engineer, AI Agent Engineer, Full Stack Developer (secondary fit) ✅
- **Experience Level:** Mid-level engineer (TripleH AI Engineer + Ebit contract + DeepLearning.AI alpha tester) ✅
- **Language:** Comfortable in Korean (based on profile and visa status) ✅

### Role Fit
- **Company:** Naver (top-tier Korean tech, known for quality hiring process)
- **Role:** Senior Full Stack Developer
- **Language:** Korean job posting → expect Korean resume expected
- **Your fit:** Your CV shows backend (FastAPI, PostgreSQL), frontend (React, Next.js), DevOps (Docker, CI/CD), and cloud experience. Full Stack fit is **secondary** but defensible if they value AI/ML depth.

### The Korean Resume Market Signal
When a major Korean company posts a job exclusively in Korean, they're signaling:
1. They expect resumes in Korean format (이력서)
2. They're hiring for a locally-based role (not remote global)
3. They value candidates who understand Korean business culture and norms
4. A standard US-style one-page ATS CV will likely be filtered out or undervalued

Using the korean-resume-builder skill acknowledges these expectations and gives you a better chance of passing the initial screen.

---

## Before You Proceed: Clarifying Questions

Before diving into the resume generation, confirm these details:

### 1. **CV Format & Length**
- **Question:** Do you want a one-page condensed resume or the full 2-4 page Jumpit-style format?
- **Guidance:** For a "Senior" role at a top-tier company like Naver, a 2-3 page resume is appropriate. It gives you space to highlight your TripleH AI platform work, RAG optimization, and evaluation systems. Stick with the skill's default (2-4 pages).

### 2. **Language & Localization**
- **Question:** Should the resume be entirely in Korean, or bilingual (Korean + English for company/technical names)?
- **Guidance:** The korean-resume-builder skill uses bilingual section labels where the reference templates do (e.g., "About Me / 자기소개", company names in English, tech stack in English). This is standard for Korean tech resumes and makes scanning easier for international readers.

### 3. **Role Positioning**
- **Question:** How do you want to position yourself for "Senior Full Stack Developer"?
  - As a full-stack engineer with AI specialization?
  - As an AI engineer who happens to have full-stack chops?
  - As a backend specialist with frontend capability?
- **Guidance:** Your background is strongest in backend + AI. If Naver values AI/ML depth for this role, lean into that. If it's truly a pure full-stack role, you may need to emphasize your React/Next.js work more (currently secondary in your CV).

### 4. **CV Source Availability**
- **Question:** Do you have your current CV ready in `resumes/ai-engineer-cv.md`?
- **Status:** ✅ Yes, found at `/Users/danil/Public/career-ops/resumes/ai-engineer-cv.md`. The skill will use this as the source material.

### 5. **Target Output Path**
- **Question:** Should the resume be saved to a company/role-specific path, or a generic Korean-resume folder?
- **Guidance:** Following the skill's convention, I'd recommend: `/Users/danil/Public/career-ops/output/naver/senior-fullstack-developer/`
  - This keeps it organized for future revisions and makes it easy to find if Naver reaches out with follow-ups.

---

## The korean-resume-builder Workflow (High Level)

Once you're ready, here's what the skill will do:

### Step 1: Gather Source Facts
- Read your `resumes/ai-engineer-cv.md`
- Read `config/profile.yml` for personal details (name, contact, location)
- Read `modes/_profile.md` and `article-digest.md` if they contain Naver-specific notes or project proof points

### Step 2: Choose Layout Variant
- You're "experienced" (mid-level, 1+ years at TripleH, contract work, alpha testing)
- Layout: header → About Me → skill table → career summary table on page 1; detailed project pages after
- Default: 2-3 pages expected

### Step 3: Translate & Compress into Korean
- Convert US-style narrative bullets into concise Korean fragments
- Keep metrics factual (10% RAG recall improvement, 20% error reduction, etc.)
- Translate company/role titles to Korean where standard; keep technical terms in English
- Example:
  - English: "Build, deploy, and maintain 20+ autonomous AI agents on a cloud-native platform"
  - Korean: "클라우드 네이티브 플랫폼에서 20개 이상의 자율 AI 에이전트 개발 및 배포 / 유지보수"

### Step 4: Fill the HTML Template
- Use `assets/jumpit-korean-resume-template.html` as the starting point
- Replace placeholders with real sections: header, about, skills, career, projects
- Delete unused template branches (don't leave empty tables)
- Ensure each page fits cleanly in an A4 container

### Step 5: Generate PDF
- Run `node generate-pdf.mjs output/naver/senior-fullstack-developer/resume.html --format=a4`
- Output: `output/naver/senior-fullstack-developer/resume.pdf`

### Step 6: Verify & Iterate
- Check page count (expect 2-3 pages)
- Verify Korean glyphs render correctly (use `pdftoppm -png` if needed)
- Confirm no empty rows, proper spacing, clean page breaks
- Test PDF in Korean resume portals (Jumpit, SaraminHR, etc.) if needed

---

## Key Content Decisions for Naver Role

### What to Emphasize
Based on the "Senior Full Stack Developer" title, I'd prioritize:
1. **Backend depth:** FastAPI, PostgreSQL, API design, microservices (TripleH experience)
2. **Full-stack capability:** React/Next.js frontend (JobHunt AI project), FastAPI backend
3. **Reliability & scale:** Code coverage (80%), test practices, CI/CD automation (Ebit contract)
4. **Cloud & DevOps:** Docker, Kubernetes, GitHub Actions, AWS/Azure/GCP (TripleH & Ebit)
5. **Problem-solving:** RAG optimization, evaluation systems, prompt engineering (AI depth)

### What to De-emphasize or Frame Differently
- "AI Agent Platform" → position as "scalable microservices platform" + "AI feature set"
- "Alpha testing" → position as "validation engineer" or "QA engineer" (more mature framing for "Senior")
- "Vibe coding" → shift focus to "AI-assisted development with Claude Code" (more professional for Korean hiring)

### What to Add (if you haven't already)
- **Metrics:** Do you have numbers for TripleH platform scale? (Users? Agents created? Uptime?)
- **Leadership signals:** Any mentoring, code review ownership, or process improvements you led?
- **Korean market knowledge:** Any awareness of Korean tech trends, regulations, or companies you can signal?

---

## Comparison: korean-resume-builder vs. Other Approaches

| Approach | When to Use | Trade-offs |
|----------|------------|-----------|
| **korean-resume-builder** (this skill) | Korean job posting, Korean company, multi-page OK | Requires Korean translation; 2-4 pages; not ATS-optimized |
| **resume-builder** (default CV mode) | English posting, global company, ATS scanning important | One-page, English-only, optimized for ATS scanners |
| **resume-tailor** skill | Need to customize for specific JD keywords | Works on top of existing CV, doesn't handle Korean localization |
| **Manual Korean resume** | Full control, custom design | Time-consuming; easy to miss Korean market conventions |

**For your Naver case:** korean-resume-builder is the right choice because it handles the Korean localization, respects market conventions, and saves you time vs. manual translation.

---

## Red Flags & Considerations

### ⚠️ Potential Concern: "Senior" Title vs. Your Experience
- Your TripleH role is listed as "AI Engineer" (no seniority prefix)
- Ebit was a short contract
- Naver's "Senior Full Stack Developer" may expect 5+ years of full-stack depth
- **Mitigation:** Emphasize your FastAPI backend work, React/Next.js projects, DevOps contribution, and the breadth of TripleH platform (infrastructure, testing, DevOps). Position yourself as "mid-level trending senior" if the role allows.

### ⚠️ Potential Concern: "Full Stack" Emphasis
- Your background is strongest in backend + AI
- Full-stack breadth may be a secondary fit
- **Mitigation:** If the role truly requires equal backend + frontend depth, you may need to elaborate on JobHunt AI (full-stack hackathon project) or other frontend work. Otherwise, reframe as "backend engineer with full-stack capability."

### ⚠️ Potential Concern: Korean Market Hiring Timeline
- Korean companies often move fast (2-3 week interview cycles)
- If selected, you may need to respond quickly to interview invitations
- **Preparation:** Have your interview story bank ready (TripleH projects, Ebit process improvements, alpha testing findings)

---

## Next Steps

### If You Want to Proceed:

1. **Confirm the clarifying questions above** (format, language, positioning, etc.)
2. **Check your CV source:** Ensure `resumes/ai-engineer-cv.md` is current and includes JobHunt AI project details
3. **Prepare Naver-specific research:** (optional but recommended)
   - Review the actual job posting for keywords and role specifics
   - Check if Naver has a specific resume format or portal requirements
   - Note any company-specific skills or culture signals you want to address
4. **Invoke the korean-resume-builder skill** with the following inputs:
   - Company: Naver
   - Role: Senior Full Stack Developer
   - Format: 2-3 page A4 Jumpit-style
   - Language: Korean + English (bilingual for technical terms)
   - Output path: `output/naver/senior-fullstack-developer/`
5. **Review the generated PDF** for accuracy, formatting, and tone
6. **Submit to Naver careers portal** once you're satisfied

### If You Want to Skip the Korean Resume:

- Use the default `resume-builder` or `resume-tailor` skill to generate a one-page English CV
- Note: You may be filtered out by Korean-speaking recruiters if they expect Korean-formatted resumes
- Only viable if Naver has an English-language application track (unlikely for a Korean posting)

---

## Summary: Should You Use korean-resume-builder?

**YES.** Here's the final checklist:

- ✅ Job posting is in Korean
- ✅ Company is Korean-based (Naver)
- ✅ You're located in Korea and have proper visa status
- ✅ Multi-page resume is acceptable for Korean market
- ✅ Your CV has solid depth (backend, AI, full-stack capability)
- ✅ The skill handles Korean localization, market conventions, and formatting
- ✅ Using it signals to Naver that you understand Korean hiring norms

**The korean-resume-builder skill is designed exactly for this scenario.** It will save you time on translation, ensure formatting matches Korean market expectations, and increase your chances of passing the initial resume screen at a top-tier company.

---

## Questions for You to Answer

Before I generate the resume, please clarify:

1. **Do you want a 2-page or 3-page resume?** (2 if tight on space, 3 if you want to detail more projects)
2. **Any Naver-specific projects or experience** you want to highlight that aren't in your current CV?
3. **For the "Senior" positioning:** should I emphasize breadth (full-stack at scale) or depth (backend excellence + AI)?
4. **Bilingual (Korean + English for tech terms)** or fully Korean?

Once you confirm, I can invoke the korean-resume-builder skill and generate a polished, market-ready resume for the Naver role.

---

**Generated with korean-resume-builder skill guidance**
**Decision Framework:** Naver Senior Full Stack Developer
**Date:** 2026-04-18
