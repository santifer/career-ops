const fs = require('fs');
const template = fs.readFileSync('templates/cv-template.html', 'utf8');
const profile = {
  name: 'Deepan Chandrasekaran',
  email: '2300032731cse3@gmail.com',
  phone: '+91 9384331251',
  location: 'Karur, India',
  linkedin_url: 'https://linkedin.com/in/deepanmpc',
  linkedin_display: 'linkedin.com/in/deepanmpc',
  portfolio_url: 'https://github.com/deepanmpc',
  portfolio_display: 'github.com/deepanmpc'
};

const summary = 'Final-year B.Tech CSE student (CGPA 9.15, graduating April 2027) with a track record of winning national AI hackathons and shipping production-grade GenAI systems. Expert in Data Structures, Algorithms, and Object-Oriented Programming (Java/C++/Python). Experienced in building scalable AI/ML integrations, distributed systems, and real-time speech pipelines. Committed to technical excellence and solving complex problems in a Fortune #1 technology ecosystem.';

const competencies = [
  'Data Structures & Algorithms',
  'Object Oriented Programming (OOP)',
  'Distributed Systems & SOA',
  'Scalable AI/ML Integrations',
  'Java / C++ / Python Mastery',
  'Microservices Architecture'
].map(c => '<span class="competency-tag">' + c + '</span>').join(' • ');

const education = `
<div class="item">
  <div class="item-title">B.Tech in Computer Science and Engineering — KL University</div>
  <div class="item-meta">CGPA: 9.15 / 10 | Expected April 2027</div>
</div>`;

const experience = `
<div class="item">
  <div class="item-title">Software Developer (Freelance) — Local Apparel Manufacturer</div>
  <div class="item-meta">2023 | Karur, India</div>
  <ul>
    <li>Engineered a real-time 3D product-preview feature using Three.js for a responsive React frontend, interpreting complex client requirements into technical specifications.</li>
    <li>Resolved critical third-party API integration defects under strict delivery constraints, improving system reliability for an order-management backend.</li>
    <li>Collaborated directly with stakeholders to gather feedback and iteratively refine software performance and user experience.</li>
  </ul>
</div>`;

const projects = `
<div class="item">
  <div class="item-title">LaRa – Real-Time AI Therapy Platform</div>
  <div class="item-meta">Python, FastAPI, Docker, RAG | 3rd Place National Hackathon Winner</div>
  <ul>
    <li>Architected a production-grade GenAI system with a deterministic FSM decision engine and RAG-based long-term memory.</li>
    <li>Built a secure, offline-capable real-time speech pipeline (Faster-Whisper, WebRTC VAD) for low-latency inference.</li>
  </ul>
</div>
<div class="item">
  <div class="item-title">ResumeAnalyse – RAG-LLM Architecture</div>
  <div class="item-meta">ChromaDB, Ollama, Sentence Transformers</div>
  <ul>
    <li>Engineered a high-performance RAG pipeline for automated recruitment, achieving >90% resume-job relevance matching.</li>
    <li>Optimized semantic retrieval using vector indexing (ChromaDB) and efficient document chunking strategies.</li>
  </ul>
</div>
<div class="item">
  <div class="item-title">ISL Sign Language Recognition – CNN Model</div>
  <div class="item-meta">PyTorch, NVIDIA A100/H100/T4 | 99.8% Accuracy</div>
  <ul>
    <li>Designed a full SDLC pipeline for large-scale data ingestion and training, optimizing throughput to 45 FPS on edge devices.</li>
  </ul>
</div>`;

const skills = `
<div class="skill-row"><div class="skill-label">Languages:</div><div class="skill-values">Java, Python, C/C++, JavaScript, TypeScript, SQL</div></div>
<div class="skill-row"><div class="skill-label">AI & Data:</div><div class="skill-values">PyTorch, LangChain, RAG, FAISS, ChromaDB, Prompt Engineering</div></div>
<div class="skill-row"><div class="skill-label">Frameworks:</div><div class="skill-values">FastAPI, Spring Boot, React, Three.js, Docker, Microservices</div></div>`;

let html = template
  .replace(/{{LANG}}/g, 'en')
  .replace(/{{PAGE_WIDTH}}/g, '210mm')
  .replace(/{{NAME}}/g, profile.name)
  .replace(/{{PHONE}}/g, profile.phone)
  .replace(/{{EMAIL}}/g, profile.email)
  .replace(/{{LOCATION}}/g, profile.location)
  .replace(/{{LINKEDIN_URL}}/g, profile.linkedin_url)
  .replace(/{{LINKEDIN_DISPLAY}}/g, profile.linkedin_display)
  .replace(/{{PORTFOLIO_URL}}/g, profile.portfolio_url)
  .replace(/{{PORTFOLIO_DISPLAY}}/g, profile.portfolio_display)
  .replace(/{{SECTION_SUMMARY}}/g, 'Professional Summary')
  .replace(/{{SUMMARY_TEXT}}/g, summary)
  .replace(/{{SECTION_COMPETENCIES}}/g, 'Core Competencies')
  .replace(/{{COMPETENCIES}}/g, competencies)
  .replace(/{{SECTION_EDUCATION}}/g, 'Education')
  .replace(/{{EDUCATION}}/g, education)
  .replace(/{{SECTION_EXPERIENCE}}/g, 'Work Experience')
  .replace(/{{EXPERIENCE}}/g, experience)
  .replace(/{{SECTION_PROJECTS}}/g, 'Key Projects')
  .replace(/{{PROJECTS}}/g, projects)
  .replace(/{{SECTION_SKILLS}}/g, 'Technical Skills')
  .replace(/{{SKILLS}}/g, skills)
  .replace(/{{SECTION_CERTIFICATIONS}}/g, 'Certifications')
  .replace(/{{CERTIFICATIONS}}/g, '')
  .replace(/{{#if PHONE}}([\s\S]*?){{\/if}}/g, profile.phone ? '$1' : '')
  .replace(/{{#if SUMMARY_TEXT}}([\s\S]*?){{\/if}}/g, summary ? '$1' : '')
  .replace(/{{#if COMPETENCIES}}([\s\S]*?){{\/if}}/g, competencies ? '$1' : '')
  .replace(/{{#if CERTIFICATIONS}}([\s\S]*?){{\/if}}/g, '')
  .replace(/{{#if PROJECTS}}([\s\S]*?){{\/if}}/g, projects ? '$1' : '');

fs.writeFileSync('output/cv-deepan-walmart-2026-04-21.html', html);
