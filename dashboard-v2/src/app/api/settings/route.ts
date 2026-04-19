import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { auth } from '@/auth';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const profileRow = await sql`
      SELECT resume_context, targeting_keywords, openai_key, hf_token 
      FROM user_profiles 
      WHERE user_id = ${userId}
    `;

    return NextResponse.json(profileRow[0] || { 
      resume_context: {}, 
      targeting_keywords: { positive: [], negative: [] }
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

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Settings API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
