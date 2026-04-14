import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getPortalConfig,
  upsertPortalConfig,
} from "@/lib/db/queries/scanner";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await getPortalConfig(session.userId);
  return NextResponse.json(config);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const config = await upsertPortalConfig(session.userId, {
    titleFiltersPositive: body.titleFiltersPositive,
    titleFiltersNegative: body.titleFiltersNegative,
    seniorityBoost: body.seniorityBoost,
  });

  return NextResponse.json(config);
}
