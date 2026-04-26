import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import bcrypt from 'bcryptjs';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  try {
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const rl = rateLimit(`reset-password:${clientIp}`, { windowMs: 60_000, max: 8 });
    if (!rl.ok) {
      return NextResponse.json({ error: `Too many attempts. Try again in ${rl.retryAfterSec}s.` }, { status: 429 });
    }

    const { email, token, password } = await req.json();
    if (!email || !token || !password) {
      return NextResponse.json({ error: 'Email, token and password are required' }, { status: 400 });
    }
    if (String(password).length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const identifier = `reset:${email}`;
    const [verificationToken] = await sql`
      SELECT * FROM verification_tokens
      WHERE identifier = ${identifier} AND token = ${token}
      LIMIT 1
    `;

    if (!verificationToken) {
      return NextResponse.json({ error: 'Invalid reset code' }, { status: 400 });
    }

    const hasExpired = new Date(verificationToken.expires) < new Date();
    if (hasExpired) {
      await sql`DELETE FROM verification_tokens WHERE id = ${verificationToken.id}`;
      return NextResponse.json({ error: 'Reset code has expired' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await sql`UPDATE users SET password = ${hashedPassword} WHERE email = ${email}`;
    await sql`DELETE FROM verification_tokens WHERE id = ${verificationToken.id}`;

    return NextResponse.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password API error:', error);
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}
