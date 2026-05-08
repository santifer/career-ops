import fs from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import sql from './db/client.mjs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

let hf = null;
let hfUnavailable = false;
let hfTokenInUse = '';
const HF_MODEL = 'MiniMaxAI/MiniMax-M2.7';
const TARGET_MAP = 'data/current_eval.json';
const TEMPLATE = 'templates/ats-template-professional.html';
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

function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID || '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    `https://${accountId}.r2.cloudflarestorage.com`;
  // Cloudflare R2 supports virtual-hosted style; path-style can cause signature mismatch
  // depending on endpoint/account routing. Default to virtual-hosted style.
  const forcePathStyle = process.env.R2_FORCE_PATH_STYLE === '1';

  return new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function uploadToR2({ key, body, contentType }) {
  const bucket = process.env.R2_BUCKET || '';
  const client = getR2Client();
  if (!bucket || !client) {
    console.warn('[R2] Skip upload: missing bucket or client credentials');
    console.warn(`[R2] Debug: bucket="${bucket}", hasClient=${!!client}, accountId="${process.env.R2_ACCOUNT_ID?.slice(0, 6)}...", hasAccessKey=${!!process.env.R2_ACCESS_KEY_ID}, hasSecret=${!!process.env.R2_SECRET_ACCESS_KEY}`);
    return false;
  }
  try {
    console.log(`[R2] Config: endpoint="${process.env.R2_ENDPOINT?.trim() || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`}", forcePathStyle=${process.env.R2_FORCE_PATH_STYLE === '1'}`);
    console.log(`[R2] Uploading ${key} (${body.length} bytes) to bucket ${bucket}...`);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    console.log(`[R2] Upload successful: ${key}`);
    return true;
  } catch (e) {
    console.error(`[R2] Upload failed for ${key}: ${e?.name || e?.message}`);
    if (e?.message?.includes('AccessDenied')) {
      console.error('[R2] Hint: Check your R2 token permissions (needs Object Read & Write)');
    }
    if (e?.message?.includes('NoSuchBucket')) {
      console.error(`[R2] Hint: Bucket "${bucket}" does not exist`);
    }
    return false;
  }
}


// ── UTILITIES ──

function renderExperience(exp, tailoredBullets, jdText = '', maxPages = 2) {
  if (!Array.isArray(exp) || exp.length === 0) return '';

  // Limit bullets per job based on page count
  const maxBulletsPerJob = maxPages >= 3 ? 6 : maxPages >= 2 ? 4 : 3;
  
  // Find the most relevant job to apply tailored bullets
  // Default to most recent (index 0), but if JD is provided, score by relevance
  let tailoredJobIndex = 0;
  if (jdText && tailoredBullets && tailoredBullets.length > 0) {
    const jdLower = jdText.toLowerCase();
    let bestScore = -1;
    exp.forEach((job, idx) => {
      const jobText = `${job.role} ${job.company} ${(job.bullets || []).join(' ')}`.toLowerCase();
      // Simple relevance: count JD keywords appearing in job text
      const jdKeywords = jdLower.match(/\b\w{4,}\b/g) || [];
      const score = jdKeywords.filter(kw => jobText.includes(kw)).length;
      if (score > bestScore) {
        bestScore = score;
        tailoredJobIndex = idx;
      }
    });
    console.log(`[DEBUG] Selected job #${tailoredJobIndex + 1} (${exp[tailoredJobIndex]?.role} at ${exp[tailoredJobIndex]?.company}) for tailored bullets`);
  } else {
    console.log(`[DEBUG] No tailored bullets or JD provided. Using original bullets for all jobs.`);
  }

  // Date patterns to aggressively strip from company/role
  const datePatterns = [
    /\b\d{4}\s*[-–—]\s*(?:\d{4}|present|current|now)\b/gi,
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}\b/gi,
    /\b20\d{2}\b/g,
    /\b(?:present|current|now)\b/gi,
  ];
  
  const stripDates = (text) => {
    let cleaned = text;
    for (const pattern of datePatterns) {
      cleaned = cleaned.replace(pattern, '').trim();
    }
    // Clean up leftover separators
    return cleaned.replace(/\s*[|—–-]\s*$/, '').replace(/^\s*[|—–-]\s*/, '').trim();
  };

  return exp.map((job, idx) => {
    // Apply tailored bullets to the most relevant job, original bullets to others
    const useTailored = (idx === tailoredJobIndex) && tailoredBullets && tailoredBullets.length > 0;
    if (useTailored) {
      console.log(`[DEBUG] Applying ${tailoredBullets.length} tailored bullets to job #${idx + 1} (${job.role})`);
    }
    const bullets = useTailored
      ? tailoredBullets.slice(0, maxBulletsPerJob)
      : (job.bullets || []).slice(0, maxBulletsPerJob);

    let role = (job.role || '').trim();
    let company = (job.company || '').trim();
    let dates = (job.period || '').trim();
    
    // Aggressively strip dates from role and company
    role = stripDates(role);
    company = stripDates(company);
    
    // Clean up: if company is in role text, extract it
    if (role && !company) {
      // Try to detect company in role string using common suffixes
      const companySuffixPattern = /(.*?(?:Solutions|Services|Technologies|Tech|Labs|Inc\.?|LLC|Ltd\.?|Corp\.?|Company|Group|Partners|Consulting|Systems|Software|Digital|Global|Engineering|Engineers|Products|Media|Enterprises|Holdings|Platforms|Ventures|Studios))\s*(?:—|\||-|–)?\s*(.+)/i;
      const match = role.match(companySuffixPattern);
      if (match) {
        company = match[1].trim();
        role = match[2].trim();
      }
    }
    
    // Final cleanup - remove any remaining date-like text
    role = stripDates(role);
    company = stripDates(company);
    
    // If role and company are identical, keep only role
    if (role.toLowerCase() === company.toLowerCase()) {
      company = '';
    }
    
    // Clean layout: Company — Role (left)    Dates (right)
    const hasCompanyInRole = role.toLowerCase().includes(company.toLowerCase()) && company.length > 3;
    const hasRoleInCompany = company.toLowerCase().includes(role.toLowerCase()) && role.length > 3;
    
    let titleLeft = '';
    if (company && role && !hasCompanyInRole && !hasRoleInCompany) {
      titleLeft = `<span class="job-company">${company}</span> — <span class="job-title">${role}</span>`;
    } else if (role && hasCompanyInRole) {
      // Role already contains company - just show role
      titleLeft = `<span class="job-title">${role}</span>`;
    } else if (company && hasRoleInCompany) {
      // Company contains role - just show company
      titleLeft = `<span class="job-company">${company}</span>`;
    } else if (company) {
      titleLeft = `<span class="job-company">${company}</span>`;
    } else if (role) {
      titleLeft = `<span class="job-title">${role}</span>`;
    }

    return `
    <div class="job">
      <div class="job-header">
        <div>${titleLeft}</div>
        <div class="job-dates">${dates}</div>
      </div>
      <ul>
        ${bullets.map(b => `<li>${b}</li>`).join('')}
      </ul>
    </div>
  `}).join('');
}

function renderEducation(edu) {
  if (!Array.isArray(edu) || edu.length === 0) return '';
  return edu.map(e => `
    <div>${e.degree}${e.school ? `, ${e.school}` : ''}${e.period ? ` (${e.period})` : ''}</div>
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

  // Generic professional categories that work for ANY industry
  const cats = {
    "Core Competencies": [],
    "Technical Skills": [],
    "Tools & Platforms": [],
    "Methodologies": []
  };

  // Keywords to auto-categorize (works for software, marketing, sales, healthcare, finance, etc.)
  const categoryKeywords = {
    "Core Competencies": ["management", "leadership", "communication", "analysis", "strategy", "planning", "research", "design", "development", "consulting", "advisory", "operations"],
    "Technical Skills": ["programming", "coding", "data", "analytics", "engineering", "architecture", "cloud", "database", "automation", "ml", "ai", "statistical", "modeling"],
    "Tools & Platforms": ["software", "platform", "tool", "system", "framework", "suite", "app", "application", "crm", "erp", "aws", "azure", "gcp", "salesforce", "sap", "excel", "tableau"],
    "Methodologies": ["agile", "scrum", "kanban", "waterfall", "lean", "six sigma", "process", "workflow", "framework", "standard", "compliance", "iso", "gdpr"]
  };

  // Sort skills into categories
  const categorized = { ...cats };
  const uncategorized = [];

  for (const skill of skills) {
    const skillLower = skill.toLowerCase();
    let matched = false;

    for (const [catName, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(k => skillLower.includes(k))) {
        categorized[catName].push(skill);
        matched = true;
        break;
      }
    }

    if (!matched) {
      uncategorized.push(skill);
    }
  }

  // Add uncategorized to Core Competencies
  if (uncategorized.length > 0) {
    categorized["Core Competencies"].push(...uncategorized);
  }

  // Generate HTML - only show categories that have skills
  let html = '';
  for (const [name, skillList] of Object.entries(categorized)) {
    if (skillList.length > 0) {
      // Remove duplicates and limit to reasonable number
      const unique = [...new Set(skillList)].slice(0, 8);
      html += `<div class="skill-line"><span class="skill-label">${name}:</span> ${unique.join(', ')}</div>`;
    }
  }

  return html || `<div class="skill-line"><span class="skill-label">Skills:</span> ${skills.slice(0, 12).join(', ')}</div>`;
}

// Calculate years of experience from experience array
function calculateYearsOfExperience(experience) {
  if (!Array.isArray(experience) || experience.length === 0) return 0;

  let totalYears = 0;
  const currentYear = new Date().getFullYear();

  for (const job of experience) {
    if (!job.period) continue;
    const period = job.period;

    // Parse various date formats
    // Format: "2020–Present", "2018-2022", "Jan 2020 - Dec 2022"
    const parts = period.split(/[-–—]/);
    if (parts.length === 2) {
      const startStr = parts[0].trim();
      const endStr = parts[1].trim();

      // Extract year from start
      const startMatch = startStr.match(/\d{4}/);
      const startYear = startMatch ? parseInt(startMatch[0]) : currentYear;

      // Extract year from end
      let endYear;
      if (/present|current|now/i.test(endStr)) {
        endYear = currentYear;
      } else {
        const endMatch = endStr.match(/\d{4}/);
        endYear = endMatch ? parseInt(endMatch[0]) : currentYear;
      }

      totalYears += Math.max(0, endYear - startYear);
    }
  }

  return totalYears;
}

// Calculate ATS score based on keyword matching
function calculateATSScore(profile, jdText, tailoring) {
  if (!jdText || !profile) return { score: 0, matched: [], missing: [] };

  const jdLower = jdText.toLowerCase();
  const matched = [];
  const missing = [];

  // Extract keywords from superpowers/skills
  const profileSkills = [
    ...(profile.narrative?.superpowers || []),
    ...(profile.experience?.flatMap(e => e.bullets || []) || [])
  ];

  // Check which skills appear in JD
  for (const skill of profileSkills) {
    const skillLower = skill.toLowerCase();
    const keywords = skillLower.split(/[,;\s]+/).filter(k => k.length > 2);

    for (const keyword of keywords) {
      if (jdLower.includes(keyword)) {
        matched.push(skill);
        break;
      }
    }
  }

  // Calculate score (0-100)
  const uniqueMatches = [...new Set(matched)];
  const baseScore = Math.min(100, (uniqueMatches.length * 5) + 50);

  // Boost score if tailored competencies match
  const competencyBonus = (tailoring?.core_competencies?.length || 0) * 2;
  const finalScore = Math.min(100, baseScore + competencyBonus);

  return {
    score: finalScore,
    matched: uniqueMatches.slice(0, 10),
    totalMatched: uniqueMatches.length
  };
}

// Generate visual ATS score bar
function generateATSScoreBar(score) {
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  return `
    <div style="margin: 10px 0;">
      <div style="font-size: 9pt; color: #666; margin-bottom: 3px;">ATS Compatibility Score</div>
      <div style="background: #e5e7eb; height: 8px; border-radius: 4px; overflow: hidden;">
        <div style="background: ${color}; width: ${score}%; height: 100%; border-radius: 4px;"></div>
      </div>
      <div style="font-size: 10pt; font-weight: bold; color: ${color}; margin-top: 2px;">${score}/100</div>
    </div>
  `;
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
    // Handle URLs missing scheme like duckduckgo.com/...
    if (!/^https?:\/\//i.test(next) && /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(next)) {
      next = `https://${next}`;
    }
    try {
      const u = new URL(next);
      // Unwrap DuckDuckGo redirect links: https://duckduckgo.com/l/?uddg=<encoded>
      if (u.hostname.includes('duckduckgo.com') && u.pathname.startsWith('/l/')) {
        const ud = u.searchParams.get('uddg');
        if (ud) {
          try {
            return decodeURIComponent(ud);
          } catch {
            return ud;
          }
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

function canonicalizeUrl(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  let next = raw;
  if (next.startsWith('//')) next = `https:${next}`;
  if (!/^https?:\/\//i.test(next) && /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(next)) {
    next = `https://${next}`;
  }
  try {
    const u = new URL(next);
    u.hash = '';
    u.search = '';
    return u.toString();
  } catch {
    return next.split('?')[0];
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
      cover_letter: `${companyName}'s ${jd.substring(0, 60).replace(/\n/g, ' ')}... requirements match what I've built: ${(profile?.narrative?.superpowers || []).slice(0, 2).join(', ')}.\n\nI can start contributing immediately. Reach me at ${profile?.candidate?.email || ''} or ${profile?.candidate?.phone || ''} to discuss.`
    };
  }
  
  const cvContext = `Headline: ${profile?.narrative?.headline || ''}\nSummary: ${profile?.narrative?.exit_story || ''}\nSuperpowers: ${(profile?.narrative?.superpowers || []).join(', ')}`;
  const prompt = `
You are a senior technical writer who writes direct, conversational cover letters without corporate fluff.

RULES:
- NO salutations (no "Dear", "To whom it may concern")
- NO closings (no "Best regards", "Sincerely", "Warm regards")
- NO buzzwords: passion, leveraging, synergies, robust, seamless, cutting-edge, proven track record
- NO AI-sounding phrases
- Use short sentences, active voice, specific numbers
- Lead with impact, not filler

TASK:
1. RESUME TAILORING: CRITICAL - Every bullet must include at least ONE specific technology/requirement from the JD:
   - A one-line summary stating what you do + years of experience
   - 8-10 core competencies (skills/tools from JD)
   - 3 rewritten bullets for ONE role that EXPLICITLY mentions JD technologies

   BULLET REQUIREMENTS:
   - Each bullet MUST include at least one technology/skill from the JD
   - Use the EXACT terminology from the JD (e.g., if JD says ".NET Core", use ".NET Core" not "backend frameworks")
   - Connect your experience directly to JD requirements with metrics

2. COVER LETTER: Write 2 tight paragraphs ONLY (no greeting, no sign-off):
   - Para 1: One sentence hook citing something specific from their JD/company, then 2-3 bullets mapping your experience to their needs with metrics
   - Para 2: One sentence stating availability + how to reach you

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
      let jobId = Number.parseInt(String(idOrUrl), 10);
      if (!Number.isFinite(jobId)) {
        throw new Error(`Invalid job id: ${idOrUrl}`);
      }
      
      // If the ID is a small number (e.g., from rank output), try to resolve it from the mapping file
      if (jobId < 1000 && fs.existsSync('data/current_eval.json')) {
        try {
          const mapping = JSON.parse(fs.readFileSync('data/current_eval.json', 'utf8'));
          if (mapping[jobId] && mapping[jobId].url) {
            console.log(`📎 Resolved index ${jobId} to URL: ${mapping[jobId].url}`);
            const resolvedUrl = mapping[jobId].url;
            // Now lookup by URL
            const [jobRecord] = await sql`
              SELECT id, user_id, url, company, title
              FROM jobs
              WHERE url = ${resolvedUrl} AND user_id = ${userId}
              LIMIT 1
            `;
            if (jobRecord) {
              entry = jobRecord;
            } else {
               // Fallback if not found in db, just use the mapping info
               entry = { url: resolvedUrl, company: mapping[jobId].company, title: mapping[jobId].title };
            }
          }
        } catch (err) {
          console.warn('Failed to parse current_eval.json mapping:', err.message);
        }
      }

      // If the ID is a small number but we don't have a mapping file (common in GitHub Actions),
      // interpret it as a 1-based index into the user's ranked job list.
      if (!entry.url && jobId > 0 && jobId < 1000) {
        const offset = Math.max(0, jobId - 1);
        const [jobRecord] = await sql`
          SELECT id, user_id, url, company, title
          FROM jobs
          WHERE user_id = ${userId}
          ORDER BY (score IS NULL) ASC, score DESC, created_at DESC
          OFFSET ${offset}
          LIMIT 1
        `;
        if (jobRecord) {
          console.log(`📎 Resolved index ${jobId} to job: ${jobRecord.company} — ${jobRecord.title}`);
          entry = jobRecord;
        }
      }

      // If entry still empty (not resolved from map), try direct DB lookup by ID
      if (!entry.url) {
        const [jobRecord] = await sql`
          SELECT id, user_id, url, company, title
          FROM jobs
          WHERE id = ${jobId} AND user_id = ${userId}
        `;
        if (!jobRecord) throw new Error(`Job ID ${idOrUrl} not found in database.`);
        entry = jobRecord;
      }
    }

    // Debug: log what we have
    console.log(`[DEBUG] Entry resolved: id=${entry?.id}, company=${entry?.company}`);

    const [profileRow] = await sql`SELECT resume_context, hf_token FROM user_profiles WHERE user_id = ${userId}`;
    if (!profileRow) throw new Error(`Profile not configured for user ${userId}. Please setup via the Dashboard Settings.`);

    const profile = profileRow.resume_context;

    // Debug profile data
    console.log(`[DEBUG] Profile loaded: hasExperience=${Array.isArray(profile?.experience)}, expCount=${profile?.experience?.length || 0}, hasEducation=${Array.isArray(profile?.education)}, eduCount=${profile?.education?.length || 0}`);
    console.log(`[DEBUG] Profile narrative: headline="${profile?.narrative?.headline || 'N/A'}", hasSuperpowers=${Array.isArray(profile?.narrative?.superpowers)}, superpowersCount=${profile?.narrative?.superpowers?.length || 0}`);

    // Override HuggingFace global instance if the user has provided their own token
    if (profileRow.hf_token) {
      await getHfClient(profileRow.hf_token);
    } else {
      await getHfClient();
    }

    console.log(`🎯 Target identified: ${entry.company}`);
    const jdText = await scrapeJD(entry.url);
    const canonicalUrl = canonicalizeUrl(entry.url);
    const result = await tailorPackage(jdText, profile, entry.company);
    const tailoring = result.resume;

    // Debug: Log tailored bullets
    console.log(`[DEBUG] AI generated ${(tailoring?.experience || []).length} tailored bullets:`);
    (tailoring?.experience || []).forEach((b, i) => console.log(`  ${i + 1}. ${b?.substring(0, 60)}...`));

    // Calculate ATS Score
    const atsScore = calculateATSScore(profile, jdText, tailoring);
    console.log(`📊 ATS Score: ${atsScore.score}/100 (${atsScore.totalMatched} keywords matched)`);

    // Calculate Years of Experience
    const yearsExp = calculateYearsOfExperience(profile.experience);
    console.log(`📊 Years of Experience: ${yearsExp}`);

    // Warn if no experience data
    if (!profile.experience || profile.experience.length === 0) {
      console.warn('⚠ No experience data in profile. Resume will be incomplete. Please update your profile via Dashboard Settings.');
    }
    if (!profile.education || profile.education.length === 0) {
      console.warn('⚠ No education data in profile. Resume will be incomplete. Please update your profile via Dashboard Settings.');
    }

    // Determine resume length based on experience
    // 0-5 years: 1 page, 6-11 years: 2 pages, 12-20 years: up to 4 pages
    const maxPages = yearsExp <= 5 ? 1 : yearsExp <= 11 ? 2 : Math.min(4, Math.ceil(yearsExp / 5));
    console.log(`📄 Resume length: up to ${maxPages} page${maxPages > 1 ? 's' : ''}`);

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
      LANG: 'en',
      YEARS_EXP: `${yearsExp}`,
      MAX_PAGES: `${maxPages}`,
      PROFESSIONAL_HEADLINE: profile.narrative?.headline || 'Professional'
    };

    // 1. GENERATE RESUME - Show ALL experience entries, just limit bullets per job based on page budget
    const experienceToShow = profile.experience || [];

    // Build portfolio link (conditional)
    const portfolioLink = c.github
      ? ` | <a href="https://${c.github}">${c.github.replace(/^github.com\//, '')}</a>`
      : '';

    // Hide sections if missing data (never show blank Education/Experience)
    const hasExperience = Array.isArray(experienceToShow) && experienceToShow.length > 0;
    const hasEducation = Array.isArray(profile.education) && profile.education.length > 0;

    // Determine if projects section should show
    const hasProjects = maxPages >= 2 && profile.narrative?.proof_points && profile.narrative.proof_points.length > 0;

    const yearsInline = yearsExp > 0 ? ` • ${yearsExp}+ years` : '';

    const skillsLines = renderCategorizedSkills(profile.narrative?.superpowers || []);
    const hasSkills = Boolean(skillsLines && String(skillsLines).trim().length > 0);

    const resumeReps = {
      ...commonReps,
      EXPERIENCE: hasExperience ? renderExperience(experienceToShow, tailoring.experience, jdText, maxPages) : '',
      EXPERIENCE_DISPLAY: hasExperience ? 'block' : 'none',
      EDUCATION: hasEducation ? renderEducation(profile.education) : '',
      EDUCATION_DISPLAY: hasEducation ? 'block' : 'none',
      SKILLS_LINES: skillsLines,
      SKILLS_DISPLAY: hasSkills ? 'block' : 'none',
      YEARS_EXP_INLINE: yearsInline,
      PORTFOLIO_LINK: portfolioLink
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

    // Persist to Neon DB so it can be viewed on the Vercel dashboard!
    try {
      await sql`
        ALTER TABLE jobs
          ADD COLUMN IF NOT EXISTS resume_html TEXT,
          ADD COLUMN IF NOT EXISTS cover_letter_html TEXT,
          ADD COLUMN IF NOT EXISTS resume_pdf_key TEXT,
          ADD COLUMN IF NOT EXISTS cover_letter_pdf_key TEXT,
          ADD COLUMN IF NOT EXISTS canonical_url TEXT,
          ADD COLUMN IF NOT EXISTS jd_text TEXT;
      `;
      
      // We assume entry.id exists if it came from DB, else we try to find it by URL
      if (entry.id) {
        await sql`
          UPDATE jobs
          SET
            resume_html = ${resumeHtml},
            cover_letter_html = ${clHtml},
            canonical_url = COALESCE(${canonicalUrl}, canonical_url),
            jd_text = COALESCE(${String(jdText || '').slice(0, 25000)}, jd_text)
          WHERE id = ${entry.id} AND user_id = ${userId}
        `;
      } else {
        await sql`
          UPDATE jobs
          SET
            resume_html = ${resumeHtml},
            cover_letter_html = ${clHtml},
            canonical_url = COALESCE(${canonicalUrl}, canonical_url),
            jd_text = COALESCE(${String(jdText || '').slice(0, 25000)}, jd_text)
          WHERE url = ${entry.url} AND user_id = ${userId}
        `;
      }
      console.log(`💾 HTML assets persisted to database. You can view/print them from the dashboard!`);
    } catch (dbErr) {
      console.warn(`⚠ Could not save HTML to database: ${dbErr.message}`);
    }

    const generatePdfScript = path.join(process.cwd(), 'generate-pdf.mjs');
    const pdfChromium = await getChromium();
    if (!pdfChromium) {
      console.log("⚠ Playwright unavailable in this runtime. Skipping PDF generation. (View HTML in Dashboard)");
    } else if (fs.existsSync(generatePdfScript)) {
      console.log("📄 Generating PDFs...");
      try {
        execSync(`"${process.execPath}" "${generatePdfScript}" "${resumePathHtml}" "${resumePathPdf}"`);
        execSync(`"${process.execPath}" "${generatePdfScript}" "${clPathHtml}" "${clPathPdf}"`);
        console.log(`✨ SUCCESS! Resume & Cover Letter saved for ${entry.company}`);

        // Upload PDFs to Cloudflare R2 (preferred) and persist keys to DB.
        try {
          const resumePdfBuf = fs.existsSync(resumePathPdf) ? fs.readFileSync(resumePathPdf) : null;
          const clPdfBuf = fs.existsSync(clPathPdf) ? fs.readFileSync(clPathPdf) : null;
          // ALWAYS use job ID for R2 key if available - never fall back to company name
          const keyId = entry?.id || jobId;
          const baseKey = `users/${userId}/jobs/${keyId}/${Date.now()}`;
          console.log(`[R2] Generating key with id=${keyId}, baseKey=${baseKey}`);
          let resumeKey = null;
          let clKey = null;
          let resumeUploaded = false;
          let clUploaded = false;

          if (resumePdfBuf) {
            resumeKey = `${baseKey}-resume.pdf`;
            resumeUploaded = await uploadToR2({ key: resumeKey, body: resumePdfBuf, contentType: 'application/pdf' });
            console.log(resumeUploaded ? `[R2] Resume uploaded: ${resumeKey}` : `[R2] Resume upload FAILED: ${resumeKey}`);
          }
          if (clPdfBuf) {
            clKey = `${baseKey}-cover-letter.pdf`;
            clUploaded = await uploadToR2({ key: clKey, body: clPdfBuf, contentType: 'application/pdf' });
            console.log(clUploaded ? `[R2] Cover letter uploaded: ${clKey}` : `[R2] Cover letter upload FAILED: ${clKey}`);
          }

          // Only save keys to DB if upload was successful
          if (resumeUploaded || clUploaded) {
            if (entry.id) {
              await sql`
                UPDATE jobs
                SET
                  resume_pdf_key = COALESCE(${resumeUploaded ? resumeKey : null}, resume_pdf_key),
                  cover_letter_pdf_key = COALESCE(${clUploaded ? clKey : null}, cover_letter_pdf_key)
                WHERE id = ${entry.id} AND user_id = ${userId}
              `;
            } else {
              await sql`
                UPDATE jobs
                SET
                  resume_pdf_key = COALESCE(${resumeUploaded ? resumeKey : null}, resume_pdf_key),
                  cover_letter_pdf_key = COALESCE(${clUploaded ? clKey : null}, cover_letter_pdf_key)
                WHERE url = ${entry.url} AND user_id = ${userId}
              `;
            }
            console.log('💾 PDFs uploaded to R2 and keys persisted to database.');
          } else {
            console.warn('⚠ No PDFs were uploaded to R2 (check credentials/bucket).');
          }
        } catch (pdfDbErr) {
          console.warn(`⚠ Could not upload PDFs to R2: ${pdfDbErr.message}`);
        }
      } catch (pdfErr) {
        console.warn(`⚠ PDF generation unavailable in this runtime (${pdfErr.message}).`);
      }
    } else {
      console.log("⚠ generate-pdf.mjs unavailable in this runtime.");
    }

  } catch (err) {
    console.error("❌ Agentic Tailor Failed:", err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
