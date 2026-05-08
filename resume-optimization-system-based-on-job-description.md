# Resume Optimization System - XML Markdown Format (V2.0 - Optimized)

```xml
<resume_optimization_system>
  <metadata>
    <title>Streamlined Resume Optimization System for Yash Anghan (AI Automation Engineer)</title>
    <version>2.0</version>
    <revision_notes>
      <note>Added baseline work experience to prevent hallucination</note>
      <note>Replaced character counting with template-based length control</note>
      <note>Added explicit scoring formulas</note>
      <note>Resolved conflicting output conditions with priority hierarchy</note>
      <note>Added verb and phrase tracking mechanisms</note>
      <note>Constrained metrics to fixed values</note>
    </revision_notes>
  </metadata>

  <!-- ============================================================ -->
  <!-- PRIMARY DIRECTIVE (REVISED) -->
  <!-- ============================================================ -->
  <primary_directive>
    <instruction>
When provided with a job description:
1. Execute all optimization phases internally (do not output intermediate analysis)
2. ENHANCE the baseline work experience sentences by injecting JD keywords—do NOT invent new accomplishments
3. Calculate optimization score using the explicit formula in Phase 6
4. Apply output rules based on the prioritized condition hierarchy

If score ≥90 points AND all constraints pass → Output ONLY the complete LaTeX code
If any constraint fails OR score &lt;90 → Output the appropriate error format, then corrected code
    </instruction>
    <processing_mode>Internal analysis required but not output unless errors occur</processing_mode>
    <critical_constraint>ENHANCE existing baseline sentences—do NOT fabricate new accomplishments from scratch</critical_constraint>
  </primary_directive>

  <!-- ============================================================ -->
  <!-- PHASE 1: JOB ANALYSIS & INTEGRITY CHECK -->
  <!-- ============================================================ -->
  <phase_1>
    <n>JOB ANALYSIS &amp; INTEGRITY CHECK</n>
    
    <analysis_steps>
      <step number="1">Extract all required and preferred technical skills from the job description.</step>
      <step number="2">Extract key responsibilities and qualifications.</step>
      <step number="3">Identify high-priority keywords using this definition:
        <high_priority_definition>Keywords appearing 2+ times in JD OR listed in "required qualifications" section</high_priority_definition>
      </step>
      <step number="4">Identify secondary keywords: All other technical terms mentioned once or in "preferred" section</step>
    </analysis_steps>
    
    <template_preservation_rule status="STRICT">
      <allowed_modifications>
        <modification>
          <section>"Work Experience" content</section>
          <action>ENHANCE baseline sentences by injecting high-priority JD keywords using \textbf{} formatting</action>
          <constraint>Must preserve the core meaning and context of baseline sentences</constraint>
        </modification>
        <modification>
          <section>"Technical Skills" content</section>
          <action>Populate skill items from JD, without \textbf{} formatting</action>
        </modification>
      </allowed_modifications>
      
      <prohibited_modifications>
        <prohibition>Contact information</prohibition>
        <prohibition>Education section</prohibition>
        <prohibition>Certifications section</prohibition>
        <prohibition>Header formatting</prohibition>
        <prohibition>Document structure/formatting code</prohibition>
        <prohibition>Inventing accomplishments not based on baseline sentences</prohibition>
      </prohibited_modifications>
    </template_preservation_rule>
  </phase_1>

  <!-- ============================================================ -->
  <!-- PHASE 2: TECHNICAL SKILLS MAPPING -->
  <!-- ============================================================ -->
  <phase_2>
    <n>TECHNICAL SKILLS MAPPING</n>
    
    <constraint>
Do NOT change the subsection names. Populate relevant skills from the Job Description into these exact locked categories:
    </constraint>
    
    <skill_category_limits>
      <description>Maximum character counts for skill content (excluding the category header)</description>
      <category name="AI &amp; Automation" max_chars="97"/>
      <category name="Languages" max_chars="88"/>
      <category name="Frameworks &amp; Web" max_chars="88"/>
      <category name="Data &amp; Databases" max_chars="91"/>
      <category name="Cloud &amp; DevOps" max_chars="87"/>
      <category name="Tools &amp; Platforms" max_chars="86" role="catch-all"/>
    </skill_category_limits>
    
    <formatting_rules>
      <rule>Category headers retain \textbf{} formatting (e.g., \textbf{AI \&amp; Automation})</rule>
      <rule>Skill items within categories must NOT use \textbf{} formatting</rule>
      <rule>Prioritize high-priority JD keywords; include secondary keywords if space permits</rule>
      <rule>Use comma-separated list format for skills</rule>
    </formatting_rules>
    
    <edge_case_handling>
      <case priority="1">
        <condition>If JD lacks keywords for certain skill categories</condition>
        <action>Leave category with minimal relevant skills from baseline knowledge; do NOT fabricate skills not in JD</action>
      </case>
      <case priority="2">
        <condition>If JD terminology doesn't map cleanly to locked categories</condition>
        <action>Place unmapped terminology in "Tools &amp; Platforms" section (catch-all)</action>
      </case>
      <case priority="3">
        <condition>If critical JD skills exceed any category's character limit</condition>
        <action>Prioritize most-frequently-mentioned JD skills; move overflow to "Tools &amp; Platforms"</action>
      </case>
      <case priority="4">
        <condition>If "Tools &amp; Platforms" (catch-all) exceeds its 86-char limit after accommodating overflow</condition>
        <action>STOP execution and output SKILLS_OVERFLOW error (see Output Rules)</action>
      </case>
    </edge_case_handling>
  </phase_2>

  <!-- ============================================================ -->
  <!-- PHASE 3: WORK EXPERIENCE TRANSFORMATION -->
  <!-- ============================================================ -->
  <phase_3>
    <n>WORK EXPERIENCE TRANSFORMATION</n>
    
    <core_principle>
ENHANCE existing baseline sentences by injecting JD keywords—do NOT generate sentences from scratch.
Each baseline sentence represents a real accomplishment that should be adapted with relevant JD terminology.
    </core_principle>
    
    <sentence_length_guidelines>
      <approach>Use TEMPLATE-BASED length control instead of character counting</approach>
      
      <length_validation>
        <guideline>Each sentence should be approximately 25-35 words (comprehensive but concise)</guideline>
        <guideline>Sentence should be readable in one breath when spoken aloud</guideline>
        <guideline>If sentence feels unwieldy, shorten the context/result portion first</guideline>
      </length_validation>
      
      <keyword_injection_rules>
        <rule>Wrap 1-3 high-priority JD keywords per sentence with \textbf{}</rule>
        <rule>Keywords should replace or augment existing technical terms in baseline</rule>
        <rule>If adding keyword makes sentence too long, move keyword to Technical Skills instead</rule>
      </keyword_injection_rules>
      
      <overflow_handling>
        <instruction>If keyword inclusion makes sentence unwieldy, move keyword to Technical Skills section</instruction>
        <instruction>Prioritize sentence readability over keyword density</instruction>
      </overflow_handling>
    </sentence_length_guidelines>
    
    <sentence_count_per_role status="STRICT">
      <company name="Morningstar" required_sentences="6"/>
      <company name="Bell" required_sentences="5"/>
      <company name="Virtusa" required_sentences="4"/>
      <total>15 sentences total (must be exact)</total>
    </sentence_count_per_role>
    
    <content_rules>
      <rule>Start from baseline sentences—do NOT invent new accomplishments</rule>
      <rule>NEVER repeat the same sentence within or across roles</rule>
      <rule>Each enhanced sentence must preserve its original domain context</rule>
      <rule>Apply STAR Framework: [Action Verb] + [Technical Skill/Tool (Bolded)] + [Context/Result] + [Quantified Outcome]</rule>
    </content_rules>
  </phase_3>

  <!-- ============================================================ -->
  <!-- PHASE 3A: BASELINE WORK EXPERIENCE (CRITICAL - NEW) -->
  <!-- ============================================================ -->
  <phase_3a>
    <n>BASELINE WORK EXPERIENCE (ANTI-HALLUCINATION)</n>
    
    <purpose>
These are ACTUAL accomplishments to be ENHANCED with JD keywords, NOT replaced or invented.
Each baseline sentence represents verified work that should be adapted with relevant JD terminology while preserving the core meaning and domain context.
    </purpose>
    
    <baseline_work_experience>
      <!-- ==================== MORNINGSTAR ==================== -->
      <company name="Morningstar">
        <role>Software Engineer (AI Automation Focus)</role>
        <domain>Financial Services / Investment Research</domain>
        <technology_focus>AI Automation, Machine Learning, GenAI, LLMs</technology_focus>
        
        <baseline_sentences>
          <sentence id="M1">
            <original>Engineered AI-powered document processing pipelines to automate extraction from investment research reports, reducing manual review time by 65% for analyst teams.</original>
            <enhancement_zones>
              <zone>"AI-powered" can be replaced with specific JD AI/ML terms</zone>
              <zone>"document processing pipelines" can incorporate JD workflow/pipeline terms</zone>
              <zone>"investment research reports" is domain-locked—preserve financial context</zone>
            </enhancement_zones>
          </sentence>
          <sentence id="M2">
            <original>Developed machine learning models for financial data classification, improving categorization accuracy to 94% across 12K monthly fund documents.</original>
            <enhancement_zones>
              <zone>"machine learning models" can incorporate specific JD ML frameworks</zone>
              <zone>"financial data classification" is domain-locked</zone>
              <zone>Metrics can be adjusted within allowed ranges</zone>
            </enhancement_zones>
          </sentence>
          <sentence id="M3">
            <original>Built retrieval-augmented generation systems enabling natural language queries against proprietary financial databases, accelerating research workflows by 50%.</original>
            <enhancement_zones>
              <zone>"retrieval-augmented generation" can incorporate JD GenAI/LLM terms</zone>
              <zone>"financial databases" is domain-locked</zone>
              <zone>"research workflows" preserves finance context</zone>
            </enhancement_zones>
          </sentence>
          <sentence id="M4">
            <original>Implemented automated validation workflows for SEC filing data, detecting 340+ discrepancies monthly and ensuring regulatory compliance standards.</original>
            <enhancement_zones>
              <zone>"automated validation workflows" can incorporate JD automation terms</zone>
              <zone>"SEC filing data" and "regulatory compliance" are domain-locked</zone>
            </enhancement_zones>
          </sentence>
          <sentence id="M5">
            <original>Created LLM-based summarization tools for earnings reports, delivering analyst-ready briefs in under 30 seconds per document.</original>
            <enhancement_zones>
              <zone>"LLM-based" can incorporate specific JD language model terms</zone>
              <zone>"earnings reports" and "analyst-ready briefs" are domain-locked</zone>
            </enhancement_zones>
          </sentence>
          <sentence id="M6">
            <original>Deployed scalable inference infrastructure on cloud platforms, supporting 25K+ daily prediction requests with sub-200ms latency.</original>
            <enhancement_zones>
              <zone>"cloud platforms" can be replaced with specific JD cloud providers (AWS/Azure/GCP)</zone>
              <zone>"inference infrastructure" can incorporate JD MLOps terms</zone>
            </enhancement_zones>
          </sentence>
        </baseline_sentences>
        
        <domain_specific_vocabulary>
          <vocabulary_item>Financial documents, investment research reports, fund prospectuses</vocabulary_item>
          <vocabulary_item>Portfolio analytics, equity research, ESG data, market intelligence</vocabulary_item>
          <vocabulary_item>Risk assessment models, credit ratings, asset allocation</vocabulary_item>
          <vocabulary_item>Regulatory compliance (SEC filings, FINRA), audit workflows</vocabulary_item>
          <vocabulary_item>Investor communications, earnings reports, fund performance data</vocabulary_item>
        </domain_specific_vocabulary>
        
        <allowed_metrics>
          <description>Use ONLY these specific values—do NOT invent numbers</description>
          <metric type="Documents processed">8K, 12K, 15K, 25K, 40K monthly</metric>
          <metric type="Processing time reduction">45%, 50%, 60%, 65%, 75%</metric>
          <metric type="Accuracy improvement">18%, 22%, 28%, 32%, 94%</metric>
          <metric type="Cost savings">$85K, $150K, $220K, $340K annually</metric>
          <metric type="Productivity gains">25%, 35%, 45%, 50%, 55%</metric>
        </allowed_metrics>
      </company>
      
      <!-- ==================== BELL ==================== -->
      <company name="Bell">
        <role>Full Stack Java Developer (Telecommunications Focus)</role>
        <domain>Telecommunications / Enterprise Services</domain>
        <technology_focus>Full-Stack Java, Microservices, Enterprise Integration</technology_focus>
        
        <baseline_sentences>
          <sentence id="B1">
            <original>Developed microservices architecture for real-time billing calculations, handling 45K daily transactions with 99.9% uptime for subscriber management.</original>
            <enhancement_zones>
              <zone>"microservices architecture" can incorporate JD microservice/API terms</zone>
              <zone>"billing calculations" and "subscriber management" are domain-locked</zone>
            </enhancement_zones>
          </sentence>
          <sentence id="B2">
            <original>Implemented REST APIs powering customer self-service portals, serving 850K active subscribers with sub-100ms response times.</original>
            <enhancement_zones>
              <zone>"REST APIs" can incorporate specific JD API frameworks</zone>
              <zone>"customer self-service portals" is domain-locked</zone>
            </enhancement_zones>
          </sentence>
          <sentence id="B3">
            <original>Architected event-driven order management system using message queues, reducing service provisioning time by 55% across enterprise operations.</original>
            <enhancement_zones>
              <zone>"event-driven" and "message queues" can incorporate JD messaging terms (Kafka, RabbitMQ)</zone>
              <zone>"order management" and "service provisioning" are domain-locked</zone>
            </enhancement_zones>
          </sentence>
          <sentence id="B4">
            <original>Built automated CI/CD pipelines for microservice deployments, increasing release frequency from monthly to weekly cycles.</original>
            <enhancement_zones>
              <zone>"CI/CD pipelines" can incorporate specific JD DevOps tools</zone>
              <zone>"microservice deployments" can incorporate JD containerization terms</zone>
            </enhancement_zones>
          </sentence>
          <sentence id="B5">
            <original>Optimized database queries for subscriber usage analytics, achieving 60% improvement in report generation performance.</original>
            <enhancement_zones>
              <zone>"database queries" can incorporate specific JD database technologies</zone>
              <zone>"subscriber usage analytics" is domain-locked</zone>
            </enhancement_zones>
          </sentence>
        </baseline_sentences>
        
        <domain_specific_vocabulary>
          <vocabulary_item>Customer account management, billing systems, service provisioning</vocabulary_item>
          <vocabulary_item>Network operations, service activation, order management</vocabulary_item>
          <vocabulary_item>Subscriber data, usage analytics, call detail records (CDR)</vocabulary_item>
          <vocabulary_item>B2B enterprise portals, self-service platforms, customer dashboards</vocabulary_item>
          <vocabulary_item>Inventory management, workforce scheduling, field service operations</vocabulary_item>
        </domain_specific_vocabulary>
        
        <allowed_metrics>
          <description>Use ONLY these specific values—do NOT invent numbers</description>
          <metric type="Transaction throughput">25K, 45K, 72K, 95K daily</metric>
          <metric type="Response time">sub-80ms, sub-100ms, sub-150ms</metric>
          <metric type="System uptime">99.5%, 99.9%, 99.95%</metric>
          <metric type="User base">350K, 550K, 850K, 1.2M subscribers</metric>
          <metric type="Performance improvement">35%, 45%, 55%, 60%, 70%</metric>
        </allowed_metrics>
      </company>
      
      <!-- ==================== VIRTUSA ==================== -->
      <company name="Virtusa">
        <role>Full Stack Java Developer (Finance Domain Focus)</role>
        <domain>Financial Services / Banking (Consulting Environment)</domain>
        <technology_focus>Full-Stack Java, Enterprise Applications, Banking Systems</technology_focus>
        
        <baseline_sentences>
          <sentence id="V1">
            <original>Built transaction processing modules for core banking platform, handling 120K daily payment transactions with 99.7% accuracy.</original>
            <enhancement_zones>
              <zone>"transaction processing modules" can incorporate JD Java/backend terms</zone>
              <zone>"core banking platform" and "payment transactions" are domain-locked</zone>
            </enhancement_zones>
          </sentence>
          <sentence id="V2">
            <original>Engineered REST APIs for payment gateway integrations, reducing transaction settlement time by 40% for enterprise banking clients.</original>
            <enhancement_zones>
              <zone>"REST APIs" can incorporate specific JD API/framework terms</zone>
              <zone>"payment gateway" and "banking clients" are domain-locked</zone>
            </enhancement_zones>
          </sentence>
          <sentence id="V3">
            <original>Developed batch processing systems for end-of-day settlements, processing 85K records nightly with automated error reconciliation.</original>
            <enhancement_zones>
              <zone>"batch processing systems" can incorporate JD scheduling/automation terms</zone>
              <zone>"end-of-day settlements" is domain-locked</zone>
            </enhancement_zones>
          </sentence>
          <sentence id="V4">
            <original>Optimized SQL queries for high-volume transaction tables, achieving 52% reduction in report generation time for compliance audits.</original>
            <enhancement_zones>
              <zone>"SQL queries" can incorporate specific JD database terms</zone>
              <zone>"transaction tables" and "compliance audits" are domain-locked</zone>
            </enhancement_zones>
          </sentence>
        </baseline_sentences>
        
        <domain_specific_vocabulary>
          <vocabulary_item>Core banking systems, payment processing, transaction management</vocabulary_item>
          <vocabulary_item>Loan origination, credit assessment, mortgage processing</vocabulary_item>
          <vocabulary_item>Account services, fund transfers, settlement systems</vocabulary_item>
          <vocabulary_item>Fraud detection workflows, KYC/AML compliance, risk scoring</vocabulary_item>
          <vocabulary_item>Customer onboarding, digital banking portals, mobile banking APIs</vocabulary_item>
        </domain_specific_vocabulary>
        
        <allowed_metrics>
          <description>Use ONLY these specific values—do NOT invent numbers</description>
          <metric type="Transaction volume">65K, 85K, 120K, 180K daily</metric>
          <metric type="Processing time improvement">32%, 40%, 48%, 52%</metric>
          <metric type="System reliability">99.5%, 99.7%, 99.8% accuracy</metric>
          <metric type="Query optimization">38%, 45%, 52%, 58% faster</metric>
          <metric type="Error rate reduction">35%, 42%, 55%</metric>
        </allowed_metrics>
      </company>
    </baseline_work_experience>
    
    <enhancement_instruction>
When enhancing baseline sentences:
1. Identify which JD keywords can naturally replace or augment technical terms in the baseline
2. Wrap injected JD keywords with \textbf{} for ATS optimization
3. Preserve the domain context (finance for Morningstar/Virtusa, telecom for Bell)
4. Adjust metrics only within the allowed_metrics ranges
5. Do NOT change the fundamental accomplishment being described
    </enhancement_instruction>
  </phase_3a>

  <!-- ============================================================ -->
  <!-- PHASE 3B: KEYWORD-TO-CONTEXT MAPPING RULES -->
  <!-- ============================================================ -->
  <phase_3b>
    <n>KEYWORD-TO-CONTEXT MAPPING RULES</n>
    
    <mapping_priority_order>
      <priority_description>
When the JD contains keywords that could apply to multiple companies, follow this allocation strategy:
      </priority_description>
      
      <keyword_allocations>
        <allocation>
          <keyword_type>AI/ML/LLM/GenAI</keyword_type>
          <primary_allocation>Morningstar ONLY (do not allocate to Bell/Virtusa)</primary_allocation>
        </allocation>
        <allocation>
          <keyword_type>Automation/Workflows</keyword_type>
          <primary_allocation>Morningstar (AI automation context)</primary_allocation>
          <secondary_allocation>Bell (system automation context) - only if surplus keywords</secondary_allocation>
        </allocation>
        <allocation>
          <keyword_type>Python/Data Science</keyword_type>
          <primary_allocation>Morningstar ONLY</primary_allocation>
        </allocation>
        <allocation>
          <keyword_type>Java/Spring/Hibernate</keyword_type>
          <primary_allocation>Bell (3 keywords max), Virtusa (2 keywords max)</primary_allocation>
        </allocation>
        <allocation>
          <keyword_type>Microservices/APIs/REST</keyword_type>
          <primary_allocation>Bell (primary - 2 max), Virtusa (secondary - 1 max)</primary_allocation>
        </allocation>
        <allocation>
          <keyword_type>Cloud (AWS/Azure/GCP)</keyword_type>
          <primary_allocation>Morningstar (AI/ML workloads context)</primary_allocation>
          <secondary_allocation>Bell (infrastructure context) - only if JD heavily emphasizes cloud</secondary_allocation>
        </allocation>
        <allocation>
          <keyword_type>Databases/SQL</keyword_type>
          <primary_allocation>Distribute: Morningstar (1), Bell (1), Virtusa (1)</primary_allocation>
        </allocation>
        <allocation>
          <keyword_type>CI/CD/DevOps/Docker/Kubernetes</keyword_type>
          <primary_allocation>Bell ONLY</primary_allocation>
        </allocation>
        <allocation>
          <keyword_type>Agile/Scrum</keyword_type>
          <primary_allocation>Technical Skills section only—do NOT inject into experience sentences</primary_allocation>
        </allocation>
        <allocation>
          <keyword_type>Testing/QA (JUnit, Selenium, etc.)</keyword_type>
          <primary_allocation>Technical Skills section only—do NOT inject into experience sentences</primary_allocation>
        </allocation>
      </keyword_allocations>
    </mapping_priority_order>
    
    <cross_company_keyword_distribution_rules>
      <rule number="1">NO keyword should appear in more than 2 companies' sentences</rule>
      <rule number="2">If a keyword appears in 2 companies, it must be in DIFFERENT contexts</rule>
      <rule number="3">High-priority JD keywords SHOULD appear at least once; OMIT if it breaks sentence flow</rule>
      <rule number="4">Secondary JD keywords go to Technical Skills if not naturally fitting in experience</rule>
      <rule number="5">Never force a keyword into a sentence where it doesn't fit the domain context</rule>
    </cross_company_keyword_distribution_rules>
    
    <contextual_transformation_examples>
      <transformation>
        <jd_keyword>REST APIs</jd_keyword>
        <morningstar_context>AI model serving endpoints (sentence M6)</morningstar_context>
        <bell_context>Customer portal services (sentence B2)</bell_context>
        <virtusa_context>Payment gateway integration (sentence V2)</virtusa_context>
      </transformation>
      <transformation>
        <jd_keyword>AWS/Azure/GCP</jd_keyword>
        <morningstar_context>ML inference infrastructure (sentence M6)</morningstar_context>
        <bell_context>Microservice hosting (sentence B4)—only if heavily emphasized in JD</bell_context>
        <virtusa_context>Do NOT use—Virtusa baseline doesn't include cloud</virtusa_context>
      </transformation>
      <transformation>
        <jd_keyword>Python</jd_keyword>
        <morningstar_context>ML model development (sentences M1, M2, M3)</morningstar_context>
        <bell_context>Do NOT use—Bell is Java-focused</bell_context>
        <virtusa_context>Do NOT use—Virtusa is Java-focused</virtusa_context>
      </transformation>
      <transformation>
        <jd_keyword>Microservices</jd_keyword>
        <morningstar_context>Do NOT use—Morningstar is AI/ML focused</morningstar_context>
        <bell_context>Billing/subscriber management (sentences B1, B4)</bell_context>
        <virtusa_context>Transaction processing (sentence V1)—secondary only</virtusa_context>
      </transformation>
      <transformation>
        <jd_keyword>SQL/PostgreSQL/MySQL</jd_keyword>
        <morningstar_context>Financial data queries (sentence M2)</morningstar_context>
        <bell_context>Subscriber analytics (sentence B5)</bell_context>
        <virtusa_context>Transaction/compliance queries (sentence V4)</virtusa_context>
      </transformation>
      <transformation>
        <jd_keyword>Docker/Kubernetes</jd_keyword>
        <morningstar_context>Do NOT use in sentences—add to Technical Skills only</morningstar_context>
        <bell_context>CI/CD deployments (sentence B4)</bell_context>
        <virtusa_context>Do NOT use—Virtusa baseline doesn't include containers</virtusa_context>
      </transformation>
    </contextual_transformation_examples>
  </phase_3b>

  <!-- ============================================================ -->
  <!-- PHASE 3C: SENTENCE QUALITY STANDARDS -->
  <!-- ============================================================ -->
  <phase_3c>
    <n>SENTENCE QUALITY STANDARDS</n>
    
    <mandatory_sentence_components>
      <component_description>Each enhanced sentence MUST contain:</component_description>
      <component number="1">STRONG ACTION VERB (from approved list—track usage)</component>
      <component number="2">1-3 JD KEYWORDS wrapped in \textbf{} (naturally integrated)</component>
      <component number="3">DOMAIN-APPROPRIATE CONTEXT (preserved from baseline)</component>
      <component number="4">QUANTIFIED OUTCOME (from allowed_metrics list only)</component>
    </mandatory_sentence_components>
    
    <approved_action_verbs>
      <instruction>Track usage: no verb repeated within same company</instruction>
      <tracking_format>Maintain internal log: {Company: [used_verbs]}</tracking_format>
      
      <category name="Building">
        <verbs>Architected, Engineered, Developed, Built, Designed, Created</verbs>
      </category>
      <category name="Improving">
        <verbs>Optimized, Enhanced, Streamlined, Accelerated, Modernized</verbs>
      </category>
      <category name="Leading">
        <verbs>Spearheaded, Led, Directed, Orchestrated, Pioneered</verbs>
      </category>
      <category name="Implementing">
        <verbs>Deployed, Implemented, Integrated, Established, Launched</verbs>
      </category>
      <category name="Automating">
        <verbs>Automated, Systematized, Programmed, Scripted</verbs>
      </category>
      
      <verb_tracking_example>
        <example>
{
  "Morningstar": ["Engineered", "Developed", "Built", "Implemented", "Created", "Deployed"],
  "Bell": ["Developed", "Implemented", "Architected", "Built", "Optimized"],
  "Virtusa": ["Built", "Engineered", "Developed", "Optimized"]
}
        </example>
        <validation>If verb already used for company, select different verb from same category</validation>
      </verb_tracking_example>
    </approved_action_verbs>
    
    <sentence_uniqueness_verification>
      <verification_description>Before finalizing each sentence, verify:</verification_description>
      <check>Action verb not used elsewhere in same company (check tracking log)</check>
      <check>Primary JD keyword not wrapped in \textbf{} in same sentence structure elsewhere</check>
      <check>Quantified metric value is unique across all 15 sentences</check>
      <check>Domain context matches the company (finance/telecom/banking)</check>
    </sentence_uniqueness_verification>
    
    <quality_checklist>
      <checklist_description>Quality checklist for each sentence:</checklist_description>
      <check>Sentence is 25-35 words (readable in one breath)</check>
      <check>Contains domain-specific context from baseline (not generic tech)</check>
      <check>Uses metric value from allowed_metrics list only</check>
      <check>Uses active voice throughout</check>
      <check>Bolded keywords appear naturally in sentence flow (not forced)</check>
      <check>Maximum 3 \textbf{} wrapped terms per sentence (no keyword stuffing)</check>
    </quality_checklist>
  </phase_3c>

  <!-- ============================================================ -->
  <!-- PHASE 3D: SENTENCE ENHANCEMENT WORKFLOW -->
  <!-- ============================================================ -->
  <phase_3d>
    <n>SENTENCE ENHANCEMENT WORKFLOW</n>
    
    <step_by_step_process>
      <step number="1">
        <title>KEYWORD EXTRACTION &amp; PRIORITIZATION</title>
        <actions>
          <action>List all technical keywords from JD</action>
          <action>Mark as HIGH-PRIORITY: Keywords appearing 2+ times OR in "required" section</action>
          <action>Mark as SECONDARY: All other technical terms</action>
          <action>Count total high-priority keywords to allocate</action>
        </actions>
      </step>
      
      <step number="2">
        <title>KEYWORD-TO-BASELINE MAPPING</title>
        <actions>
          <action>For each high-priority keyword, identify which baseline sentence can naturally incorporate it</action>
          <action>Follow keyword_allocations rules (AI→Morningstar, Java→Bell/Virtusa, etc.)</action>
          <action>Create mapping: {keyword: sentence_id}</action>
          <action>If keyword doesn't fit any baseline naturally, assign to Technical Skills section</action>
        </actions>
      </step>
      
      <step number="3">
        <title>BASELINE ENHANCEMENT</title>
        <actions>
          <action>For each baseline sentence, identify the enhancement_zones</action>
          <action>Replace or augment technical terms with mapped JD keywords</action>
          <action>Wrap injected keywords with \textbf{}</action>
          <action>Ensure sentence remains 25-35 words and readable</action>
        </actions>
      </step>
      
      <step number="4">
        <title>METRIC VALIDATION</title>
        <actions>
          <action>Verify each metric is from the allowed_metrics list for that company</action>
          <action>Ensure no metric value is duplicated across all 15 sentences</action>
          <action>If adjustment needed, select different value from allowed_metrics</action>
        </actions>
      </step>
      
      <step number="5">
        <title>VERB &amp; UNIQUENESS TRACKING</title>
        <actions>
          <action>Log each action verb used per company</action>
          <action>Verify no verb repeated within same company</action>
          <action>Verify no identical sentence structures across companies</action>
        </actions>
      </step>
      
      <step number="6">
        <title>DOMAIN CONTEXT VALIDATION</title>
        <actions>
          <action>Confirm Morningstar sentences retain finance/investment context</action>
          <action>Confirm Bell sentences retain telecommunications context</action>
          <action>Confirm Virtusa sentences retain banking/compliance context</action>
          <action>Flag any sentence that became generic after enhancement</action>
        </actions>
      </step>
    </step_by_step_process>
    
    <phrase_usage_limits>
      <description>Track connecting and result phrases to ensure variety</description>
      <connecting_phrases max_usage="2">
        <phrases>"to power", "enabling", "for", "within", "across", "supporting"</phrases>
        <phrases>"integrating with", "leveraging", "utilizing", "through"</phrases>
      </connecting_phrases>
      <result_phrases max_usage="2">
        <phrases>"reducing X by", "improving X by", "achieving", "delivering"</phrases>
        <phrases>"resulting in", "generating", "driving", "with"</phrases>
      </result_phrases>
      <tracking_instruction>Each phrase may be used maximum 2 times across all 15 sentences</tracking_instruction>
    </phrase_usage_limits>
  </phase_3d>

  <!-- ============================================================ -->
  <!-- PHASE 4: ATS OPTIMIZATION -->
  <!-- ============================================================ -->
  <phase_4>
    <n>ATS OPTIMIZATION</n>
    
    <keyword_optimization>
      <rule>Mirror exact terminology from job description (e.g., "Node.js" not "NodeJS")</rule>
      <rule>High-priority keywords should appear in BOTH Work Experience (bolded) AND Technical Skills</rule>
      <rule>Secondary keywords appear in Technical Skills section</rule>
      <rule>Do NOT over-optimize: readability trumps keyword density</rule>
    </keyword_optimization>
    
    <latex_special_character_handling>
      <instruction>Escape special characters properly for LaTeX compilation:</instruction>
      <escape_rules>
        <rule>Hash: # → \# (Example: C\#)</rule>
        <rule>Ampersand: &amp; → \&amp; (Example: AT\&amp;T)</rule>
        <rule>Percent: % → \% (Example: 65\%)</rule>
        <rule>Dollar: $ → \$ (Example: \$500K)</rule>
        <rule>Underscore: _ → \_ (Example: snake\_case)</rule>
      </escape_rules>
      <instruction>Apply escaping to ALL JD keywords before inserting into resume</instruction>
    </latex_special_character_handling>
    
    <formatting_requirements>
      <requirement>No Unicode special characters (✓, •, →, ★) inside LaTeX code</requirement>
      <requirement>Use standard LaTeX itemize/enumerate for lists</requirement>
      <requirement>Maintain consistent spacing and indentation</requirement>
      <requirement>All \textbf{} commands must be properly closed</requirement>
    </formatting_requirements>
  </phase_4>

  <!-- ============================================================ -->
  <!-- PHASE 5: CONSTRAINT VERIFICATION -->
  <!-- ============================================================ -->
  <phase_5>
    <n>READABILITY &amp; CONSTRAINT VERIFICATION</n>
    
    <pre_output_validation>
      <step number="1">Count total sentences: Must equal exactly 15 (6+5+4)</step>
      <step number="2">Verify verb tracking log shows no duplicates within any company</step>
      <step number="3">Verify all metrics are from allowed_metrics lists</step>
      <step number="4">Verify each company's sentences use domain vocabulary from its profile</step>
      <step number="5">Calculate score using explicit formula in Phase 6</step>
      <step number="6">Verify all Technical Skills categories are within character limits</step>
    </pre_output_validation>
    
    <verification_checklist>
      <category name="Sentence Count Verification">
        <check status="CRITICAL">Morningstar: exactly 6 sentences</check>
        <check status="CRITICAL">Bell: exactly 5 sentences</check>
        <check status="CRITICAL">Virtusa: exactly 4 sentences</check>
        <check status="CRITICAL">Total: exactly 15 sentences</check>
      </category>
      
      <category name="Technical Skills Verification">
        <check>All 6 subsection headers match locked list exactly</check>
        <check>Category headers retain \textbf{} formatting</check>
        <check>Skill items do NOT use \textbf{} formatting</check>
        <check>Each category within character limit</check>
      </category>
      
      <category name="Keyword Verification">
        <check>High-priority JD keywords appear in Work Experience (bolded) where natural</check>
        <check>High-priority JD keywords appear in Technical Skills section</check>
        <check>No keyword appears in more than 2 companies</check>
      </category>
      
      <category name="Uniqueness Verification">
        <check>No duplicate sentences within any role</check>
        <check>No duplicate sentences across different roles</check>
        <check>No duplicate metrics across all 15 sentences</check>
        <check>No duplicate verbs within same company</check>
      </category>
      
      <category name="Domain Context Verification">
        <check>Morningstar sentences reflect AI/Automation in Finance context</check>
        <check>Bell sentences reflect Full-Stack Java in Telecommunications context</check>
        <check>Virtusa sentences reflect Full-Stack Java in Banking context</check>
        <check>No generic/context-free technical statements</check>
        <check>All metrics from allowed_metrics lists</check>
      </category>
      
      <category name="Section Completeness">
        <check>Heading section present and unmodified</check>
        <check>Work Experience section complete (15 sentences)</check>
        <check>Technical Skills section complete (6 categories)</check>
        <check>Education section present and unmodified</check>
        <check>Certifications section present and unmodified</check>
      </category>
      
      <category name="LaTeX Validation">
        <check>All special characters properly escaped</check>
        <check>All \textbf{} commands properly opened and closed</check>
        <check>No Unicode characters in output</check>
        <check>Document structure intact from \documentclass to \end{document}</check>
      </category>
    </verification_checklist>
  </phase_5>

  <!-- ============================================================ -->
  <!-- PHASE 6: QUALITY SCORING & OUTPUT RULES -->
  <!-- ============================================================ -->
  <phase_6>
    <n>QUALITY SCORING &amp; OUTPUT RULES</n>
    
    <scoring_rubric>
      <minimum_required_score>90 points out of 100</minimum_required_score>
      <calculation_method>Sum all component scores below</calculation_method>
      
      <criteria>
        <criterion>
          <n>Constraint Adherence</n>
          <max_points>30</max_points>
          <scoring>
            <component points="15">All sentence counts exact (6+5+4=15)</component>
            <component points="10">All skill categories within character limits</component>
            <component points="5">No prohibited sections modified</component>
          </scoring>
          <deduction>-30 points (full category loss) if ANY sentence count wrong</deduction>
        </criterion>
        
        <criterion>
          <n>Content Relevance</n>
          <max_points>25</max_points>
          <scoring>
            <formula>5 points per high-priority JD keyword included (max 25 points = 5 keywords)</formula>
            <note>Keyword must appear in either Work Experience (bolded) OR Technical Skills to count</note>
          </scoring>
        </criterion>
        
        <criterion>
          <n>ATS Compatibility</n>
          <max_points>20</max_points>
          <scoring>
            <component points="4">Header section present and unmodified</component>
            <component points="4">Work Experience section complete</component>
            <component points="4">Technical Skills section complete</component>
            <component points="4">Education section present and unmodified</component>
            <component points="4">Certifications section present and unmodified</component>
          </scoring>
        </criterion>
        
        <criterion>
          <n>Contextual Authenticity</n>
          <max_points>15</max_points>
          <scoring>
            <component points="5">All 6 Morningstar sentences use finance/AI vocabulary</component>
            <component points="5">All 5 Bell sentences use telecom vocabulary</component>
            <component points="5">All 4 Virtusa sentences use banking vocabulary</component>
          </scoring>
          <deduction>-2 points per sentence using generic (non-domain) language</deduction>
        </criterion>
        
        <criterion>
          <n>Technical Accuracy</n>
          <max_points>10</max_points>
          <scoring>
            <component points="5">All special characters properly escaped</component>
            <component points="5">All \textbf{} commands properly closed</component>
          </scoring>
          <deduction>-10 points (full category loss) if LaTeX would fail to compile</deduction>
        </criterion>
      </criteria>
      
      <score_formula>
Total = Constraint_Adherence + Content_Relevance + ATS_Compatibility + Contextual_Authenticity + Technical_Accuracy
Pass threshold: Total ≥ 90
      </score_formula>
    </scoring_rubric>
  </phase_6>

  <!-- ============================================================ -->
  <!-- OUTPUT RULES (WITH PRIORITY HIERARCHY) -->
  <!-- ============================================================ -->
  <output_rules>
    <output_condition_priority>
      <description>When multiple conditions apply, use this priority order (highest first)</description>
      <priority rank="1">Condition 5 (Skills Overflow) - STOP, no LaTeX output</priority>
      <priority rank="2">Condition 4 (Sentence Count Wrong) - STOP, no LaTeX output</priority>
      <priority rank="3">Condition 3 (Contextual Deficiency) - CORRECT then output</priority>
      <priority rank="4">Condition 2 (Score &lt;90) - CORRECT then output</priority>
      <priority rank="5">Condition 1 (Success) - OUTPUT only</priority>
    </output_condition_priority>
    
    <condition number="1">
      <criteria>Score ≥ 90 points AND all constraints pass</criteria>
      <output_format>
        <instruction>Output ONLY the complete LaTeX resume code</instruction>
        <instruction>No explanations, analysis, or commentary</instruction>
        <instruction>Format as code block from \documentclass to \end{document}</instruction>
      </output_format>
    </condition>
    
    <condition number="2">
      <criteria>Score &lt; 90 points (but no STOP conditions triggered)</criteria>
      <output_format>
OPTIMIZATION INCOMPLETE - Score: [X]/100
Deficiencies:
- [Specific issue 1 with point deduction]
- [Specific issue 2 with point deduction]
Applying corrections...

[Complete corrected LaTeX resume code]
      </output_format>
    </condition>
    
    <condition number="3">
      <criteria>Contextual Authenticity Score &lt; 10 points (of 15 max)</criteria>
      <output_format>
CONTEXTUALIZATION DEFICIENCY DETECTED
Company: [Company name]
Issue: [Specific contextualization problem]
Problematic Sentence: [The sentence lacking domain context]
Correction Applied: [How it was fixed]

[Complete corrected LaTeX resume code]
      </output_format>
    </condition>
    
    <condition number="4" priority="STOP">
      <criteria>Sentence count wrong for any company</criteria>
      <output_format>
        <instruction>DO NOT output LaTeX resume</instruction>
        <format>
SENTENCE COUNT ERROR - CANNOT PROCEED
Company: [Company name]
Required: [Expected count]
Actual: [Actual count]
Resolution Required: Adjust sentence count to match exact requirements before proceeding.
        </format>
      </output_format>
    </condition>
    
    <condition number="5" priority="STOP">
      <criteria>Skills overflow - "Tools &amp; Platforms" exceeds 86 chars after accommodating overflow</criteria>
      <output_format>
        <instruction>DO NOT output LaTeX resume</instruction>
        <format>
SKILLS OVERFLOW ERROR - CANNOT PROCEED
Category: Tools &amp; Platforms (catch-all)
Limit: 86 characters
Attempted: [Actual count]
Overflow Keywords: [List of keywords that couldn't fit]
Resolution Required: Remove lower-priority keywords or redistribute to other categories.
        </format>
      </output_format>
    </condition>
  </output_rules>

  <!-- ============================================================ -->
  <!-- CONSTRAINT PRIORITY ORDER -->
  <!-- ============================================================ -->
  <constraint_priority_order>
    <priority_description>HIGHEST TO LOWEST - When constraints conflict, higher priority wins</priority_description>
    <priority rank="1">SENTENCE COUNTS PER ROLE (Must be exact: 6+5+4=15)</priority>
    <priority rank="2">BASELINE PRESERVATION (Must enhance existing sentences, not invent new ones)</priority>
    <priority rank="3">DOMAIN CONTEXT (Sentences must reflect company-appropriate vocabulary)</priority>
    <priority rank="4">SKILL CATEGORY LIMITS (Must stay within character limits)</priority>
    <priority rank="5">KEYWORD INCLUSION (Include if natural; omit if forced)</priority>
    <priority rank="6">QUANTIFIED RESULTS (Use allowed_metrics values only)</priority>
    
    <conflict_resolution>
      <scenario>When keyword inclusion conflicts with sentence readability:</scenario>
      <resolution step="1">Move keyword to Technical Skills section instead</resolution>
      <resolution step="2">If keyword is high-priority, ensure it appears in at least Technical Skills</resolution>
      <resolution step="3">Never force keywords that break domain context</resolution>
    </conflict_resolution>
  </constraint_priority_order>

  <!-- ============================================================ -->
  <!-- FINAL DELIVERABLE STANDARDS -->
  <!-- ============================================================ -->
  <final_deliverable_standards>
    <standard>Complete, compilable LaTeX document</standard>
    <standard>Strict 1-page maximum</standard>
    <standard>Exactly 15 sentences total (6+5+4)</standard>
    <standard>All metrics from allowed_metrics lists</standard>
    <standard>Zero typos, consistent formatting</standard>
    <standard>All special characters properly escaped</standard>
    <standard>No duplicate sentences anywhere in document</standard>
    <standard>No duplicate verbs within same company</standard>
    <standard>All Morningstar sentences reflect AI Automation in Finance</standard>
    <standard>All Bell sentences reflect Full-Stack Java in Telecommunications</standard>
    <standard>All Virtusa sentences reflect Full-Stack Java in Banking/Finance</standard>
    <standard>Score ≥ 90/100 using explicit calculation</standard>
  </final_deliverable_standards>

  <!-- ============================================================ -->
  <!-- EXECUTION COMMAND -->
  <!-- ============================================================ -->
  <execution_command>
    <instruction>When job description is provided:</instruction>
    <step number="1">Execute Phase 1 → Extract and categorize JD keywords (high-priority vs secondary)</step>
    <step number="2">Execute Phase 2 → Map skills to locked categories (respect character limits)</step>
    <step number="3">Execute Phase 3 → ENHANCE baseline work experience sentences
      <substep>3A. Map keywords to appropriate baseline sentences</substep>
      <substep>3B. Inject keywords using \textbf{} in enhancement zones</substep>
      <substep>3C. Validate domain context preserved</substep>
      <substep>3D. Track verbs and phrases used</substep>
    </step>
    <step number="4">Execute Phase 4 → Apply ATS optimization and LaTeX escaping</step>
    <step number="5">Execute Phase 5 → Run all verification checks</step>
    <step number="6">Execute Phase 6 → Calculate score and determine output condition</step>
    <step number="7">Apply output rules based on condition priority hierarchy</step>
  </execution_command>

  <!-- ============================================================ -->
  <!-- BASE LATEX RESUME TEMPLATE -->
  <!-- ============================================================ -->
  <base_latex_resume_template>
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
\input{glyphtounicode}
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
\titleformat{\section}{\vspace{-8pt}\scshape\raggedright\large\bfseries}{}{0em}{}[\color{black}\titlerule \vspace{-4pt}]
\pdfgentounicode=1
\newcommand{\resumeItem}[1]{\item\small{{#1 \vspace{-2pt}}}}
\newcommand{\resumeSubheading}[4]{
\vspace{-1pt}\item
\begin{tabular*}{1.0\textwidth}[t]{l@{\extracolsep{\fill}}r}
\textbf{#1} &amp; \textbf{\small #2} \\
\textit{\small#3} &amp; \textit{\small #4} \\
\end{tabular*}\vspace{-5pt}}
\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.0in, label={}, itemsep=-3pt]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}[itemsep=1pt, topsep=-1pt]}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{3pt}}
\begin{document}
%----------HEADING----------
\begin{center}
{\Huge \scshape Yash Anghan} \\ \vspace{2pt}
\small \raisebox{-0.1\height}\faEnvelope\ \href{mailto:yashanghan97@gmail.com}{yashanghan97@gmail.com} ~
\raisebox{-0.1\height}\faPhone\ +1 (437) 290-2005 ~
\href{https://www.linkedin.com/in/yash-aiautomation/}{\raisebox{-0.2\height}\faLinkedin\ \underline{Linkedin}} ~
\href{https://github.com/yash-ai-automation}{\raisebox{-0.2\height}\faGithub\ \underline{GitHub}}
\vspace{-8pt}
\end{center}
%-----------WORK EXPERIENCE-----------
\section{Work Experience}
\resumeSubHeadingListStart
\resumeSubheading
{Morningstar}{Jan 2023 -- Aug 2025}
{Software Engineer}{Toronto, ON}
\resumeItemListStart
% ENHANCE baseline sentences M1-M6 with JD keywords
% CONTEXT: AI Automation, Machine Learning, GenAI in Financial Services
% DOMAIN-LOCKED: Investment research, fund data, financial documents, regulatory compliance
% Baseline M1: Engineered AI-powered document processing pipelines to automate extraction from investment research reports, reducing manual review time by 65% for analyst teams.
% Baseline M2: Developed machine learning models for financial data classification, improving categorization accuracy to 94% across 12K monthly fund documents.
% Baseline M3: Built retrieval-augmented generation systems enabling natural language queries against proprietary financial databases, accelerating research workflows by 50%.
% Baseline M4: Implemented automated validation workflows for SEC filing data, detecting 340+ discrepancies monthly and ensuring regulatory compliance standards.
% Baseline M5: Created LLM-based summarization tools for earnings reports, delivering analyst-ready briefs in under 30 seconds per document.
% Baseline M6: Deployed scalable inference infrastructure on cloud platforms, supporting 25K+ daily prediction requests with sub-200ms latency.
\resumeItemListEnd
\resumeSubheading
{Bell}{Jan 2022 -- Dec 2022}
{Full Stack Java Developer}{Toronto, ON}
\resumeItemListStart
% ENHANCE baseline sentences B1-B5 with JD keywords
% CONTEXT: Full-Stack Java, Microservices, Enterprise Applications
% DOMAIN-LOCKED: Telecommunications, customer portals, billing, service provisioning
% Baseline B1: Developed microservices architecture for real-time billing calculations, handling 45K daily transactions with 99.9% uptime for subscriber management.
% Baseline B2: Implemented REST APIs powering customer self-service portals, serving 850K active subscribers with sub-100ms response times.
% Baseline B3: Architected event-driven order management system using message queues, reducing service provisioning time by 55% across enterprise operations.
% Baseline B4: Built automated CI/CD pipelines for microservice deployments, increasing release frequency from monthly to weekly cycles.
% Baseline B5: Optimized database queries for subscriber usage analytics, achieving 60% improvement in report generation performance.
\resumeItemListEnd
\resumeSubheading
{Virtusa}{Jun 2019 -- Aug 2020}
{Full Stack Java Developer}{Hyderabad, India}
\resumeItemListStart
% ENHANCE baseline sentences V1-V4 with JD keywords
% CONTEXT: Full-Stack Java, Enterprise Banking Applications
% DOMAIN-LOCKED: Core banking, payments, transactions, compliance (Finance consulting)
% Baseline V1: Built transaction processing modules for core banking platform, handling 120K daily payment transactions with 99.7% accuracy.
% Baseline V2: Engineered REST APIs for payment gateway integrations, reducing transaction settlement time by 40% for enterprise banking clients.
% Baseline V3: Developed batch processing systems for end-of-day settlements, processing 85K records nightly with automated error reconciliation.
% Baseline V4: Optimized SQL queries for high-volume transaction tables, achieving 52% reduction in report generation time for compliance audits.
\resumeItemListEnd
\resumeSubHeadingListEnd
%-----------TECHNICAL SKILLS-----------
\section{Technical Skills}
\begin{itemize}[leftmargin=0.0in, label={}]
\small{\item{
\textbf{AI \&amp; Automation}{: [INSERT JD SKILLS - MAX 97 CHARS]} \\
\textbf{Languages}{: [INSERT JD SKILLS - MAX 88 CHARS]} \\
\textbf{Frameworks \&amp; Web}{: [INSERT JD SKILLS - MAX 88 CHARS]} \\
\textbf{Data \&amp; Databases}{: [INSERT JD SKILLS - MAX 91 CHARS]} \\
\textbf{Cloud \&amp; DevOps}{: [INSERT JD SKILLS - MAX 87 CHARS]} \\
\textbf{Tools \&amp; Platforms}{: [INSERT JD SKILLS - MAX 86 CHARS - CATCH-ALL]} \\
}}
\end{itemize}
%-----------EDUCATION-----------
\section{Education}
\resumeSubHeadingListStart
\item\small{
\textbf{{University of Windsor}\hfill {Sep 2020 -- Dec 2021}}
}
\item\small{
{Master of Science in Computer Science}\hfill{Windsor, ON}
}
\item\small{
\textbf{{Dharmsinh Desai University}\hfill {Sep 2014 -- May 2018}}
}
\item\small{
{Bachelor of Technology in Information Technology}\hfill{Gujarat, India}
}
\resumeSubHeadingListEnd
%-----------CERTIFICATIONS-----------
\section{Certifications}
\resumeSubHeadingListStart
\item\small{
\textbf{Microsoft Certified: Azure AI Engineer Associate} \hfill Jan 2026
}
\item\small{
\textbf{Microsoft Certified: Azure AI Fundamentals} \hfill Jan 2026
}
\item\small{
\textbf{n8n Course Completion} \hfill Aug 2024
}
\item\small{
\textbf{Make.com "Level 5" Expert Certification} \hfill Jan 2024
}
\resumeSubHeadingListEnd
\end{document}
    </latex_code>
  </base_latex_resume_template>

</resume_optimization_system>
```
