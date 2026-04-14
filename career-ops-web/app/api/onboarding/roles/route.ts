import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { profiles, targetRoles, compensationTargets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roles, currency, salaryMin, salaryMax } = await req.json();

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, session.userId),
  });

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Insert target roles
  if (roles && Array.isArray(roles) && roles.length > 0) {
    const values = roles.map((title: string, i: number) => ({
      profileId: profile.id,
      title,
      isPrimary: i === 0,
    }));
    await db.insert(targetRoles).values(values);
  }

  // Insert compensation targets
  if (currency || salaryMin || salaryMax) {
    const existing = await db.query.compensationTargets.findFirst({
      where: eq(compensationTargets.profileId, profile.id),
    });

    if (existing) {
      await db
        .update(compensationTargets)
        .set({
          currency: currency || "USD",
          targetMin: salaryMin ?? null,
          targetMax: salaryMax ?? null,
        })
        .where(eq(compensationTargets.profileId, profile.id));
    } else {
      await db.insert(compensationTargets).values({
        profileId: profile.id,
        currency: currency || "USD",
        targetMin: salaryMin ?? null,
        targetMax: salaryMax ?? null,
      });
    }
  }

  return NextResponse.json({ success: true });
}
