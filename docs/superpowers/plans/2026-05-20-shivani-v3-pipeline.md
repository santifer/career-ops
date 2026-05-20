# Shivani V3.1 Identity Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt V3.1 prompt (`V3-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md`, Full Stack Java Developer @ CIBC/HCLTech/Accenture, Banking & Financial Services) as canonical for the Shivani pipeline; rewrite cv-shivani.md and shivani-cover-letter-system.md to match; update all pipeline wiring; supersede V2-era docs; run one URL end-to-end.

**Architecture:** Content-only changes (no code) for the rewrite phase. Live run uses the prompt-agnostic `shivani-resume-pipeline.mjs` driver as-is. Locked prompts (V3 resume, V3.1 cover letter, cv-shivani.md) are loaded into context via `cat` in Bash to bypass the claude-mem `PreToolUse:Read` truncation hook. Tectonic XeTeX patch (`\ifdefined\pdfgentounicode...\fi`) applied at .tex write time, never to V3 itself.

**Tech Stack:** Node.js (driver), Python 3 + Scrapling (JD fetcher), Tectonic (LaTeX → PDF), pypdf (page count verification), Bash (orchestration).

**Spec reference:** [docs/superpowers/specs/2026-05-20-shivani-v3-pipeline-design.md](../specs/2026-05-20-shivani-v3-pipeline-design.md)

---

## Phase A — Identity content rewrites

### Task 1: Rewrite cv-shivani.md to V3.1 mirror

**Files:**
- Modify (wholesale rewrite): `cv-shivani.md`

- [ ] **Step 1.1: Confirm old content is git-tracked**

```bash
git log --oneline -- cv-shivani.md | head -3
```

Expected: at least one commit history line. Old Azure DE content lives in git history if rollback is ever needed.

- [ ] **Step 1.2: Write the new cv-shivani.md**

Use the Write tool to replace `cv-shivani.md` with this exact content:

````markdown
# Shivani Anghan

shivanianghan11@gmail.com | +1 (647) 249-4955 | [LinkedIn](https://www.linkedin.com/in/shivani-swe-ll/) | [GitHub](https://github.com/shivani-swe-ll) | Toronto, ON, Canada

---

## Summary

Full Stack Java Developer with 4+ years of experience building production-grade banking and financial services applications across retail banking, core banking modernization, and foundational banking modules. Hands-on expertise in Java, Spring Boot, microservices, RESTful APIs, Hibernate/JPA, and Angular/React, with deep familiarity in Oracle SQL and PL/SQL on regulated banking workloads. Demonstrated track record of delivering modernized banking systems that substantially improve customer experience, operational efficiency, and regulatory alignment.

---

## Work Experience

### CIBC | Toronto, ON, Canada
**Software Engineer** | Feb 2024 – Present

Software Engineer on the digital banking platform team, contributing to retail banking microservices, mobile and online banking channels, and payments/fraud surfaces. Day-to-day work spans Spring Boot backend services, Angular/React channel frontends, and Kubernetes-deployed services on AWS, with AI coding assistants (Claude Code, GitHub Copilot, Cursor) integrated into the development workflow.

- Built and maintained Spring Boot microservices for the retail banking platform handling daily transaction loads, contributing to throughput and stability improvements across the digital banking estate.
- Delivered full-stack features across Angular/React channel UIs and Spring Boot backend, contributing to mobile and online banking customer experiences (balance, transfer, bill pay, fraud signals).
- Integrated AI coding assistants (Claude Code, GitHub Copilot, Cursor) into development workflows for boilerplate, test generation, and refactoring of banking microservices, accelerating delivery cadence.
- Designed REST APIs for mobile banking flows and supported event-driven banking transaction streams via Apache Kafka with audit feed integration.

### HCLTech | Ahmedabad, India
**Full Stack Java Developer** | Aug 2022 – Nov 2023

Full Stack Java Developer on a tier-1 banking client's core banking modernization program, executing monolith-to-microservices migration, SOAP-to-REST modernization, and Angular-based portal redesign within an onshore-offshore delivery model.

- Modernized core banking services from a monolithic application toward a Spring Boot microservices architecture, measurably reducing legacy system reliance for the client's retail banking platform.
- Engineered Hibernate/JPA persistence layers for transactional banking workloads and contributed to Oracle PL/SQL refactoring during the core banking modernization.
- Delivered Angular-based banking client portal modernization replacing legacy UIs, coordinating closely with backend integration teams on SOAP-to-REST migration.
- Built Kafka-based decoupling between legacy and modernized banking systems and OAuth-secured banking APIs aligned with PSD2 compliance requirements.

### Accenture | Bengaluru, India
**Java Developer** | Feb 2021 – Jul 2022

Java Developer on banking client engagements, working on banking application modules (loan, account, statement) using Core Java, Spring, Hibernate, and Oracle SQL/PL-SQL within Agile delivery teams.

- Developed banking module backend services for loan, account, and statement processing using Core Java, Spring, and Hibernate within the engagement framework.
- Wrote Oracle SQL and PL/SQL queries for end-of-day batch jobs and customer/account data extraction routines supporting downstream banking analytics.
- Implemented JUnit and Mockito test coverage for foundational banking modules and supported REST endpoints for customer onboarding and card management.
- Followed Agile delivery practices and contributed to Docker image builds for banking module build/test environments.

---

## Technical Skills

**Languages & Frameworks:** Java, Spring Boot, Spring MVC, Spring Security, JPA, Spring Data JPA, J2EE, JSP

**Backend Technologies:** Microservices, RESTful APIs, SOAP, Hibernate, OAuth 2.0, Apache Kafka, JMS, Messaging

**Frontend Technologies:** Angular, React, TypeScript, JavaScript, HTML5, CSS3, Bootstrap, jQuery

**Cloud Platforms:** AWS (EC2, S3, RDS, Lambda, ECS), Azure (App Service, AKS, Functions), GCP, Azure DevOps

**DevOps & Tools:** Docker, Kubernetes, Jenkins, GitHub Actions, Maven, Gradle, Git, GitLab CI

**Testing Frameworks:** JUnit, Mockito, Selenium, Cucumber, Postman, REST Assured, TestNG

**Database & Methodologies:** Oracle, PostgreSQL, MySQL, MongoDB, PL/SQL, Agile, Scrum, TDD, CI/CD, Pair Programming

**AI & ML tools:** Claude Code, GitHub Copilot, Cursor, ChatGPT, Gemini, LangChain (basic), LLM tooling

**Other Technologies:** Linux, Bash, JIRA, Confluence, ServiceNow, Splunk, Swagger/OpenAPI, IntelliJ, VS Code

---

## Education

### Gujarat Technological University | Gujarat, India
**Bachelor of Engineering in Information Technology** | Sept 2016 – May 2020

---

## Certifications

- AWS Certified Solutions Architect – Associate — June 2025
- Databricks Certified Data Engineer Associate — February 2026
- Microsoft Certified: Azure Data Fundamentals (DP-900) — January 2026
- Microsoft Certified: Azure Fundamentals (AZ-900) — December 2025
````

- [ ] **Step 1.3: Measure skill-category character lengths against V3 caps**

Run this one-liner to verify each category fits within V3's locked caps:

```bash
python3 - <<'PY'
caps = {
    'Languages & Frameworks': 97,
    'Backend Technologies': 105,
    'Frontend Technologies': 94,
    'Cloud Platforms': 106,
    'DevOps & Tools': 96,
    'Testing Frameworks': 88,
    'Database & Methodologies': 101,
    'AI & ML tools': 88,
    'Other Technologies': 101,
}
with open('cv-shivani.md', encoding='utf-8') as f:
    text = f.read()
import re
fails = []
for cat, cap in caps.items():
    m = re.search(r'\*\*' + re.escape(cat) + r':\*\*\s*(.+)', text)
    if not m:
        fails.append((cat, 'missing'))
        continue
    body = m.group(1).strip()
    n = len(body)
    status = 'OK' if n <= cap else 'OVER'
    print(f'{cat}: {n}/{cap} {status}')
    if n > cap:
        fails.append((cat, f'{n} > {cap}'))
print('---')
print('FAILS:', fails if fails else 'none')
PY
```

Expected: every category prints `OK`. `FAILS: none`. If any category prints `OVER`, trim that category's content (drop the lowest-priority terms) and rerun until clean.

- [ ] **Step 1.4: Verify identity match against V3 locked template**

```bash
grep -E "shivanianghan11@gmail|647.{2,4}249-4955|shivani-swe-ll|CIBC.*Software Engineer|HCLTech.*Full Stack Java Developer|Accenture.*Java Developer" cv-shivani.md | wc -l
```

Expected: ≥ 6 lines matched (all 6 of the above patterns appear).

- [ ] **Step 1.5: Verify old identity is gone**

```bash
grep -E "Metro Inc|Adani Enterprises|Maveric Systems|shivanianghan98@gmail|Azure Data Engineer|Data Analyst" cv-shivani.md | wc -l
```

Expected: `0`.

- [ ] **Step 1.6: Commit**

```bash
git add cv-shivani.md
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(shivani-cv): pivot to V3.1 Full Stack Java Banking identity

Wholesale rewrite of cv-shivani.md to mirror V3-Shivani-Anghan-
Resume-Optimization-System-XML-Markdown.md locked template:
CIBC/HCLTech/Accenture employers, new contact details
(shivanianghan11@gmail.com, +1 647-249-4955, shivani-swe-ll
handles), 9 named skill categories within V3's per-category char
caps, V3-locked certifications. Identity pivot is user-confirmed
real history. Old Azure DE content preserved in git history.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Rewrite shivani-cover-letter-system.md to V3.1 harmonized framework

**Files:**
- Modify (wholesale rewrite): `shivani-cover-letter-system.md`

This file is a locked prompt. After rewrite, it must NEVER be loaded via the Read tool — only via `cat` in Bash at runtime. The rewrite itself uses the Write tool (which is fine — Write is bypassed by the claude-mem hook).

- [ ] **Step 2.1: Confirm current cover letter content is git-tracked**

```bash
git log --oneline -- shivani-cover-letter-system.md | head -3
```

Expected: at least one commit history line. V1.0 content preserved in git.

- [ ] **Step 2.2: Write the new shivani-cover-letter-system.md (V3.1 harmonized)**

Use the Write tool to replace `shivani-cover-letter-system.md` with the V3.1-harmonized content. The complete content follows; copy verbatim.

````markdown
# Cover Letter Optimization System V3.1 — Shivani Anghan (Full Stack Java Developer, Banking & Financial Services)

```xml
<cover_letter_optimization_system>
  <metadata>
    <title>Cover Letter Optimization System V3.1 — Shivani Anghan (Full Stack Java Developer, Banking & Financial Services)</title>
    <version>3.1</version>
    <sibling_of>V3-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md</sibling_of>
    <revision_notes>
      <note>Full harmonization with V3 resume framework: phase id tags, binary verification system, output rules with constraint priority order, final deliverable standards, execution command</note>
      <note>Identity pivoted from Azure Data Engineer to Full Stack Java Developer (Banking and Financial Services)</note>
      <note>Archetypes: Software Engineer Banking (CIBC), Full Stack Java Banking Modernization (HCLTech), Java Foundational Banking (Accenture), Other-Fallback</note>
      <note>Locked 4-paragraph skeleton with 12-16 sentence count band preserved from V1.0</note>
      <note>Locked proof points P1-P6 drafted from V3 contextual transformation examples and cv-shivani.md, qualitative outcomes only (no false-precision metrics)</note>
      <note>Resume keyword echo floor: 5+ shared bolded terms; less triggers -10 Content Relevance deduction</note>
      <note>LaTeX preamble matches V3 margins for visual continuity</note>
      <note>Contact in LaTeX matches V3 locked values (shivanianghan11@gmail.com, +1 647-249-4955, shivani-swe-ll handles)</note>
    </revision_notes>
  </metadata>

  <primary_directive>
    <instruction>
When provided with a job description AND a tailored resume LaTeX:
1. Execute all phases internally (do not output intermediate analysis)
2. Build the cover letter from the locked 4-paragraph skeleton, injecting JD keywords from the resume's bolded set
3. Apply the binary verification system in Phase 5
4. Score using the explicit formula in Phase 7
5. Apply output rules based on the prioritized condition hierarchy

If score >=90 AND all binary checks PASS -> Output ONLY the complete LaTeX code
If any STOP-priority binary check fails -> Output the appropriate error format with no LaTeX
If score <90 (no STOP) or non-STOP check fails -> Output deficiency log + corrected LaTeX
    </instruction>
    <processing_mode>Internal analysis required but not output unless errors occur</processing_mode>
    <critical_constraint>USE locked proof points only. Do NOT invent metrics or accomplishments.</critical_constraint>
    <inputs_expected>
      <input name="jd_body">The cleaned JD markdown from jds/shivani/JD_&lt;...&gt;_&lt;date&gt;.md</input>
      <input name="resume_latex">The tailored resume .tex from /tmp/&lt;...&gt;_Resume_&lt;date&gt;.tex</input>
    </inputs_expected>
  </primary_directive>

  <!-- ============================================================ -->
  <!-- PHASE 0.5: JD QUALITY ASSESSMENT                              -->
  <!-- ============================================================ -->
  <phase id="0.5">
    <phase_name>JD QUALITY ASSESSMENT</phase_name>
    <purpose>Detect whether the JD is a Full Stack Java / Banking domain match and select archetype before composition.</purpose>
    <signals>
      <signal weight="high">Banking and Financial Services terms (banking, payments, fraud, retail banking, core banking, regulatory, KYC, AML, Interac, mobile banking, online banking)</signal>
      <signal weight="high">Full Stack Java terms (Java, Spring Boot, microservices, RESTful APIs, Hibernate, JPA, Oracle, SQL, Angular, React, Kafka)</signal>
      <signal weight="medium">Modernization terms (monolith to microservices, legacy migration, SOAP to REST, cloud migration)</signal>
      <signal weight="medium">AI coding assistant terms (Copilot, Claude Code, Cursor, ChatGPT, LLM, Generative AI, Agentic Workflows) - CIBC archetype only</signal>
    </signals>
    <result_classification>
      <class name="strong_match">>=8 high-weight signals -> Full optimization mode</class>
      <class name="adequate_match">4-7 high-weight signals -> Partial optimization mode (relax banking-vocabulary check from 3 of 4 paragraphs to 2 of 4)</class>
      <class name="weak_match">&lt;4 high-weight signals -> Output contextualization warning before composition, then proceed with Other-Fallback archetype</class>
    </result_classification>
  </phase>

  <!-- ============================================================ -->
  <!-- PHASE 1: JD ANALYSIS AND RESUME ECHO SET                      -->
  <!-- ============================================================ -->
  <phase id="1">
    <phase_name>JD ANALYSIS AND RESUME ECHO SET</phase_name>
    <analysis_steps>
      <step number="1">Extract company name, role title, and the single hiring problem the JD describes (what pain or capability gap is the team buying?).</step>
      <step number="2">Extract high-priority JD keywords (appearing 2+ times OR in a required-skills section).</step>
      <step number="3">Build the resume_keyword_echo_set: scan the supplied resume LaTeX for every term inside \textbf{...} and collect them.</step>
      <step number="4">Identify the JD archetype using these signals:
        <archetype name="Software Engineer Banking">Retail banking microservices, mobile/online banking channels, payments/fraud, AI coding assistants (Copilot/Claude/Cursor), Spring Boot + Angular/React full-stack at a Tier-1 Canadian bank</archetype>
        <archetype name="Full Stack Java Banking Modernization">Core banking modernization, monolith-to-microservices migration, SOAP-to-REST modernization, Hibernate/JPA, Angular portal redesign, onshore-offshore delivery</archetype>
        <archetype name="Java Foundational Banking">Banking modules (loan/account/statement), Core Java + Spring + Hibernate, Oracle SQL/PL-SQL, batch jobs, JUnit/Mockito, foundational REST endpoints, Agile delivery</archetype>
        <archetype name="Other / Fallback">None of the above dominates - use Software Engineer Banking framing with a generic banking context</archetype>
      </step>
    </analysis_steps>
  </phase>

  <!-- ============================================================ -->
  <!-- PHASE 2: LOCKED 4-PARAGRAPH SKELETON                          -->
  <!-- ============================================================ -->
  <phase id="2">
    <phase_name>LOCKED 4-PARAGRAPH SKELETON</phase_name>
    <skeleton>
      <paragraph number="1" purpose="Hook" sentences="3-4">
        <required>Names role and company explicitly in the first sentence.</required>
        <required>Leads with the candidate's background: Full Stack Java Developer experience building production-grade banking and financial services applications.</required>
        <required>Includes one qualitative hero outcome from the locked proof points (no false-precision metrics).</required>
        <prohibited>Generic openers like "I am writing to apply for..." - start with a value claim, not boilerplate.</prohibited>
      </paragraph>
      <paragraph number="2" purpose="Why I match" sentences="4-5">
        <required>Direct keyword/responsibility echo from the JD.</required>
        <required>2-3 proof points from the locked &lt;approved_proof_points&gt; list, each mapped to a specific JD requirement.</required>
        <required>Wrap at least 2 high-priority JD keywords in \textbf{} in this paragraph (the total across all 4 paragraphs is 4-7, governed by Phase 4). Prioritize terms already in the resume_keyword_echo_set.</required>
        <prohibited>Listing every skill - this is not the resume.</prohibited>
      </paragraph>
      <paragraph number="3" purpose="Why this company" sentences="3-4">
        <required>Reference one specific company detail from the JD (mission, product surface, banking domain emphasis, scale, customer mix, regulatory posture).</required>
        <required>State why that detail matters to the candidate's trajectory in Full Stack Java Banking.</required>
        <prohibited>Generic culture fluff like "I admire your culture" or "I love what you stand for."</prohibited>
      </paragraph>
      <paragraph number="4" purpose="Close" sentences="2-3">
        <required>Forward-looking action line ("looking forward to discussing...", "would welcome the chance to...").</required>
        <required>Sign-off: write `Sincerely,` then a blank-line paragraph break, then `Shivani Anghan` on its own paragraph. Do NOT use `\\` line breaks - the `\setlength{\parskip}{8pt}` preamble setting handles vertical spacing.</required>
        <prohibited>Repeating qualifications already covered in paragraphs 1-2.</prohibited>
      </paragraph>
    </skeleton>
    <total_sentence_band>12 to 16 sentences inclusive. Outside this band triggers PARAGRAPH_COUNT_ERROR.</total_sentence_band>
    <resume_echo_requirement>At least 5 keywords from resume_keyword_echo_set must appear (bolded or unbolded) in the cover letter. Echoing fewer triggers a -10 score deduction (Content Relevance).</resume_echo_requirement>
  </phase>

  <!-- ============================================================ -->
  <!-- PHASE 3: LOCKED PROOF POINTS (ANTI-HALLUCINATION)             -->
  <!-- ============================================================ -->
  <phase id="3">
    <phase_name>LOCKED PROOF POINTS</phase_name>
    <approved_proof_points>
      <proof_point id="P1">
        <name>Retail banking microservices delivery</name>
        <context>CIBC, digital banking platform team</context>
        <qualitative_outcome>Substantially improved digital banking platform stability and throughput across the Spring Boot microservices estate</qualitative_outcome>
        <archetypes>Software Engineer Banking, Other/Fallback</archetypes>
      </proof_point>
      <proof_point id="P2">
        <name>Core banking modernization</name>
        <context>HCLTech, tier-1 banking client core banking modernization program</context>
        <qualitative_outcome>Measurably reduced legacy banking system reliance via monolith-to-microservices migration and SOAP-to-REST modernization</qualitative_outcome>
        <archetypes>Full Stack Java Banking Modernization</archetypes>
      </proof_point>
      <proof_point id="P3">
        <name>Banking module backend services</name>
        <context>Accenture, banking client engagements covering loan, account, and statement modules</context>
        <qualitative_outcome>Significantly improved code quality and delivery cadence on banking modules using Core Java, Spring, and Hibernate within Agile delivery</qualitative_outcome>
        <archetypes>Java Foundational Banking</archetypes>
      </proof_point>
      <proof_point id="P4">
        <name>AI-assisted development workflow</name>
        <context>CIBC, current digital banking platform team</context>
        <qualitative_outcome>Meaningfully accelerated boilerplate, test generation, and refactoring cycles on banking microservices via Claude Code, GitHub Copilot, and Cursor</qualitative_outcome>
        <archetypes>Software Engineer Banking (CIBC only - do not use for HCLTech or Accenture)</archetypes>
      </proof_point>
      <proof_point id="P5">
        <name>Full-stack feature delivery</name>
        <context>CIBC and HCLTech, Angular and React channel UIs with Spring Boot backend</context>
        <qualitative_outcome>Substantially improved channel-side feature velocity for mobile and online banking flows (balance, transfer, bill pay, customer portals)</qualitative_outcome>
        <archetypes>Software Engineer Banking, Full Stack Java Banking Modernization</archetypes>
      </proof_point>
      <proof_point id="P6">
        <name>Persistence and batch banking data layer</name>
        <context>Accenture and HCLTech, Hibernate/JPA persistence and Oracle PL/SQL batch jobs</context>
        <qualitative_outcome>Measurably improved transactional banking data layer reliability and end-of-day batch processing consistency</qualitative_outcome>
        <archetypes>Java Foundational Banking, Full Stack Java Banking Modernization</archetypes>
      </proof_point>
    </approved_proof_points>

    <archetype_allocation>
      <rule archetype="Software Engineer Banking">Paragraph 2 must use 2-3 of: P1, P4, P5. P4 (AI-assisted development) may be referenced here; do not place AI assistant claims in any other archetype.</rule>
      <rule archetype="Full Stack Java Banking Modernization">Paragraph 2 must use 2-3 of: P2, P5, P6. Emphasize modernization scope and legacy-to-modern migration.</rule>
      <rule archetype="Java Foundational Banking">Paragraph 2 must use 2-3 of: P3, P6, plus a foundational Java/Spring detail verbatim from cv-shivani.md (banking modules, SQL/PL-SQL, JUnit/Mockito).</rule>
      <rule archetype="Other / Fallback">Paragraph 2 uses P1 + a Full Stack Java Banking background narrative; do not cherry-pick metrics from outside the locked list.</rule>
    </archetype_allocation>

    <invention_check>
      Any metric or accomplishment NOT listed in &lt;approved_proof_points&gt; or NOT verbatim from cv-shivani.md is a violation. Triggers PROOF_POINT_VIOLATION (no LaTeX output).
    </invention_check>

    <metric_honesty>
      Use qualitative language only: significantly, substantially, measurably, meaningfully. NEVER use false-precision metrics (e.g., "37.2%", "53.7M transactions", "exactly 42% improvement"). Mirrors V3 resume rule.
    </metric_honesty>
  </phase>

  <!-- ============================================================ -->
  <!-- PHASE 3B: JD-KEYWORD TO BANKING-CONTEXT MAPPING               -->
  <!-- ============================================================ -->
  <phase id="3B">
    <phase_name>JD-KEYWORD TO BANKING-CONTEXT MAPPING</phase_name>
    <purpose>Translate each high-priority JD keyword into the appropriate banking-domain phrasing per archetype, so paragraph 2 reads as banking-Java prose rather than a JD-keyword list.</purpose>
    <contextual_transformation_examples>
      <example>
        <jd_keyword>Spring Boot</jd_keyword>
        <software_engineer_banking>Retail banking microservices for the digital banking platform</software_engineer_banking>
        <full_stack_modernization>Core banking modernization for tier-1 client engagement</full_stack_modernization>
        <java_foundational>Banking module backend services (loan, account, statement)</java_foundational>
      </example>
      <example>
        <jd_keyword>Microservices</jd_keyword>
        <software_engineer_banking>Digital banking platform decomposition (payments, accounts, fraud)</software_engineer_banking>
        <full_stack_modernization>Monolith-to-microservices transformation for retail banking client</full_stack_modernization>
        <java_foundational>Individual service modules within a broader microservices program</java_foundational>
      </example>
      <example>
        <jd_keyword>RESTful APIs</jd_keyword>
        <software_engineer_banking>Mobile and online banking channel APIs (balance, transfer, bill pay)</software_engineer_banking>
        <full_stack_modernization>SOAP-to-REST modernization for banking integration layer</full_stack_modernization>
        <java_foundational>REST endpoints for customer onboarding and card management modules</java_foundational>
      </example>
      <example>
        <jd_keyword>Hibernate</jd_keyword>
        <software_engineer_banking>ORM tuning for transactional banking workloads</software_engineer_banking>
        <full_stack_modernization>JPA entity modeling for core banking modernization</full_stack_modernization>
        <java_foundational>Repository and entity layer for banking application modules</java_foundational>
      </example>
      <example>
        <jd_keyword>Oracle / PL-SQL</jd_keyword>
        <software_engineer_banking>Transaction reporting and fraud analytics queries on Oracle-backed banking workloads</software_engineer_banking>
        <full_stack_modernization>Oracle PL/SQL refactoring during core banking modernization</full_stack_modernization>
        <java_foundational>Oracle SQL and PL/SQL development for end-of-day batch jobs</java_foundational>
      </example>
      <example>
        <jd_keyword>Apache Kafka</jd_keyword>
        <software_engineer_banking>Event-driven banking transaction streams and audit feeds</software_engineer_banking>
        <full_stack_modernization>Kafka-based decoupling between legacy and modernized banking systems</full_stack_modernization>
        <java_foundational>Foundational Kafka producer/consumer integration within banking modules</java_foundational>
      </example>
      <example>
        <jd_keyword>Angular or React</jd_keyword>
        <software_engineer_banking>Banking ops portal and selected customer-facing flows on Angular/React</software_engineer_banking>
        <full_stack_modernization>Angular frontend modernization replacing legacy banking UIs</full_stack_modernization>
        <java_foundational>React components for banking portals where full-stack work is required</java_foundational>
      </example>
      <example>
        <jd_keyword>OAuth 2.0</jd_keyword>
        <software_engineer_banking>Open banking and partner API authorization flows</software_engineer_banking>
        <full_stack_modernization>OAuth-secured APIs aligned with PSD2 for banking clients</full_stack_modernization>
        <java_foundational>OAuth client integration within banking module service calls</java_foundational>
      </example>
      <example>
        <jd_keyword>Docker / Kubernetes</jd_keyword>
        <software_engineer_banking>Containerized Spring Boot banking microservices on Kubernetes</software_engineer_banking>
        <full_stack_modernization>Containerization of modernized banking applications for cloud migration</full_stack_modernization>
        <java_foundational>Docker images for banking module build/test environments</java_foundational>
      </example>
      <example>
        <jd_keyword>AI Coding Assistant (Copilot/Claude/Cursor)</jd_keyword>
        <software_engineer_banking>Pair-coding with AI assistants for boilerplate, test generation, and refactoring in banking microservices</software_engineer_banking>
        <full_stack_modernization>N/A (do not place here)</full_stack_modernization>
        <java_foundational>N/A (do not place here)</java_foundational>
      </example>
    </contextual_transformation_examples>
    <distribution_rules>
      <rule>If a JD keyword appears in 2 archetype contexts in paragraph 2, use DIFFERENT banking phrasings.</rule>
      <rule>AI coding assistant keywords appear ONLY in Software Engineer Banking (CIBC) paragraphs.</rule>
      <rule>JD keywords that do not match candidate verified skills appear in Technical Skills mentions only (not bolded in body prose).</rule>
    </distribution_rules>
  </phase>

  <!-- ============================================================ -->
  <!-- PHASE 4: KEYWORD INJECTION AND ATS OPTIMIZATION               -->
  <!-- ============================================================ -->
  <phase id="4">
    <phase_name>KEYWORD INJECTION AND ATS OPTIMIZATION</phase_name>
    <keyword_rules>
      <rule>Wrap 4-7 high-priority JD keywords in \textbf{} across the 4 paragraphs.</rule>
      <rule>Prioritize keywords already bolded in the resume (resume_keyword_echo_set).</rule>
      <rule>Do not bold the same keyword twice - ATS doesn't reward repetition.</rule>
      <rule>Never bold a keyword that doesn't actually appear in the JD.</rule>
    </keyword_rules>
    <latex_escape_rules>
      <rule>Hash: # -> \#</rule>
      <rule>Ampersand: in LaTeX body, write the literal sequence backslash-ampersand (\&amp;) - do not include any HTML/XML entity.</rule>
      <rule>Percent: % -> \%</rule>
      <rule>Dollar: $ -> \$</rule>
      <rule>Underscore: _ -> \_</rule>
    </latex_escape_rules>
    <unicode_rule>No Unicode special characters (curly quotes, em dashes, arrows). Use ASCII equivalents.</unicode_rule>
  </phase>

  <!-- ============================================================ -->
  <!-- PHASE 5: BINARY VERIFICATION SYSTEM                           -->
  <!-- ============================================================ -->
  <phase id="5">
    <phase_name>BINARY VERIFICATION SYSTEM</phase_name>
    <instruction>Each check below results in PASS or FAIL - no partial scores. Run all checks before scoring.</instruction>

    <binary_verification_system>
      <check name="Paragraph Count" category="STOP">
        <method>Count blank-line-separated body paragraphs (excluding date/address/salutation/closing)</method>
        <pass_criteria>Exactly 4</pass_criteria>
        <fail_criteria>!= 4</fail_criteria>
        <result_on_fail>HALT - Output PARAGRAPH_COUNT_ERROR (no LaTeX)</result_on_fail>
      </check>

      <check name="Total Sentence Band" category="STOP">
        <method>Count sentences across all 4 paragraphs</method>
        <pass_criteria>12 to 16 inclusive</pass_criteria>
        <fail_criteria>&lt; 12 or > 16</fail_criteria>
        <result_on_fail>HALT - Output PARAGRAPH_COUNT_ERROR (no LaTeX)</result_on_fail>
      </check>

      <check name="Proof Point Invention" category="STOP">
        <method>Scan every metric, accomplishment, and project claim in body; verify each traces to P1-P6 or cv-shivani.md verbatim</method>
        <pass_criteria>Zero invented details</pass_criteria>
        <fail_criteria>Any metric/claim not in approved_proof_points or cv-shivani.md</fail_criteria>
        <result_on_fail>HALT - Output PROOF_POINT_VIOLATION (no LaTeX)</result_on_fail>
      </check>

      <check name="Bolded JD Keyword Count" category="IMPORTANT">
        <method>Count \textbf{} occurrences in body (excluding "Re:" line)</method>
        <pass_criteria>4 to 7 inclusive</pass_criteria>
        <fail_criteria>&lt; 4 or > 7</fail_criteria>
        <result_on_fail>Output deficiency report with corrected LaTeX</result_on_fail>
      </check>

      <check name="Resume Keyword Echo" category="IMPORTANT">
        <method>Count resume_keyword_echo_set entries that appear (bolded or unbolded) anywhere in cover letter body</method>
        <pass_criteria>>= 5</pass_criteria>
        <fail_criteria>&lt; 5</fail_criteria>
        <result_on_fail>-10 score deduction (Content Relevance); output corrected LaTeX</result_on_fail>
      </check>

      <check name="Banking Domain Vocabulary" category="CONTEXT">
        <method>Verify body paragraphs contain banking and financial services vocabulary (retail banking, core banking, payments, fraud, mobile/online banking, regulatory, KYC, AML, batch jobs, customer onboarding, loan/account/statement, etc.)</method>
        <pass_criteria>At least 3 of 4 body paragraphs contain banking vocabulary (relax to 2 of 4 if Phase 0.5 classified the JD as adequate_match)</pass_criteria>
        <fail_criteria>Banking-vocabulary paragraphs below threshold</fail_criteria>
        <result_on_fail>Output CONTEXTUALIZATION_DEFICIENCY with corrected LaTeX</result_on_fail>
      </check>

      <check name="Archetype Authenticity" category="CONTEXT">
        <method>Verify paragraph 2 proof point selection matches the detected archetype per &lt;archetype_allocation&gt; rules; verify AI coding assistant claims only appear in Software Engineer Banking archetype</method>
        <pass_criteria>All proof point selections match archetype allocation rules; AI keywords absent from non-CIBC archetypes</pass_criteria>
        <fail_criteria>Archetype-allocation rule violation</fail_criteria>
        <result_on_fail>Output CONTEXTUALIZATION_DEFICIENCY with corrected LaTeX</result_on_fail>
      </check>

      <check name="Metric Honesty" category="CONTEXT">
        <method>Scan body for false-precision metric formats (e.g., "37.2%", "53.7M transactions", "exactly 42% improvement"). Allowed: significantly, substantially, measurably, meaningfully</method>
        <pass_criteria>Zero false-precision metrics</pass_criteria>
        <fail_criteria>Any false-precision metric</fail_criteria>
        <result_on_fail>Output deficiency report with corrected LaTeX (replace with qualitative descriptors)</result_on_fail>
      </check>

      <check name="Salutation and Closing" category="STRUCTURE">
        <method>Verify salutation is exactly "Dear Hiring Manager," and closing is "Sincerely," on its own line followed by a blank line followed by "Shivani Anghan" on its own line (no `\\` line breaks anywhere in body or closing)</method>
        <pass_criteria>Exact match</pass_criteria>
        <fail_criteria>Any deviation</fail_criteria>
        <result_on_fail>Output deficiency report with corrected LaTeX</result_on_fail>
      </check>
    </binary_verification_system>
  </phase>

  <!-- ============================================================ -->
  <!-- PHASE 6: LATEX SYNTAX VALIDATION                              -->
  <!-- ============================================================ -->
  <phase id="6">
    <phase_name>LATEX SYNTAX VALIDATION</phase_name>
    <latex_validation_checklist>
      <check name="Brace Matching">
        <instruction>Count total { and } in document - must be equal</instruction>
      </check>
      <check name="Command Integrity">
        <instruction>Verify \textbf{} wrappers are complete (not truncated)</instruction>
        <instruction>Verify all \href{}{...} commands have both braces filled</instruction>
      </check>
      <check name="Special Character Escaping">
        <instruction>Scan output for unescaped special characters: # &amp; % $ _</instruction>
        <instruction>Verify all instances are properly escaped with backslash</instruction>
      </check>
      <check name="Environment Closure">
        <instruction>Verify \begin{document} has corresponding \end{document}</instruction>
        <instruction>Verify \begin{center} has corresponding \end{center}</instruction>
      </check>
      <check name="No Invalid Characters">
        <instruction>Verify no Unicode special characters exist in LaTeX code (curly quotes, em dashes, arrows, bullets, emoji)</instruction>
      </check>
    </latex_validation_checklist>
  </phase>

  <!-- ============================================================ -->
  <!-- PHASE 7: QUALITY SCORING AND OUTPUT RULES                     -->
  <!-- ============================================================ -->
  <phase id="7">
    <phase_name>QUALITY SCORING AND OUTPUT RULES</phase_name>
    <scoring_rubric>
      <minimum_required_score>90 of 100</minimum_required_score>
      <criteria>
        <criterion name="Constraint Adherence" max="30">
          <component points="12">Exactly 4 paragraphs present</component>
          <component points="10">Total sentence count is 12-16</component>
          <component points="8">All proof points from approved list (no inventions)</component>
        </criterion>
        <criterion name="Content Relevance" max="25">
          <formula>5 points per high-priority JD keyword wrapped in \textbf{} or echoed in body, capped at 5 keywords (25 max)</formula>
        </criterion>
        <criterion name="ATS Compatibility" max="20">
          <component points="5">Header + contact row present</component>
          <component points="5">Salutation present and correct</component>
          <component points="5">4-paragraph body present</component>
          <component points="5">Closing + signature line present</component>
        </criterion>
        <criterion name="Contextual Authenticity" max="15">
          <component points="5">Hook ties to candidate background (Full Stack Java Banking applied to target role)</component>
          <component points="5">Paragraph 3 references a specific JD-supplied company detail (not generic)</component>
          <component points="5">No generic culture fluff</component>
        </criterion>
        <criterion name="Technical Accuracy" max="10">
          <component points="5">All LaTeX special characters escaped</component>
          <component points="5">All \textbf{} commands properly opened and closed; brace count balanced</component>
        </criterion>
      </criteria>
      <deduction>-10 points (Content Relevance) if resume_keyword_echo_set overlap is &lt; 5</deduction>
    </scoring_rubric>

    <output_decision_logic>
      <rule priority="1">IF Paragraph Count or Sentence Band check FAILS -> HALT, output PARAGRAPH_COUNT_ERROR only (no LaTeX)</rule>
      <rule priority="2">IF Proof Point Invention check FAILS -> HALT, output PROOF_POINT_VIOLATION only (no LaTeX)</rule>
      <rule priority="3">IF any CONTEXT check FAILS -> Output CONTEXTUALIZATION_DEFICIENCY + corrected LaTeX</rule>
      <rule priority="4">IF score &lt; 90 (no STOP) -> Output OPTIMIZATION INCOMPLETE + deficiency log + corrected LaTeX</rule>
      <rule priority="5">IF score >= 90 AND all binary checks PASS -> Output ONLY complete LaTeX from \documentclass to \end{document}, no commentary</rule>
    </output_decision_logic>

    <output_formats>
      <condition id="1">
        <criteria>Score >= 90 AND all binary checks PASS</criteria>
        <output_format>
          <instruction>Output ONLY the complete LaTeX code from \documentclass to \end{document}. No explanations, analysis, or commentary.</instruction>
        </output_format>
      </condition>

      <condition id="2">
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

      <condition id="3">
        <criteria>Any CONTEXT check FAILS</criteria>
        <output_format>
CONTEXTUALIZATION DEFICIENCY DETECTED
Issue: [Specific contextualization problem - e.g., missing banking vocabulary, AI keyword in wrong archetype, archetype-allocation violation]
Affected paragraphs: [Count]
Correction Applied: [How it was fixed]

[Complete corrected LaTeX]
        </output_format>
      </condition>

      <condition id="4" priority="STOP">
        <criteria>Paragraph Count or Sentence Band check FAILS</criteria>
        <output_format>
PARAGRAPH_COUNT_ERROR - CANNOT PROCEED
Required: 4 paragraphs, 12-16 sentences total
Actual paragraphs: [N]
Actual sentences: [N]
Resolution Required: Adjust counts to match the locked skeleton before proceeding.
        </output_format>
      </condition>

      <condition id="5" priority="STOP">
        <criteria>Proof Point Invention check FAILS</criteria>
        <output_format>
PROOF_POINT_VIOLATION - CANNOT PROCEED
Invented detail: [the specific metric or claim that is not in the approved list]
Resolution Required: Replace with an approved proof point from the locked list or a verbatim claim from cv-shivani.md.
        </output_format>
      </condition>
    </output_formats>
  </phase>

  <!-- ============================================================ -->
  <!-- CONSTRAINT PRIORITY ORDER                                     -->
  <!-- ============================================================ -->
  <constraint_priority_order>
    <description>Highest to lowest priority when conflicts arise:</description>
    <priority level="1">PARAGRAPH COUNT and SENTENCE BAND (absolute - never deviate)</priority>
    <priority level="2">PROOF POINT INVENTION CHECK (no invented metrics or claims, ever)</priority>
    <priority level="3">SECTION STRUCTURE (header, date+address, salutation, 4 body paragraphs, closing)</priority>
    <priority level="4">BOLDED KEYWORD COUNT (4-7 across all paragraphs)</priority>
    <priority level="5">BANKING CONTEXTUAL AUTHENTICITY (paragraphs must read as Full Stack Java Banking prose)</priority>
    <priority level="6">ARCHETYPE AUTHENTICITY (proof point selections match detected archetype; AI keywords CIBC-only)</priority>
    <priority level="7">RESUME KEYWORD ECHO (>= 5 echoes)</priority>
    <priority level="8">METRIC HONESTY (qualitative language only)</priority>

    <conflict_resolution>
      <description>When constraints conflict:</description>
      <rule priority="1">Paragraph count and sentence band take absolute precedence</rule>
      <rule priority="2">Drop or reduce keyword bolding before reducing sentence count</rule>
      <rule priority="3">Shorten qualitative outcome phrases before removing keywords</rule>
      <rule priority="4">As last resort, move overflow keywords to paragraph 1 hook instead of paragraph 2</rule>
    </conflict_resolution>
  </constraint_priority_order>

  <!-- ============================================================ -->
  <!-- FINAL DELIVERABLE STANDARDS                                   -->
  <!-- ============================================================ -->
  <final_deliverable_standards>
    <standard>Complete, compilable LaTeX document from \documentclass to \end{document}</standard>
    <standard>Single page (cover letter never exceeds one page)</standard>
    <standard>Exact 4-paragraph body, 12-16 sentences total</standard>
    <standard>4-7 \textbf{} keywords across body</standard>
    <standard>>= 5 resume_keyword_echo_set entries echoed in body</standard>
    <standard>All proof points trace to P1-P6 or cv-shivani.md verbatim</standard>
    <standard>All sentences use qualitative outcome language - zero false-precision metrics</standard>
    <standard>Banking and Financial Services vocabulary in >= 3 of 4 body paragraphs</standard>
    <standard>Archetype-allocation rules honored; AI coding assistant claims appear only in Software Engineer Banking (CIBC) paragraphs</standard>
    <standard>All LaTeX special characters properly escaped; no Unicode special characters; braces balanced; environments closed</standard>
    <standard>Salutation: "Dear Hiring Manager,"; Closing: "Sincerely," (blank line) "Shivani Anghan"; no `\\` line breaks</standard>
  </final_deliverable_standards>

  <!-- ============================================================ -->
  <!-- EXECUTION COMMAND                                             -->
  <!-- ============================================================ -->
  <execution_command>
    <description>When a JD and a tailored resume LaTeX are provided, execute in this order:</description>
    <execution_step order="0.5">Execute Phase 0.5 -> JD quality assessment and optimization mode selection</execution_step>
    <execution_step order="1">Execute Phase 1 -> JD analysis, resume_keyword_echo_set extraction, archetype detection</execution_step>
    <execution_step order="2">Execute Phase 2 -> Compose 4 paragraphs from locked skeleton (12-16 sentences total)</execution_step>
    <execution_step order="3">Execute Phase 3 -> Allocate proof points by archetype; run invention check</execution_step>
    <execution_step order="3B">Execute Phase 3B -> Translate JD keywords into archetype-appropriate banking contexts</execution_step>
    <execution_step order="4">Execute Phase 4 -> Inject \textbf{} keywords and apply LaTeX escapes</execution_step>
    <execution_step order="5">Execute Phase 5 -> Run binary verification system</execution_step>
    <execution_step order="6">Execute Phase 6 -> Validate LaTeX syntax</execution_step>
    <execution_step order="7">Execute Phase 7 -> Score, then apply output rules priority hierarchy</execution_step>
    <execution_step order="8">Substitute the four template placeholders in the LaTeX output:
      - [INSERT_DATE_LONG] -> today's date as `Month DD, YYYY` with zero-padded day (e.g., `May 20, 2026`).
      - [INSERT_COMPANY_NAME] -> JD frontmatter `company` field verbatim.
      - [INSERT_COMPANY_LOCATION] -> JD frontmatter `location` field verbatim; if missing/null/empty, OMIT the location line entirely.
      - [INSERT_ROLE_TITLE] -> JD frontmatter `role` field verbatim.
    </execution_step>
    <execution_step order="9">Replace each [PARAGRAPH N: ...] placeholder in the LaTeX with the actual paragraph composed in Phase 2 (4 body paragraphs total).</execution_step>
  </execution_command>

  <!-- ============================================================ -->
  <!-- BASE LATEX TEMPLATE                                           -->
  <!-- ============================================================ -->
  <base_latex_template>
    <latex_code>
\documentclass[11pt,letterpaper]{article}
\usepackage[empty]{fullpage}
\usepackage[hidelinks]{hyperref}
\usepackage[english]{babel}
\usepackage{fontawesome5}
\usepackage{xcolor}

\addtolength{\oddsidemargin}{-0.7in}
\addtolength{\evensidemargin}{-0.7in}
\addtolength{\textwidth}{1.4in}
\addtolength{\topmargin}{-0.8in}
\addtolength{\textheight}{1.6in}

\pagestyle{empty}
\raggedright
\setlength{\parindent}{0pt}
\setlength{\parskip}{8pt}

\begin{document}

%----------HEADING----------
\begin{center}
{\Huge \scshape Shivani Anghan} \\ \vspace{2pt}
\small \raisebox{-0.1\height}\faEnvelope\ \href{mailto:shivanianghan11@gmail.com}{shivanianghan11@gmail.com} ~
\raisebox{-0.1\height}\faPhone\ +1 (647) 249-4955 ~
\href{https://www.linkedin.com/in/shivani-swe-ll/}{\raisebox{-0.2\height}\faLinkedin\ \underline{Linkedin}} ~
\href{https://github.com/shivani-swe-ll}{\raisebox{-0.2\height}\faGithub\ \underline{GitHub}} ~
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

[PARAGRAPH 1: Hook -- 3-4 sentences. Names role + company. Leads with Full Stack Java Banking background. One qualitative hero outcome from locked proof points.]

[PARAGRAPH 2: Why I match -- 4-5 sentences. JD keyword echo. 2-3 approved proof points allocated by archetype. \textbf{} on at least 2 high-priority JD keywords echoing the resume; the total across all paragraphs is 4-7 (see Phase 4).]

[PARAGRAPH 3: Why this company -- 3-4 sentences. Specific JD-supplied company detail. Why it matters to candidate's Full Stack Java Banking trajectory.]

[PARAGRAPH 4: Close -- 2-3 sentences. Forward-looking action line.]

Sincerely,

Shivani Anghan

\end{document}
    </latex_code>
  </base_latex_template>
</cover_letter_optimization_system>
```
````

- [ ] **Step 2.3: Verify XML well-formedness and key markers**

```bash
grep -c "<phase id=" shivani-cover-letter-system.md
```
Expected: `8` (phases 0.5, 1, 2, 3, 3B, 4, 5, 6, 7 — but `<phase id="N">` strings count 8 because 0.5 is one tag).

Actually run this to count phase openings precisely:

```bash
grep -E "<phase id=\"[^\"]+\">" shivani-cover-letter-system.md
```
Expected output lines (one per phase): `<phase id="0.5">`, `<phase id="1">`, `<phase id="2">`, `<phase id="3">`, `<phase id="3B">`, `<phase id="4">`, `<phase id="5">`, `<phase id="6">`, `<phase id="7">` — 9 lines total.

- [ ] **Step 2.4: Verify identity values and locked-prompt references**

```bash
grep -E "shivanianghan11@gmail|647.{2,4}249-4955|shivani-swe-ll|Full Stack Java|V3-Shivani-Anghan-Resume-Optimization" shivani-cover-letter-system.md | wc -l
```
Expected: ≥ 8 hits.

```bash
grep -E "shivanianghan98|Azure Data Engineer|Metro Inc|Adani|Maveric" shivani-cover-letter-system.md | wc -l
```
Expected: `0`.

- [ ] **Step 2.5: Confirm closing tag and root element**

```bash
head -3 shivani-cover-letter-system.md; echo "---"; tail -5 shivani-cover-letter-system.md
```
Expected head: `# Cover Letter Optimization System V3.1 — Shivani Anghan (Full Stack Java Developer, Banking & Financial Services)` then ```` ```xml ```` then `<cover_letter_optimization_system>`. Expected tail: `</base_latex_template>`, `</cover_letter_optimization_system>`, ```` ``` ````.

- [ ] **Step 2.6: Commit**

```bash
git add shivani-cover-letter-system.md
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(shivani-cover-letter): full V3.1 harmonization with resume prompt

Wholesale rewrite of shivani-cover-letter-system.md from V1.0 to
V3.1. Adopts V3 resume prompt's idioms: <phase id="N"> tag
structure, binary verification system with PASS/FAIL gates,
output rules with constraint priority order, final deliverable
standards, execution command. Identity pivot from Azure Data
Engineer archetypes to Full Stack Java Banking archetypes
(Software Engineer Banking / Full Stack Java Banking
Modernization / Java Foundational Banking / Other-Fallback).
Locked proof points P1-P6 drafted from V3 contextual
transformation examples + new cv-shivani.md, qualitative
outcomes only. LaTeX preamble + contact match V3 for visual
continuity.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase B — Pipeline wiring updates

### Task 3: Update modes/shivani-resume-pipeline.md (V2 path → V3 path; V3.0 → V3.1)

**Files:**
- Modify: `modes/shivani-resume-pipeline.md`

- [ ] **Step 3.1: Catalog all V2/V3.0 references in the mode file**

```bash
grep -nE "V2-Shivani-Anghan-Resume-Optimization|V3\.0[^.]|Apply the V3\.0 prompt" modes/shivani-resume-pipeline.md
```
Expected: 2 hits for `V2-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md` and 2-3 hits for `V3.0` (title line, step 7, and at least one inline reference).

- [ ] **Step 3.2: Replace V2 path with V3 path (all occurrences)**

Use the Edit tool with `replace_all: true`:
- old_string: `V2-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md`
- new_string: `V3-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md`
- replace_all: true

- [ ] **Step 3.3: Replace V3.0 → V3.1 in the title line and step 7 text**

Edit (specific instance) — title line:
- old_string: `# Mode: shivani-resume-pipeline — JD-extract → V3.0-resume two-phase pipeline`
- new_string: `# Mode: shivani-resume-pipeline — JD-extract → V3.1-resume two-phase pipeline`

Edit (specific instance) — step 7 instruction:
- old_string: `7. **Apply the V3.0 prompt:**`
- new_string: `7. **Apply the V3.1 prompt:**`

If there are additional `V3.0` occurrences (e.g., in step 7 body text "V3.0 hard-fail" or hard-rules entry), edit each to V3.1 using Edit with the exact surrounding context to keep replacements unambiguous.

- [ ] **Step 3.4: Verify no V2 / V3.0 / Shivani-Azure-DE refs remain**

```bash
grep -nE "V2-Shivani-Anghan-Resume-Optimization|V3\.0|Azure Data Engineer" modes/shivani-resume-pipeline.md
```
Expected: `0` matching lines.

- [ ] **Step 3.5: Verify V3.1 references are present**

```bash
grep -nE "V3-Shivani-Anghan-Resume-Optimization|V3\.1" modes/shivani-resume-pipeline.md
```
Expected: ≥ 4 matching lines.

(Defer commit; bundle with Tasks 4–6 in Task 7.)

---

### Task 4: Update AGENTS.md (Shivani Resume Pipeline section)

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 4.1: Locate the Shivani section**

```bash
grep -nE "^### Shivani Resume Pipeline|targeting Azure Data Engineer|shivanianghan98|V2-Shivani-Anghan-Resume|locked V3\.0 resume prompt|locked V3\.0 prompt" AGENTS.md
```
Note line numbers of each hit.

- [ ] **Step 4.2: Replace V2 path with V3 path**

Edit:
- old_string: `V2-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md`
- new_string: `V3-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md`
- replace_all: true (only the Shivani section uses this string anyway, but `replace_all` is safe here)

- [ ] **Step 4.3: Update tagline and version**

Edit (specific) — tagline:
- old_string: `A dedicated resume + cover-letter pipeline for Shivani Anghan targeting Azure Data Engineer roles. Mirrors the Yash pipeline structure but uses Shivani's CV, locked V3.0 prompt, and separate output directories.`
- new_string: `A dedicated resume + cover-letter pipeline for Shivani Anghan targeting Full Stack Java / Software Developer roles in Banking & Financial Services. Mirrors the Yash pipeline structure but uses Shivani's CV, locked V3.1 prompt, and separate output directories.`

Edit (specific) — second V3.0 reference if present:
- old_string: `The locked V3.0 resume prompt at \`V3-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md\``
- new_string: `The locked V3.1 resume prompt at \`V3-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md\``

(Note: by this point Step 4.2 has already replaced the V2 string with V3; if AGENTS.md said "The locked V3.0 resume prompt at V2-Shivani-...", this edit handles the V3.0→V3.1 swap on the same line.)

- [ ] **Step 4.4: Update contact email**

Edit:
- old_string: `shivanianghan98@gmail.com`
- new_string: `shivanianghan11@gmail.com`
- replace_all: true

- [ ] **Step 4.5: Verify**

```bash
awk '/^### Shivani Resume Pipeline/,/^### |^---$|^## /' AGENTS.md | head -40
```
Confirm: V3.1 + V3-Shivani-... + Full Stack Java / Banking & Financial Services + shivanianghan11@gmail.com all present. No V2 path, no V3.0, no Azure Data Engineer, no shivanianghan98 within the Shivani section.

(Defer commit.)

---

### Task 5: Update .claude/commands/shivani-resume-pipeline.md

**Files:**
- Modify: `.claude/commands/shivani-resume-pipeline.md`

- [ ] **Step 5.1: Edit description line**

Edit:
- old_string: `description: Run the JD-extract → V3.0-resume pipeline for Shivani Anghan (one URL at a time).`
- new_string: `description: Run the JD-extract → V3.1-resume pipeline for Shivani Anghan (one URL at a time).`

- [ ] **Step 5.2: Verify**

```bash
cat .claude/commands/shivani-resume-pipeline.md
```
Expected: description line now reads `V3.1-resume`.

(Defer commit.)

---

### Task 6: Grep + update .claude/skills + .opencode for Shivani V2/V3.0 refs

**Files:**
- Possibly modify: `.claude/skills/career-ops/SKILL.md`, `.opencode/commands/*.md`

- [ ] **Step 6.1: Scan for Shivani-context V2/V3.0/old-identity strings**

```bash
grep -rnE "V2-Shivani-Anghan-Resume-Optimization|Shivani.*Azure Data Engineer|Azure Data Engineer.*Shivani|shivanianghan98|V3\.0.*[Ss]hivani|[Ss]hivani.*V3\.0" .claude/skills/ .opencode/commands/ 2>/dev/null
```
Note every hit (path:line:content).

- [ ] **Step 6.2: For each hit, apply the matching transform**

For each hit, choose the appropriate Edit:
- V2 path → V3 path
- V3.0 (in Shivani context) → V3.1
- Azure Data Engineer (in Shivani context) → Full Stack Java Developer in Banking & Financial Services
- shivanianghan98@gmail.com → shivanianghan11@gmail.com

Note: if a hit is in a doc that mentions BOTH the V2 and V3 paths in a historical comparison sense (e.g., changelog), do not transform — leave historical refs intact and document the exception in the commit message.

- [ ] **Step 6.3: Re-scan to confirm zero residual hits**

```bash
grep -rnE "V2-Shivani-Anghan-Resume-Optimization|Shivani.*Azure Data Engineer|Azure Data Engineer.*Shivani|shivanianghan98" .claude/skills/ .opencode/commands/ 2>/dev/null
```
Expected: empty output.

(Defer commit.)

---

### Task 7: Commit all wiring updates

**Files:** all modified in Tasks 3–6.

- [ ] **Step 7.1: Show what will be committed**

```bash
git status --short modes/shivani-resume-pipeline.md AGENTS.md .claude/commands/shivani-resume-pipeline.md .claude/skills/ .opencode/commands/
git diff --stat modes/shivani-resume-pipeline.md AGENTS.md .claude/commands/shivani-resume-pipeline.md .claude/skills/ .opencode/commands/
```

- [ ] **Step 7.2: Run the full repo-wide V2-Shivani-grep success metric**

```bash
grep -rnE "V2-Shivani-Anghan-Resume-Optimization" modes/ .claude/ .opencode/ AGENTS.md shivani-resume-pipeline.mjs 2>/dev/null
```
Expected: empty output (zero hits). If any hit remains outside the V2 design+plan docs (which are handled separately in Tasks 8–9), go back and fix.

- [ ] **Step 7.3: Commit**

```bash
git add modes/shivani-resume-pipeline.md AGENTS.md .claude/commands/shivani-resume-pipeline.md
# Add .claude/skills and .opencode/commands changes only if Task 6 modified them
git status --short | grep -E "^.M .claude/skills/|^.M .opencode/commands/" | awk '{print $2}' | xargs -r git add
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(shivani-pipeline): wire V3.1 prompt + Full Stack Java Banking identity

- modes/shivani-resume-pipeline.md: V2-Shivani path → V3-Shivani
  path; V3.0 → V3.1 in title + step 7 + hard rules.
- AGENTS.md (Shivani section): V2 path → V3 path; "targeting
  Azure Data Engineer roles" → "targeting Full Stack Java /
  Software Developer roles in Banking & Financial Services";
  contact shivanianghan98@gmail.com → shivanianghan11@gmail.com;
  V3.0 → V3.1.
- .claude/commands/shivani-resume-pipeline.md: V3.0-resume →
  V3.1-resume in description.
- .claude/skills/ and .opencode/commands/: updated any
  Shivani-context V2/V3.0/old-identity references.

Driver (shivani-resume-pipeline.mjs) is prompt-agnostic; no code
changes. Validators (tools/validate_*.py) untouched - Shivani
pipeline doesn't call them.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — Supersede V2-era docs

### Task 8: Add superseded header to V2 design doc

**Files:**
- Modify: `docs/superpowers/specs/2026-05-10-shivani-resume-pipeline-design.md`

- [ ] **Step 8.1: Confirm current first line**

```bash
head -3 docs/superpowers/specs/2026-05-10-shivani-resume-pipeline-design.md
```
Note the first line so we know what to insert before.

- [ ] **Step 8.2: Prepend the superseded banner**

Use the Edit tool with the file's current first line. Capture the first non-blank line and insert the banner above it.

Example (replace `<FIRST_LINE>` with whatever Step 8.1 returned):

Edit:
- old_string: `<FIRST_LINE>`
- new_string: `> **⚠️ Superseded by [docs/superpowers/specs/2026-05-20-shivani-v3-pipeline-design.md](2026-05-20-shivani-v3-pipeline-design.md) (2026-05-20). This document describes the V2-era Shivani pipeline targeting Azure Data Engineer roles. The Shivani pipeline has since been re-canonicalized on the V3.1 prompt (Full Stack Java Developer @ CIBC/HCLTech/Accenture, Banking & Financial Services). Body retained for historical context only.**\n\n<FIRST_LINE>`

(Defer commit.)

---

### Task 9: Add superseded header to V2 plan doc

**Files:**
- Modify: `docs/superpowers/plans/2026-05-10-shivani-resume-pipeline.md`

- [ ] **Step 9.1: Confirm current first line**

```bash
head -3 docs/superpowers/plans/2026-05-10-shivani-resume-pipeline.md
```

- [ ] **Step 9.2: Prepend the same superseded banner**

Same Edit pattern as Step 8.2, with file path `docs/superpowers/plans/2026-05-10-shivani-resume-pipeline.md`. The banner text and link target stay the same (the spec link is relative to the plans/ directory, so use `../specs/2026-05-20-shivani-v3-pipeline-design.md` instead of `2026-05-20-shivani-v3-pipeline-design.md`):

Banner for the plan file:
```
> **⚠️ Superseded by [docs/superpowers/specs/2026-05-20-shivani-v3-pipeline-design.md](../specs/2026-05-20-shivani-v3-pipeline-design.md) (2026-05-20). This document describes the V2-era Shivani pipeline targeting Azure Data Engineer roles. The Shivani pipeline has since been re-canonicalized on the V3.1 prompt (Full Stack Java Developer @ CIBC/HCLTech/Accenture, Banking & Financial Services). Body retained for historical context only.**
```

- [ ] **Step 9.3: Commit both V2 doc updates**

```bash
git add docs/superpowers/specs/2026-05-10-shivani-resume-pipeline-design.md docs/superpowers/plans/2026-05-10-shivani-resume-pipeline.md
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
docs(shivani): mark V2-era spec + plan as superseded by V3.1 design

Prepend a Superseded-by banner to both 2026-05-10-shivani-resume-
pipeline-design.md and 2026-05-10-shivani-resume-pipeline.md,
pointing to 2026-05-20-shivani-v3-pipeline-design.md. Bodies
intact for historical context.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — Smoke test

### Task 10: Run npm run smoke

- [ ] **Step 10.1: Execute the smoke test**

```bash
npm run smoke
```
Expected: exits `0`. The smoke test runs `node tests/e2e-smoke.mjs` which exercises Yash's deterministic surface (validators, slug, phase-timer) against committed Scribd fixtures. Since the Shivani changes are content-only and don't touch the driver or validators, smoke should pass unchanged.

- [ ] **Step 10.2: If smoke fails, halt and investigate**

If exit code is non-zero:
- Capture full output.
- Inspect for any Shivani-content-induced regression (unlikely — Shivani files aren't in the smoke surface).
- Do NOT proceed to live run until smoke is green.

---

## Phase E — End-to-end live run

> Locked-prompt loads (V3, V3.1 cover letter, cv-shivani.md) in this phase MUST go through `cat` in Bash, never the Read tool, to bypass the claude-mem `PreToolUse:Read` hook that truncates such files.

### Task 11: Pop URL + fetch JD via Scrapling

**Files:**
- Read: `data/shivani-pipeline.md`
- Generate: scrapling JSON (stdout, not persisted)

- [ ] **Step 11.1: Pop the next pending URL**

```bash
node shivani-resume-pipeline.mjs next-pending
```
Expected JSON: `{"status":"ok","url":"https://job-boards.greenhouse.io/clutch/jobs/6000418004?gh_src=ca458a634us","line_number":2}`. Capture the URL.

- [ ] **Step 11.2: Fetch JD via Scrapling**

```bash
.venv/bin/python3 scrapling_fetch.py 'https://job-boards.greenhouse.io/clutch/jobs/6000418004?gh_src=ca458a634us'
```
Expected JSON keys: `status: "ok"`, `title`, `body`, `source_hint`. Capture `title`, `body`, `source_hint` for downstream use.

If `status: "fail"`:
```bash
node shivani-resume-pipeline.mjs mark-failed --url '<url>' --reason "scrapling: <error>"
node shivani-resume-pipeline.mjs log --status fail --url '<url>' --reason "scrapling: <error>"
```
Then halt the live run and surface the failure.

- [ ] **Step 11.3: Parse JD fields (company, role, location, posted_date)**

From the scrapling `body` field, infer:
- `company` — extract from the JD body or page title (e.g., "Clutch")
- `role` — extract from the JD body or page title
- `location` — extract from the JD body; null if unknown
- `posted_date` — extract from the JD body; null if unknown
- `source_hint` — value returned by scrapling (greenhouse, lever, ashby, workday, other)

Capture these for Steps 12.x.

- [ ] **Step 11.4: Pre-flight domain check**

Quickly scan the JD body for Full Stack Java / Banking signals. If the JD is clearly NOT a Java + Banking role (e.g., it's a pure-frontend or pure-data role at a non-bank), surface this to the user as a warning before proceeding. V3 will likely produce `CONTEXTUALIZATION_DEFICIENCY` and a lower score; artifacts still land but flagged.

---

### Task 12: Slugify, dedup, write JD .md

- [ ] **Step 12.1: Slugify**

```bash
node shivani-resume-pipeline.mjs slugify --company "<company-from-11.3>" --role "<role-from-11.3>"
```
Expected JSON: `{"status":"ok","company_slug":"<c>","role_slug":"<r>","date":"2026-05-20"}`. Capture the slugs and date.

- [ ] **Step 12.2: Check duplicate**

```bash
node shivani-resume-pipeline.mjs check-duplicate --company-slug <c> --role-slug <r> --date <d>
```
Expected: `{"status":"ok","exists":false,...}`. If `exists: true`, run `mark-skipped` and halt.

- [ ] **Step 12.3: Write JD .md verbatim**

Write `jds/shivani/JD_<c>_<r>_Shivani_Anghan_<d>.md` with this content shape (frontmatter + body):

```markdown
---
company: "<original company name>"
company_slug: <c>
role: "<original role name>"
role_slug: <r>
url: https://job-boards.greenhouse.io/clutch/jobs/6000418004?gh_src=ca458a634us
source: <source_hint>
location: "<location or null>"
posted_date: <YYYY-MM-DD or null>
captured_date: <d>
---

# <role> at <company>

<scrapling body field, verbatim — no summarization, no restructuring>
```

Use the Write tool (writes are not affected by the claude-mem hook).

- [ ] **Step 12.4: Verify JD .md size > 0**

```bash
ls -la jds/shivani/JD_<c>_<r>_Shivani_Anghan_<d>.md
```
Expected: file present, size > 1 KB typically.

---

### Task 13: Generate resume LaTeX via V3.1 prompt (in-context)

- [ ] **Step 13.1: Load V3 prompt + JD .md + cv-shivani.md via cat**

```bash
cat V3-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md
cat jds/shivani/JD_<c>_<r>_Shivani_Anghan_<d>.md
cat cv-shivani.md
```
The cat output goes into primary session context as input to the prompt application.

- [ ] **Step 13.2: Apply V3.1 prompt in-context**

In the primary session, apply the V3 prompt's instructions to the JD body, using cv-shivani.md as the verified-skills/candidate-history anchor. Per V3's output rules:
- If score ≥ 90 and all binary checks PASS → output is LaTeX-only from `\documentclass` to `\end{document}`.
- Otherwise → output has a deficiency log preceding `\documentclass`.

Parse the output:
- Find the first `\documentclass`.
- Capture everything BEFORE it as the deficiency log (or "none" if absent).
- Capture from `\documentclass` to end of output as the LaTeX block.
- Capture the score from the deficiency log if `OPTIMIZATION INCOMPLETE - Score: X/100` is present; otherwise assume ≥ 90.

If the output is a STOP-priority error (CHARACTER LIMIT EXCEEDED HALT, etc.) — no LaTeX block — the resume step has hard-failed. Run:
```bash
node shivani-resume-pipeline.mjs mark-failed --url '<url>' --reason "V3.1 hard-fail: <error-class>"
node shivani-resume-pipeline.mjs log --status fail --url '<url>' --reason "V3.1 hard-fail: <error-class>"
```
Save the full output to the sidecar `.log` and halt.

- [ ] **Step 13.3: Apply the Tectonic XeTeX patch to the LaTeX block**

Search the LaTeX block for these two lines:
```latex
\input{glyphtounicode}

\pdfgentounicode=1
```

Replace each with the wrapped form:
```latex
\ifdefined\pdfgentounicode
\input{glyphtounicode}
\fi

\ifdefined\pdfgentounicode
\pdfgentounicode=1
\fi
```

(Or wrap both inside a single `\ifdefined` block — either is fine. Goal: pdfTeX-only primitives are skipped under Tectonic/XeTeX.)

NEVER edit `V3-Shivani-Anghan-Resume-Optimization-System-XML-Markdown.md` itself — only patch the generated `.tex` block before write.

- [ ] **Step 13.4: Write the patched LaTeX to /tmp**

Use the Write tool to save to `/tmp/<c>_<r>_Shivani_Anghan_Resume_<d>.tex`.

- [ ] **Step 13.5: Verify .tex file is on disk**

```bash
ls -la /tmp/<c>_<r>_Shivani_Anghan_Resume_<d>.tex
head -2 /tmp/<c>_<r>_Shivani_Anghan_Resume_<d>.tex
```
Expected: file size > 1 KB, head shows `\documentclass[letterpaper,11pt]{article}` and `\usepackage{latexsym}`.

---

### Task 14: Compile resume + write sidecar log + verify page count

- [ ] **Step 14.1: Compile resume**

```bash
node shivani-resume-pipeline.mjs compile-resume \
  --tex /tmp/<c>_<r>_Shivani_Anghan_Resume_<d>.tex \
  --pdf resumes/shivani/<c>_<r>_Shivani_Anghan_Resume_<d>.pdf
```
Expected JSON: `{"status":"ok","pdf_path":"resumes/shivani/...","tectonic_log_tail":"..."}`. If `status: fail`:
- Read `tectonic_log_tail` from the JSON for the last 15 lines of stderr.
- Investigate the LaTeX (most likely cause: a special character not escaped, or the XeTeX patch from Step 13.3 wasn't applied).
- Fix the .tex on disk, then re-run compile-resume. Do not retry more than once without surfacing to user.
- If still failing: run `mark-failed` + `log fail` and halt.

- [ ] **Step 14.2: Verify PDF exists and is non-zero**

```bash
ls -la resumes/shivani/<c>_<r>_Shivani_Anghan_Resume_<d>.pdf
```
Expected: size > 10 KB.

- [ ] **Step 14.3: Verify page count = 1 via pypdf**

```bash
.venv/bin/python3 -c "
from pypdf import PdfReader
r = PdfReader('resumes/shivani/<c>_<r>_Shivani_Anghan_Resume_<d>.pdf')
print(len(r.pages))
"
```
Expected: `1`. If `> 1`, the resume overflowed — capture this as a deficiency in the sidecar log; continue (the artifact still lands but flagged).

- [ ] **Step 14.4: Write resume sidecar log**

Write `resume-logs/shivani/<c>_<r>_Shivani_Anghan_Resume_<d>.log` with:

```
score: <X>/100
deficiencies: <text from Step 13.2 deficiency log, or "none">
status: <compiled | compiled-review-recommended>
page_count: <N>
```

Set `status` to `compiled-review-recommended` if score < 90 OR page_count > 1.

---

### Task 15: Generate cover letter LaTeX via V3.1 cover letter prompt (in-context)

- [ ] **Step 15.1: Load cover letter prompt + JD .md + resume .tex via cat**

```bash
cat shivani-cover-letter-system.md
cat jds/shivani/JD_<c>_<r>_Shivani_Anghan_<d>.md
cat /tmp/<c>_<r>_Shivani_Anghan_Resume_<d>.tex
```

- [ ] **Step 15.2: Apply V3.1 cover letter prompt in-context**

Per the prompt's primary directive:
- Execute Phases 0.5 → 7 internally.
- If score ≥ 90 and all binary checks PASS → output LaTeX-only.
- Otherwise → output deficiency log + corrected LaTeX, or a STOP-priority error with no LaTeX.

Parse the output:
- Find the first `\documentclass`.
- If absent: cover letter step hard-fails. Skip Steps 15.3 and 16.x. Write the cover letter sidecar log at step 16.4 with `status: failed` and `score: N/A`, full output captured in `deficiencies`. Do NOT mark the URL failed — the resume PDF already succeeded.
- If present: capture deficiency log (before `\documentclass`) and LaTeX block (from `\documentclass` to end).

- [ ] **Step 15.3: Write the cover letter LaTeX to /tmp**

Write the LaTeX block to `/tmp/<c>_<r>_Shivani_Anghan_Cover_Letter_<d>.tex`.

The cover letter preamble (V3.1) does NOT use `\input{glyphtounicode}` or `\pdfgentounicode` — no Tectonic patch needed.

- [ ] **Step 15.4: Verify .tex file is on disk**

```bash
ls -la /tmp/<c>_<r>_Shivani_Anghan_Cover_Letter_<d>.tex
head -2 /tmp/<c>_<r>_Shivani_Anghan_Cover_Letter_<d>.tex
```
Expected: size > 1 KB; head shows `\documentclass[11pt,letterpaper]{article}` and `\usepackage[empty]{fullpage}`.

---

### Task 16: Compile cover letter + sidecar log + keyword echo verification

- [ ] **Step 16.1: Compile cover letter**

```bash
node shivani-resume-pipeline.mjs compile-cover-letter \
  --tex /tmp/<c>_<r>_Shivani_Anghan_Cover_Letter_<d>.tex \
  --pdf cover-letters/shivani/<c>_<r>_Shivani_Anghan_Cover_Letter_<d>.pdf
```
Expected JSON: `{"status":"ok","pdf_path":"cover-letters/shivani/...","tectonic_log_tail":"..."}`. If `status: fail`, capture `tectonic_log_tail` and continue to Step 16.4 to write a failed sidecar log.

- [ ] **Step 16.2: Verify cover letter PDF exists and is non-zero**

```bash
ls -la cover-letters/shivani/<c>_<r>_Shivani_Anghan_Cover_Letter_<d>.pdf
```
Expected: size > 5 KB.

- [ ] **Step 16.3: Count resume-keyword echoes**

```bash
.venv/bin/python3 - <<'PY'
import re, sys, os
resume_tex = open('/tmp/<c>_<r>_Shivani_Anghan_Resume_<d>.tex').read()
cl_tex = open('/tmp/<c>_<r>_Shivani_Anghan_Cover_Letter_<d>.tex').read()
resume_kw = set(re.findall(r'\\textbf\{([^}]+)\}', resume_tex))
echoed = sum(1 for kw in resume_kw if kw in cl_tex)
print(f'resume bolded keywords: {len(resume_kw)}')
print(f'echoes in cover letter: {echoed}')
print(f'pass (>=5): {echoed >= 5}')
PY
```
(Replace `<c>`, `<r>`, `<d>` literally before running.)
Expected: `pass (>=5): True`. If False, capture as deficiency.

- [ ] **Step 16.4: Write cover letter sidecar log**

Write `cover-letter-logs/shivani/<c>_<r>_Shivani_Anghan_Cover_Letter_<d>.log` with:

```
score: <X>/100   (or N/A if hard-failed)
deficiencies: <text from Step 15.2 deficiency log, or "none">
status: <compiled | compiled-review-recommended | failed>
resume_keywords_echoed: <count from Step 16.3>
```

Set `status` to `compiled-review-recommended` if score < 90 OR keyword echoes < 5. Set `status: failed` if Step 15.2 or 16.1 hard-failed (no PDF on disk).

---

### Task 17: mark-processed + NDJSON log

- [ ] **Step 17.1: mark-processed**

```bash
node shivani-resume-pipeline.mjs mark-processed \
  --url 'https://job-boards.greenhouse.io/clutch/jobs/6000418004?gh_src=ca458a634us' \
  --company "<original company>" \
  --role "<original role>" \
  --jd jds/shivani/JD_<c>_<r>_Shivani_Anghan_<d>.md \
  --pdf resumes/shivani/<c>_<r>_Shivani_Anghan_Resume_<d>.pdf \
  --score <resume-score> \
  --cover-letter cover-letters/shivani/<c>_<r>_Shivani_Anghan_Cover_Letter_<d>.pdf \
  --cover-letter-status ok
```
Omit `--cover-letter` and `--cover-letter-status` if the cover letter step failed.

Expected: `{"status":"ok"}`.

- [ ] **Step 17.2: NDJSON log**

```bash
node shivani-resume-pipeline.mjs log \
  --status ok \
  --url 'https://job-boards.greenhouse.io/clutch/jobs/6000418004?gh_src=ca458a634us' \
  --slug <c>_<r> \
  --score <resume-score> \
  --jd jds/shivani/JD_<c>_<r>_Shivani_Anghan_<d>.md \
  --pdf resumes/shivani/<c>_<r>_Shivani_Anghan_Resume_<d>.pdf \
  --cover-letter cover-letters/shivani/<c>_<r>_Shivani_Anghan_Cover_Letter_<d>.pdf \
  --cover-letter-score <cl-score> \
  --cover-letter-status ok
```
Omit cover-letter args if cover letter failed.

Expected: `{"status":"ok"}`.

- [ ] **Step 17.3: Verify URL moved to Procesadas**

```bash
grep -nE "^- \\[(x|!|~)\\] https://job-boards\\.greenhouse\\.io/clutch/jobs/6000418004" data/shivani-pipeline.md
```
Expected: one match in the `## Procesadas` section with `[x]` marker.

```bash
tail -2 data/shivani-resume-runs.log
```
Expected: one NDJSON line with all the run fields.

---

### Task 18: Final verification + report

- [ ] **Step 18.1: Verify all 5 artifacts on disk with non-zero sizes**

```bash
ls -la jds/shivani/JD_<c>_<r>_Shivani_Anghan_<d>.md \
       resumes/shivani/<c>_<r>_Shivani_Anghan_Resume_<d>.pdf \
       resume-logs/shivani/<c>_<r>_Shivani_Anghan_Resume_<d>.log \
       cover-letters/shivani/<c>_<r>_Shivani_Anghan_Cover_Letter_<d>.pdf \
       cover-letter-logs/shivani/<c>_<r>_Shivani_Anghan_Cover_Letter_<d>.log
```
Expected: all 5 files present, all sizes > 0.

- [ ] **Step 18.2: Final-state grep success metric**

```bash
grep -rnE "V2-Shivani-Anghan-Resume-Optimization" modes/ .claude/ .opencode/ AGENTS.md shivani-resume-pipeline.mjs 2>/dev/null
```
Expected: empty output. (Confirms Phase B + C completed the path swap.)

- [ ] **Step 18.3: Read sidecar logs to surface scores + deficiencies**

```bash
cat resume-logs/shivani/<c>_<r>_Shivani_Anghan_Resume_<d>.log
echo "---"
cat cover-letter-logs/shivani/<c>_<r>_Shivani_Anghan_Cover_Letter_<d>.log
```

- [ ] **Step 18.4: Produce final report to user**

Surface a final report covering:
- URL processed
- Company + role
- Scrapling fetch success (yes/no)
- Resume score (out of 100) + page count
- Cover letter score (out of 100) + keyword echo count
- Per-phase timings (if tracked via the phase timer)
- Total per-URL runtime vs 5-min target
- Any deficiencies or review-recommended flags
- Confirmation that `npm run smoke` exited 0
- Final file diff summary (git log --oneline -7)

If the final report shows resume score < 90 OR cover letter score < 90 OR keyword echoes < 5 OR resume page count > 1, the live run is "completed-with-deficiencies" — surface the issue prominently.

- [ ] **Step 18.5: Commit any pipeline-state changes**

The `mark-processed` and `log` subcommands already wrote `data/shivani-pipeline.md` and `data/shivani-resume-runs.log`. Commit them along with the generated artifacts:

```bash
git add data/shivani-pipeline.md data/shivani-resume-runs.log \
        jds/shivani/JD_<c>_<r>_Shivani_Anghan_<d>.md \
        resumes/shivani/<c>_<r>_Shivani_Anghan_Resume_<d>.pdf \
        resume-logs/shivani/<c>_<r>_Shivani_Anghan_Resume_<d>.log \
        cover-letters/shivani/<c>_<r>_Shivani_Anghan_Cover_Letter_<d>.pdf \
        cover-letter-logs/shivani/<c>_<r>_Shivani_Anghan_Cover_Letter_<d>.log
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
chore(shivani-pipeline): record V3.1 live-run artifacts for Clutch job

End-to-end live run on https://job-boards.greenhouse.io/clutch/
jobs/6000418004 produced all 5 artifacts under jds/shivani/,
resumes/shivani/, resume-logs/shivani/, cover-letters/shivani/,
cover-letter-logs/shivani/, plus NDJSON entry in
data/shivani-resume-runs.log and URL moved to Procesadas in
data/shivani-pipeline.md.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

(Run after writing the plan, fix inline.)

**Spec coverage:**
- Spec §1 Goal → Tasks 1–18 collectively address.
- Spec §2 Identity pivot → Task 1 rewrites cv-shivani.md.
- Spec §3 cv-shivani.md restructure → Task 1 inlines full content + Step 1.3 measures char caps.
- Spec §4 Cover letter V3.1 harmonization → Task 2 inlines full V3.1 cover letter content.
- Spec §5 Pipeline wiring → Tasks 3–7.
- Spec §6 V2 docs superseded headers → Tasks 8–9.
- Spec §7 Smoke test → Task 10.
- Spec §8 Live run → Tasks 11–18.
- Spec §9 Rollback plan → covered by per-task commits.
- Spec §10 Success metrics → Steps 7.2, 18.1–18.3.
- Spec §11 Risks → Tectonic patch in Step 13.3 (R2), memory-isolation discipline throughout (R4), pre-flight domain check in Step 11.4 (R3), live-run iteration buffer (R1).
- Spec §12 File diff list → matches Tasks 1–9 + Step 18.5.
- Spec §13 Out of scope → respected (no validator changes, no driver code changes).

**Placeholder scan:** Every step has exact paths, exact commands, and exact text or content. The only deliberate "fill at runtime" tokens are the JD-derived `<c>`, `<r>`, `<d>` placeholders in Tasks 11–18, which are substituted from the slugify output captured in Step 12.1 — that's the intended dataflow, not a placeholder failure.

**Type consistency:** `node shivani-resume-pipeline.mjs <subcommand>` signatures match the existing driver. The validate_bullets/validate_skills tools are NOT called in the Shivani live run (consistent with spec §5.6 + §13).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-20-shivani-v3-pipeline.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration. Best when individual tasks have meaningful failure modes (content composition, LaTeX compile) that benefit from focused review.

2. **Inline Execution** — execute tasks in this session via `superpowers:executing-plans` with batched checkpoints. Better when the live run depends on captured state (slugs, scores) that lives in the primary session context.

For this work, **Inline Execution** is the better fit because Tasks 11–18 (the live run) share state (JD body, slugs, dates, scores) across consecutive tasks; a fresh subagent per task would have to re-capture this state and reload locked prompts, doubling token cost and risking inconsistency.
