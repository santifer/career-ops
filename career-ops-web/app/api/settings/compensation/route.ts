import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getFullProfile,
  updateCompensation,
} from "@/lib/db/queries/settings";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getFullProfile(session.userId);
  if (!profile)
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  return NextResponse.json(profile.compensationTargets);
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getFullProfile(session.userId);
  if (!profile)
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const body = await req.json();

  const data: {
    currency?: string;
    targetMin?: number | null;
    targetMax?: number | null;
    minimum?: number | null;
  } = {};

  if ("currency" in body) data.currency = body.currency;
  if ("targetMin" in body)
    data.targetMin = body.targetMin !== null ? Number(body.targetMin) : null;
  if ("targetMax" in body)
    data.targetMax = body.targetMax !== null ? Number(body.targetMax) : null;
  if ("minimum" in body)
    data.minimum = body.minimum !== null ? Number(body.minimum) : null;

  const updated = await updateCompensation(profile.id, data);
  return NextResponse.json(updated);
}
