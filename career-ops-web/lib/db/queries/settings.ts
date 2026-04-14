import { db } from "@/lib/db";
import { profiles, compensationTargets, subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type ProfileRow = typeof profiles.$inferSelect;
export type CompensationRow = typeof compensationTargets.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;

export type ProfileWithCompensation = ProfileRow & {
  compensationTargets: CompensationRow | null;
};

export async function getFullProfile(
  userId: string,
): Promise<ProfileWithCompensation | null> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  });

  if (!profile) return null;

  const [comp] = await db
    .select()
    .from(compensationTargets)
    .where(eq(compensationTargets.profileId, profile.id))
    .limit(1);

  return { ...profile, compensationTargets: comp ?? null };
}

export async function updateProfile(
  userId: string,
  data: Partial<{
    fullName: string;
    email: string;
    phone: string;
    location: string;
    timezone: string;
    linkedin: string;
    portfolioUrl: string;
    github: string;
    headline: string;
    exitStory: string;
    superpowers: string;
    dealBreakers: string;
    bestAchievement: string;
    preferredLanguage: string;
  }>,
): Promise<ProfileRow | undefined> {
  const [row] = await db
    .update(profiles)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(profiles.userId, userId))
    .returning();

  return row;
}

export async function updateCompensation(
  profileId: string,
  data: {
    currency?: string;
    targetMin?: number | null;
    targetMax?: number | null;
    minimum?: number | null;
  },
): Promise<CompensationRow> {
  const existing = await db
    .select()
    .from(compensationTargets)
    .where(eq(compensationTargets.profileId, profileId))
    .limit(1);

  if (existing.length > 0) {
    const [row] = await db
      .update(compensationTargets)
      .set(data)
      .where(eq(compensationTargets.profileId, profileId))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(compensationTargets)
    .values({ profileId, ...data })
    .returning();
  return row;
}

export async function getSubscription(
  userId: string,
): Promise<SubscriptionRow | null> {
  const row = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
  });
  return row ?? null;
}

export async function updateApiKey(
  userId: string,
  encryptedKey: string,
): Promise<void> {
  await db
    .update(subscriptions)
    .set({ apiKeyEncrypted: encryptedKey, updatedAt: new Date() })
    .where(eq(subscriptions.userId, userId));
}
