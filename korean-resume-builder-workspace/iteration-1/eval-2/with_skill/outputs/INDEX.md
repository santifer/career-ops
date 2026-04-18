# Korean Resume Builder Skill Test Case - Output Index

**Date:** 2026-04-18
**Test Subject:** korean-resume-builder skill
**User Context:** Danil Ten (AI Engineer, mid-career, 5+ years full-stack)
**Objective:** Evaluate skill approach for creating general Korean resume for multiple Korean company applications

---

## Output Files

### 1. response.md (Primary Deliverable)
**Size:** 14 KB | **Lines:** 373 | **Format:** Markdown

Complete detailed approach document covering:
- CV selection and source analysis (Section 1)
- Resume pattern and layout selection (Section 2)
- Content localization strategy (Section 3)
- HTML template adaptation (Section 4)
- Content calibration rules (Section 5)
- Project section structure (Section 6)
- Page layout and pagination (Section 7)
- Output path and file organization (Section 8)
- Verification checklist (Section 9)
- Next steps for PDF generation (Section 10)

**Key Insights:**
- Recommends Experienced Developer pattern (3-4 pages)
- Bilingual headers (Korean + English) following Jumpit style
- Project-first narrative emphasizing shipped production impact
- Factual, measurable content with no invented metrics
- Output path: `output/korean-resume/general/` for multi-use variants

### 2. SUMMARY.txt (Executive Summary)
**Size:** 3 KB | **Lines:** 80 | **Format:** Plain text

Quick reference guide containing:
- 7-point summary of approach decisions
- Data sources used
- Key rules applied (DO/DON'T lists)
- Verification checklist
- Next steps for implementation

**Best for:** Quick review, stakeholder communication, checking decisions at a glance

### 3. FILE_MANIFEST.txt (Context and Metadata)
**Size:** 3 KB | **Lines:** 100+ | **Format:** Plain text

Comprehensive test case documentation:
- File directory and descriptions
- Task description and context
- Key decisions made (7 major choices)
- Data sources analyzed (7 documents read)
- Content breakdown by section
- Quality assurance notes
- Expected outcome when implemented
- Testing notes and phases

**Best for:** Understanding test methodology, context preservation, hand-offs

### 4. INDEX.md (This File)
Navigation guide and quick reference for all outputs.

---

## How to Use These Files

### For Implementation
Start with **response.md** and follow the 10-section structure:
1. Confirm CV selection (resumes/ai-engineer-cv.md)
2. Review layout pattern (Experienced Developer, 3-4 pages)
3. Adapt HTML template using template adaptation strategy
4. Populate sections with content from CV + profile
5. Generate PDF using node generate-pdf.mjs
6. Run verification checklist before final approval

### For Review
Read **SUMMARY.txt** for quick understanding, then drill into **response.md** sections as needed.

### For Archival
Keep **FILE_MANIFEST.txt** for context preservation and future reference.

---

## Key Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **CV Source** | resumes/ai-engineer-cv.md | Only available, perfect alignment |
| **Layout Pattern** | Experienced Developer | 1+ year production AI + 5-year foundation |
| **Page Count** | 3 pages (A4) | Standard Korean resume depth |
| **Header Style** | Bilingual (Korean + English) | Matches Jumpit references |
| **Content Approach** | Project-first, factual bullets | Korean tech market preferences |
| **Output Path** | output/korean-resume/general/ | Multi-use, not job-specific |
| **Template** | jumpit-korean-resume-template.html | Bundled asset, proven design |

---

## Content Structure (Final Resume)

**Page 1:**
- Identity block: Name, target role, contact facts table
- About Me: 3-4 concise bullets
- Skill Set: Single comprehensive table
- Work Experience Summary: Tenure and role progression

**Page 2:**
- TripleH Projects (Agent Platform, Evaluation Infrastructure)
- Ebit Terminal-Bench CI/CD Integration
- Spacing for project details and metrics

**Page 3:**
- DeepLearning.AI Alpha Testing Project
- JobHunt AI Hackathon Project
- Reference links and additional context

---

## Quality Assurance

All recommendations in response.md were validated against:
- Skill documentation (SKILL.md, references/)
- User data (CV, profile.yml)
- Reference examples (examples/resumes/)
- Career-ops conventions (templates/, modes/)

**No invented metrics.** All numbers sourced from resumes/ai-engineer-cv.md.
**No invasive personal data.** Excluded resident ID, full address, photo, marital status.
**All links verified.** GitHub URLs, portfolio references checked.

---

## Next Steps

When user approves approach:

1. **Template Population**
   - Fill hero section with Danil's data
   - Write About Me bullets
   - Build skill table
   - Create project blocks

2. **PDF Generation**
   ```bash
   node generate-pdf.mjs /path/to/korean-resume.html \
     output/korean-resume/general/korean-resume.pdf --format=a4
   ```

3. **Verification**
   - Check page count (pdfinfo)
   - Render pages (pdftoppm)
   - Verify Korean glyphs
   - Confirm table alignment

4. **Deployment**
   - Save HTML + PDF to output/korean-resume/general/
   - Ready for Jumpit, RocketPunch, and other Korean portals

---

## File Locations

All files saved to:
```
/Users/danil/Public/career-ops/
  korean-resume-builder-workspace/
    iteration-1/eval-2/with_skill/outputs/
      ├── response.md          (Primary deliverable)
      ├── SUMMARY.txt          (Quick reference)
      ├── FILE_MANIFEST.txt    (Context and metadata)
      └── INDEX.md             (This file)
```

---

## Version Info

- **Test Date:** 2026-04-18
- **Skill Version:** korean-resume-builder (from .claude/skills/korean-resume-builder/SKILL.md)
- **Career-Ops Version:** Check with `node update-system.mjs check`
- **User:** Danil Ten (AI Engineer, Seoul, South Korea)

---

## Questions or Feedback?

Refer to the detailed sections in **response.md** for any specific aspect:
- Content strategy → Section 3
- HTML structure → Section 4
- Project layout → Section 6
- Verification steps → Section 9
- Implementation → Section 10

For skill-specific questions, see SKILL.md at `.claude/skills/korean-resume-builder/SKILL.md`.
