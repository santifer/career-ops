import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await db
    .update(profiles)
    .set({ onboardingCompleted: true, updatedAt: new Date() })
    .where(eq(profiles.userId, session.userId));

  return NextResponse.json({ success: true });
}
