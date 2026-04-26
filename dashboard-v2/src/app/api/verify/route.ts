import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  try {
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const rl = rateLimit(`verify:${clientIp}`, { windowMs: 60_000, max: 15 });
    if (!rl.ok) {
      return NextResponse.json({ error: `Too many attempts. Try again in ${rl.retryAfterSec}s.` }, { status: 429 });
    }

    const { email, token } = await req.json();

    if (!email || !token) {
      return NextResponse.json({ error: 'Missing email or token' }, { status: 400 });
    }

    // 1. Find the token
    const [verificationToken] = await sql`
      SELECT * FROM verification_tokens 
      WHERE identifier = ${email} AND token = ${token}
    `;

    if (!verificationToken) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    // 2. Check expiry
    const hasExpired = new Date(verificationToken.expires) < new Date();
    if (hasExpired) {
      await sql`DELETE FROM verification_tokens WHERE id = ${verificationToken.id}`;
      return NextResponse.json({ error: 'Verification code has expired' }, { status: 400 });
    }

    // 3. Update User
    await sql`
      UPDATE users 
      SET email_verified = CURRENT_TIMESTAMP 
      WHERE email = ${email}
    `;

    // 4. Cleanup
    await sql`DELETE FROM verification_tokens WHERE id = ${verificationToken.id}`;

    return NextResponse.json({ success: true, message: 'Email verified successfully' });

  } catch (error: any) {
    console.error('Verification API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
