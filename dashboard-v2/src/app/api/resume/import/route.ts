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

function parseBullets(block: string) {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  const bullets: string[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^[-•·\u2022]\s+/, '').trim();
    if (cleaned.length >= 4) bullets.push(cleaned);
  }
  return bullets;
}

function parseExperience(text: string) {
  // Improved parser that handles various resume formats
  // Looks for job entry patterns: Company, Role, Dates, then bullets
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const out: any[] = [];
  
  let currentJob: any = null;
  let bulletBuffer: string[] = [];
  
  // Patterns for detecting job headers
  const datePattern = /(20\d{2}\s*[-–]\s*(20\d{2}|present|current|now))/i;
  const rolePattern = /(senior|lead|principal|staff|engineer|developer|manager|architect|consultant|analyst)/i;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hasDate = datePattern.test(line);
    const hasRole = rolePattern.test(line);
    const isBullet = line.startsWith('•') || line.startsWith('-') || line.startsWith('▸') || 
                     (/^\d+\./.test(line)) ||
                     (line.length > 20 && !hasDate && !hasRole && currentJob);
    
    // New job detection: line with date and/or company+role combo
    if (hasDate || (hasRole && (line.includes('—') || line.includes('|') || line.includes('at') || line.includes(',')))) {
      // Save previous job if exists
      if (currentJob) {
        currentJob.bullets = bulletBuffer;
        out.push(currentJob);
      }
      
      // Parse new job header
      const dateMatch = line.match(datePattern);
      const period = dateMatch ? dateMatch[0].replace(/\s+/g, ' ') : '';
      
      // Try to extract company and role - aggressively remove dates from both
      let company = '';
      let role = '';
      
      // First, remove the date from the line entirely for cleaner parsing
      const lineWithoutDate = line.replace(datePattern, '').trim();
      
      // Common separators: — | at , 
      const separators = [' — ', ' | ', ' - ', ' at ', ', ', ' – '];
      let parsed = false;
      for (const sep of separators) {
        if (lineWithoutDate.includes(sep)) {
          const parts = lineWithoutDate.split(sep).map(p => p.trim()).filter(Boolean);
          if (parts.length >= 2) {
            // Heuristic: whichever part has role keywords is the role
            const part1HasRole = rolePattern.test(parts[0]);
            const part2HasRole = rolePattern.test(parts[1]);
            
            if (part1HasRole && !part2HasRole) {
              role = parts[0];
              company = parts[1];
            } else if (part2HasRole && !part1HasRole) {
              role = parts[1];
              company = parts[0];
            } else {
              // Both or neither have role keywords - shorter is usually company
              role = parts[0].length > parts[1].length ? parts[0] : parts[1];
              company = parts[0].length > parts[1].length ? parts[1] : parts[0];
            }
            parsed = true;
            break;
          }
        }
      }
      
      // If no separator found, use the whole line (without date) as role
      if (!parsed) {
        role = lineWithoutDate;
      }
      
      // Final cleanup: remove any remaining date-like patterns
      company = company.replace(datePattern, '').trim();
      role = role.replace(datePattern, '').trim();
      
      currentJob = { company, role, period, bullets: [] };
      bulletBuffer = [];
    } else if (currentJob && isBullet) {
      // This is a bullet point for current job
      const cleanBullet = line.replace(/^[•\-▸]\s*/, '').trim();
      if (cleanBullet.length > 10) {
        bulletBuffer.push(cleanBullet);
      }
    } else if (currentJob && line.length > 10 && line.length < 100) {
      // Might be a continuation or additional info
      bulletBuffer.push(line);
    }
  }
  
  // Don't forget the last job
  if (currentJob) {
    currentJob.bullets = bulletBuffer;
    out.push(currentJob);
  }
  
  // Filter out entries with no real content
  return out.filter(j => j.company || j.role || j.bullets.length > 0).slice(0, 10);
}

function parseEducation(text: string) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const out: any[] = [];
  for (const line of lines) {
    // Very basic: "Degree, School (2016-2020)"
    const yearMatch = line.match(/(19\d{2}|20\d{2})\s*[-–]\s*(19\d{2}|20\d{2})/);
    out.push({
      degree: line,
      school: '',
      period: yearMatch ? yearMatch[0] : '',
    });
    if (out.length >= 4) break;
  }
  return out;
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  // Use unpdf - serverless-safe PDF text extraction (no workers, no DOM dependencies)
  const { extractText } = await import('unpdf');
  // unpdf expects Uint8Array, not Node Buffer
  const uint8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result = await extractText(uint8);
  // unpdf returns { totalPages: number; text: string[] }
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
      extractSection(text, /^\s*(PROFESSIONAL EXPERIENCE|EXPERIENCE|WORK EXPERIENCE)\s*$/im) ||
      extractSection(text, /^\s*(EMPLOYMENT)\s*$/im) ||
      '';
    const eduSection =
      extractSection(text, /^\s*(EDUCATION)\s*$/im) ||
      '';

    const experience = expSection ? parseExperience(expSection) : [];
    const education = eduSection ? parseEducation(eduSection) : [];
    const raw_text_preview = text.slice(0, 2500);

    return NextResponse.json(
      {
        ok: true,
        // Back-compat for Dashboard UI: also expose fields at top-level.
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
          // Lets us confirm Vercel picked up latest deploy.
          'X-CareerOps-ResumeImport-Version': 'unpdf-v1',
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
