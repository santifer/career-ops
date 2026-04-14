import crypto from "crypto";
import { db } from "@/lib/db";
import { magicLinks, users, profiles, subscriptions } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export function generateToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export async function sendMagicLink(email: string): Promise<void> {
  let user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });

  if (!user) {
    const [newUser] = await db
      .insert(users)
      .values({ email: email.toLowerCase() })
      .returning();
    user = newUser;

    await db.insert(profiles).values({ userId: user.id });
    await db.insert(subscriptions).values({ userId: user.id });
  }

  // Invalidate previous unused links
  await db
    .update(magicLinks)
    .set({ usedAt: new Date() })
    .where(and(eq(magicLinks.userId, user.id), isNull(magicLinks.usedAt)));

  const { raw, hash } = generateToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(magicLinks).values({
    userId: user.id,
    tokenHash: hash,
    expiresAt,
  });

  const link = `${process.env.MAGIC_LINK_BASE_URL}/verify?token=${raw}`;

  await resend.emails.send({
    from: process.env.EMAIL_FROM || "Career-Ops <noreply@career-ops.com>",
    to: email,
    subject: "Sign in to Career-Ops",
    html: `
      <div style="font-family: Inter, system-ui, sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; color: #262626; letter-spacing: -0.31px; margin-bottom: 8px;">Career-Ops</h1>
        <p style="color: #737373; font-size: 14px; margin-bottom: 24px;">Click the link below to sign in. It expires in 15 minutes.</p>
        <a href="${link}" style="display: inline-block; background: #262626; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">Sign in to Career-Ops</a>
        <p style="color: #a3a3a3; font-size: 12px; margin-top: 24px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

export async function verifyMagicLink(
  token: string,
): Promise<{ userId: string; isNewUser: boolean } | null> {
  const hash = crypto.createHash("sha256").update(token).digest("hex");

  const link = await db.query.magicLinks.findFirst({
    where: and(
      eq(magicLinks.tokenHash, hash),
      isNull(magicLinks.usedAt),
    ),
  });

  if (!link) return null;
  if (new Date() > link.expiresAt) return null;

  await db
    .update(magicLinks)
    .set({ usedAt: new Date() })
    .where(eq(magicLinks.id, link.id));

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, link.userId!),
  });

  const isNewUser = !profile?.onboardingCompleted;

  return { userId: link.userId!, isNewUser };
}
