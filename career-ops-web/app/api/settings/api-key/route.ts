import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateApiKey } from "@/lib/db/queries/settings";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (!body.apiKey || typeof body.apiKey !== "string") {
    return NextResponse.json(
      { error: "apiKey is required" },
      { status: 400 },
    );
  }

  // In production, encrypt the key before storing.
  // For now, store as-is (placeholder for real encryption).
  const encrypted = body.apiKey;

  await updateApiKey(session.userId, encrypted);
  return NextResponse.json({ success: true });
}
