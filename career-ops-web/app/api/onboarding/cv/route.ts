import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { cvMarkdown } = await req.json();

  await db
    .update(profiles)
    .set({ cvMarkdown, updatedAt: new Date() })
    .where(eq(profiles.userId, session.userId));

  return NextResponse.json({ success: true });
}
