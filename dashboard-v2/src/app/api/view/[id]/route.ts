import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

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
    
    // In Next.js 15+, params is a Promise that must be awaited
    const { id } = await params;
    const jobId = id;

    const [job] = await sql`
      SELECT resume_html, cover_letter_html 
      FROM jobs 
      WHERE id = ${jobId} AND user_id = ${session.user.id}
    `;

    if (!job) {
      return new NextResponse('Job not found', { status: 404 });
    }

    const html = type === 'cl' ? job.cover_letter_html : job.resume_html;

    if (!html) {
      return new NextResponse('Content not found', { status: 404 });
    }

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error: any) {
    console.error('View Error:', error);
    return new NextResponse('Error loading content', { status: 500 });
  }
}
