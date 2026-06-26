import { NextRequest, NextResponse } from 'next/server';
import { getApplication } from '@/lib/pipeline';
import { updateStatus, updateNotes } from '@/lib/writer';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { num: string } }) {
  const num = Number.parseInt(params.num, 10);
  if (!Number.isFinite(num)) return NextResponse.json({ error: 'Invalid number' }, { status: 400 });
  const app = getApplication(num);
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(app);
}

export async function PATCH(req: NextRequest, { params }: { params: { num: string } }) {
  const num = Number.parseInt(params.num, 10);
  if (!Number.isFinite(num)) return NextResponse.json({ error: 'Invalid number' }, { status: 400 });
  let body: { status?: string; notes?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    let app = null;
    if (typeof body.status === 'string') {
      app = await updateStatus(process.env.CAREER_OPS_ROOT || '', num, body.status);
    }
    if (typeof body.notes === 'string') {
      app = await updateNotes(process.env.CAREER_OPS_ROOT || '', num, body.notes);
    }
    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(app);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
