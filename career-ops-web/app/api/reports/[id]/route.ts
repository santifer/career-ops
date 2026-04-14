import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getReport } from "@/lib/db/queries/reports";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const row = await getReport(id, session.userId);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}
