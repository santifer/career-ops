import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { generateVerificationToken } from '@/lib/tokens';
import { sendVerificationEmail } from '@/lib/mail';
import { rateLimit } from '@/lib/rate-limit';

// Lead Engineer Note: Enforcing a strict schema for the registration payload
const RegistrationSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters")
});

export async function POST(req: Request) {
  try {
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const rl = rateLimit(`register:${clientIp}`, { windowMs: 60_000, max: 8 });
    if (!rl.ok) {
      return NextResponse.json({ error: `Too many attempts. Try again in ${rl.retryAfterSec}s.` }, { status: 429 });
    }

    // 0. Vital Infrastructure Check
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: "DATABASE_URL is missing in environment variables. Critical infrastructure setup required." }, { status: 500 });
    }

    const body = await req.json();
    
    // 1. Validate incoming data
    const validation = RegistrationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ 
        error: validation.error.issues[0].message 
      }, { status: 400 });
    }

    const { name, email, password } = validation.data;

    // 2. Lead Engineer Schema Guard: Ensure tables exist
    // This prevents 500 errors if the DB is fresh
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS user_profiles (
          id SERIAL PRIMARY KEY,
          user_id INTEGER UNIQUE,
          resume_context JSONB DEFAULT '{}',
          targeting_keywords JSONB DEFAULT '{"positive": [], "negative": []}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `;
    } catch (schemaError) {
       console.error('Schema Sync Warning:', schemaError);
       // We continue as the table might already exist but we lack permissions to 'CREATE'
    }

    // 3. Check if user already exists
    const existingUser = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
    if (existingUser.length > 0) {
      return NextResponse.json({ error: 'User with this identity record already exists.' }, { status: 400 });
    }

    // 4. Hash password with lead engineer grade security
    const hashedPassword = await bcrypt.hash(password, 12);

    // 5. Create User in DB (Unverified)
    const [user] = await sql`
      INSERT INTO users (name, email, password)
      VALUES (${name}, ${email}, ${hashedPassword})
      RETURNING id, name, email
    `;

    // 6. Initialize User Profile for Onboarding
    await sql`
      INSERT INTO user_profiles (user_id, resume_context, targeting_keywords)
      VALUES (${user.id}, ${sql.json({})}, ${sql.json({ positive: [], negative: [] })})
      ON CONFLICT (user_id) DO NOTHING
    `;

    // 7. Generate and Send OTP
    const verificationToken = await generateVerificationToken(email);
    
    try {
      await sendVerificationEmail(email, verificationToken.token);
    } catch (mailError) {
      console.error('Email Gateway Congestion:', mailError);
    }

    return NextResponse.json({ 
      success: true, 
      user: { id: user.id, name: user.name, email: user.email },
      message: "Verification sequence initialized"
    });

  } catch (error: any) {
    console.error('CRITICAL: Registration Breakdown:', error);
    // Lead Engineer: Ensure we ALWAYS return JSON, even in catastrophic failure.
    return NextResponse.json({ 
      error: `Infrastructure Error: ${error.message || 'Unknown breakdown'}. Please verify your DATABASE_URL connectivity.` 
    }, { status: 500 });
  }
}
