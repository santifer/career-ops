import fs from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import sql from './db/client.mjs';

let hf = null;
let hfUnavailable = false;
let hfTokenInUse = '';
const HF_MODEL = 'mistralai/Mistral-7B-Instruct-v0.3';
const TARGET_MAP = 'data/current_eval.json';
const TEMPLATE = 'templates/ats-template.html';
const require = createRequire(import.meta.url);

const idOrUrl = process.argv[2];
const rawUserId = process.env.SCAN_USER_ID || 1;
const userId = Number.parseInt(String(rawUserId), 10);
if (!Number.isFinite(userId)) {
  throw new Error(`Invalid SCAN_USER_ID: ${rawUserId}`);
}

if (!idOrUrl) {
  console.error("Usage: tailor <job_id_or_url>");
  process.exit(1);
}

async function getHfClient(token) {
  hfTokenInUse = token || process.env.HUGGINGFACE_TOKEN || '';
  if (hfUnavailable) return null;
  if (hf) return hf;
  try {
    const candidatePaths = [
      process.env.APP_ROOT && path.join(process.env.APP_ROOT, 'node_modules'),
      process.env.APP_ROOT,
      process.cwd(),
    ].filter(Boolean);
    const resolved = require.resolve('@huggingface/inference', { paths: candidatePaths });
    const mod = await import(pathToFileURL(resolved).href);
    hf = new mod.HfInference(token || process.env.HUGGINGFACE_TOKEN);
    return hf;
  } catch (e) {
    hfUnavailable = true;
    console.warn('⚠ Tailoring SDK unavailable in this runtime. Using Hugging Face HTTP/API fallback for text generation.');
    return null;
  }
}

async function callHfChatViaHttp(messages) {
  if (!hfTokenInUse) return null;
  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${hfTokenInUse}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: HF_MODEL,
      messages,
      max_tokens: 2000,
      temperature: 0.2,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HuggingFace API error ${response.status}: ${body.slice(0, 200)}`);
  }
  return response.json();
}

async function getChromium() {
  try {
    const mod = await import('playwright');
    return mod.chromium;
  } catch {
    return null;
  }
}


// ── UTILITIES ──

function renderExperience(exp, tailoredBullets) {
  if (!Array.isArray(exp) || exp.length === 0) return '';
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
  if (!Array.isArray(edu) || edu.length === 0) return '';
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
  if (!Array.isArray(skills) || skills.length === 0) return '';
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
    const syncScriptPath = path.join(process.cwd(), 'sync-profile.mjs');
    if (!fs.existsSync(syncScriptPath)) {
      return;
    }
    const profileStat = await stat(path.join(process.cwd(), 'config', 'profile.yml'));
    let cvStat;
    try { cvStat = await stat(path.join(process.cwd(), 'cv.md')); } catch {}

    if (!cvStat || profileStat.mtime > cvStat.mtime) {
      console.log('🔄 Profile change detected. Synchronizing cv.md...');
      execSync(`"${process.execPath}" "${syncScriptPath}"`);
    }
  } catch (e) {
    console.warn('⚠️ Could not check profile sync:', e.message);
  }
}

async function scrapeJD(url) {
  const normalizeUrl = (value) => {
    if (!value) return value;
    let next = String(value).trim();
    // Handle protocol-relative URLs like //duckduckgo.com/...
    if (next.startsWith('//')) next = `https:${next}`;
    try {
      const u = new URL(next);
      // Unwrap DuckDuckGo redirect links: https://duckduckgo.com/l/?uddg=<encoded>
      if (u.hostname.includes('duckduckgo.com') && u.pathname.startsWith('/l/')) {
        const ud = u.searchParams.get('uddg');
        if (ud) {
          return decodeURIComponent(ud);
        }
      }
    } catch {
      // leave as-is; caller will handle failure
    }
    return next;
  };

  const targetUrl = normalizeUrl(url);
  console.log(`🌐 Scraping job description from: ${targetUrl}`);
  const chromium = await getChromium();
  if (chromium) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      const text = await page.evaluate(() => document.body.innerText);
      await browser.close();
      return text.trim();
    } catch (err) {
      await browser.close();
      throw new Error(`Scrape failed: ${err.message}`);
    }
  }

  console.warn('⚠ Playwright unavailable in this runtime. Falling back to basic HTML fetch.');
  try {
    const res = await fetch(targetUrl, { headers: { 'User-Agent': 'career-ops-tailor/1.0' } });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const html = await res.text();
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return stripped.slice(0, 15000);
  } catch (err) {
    throw new Error(`Fallback fetch failed: ${err.message}`);
  }
}

async function tailorPackage(jd, profile, companyName) {
  const hfClient = await getHfClient();
  if (hfClient) {
    console.log(`🤖 Generating tailored package with ${HF_MODEL}...`);
  } else if (hfTokenInUse) {
    console.log(`🤖 Using direct Hugging Face API with ${HF_MODEL}...`);
  } else {
    return {
      resume: {
        summary: profile?.narrative?.exit_story || 'Experienced software engineer with product-minded execution and delivery focus.',
        core_competencies: (profile?.narrative?.superpowers || []).slice(0, 12),
        experience: (profile?.experience?.[0]?.bullets || []).slice(0, 3),
      },
      cover_letter: `Dear Hiring Team at ${companyName},\n\nI am excited to apply for this role. My background aligns strongly with the core requirements in your job description, and I focus on high-quality delivery, measurable outcomes, and cross-functional collaboration.\n\nI would value the opportunity to contribute and discuss how I can help your team.\n\nBest regards,\n${profile?.candidate?.full_name || 'Candidate'}`
    };
  }
  
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

  const messages = [
    { role: "system", content: "You are a professional recruiting assistant. Return ONLY valid JSON." },
    { role: "user", content: prompt }
  ];

  let response;
  if (hfClient) {
    response = await hfClient.chatCompletion({
      model: HF_MODEL,
      messages,
      max_tokens: 2000,
      temperature: 0.2
    });
  } else {
    response = await callHfChatViaHttp(messages);
  }

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

    let entry = { url: '', company: 'Direct Application', title: 'Job via URL' };

    if (/^https?:\/\//.test(idOrUrl)) {
      console.log("🔗 Direct URL detected. Bypassing database lookup...");
      entry.url = idOrUrl;
      try {
        const domain = new URL(idOrUrl).hostname;
        const parts = domain.split('.');
        if (parts.length >= 2) {
          entry.company = parts[parts.length - 2].charAt(0).toUpperCase() + parts[parts.length - 2].slice(1);
        }
      } catch (e) {}
    } else {
      const jobId = Number.parseInt(String(idOrUrl), 10);
      if (!Number.isFinite(jobId)) {
        throw new Error(`Invalid job id: ${idOrUrl}`);
      }
      const [jobRecord] = await sql`
        SELECT user_id, url, company, title
        FROM jobs
        WHERE id = ${jobId} AND user_id = ${userId}
      `;
      if (!jobRecord) throw new Error(`Job ID ${idOrUrl} not found in database.`);
      entry = jobRecord;
    }

    const [profileRow] = await sql`SELECT resume_context, hf_token FROM user_profiles WHERE user_id = ${userId}`;
    if (!profileRow) throw new Error(`Profile not configured for user ${userId}. Please setup via the Dashboard Settings.`);

    const profile = profileRow.resume_context;
    
    // Override HuggingFace global instance if the user has provided their own token
    if (profileRow.hf_token) {
      await getHfClient(profileRow.hf_token);
    } else {
      await getHfClient();
    }

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
      COMPETENCIES: (Array.isArray(tailoring.core_competencies) ? tailoring.core_competencies : []).map(skill => `<span class="competency-tag">${skill}</span>`).join(''),
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

    const sanitizeFilename = (str) => str.replace(/[^a-z0-9]/gi, '_').replace(/_{2,}/g, '_').substring(0, 50);
    const companySlug = sanitizeFilename(entry.company);
    const resumePathHtml = `output/Resume_Akash_Kaintura_SSE_${companySlug}.html`;
    const resumePathPdf = `output/Resume_Akash_Kaintura_SSE_${companySlug}.pdf`;

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

    const clPathHtml = `output/Cover_Letter_Akash_Kaintura_SSE_${companySlug}.html`;
    const clPathPdf = `output/Cover_Letter_Akash_Kaintura_SSE_${companySlug}.pdf`;
    fs.writeFileSync(clPathHtml, clHtml);

    console.log(`✅ Package ready: ${resumePathHtml} & ${clPathHtml}`);

    const generatePdfScript = path.join(process.cwd(), 'generate-pdf.mjs');
    const pdfChromium = await getChromium();
    if (!pdfChromium) {
      console.log("⚠ Playwright unavailable in this runtime. Skipping PDF generation; HTML artifacts generated successfully.");
    } else if (fs.existsSync(generatePdfScript)) {
      console.log("📄 Generating PDFs...");
      try {
        execSync(`"${process.execPath}" "${generatePdfScript}" "${resumePathHtml}" "${resumePathPdf}"`);
        execSync(`"${process.execPath}" "${generatePdfScript}" "${clPathHtml}" "${clPathPdf}"`);
        console.log(`✨ SUCCESS! Resume & Cover Letter saved for ${entry.company}`);
      } catch (pdfErr) {
        console.warn(`⚠ PDF generation unavailable in this runtime (${pdfErr.message}). HTML artifacts generated successfully.`);
      }
    } else {
      console.log("⚠ generate-pdf.mjs unavailable in this runtime. HTML artifacts generated successfully.");
    }

  } catch (err) {
    console.error("❌ Agentic Tailor Failed:", err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
