import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // 12MB safety cap (Vercel-friendly)

function normalizeText(input: string) {
  return (input || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractSection(text: string, heading: RegExp) {
  const m = text.match(heading);
  if (!m || m.index === undefined) return null;
  const start = m.index + m[0].length;
  const rest = text.slice(start);
  const nextHeading = rest.search(/^\s*[A-Z][A-Z &/]{2,}\s*$/m);
  const end = nextHeading >= 0 ? start + nextHeading : text.length;
  return text.slice(start, end).trim();
}

function parseExperience(text: string) {
  // Comprehensive parser - captures ALL job entries with dates
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const out: any[] = [];
  
  // Date pattern - catches various formats
  const datePattern = /(20\d{2}\s*[-–—]\s*(?:20\d{2}|present|current|now)|\d{4}\s*[-–—]\s*(?:\d{4}|present))/i;
  
  // Company suffixes for detection
  const companySuffixes = /(?:Solutions|Services|Technologies|Tech|Labs|Inc\.?|LLC|Ltd\.?|Corp\.?|Corporation|Company|Group|Partners|Consulting|Systems|Software|Digital|Global|Engineering|Engineers|Products|Media|Enterprises|Holdings|Platforms|Ventures|Studios|Industries|International|Network|Group|Ltd)/i;
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    
    // Check if this line has a date - indicates job header
    const dateMatch = line.match(datePattern);
    
    if (dateMatch) {
      const period = dateMatch[0].trim();
      // Remove date from line to get company/role
      let headerText = line.replace(dateMatch[0], '').trim();
      
      // Clean up separators around the removed date
      headerText = headerText.replace(/\s*[|—–-]\s*$/, '').trim();
      headerText = headerText.replace(/^\s*[|—–-]\s*/, '').trim();
      
      // Try to split company and role
      let company = '';
      let role = '';
      
      // Method 1: Look for separator
      const separators = [' — ', ' | ', ' - ', ' – ', '—', '|'];
      let split = false;
      
      for (const sep of separators) {
        if (headerText.includes(sep)) {
          const parts = headerText.split(sep).map(p => p.trim()).filter(Boolean);
          if (parts.length >= 2) {
            // Check which part looks like company (has suffix or is shorter)
            const part0HasSuffix = companySuffixes.test(parts[0]);
            const part1HasSuffix = companySuffixes.test(parts[1]);
            
            // Role keywords
            const roleKeywords = /engineer|developer|manager|architect|analyst|consultant|lead|senior|junior|staff|principal|director|head|vp/i;
            const part0HasRole = roleKeywords.test(parts[0]);
            const part1HasRole = roleKeywords.test(parts[1]);
            
            if ((part0HasSuffix && !part1HasSuffix) || (part0HasRole && !part1HasRole)) {
              company = parts[0];
              role = parts[1];
            } else if ((part1HasSuffix && !part0HasSuffix) || (part1HasRole && !part0HasRole)) {
              company = parts[1];
              role = parts[0];
            } else {
              // Default: first part is company, second is role
              company = parts[0];
              role = parts[1];
            }
            split = true;
            break;
          }
        }
      }
      
      // Method 2: No separator - try to detect by suffix
      if (!split && headerText.length > 0) {
        // Find company suffix position
        const suffixMatch = headerText.match(companySuffixes);
        if (suffixMatch && suffixMatch.index !== undefined) {
          const endOfCompany = suffixMatch.index + suffixMatch[0].length;
          company = headerText.slice(0, endOfCompany).trim();
          role = headerText.slice(endOfCompany).replace(/^[—|–\-]+\s*/, '').trim();
          
          // If role is empty or just punctuation, swap
          if (!role || role.match(/^[—|–\-]$/)) {
            role = headerText;
            company = '';
          }
        } else {
          // No company suffix found - treat whole thing as role
          role = headerText;
        }
      }
      
      // Collect bullets - all following lines until next date or blank/new section
      const bullets: string[] = [];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        
        // Stop if we hit another date (new job)
        if (datePattern.test(nextLine)) {
          break;
        }
        
        // Stop if we hit a new section header (all caps)
        if (/^[A-Z][A-Z\s&]{3,}$/.test(nextLine)) {
          break;
        }
        
        // This is a bullet point
        const cleanBullet = nextLine.replace(/^[•\-▸*]\s*/, '').trim();
        if (cleanBullet.length > 5) {
          bullets.push(cleanBullet);
        }
        i++;
      }
      
      // Add job if we have meaningful content
      if (company || role || bullets.length > 0) {
        out.push({ company, role, period, bullets });
      }
    } else {
      i++;
    }
  }
  
  return out;
}

function parseEducation(text: string) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const out: any[] = [];
  
  const degreePattern = /(Bachelor|Master|B\.?A\.?|M\.?A\.?|B\.?S\.?|M\.?S\.?|M\.?Tech|B\.?Tech|Ph\.?D|MBA|MCA|BCA|BSc|MSc|Diploma|Certificate)/i;
  const yearPattern = /(20\d{2}|19\d{2})/g;
  
  for (const line of lines) {
    const hasDegree = degreePattern.test(line);
    const years = line.match(yearPattern);
    
    if (hasDegree || years) {
      out.push({
        degree: line.replace(/\s*\([^)]*\)/g, '').trim(),
        school: '',
        period: years ? years.join(' — ') : '',
      });
    }
    
    if (out.length >= 6) break;
  }
  
  return out;
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  const { extractText } = await import('unpdf');
  const uint8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result = await extractText(uint8);
  return Array.isArray(result?.text) ? result.text.join('\n') : '';
}

export async function POST(req: NextRequest) {
  let step = 'auth';
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    step = 'formData';
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    step = 'readFile';
    const name = file.name || 'resume';
    const lower = name.toLowerCase();
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large. Max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB` },
        { status: 413 }
      );
    }

    step = 'parse';
    let text = '';
    if (lower.endsWith('.pdf')) {
      text = await extractPdfText(bytes);
    } else if (lower.endsWith('.docx')) {
      const mammothMod: any = await import('mammoth');
      const mammoth: any = mammothMod?.default || mammothMod;
      const result = await mammoth.extractRawText({ buffer: bytes });
      text = result.value || '';
    } else {
      return NextResponse.json({ error: 'Unsupported file type (use PDF or DOCX)' }, { status: 400 });
    }

    step = 'postProcess';
    text = normalizeText(text);

    const expSection =
      extractSection(text, /^\s*(PROFESSIONAL EXPERIENCE|EXPERIENCE|WORK EXPERIENCE|CAREER HISTORY)\s*$/im) ||
      extractSection(text, /^\s*(EMPLOYMENT|WORK HISTORY)\s*$/im) ||
      '';
    const eduSection =
      extractSection(text, /^\s*(EDUCATION|ACADEMIC|QUALIFICATIONS)\s*$/im) ||
      '';

    const experience = expSection ? parseExperience(expSection) : [];
    const education = eduSection ? parseEducation(eduSection) : [];
    const raw_text_preview = text.slice(0, 2500);

    return NextResponse.json(
      {
        ok: true,
        experience,
        education,
        raw_text_preview,
        extracted: {
          experience,
          education,
          raw_text_preview,
        },
      },
      {
        headers: {
          'X-CareerOps-ResumeImport-Version': 'comprehensive-v3',
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        error: `Resume import failed at step="${step}": ${e?.message || 'unknown error'}`,
      },
      { status: 500 }
    );
  }
}
