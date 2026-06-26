import { NextRequest, NextResponse } from 'next/server';
import { getRegistry } from '@/lib/jobs/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const registry = getRegistry();
  const job = registry.get(params.id);
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(job);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const registry = getRegistry();
  const job = registry.get(params.id);
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (job.status !== 'running' && job.status !== 'queued') {
    return NextResponse.json({ error: `Job is ${job.status}; cannot cancel` }, { status: 400 });
  }
  const cancelled = registry.cancel(params.id);
  return NextResponse.json({ cancelled, job: registry.get(params.id) });
}
