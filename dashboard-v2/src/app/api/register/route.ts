import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { generateVerificationToken } from '@/lib/tokens';
import { sendVerificationEmail } from '@/lib/mail';

// Lead Engineer Note: Enforcing a strict schema for the registration payload
const RegistrationSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters")
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // 1. Validate incoming data
    const validation = RegistrationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ 
        error: validation.error.issues[0].message 
      }, { status: 400 });
    }

    const { name, email, password } = validation.data;

    // 2. Check if user already exists
    const existingUser = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
    if (existingUser.length > 0) {
      return NextResponse.json({ error: 'User with this identity record already exists.' }, { status: 400 });
    }

    // 3. Hash password
    const hashedPassword = await bcrypt.hash(password, 12); // Slightly higher rounds for lead engineer grade security

    // 4. Create User in DB (Unverified)
    const [user] = await sql`
      INSERT INTO users (name, email, password)
      VALUES (${name}, ${email}, ${hashedPassword})
      RETURNING id, name, email
    `;

    // 5. Initialize User Profile for Onboarding
    await sql`
      INSERT INTO user_profiles (user_id, resume_context, targeting_keywords)
      VALUES (${user.id}, ${sql.json({})}, ${sql.json({ positive: [], negative: [] })})
      ON CONFLICT (user_id) DO NOTHING
    `;

    // 6. Generate and Send OTP
    const verificationToken = await generateVerificationToken(email);
    
    // We attempt to send, but we don't crash if the email gateway is temporarily congested.
    // The user can always "Resend" from the verify page.
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
      error: "Infrastructure communication breakdown. Please check your DATABASE_URL connectivity." 
    }, { status: 500 });
  }
}
