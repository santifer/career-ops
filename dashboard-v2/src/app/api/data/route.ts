import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { auth } from '@/auth';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // 0. Fetch lightweight job counters (used for background-action completion toasts)
    // NOTE: Some DB schemas don't have `updated_at` on `jobs`. We fall back gracefully.
    let jobMeta: {
      jobs_total: number;
      jobs_ranked: number;
      last_job_created_at: any;
      last_job_updated_at: any;
    } = { jobs_total: 0, jobs_ranked: 0, last_job_created_at: null, last_job_updated_at: null };

    try {
      const jobMetaRows = await sql`
        SELECT
          COUNT(*)::int AS jobs_total,
          COUNT(*) FILTER (WHERE score IS NOT NULL AND score > 0)::int AS jobs_ranked,
          MAX(created_at) AS last_job_created_at,
          MAX(updated_at) AS last_job_updated_at
        FROM jobs
        WHERE user_id = ${userId}
      `;
      const row: any = jobMetaRows[0];
      if (row) {
        jobMeta = {
          jobs_total: Number(row.jobs_total ?? 0),
          jobs_ranked: Number(row.jobs_ranked ?? 0),
          last_job_created_at: row.last_job_created_at ?? null,
          last_job_updated_at: row.last_job_updated_at ?? null,
        };
      }
    } catch {
      const jobMetaRows = await sql`
        SELECT
          COUNT(*)::int AS jobs_total,
          COUNT(*) FILTER (WHERE score IS NOT NULL AND score > 0)::int AS jobs_ranked,
          MAX(created_at) AS last_job_created_at
        FROM jobs
        WHERE user_id = ${userId}
      `;
      const row: any = jobMetaRows[0] || {};
      jobMeta = {
        jobs_total: Number(row.jobs_total ?? 0),
        jobs_ranked: Number(row.jobs_ranked ?? 0),
        last_job_created_at: row.last_job_created_at ?? null,
        last_job_updated_at: row.last_job_created_at ?? null,
      };
    }

    // 1. Fetch Applications
    const applications = await sql`
      SELECT 
        a.id as app_id,
        a.job_id as job_id,
        a.status,
        a.applied_at,
        a.resume_file,
        j.company,
        j.title as role,
        j.url,
        j.score
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      WHERE a.user_id = ${userId}
      ORDER BY a.applied_at DESC
    `;

    // 2. Fetch Stats
    const stats = await sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'APPLIED') as applied,
        COUNT(*) FILTER (WHERE status = 'INTERVIEW') as interviews,
        COUNT(*) FILTER (WHERE status = 'OFFER') as offers
      FROM applications
      WHERE user_id = ${userId}
    `;

    // 3. Fetch Pipeline directly from jobs table (Multi-Tenant)
    const pipeline = await sql`
      SELECT id as pipeline_id, url, title, company, score, source, created_at
      FROM jobs
      WHERE user_id = ${userId}
        AND (score > 0 OR score IS NULL)
        AND id NOT IN (SELECT job_id FROM applications WHERE user_id = ${userId})
      ORDER BY score DESC, created_at DESC
    `;

    // 4. Fetch User Profile from DB
    const profileRow = await sql`
      SELECT resume_context, targeting_keywords 
      FROM user_profiles 
      WHERE user_id = ${userId}
      LIMIT 1
    `;
    let profile = profileRow.length > 0 ? profileRow[0].resume_context : null;

    // 5. Fetch Generated Docs from DB (resume/cover-letter assets)
    let pdfs: any[] = [];
    try {
      // Some schemas don't have `updated_at` on `jobs`. Try updated_at first, then fall back to created_at.
      try {
        const docs = await sql`
          SELECT
            id,
            company,
            title,
            updated_at,
            (resume_pdf IS NOT NULL) AS has_resume_pdf,
            (cover_letter_pdf IS NOT NULL) AS has_cover_letter_pdf,
            (resume_html IS NOT NULL) AS has_resume_html,
            (cover_letter_html IS NOT NULL) AS has_cover_letter_html
          FROM jobs
          WHERE user_id = ${userId} 
            AND (
              resume_pdf IS NOT NULL OR cover_letter_pdf IS NOT NULL
              OR resume_html IS NOT NULL OR cover_letter_html IS NOT NULL
            )
          ORDER BY updated_at DESC
        `;
        pdfs = docs.map(d => ({
          id: d.id,
          company: d.company,
          title: d.title,
          name: `Tailored Assets: ${d.company} - ${d.title}`,
          mtime: d.updated_at,
          has_resume_pdf: !!d.has_resume_pdf,
          has_cover_letter_pdf: !!d.has_cover_letter_pdf,
          has_resume_html: !!d.has_resume_html,
          has_cover_letter_html: !!d.has_cover_letter_html,
        }));
      } catch {
        const docs = await sql`
          SELECT
            id,
            company,
            title,
            created_at,
            (resume_pdf IS NOT NULL) AS has_resume_pdf,
            (cover_letter_pdf IS NOT NULL) AS has_cover_letter_pdf,
            (resume_html IS NOT NULL) AS has_resume_html,
            (cover_letter_html IS NOT NULL) AS has_cover_letter_html
          FROM jobs
          WHERE user_id = ${userId} 
            AND (
              resume_pdf IS NOT NULL OR cover_letter_pdf IS NOT NULL
              OR resume_html IS NOT NULL OR cover_letter_html IS NOT NULL
            )
          ORDER BY created_at DESC
        `;
        pdfs = docs.map(d => ({
          id: d.id,
          company: d.company,
          title: d.title,
          name: `Tailored Assets: ${d.company} - ${d.title}`,
          mtime: d.created_at,
          has_resume_pdf: !!d.has_resume_pdf,
          has_cover_letter_pdf: !!d.has_cover_letter_pdf,
          has_resume_html: !!d.has_resume_html,
          has_cover_letter_html: !!d.has_cover_letter_html,
        }));
      }
    } catch (colErr) {
      // If the columns don't exist yet, it means the user hasn't run 'tailor' since the update.
      // We gracefully ignore this error and return an empty docs list.
      pdfs = [];
    }

    // 6. Fetch latest background completion event (GitHub Actions / cron)
    let latestEvent: any = null;
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS background_events (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          action_script TEXT NOT NULL,
          action_args TEXT,
          status TEXT NOT NULL,
          run_url TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `;
      const evRows = await sql`
        SELECT id, action_script, status, created_at
        FROM background_events
        WHERE user_id = ${String(userId)}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      latestEvent = evRows[0] || null;
    } catch {
      latestEvent = null;
    }

    return NextResponse.json({
      applications,
      pipeline,
      pdfs,
      stats: stats[0] || { total: 0, applied: 0, interviews: 0, offers: 0 },
      profile,
      meta: {
        jobsTotal: jobMeta.jobs_total ?? 0,
        jobsRanked: jobMeta.jobs_ranked ?? 0,
        lastJobCreatedAt: jobMeta.last_job_created_at ?? null,
        lastJobUpdatedAt: jobMeta.last_job_updated_at ?? null,
        lastBackgroundEventId: latestEvent?.id ?? null,
        lastBackgroundActionScript: latestEvent?.action_script ?? null,
        lastBackgroundStatus: latestEvent?.status ?? null,
        lastBackgroundCompletedAt: latestEvent?.created_at ?? null,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
