import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { auth } from '@/auth';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID || '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function streamR2Object(key: string) {
  const bucket = process.env.R2_BUCKET || '';
  const client = getR2Client();
  if (!bucket || !client) return null;

  let out: any;
  try {
    out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  } catch (e: any) {
    // Common cases: NoSuchKey, AccessDenied, SignatureDoesNotMatch.
    throw new Error(e?.name || e?.message || 'R2GetObjectFailed');
  }
  const body = out.Body as any;
  if (!body) return null;

  // Convert Node stream to Web ReadableStream for NextResponse.
  const nodeStream = body instanceof Readable ? body : Readable.fromWeb(body);
  return Readable.toWeb(nodeStream) as unknown as ReadableStream;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'resume'; // 'resume' or 'cl'
    const download = searchParams.get('download') === '1';
    const format = searchParams.get('format') || 'html'; // 'html' | 'pdf'
    
    // In Next.js 15+, params is a Promise that must be awaited
    const { id } = await params;
    const jobId = id;

    const [job] = await sql`
      SELECT
        company,
        title,
        resume_html,
        cover_letter_html,
        resume_pdf,
        cover_letter_pdf,
        resume_pdf_key,
        cover_letter_pdf_key
      FROM jobs 
      WHERE id = ${jobId} AND user_id = ${session.user.id}
    `;

    if (!job) {
      return new NextResponse('Job not found', { status: 404 });
    }

    const safe = (s: string) =>
      String(s || '')
        .replace(/https?:\/\//g, '')
        .replace(/[^a-z0-9]+/gi, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80);
    const nameCore = [
      safe(session.user.name || ''),
      safe(job.company || ''),
      safe(job.title || ''),
      type === 'cl' ? 'Cover_Letter' : 'Resume',
    ].filter(Boolean).join('_') || `career_ops_${jobId}`;

    if (format === 'pdf') {
      const filename = `${nameCore}.pdf`;
      const key = type === 'cl' ? job.cover_letter_pdf_key : job.resume_pdf_key;
      if (key) {
        let stream: ReadableStream | null = null;
        try {
          stream = await streamR2Object(String(key));
        } catch (e: any) {
          const msg = String(e?.message || '');
          if (msg.includes('NoSuchKey')) {
            return new NextResponse('PDF not found in R2 (rerun tailor --deep)', { status: 404 });
          }
          return new NextResponse(`R2 error: ${msg}`, { status: 500 });
        }
        if (!stream) return new NextResponse('PDF not available (empty object)', { status: 404 });
        return new NextResponse(stream, {
          headers: {
            'Content-Type': 'application/pdf',
            ...(download ? { 'Content-Disposition': `attachment; filename="${filename}"` } : {}),
          },
        });
      }

      // Backward compatibility: DB BYTEA (older runs)
      const pdf = type === 'cl' ? job.cover_letter_pdf : job.resume_pdf;
      if (!pdf) {
        return new NextResponse('PDF not found (run tailor --deep first)', { status: 404 });
      }
      return new NextResponse(pdf, {
        headers: {
          'Content-Type': 'application/pdf',
          ...(download ? { 'Content-Disposition': `attachment; filename="${filename}"` } : {}),
        },
      });
    }

    const html = type === 'cl' ? job.cover_letter_html : job.resume_html;

    if (!html) {
      return new NextResponse('Content not found', { status: 404 });
    }

    const filename = `${nameCore}.html`;
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        ...(download
          ? { 'Content-Disposition': `attachment; filename="${filename}"` }
          : {}),
      },
    });
  } catch (error: any) {
    console.error('View Error:', error);
    return new NextResponse('Error loading content', { status: 500 });
  }
}
