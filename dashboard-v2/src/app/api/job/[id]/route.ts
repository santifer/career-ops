import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const { id } = await ctx.params;
    const jobId = Number.parseInt(String(id), 10);
    if (!Number.isFinite(jobId)) {
      return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
    }

    let job: any = null;
    try {
      const rows = await sql`
        SELECT
          id,
          company,
          title,
          url,
          canonical_url,
          source,
          score,
          jd_text,
          created_at,
          updated_at
        FROM jobs
        WHERE id = ${jobId} AND user_id = ${userId}
        LIMIT 1
      `;
      job = rows[0] || null;
    } catch {
      const rows = await sql`
        SELECT
          id,
          company,
          title,
          url,
          source,
          score,
          created_at,
          updated_at
        FROM jobs
        WHERE id = ${jobId} AND user_id = ${userId}
        LIMIT 1
      `;
      const row: any = rows[0] || null;
      job = row ? { ...row, canonical_url: row.url, jd_text: null } : null;
    }
    if (!job) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: job.id,
      company: job.company,
      title: job.title,
      url: job.canonical_url || job.url,
      source: job.source,
      score: job.score,
      jd_text: job.jd_text || null,
      created_at: job.created_at,
      updated_at: job.updated_at,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

