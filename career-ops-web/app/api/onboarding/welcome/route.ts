import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();

  // Update user name
  if (name) {
    await db
      .update(users)
      .set({ name, updatedAt: new Date() })
      .where(eq(users.id, session.userId));
  }

  // Create profile if not exists
  const existing = await db.query.profiles.findFirst({
    where: eq(profiles.userId, session.userId),
  });

  if (!existing) {
    await db.insert(profiles).values({
      userId: session.userId,
      fullName: name || null,
    });
  } else if (name) {
    await db
      .update(profiles)
      .set({ fullName: name, updatedAt: new Date() })
      .where(eq(profiles.userId, session.userId));
  }

  return NextResponse.json({ success: true });
}
