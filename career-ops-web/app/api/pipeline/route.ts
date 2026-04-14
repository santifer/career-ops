import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  listPipelineEntries,
  addPipelineUrls,
} from "@/lib/db/queries/pipeline";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await listPipelineEntries(session.userId);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (!Array.isArray(body.urls) || body.urls.length === 0) {
    return NextResponse.json(
      { error: "urls must be a non-empty array" },
      { status: 400 },
    );
  }

  const invalid = body.urls.filter(
    (u: unknown) => typeof u !== "string" || !u.startsWith("http"),
  );
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: "All URLs must start with http", invalid },
      { status: 400 },
    );
  }

  const rows = await addPipelineUrls(session.userId, body.urls);
  return NextResponse.json(rows, { status: 201 });
}
