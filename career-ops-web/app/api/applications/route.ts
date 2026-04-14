import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  listApplications,
  createApplication,
} from "@/lib/db/queries/applications";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await listApplications(session.userId);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (!body.company || !body.role) {
    return NextResponse.json(
      { error: "company and role are required" },
      { status: 400 },
    );
  }

  const row = await createApplication(session.userId, body);
  return NextResponse.json(row, { status: 201 });
}
