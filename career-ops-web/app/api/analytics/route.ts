import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getApplicationStats,
  getAiUsageStats,
  getWeeklyTrend,
} from "@/lib/db/queries/analytics";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [appStats, aiUsage, weekly] = await Promise.all([
    getApplicationStats(session.userId),
    getAiUsageStats(session.userId),
    getWeeklyTrend(session.userId),
  ]);

  return NextResponse.json({ appStats, aiUsage, weekly });
}
