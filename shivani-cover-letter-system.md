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
