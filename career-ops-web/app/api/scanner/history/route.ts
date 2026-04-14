import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getScanHistory } from "@/lib/db/queries/scanner";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);

  const history = await getScanHistory(session.userId, limit);
  return NextResponse.json(history);
}
