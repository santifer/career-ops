import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { auth } from '@/auth';
import bcrypt from 'bcryptjs';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // Get profile data
    const profileRow = await sql`
      SELECT resume_context, targeting_keywords, openai_key, hf_token 
      FROM user_profiles 
      WHERE user_id = ${userId}
    `;

    // Get user core data (email)
    const userRow = await sql`
      SELECT email FROM users WHERE id = ${userId}
    `;

    return NextResponse.json({
      ...(profileRow[0] || { 
        resume_context: {}, 
        targeting_keywords: { positive: [], negative: [] }
      }),
      email: userRow[0]?.email
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const data = await req.json();

    const resumeContext = data.resume_context || {};
    const targetingKeywords = data.targeting_keywords || { positive: [], negative: [] };
    const openaiKey = data.openai_key || null;
    const hfToken = data.hf_token || null;

    // 1. Update Profile (JSON fields)
    await sql`
      INSERT INTO user_profiles (user_id, resume_context, targeting_keywords, openai_key, hf_token)
      VALUES (${userId}, ${sql.json(resumeContext)}, ${sql.json(targetingKeywords)}, ${openaiKey}, ${hfToken})
      ON CONFLICT (user_id) DO UPDATE SET 
        resume_context = EXCLUDED.resume_context,
        targeting_keywords = EXCLUDED.targeting_keywords,
        openai_key = EXCLUDED.openai_key,
        hf_token = EXCLUDED.hf_token,
        updated_at = CURRENT_TIMESTAMP
    `;

    // 2. Update Core Account Info (Email/Password)
    if (data.email) {
      await sql`UPDATE users SET email = ${data.email} WHERE id = ${userId}`;
    }

    if (data.password) {
      const hashedPassword = await bcrypt.hash(data.password, 10);
      await sql`UPDATE users SET password = ${hashedPassword} WHERE id = ${userId}`;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Settings API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
