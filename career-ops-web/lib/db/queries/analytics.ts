import { db } from "@/lib/db";
import { applications, aiUsageLogs } from "@/lib/db/schema";
import { eq, sql, desc, gte } from "drizzle-orm";

export interface StatusCount {
  status: string;
  count: number;
}

export interface ScoreBucket {
  bucket: string;
  count: number;
}

export interface ApplicationStats {
  total: number;
  byStatus: StatusCount[];
  avgScore: number | null;
  scoreDistribution: ScoreBucket[];
}

export interface ActionTypeUsage {
  actionType: string;
  count: number;
  totalTokens: number;
  totalCost: number;
}

export interface AiUsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  byActionType: ActionTypeUsage[];
}

export interface WeeklyPoint {
  week: string;
  count: number;
}

export async function getApplicationStats(
  userId: string,
): Promise<ApplicationStats> {
  const byStatus = await db
    .select({
      status: applications.status,
      count: sql<number>`count(*)::int`,
    })
    .from(applications)
    .where(eq(applications.userId, userId))
    .groupBy(applications.status);

  const total = byStatus.reduce((sum, r) => sum + r.count, 0);

  const [avgRow] = await db
    .select({
      avg: sql<number>`avg(${applications.score}::numeric)`,
    })
    .from(applications)
    .where(eq(applications.userId, userId));

  const avgScore = avgRow?.avg ? Math.round(avgRow.avg * 10) / 10 : null;

  const scoreDist = await db
    .select({
      bucket: sql<string>`
        CASE
          WHEN ${applications.score}::numeric < 2 THEN '0-2'
          WHEN ${applications.score}::numeric < 3 THEN '2-3'
          WHEN ${applications.score}::numeric < 4 THEN '3-4'
          ELSE '4-5'
        END
      `,
      count: sql<number>`count(*)::int`,
    })
    .from(applications)
    .where(eq(applications.userId, userId))
    .groupBy(
      sql`CASE
        WHEN ${applications.score}::numeric < 2 THEN '0-2'
        WHEN ${applications.score}::numeric < 3 THEN '2-3'
        WHEN ${applications.score}::numeric < 4 THEN '3-4'
        ELSE '4-5'
      END`,
    );

  return {
    total,
    byStatus,
    avgScore,
    scoreDistribution: scoreDist,
  };
}

export async function getAiUsageStats(userId: string): Promise<AiUsageStats> {
  const [totals] = await db
    .select({
      totalInput: sql<number>`coalesce(sum(${aiUsageLogs.inputTokens}), 0)::int`,
      totalOutput: sql<number>`coalesce(sum(${aiUsageLogs.outputTokens}), 0)::int`,
      totalCost: sql<number>`coalesce(sum(${aiUsageLogs.costUsd}::numeric), 0)::numeric`,
    })
    .from(aiUsageLogs)
    .where(eq(aiUsageLogs.userId, userId));

  const byActionType = await db
    .select({
      actionType: aiUsageLogs.actionType,
      count: sql<number>`count(*)::int`,
      totalTokens: sql<number>`(coalesce(sum(${aiUsageLogs.inputTokens}), 0) + coalesce(sum(${aiUsageLogs.outputTokens}), 0))::int`,
      totalCost: sql<number>`coalesce(sum(${aiUsageLogs.costUsd}::numeric), 0)::numeric`,
    })
    .from(aiUsageLogs)
    .where(eq(aiUsageLogs.userId, userId))
    .groupBy(aiUsageLogs.actionType);

  return {
    totalInputTokens: totals?.totalInput ?? 0,
    totalOutputTokens: totals?.totalOutput ?? 0,
    totalCost: Number(totals?.totalCost ?? 0),
    byActionType,
  };
}

export async function getWeeklyTrend(userId: string): Promise<WeeklyPoint[]> {
  const eightWeeksAgo = new Date();
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

  const rows = await db
    .select({
      week: sql<string>`to_char(date_trunc('week', ${applications.date}::date), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(applications)
    .where(
      eq(applications.userId, userId),
    )
    .groupBy(sql`date_trunc('week', ${applications.date}::date)`)
    .orderBy(sql`date_trunc('week', ${applications.date}::date)`)
    .limit(8);

  return rows;
}
