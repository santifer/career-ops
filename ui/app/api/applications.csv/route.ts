import { NextResponse } from 'next/server';
import { getPipeline, getCareerOpsRoot } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

export async function GET() {
  const root = getCareerOpsRoot();
  const { rows } = getPipeline({ limit: 10000, sort: 'date', order: 'desc' });
  const header = ['number', 'date', 'company', 'role', 'score', 'status', 'hasPdf', 'report', 'notes'];
  const lines = [header.join(',')];
  for (const a of rows) {
    const cells = [
      a.number,
      a.date,
      a.company,
      a.role,
      a.scoreRaw || (a.score != null ? `${a.score}/5` : ''),
      a.status,
      a.hasPdf ? 'yes' : 'no',
      a.reportPath ?? '',
      a.notes,
    ].map((c) => {
      const s = String(c ?? '').replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    });
    lines.push(cells.join(','));
  }
  return new NextResponse(lines.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="pipeline.csv"',
      'x-career-ops-root': root,
    },
  });
}
