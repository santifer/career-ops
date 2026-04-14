import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listReports } from "@/lib/db/queries/reports";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search") ?? undefined;
  const limit = searchParams.get("limit")
    ? Number(searchParams.get("limit"))
    : undefined;
  const offset = searchParams.get("offset")
    ? Number(searchParams.get("offset"))
    : undefined;

  const result = await listReports(session.userId, { search, limit, offset });
  return NextResponse.json(result);
}
