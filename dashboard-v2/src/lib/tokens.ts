import sql from '@/lib/db';
import crypto from 'crypto';

export const generateVerificationToken = async (identifier: string) => {
  // 1. Generate a 6-digit numeric token
  const token = crypto.randomInt(100000, 999999).toString();
  
  // 2. Set expiry (15 minutes from now)
  const expires = new Date(new Date().getTime() + 15 * 60 * 1000);

  // 3. Clear existing tokens for this identifier
  await sql`DELETE FROM verification_tokens WHERE identifier = ${identifier}`;

  // 4. Store new token
  const [verificationToken] = await sql`
    INSERT INTO verification_tokens (identifier, token, expires)
    VALUES (${identifier}, ${token}, ${expires})
    RETURNING *
  `;

  return verificationToken;
};
