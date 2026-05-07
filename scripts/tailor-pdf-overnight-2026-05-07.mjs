#!/usr/bin/env node
// Overnight 2026-05-07 batch — goodfin (#604), Metriport (#605), Paratus Health (#606), SimCare AI (#607).
// All four scored >= 3.0 in this overnight batch and need ATS-tailored PDFs.

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import yaml from 'js-yaml';

const TEMPLATE = readFileSync('templates/cv-template.html', 'utf-8');
const profile = yaml.load(readFileSync('config/profile.yml', 'utf-8')).candidate;

const BASE = `Applied AI / ML engineer shipping production healthcare AI end to end: HIPAA-conscious RAG (~35% retrieval precision, >90% grounded alignment), agentic LLM workflows w/ schema-validated JSON contracts (>30% hallucination reduction), predictive ML pipelines (15-20% recall on high-risk patient categories at >90% precision), and FastAPI + Docker packaging (~30% post-deploy defect reduction). Production computer vision via YOLOv8 (~30% inference latency reduction). Master's in Computer Science, Kent State.`;

const ROLES = {
  'goodfin-ai-engineer': {
    summary: `${BASE} Targeting goodfin's AI Engineer seat — Agentic Healthcare Claims 5-stage pipeline w/ schema-validated JSON contracts between agents (direct architectural mirror to investor-decisioning agents at the core of goodfin's AI-native product), production agentic LLM workflows w/ structured reasoning + tool discipline + grounding rules (>30% hallucination reduction), Manga Lens 4-provider AI vision Chrome MV3 extension live on Chrome Web Store w/ cost-aware payload routing (multi-provider production reliability), FastAPI/Docker packaging w/ structured logging + load simulation (~30% post-deploy defects), and Python primary stack translate 1:1 to goodfin's agentic AI core for accredited investors. Open to SF relocation; F-1 OPT.`,
    comps: ['Agentic AI Systems', 'Schema-Validated Agent Contracts', 'Multi-Step LLM Workflows', 'Production RAG', 'LLM Evaluation', 'Python Backend / FastAPI', 'Docker / Production Inference', 'Multi-Provider AI Integration', 'Fintech-Adjacent (Healthcare Claims Fraud Risk)', 'Open to SF Relocation, F-1 OPT'],
  },
  'metriport-founding-ai-engineer': {
    summary: `${BASE} Targeting Metriport's Founding AI Engineer seat — production RAG over clinical knowledge w/ recursive semantic chunking + transformer embeddings (~35% retrieval precision, >90% grounded alignment), structured data extraction discipline transferable from EHR extracts + appointment + ticket logs (dataset reliability >98%, downstream instability -40%), Agentic Healthcare Claims 5-stage pipeline w/ schema-validated JSON contracts between agents (direct mirror to Metriport's structured-extraction problem), HIPAA-conscious governance (de-id, lineage docs, evaluation audit trails), and FastAPI/Docker packaging translate 1:1 to Metriport's open-source healthcare data interoperability platform. Ready to ramp on FHIR/TEFCA. Open to SF/Bay Area relocation; F-1 OPT (sponsorship welcome per posting).`,
    comps: ['Healthcare Data Intelligence', 'Structured Extraction (HTML/PDF/Text)', 'HIPAA-conscious Governance', 'Production RAG / Grounding', 'EHR Preprocessing + Lineage Docs', 'Agentic LLM Workflows', 'Python / FastAPI / Docker', 'Open-Source Mindset', 'Multi-Format Data Pipelines', 'F-1 OPT (Sponsorship Welcome)'],
  },
  'paratus-health-founding-engineer': {
    summary: `${BASE} Targeting Paratus Health's Founding Engineer seat — Agentic Healthcare Claims 5-stage pipeline w/ schema-validated JSON contracts between agents (direct architectural mirror to clinic intake → insurance verification → EHR documentation flow), production agentic LLM workflows for multi-step healthcare queries (eligibility checks, care nav, doc clarification) w/ structured reasoning + tool discipline + grounding rules (>30% hallucination reduction, ~25% agent stability gain), HIPAA-conscious EHR preprocessing (lineage docs, dataset reliability >98%), and FastAPI/Docker packaging w/ structured logging + load sim (~30% post-deploy defects) translate 1:1 to Paratus' AI voice agents for outpatient clinic operations. Ready to ramp on Vapi/Bland voice infra + Epic/Athena FHIR. Open to Bay Area relocation; F-1 OPT.`,
    comps: ['Multi-Step Agent Reliability', 'Healthcare Operations Automation', 'Schema-Validated JSON Agent Contracts', 'EHR Integration (Epic/Athena Ready)', 'HIPAA-conscious Governance', 'Voice AI Adjacent (Agentic Workflows)', 'Production RAG / Grounding', 'FastAPI / Docker / Structured Logging', 'End-to-End Founding Shipping', 'Open to Bay Area Relocation, F-1 OPT'],
  },
  'simcare-ai-founding-engineer': {
    summary: `${BASE} Targeting SimCare AI's Founding Engineer seat — Dream Decoder full-stack FastAPI + React/TypeScript/Vite/Tailwind app coordinating multimodal AI APIs (Perplexity Sonar + Replicate image models) w/ intermediate structured prompt transformation layers (~30% better contextual alignment, ~25-30% first-pass image success), Manga Lens 4-provider AI vision Chrome MV3 extension live on Chrome Web Store (TypeScript MV3 service workers + multi-provider abstraction), Agentic Healthcare Claims 5-stage pipeline (direct mirror to AI-patient state-machine reliability), and production RAG w/ healthcare clinical-knowledge focus (~35% retrieval precision) translate to SimCare's AI patient simulation platform. Ready to ramp on Next.js/Supabase/AWS in first month. Open to SF or Remote-US; F-1 OPT.`,
    comps: ['Full-Stack AI Apps (FastAPI + React/TS)', 'Multimodal AI Orchestration', 'TypeScript / React / Chrome MV3', 'Multi-Provider AI Integration', 'Healthcare AI Domain Credibility', 'Multi-Step Agentic Reliability', 'Postgres / pgvector (Supabase Ready)', 'Docker / Cloud-Ready (AWS Ramp)', 'Production RAG / Grounding', 'Open to SF or Remote-US, F-1 OPT'],
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
        <li>Developed <strong>agentic LLM workflows</strong> for multi-step healthcare queries (eligibility checks, care workflow navigation, documentation clarification) with structured reasoning, tool discipline, grounding rules; agent response stability <strong>~25%</strong>; hallucinations <strong>&gt;30%</strong>.</li>
        <li>Built <strong>Retrieval-Augmented Generation (RAG)</strong> for clinical knowledge retrieval and healthcare documentation search; recursive semantic chunking + transformer embeddings improved retrieval precision <strong>~35%</strong>; retrieval-grounded response alignment <strong>&gt;90%</strong>.</li>
        <li>Shipped <strong>predictive ML pipelines</strong> (scikit-learn, XGBoost) for patient no-show, care engagement scoring, support prioritization; recall <strong>+15-20%</strong> on high-risk categories, precision held <strong>&gt;90%</strong> via class weighting, stratified sampling, threshold calibration.</li>
        <li>Packaged ML/LLM inference as <strong>FastAPI / Flask</strong> services on <strong>Docker</strong> with structured logging and load simulation; post-deploy defects <strong>~30%</strong>.</li>
        <li>EHR + appointment + ticket preprocessing (Pandas, NumPy); dataset reliability <strong>&gt;98%</strong>, downstream instability <strong>-40%</strong>.</li>
        <li><strong>HIPAA-conscious governance</strong>: de-identification, data lineage, evaluation audit trails, stakeholder-facing system-limitation docs.</li>
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
        <li>Tuned database maintenance (index rebuilds, partition-aware indexing); reconciliation runtime <strong>~15%</strong>, deadlocks <strong>~15%</strong>.</li>
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
        <li>AI-selected highlights aligned with human-curated moments <strong>~85%</strong>.</li>
        <li>Implemented <strong>document Q&amp;A with RAG</strong>; hallucinations <strong>~30%</strong>, contextual accuracy <strong>&gt;85%</strong>.</li>
        <li>Deployed as <strong>Flask</strong> API with a lightweight web interface for non-technical staff (research-to-production handoff).</li>
      </ul>
    </div>`;

const PROJECTS = `
    <div class="project">
      <span class="project-title">Agentic Healthcare Claims Processing &amp; Fraud Risk Intelligence System</span>
      <div class="project-desc">Five-stage multi-agent pipeline (Intake Normalization, Validation, Consistency Analysis, Duplicate Detection, Fraud Risk Scoring) with <strong>schema-validated JSON contracts between agents</strong> to prevent cascading hallucinations. RAG-grounded CPT/ICD validation against vector-indexed policies. Audit-ready explainable risk scoring with reasoning traces.</div>
      <div class="project-tech">Python, LangChain, FastAPI, pgvector, GPT-4, schema contracts, vector search</div>
    </div>
    <div class="project">
      <span class="project-title">Manga Lens - Multi-Provider AI Vision Chrome Extension</span>
      <div class="project-desc">Real-time manga translation extension shipped to the Chrome Web Store. Multi-provider abstraction (4 AI vision providers - Claude Sonnet, GPT-4o mini, GPT-4.1 Nano, Ollama/minicpm-v) with per-provider payload handling for failure isolation. Manifest V3 service workers; 7-day translation cache; cost-aware payload routing (WebP for cloud, JPEG for local).</div>
      <div class="project-tech">TypeScript, Manifest V3, Service Workers, OpenAI / Anthropic / Google / Ollama</div>
    </div>
    <div class="project">
      <span class="project-title">Dream Decoder - Multimodal Creative Intelligence Platform</span>
      <div class="project-desc">Full-stack <strong>FastAPI + React/TypeScript/Vite/Tailwind</strong> app coordinating multimodal AI APIs (Perplexity Sonar interpretation + Replicate image generation). Intermediate <strong>structured prompt transformation layers</strong> raised contextual alignment <strong>~30%</strong> and first-pass image success <strong>~25-30%</strong> over naive direct-prompt orchestration.</div>
      <div class="project-tech">FastAPI, React, TypeScript, Perplexity Sonar, Replicate, multimodal orchestration</div>
    </div>
    <div class="project">
      <span class="project-title">Driver Drowsiness Detection - Real-Time YOLOv8 Fatigue Monitoring</span>
      <div class="project-desc">Replaced two-stage CNN pipeline with a unified <strong>YOLOv8</strong> detection-and-classification model - inference latency <strong>~30%</strong>. Sliding-window confidence aggregation suppressed blink-driven false positives <strong>~25%</strong>; adaptive frame skipping + NMS tuning for stable real-time operation via OpenCV video capture.</div>
      <div class="project-tech">PyTorch, YOLOv8, OpenCV, LabelImg, real-time inference</div>
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

const SKILLS = `
    <span class="skill-item"><span class="skill-category">Languages:</span> Python, TypeScript, JavaScript, SQL (T-SQL, PostgreSQL, SQLite), C++</span>
    <span class="skill-item"><span class="skill-category">LLM / GenAI:</span> RAG, agentic workflows, structured outputs, evaluation pipelines, embeddings, vector search, LangChain, LlamaIndex, multi-provider AI integration, schema-validated JSON agent contracts</span>
    <span class="skill-item"><span class="skill-category">ML Frameworks:</span> PyTorch, scikit-learn, XGBoost, Hugging Face Transformers, Diffusers, threshold calibration, walk-forward validation</span>
    <span class="skill-item"><span class="skill-category">Computer Vision:</span> YOLOv8, OpenCV, ControlNet, OpenPose / MediaPipe, Stable Diffusion, video analytics</span>
    <span class="skill-item"><span class="skill-category">Backend / Inference:</span> FastAPI, Flask, REST, Docker, structured logging, load simulation</span>
    <span class="skill-item"><span class="skill-category">Data:</span> PostgreSQL + pgvector, Pandas, NumPy, EHR preprocessing, time-series</span>
    <span class="skill-item"><span class="skill-category">DevOps:</span> Docker, Jenkins, GitHub Actions, Grafana, cloud-ready deployment</span>
    <span class="skill-item"><span class="skill-category">Domains:</span> Applied AI, Healthcare AI, HIPAA-conscious systems, Agentic / Multi-Step LLM, Production RAG, Multimodal Systems</span>`;

function buildHtml(slug) {
  const { summary, comps } = ROLES[slug];
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
  console.log('Usage: node tailor-pdf-overnight-2026-05-07.mjs <slug>...');
  console.log('Available slugs:', Object.keys(ROLES).join(', '));
  process.exit(1);
}

const today = '2026-05-07';
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
