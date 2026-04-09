---
name: resume-tailor
description: Generate job-specific tailored resumes from a base profile and job description. First collects structured user info (personal details, work history, side projects, education, skills, certificates), then reads a target JD to produce a polished HTML resume customized to match. Outputs print-optimized HTML that exports cleanly to PDF via browser print. Use when user wants to create/rewrite/tailor a resume for a specific job posting, optimize a resume for ATS, build a resume from scratch, or says "make me a resume" / "tailor my resume" / "customize resume for this job". Supports Chinese and English resumes.
security: Uses --headless browser (msedge/chrome) for PDF export only. No network requests, no credential access, no file system operations outside workspace/resumes/.
---

# Resume Tailor

Generate a polished, job-specific HTML resume. Two-phase workflow: collect profile → match JD.

## Phase 1: Profile Collection

On first run (no base profile exists), collect user info in this structured order. Ask one section at a time, confirm before moving to next. Save completed profile to `resume-profile.md` in workspace.

**Before collecting, confirm preferences:**
1. **Accent color** — Ask user to pick a theme color (default: `#6b4c9a` purple). Accept hex, color name, or "default". This applies to all generated resumes unless overridden per-JD.
2. **Language** — Chinese (中文) or English resume? Default based on user's communication language.
3. **Target region/culture** — e.g., mainland China (include birth date, photo slot), overseas (exclude).

### 1.1 Personal Information (个人信息)
- Name, phone, email, birth date, location, gender
- LinkedIn / portfolio URL (optional)

### 1.2 Education (教育背景)
- School, degree, major, graduation date
- Core courses / GPA / honors (optional, include if relevant to target)

### 1.3 Work Experience (工作经历)
For each role, collect:
- Company name, location
- Role / title
- Project name and type (if applicable)
- Date range (start - end)
- 3-6 bullet points of responsibilities and achievements
- Prompt user to **quantify** where possible (numbers, percentages, metrics)
- Ask: "Any tools, tech, or methods worth mentioning?"

### 1.4 Side Projects / Personal Projects (个人项目)
For each project:
- Project name, type (game, web app, tool, etc.)
- Status (launched / in progress / prototype)
- Your role and contribution
- Key features and metrics (DAU, retention, revenue, etc.)
- Tech stack used
- If built with AI tools, note which and how

### 1.5 Skills (技能)
Group into categories:
- **Domain skills**: e.g., game design, numerical balance, UX research
- **Technical tools**: e.g., Excel/VBA, Python, Claude Code, Cursor
- **Languages**: Chinese, English, etc. with proficiency level

### 1.6 Certificates & Awards (证书 & 荣誉)
- Professional certifications
- Academic awards / competitions

### 1.7 Save Profile

After collecting all sections, save as `resume-profile.md`:

```markdown
# Resume Profile: [Name]
> Last updated: YYYY-MM-DD

## Personal
[structured data]

## Education
[structured data]

## Work Experience
[per-role structured data with bullets]

## Projects
[per-project structured data]

## Skills
[categorized list]

## Certificates
[list]
```

On subsequent runs, read `resume-profile.md` first. Ask only: "Profile loaded. Anything to update?" If changes needed, edit specific sections.

## Phase 2: JD Match & Resume Generation

### 2.1 Collect Job Description

**Always ask the user to provide the JD.** Accept via:
- Pasted text (most common)
- File path (txt/md/pdf/html)
- URL (web_fetch)

After reading the JD, confirm with user:
```
📋 JD确认：
- 岗位：[Job Title]
- 公司：[Company]
- 核心要求：[3-5 key requirements]
- 加分项：[preferred qualifications]

以上提取正确吗？有补充或修正吗？
```

Only proceed after user confirms the JD parsing is correct.

### 2.2 Match Analysis (show to user before generating)

```
🎯 Target: [Job Title] at [Company]
📊 Match: [High/Medium/Low]

✅ Strong matches:
- [match 1: profile strength → JD requirement]
- [match 2]
- [match 3]

⚠️ Gaps (be honest):
- [gap 1: JD wants X, profile has limited Y]
- [gap 2]

📝 Tailoring strategy:
- Emphasize: [what to highlight and expand]
- Reframe: [how to position existing experience]
- Downplay: [what to shorten or combine]

🎨 Accent color: [using default / user's choice / suggest per JD tone]
```

Wait for user confirmation or adjustments before generating.

### 2.3 Generate HTML Resume

Produce a single self-contained HTML file with all CSS inline. Reference `references/html-template-guide.md` for detailed template specs.

**Content rules:**
- 3 core advantages in top highlight grid — each mapped to a top JD priority
- Work experience ordered by relevance to JD (most relevant first)
- Expand descriptions for matching roles; condense irrelevant ones
- Mirror JD keywords naturally (don't keyword-stuff)
- Every bullet point quantified where possible
- Skills section prioritizes JD-required skills
- 1-2 pages max for A4

**Style defaults (overridable per user preference):**
- Accent: `#6b4c9a` (purple) — ask user on first run, store in profile
- Font: `"Microsoft YaHei", "PingFang SC", sans-serif` (Chinese) or `"Inter", sans-serif` (English)
- Name: 26px, section titles: 13px, body: 9-11px
- Print CSS: `@media print { print-color-adjust: exact; }`
- A4: 210mm width, `@page { margin: 0; }`

### 2.4 Auto Export PDF

After saving the HTML file, automatically export to PDF using headless browser.

**Edge (preferred, Windows built-in):**
```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --print-to-pdf="$outputPath" --no-margins --disable-gpu "$htmlPath"
```

**Chrome fallback:**
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless --print-to-pdf="$outputPath" --no-margins --disable-gpu "$htmlPath"
```

Rules:
- Output PDF named `[Name]-[JobTitle].pdf` in same `resumes/` directory
- Use `--no-margins` since the HTML template handles its own padding
- Wait for the process to complete before proceeding
- If headless export fails, tell user to manually open HTML in browser and Ctrl+P

### 2.5 Deliver Result

Save both files to `resumes/`:
- `[Name]-[JobTitle].html`
- `[Name]-[JobTitle].pdf`

Tell user:
> ✅ Resume generated! PDF saved to `resumes/[Name]-[JobTitle].pdf`
> 
> Verify before sending:
> - [ ] Contact info correct
> - [ ] Dates accurate  
> - [ ] No typos in company/project names
> - [ ] Achievements not overstated
> - [ ] PDF formatting looks correct (open and scroll through)

## File Structure

```
workspace/
├── resume-profile.md          # Base profile (created on first run)
├── resumes/
│   ├── [Name]-[JobTitle].html
│   ├── [Name]-[JobTitle].pdf
│   └── ...
└── skills/
    └── resume-tailor/
        ├── SKILL.md
        └── references/
            └── html-template-guide.md
```

See `references/html-template-guide.md` for the complete HTML template structure with all sections, CSS classes, and print optimization details.
