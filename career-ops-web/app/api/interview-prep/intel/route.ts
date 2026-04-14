import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getInterviewIntel } from "@/lib/db/queries/interview-prep";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await getInterviewIntel(session.userId);
  return NextResponse.json(rows);
}
