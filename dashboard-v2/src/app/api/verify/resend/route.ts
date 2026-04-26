import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { generateVerificationToken } from '@/lib/tokens';
import { sendVerificationEmail } from '@/lib/mail';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  try {
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const rl = rateLimit(`verify-resend:${clientIp}`, { windowMs: 60_000, max: 6 });
    if (!rl.ok) {
      return NextResponse.json({ error: `Too many attempts. Try again in ${rl.retryAfterSec}s.` }, { status: 429 });
    }

    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    const users = await sql`
      SELECT id, email_verified
      FROM users
      WHERE email = ${email}
      LIMIT 1
    `;

    if (users.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (users[0].email_verified) {
      return NextResponse.json({ error: 'Email is already verified' }, { status: 400 });
    }

    const verificationToken = await generateVerificationToken(email);
    await sendVerificationEmail(email, verificationToken.token);

    return NextResponse.json({ success: true, message: 'Verification code sent' });
  } catch (error) {
    console.error('Resend verification API error:', error);
    return NextResponse.json({ error: 'Failed to resend verification code' }, { status: 500 });
  }
}
