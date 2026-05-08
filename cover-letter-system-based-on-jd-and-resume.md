# Cover Letter Optimization System - XML Markdown Format (V1.0)

```xml
<cover_letter_optimization_system>
  <metadata>
    <title>Cover Letter Optimization System for Yash Anghan (AI Automation Engineer)</title>
    <version>1.0</version>
    <sibling_of>resume-optimization-system-based-on-job-description.md</sibling_of>
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
      <input name="jd_body">The cleaned JD markdown from jds/JD_<...>_<date>.md</input>
      <input name="resume_latex">The tailored resume .tex from /tmp/<...>_Resume_<date>.tex</input>
    </inputs_expected>
  </primary_directive>

  <phase_1>
    <n>JD ANALYSIS &amp; RESUME ECHO SET</n>
    <analysis_steps>
      <step number="1">Extract company name, role title, and the single hiring problem the JD describes (what pain or capability gap is the team buying?).</step>
      <step number="2">Extract high-priority JD keywords (appearing 2+ times OR in a "required" section).</step>
      <step number="3">Build the resume_keyword_echo_set: scan the supplied resume LaTeX for every term inside \textbf{...} and collect them.</step>
      <step number="4">Identify the JD archetype using these signals:
        <archetype name="AI/LLM/GenAI Engineer">RAG, LLM, agents, prompt, embeddings, vector DB</archetype>
        <archetype name="AI Automation Engineer">n8n, Make.com, Zapier, workflow automation, low-code</archetype>
        <archetype name="ML Engineer">model training, fine-tuning, MLOps, inference, model lifecycle</archetype>
        <archetype name="AI Software Engineer">full-stack + AI, API + LLM, microservices + AI integration</archetype>
        <archetype name="Other / fallback">none of the above signals dominate</archetype>
      </step>
    </analysis_steps>
  </phase_1>

  <phase_2>
    <n>LOCKED 4-PARAGRAPH SKELETON</n>
    <skeleton>
      <paragraph number="1" purpose="Hook" sentences="3-4">
        <required>Names role and company explicitly in the first sentence.</required>
        <required>Leads with the exit-story: 6+ years enterprise engineering at Bell + Morningstar (10M+ daily transactions) now applied to AI automation.</required>
        <required>Includes one quantified hero metric chosen from the locked proof points.</required>
        <prohibited>Generic openers like "I am writing to apply for..." -- start with a value claim, not boilerplate.</prohibited>
      </paragraph>
      <paragraph number="2" purpose="Why I match" sentences="4-5">
        <required>Direct keyword/responsibility echo from the JD.</required>
        <required>2-3 proof points from the locked &lt;approved_proof_points&gt; list, each mapped to a specific JD requirement.</required>
        <required>Wrap at least 2 high-priority JD keywords in \textbf{} in this paragraph (the total across all 4 paragraphs is 4-7, governed by Phase 4). Prioritize terms already in the resume_keyword_echo_set.</required>
        <prohibited>Listing every skill -- this is not the resume.</prohibited>
      </paragraph>
      <paragraph number="3" purpose="Why this company" sentences="3-4">
        <required>Reference one specific company detail from the JD (mission, product surface, regulatory domain, scale, customer mix).</required>
        <required>State why that detail matters to the candidate's trajectory.</required>
        <prohibited>Generic culture fluff like "I admire your culture" or "I love what you stand for."</prohibited>
      </paragraph>
      <paragraph number="4" purpose="Close" sentences="2-3">
        <required>Forward-looking action line ("looking forward to discussing...", "would welcome the chance to...").</required>
        <required>Sign-off line: Sincerely,\\ Yash Anghan</required>
        <prohibited>Repeating qualifications already covered in paragraphs 1-2.</prohibited>
      </paragraph>
    </skeleton>
    <total_sentence_band>12 to 16 sentences inclusive. Outside this band triggers PARAGRAPH_COUNT_ERROR.</total_sentence_band>
    <resume_echo_requirement>At least 5 keywords from resume_keyword_echo_set must appear (bolded or unbolded) in the cover letter. Echoing fewer triggers a -10 score deduction.</resume_echo_requirement>
  </phase_2>

  <phase_3>
    <n>LOCKED PROOF POINTS (ANTI-HALLUCINATION)</n>
    <approved_proof_points>
      <proof_point id="P1">
        <name>AI Document Processing Pipeline</name>
        <context>Morningstar</context>
        <hero_metric>Reduced manual review time by 65% across 12K monthly fund documents</hero_metric>
        <archetypes>AI/LLM/GenAI, AI Software, fallback</archetypes>
      </proof_point>
      <proof_point id="P2">
        <name>GenAI Classification System</name>
        <context>Morningstar</context>
        <hero_metric>94% accuracy using embeddings and vector similarity</hero_metric>
        <archetypes>AI/LLM/GenAI, ML Engineer</archetypes>
      </proof_point>
      <proof_point id="P3">
        <name>RAG Pipeline for Document Processing</name>
        <context>Morningstar</context>
        <hero_metric>Processed 15K+ documents, reduced extraction time by 75%</hero_metric>
        <archetypes>AI/LLM/GenAI, ML Engineer</archetypes>
      </proof_point>
      <proof_point id="P4">
        <name>Client Onboarding Automation</name>
        <context>Freelance (Make.com)</context>
        <hero_metric>Saved 520+ hours annually</hero_metric>
        <archetypes>AI Automation</archetypes>
      </proof_point>
      <proof_point id="P5">
        <name>E-commerce Automation</name>
        <context>Freelance (N8N)</context>
        <hero_metric>Cut operational costs by $43K/year</hero_metric>
        <archetypes>AI Automation</archetypes>
      </proof_point>
      <proof_point id="P6">
        <name>AI Lead Qualification System</name>
        <context>Freelance (GPT-4)</context>
        <hero_metric>Increased sales productivity by 65%</hero_metric>
        <archetypes>AI Automation</archetypes>
      </proof_point>
    </approved_proof_points>

    <archetype_allocation>
      <rule archetype="AI/LLM/GenAI Engineer">Paragraph 2 must use 2-3 of: P1, P2, P3.</rule>
      <rule archetype="AI Automation Engineer">Paragraph 2 must use 2-3 of: P4, P5, P6.</rule>
      <rule archetype="ML Engineer">Paragraph 2 must use P2 and P3 (both required), plus one enterprise-engineering detail from cv.md (Morningstar AWS inference, 25K+ daily requests, sub-200ms).</rule>
      <rule archetype="AI Software Engineer">Paragraph 2 must use P1 + a Bell/Virtusa enterprise detail (microservices at 45K daily transactions, 99.9% uptime, REST APIs serving 850K subscribers).</rule>
      <rule archetype="Other / fallback">Paragraph 2 uses P1 + the exit-story narrative; do not cherry-pick metrics from outside the locked list.</rule>
    </archetype_allocation>

    <invention_check>
      Any metric or accomplishment NOT listed in &lt;approved_proof_points&gt; or NOT verbatim from cv.md is a violation. Triggers PROOF_POINT_VIOLATION (no LaTeX output).
    </invention_check>
  </phase_3>

  <phase_4>
    <n>KEYWORD INJECTION &amp; ATS OPTIMIZATION</n>
    <keyword_rules>
      <rule>Wrap 4-7 high-priority JD keywords in \textbf{} across the 4 paragraphs.</rule>
      <rule>Prioritize keywords already bolded in the resume (resume_keyword_echo_set).</rule>
      <rule>Do not bold the same keyword twice -- ATS doesn't reward repetition.</rule>
      <rule>Never bold a keyword that doesn't actually appear in the JD.</rule>
    </keyword_rules>
    <latex_escape_rules>
      <rule>Hash: # -> \#</rule>
      <rule>Ampersand: in LaTeX body, write the literal sequence backslash-ampersand (&#x5C;&amp;) — do not include any HTML/XML entity.</rule>
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
      <step>Verify exactly 4 body paragraphs, separated by `\par\vspace{6pt}`. The final paragraph (¶4) must be followed by `\par\vspace{12pt}` before the `Sincerely,` closing.</step>
      <step>Verify every metric and accomplishment traces to the locked proof point list or cv.md verbatim.</step>
      <step>Verify resume_keyword_echo_set overlap >= 5.</step>
      <step>Verify high-priority JD keywords wrapped with \textbf{} count is 4-7.</step>
      <step>Verify all special characters escaped, all \textbf{} commands closed.</step>
      <step>Verify salutation is exactly "Dear Hiring Manager," (no named individuals).</step>
      <step>Verify closing line is "Sincerely,\\ Yash Anghan" (with the exact \\ command).</step>
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
          <component points="5">Hook ties to exit-story (Bell + Morningstar -> AI automation)</component>
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
Problematic Sentence: [the sentence lacking domain/company specificity]
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
      <criteria>Any metric or accomplishment not present in approved_proof_points or cv.md</criteria>
      <output_format>
PROOF_POINT_VIOLATION - CANNOT PROCEED
Invented detail: [the specific metric or claim that is not in the approved list]
Resolution Required: Replace with an approved proof point from the locked list.
      </output_format>
    </condition>
  </output_rules>

  <base_latex_template>
    <latex_code>
\documentclass[letterpaper,11pt]{article}
\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\usepackage{fontawesome5}
\usepackage{multicol}
\setlength{\multicolsep}{-3.0pt}
\setlength{\columnsep}{-1pt}
\ifdefined\pdfgentounicode
\input{glyphtounicode}
\pdfgentounicode=1
\fi
\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}
\addtolength{\oddsidemargin}{-0.7in}
\addtolength{\evensidemargin}{-0.7in}
\addtolength{\textwidth}{1.4in}
\addtolength{\topmargin}{-0.8in}
\addtolength{\textheight}{1.6in}
\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}
\begin{document}
\begin{center}
{\Huge \scshape Yash Anghan} \\ \vspace{2pt}
\small \raisebox{-0.1\height}\faEnvelope\ \href{mailto:yashanghan97@gmail.com}{yashanghan97@gmail.com} ~
\raisebox{-0.1\height}\faPhone\ +1 (437) 290-2005 ~
\href{https://www.linkedin.com/in/yash-aiautomation/}{\raisebox{-0.2\height}\faLinkedin\ \underline{Linkedin}} ~
\href{https://github.com/yash-ai-automation}{\raisebox{-0.2\height}\faGithub\ \underline{GitHub}} ~
\href{https://yash-anghan-ai-automatio-15hmplk.gamma.site/}{\raisebox{-0.2\height}\faGlobe\ \underline{Portfolio}}
\vspace{8pt}
\end{center}
\hfill [INSERT_DATE_YYYY-MM-DD]
\vspace{12pt}

Dear Hiring Manager,\par\vspace{6pt}

[PARAGRAPH 1: Hook -- 3-4 sentences. Names role + company. Leads with exit-story. One hero metric.]
\par\vspace{6pt}

[PARAGRAPH 2: Why I match -- 4-5 sentences. JD keyword echo. 2-3 approved proof points. \textbf{} on 2-4 high-priority JD keywords echoing the resume.]
\par\vspace{6pt}

[PARAGRAPH 3: Why this company -- 3-4 sentences. Specific JD-supplied company detail. Why it matters to candidate.]
\par\vspace{6pt}

[PARAGRAPH 4: Close -- 2-3 sentences. Forward-looking action line.]
\par\vspace{12pt}

Sincerely,\\
Yash Anghan
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
    <step number="7">Replace [INSERT_DATE_YYYY-MM-DD] in the LaTeX output with today's ISO date (e.g., 2026-05-08).</step>
  </execution_command>
</cover_letter_optimization_system>
```
