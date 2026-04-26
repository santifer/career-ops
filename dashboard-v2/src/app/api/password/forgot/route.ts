import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { generateVerificationToken } from '@/lib/tokens';
import { sendPasswordResetEmail } from '@/lib/mail';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  try {
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const rl = rateLimit(`forgot-password:${clientIp}`, { windowMs: 60_000, max: 6 });
    if (!rl.ok) {
      return NextResponse.json({ error: `Too many attempts. Try again in ${rl.retryAfterSec}s.` }, { status: 429 });
    }

    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    const users = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
    if (users.length === 0) {
      return NextResponse.json({ success: true, message: 'If this email exists, reset instructions were sent.' });
    }

    const tokenRow = await generateVerificationToken(`reset:${email}`);
    await sendPasswordResetEmail(email, tokenRow.token);

    return NextResponse.json({ success: true, message: 'Reset code sent.' });
  } catch (error) {
    console.error('Forgot password API error:', error);
    return NextResponse.json({ error: 'Failed to send reset code' }, { status: 500 });
  }
}
