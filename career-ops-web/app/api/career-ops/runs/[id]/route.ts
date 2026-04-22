import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getAgentRunDetail } from "@/lib/db/queries/agent-runs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const row = await getAgentRunDetail(session.userId, id);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}
