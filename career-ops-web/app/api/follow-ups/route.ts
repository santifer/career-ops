import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getFollowUps, createFollowUp } from "@/lib/db/queries/follow-ups";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await getFollowUps(session.userId);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (!body.applicationId || !body.channel) {
    return NextResponse.json(
      { error: "applicationId and channel are required" },
      { status: 400 },
    );
  }

  const row = await createFollowUp({
    applicationId: body.applicationId,
    roundNumber: body.roundNumber ?? 1,
    sentAt: body.sentAt ? new Date(body.sentAt) : new Date(),
    channel: body.channel,
    messageSummary: body.messageSummary,
    nextDueAt: body.nextDueAt ? new Date(body.nextDueAt) : undefined,
  });

  return NextResponse.json(row, { status: 201 });
}
