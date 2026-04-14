import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listConversations, createConversation } from "@/lib/db/queries/conversations";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const convos = await listConversations(session.userId);
  return NextResponse.json(convos);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const convo = await createConversation(session.userId, body.title, body.mode);
  return NextResponse.json(convo, { status: 201 });
}
