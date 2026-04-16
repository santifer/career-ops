import fs from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { HfInference } from '@huggingface/inference';
import { chromium } from 'playwright';
import yaml from 'js-yaml';
import sql from './db/client.mjs';
import dotenv from 'dotenv';

dotenv.config();

const hf = new HfInference(process.env.HUGGINGFACE_TOKEN);
const TARGET_MAP = 'data/current_eval.json';
const PROFILE_PATH = 'config/profile.yml';
const TEMPLATE = 'templates/ats-template.html';

const id = process.argv[2];
if (!id) {
  console.error("Usage: npm run offer-match -- <job_id>");
  console.error("   or: npm run oferta -- <job_id>");
  console.error("\nRun 'npm run offer-list' (or 'npm run ofertas') first to see available Job IDs.");
  process.exit(1);
}


// ── UTILITIES ──

function renderExperience(exp, tailoredBullets) {
  return exp.map((job, idx) => `
    <div class="job">
      <div class="job-header">
        <span>${job.role}</span>
        <span>${job.period}</span>
      </div>
      <div class="job-meta">${job.company}</div>
      <ul>
        ${(idx === 0 && tailoredBullets) 
          ? tailoredBullets.map(b => `<li>${b}</li>`).join('') 
          : job.bullets.map(b => `<li>${b}</li>`).join('')}
      </ul>
    </div>
  `).join('');
}

function renderEducation(edu) {
  return edu.map(e => `
    <div class="edu-item">
      <div class="edu-header">${e.degree} (${e.period}), ${e.school}</div>
    </div>
  `).join('');
}

function renderProjects(projects) {
  if (!projects) return '';
  return projects.map(p => `
    <div class="project">
      <span style="font-weight: bold;">${p.name}:</span> ${p.hero_metric}
    </div>
  `).join('');
}

function renderCategorizedSkills(skills) {
  // BP Style categorization logic
  const cats = {
    "Languages & runtime": ["TypeScript", "JavaScript", "Python", "Go", "SQL", "Bash", "Node.js", "NestJS", "React"],
    "Architecture & data": ["Microservices", "Event-driven", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Data modeling"],
    "Cloud & ops": ["AWS", "ECS", "Lambda", "S3", "IAM", "Docker", "Kubernetes", "Git", "CI/CD"],
    "Quality & reliability": ["Unit testing", "Jest", "RCA", "Post-mortems", "Observability", "Tracing"]
  };

  let html = '';
  Object.entries(cats).forEach(([name, keywords]) => {
     // Find which skills from profile belong here
     const matched = skills.filter(s => keywords.some(k => s.toLowerCase().includes(k.toLowerCase())));
     if (matched.length > 0) {
        html += `<div class="skills-category"><span class="skills-label">${name}:</span> ${matched.join(', ')}</div>`;
     }
  });
  return html;
}

// sync cv.md if profile.yml is newer
async function checkSync() {
  try {
    const profileStat = await stat(path.join(process.cwd(), 'config', 'profile.yml'));
    let cvStat;
    try { cvStat = await stat(path.join(process.cwd(), 'cv.md')); } catch {}

    if (!cvStat || profileStat.mtime > cvStat.mtime) {
      console.log('🔄 Profile change detected. Synchronizing cv.md...');
      execSync('node sync-profile.mjs');
    }
  } catch (e) {
    console.warn('⚠️ Could not check profile sync:', e.message);
  }
}

async function scrapeJD(url) {
  console.log(`🌐 Scraping job description from: ${url}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const text = await page.evaluate(() => document.body.innerText);
    await browser.close();
    return text.trim();
  } catch (err) {
    await browser.close();
    throw new Error(`Scrape failed: ${err.message}`);
  }
}

async function tailorPackage(jd, profile, companyName) {
  console.log("🤖 Generating Tailored Package with MiniMaxAI/MiniMax-M2.7...");
  
  const cvContext = `Headline: ${profile.narrative.headline}\nSummary: ${profile.narrative.exit_story}\nSuperpowers: ${profile.narrative.superpowers.join(', ')}`;
  const prompt = `
    You are an expert technical recruiter and resume writer. I will provide a Job Description (JD) and my professional profile.
    
    TASK:
    1. RESUME TAILORING: Identify North Star requirements and generate:
       - A summary.
       - 12 core competencies.
       - 3 rewritten bullet points for the current role.
    2. COVER LETTER: Write a persuasive 3-paragraph letter:
       - Para 1: Hook them with why THIS company (e.g. ${companyName}) excites you.
       - Para 2: Map your specific "Superpowers" to their biggest challenges in the JD.
       - Para 3: Call to action.
    
    JD:
    ${jd.substring(0, 4000)}
    
    My Context:
    ${cvContext}
    
    OUTPUT FORMAT (JSON ONLY):
    {
      "resume": {
        "summary": "...",
        "core_competencies": ["kw1", "kw2", ...],
        "experience": ["bullet1", "bullet2", "bullet3"]
      },
      "cover_letter": "..."
    }
  `;

  const response = await hf.chatCompletion({
    model: "MiniMaxAI/MiniMax-M2.7",
    messages: [
      { role: "system", content: "You are a professional recruiting assistant. Return ONLY valid JSON." },
      { role: "user", content: prompt }
    ],
    max_tokens: 2000,
    temperature: 0.2
  });

  try {
    const content = response.choices[0].message.content;
    const jsonStr = content.substring(content.indexOf('{'), content.lastIndexOf('}') + 1);
    const data = JSON.parse(jsonStr);
    return data;
  } catch (err) {
    console.error("Failed to parse AI response:", response.choices[0].message.content);
    throw new Error("AI output was not valid JSON");
  }
}

// Main Logic
(async () => {
  try {
    await checkSync();

    const profile = yaml.load(fs.readFileSync(PROFILE_PATH, 'utf8'));
    const mapping = JSON.parse(fs.readFileSync(TARGET_MAP, 'utf8'));
    const entry = mapping[id];
    if (!entry) throw new Error(`ID ${id} not found.`);

    console.log(`🎯 Target identified: ${entry.company}`);
    const jdText = await scrapeJD(entry.url);
    const result = await tailorPackage(jdText, profile, entry.company);
    const tailoring = result.resume;
    
    // Prepare common replacements
    const c = profile.candidate;
    const commonReps = {
      NAME: c.full_name,
      EMAIL: c.email,
      LOCATION: c.location,
      PHONE: c.phone,
      LINKEDIN_URL: `https://${c.linkedin}`,
      LINKEDIN_DISPLAY: c.linkedin,
      PORTFOLIO_URL: c.github ? `https://${c.github}` : '#',
      PORTFOLIO_DISPLAY: c.github || 'Github',
      DATE: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      COMPANY_NAME: entry.company,
      LANG: 'en'
    };

    // 1. GENERATE RESUME
    const resumeReps = {
      ...commonReps,
      SECTION_SUMMARY: 'Professional Summary',
      SUMMARY_TEXT: tailoring.summary,
      SECTION_COMPETENCIES: 'Core Competencies',
      COMPETENCIES: tailoring.core_competencies.map(skill => `<span class="competency-tag">${skill}</span>`).join(''),
      SECTION_EXPERIENCE: 'Professional Experience',
      EXPERIENCE: renderExperience(profile.experience, tailoring.experience),
      SECTION_PROJECTS: 'Selected Achievements',
      PROJECTS: renderProjects(profile.narrative.proof_points),
      SECTION_EDUCATION: 'Education',
      EDUCATION: renderEducation(profile.education),
      SECTION_SKILLS: 'Technical Skills',
      SKILLS: renderCategorizedSkills(profile.narrative.superpowers),
      SECTION_CERTIFICATIONS: '',
      CERTIFICATIONS: '',
      PAGE_WIDTH: '800px'
    };

    let resumeHtml = fs.readFileSync(TEMPLATE, 'utf8');
    Object.entries(resumeReps).forEach(([key, val]) => {
      resumeHtml = resumeHtml.replace(new RegExp(`{{${key}}}`, 'g'), val || '');
    });

    const companySlug = entry.company.replace(/\s+/g, '_');
    const resumePathHtml = `output/Resume_Akash_Kaintura_${companySlug}.html`;
    const resumePathPdf = `output/Resume_Akash_Kaintura_${companySlug}.pdf`;

    if (!fs.existsSync('output')) fs.mkdirSync('output');
    fs.writeFileSync(resumePathHtml, resumeHtml);

    // 2. GENERATE COVER LETTER
    const clReps = {
      ...commonReps,
      COVER_LETTER_TEXT: result.cover_letter.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('')
    };

    let clHtml = fs.readFileSync('templates/cover-letter.html', 'utf8');
    Object.entries(clReps).forEach(([key, val]) => {
      clHtml = clHtml.replace(new RegExp(`{{${key}}}`, 'g'), val || '');
    });

    const clPathHtml = `output/Cover_Letter_Akash_Kaintura_${companySlug}.html`;
    const clPathPdf = `output/Cover_Letter_Akash_Kaintura_${companySlug}.pdf`;
    fs.writeFileSync(clPathHtml, clHtml);

    console.log(`✅ Package ready: ${resumePathHtml} & ${clPathHtml}`);

    console.log("📄 Generating PDFs...");
    execSync(`"${process.execPath}" generate-pdf.mjs ${resumePathHtml} ${resumePathPdf}`);
    execSync(`"${process.execPath}" generate-pdf.mjs ${clPathHtml} ${clPathPdf}`);
    console.log(`✨ SUCCESS! Resume & Cover Letter saved for ${entry.company}`);

  } catch (err) {
    console.error("❌ Agentic Tailor Failed:", err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
