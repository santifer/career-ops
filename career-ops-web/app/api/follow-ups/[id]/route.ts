import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { markFollowUpSent } from "@/lib/db/queries/follow-ups";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const sentAt = body.sentAt ? new Date(body.sentAt) : new Date();

  const row = await markFollowUpSent(id, sentAt);
  if (!row)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(row);
}
