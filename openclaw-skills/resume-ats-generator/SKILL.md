---
name: resume-ats-generator
description: Generate complete, ATS-optimised job application materials with PDF export, cover letters, and screening answers. Includes archetype detection, keyword injection, 6-second recruiter scan optimisation, and anti-AI voice checks. Use when user requests (1) create/tailor resume, (2) write cover letter, (3) prepare application materials, (4) mentions "apply" + "resume/cover letter/JD", or (5) needs ATS-compliant PDF.
---

# Resume ATS Generator

Generate ATS-optimised resume PDFs, cover letters, screening answers, and form-fill snippets from a job description and user profile.

## Data Sources

| Source | Path |
|--------|------|
| Job Profile | `data/job_profile.json` |
| Existing PDFs | `data/*.pdf` |
| PDF Generator | `scripts/generate_resume_pdf.py` |

## Reference Files — Read When Needed

| File | When to Read |
|------|-------------|
| `references/ats-optimization.md` | Before generating resume — ATS keyword rules, formatting constraints |
| `references/best-practices.md` | Before writing content — quality standards, bullet-point structure |
| `references/resume-templates.md` | When choosing format — chronological/functional/combination structures |
| `references/resume-generation-workflow.md` | During Phase 4 — JSON schema, PDF generation commands, page verification, role-specific filtering, form-fill snippet |
| `references/cover-letter-framework.md` | Before Phase 5 — structure, writing rules, anti-AI voice patterns |
| `references/anti-ai-voice-guide.md` | Before delivering any text — checklist to eliminate AI-sounding language |
| `references/screening_qa_framework.md` | During Phase 6 — role-specific screening answer templates |
| `references/user-profile-reference.md` | When verifying user data — full profile details |

## Core Workflow

### Phase 1 — Verify User Data

1. Read `job_profile.json` and cross-reference with existing PDFs
2. Check: graduation year, degree, employment dates, contact info, work authorisation
3. If discrepancies found: **STOP**, flag to user, do not proceed until confirmed
4. Update `job_profile.json` with verified data

### Phase 2 — Collect Inputs

Required: Job Description (full text or URL)
Optional: company name, hiring manager name, format preference (default: chronological)
Auto-detect variant from JD: `embedded` | `fullstack` | `iot` | `general`

### Phase 3 — Analyse Job Description

Extract: role title, company, required skills (exact phrasing), preferred skills, responsibilities, culture signals, red flags (visa requirements, experience mismatches). Use exact phrases from JD for ATS keyword matching.

### Phase 3b — Archetype Detection

Classify the JD into one (or hybrid of two) archetypes:

| Archetype | Key signals | Framing angle |
|-----------|-------------|---------------|
| AI Platform / LLMOps | "observability", "evals", "pipelines", "monitoring", "reliability" | Infrastructure builder, system reliability |
| Agentic / Automation | "agent", "HITL", "orchestration", "workflow", "multi-agent" | Automation architect, workflow design |
| Technical AI PM | "PRD", "roadmap", "discovery", "stakeholder", "product manager" | Cross-functional translator, product sense |
| AI Solutions Architect | "architecture", "enterprise", "integration", "design", "systems" | System-level thinker, integration expert |
| AI Forward Deployed | "client-facing", "deploy", "prototype", "fast delivery", "field" | Hands-on builder, rapid prototyping |
| AI Transformation | "change management", "adoption", "enablement", "transformation" | Change agent, organisational impact |

After detecting archetype, adapt section emphasis and proof point selection accordingly.

### Phase 3c — Keyword Injection Strategy

1. Extract 15-20 keywords from the JD (exact phrases: tools, frameworks, methodologies, domain terms)
2. Map each keyword to existing achievements in the candidate's profile
3. Rewrite achievement bullets using JD vocabulary — **NEVER invent skills or metrics the candidate does not have**
4. Legitimate reformulation examples:
   - CV: "LLM workflows with retrieval" → JD wants "RAG pipelines" → "RAG pipeline design and LLM orchestration workflows"
   - CV: "observability, evals" → JD wants "MLOps" → "MLOps and observability: evals, error handling, cost monitoring"
   - CV: "collaborated with team" → JD wants "stakeholder management" → "stakeholder management across engineering, operations, and business"
5. Distribute keywords: Summary (top 5), first bullet of each role, Skills section, Competencies grid

### Phase 3d — 6-Second Recruiter Scan Optimisation

Section ordering (optimised for recruiter first-glance):
1. Header (name, gradient, contact, portfolio link)
2. Professional Summary (3-4 lines, keyword-dense)
3. Core Competencies (6-8 keyword phrases in grid)
4. Work Experience (reverse chronological, bullets reordered by JD relevance)
5. Projects (top 3-4 most relevant to the role)
6. Education & Certifications
7. Skills (languages + technical)

### Phase 3e — ATS Layout Rules

- Single-column layout (no sidebars, no parallel columns)
- Standard headers: "Professional Summary", "Work Experience", "Education", "Skills", "Certifications", "Projects"
- No text in images/SVGs
- No critical info in PDF headers/footers (ATS ignores them)
- UTF-8, selectable text (not rasterised)
- No nested tables
- No decorative elements that break text extraction

### Phase 3f — Professional Writing Rules

**Avoid cliché phrases:** "passionate about", "results-oriented", "proven track record", "leveraged" (use "used" or name the tool), "spearheaded" (use "led"), "facilitated" (use "ran"), "synergies", "robust", "seamless", "cutting-edge", "innovative", "demonstrated ability to", "best practices" (name the practice).

**Prefer specifics:** "Cut p95 latency from 2.1s to 380ms" beats "improved performance". Name tools, projects, and customers.

**Vary sentence structure:** Don't start every bullet with the same verb. Mix sentence lengths.

**Native tech English:** Short sentences, action verbs, no passive voice.

### Phase 4 — Generate Resume

1. Read `references/ats-optimization.md` and `references/resume-generation-workflow.md`
2. Build resume JSON following schema in workflow reference
3. Enforce 1-page limit — role-specific content filtering
4. Generate PDF: `python3 scripts/generate_resume_pdf.py --input <json> --output <pdf> --format chronological`
5. Verify page count with fitz; if >1 page, reduce content and regenerate
6. Read `references/best-practices.md` for content quality checks

### Phase 5 — Generate Cover Letter

1. Read `references/cover-letter-framework.md` for structure and writing rules
2. Read `references/anti-ai-voice-guide.md` before writing
3. Use `web_search` for company research (specific products, tech stack, recent news)
4. Keep under 300 words, British English, conversational-professional tone
5. Include one concrete example per paragraph

### Phase 6 — Generate Screening Answers

1. Read `references/screening_qa_framework.md` for templates
2. Customise based on role — reference specific company detail and matching experience
3. Include standard fields from workflow reference (salary, visa, start date, location)

### Phase 7 — Generate Form-Fill Snippet

Use the quick-copy block from `references/resume-generation-workflow.md`.

### Phase 8 — Deliver Materials

Provide: resume PDF link, cover letter text, screening Q&A pairs, form-fill snippet, verification report.

PDF delivery: serve via HTTP or share file path.

### Phase 9 — Post-Generation

Report: PDF path, page count, keyword coverage % (how many of the 15-20 JD keywords appear in the resume). Update application tracker PDF status to ✅ if the role is already registered.

## Quick Start

**User requests application materials with JD:**
1. Verify user info (Phase 1)
2. Analyse JD for keywords (Phase 3)
3. Generate resume JSON → PDF (Phase 4)
4. Write cover letter (Phase 5)
5. Customise screening answers (Phase 6)
6. Deliver all materials (Phase 8)
