import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { applications, pipelineEntries, followUps } from "@/lib/db/schema";
import { eq, and, count, avg, lt, isNotNull } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.userId;

  const [totalResult] = await db
    .select({ count: count() })
    .from(applications)
    .where(eq(applications.userId, userId));

  const statusCounts = await db
    .select({
      status: applications.status,
      count: count(),
    })
    .from(applications)
    .where(eq(applications.userId, userId))
    .groupBy(applications.status);

  const [avgResult] = await db
    .select({ avg: avg(applications.score) })
    .from(applications)
    .where(eq(applications.userId, userId));

  const [pipelineResult] = await db
    .select({ count: count() })
    .from(pipelineEntries)
    .where(
      and(
        eq(pipelineEntries.userId, userId),
        eq(pipelineEntries.status, "pending"),
      ),
    );

  const [overdueResult] = await db
    .select({ count: count() })
    .from(followUps)
    .innerJoin(applications, eq(followUps.applicationId, applications.id))
    .where(
      and(
        eq(applications.userId, userId),
        lt(followUps.nextDueAt, new Date()),
        isNotNull(followUps.nextDueAt),
      ),
    );

  const statusMap: Record<string, number> = {};
  for (const row of statusCounts) {
    statusMap[row.status] = row.count;
  }

  return NextResponse.json({
    total: totalResult.count,
    interviews: statusMap["Interview"] || 0,
    avgScore: avgResult.avg ? parseFloat(avgResult.avg).toFixed(1) : null,
    pipeline: pipelineResult.count,
    overdueFollowUps: overdueResult.count,
    funnel: {
      evaluated: statusMap["Evaluated"] || 0,
      applied: statusMap["Applied"] || 0,
      responded: statusMap["Responded"] || 0,
      interview: statusMap["Interview"] || 0,
      offer: statusMap["Offer"] || 0,
      rejected: statusMap["Rejected"] || 0,
    },
  });
}
