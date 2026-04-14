import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getPortalConfig,
  upsertPortalConfig,
  addTrackedCompany,
} from "@/lib/db/queries/scanner";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (!body.name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 },
    );
  }

  // Ensure portal config exists
  let config = await getPortalConfig(session.userId);
  if (!config) {
    const created = await upsertPortalConfig(session.userId, {});
    config = { ...created, companies: [] };
  }

  const company = await addTrackedCompany(config.id, {
    name: body.name,
    careersUrl: body.careersUrl,
    apiUrl: body.apiUrl,
    scanQuery: body.scanQuery,
  });

  return NextResponse.json(company, { status: 201 });
}
