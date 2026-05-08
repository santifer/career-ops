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
  // Best-effort parser:
  // - split by blank lines
  // - treat first 1-2 lines as "header" then rest as bullets
  const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const out: any[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    const header = lines.slice(0, Math.min(2, lines.length)).join(' — ');
    const bullets = parseBullets(lines.slice(2).join('\n'));

    // Attempt to extract period
    const periodMatch = header.match(/(20\d{2}\s*[-–]\s*(20\d{2}|present|current))/i);
    const period = periodMatch ? periodMatch[1].replace(/\s+/g, ' ') : '';

    // Attempt to split company/role
    let company = '';
    let role = '';
    const parts = header.split('—').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      company = parts[0];
      role = parts[1];
    } else {
      role = header;
    }

    out.push({
      company,
      role,
      period,
      bullets,
    });
  }
  return out.slice(0, 8);
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

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Load parsers at runtime to avoid Turbopack ESM export issues.
  const pdfParseMod: any = await import('pdf-parse');
  const pdfParse: any = pdfParseMod?.default || pdfParseMod;
  const mammothMod: any = await import('mammoth');
  const mammoth: any = mammothMod?.default || mammothMod;

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }

  const name = file.name || 'resume';
  const lower = name.toLowerCase();
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File too large. Max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB` },
      { status: 413 }
    );
  }

  let text = '';
  try {
    if (lower.endsWith('.pdf')) {
      // pdf-parse has multiple export shapes across versions.
      if (typeof pdfParse === 'function') {
        const parsed = await pdfParse(bytes);
        text = parsed?.text || '';
      } else if (pdfParse?.PDFParse) {
        // pdf-parse@2.x: pass the PDF buffer via constructor options; load() takes no args.
        const parser = new pdfParse.PDFParse({ data: bytes });
        await parser.load();
        const out = await parser.getText();
        text = out?.text || '';
      } else {
        throw new Error('PDF parser unavailable');
      }
    } else if (lower.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer: bytes });
      text = result.value || '';
    } else {
      return NextResponse.json({ error: 'Unsupported file type (use PDF or DOCX)' }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Failed to parse resume: ${e?.message || 'unknown error'}` }, { status: 500 });
  }

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

  return NextResponse.json({
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
  });
}

