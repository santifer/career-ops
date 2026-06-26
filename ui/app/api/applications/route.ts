import { NextRequest, NextResponse } from 'next/server';
import { getPipeline, getCareerOpsRoot } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const filters = {
    status: url.searchParams.get('status'),
    search: url.searchParams.get('q'),
    minScore: url.searchParams.has('minScore') ? Number(url.searchParams.get('minScore')) : null,
    maxScore: url.searchParams.has('maxScore') ? Number(url.searchParams.get('maxScore')) : null,
    sort: (url.searchParams.get('sort') as 'date' | 'score' | 'company' | 'status' | null) ?? 'date',
    order: (url.searchParams.get('order') as 'asc' | 'desc' | null) ?? 'desc',
    limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 500,
    offset: url.searchParams.has('offset') ? Number(url.searchParams.get('offset')) : 0,
  };
  const data = getPipeline(filters);
  return NextResponse.json(data);
}

export async function HEAD() {
  const root = getCareerOpsRoot();
  return NextResponse.json({ ok: true, root });
}
