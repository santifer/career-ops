> **⚠️ Superseded by [docs/superpowers/specs/2026-05-20-shivani-v3-pipeline-design.md](../specs/2026-05-20-shivani-v3-pipeline-design.md) (2026-05-20). This document describes the V2-era Shivani pipeline targeting Azure Data Engineer roles. The Shivani pipeline has since been re-canonicalized on the V3.1 prompt (Full Stack Java Developer @ CIBC/HCLTech/Accenture, Banking & Financial Services). Body retained for historical context only.**

# /shivani-resume-pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `/shivani-resume-pipeline` as a full parallel pipeline to `/yash-resume-pipeline`, migrate all Yash artifacts into `*/yash/` subdirectories, and create symmetric `*/shivani/` directories — leaving both pipelines independently operational.

**Architecture:** Two independent orchestrators (`yash-resume-pipeline.mjs` and `shivani-resume-pipeline.mjs`) sharing only `generate-pdf-latex.mjs` and `scrapling_fetch.py`. All output dirs split into per-person subdirs. Separate queues, mode files, and slash commands.

**Tech Stack:** Node.js ESM (orchestrators, tests), bash (file moves), tectonic (LaTeX via `generate-pdf-latex.mjs`), Scrapling/Python (JD fetch)

---

## File Map

**Create:**
- `cv-shivani.md` — Shivani's CV placeholder
- `shivani-cover-letter-system.md` — adapted cover letter prompt (Azure Data Engineer)
- `jds/yash/.gitkeep`, `jds/shivani/.gitkeep`
- `resumes/yash/.gitkeep`, `resumes/shivani/.gitkeep`
- `resume-logs/yash/.gitkeep`, `resume-logs/shivani/.gitkeep`
- `cover-letters/yash/.gitkeep`, `cover-letters/shivani/.gitkeep`
- `cover-letter-logs/yash/.gitkeep`, `cover-letter-logs/shivani/.gitkeep`
- `shivani-resume-pipeline.mjs` — Shivani orchestrator
- `modes/shivani-resume-pipeline.md` — Shivani mode
- `data/shivani-pipeline.md` — Shivani queue
- `.claude/commands/shivani-resume-pipeline.md` — slash command
- `tests/shivani-resume-pipeline.test.mjs`
- `tests/test-shivani-pipeline-smoke.mjs`

**Move (git mv):**
- All `jds/*.md` → `jds/yash/`
- All `resumes/*.pdf` → `resumes/yash/`
- All `resume-logs/*.log` → `resume-logs/yash/`
- All `cover-letters/*.pdf` → `cover-letters/yash/`
- All `cover-letter-logs/*.log` and `*.tex` → `cover-letter-logs/yash/`
- `data/pipeline.md` → `data/yash-pipeline.md`

**Modify:**
- `yash-resume-pipeline.mjs` — 8 path functions updated
- `modes/yash-resume-pipeline.md` — all path refs updated
- `tests/yash-resume-pipeline.test.mjs` — path expectations updated
- `AGENTS.md` — new section + table row
- `test-all.mjs` — Shivani test section added

**Never touch:** `generate-pdf-latex.mjs`, `resume-optimization-system-based-on-job-description.md`, `V2-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md`, `cover-letter-system-based-on-jd-and-resume.md`

---

## Task 1: Create cv-shivani.md

**Files:**
- Create: `cv-shivani.md`

- [ ] **Step 1: Write the placeholder CV**

```bash
cat > /yash-superClaudeHuman/projects/yash-ai-automation-career/cv-shivani.md << 'CVEOF'
# Shivani Anghan — Azure Data Engineer

<!-- FILL IN: Email: shivanianghan98@gmail.com | Phone: [YOUR PHONE] | LinkedIn: [YOUR URL] | Location: [CITY, PROVINCE] -->

## Summary

<!-- FILL IN: 3-4 sentence professional summary. Example structure:
Azure Data Engineer with X years of experience designing and delivering cloud-native data pipelines,
ETL/ELT workflows, and analytics platforms on Microsoft Azure. Proven expertise in Azure Data Factory,
Databricks, and Synapse Analytics. Passionate about [key domain]. Looking for [target role/company type].
-->

## Experience

<!-- FILL IN: Use this format for each role:

### [Job Title] | [Company] | [City, Province] | [Month YYYY – Month YYYY or Present]

- [Achievement 1 with metric, e.g. "Designed 30+ ADF pipelines ingesting 500K records/day from 8 source systems"]
- [Achievement 2 with metric]
- [Achievement 3 with metric]
- Technologies: [comma-separated list]
-->

## Projects

<!-- FILL IN: Use this format for each project:

### [Project Name] | [Year]

- [What it did, metric, outcome]
- Technologies: [comma-separated list]
- Link: [optional URL]
-->

## Education

<!-- FILL IN:

### [Degree] in [Field] | [University] | [City, Province] | [Year]
-->

## Skills

<!-- FILL IN: Organize by category, e.g.:

**Cloud Platforms:** Azure Data Factory, Azure Synapse Analytics, Azure Databricks, Azure Data Lake Storage Gen2, Azure Event Hubs, Azure Functions
**Data Processing:** PySpark, Python, SQL, T-SQL, Spark Streaming
**ETL/ELT Tools:** [list]
**Data Modeling:** [list]
**Orchestration:** [Airflow, Azure DevOps, etc.]
**Other:** Git, CI/CD, Terraform, [etc.]
-->

## Certifications

<!-- FILL IN:
- [Certification Name] — [Issuer] — [Year]
-->
CVEOF
```

- [ ] **Step 2: Verify file exists**

```bash
ls -la /yash-superClaudeHuman/projects/yash-ai-automation-career/cv-shivani.md
```

Expected: file exists, size > 0.

- [ ] **Step 3: Commit**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
git add cv-shivani.md
git commit -m "feat: add cv-shivani.md placeholder (Azure Data Engineer)"
```

---

## Task 2: Create shivani-cover-letter-system.md

**Files:**
- Create: `shivani-cover-letter-system.md`

> **NOTE:** Proof points P1–P5 below are structural placeholders. Replace them with Shivani's real metrics after `cv-shivani.md` is populated. The LaTeX template contact fields are also placeholders — fill in Shivani's phone, LinkedIn, and GitHub before running the pipeline.

- [ ] **Step 1: Write the Shivani cover letter system**

Write the complete file at `/yash-superClaudeHuman/projects/yash-ai-automation-career/shivani-cover-letter-system.md` with this exact content:

```
# Cover Letter Optimization System - XML Markdown Format (V1.0) — Shivani Anghan

<!-- NOTE: Proof points P1–P5 and LaTeX contact fields are placeholders.
     Populate cv-shivani.md first, then update this file before running the pipeline. -->

```xml
<cover_letter_optimization_system>
  <metadata>
    <title>Cover Letter Optimization System for Shivani Anghan (Azure Data Engineer)</title>
    <version>1.0</version>
    <sibling_of>V2-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md</sibling_of>
    <revision_notes>
      <note>Locked 4-paragraph skeleton with 12-16 sentence count band</note>
      <note>Locked proof-point list to prevent metric hallucination</note>
      <note>Resume keyword echo set requires 5+ shared bolded terms</note>
      <note>Same scoring rubric shape as V2.0 (>=90/100 to ship LaTeX-only)</note>
      <note>LaTeX template matches resume preamble for visual continuity</note>
    </revision_notes>
  </metadata>

  <primary_directive>
    <instruction>
When provided with a job description AND a tailored resume LaTeX:
1. Execute all phases internally (do not output intermediate analysis)
2. Build the cover letter from the locked 4-paragraph skeleton, injecting JD keywords from the resume's bolded set
3. Calculate optimization score using the explicit formula in Phase 6
4. Apply output rules based on the prioritized condition hierarchy

If score >=90 AND all constraints pass -> Output ONLY the complete LaTeX code
If any hard-fail constraint trips -> Output the appropriate error format with no LaTeX
If score <90 (no hard-fail) -> Output deficiency log + corrected LaTeX
    </instruction>
    <processing_mode>Internal analysis required but not output unless errors occur</processing_mode>
    <critical_constraint>USE locked proof points only. Do NOT invent metrics or accomplishments.</critical_constraint>
    <inputs_expected>
      <input name="jd_body">The cleaned JD markdown from jds/shivani/JD_<...>_<date>.md</input>
      <input name="resume_latex">The tailored resume .tex from /tmp/<...>_Resume_<date>.tex</input>
    </inputs_expected>
  </primary_directive>

  <phase_1>
    <n>JD ANALYSIS &amp; RESUME ECHO SET</n>
    <analysis_steps>
      <step number="1">Extract company name, role title, and the single hiring problem the JD describes.</step>
      <step number="2">Extract high-priority JD keywords (appearing 2+ times OR in a "required" section).</step>
      <step number="3">Build the resume_keyword_echo_set: scan the supplied resume LaTeX for every term inside \textbf{...}.</step>
      <step number="4">Identify the JD archetype using these signals:
        <archetype name="Azure Data Engineer">Azure Data Factory, Databricks, Synapse Analytics, PySpark, data pipelines, ADF, ADLS</archetype>
        <archetype name="Data Platform Engineer">data lake, data mesh, lakehouse, cloud data platform, data infrastructure</archetype>
        <archetype name="Analytics Engineer">dbt, data modeling, data warehouse, dimensional modeling, analytics</archetype>
        <archetype name="ML/AI Data Engineer">feature engineering, ML pipelines, MLOps, data for AI, feature store</archetype>
        <archetype name="Other / fallback">none of the above signals dominate</archetype>
      </step>
    </analysis_steps>
  </phase_1>

  <phase_2>
    <n>LOCKED 4-PARAGRAPH SKELETON</n>
    <skeleton>
      <paragraph number="1" purpose="Hook" sentences="3-4">
        <required>Names role and company explicitly in the first sentence.</required>
        <required>Leads with the professional story: [FILL IN: X years in data engineering / Azure ecosystem, key career highlight].</required>
        <required>Includes one quantified hero metric chosen from the locked proof points.</required>
        <prohibited>Generic openers like "I am writing to apply for..." -- start with a value claim, not boilerplate.</prohibited>
      </paragraph>
      <paragraph number="2" purpose="Why I match" sentences="4-5">
        <required>Direct keyword/responsibility echo from the JD.</required>
        <required>2-3 proof points from the locked &lt;approved_proof_points&gt; list, each mapped to a specific JD requirement.</required>
        <required>Wrap at least 2 high-priority JD keywords in \textbf{} in this paragraph (total across all 4 paragraphs is 4-7). Prioritize terms already in the resume_keyword_echo_set.</required>
        <prohibited>Listing every skill -- this is not the resume.</prohibited>
      </paragraph>
      <paragraph number="3" purpose="Why this company" sentences="3-4">
        <required>Reference one specific company detail from the JD (mission, product surface, data domain, scale, customer mix).</required>
        <required>State why that detail matters to the candidate's trajectory.</required>
        <prohibited>Generic culture fluff like "I admire your culture" or "I love what you stand for."</prohibited>
      </paragraph>
      <paragraph number="4" purpose="Close" sentences="2-3">
        <required>Forward-looking action line ("looking forward to discussing...", "would welcome the chance to...").</required>
        <required>Sign-off: write `Sincerely,` then a blank-line paragraph break, then `Shivani Anghan` on its own paragraph. Do NOT use `\\` line breaks.</required>
        <prohibited>Repeating qualifications already covered in paragraphs 1-2.</prohibited>
      </paragraph>
    </skeleton>
    <total_sentence_band>12 to 16 sentences inclusive. Outside this band triggers PARAGRAPH_COUNT_ERROR.</total_sentence_band>
    <resume_echo_requirement>At least 5 keywords from resume_keyword_echo_set must appear (bolded or unbolded) in the cover letter. Echoing fewer triggers a -10 score deduction.</resume_echo_requirement>
  </phase_2>

  <phase_3>
    <n>LOCKED PROOF POINTS (ANTI-HALLUCINATION)</n>
    <approved_proof_points>
      <!-- FILL IN: Replace P1-P5 with Shivani's real achievements from cv-shivani.md before running pipeline -->
      <proof_point id="P1">
        <name>Azure Data Factory Pipeline Modernisation</name>
        <context>[FILL IN: Company]</context>
        <hero_metric>[FILL IN: e.g. "Migrated 40+ legacy ETL jobs to ADF, reducing pipeline failures by 70%"]</hero_metric>
        <archetypes>Azure Data Engineer, Data Platform Engineer, fallback</archetypes>
      </proof_point>
      <proof_point id="P2">
        <name>Databricks Lakehouse Platform</name>
        <context>[FILL IN: Company]</context>
        <hero_metric>[FILL IN: e.g. "Built PySpark-based lakehouse processing 2M+ records/day across 6 source systems"]</hero_metric>
        <archetypes>Azure Data Engineer, Data Platform Engineer</archetypes>
      </proof_point>
      <proof_point id="P3">
        <name>Azure Synapse Analytics Implementation</name>
        <context>[FILL IN: Company]</context>
        <hero_metric>[FILL IN: e.g. "Reduced report generation time from 4 hours to 12 minutes via dedicated SQL pool"]</hero_metric>
        <archetypes>Azure Data Engineer, Analytics Engineer</archetypes>
      </proof_point>
      <proof_point id="P4">
        <name>Automated Data Quality Framework</name>
        <context>[FILL IN: Company]</context>
        <hero_metric>[FILL IN: e.g. "Implemented data validation layer catching 98% of upstream anomalies before downstream ingestion"]</hero_metric>
        <archetypes>Azure Data Engineer, Analytics Engineer</archetypes>
      </proof_point>
      <proof_point id="P5">
        <name>Cloud Data Migration</name>
        <context>[FILL IN: Company]</context>
        <hero_metric>[FILL IN: e.g. "Led on-premises SQL Server to Azure Data Lake migration for 15TB dataset with zero data loss"]</hero_metric>
        <archetypes>Data Platform Engineer, fallback</archetypes>
      </proof_point>
    </approved_proof_points>

    <archetype_allocation>
      <rule archetype="Azure Data Engineer">Paragraph 2 must use 2-3 of: P1, P2, P3.</rule>
      <rule archetype="Data Platform Engineer">Paragraph 2 must use P2 and P5 (both required), plus one cloud infrastructure detail from cv-shivani.md.</rule>
      <rule archetype="Analytics Engineer">Paragraph 2 must use P3 and P4 (both required), plus one data modeling detail from cv-shivani.md.</rule>
      <rule archetype="ML/AI Data Engineer">Paragraph 2 must use P2 + a feature-engineering or data-pipeline detail from cv-shivani.md.</rule>
      <rule archetype="Other / fallback">Paragraph 2 uses P1 + the professional story narrative; do not cherry-pick metrics from outside the locked list.</rule>
    </archetype_allocation>

    <invention_check>
      Any metric or accomplishment NOT listed in &lt;approved_proof_points&gt; or NOT verbatim from cv-shivani.md is a violation. Triggers PROOF_POINT_VIOLATION (no LaTeX output).
    </invention_check>
  </phase_3>

  <phase_4>
    <n>KEYWORD INJECTION &amp; ATS OPTIMIZATION</n>
    <keyword_rules>
      <rule>Wrap 4-7 high-priority JD keywords in \textbf{} across the 4 paragraphs.</rule>
      <rule>Prioritize keywords already bolded in the resume (resume_keyword_echo_set).</rule>
      <rule>Do not bold the same keyword twice.</rule>
      <rule>Never bold a keyword that doesn't actually appear in the JD.</rule>
    </keyword_rules>
    <latex_escape_rules>
      <rule>Hash: # -> \#</rule>
      <rule>Ampersand: in LaTeX body, write the literal sequence backslash-ampersand — do not include any HTML/XML entity.</rule>
      <rule>Percent: % -> \%</rule>
      <rule>Dollar: $ -> \$</rule>
      <rule>Underscore: _ -> \_</rule>
    </latex_escape_rules>
    <unicode_rule>No Unicode special characters (curly quotes, em dashes, arrows). Use ASCII equivalents.</unicode_rule>
  </phase_4>

  <phase_5>
    <n>CONSTRAINT VERIFICATION</n>
    <pre_output_validation>
      <step>Count sentences across all 4 paragraphs. Must be 12-16 inclusive.</step>
      <step>Verify exactly 4 body paragraphs separated by blank lines.</step>
      <step>Verify every metric and accomplishment traces to the locked proof point list or cv-shivani.md verbatim.</step>
      <step>Verify resume_keyword_echo_set overlap >= 5.</step>
      <step>Verify high-priority JD keywords wrapped with \textbf{} count is 4-7.</step>
      <step>Verify all special characters escaped, all \textbf{} commands closed.</step>
      <step>Verify salutation is exactly "Dear Hiring Manager,"</step>
      <step>Verify the closing is `Sincerely,` on its own line, followed by a blank line, followed by `Shivani Anghan` on its own line. No `\\` line breaks anywhere in the body or closing.</step>
    </pre_output_validation>
  </phase_5>

  <phase_6>
    <n>QUALITY SCORING &amp; OUTPUT RULES</n>
    <scoring_rubric>
      <minimum_required_score>90 of 100</minimum_required_score>
      <criteria>
        <criterion name="Constraint Adherence" max="30">
          <component points="12">Exactly 4 paragraphs present</component>
          <component points="10">Total sentence count is 12-16</component>
          <component points="8">All proof points from approved list (no inventions)</component>
        </criterion>
        <criterion name="Content Relevance" max="25">
          <formula>5 points per high-priority JD keyword wrapped in \textbf{} or echoed in body, max 25 (cap at 5 keywords)</formula>
        </criterion>
        <criterion name="ATS Compatibility" max="20">
          <component points="5">Header + contact row present</component>
          <component points="5">Salutation present and correct</component>
          <component points="5">4-paragraph body present</component>
          <component points="5">Closing + signature line present</component>
        </criterion>
        <criterion name="Contextual Authenticity" max="15">
          <component points="5">Hook ties to professional story (years in data engineering + Azure ecosystem)</component>
          <component points="5">Paragraph 3 references a specific JD-supplied company detail (not generic)</component>
          <component points="5">No generic culture fluff</component>
        </criterion>
        <criterion name="Technical Accuracy" max="10">
          <component points="5">All LaTeX special characters escaped</component>
          <component points="5">All \textbf{} commands properly opened and closed</component>
        </criterion>
      </criteria>
      <deduction>-10 points (Content Relevance) if resume_keyword_echo_set overlap is &lt; 5</deduction>
    </scoring_rubric>
  </phase_6>

  <output_rules>
    <output_condition_priority>
      <priority rank="1">PARAGRAPH_COUNT_ERROR -- STOP, no LaTeX output</priority>
      <priority rank="2">PROOF_POINT_VIOLATION -- STOP, no LaTeX output</priority>
      <priority rank="3">CONTEXTUALIZATION_DEFICIENCY -- correct then output</priority>
      <priority rank="4">Score &lt; 90 (no STOP) -- correct then output with deficiency log</priority>
      <priority rank="5">Score >= 90 -- output LaTeX only</priority>
    </output_condition_priority>

    <condition number="1">
      <criteria>Score >= 90 AND all constraints pass</criteria>
      <output_format>Output ONLY the complete LaTeX from \documentclass to \end{document}. No commentary.</output_format>
    </condition>

    <condition number="2">
      <criteria>Score &lt; 90 (no STOP conditions)</criteria>
      <output_format>
OPTIMIZATION INCOMPLETE - Score: [X]/100
Deficiencies:
- [Specific issue 1 with point deduction]
- [Specific issue 2 with point deduction]
Applying corrections...

[Complete corrected LaTeX from \documentclass to \end{document}]
      </output_format>
    </condition>

    <condition number="3">
      <criteria>Contextual Authenticity score &lt; 10 of 15</criteria>
      <output_format>
CONTEXTUALIZATION DEFICIENCY DETECTED
Issue: [Specific contextualization problem]
Problematic Sentence: [the sentence]
Correction Applied: [how it was fixed]

[Complete corrected LaTeX]
      </output_format>
    </condition>

    <condition number="4" priority="STOP">
      <criteria>Sentence count outside 12-16 OR paragraph count != 4</criteria>
      <output_format>
PARAGRAPH_COUNT_ERROR - CANNOT PROCEED
Required: 4 paragraphs, 12-16 sentences total
Actual paragraphs: [N]
Actual sentences: [N]
Resolution Required: Adjust counts to match the locked skeleton before proceeding.
      </output_format>
    </condition>

    <condition number="5" priority="STOP">
      <criteria>Any metric or accomplishment not present in approved_proof_points or cv-shivani.md</criteria>
      <output_format>
PROOF_POINT_VIOLATION - CANNOT PROCEED
Invented detail: [the specific metric or claim that is not in the approved list]
Resolution Required: Replace with an approved proof point from the locked list.
      </output_format>
    </condition>
  </output_rules>

  <base_latex_template>
    <latex_code>
\documentclass[11pt,letterpaper]{article}
\usepackage[empty]{fullpage}
\usepackage[hidelinks]{hyperref}
\usepackage[english]{babel}
\usepackage{fontawesome5}
\usepackage{xcolor}

\addtolength{\oddsidemargin}{-0.6in}
\addtolength{\evensidemargin}{-0.6in}
\addtolength{\textwidth}{1.2in}
\addtolength{\topmargin}{-0.7in}
\addtolength{\textheight}{1.4in}

\pagestyle{empty}
\raggedright
\setlength{\parindent}{0pt}
\setlength{\parskip}{8pt}

\begin{document}

%----------HEADING----------
\begin{center}
{\Huge \scshape Shivani Anghan} \\ \vspace{2pt}
\small \raisebox{-0.1\height}\faEnvelope\ \href{mailto:shivanianghan98@gmail.com}{shivanianghan98@gmail.com} ~
\raisebox{-0.1\height}\faPhone\ [FILL IN: +1 (XXX) XXX-XXXX] ~
\href{[FILL IN: LinkedIn URL]}{\raisebox{-0.2\height}\faLinkedin\ \underline{LinkedIn}} ~
\href{[FILL IN: GitHub URL]}{\raisebox{-0.2\height}\faGithub\ \underline{GitHub}} ~
\vspace{-8pt}
\end{center}

\vspace{-17pt}
\noindent\rule{\textwidth}{0.4pt}
\vspace{4pt}

%----------DATE & ADDRESS----------
[INSERT_DATE_LONG]

Hiring Manager \\
[INSERT_COMPANY_NAME] \\
[INSERT_COMPANY_LOCATION]

\textbf{Re: [INSERT_ROLE_TITLE]}

%----------BODY----------
Dear Hiring Manager,

[PARAGRAPH 1: Hook -- 3-4 sentences. Names role + company. Leads with professional story. One hero metric.]

[PARAGRAPH 2: Why I match -- 4-5 sentences. JD keyword echo. 2-3 approved proof points. \textbf{} on at least 2 high-priority JD keywords; total across all paragraphs is 4-7.]

[PARAGRAPH 3: Why this company -- 3-4 sentences. Specific JD-supplied company detail. Why it matters to candidate.]

[PARAGRAPH 4: Close -- 2-3 sentences. Forward-looking action line.]

Sincerely,

Shivani Anghan

\end{document}
    </latex_code>
  </base_latex_template>

  <execution_command>
    <step number="1">Phase 1 -> JD analysis + resume_keyword_echo_set + archetype detection</step>
    <step number="2">Phase 2 -> Compose 4 paragraphs from locked skeleton (12-16 sentences total)</step>
    <step number="3">Phase 3 -> Allocate 2-3 approved proof points by archetype</step>
    <step number="4">Phase 4 -> Inject \textbf{} keywords + LaTeX escapes</step>
    <step number="5">Phase 5 -> Run verification checks</step>
    <step number="6">Phase 6 -> Score, then apply output rules priority hierarchy</step>
    <step number="7">Substitute the four template placeholders in the LaTeX output:
      - [INSERT_DATE_LONG] -> today's date as `Month DD, YYYY` (e.g., `May 08, 2026`).
      - [INSERT_COMPANY_NAME] -> JD frontmatter `company` field verbatim.
      - [INSERT_COMPANY_LOCATION] -> JD frontmatter `location` field verbatim; if missing/null/empty, OMIT the location line entirely.
      - [INSERT_ROLE_TITLE] -> JD frontmatter `role` field verbatim.
    </step>
    <step number="8">Replace each [PARAGRAPH N: ...] placeholder with the actual paragraph composed in Phase 2.</step>
  </execution_command>
</cover_letter_optimization_system>
```
```

(End of file — no trailing content after the closing triple-backtick)

- [ ] **Step 2: Verify file exists and is non-empty**

```bash
wc -l /yash-superClaudeHuman/projects/yash-ai-automation-career/shivani-cover-letter-system.md
```

Expected: 200+ lines.

- [ ] **Step 3: Commit**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
git add shivani-cover-letter-system.md
git commit -m "feat: add shivani-cover-letter-system.md (Azure Data Engineer, placeholder proof points)"
```

---

## Task 3: Create subdirectory skeleton

**Files:**
- Create: 10 subdirectories with `.gitkeep` files

- [ ] **Step 1: Create all subdirectories and gitkeep files**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
mkdir -p jds/yash jds/shivani
mkdir -p resumes/yash resumes/shivani
mkdir -p resume-logs/yash resume-logs/shivani
mkdir -p cover-letters/yash cover-letters/shivani
mkdir -p cover-letter-logs/yash cover-letter-logs/shivani

touch jds/yash/.gitkeep jds/shivani/.gitkeep
touch resumes/yash/.gitkeep resumes/shivani/.gitkeep
touch resume-logs/yash/.gitkeep resume-logs/shivani/.gitkeep
touch cover-letters/yash/.gitkeep cover-letters/shivani/.gitkeep
touch cover-letter-logs/yash/.gitkeep cover-letter-logs/shivani/.gitkeep
```

- [ ] **Step 2: Verify structure**

```bash
find jds resumes resume-logs cover-letters cover-letter-logs -name ".gitkeep" | sort
```

Expected output (10 lines):
```
cover-letter-logs/shivani/.gitkeep
cover-letter-logs/yash/.gitkeep
cover-letters/shivani/.gitkeep
cover-letters/yash/.gitkeep
jds/shivani/.gitkeep
jds/yash/.gitkeep
resume-logs/shivani/.gitkeep
resume-logs/yash/.gitkeep
resumes/shivani/.gitkeep
resumes/yash/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add jds/yash/.gitkeep jds/shivani/.gitkeep \
        resumes/yash/.gitkeep resumes/shivani/.gitkeep \
        resume-logs/yash/.gitkeep resume-logs/shivani/.gitkeep \
        cover-letters/yash/.gitkeep cover-letters/shivani/.gitkeep \
        cover-letter-logs/yash/.gitkeep cover-letter-logs/shivani/.gitkeep
git commit -m "feat: create per-person yash/ and shivani/ subdirectory skeletons"
```

---

## Task 4: Move existing Yash artifacts to */yash/ subdirs

**Files:**
- Move: all `jds/*.md` → `jds/yash/`
- Move: all `resumes/*.pdf` → `resumes/yash/`
- Move: all `resume-logs/*.log` → `resume-logs/yash/`
- Move: all `cover-letters/*.pdf` → `cover-letters/yash/`
- Move: all `cover-letter-logs/*.log` and `*.tex` → `cover-letter-logs/yash/`
- Rename: `data/pipeline.md` → `data/yash-pipeline.md`

- [ ] **Step 1: Move all JD markdown files**

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
for f in jds/JD_*.md; do [ -f "$f" ] && git mv "$f" "jds/yash/$(basename "$f")"; done
```

- [ ] **Step 2: Move all resume PDFs**

```bash
for f in resumes/*.pdf; do [ -f "$f" ] && git mv "$f" "resumes/yash/$(basename "$f")"; done
```

- [ ] **Step 3: Move all resume-logs**

```bash
for f in resume-logs/*.log; do [ -f "$f" ] && git mv "$f" "resume-logs/yash/$(basename "$f")"; done
```

- [ ] **Step 4: Move all cover letter PDFs**

```bash
for f in cover-letters/*.pdf; do [ -f "$f" ] && git mv "$f" "cover-letters/yash/$(basename "$f")"; done
```

- [ ] **Step 5: Move all cover-letter-logs (both .log and .tex)**

```bash
for f in cover-letter-logs/*.log cover-letter-logs/*.tex; do [ -f "$f" ] && git mv "$f" "cover-letter-logs/yash/$(basename "$f")"; done
```

- [ ] **Step 6: Rename pipeline queue**

```bash
git mv data/pipeline.md data/yash-pipeline.md
```

- [ ] **Step 7: Verify moves**

```bash
ls jds/yash/ | grep ".md" | wc -l   # should be 11
ls resumes/yash/ | grep ".pdf" | wc -l  # should be 11
ls resume-logs/yash/ | wc -l   # should be 10+ (logs only)
ls cover-letters/yash/ | grep ".pdf" | wc -l  # should be 8
ls cover-letter-logs/yash/ | wc -l  # should be 9+
ls jds/ | grep -v "yash\|shivani"  # should be empty (no stray .md at root)
ls data/yash-pipeline.md  # should exist
ls data/pipeline.md 2>/dev/null && echo "ERROR: old file still exists"
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: migrate Yash artifacts to */yash/ subdirs, rename pipeline queue"
```

---

## Task 5: Update yash-resume-pipeline.mjs path functions

**Files:**
- Modify: `yash-resume-pipeline.mjs` (lines 21–57)

- [ ] **Step 1: Update the 8 path functions**

Apply these exact edits to `yash-resume-pipeline.mjs`:

**Line 21** — `pipelinePath()`:
```js
// OLD:
function pipelinePath() { return resolve(projectRoot(), 'data/pipeline.md'); }
// NEW:
function pipelinePath() { return resolve(projectRoot(), 'data/yash-pipeline.md'); }
```

**Line 23** — `jdsDir()`:
```js
// OLD:
function jdsDir() { return resolve(projectRoot(), 'jds'); }
// NEW:
function jdsDir() { return resolve(projectRoot(), 'jds/yash'); }
```

**Line 24** — `resumesDir()`:
```js
// OLD:
function resumesDir() { return resolve(projectRoot(), 'resumes'); }
// NEW:
function resumesDir() { return resolve(projectRoot(), 'resumes/yash'); }
```

**Line 38-40** — `buildJdPath()`:
```js
// OLD:
export function buildJdPath(company_slug, role_slug, date) {
  return `jds/JD_${company_slug}_${role_slug}_Yash_Anghan_${date}.md`;
}
// NEW:
export function buildJdPath(company_slug, role_slug, date) {
  return `jds/yash/JD_${company_slug}_${role_slug}_Yash_Anghan_${date}.md`;
}
```

**Line 41-43** — `buildPdfPath()`:
```js
// OLD:
export function buildPdfPath(company_slug, role_slug, date) {
  return `resumes/${company_slug}_${role_slug}_Yash_Anghan_Resume_${date}.pdf`;
}
// NEW:
export function buildPdfPath(company_slug, role_slug, date) {
  return `resumes/yash/${company_slug}_${role_slug}_Yash_Anghan_Resume_${date}.pdf`;
}
```

**Line 44-46** — `buildTexPath()` (used internally; keep consistent):
```js
// OLD:
export function buildTexPath(company_slug, role_slug, date) {
  return `resumes/${company_slug}_${role_slug}_Yash_Anghan_Resume_${date}.tex`;
}
// NEW (tex stays in /tmp so this function is internal-only; update for consistency):
export function buildTexPath(company_slug, role_slug, date) {
  return `resumes/yash/${company_slug}_${role_slug}_Yash_Anghan_Resume_${date}.tex`;
}
```

**Line 47-49** — `buildSidecarLogPath()`:
```js
// OLD:
export function buildSidecarLogPath(company_slug, role_slug, date) {
  return `resume-logs/${company_slug}_${role_slug}_Yash_Anghan_Resume_${date}.log`;
}
// NEW:
export function buildSidecarLogPath(company_slug, role_slug, date) {
  return `resume-logs/yash/${company_slug}_${role_slug}_Yash_Anghan_Resume_${date}.log`;
}
```

**Line 53-55** — `buildCoverLetterPdfPath()`:
```js
// OLD:
export function buildCoverLetterPdfPath(company_slug, role_slug, date) {
  return `cover-letters/${company_slug}_${role_slug}_Yash_Anghan_Cover_Letter_${date}.pdf`;
}
// NEW:
export function buildCoverLetterPdfPath(company_slug, role_slug, date) {
  return `cover-letters/yash/${company_slug}_${role_slug}_Yash_Anghan_Cover_Letter_${date}.pdf`;
}
```

**Line 56-58** — `buildCoverLetterLogPath()`:
```js
// OLD:
export function buildCoverLetterLogPath(company_slug, role_slug, date) {
  return `cover-letter-logs/${company_slug}_${role_slug}_Yash_Anghan_Cover_Letter_${date}.log`;
}
// NEW:
export function buildCoverLetterLogPath(company_slug, role_slug, date) {
  return `cover-letter-logs/yash/${company_slug}_${role_slug}_Yash_Anghan_Cover_Letter_${date}.log`;
}
```

Note: `buildCoverLetterTexPath()` (lines 50-52) returns `/tmp/...` — leave it unchanged.

- [ ] **Step 2: Verify syntax**

```bash
node --check yash-resume-pipeline.mjs && echo "syntax OK"
```

Expected: `syntax OK`

- [ ] **Step 3: Verify path outputs by importing**

```bash
node -e "
import('./yash-resume-pipeline.mjs').then(m => {
  console.log(m.buildJdPath('Acme', 'Engineer', '2026-01-01'));
  console.log(m.buildPdfPath('Acme', 'Engineer', '2026-01-01'));
  console.log(m.buildSidecarLogPath('Acme', 'Engineer', '2026-01-01'));
  console.log(m.buildCoverLetterPdfPath('Acme', 'Engineer', '2026-01-01'));
  console.log(m.buildCoverLetterLogPath('Acme', 'Engineer', '2026-01-01'));
});
"
```

Expected output:
```
jds/yash/JD_Acme_Engineer_Yash_Anghan_2026-01-01.md
resumes/yash/Acme_Engineer_Yash_Anghan_Resume_2026-01-01.pdf
resume-logs/yash/Acme_Engineer_Yash_Anghan_Resume_2026-01-01.log
cover-letters/yash/Acme_Engineer_Yash_Anghan_Cover_Letter_2026-01-01.pdf
cover-letter-logs/yash/Acme_Engineer_Yash_Anghan_Cover_Letter_2026-01-01.log
```

- [ ] **Step 4: Commit**

```bash
git add yash-resume-pipeline.mjs
git commit -m "refactor: update Yash orchestrator path functions to */yash/ subdirs"
```

---

## Task 6: Update tests/yash-resume-pipeline.test.mjs for new paths

**Files:**
- Modify: `tests/yash-resume-pipeline.test.mjs`

The test file has two categories of path references to update:
1. `data/pipeline.md` → `data/yash-pipeline.md` (the temp file the CLI reads)
2. Path assertions that reference `jds/JD_`, `resumes/`, (not `cover-letters/` — those compile tests use arbitrary paths)

- [ ] **Step 1: Update all pipeline.md references to yash-pipeline.md**

```bash
sed -i "s|data/pipeline\.md|data/yash-pipeline.md|g" tests/yash-resume-pipeline.test.mjs
```

- [ ] **Step 2: Update jds path assertions in check-duplicate tests**

```bash
sed -i "s|'jds/JD_|'jds/yash/JD_|g" tests/yash-resume-pipeline.test.mjs
sed -i "s|\"jds/JD_|\"jds/yash/JD_|g" tests/yash-resume-pipeline.test.mjs
```

- [ ] **Step 3: Update resumes path assertions in check-duplicate tests**

The check-duplicate test creates fixture files and checks returned paths. Update both the file creation paths and the assertion values:

```bash
sed -i "s|join(dir, 'resumes/AcmeInc_|join(dir, 'resumes/yash/AcmeInc_|g" tests/yash-resume-pipeline.test.mjs
sed -i "s|'resumes/AcmeInc_|'resumes/yash/AcmeInc_|g" tests/yash-resume-pipeline.test.mjs
sed -i "s|join(dir, 'jds/JD_|join(dir, 'jds/yash/JD_|g" tests/yash-resume-pipeline.test.mjs
```

- [ ] **Step 4: Update cover-letter path assertions (buildCoverLetterPdfPath / buildCoverLetterLogPath imports)**

These functions are imported and called directly in some tests. Find the exact assertions:

```bash
grep -n "cover-letters/" tests/yash-resume-pipeline.test.mjs | grep -v "compile-cover-letter\|cover-letters/test\|cover-letters/bad\|cover-letters/non"
```

For any assertion like `assert.*('cover-letters/..._Yash_Anghan_Cover_Letter_...')`, update to `'cover-letters/yash/...'`. Apply:

```bash
sed -i "s|cover-letters/\${|cover-letters/yash/\${|g" tests/yash-resume-pipeline.test.mjs
sed -i "s|cover-letter-logs/\${|cover-letter-logs/yash/\${|g" tests/yash-resume-pipeline.test.mjs
```

- [ ] **Step 5: Update mark-processed tests that reference jds/ and resumes/ paths**

```bash
sed -i "s|'jds/Openai_|'jds/yash/JD_Openai_|g" tests/yash-resume-pipeline.test.mjs 2>/dev/null || true
sed -i "s|'resumes/Openai_|'resumes/yash/Openai_|g" tests/yash-resume-pipeline.test.mjs 2>/dev/null || true
```

- [ ] **Step 6: Verify the test file syntax**

```bash
node --check tests/yash-resume-pipeline.test.mjs && echo "syntax OK"
```

Expected: `syntax OK`

- [ ] **Step 7: Run Yash tests to confirm they pass**

```bash
node --test tests/yash-resume-pipeline.test.mjs 2>&1 | tail -20
```

Expected: all tests pass (no `not ok` lines). If any test fails, read the failure message, find the remaining hardcoded path, and fix it manually.

- [ ] **Step 8: Commit**

```bash
git add tests/yash-resume-pipeline.test.mjs
git commit -m "test: update Yash pipeline tests for */yash/ subdir paths"
```

---

## Task 7: Update modes/yash-resume-pipeline.md path references

**Files:**
- Modify: `modes/yash-resume-pipeline.md`

- [ ] **Step 1: Update all path references in the mode file**

```bash
# Update jds/ path references
sed -i "s|jds/JD_<c>_<r>_Yash_Anghan|jds/yash/JD_<c>_<r>_Yash_Anghan|g" modes/yash-resume-pipeline.md
# Update resumes/ references
sed -i "s|resumes/<c>_<r>_Yash_Anghan|resumes/yash/<c>_<r>_Yash_Anghan|g" modes/yash-resume-pipeline.md
# Update resume-logs/ references
sed -i "s|resume-logs/<c>_<r>_Yash_Anghan|resume-logs/yash/<c>_<r>_Yash_Anghan|g" modes/yash-resume-pipeline.md
# Update cover-letters/ references
sed -i "s|cover-letters/<c>_<r>_Yash_Anghan|cover-letters/yash/<c>_<r>_Yash_Anghan|g" modes/yash-resume-pipeline.md
# Update cover-letter-logs/ references
sed -i "s|cover-letter-logs/<c>_<r>_Yash_Anghan|cover-letter-logs/yash/<c>_<r>_Yash_Anghan|g" modes/yash-resume-pipeline.md
# Update the queue file reference
sed -i "s|data/pipeline\.md|data/yash-pipeline.md|g" modes/yash-resume-pipeline.md
# Update intro sentence
sed -i "s|Reads pending URLs from \`data/pipeline\.md\`|Reads pending URLs from \`data/yash-pipeline.md\`|g" modes/yash-resume-pipeline.md
sed -i "s|extracts each JD via Playwright into \`jds/\`|extracts each JD via Playwright into \`jds/yash/\`|g" modes/yash-resume-pipeline.md
sed -i "s|a tailored PDF resume into \`resumes/\`|a tailored PDF resume into \`resumes/yash/\`|g" modes/yash-resume-pipeline.md
```

- [ ] **Step 2: Verify key paths in the updated file**

```bash
grep -n "data/pipeline\|jds/JD_<c>\|resumes/<c>\|cover-letters/<c>\|cover-letter-logs/<c>\|resume-logs/<c>" modes/yash-resume-pipeline.md
```

Expected: every match should have `yash/` in the path. No bare `jds/JD_`, `resumes/<c>`, etc.

- [ ] **Step 3: Commit**

```bash
git add modes/yash-resume-pipeline.md
git commit -m "docs: update yash-resume-pipeline mode for */yash/ subdir paths"
```

---

## Task 8: Create shivani-resume-pipeline.mjs

**Files:**
- Create: `shivani-resume-pipeline.mjs`

- [ ] **Step 1: Copy and apply substitutions**

```bash
cp yash-resume-pipeline.mjs shivani-resume-pipeline.mjs

# Header comment
sed -i "s|yash-resume-pipeline\.mjs — deterministic orchestrator for /yash-resume-pipeline|shivani-resume-pipeline.mjs — deterministic orchestrator for /shivani-resume-pipeline|g" shivani-resume-pipeline.mjs

# Pipeline queue path
sed -i "s|data/yash-pipeline\.md|data/shivani-pipeline.md|g" shivani-resume-pipeline.mjs

# Audit log path
sed -i "s|data/yash-resume-runs\.log|data/shivani-resume-runs.log|g" shivani-resume-pipeline.mjs

# jds subdir
sed -i "s|jds/yash|jds/shivani|g" shivani-resume-pipeline.mjs

# resumes subdir
sed -i "s|resumes/yash|resumes/shivani|g" shivani-resume-pipeline.mjs

# resume-logs subdir
sed -i "s|resume-logs/yash|resume-logs/shivani|g" shivani-resume-pipeline.mjs

# cover-letters subdir
sed -i "s|cover-letters/yash|cover-letters/shivani|g" shivani-resume-pipeline.mjs

# cover-letter-logs subdir
sed -i "s|cover-letter-logs/yash|cover-letter-logs/shivani|g" shivani-resume-pipeline.mjs

# Person name in path strings (Yash_Anghan → Shivani_Anghan)
sed -i "s|Yash_Anghan|Shivani_Anghan|g" shivani-resume-pipeline.mjs

# Resume prompt file reference
sed -i "s|resume-optimization-system-based-on-job-description\.md|V2-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md|g" shivani-resume-pipeline.mjs

# Cover letter prompt file reference
sed -i "s|cover-letter-system-based-on-jd-and-resume\.md|shivani-cover-letter-system.md|g" shivani-resume-pipeline.mjs

# CLI usage message
sed -i "s|node yash-resume-pipeline\.mjs|node shivani-resume-pipeline.mjs|g" shivani-resume-pipeline.mjs
```

- [ ] **Step 2: Verify syntax**

```bash
node --check shivani-resume-pipeline.mjs && echo "syntax OK"
```

Expected: `syntax OK`

- [ ] **Step 3: Verify path function outputs**

```bash
node -e "
import('./shivani-resume-pipeline.mjs').then(m => {
  console.log(m.buildJdPath('Microsoft', 'DataEngineer', '2026-01-01'));
  console.log(m.buildPdfPath('Microsoft', 'DataEngineer', '2026-01-01'));
  console.log(m.buildSidecarLogPath('Microsoft', 'DataEngineer', '2026-01-01'));
  console.log(m.buildCoverLetterPdfPath('Microsoft', 'DataEngineer', '2026-01-01'));
  console.log(m.buildCoverLetterLogPath('Microsoft', 'DataEngineer', '2026-01-01'));
});
"
```

Expected output:
```
jds/shivani/JD_Microsoft_DataEngineer_Shivani_Anghan_2026-01-01.md
resumes/shivani/Microsoft_DataEngineer_Shivani_Anghan_Resume_2026-01-01.pdf
resume-logs/shivani/Microsoft_DataEngineer_Shivani_Anghan_Resume_2026-01-01.log
cover-letters/shivani/Microsoft_DataEngineer_Shivani_Anghan_Cover_Letter_2026-01-01.pdf
cover-letter-logs/shivani/Microsoft_DataEngineer_Shivani_Anghan_Cover_Letter_2026-01-01.log
```

- [ ] **Step 4: Verify no Yash references remain in path strings**

```bash
grep -n "Yash_Anghan\|data/yash-pipeline\|data/yash-resume\|jds/yash\|resumes/yash\|resume-logs/yash\|cover-letters/yash\|cover-letter-logs/yash" shivani-resume-pipeline.mjs
```

Expected: no output (zero matches).

- [ ] **Step 5: Verify no locked file references to Yash prompt files**

```bash
grep -n "resume-optimization-system-based-on-job-description\|cover-letter-system-based-on-jd-and-resume" shivani-resume-pipeline.mjs
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add shivani-resume-pipeline.mjs
git commit -m "feat: add shivani-resume-pipeline.mjs orchestrator"
```

---

## Task 9: Create Shivani's mode, queue, and slash command

**Files:**
- Create: `modes/shivani-resume-pipeline.md`
- Create: `data/shivani-pipeline.md`
- Create: `.claude/commands/shivani-resume-pipeline.md`

- [ ] **Step 1: Generate shivani mode from yash mode**

```bash
cp modes/yash-resume-pipeline.md modes/shivani-resume-pipeline.md

# Title line
sed -i "s|# Mode: yash-resume-pipeline — JD-extract → V2\.0-resume two-phase pipeline|# Mode: shivani-resume-pipeline — JD-extract → V3.0-resume two-phase pipeline|g" modes/shivani-resume-pipeline.md

# Intro paragraph paths
sed -i "s|data/yash-pipeline\.md|data/shivani-pipeline.md|g" modes/shivani-resume-pipeline.md
sed -i "s|jds/yash/|jds/shivani/|g" modes/shivani-resume-pipeline.md
sed -i "s|resumes/yash/|resumes/shivani/|g" modes/shivani-resume-pipeline.md
sed -i "s|resume-logs/yash/|resume-logs/shivani/|g" modes/shivani-resume-pipeline.md
sed -i "s|cover-letters/yash/|cover-letters/shivani/|g" modes/shivani-resume-pipeline.md
sed -i "s|cover-letter-logs/yash/|cover-letter-logs/shivani/|g" modes/shivani-resume-pipeline.md

# CLI subcommand calls
sed -i "s|node yash-resume-pipeline\.mjs|node shivani-resume-pipeline.mjs|g" modes/shivani-resume-pipeline.md

# Prompt file references
sed -i "s|resume-optimization-system-based-on-job-description\.md|V2-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md|g" modes/shivani-resume-pipeline.md
sed -i "s|cover-letter-system-based-on-jd-and-resume\.md|shivani-cover-letter-system.md|g" modes/shivani-resume-pipeline.md

# Person name in path examples
sed -i "s|Yash_Anghan|Shivani_Anghan|g" modes/shivani-resume-pipeline.md
```

- [ ] **Step 2: Verify the mode file has no Yash residue in path-sensitive lines**

```bash
grep -n "Yash_Anghan\|data/yash-pipeline\|jds/yash/\|resumes/yash/\|resume-logs/yash/\|cover-letters/yash/\|cover-letter-logs/yash/" modes/shivani-resume-pipeline.md
grep -n "resume-optimization-system-based-on-job-description\|cover-letter-system-based-on-jd-and-resume" modes/shivani-resume-pipeline.md
```

Expected: both commands produce no output.

- [ ] **Step 3: Verify the mode references the correct orchestrator**

```bash
grep "node shivani-resume-pipeline" modes/shivani-resume-pipeline.md | head -3
```

Expected: at least one match.

- [ ] **Step 4: Create data/shivani-pipeline.md**

```bash
cat > data/shivani-pipeline.md << 'EOF'
# Shivani Pipeline

## Pendientes

## Procesadas

## Fallidos
EOF
```

- [ ] **Step 5: Create the slash command**

```bash
cat > .claude/commands/shivani-resume-pipeline.md << 'EOF'
---
description: Run the JD-extract → V3.0-resume pipeline for Shivani Anghan (one URL at a time).
argument-hint: ""
---

Read modes/shivani-resume-pipeline.md and follow it.
EOF
```

- [ ] **Step 6: Verify slash command exists and is correct**

```bash
cat .claude/commands/shivani-resume-pipeline.md
```

Expected: shows the frontmatter + single instruction line.

- [ ] **Step 7: Commit**

```bash
git add modes/shivani-resume-pipeline.md data/shivani-pipeline.md .claude/commands/shivani-resume-pipeline.md
git commit -m "feat: add shivani mode, pipeline queue, and /shivani-resume-pipeline slash command"
```

---

## Task 10: Update AGENTS.md documentation

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add shivani-resume-pipeline to Skill Modes table**

In `AGENTS.md`, find the row:
```
| Wants the strict V2.0 resume pipeline (JD extract + tailored PDF only) | `yash-resume-pipeline` |
```

Add a new row immediately after it:
```
| Wants to run Shivani's resume pipeline (JD extract + V3.0 resume + cover letter) | `shivani-resume-pipeline` |
```

- [ ] **Step 2: Add Shivani Resume Pipeline section in AGENTS.md**

Find the existing section:
```
### Yash Resume Pipeline (yash-resume-pipeline)
```

After that entire section ends (before the next `---` separator or `## Ethical Use`), add:

```markdown
### Shivani Resume Pipeline (shivani-resume-pipeline)

A parallel pipeline to `yash-resume-pipeline`, namespaced to Shivani Anghan (Azure Data Engineer).
Same 13-step JD-extract → resume → cover-letter architecture running independently.

Inputs:
- URLs in `data/shivani-pipeline.md` `## Pendientes` section as `- [ ] <url>`.
- The locked V3.0 prompt at `V2-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md`.
- Cover letter system at `shivani-cover-letter-system.md`.
- CV source of truth: `cv-shivani.md` (must be populated before running).

Outputs:
- `jds/shivani/JD_<CompanySlug>_<RoleSlug>_Shivani_Anghan_<YYYY-MM-DD>.md`
- `resumes/shivani/<CompanySlug>_<RoleSlug>_Shivani_Anghan_Resume_<YYYY-MM-DD>.pdf`
- `resume-logs/shivani/<CompanySlug>_<RoleSlug>_Shivani_Anghan_Resume_<YYYY-MM-DD>.log`
- `cover-letters/shivani/<CompanySlug>_<RoleSlug>_Shivani_Anghan_Cover_Letter_<YYYY-MM-DD>.pdf`
- `cover-letter-logs/shivani/<CompanySlug>_<RoleSlug>_Shivani_Anghan_Cover_Letter_<YYYY-MM-DD>.log`
- One JSONL line per run in `data/shivani-resume-runs.log`.

See `modes/shivani-resume-pipeline.md` for the full per-URL loop.
```

- [ ] **Step 3: Update the Yash Resume Pipeline section's path references**

In the existing `### Yash Resume Pipeline (yash-resume-pipeline)` section, update:
- `data/pipeline.md` → `data/yash-pipeline.md`
- `jds/JD_<CompanySlug>` → `jds/yash/JD_<CompanySlug>`
- `resumes/<CompanySlug>` → `resumes/yash/<CompanySlug>`
- `resume-logs/` → `resume-logs/yash/`
- `cover-letters/` → `cover-letters/yash/`
- `cover-letter-logs/` → `cover-letter-logs/yash/`

- [ ] **Step 4: Verify AGENTS.md integrity**

```bash
grep -n "shivani-resume-pipeline\|Shivani Resume Pipeline" AGENTS.md | head -10
grep -n "data/pipeline\.md" AGENTS.md  # should be 0 matches
```

Expected: first grep finds references, second grep finds nothing.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add shivani-resume-pipeline to AGENTS.md skill modes + section"
```

---

## Task 11: Create Shivani tests

**Files:**
- Create: `tests/shivani-resume-pipeline.test.mjs`
- Create: `tests/test-shivani-pipeline-smoke.mjs`

- [ ] **Step 1: Generate shivani unit tests from yash unit tests**

```bash
cp tests/yash-resume-pipeline.test.mjs tests/shivani-resume-pipeline.test.mjs

# Import target
sed -i "s|from '\.\./yash-resume-pipeline\.mjs'|from '../shivani-resume-pipeline.mjs'|g" tests/shivani-resume-pipeline.test.mjs

# Temp dir prefix
sed -i "s|'yrp-test-'|'srp-test-'|g" tests/shivani-resume-pipeline.test.mjs

# Pipeline queue filename in temp helpers
sed -i "s|data/yash-pipeline\.md|data/shivani-pipeline.md|g" tests/shivani-resume-pipeline.test.mjs

# Script constant
sed -i "s|resolve(ROOT, 'yash-resume-pipeline\.mjs')|resolve(ROOT, 'shivani-resume-pipeline.mjs')|g" tests/shivani-resume-pipeline.test.mjs

# Person name in path assertions
sed -i "s|Yash_Anghan|Shivani_Anghan|g" tests/shivani-resume-pipeline.test.mjs

# Subdir in path assertions
sed -i "s|jds/yash/|jds/shivani/|g" tests/shivani-resume-pipeline.test.mjs
sed -i "s|resumes/yash/|resumes/shivani/|g" tests/shivani-resume-pipeline.test.mjs
sed -i "s|cover-letters/yash/|cover-letters/shivani/|g" tests/shivani-resume-pipeline.test.mjs
sed -i "s|cover-letter-logs/yash/|cover-letter-logs/shivani/|g" tests/shivani-resume-pipeline.test.mjs

# Test description strings (cosmetic)
sed -i "s|yash-resume-pipeline|shivani-resume-pipeline|g" tests/shivani-resume-pipeline.test.mjs
sed -i "s|'yash-pipeline\.md'|'shivani-pipeline.md'|g" tests/shivani-resume-pipeline.test.mjs
```

- [ ] **Step 2: Verify Shivani unit test syntax**

```bash
node --check tests/shivani-resume-pipeline.test.mjs && echo "syntax OK"
```

Expected: `syntax OK`

- [ ] **Step 3: Run Shivani unit tests**

```bash
node --test tests/shivani-resume-pipeline.test.mjs 2>&1 | tail -20
```

Expected: all tests pass. If failures, read failure messages, fix remaining hardcoded paths.

- [ ] **Step 4: Generate Shivani smoke test from Yash smoke test**

```bash
cp tests/test-yash-pipeline-smoke.mjs tests/test-shivani-pipeline-smoke.mjs

# Header comment
sed -i "s|test-yash-pipeline-smoke\.mjs|test-shivani-pipeline-smoke.mjs|g" tests/test-shivani-pipeline-smoke.mjs
sed -i "s|yash-resume-pipeline|shivani-resume-pipeline|g" tests/test-shivani-pipeline-smoke.mjs

# Script constant
sed -i "s|resolve(ROOT, 'yash-resume-pipeline\.mjs')|resolve(ROOT, 'shivani-resume-pipeline.mjs')|g" tests/test-shivani-pipeline-smoke.mjs

# PW session dir name
sed -i "s|pw-smoke-|pw-smoke-shivani-|g" tests/test-shivani-pipeline-smoke.mjs

# tmp dir name
sed -i "s|\.tmp-smoke|\.tmp-smoke-shivani|g" tests/test-shivani-pipeline-smoke.mjs
```

- [ ] **Step 5: Verify smoke test syntax**

```bash
node --check tests/test-shivani-pipeline-smoke.mjs && echo "syntax OK"
```

Expected: `syntax OK`

- [ ] **Step 6: Commit**

```bash
git add tests/shivani-resume-pipeline.test.mjs tests/test-shivani-pipeline-smoke.mjs
git commit -m "test: add shivani-resume-pipeline unit tests and smoke test"
```

---

## Task 12: Update test-all.mjs

**Files:**
- Modify: `test-all.mjs`

- [ ] **Step 1: Add Shivani syntax check**

In `test-all.mjs`, section 1 (Syntax checks) already uses `readdirSync(ROOT).filter(f => f.endsWith('.mjs'))` which auto-picks up `shivani-resume-pipeline.mjs`. No change needed here.

- [ ] **Step 2: Add Shivani unit test section**

Find the block at the bottom of `test-all.mjs`:
```js
// ── 11. YASH RESUME PIPELINE UNIT TESTS ─────────────────────────

console.log('\n11. yash-resume-pipeline unit tests');

const ypResult = run('node', ['--test', 'tests/yash-resume-pipeline.test.mjs'], { timeout: 60000 });
if (ypResult !== null) {
  pass('yash-resume-pipeline tests passed');
} else {
  fail('yash-resume-pipeline.test.mjs failed');
}

// ── SUMMARY ─────────────────────────────────────────────────────
```

Replace it with:
```js
// ── 11. YASH RESUME PIPELINE UNIT TESTS ─────────────────────────

console.log('\n11. yash-resume-pipeline unit tests');

const ypResult = run('node', ['--test', 'tests/yash-resume-pipeline.test.mjs'], { timeout: 60000 });
if (ypResult !== null) {
  pass('yash-resume-pipeline tests passed');
} else {
  fail('yash-resume-pipeline.test.mjs failed');
}

// ── 12. SHIVANI RESUME PIPELINE UNIT TESTS ──────────────────────

console.log('\n12. shivani-resume-pipeline unit tests');

const spResult = run('node', ['--test', 'tests/shivani-resume-pipeline.test.mjs'], { timeout: 60000 });
if (spResult !== null) {
  pass('shivani-resume-pipeline tests passed');
} else {
  fail('shivani-resume-pipeline.test.mjs failed');
}

// ── SUMMARY ─────────────────────────────────────────────────────
```

- [ ] **Step 3: Verify test-all.mjs syntax**

```bash
node --check test-all.mjs && echo "syntax OK"
```

Expected: `syntax OK`

- [ ] **Step 4: Commit**

```bash
git add test-all.mjs
git commit -m "test: add shivani-resume-pipeline unit tests to test-all.mjs"
```

---

## Task 13: Final validation

- [ ] **Step 1: Run the full test suite**

```bash
node test-all.mjs 2>&1 | tee /tmp/test-all-output.txt
```

Expected: all tests pass. The output should end with:
```
🟢 All tests passed — safe to push/merge
```

If any test fails, read the failure message and fix the specific issue. Common failure patterns:
- `yash-resume-pipeline.test.mjs failed` → likely a path string in the test still uses the old pattern; grep for the old string and fix
- `shivani-resume-pipeline.test.mjs failed` → same as above but in shivani test file
- `shivani-resume-pipeline.mjs syntax errors` → the sed substitution created a double-replacement; inspect the file

- [ ] **Step 2: Verify next-pending subcommand for both pipelines**

```bash
# Yash pipeline: empty queue returns status:empty
node yash-resume-pipeline.mjs next-pending
# Expected: {"status":"empty"}

# Shivani pipeline: empty queue returns status:empty
node shivani-resume-pipeline.mjs next-pending
# Expected: {"status":"empty"}
```

- [ ] **Step 3: Verify slugify produces correct person-namespaced paths**

```bash
node yash-resume-pipeline.mjs slugify --company "Google" --role "Senior Data Engineer"
# Expected: {"status":"ok","company_slug":"Google","role_slug":"SeniorDataEngineer","date":"<today>"}
# Confirm: buildJdPath would give jds/yash/JD_Google_SeniorDataEngineer_Yash_Anghan_<today>.md

node shivani-resume-pipeline.mjs slugify --company "Google" --role "Senior Data Engineer"
# Expected: {"status":"ok","company_slug":"Google","role_slug":"SeniorDataEngineer","date":"<today>"}
# Confirm: buildJdPath would give jds/shivani/JD_Google_SeniorDataEngineer_Shivani_Anghan_<today>.md
```

- [ ] **Step 4: Verify slash command files exist**

```bash
ls .claude/commands/yash-resume-pipeline.md .claude/commands/shivani-resume-pipeline.md
cat .claude/commands/shivani-resume-pipeline.md
```

Expected: both files exist. Shivani command body is:
```
Read modes/shivani-resume-pipeline.md and follow it.
```

- [ ] **Step 5: Verify all Yash artifacts accessible at new paths**

```bash
ls jds/yash/*.md | wc -l      # should be 11
ls resumes/yash/*.pdf | wc -l  # should be 11
ls resume-logs/yash/*.log | wc -l  # should be 10+
ls cover-letters/yash/*.pdf | wc -l  # should be 8
ls cover-letter-logs/yash/ | wc -l  # should be 9+
```

- [ ] **Step 6: Final commit if any loose files remain uncommitted**

```bash
git status
# If any files are untracked/modified:
git add -A
git commit -m "chore: final cleanup after shivani-resume-pipeline implementation"
```

- [ ] **Step 7: Confirm clean working tree**

```bash
git status
```

Expected: `nothing to commit, working tree clean`
