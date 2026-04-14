import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  CANONICAL_STATUSES,
  reorderApplication,
} from "@/lib/db/queries/applications";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  if (
    !body.status ||
    !CANONICAL_STATUSES.includes(body.status as (typeof CANONICAL_STATUSES)[number])
  ) {
    return NextResponse.json(
      {
        error: `Invalid status. Must be one of: ${CANONICAL_STATUSES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const row = await reorderApplication(id, session.userId, body.status);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}
