#!/usr/bin/env node
// Overnight 2026-05-06 batch 11 — Percepta (#588) + ServiceNow Moveworks (#591).

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import yaml from 'js-yaml';

const TEMPLATE = readFileSync('templates/cv-template.html', 'utf-8');
const profile = yaml.load(readFileSync('config/profile.yml', 'utf-8')).candidate;

const BASE = `Applied AI / ML engineer shipping production healthcare AI end to end: HIPAA-conscious RAG (~35% retrieval precision, >90% grounded alignment), predictive ML pipelines (15-20% recall on high-risk patient categories at >90% precision), agentic LLM workflows (>30% hallucination reduction), and FastAPI + Docker packaging (~30% post-deploy defect reduction). Production computer vision via YOLOv8 (~30% inference latency reduction). Master's in Computer Science, Kent State.`;

const ROLES = {
  'percepta-applied-ai-engineer': {
    summary: `${BASE} Targeting Percepta's Applied AI Engineer seat (NYC, GC-backed vertical AI for healthcare/manufacturing/energy) — production healthcare RAG with grounded answers and clinical SME stakeholder discipline (1:1 with Mosaic's "rapidly deploy agentic workflows" charter), Manga Lens 4-provider AI vision integration shipped solo on Chrome Web Store with cost-aware payload routing (proves customer-deployed multi-provider LLM orchestration), Agentic Healthcare Claims with schema-validated JSON contracts between five agents (matches Percepta's production-grade AI agents with audit-ready reasoning), and E-Farming AgriTech marketplace as solo founder (extreme-ownership and 0→1 product instinct). NYC relocation open, F-1 OPT US-base.`,
    comps: ['Applied AI Engineer', 'Production AI Agents / Workflows', 'RAG / Embeddings / Vector Search', 'Multi-Provider LLM API Integration (OpenAI, Anthropic, Google, Ollama)', 'LangChain / Agentic / Schema Contracts', 'Python / TypeScript', 'FastAPI / Flask / Docker / REST', 'CI/CD (Jenkins, GitHub Actions)', 'Healthcare AI / HIPAA Governance', 'Founder / 0-to-1 Ownership', 'NYC Relocation Open (F-1 OPT)'],
  },
  'servicenow-moveworks-ai-implementation': {
    summary: `${BASE} Targeting ServiceNow Moveworks' AI Implementation Engineer seat (US Remote, Now Assist platform) — production healthcare RAG + agentic LLM workflows with stakeholder vision-lock and clinical SME calls (1:1 with Moveworks' Customer Success ↔ Product ↔ Engineering intersection), Emerson Synthesis Order-to-Cash optimization with RBAC + audit logging + Jenkins CI/CD on T-SQL stored procedures (proves enterprise customer-system integration in compliance-sensitive contexts, ~20% query speedup, ~30% deploy-error reduction), Manga Lens 4-provider AI vision integration shipped solo on Chrome Web Store (multi-provider abstraction directly maps to enterprise iPaaS / REST integration scope), Agentic Healthcare Claims with schema-validated JSON contracts between five agents (matches Moveworks' AI agent delivery + audit trails), and FastAPI + Docker microservices with structured logging (matches REST APIs + microservices + scripting requirements). US Remote, F-1 OPT US-base, open to 25% domestic travel.`,
    comps: ['AI Implementation Engineer / Forward Deployed', 'Enterprise AI Agent Delivery', 'RAG / Agentic Workflows / Multi-step Agents', 'REST APIs / iPaaS / Workato (ramp)', 'Python / TypeScript / Bash Scripting', 'FastAPI / Flask / Docker / Microservices', 'CI/CD (Jenkins, GitHub Actions)', 'Enterprise ERP / RBAC / Audit Logging (Emerson Synthesis)', 'SQL Server / T-SQL Performance Tuning', 'Customer-Facing / Stakeholder Vision-Lock', 'US Remote (F-1 OPT) / 25% Travel OK'],
  },
};

const EXPERIENCE = `
    <div class="job">
      <div class="job-header">
        <span class="job-company">Progress Solutions Inc.</span>
        <span class="job-period">Jul 2025 - Present</span>
      </div>
      <div class="job-role">Jr. AI/ML Engineer Trainee - Applied AI, Healthcare</div>
      <div class="job-location">USA - Healthcare Technology, Applied AI</div>
      <ul>
        <li>Built <strong>Retrieval-Augmented Generation (RAG)</strong> for clinical knowledge retrieval and healthcare documentation search; recursive semantic chunking + transformer embeddings improved retrieval precision <strong>~35%</strong>; retrieval-grounded response alignment <strong>&gt;90%</strong>.</li>
        <li>Developed <strong>agentic LLM workflows</strong> for multi-step healthcare queries (eligibility checks, care workflow navigation, documentation clarification) with structured reasoning, tool discipline, and grounding rules; agent response stability <strong>~25%</strong>; hallucinations <strong>&gt;30%</strong>.</li>
        <li>Shipped <strong>predictive ML pipelines</strong> (scikit-learn, XGBoost) for patient no-show, care engagement scoring, support prioritization; recall <strong>+15-20%</strong> on high-risk categories at <strong>&gt;90%</strong> precision via class weighting, stratified sampling, threshold calibration.</li>
        <li>Packaged ML/LLM inference as <strong>FastAPI / Flask</strong> services on <strong>Docker</strong> with structured logging and load simulation; post-deploy defects <strong>~30%</strong>.</li>
        <li>EHR + appointment + ticket preprocessing (Pandas, NumPy); dataset reliability <strong>&gt;98%</strong>, downstream instability <strong>-40%</strong>.</li>
        <li>Authored <strong>HIPAA-conscious data governance</strong> and stakeholder-facing system-limitation docs; ran weekly stakeholder calls with clinical SMEs.</li>
      </ul>
    </div>
    <div class="job">
      <div class="job-header">
        <span class="job-company">Energy Solutions International (Emerson)</span>
        <span class="job-period">Jun 2022 - Apr 2023</span>
      </div>
      <div class="job-role">Database &amp; DevOps Performance Engineer (Intern)</div>
      <div class="job-location">Hyderabad, India - Oil &amp; Gas, Enterprise ERP</div>
      <ul>
        <li>Optimized SQL and <strong>T-SQL stored procedures</strong> on the Synthesis Order-to-Cash platform; query execution time <strong>~20%</strong>, data retrieval latency <strong>~25%</strong>.</li>
        <li>Built <strong>CI/CD pipelines with Jenkins</strong> for schema updates and stored procedure deployments; deployment errors <strong>&gt;30%</strong>, release cycle <strong>~35-40%</strong>.</li>
        <li>Designed <strong>SQL Server DMVs and Grafana</strong> performance dashboards for long-running queries, deadlocks, CPU/IO contention; incident recurrence <strong>~25%</strong>, RCA speed <strong>~30%</strong>.</li>
        <li>Implemented <strong>RBAC and audit logging for financial modules</strong> in a compliance-sensitive oil &amp; gas environment.</li>
      </ul>
    </div>
    <div class="job">
      <div class="job-header">
        <span class="job-company">Suvidha Foundation</span>
        <span class="job-period">Jan 2022 - Mar 2022</span>
      </div>
      <div class="job-role">Machine Learning Engineer</div>
      <div class="job-location">Hyderabad, India - Nonprofit, Video Analytics, Applied NLP</div>
      <ul>
        <li>Built <strong>transformer-based video summarization</strong> over 5,000+ recorded sessions; hierarchical summarization + timestamp-aligned clip extraction cut manual review <strong>60-70%</strong>.</li>
        <li>Implemented <strong>document Q&amp;A with RAG</strong>; hallucinations <strong>~30%</strong>, contextual accuracy <strong>&gt;85%</strong>.</li>
        <li>Deployed as <strong>Flask</strong> API with a lightweight web interface for non-technical staff.</li>
      </ul>
    </div>`;

const PROJECTS = `
    <div class="project">
      <span class="project-title">Manga Lens - Multi-Provider AI Vision Chrome Extension (shipped, Chrome Web Store)</span>
      <div class="project-desc">Real-time manga / webtoon translation extension shipped to the Chrome Web Store. <strong>Multi-provider abstraction layer</strong> integrating four AI vision providers (Claude Sonnet, GPT-4o-mini, GPT-4.1-Nano, Ollama/minicpm-v) with per-provider payload handling (WebP for cloud, JPEG for local), cost-aware routing, circuit-breaker fallback. Manifest V3 service workers; multi-section capture pipeline for tall panels with coordinate remapping; 7-day cache; per-domain selector configs for 29 manga/webtoon sites; narrowed host permissions and privacy policy.</div>
      <div class="project-tech">TypeScript, Manifest V3, Service Workers, OpenAI / Anthropic / Google / Ollama, multi-provider integration</div>
    </div>
    <div class="project">
      <span class="project-title">Agentic Healthcare Claims Processing &amp; Fraud Risk Intelligence System</span>
      <div class="project-desc">Five-stage multi-agent pipeline (Intake Normalization, Validation, Consistency Analysis, Duplicate Detection, Fraud Risk Scoring) with <strong>schema-validated JSON contracts between agents</strong> to prevent cascading hallucinations. RAG-grounded CPT/ICD validation against vector-indexed policies. Audit-ready explainable risk scoring with reasoning traces.</div>
      <div class="project-tech">Python, LangChain, FastAPI, vector search, GPT-4, schema contracts</div>
    </div>
    <div class="project">
      <span class="project-title">Dream Decoder - Multimodal Creative Intelligence Platform</span>
      <div class="project-desc">Full-stack FastAPI + React/TypeScript/Vite/Tailwind app interpreting dreams, generating poetic reinterpretations, and synthesizing dreamscapes via coordinated multimodal APIs (Perplexity Sonar for interpretation, Replicate for 16:9 visuals). Introduced <strong>intermediate structured prompt transformation layers</strong> - improved contextual alignment <strong>~30%</strong> and first-pass image success <strong>~25-30%</strong> over naive direct prompting.</div>
      <div class="project-tech">FastAPI, React, TypeScript, Vite, Tailwind, Perplexity Sonar, Replicate</div>
    </div>
    <div class="project">
      <span class="project-title">Driver Drowsiness Detection - Real-Time YOLOv8 Fatigue Monitoring</span>
      <div class="project-desc">Replaced a two-stage CNN pipeline with a <strong>unified YOLOv8</strong> detection-and-classification model; reduced inference latency <strong>~30%</strong>. Sliding-window confidence aggregation suppressed blink-driven false positives <strong>~25%</strong>; adaptive frame skipping; NMS tuning for stable real-time operation via OpenCV.</div>
      <div class="project-tech">YOLOv8, OpenCV, PyTorch, real-time inference</div>
    </div>
    <div class="project">
      <span class="project-title">E-Farming Digital Marketplace (Founder &amp; Full-Stack Developer)</span>
      <div class="project-desc">Independently designed and shipped a PHP/MySQL/Bootstrap AgriTech marketplace connecting small-scale farmers with buyers. Onboarded <strong>80-120 active users</strong> in phase one; cart, reviews, and community blogging features to drive repeat engagement.</div>
      <div class="project-tech">PHP, MySQL, Bootstrap, full-stack, founder-led</div>
    </div>`;

const EDUCATION = `
    <div class="edu-item">
      <div class="edu-header">
        <span class="edu-title">Master of Science, Computer Science - <span class="edu-org">Kent State University</span></span>
        <span class="edu-year">Aug 2023 - May 2025</span>
      </div>
      <div class="edu-desc">Focus: Applied Machine Learning, NLP, Database Systems.</div>
    </div>
    <div class="edu-item">
      <div class="edu-header">
        <span class="edu-title">Bachelor of Technology, Computer Science - <span class="edu-org">KL University</span></span>
        <span class="edu-year">Jun 2019 - May 2023</span>
      </div>
      <div class="edu-desc">Founder / Lead of E-Farming platform (university project).</div>
    </div>`;

const CERTIFICATIONS = `
    <div class="cert-item">
      <span class="cert-title">Deep Learning Specialization - <span class="cert-org">DeepLearning.AI (Coursera)</span></span>
      <span class="cert-year">2024</span>
    </div>`;

const SKILLS_PERCEPTA = `
    <span class="skill-item"><span class="skill-category">LLM / GenAI:</span> RAG (chunking, embeddings, vector search), agentic workflows, multi-step agents, schema-validated JSON contracts, structured outputs, evaluation pipelines, guardrails, grounding, LangChain, multi-provider AI integration (OpenAI, Anthropic, Google, Ollama)</span>
    <span class="skill-item"><span class="skill-category">Languages:</span> Python (primary), TypeScript, JavaScript, SQL (T-SQL, PostgreSQL, SQLite), C++</span>
    <span class="skill-item"><span class="skill-category">ML Frameworks:</span> PyTorch, scikit-learn, XGBoost, Hugging Face Transformers, Diffusers, LoRA fine-tuning</span>
    <span class="skill-item"><span class="skill-category">Backend / Inference:</span> FastAPI, Flask, REST, Docker, structured logging, load simulation, microservices</span>
    <span class="skill-item"><span class="skill-category">Frontend:</span> React, TypeScript, Vite, Tailwind, Manifest V3 / Chrome Extensions</span>
    <span class="skill-item"><span class="skill-category">DevOps:</span> Docker, Jenkins, GitHub Actions, Grafana, CI/CD, cloud-ready deployment</span>
    <span class="skill-item"><span class="skill-category">Data Governance:</span> HIPAA-conscious de-identification, data lineage, evaluation audit trails, RBAC, audit logging</span>
    <span class="skill-item"><span class="skill-category">Domains:</span> Vertical AI (Healthcare / Manufacturing-adjacent / Energy-adjacent), Production AI Agents, Founder / 0-to-1</span>`;

const SKILLS_MOVEWORKS = `
    <span class="skill-item"><span class="skill-category">LLM / GenAI:</span> RAG, agentic workflows, multi-step agents, schema contracts, structured outputs, evaluation pipelines, guardrails, grounding, LangChain, multi-provider LLM API (OpenAI, Anthropic, Google, Ollama)</span>
    <span class="skill-item"><span class="skill-category">Languages:</span> Python (primary), TypeScript, JavaScript, Bash, SQL (T-SQL, PostgreSQL, SQLite), C++</span>
    <span class="skill-item"><span class="skill-category">ML Frameworks:</span> PyTorch, scikit-learn, XGBoost, Hugging Face Transformers</span>
    <span class="skill-item"><span class="skill-category">Backend / Integration:</span> FastAPI, Flask, REST APIs, Docker, microservices, structured logging, multi-provider abstraction</span>
    <span class="skill-item"><span class="skill-category">Enterprise Systems:</span> SQL Server / T-SQL stored procedures + DMVs, RBAC + audit logging, Jenkins CI/CD on schema deploys, ERP integration discipline (Emerson Synthesis Order-to-Cash)</span>
    <span class="skill-item"><span class="skill-category">DevOps / Linux:</span> Docker, Jenkins, GitHub Actions, Grafana, CI/CD, Linux command line, Windows / SQL Server</span>
    <span class="skill-item"><span class="skill-category">Customer-Facing:</span> Stakeholder vision-lock calls (clinical SMEs), system-limitation docs, founder-led product (E-Farming), Manga Lens public ship</span>
    <span class="skill-item"><span class="skill-category">Domains:</span> Enterprise AI Agent Delivery, Customer Success / Implementation, Compliance-Sensitive Integration (HIPAA, O&amp;G ERP)</span>`;

function buildHtml(slug) {
  const { summary, comps } = ROLES[slug];
  const SKILLS = slug === 'percepta-applied-ai-engineer' ? SKILLS_PERCEPTA : SKILLS_MOVEWORKS;
  const placeholders = {
    '{{LANG}}': 'en',
    '{{PAGE_WIDTH}}': '780px',
    '{{NAME}}': profile.full_name || 'Deepak Mallampati',
    '{{PHONE}}': profile.phone || '',
    '{{EMAIL}}': profile.email || '',
    '{{LINKEDIN_URL}}': profile.linkedin?.startsWith('http') ? profile.linkedin : `https://${profile.linkedin || ''}`,
    '{{LINKEDIN_DISPLAY}}': (profile.linkedin || '').replace(/^https?:\/\//, ''),
    '{{PORTFOLIO_URL}}': profile.portfolio_url || profile.github || '',
    '{{PORTFOLIO_DISPLAY}}': (profile.portfolio_url || profile.github || 'github.com/Deepak0070').replace(/^https?:\/\//, ''),
    '{{LOCATION}}': profile.location || 'Kent, OH',
    '{{SECTION_SUMMARY}}': 'PROFESSIONAL SUMMARY',
    '{{SECTION_COMPETENCIES}}': 'CORE COMPETENCIES',
    '{{SECTION_EXPERIENCE}}': 'PROFESSIONAL EXPERIENCE',
    '{{SECTION_PROJECTS}}': 'PROJECTS',
    '{{SECTION_EDUCATION}}': 'EDUCATION',
    '{{SECTION_CERTIFICATIONS}}': 'CERTIFICATIONS',
    '{{SECTION_SKILLS}}': 'SKILLS',
    '{{SUMMARY_TEXT}}': summary,
    '{{COMPETENCIES}}': comps.map(k => `<span class="competency-tag">${k}</span>`).join('\n      '),
    '{{EXPERIENCE}}': EXPERIENCE,
    '{{PROJECTS}}': PROJECTS,
    '{{EDUCATION}}': EDUCATION,
    '{{CERTIFICATIONS}}': CERTIFICATIONS,
    '{{SKILLS}}': SKILLS,
  };
  let html = TEMPLATE;
  for (const [k, v] of Object.entries(placeholders)) html = html.split(k).join(v);
  return html;
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.log('Usage: node tailor-pdf-overnight-2026-05-06-batch11.mjs <slug>...');
  console.log('Available slugs:', Object.keys(ROLES).join(', '));
  process.exit(1);
}

const today = '2026-05-06';
execSync(`mkdir -p output/${today}`);
for (const slug of targets) {
  if (!ROLES[slug]) {
    console.log(`SKIP unknown slug: ${slug}`);
    continue;
  }
  const html = buildHtml(slug);
  const tmp = `/tmp/cv-${slug}-${today}.html`;
  const pdf = `output/${today}/cv-deepak-mallampati-${slug}-${today}.pdf`;
  writeFileSync(tmp, html, 'utf-8');
  try {
    execSync(`node generate-pdf.mjs "${tmp}" "${pdf}"`, { stdio: ['ignore', 'inherit', 'inherit'] });
    console.log(`OK ${pdf}`);
  } catch (err) {
    console.log(`FAIL ${slug}: ${err.message?.slice(0,200)}`);
  }
}
