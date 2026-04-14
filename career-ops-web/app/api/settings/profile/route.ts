import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getFullProfile, updateProfile } from "@/lib/db/queries/settings";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getFullProfile(session.userId);
  if (!profile)
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  return NextResponse.json(profile);
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const allowedFields = [
    "fullName",
    "email",
    "phone",
    "location",
    "timezone",
    "linkedin",
    "portfolioUrl",
    "github",
    "headline",
    "exitStory",
    "superpowers",
    "dealBreakers",
    "bestAchievement",
    "preferredLanguage",
  ];

  const data: Record<string, string> = {};
  for (const key of allowedFields) {
    if (key in body) {
      data[key] = body[key];
    }
  }

  const updated = await updateProfile(session.userId, data);
  if (!updated)
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  return NextResponse.json(updated);
}
