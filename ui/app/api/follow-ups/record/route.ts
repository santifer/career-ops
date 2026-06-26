import { NextRequest, NextResponse } from 'next/server';
import { recordFollowup } from '@/lib/followups-history';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: {
    appNumber?: number;
    date?: string;
    company?: string;
    role?: string;
    channel?: 'Email' | 'LinkedIn' | 'Other';
    contact?: string;
    notes?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const appNumber = Number(body.appNumber);
  if (!Number.isFinite(appNumber) || appNumber <= 0) {
    return NextResponse.json({ error: 'appNumber is required' }, { status: 400 });
  }
  if (!body.company || !body.role) {
    return NextResponse.json({ error: 'company and role are required' }, { status: 400 });
  }
  const date = body.date ?? new Date().toISOString().slice(0, 10);
  const channel = body.channel ?? 'Email';

  try {
    const record = await recordFollowup({
      appNumber,
      date,
      company: body.company,
      role: body.role,
      channel,
      contact: body.contact ?? '',
      notes: body.notes ?? '',
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  const { getFollowupHistory } = await import('@/lib/followups-history');
  return NextResponse.json(getFollowupHistory());
}
