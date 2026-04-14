import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getConversation } from "@/lib/db/queries/conversations";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const convo = await getConversation(id, session.userId);
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(convo);
}
