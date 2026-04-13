import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { applications, pipelineEntries, followUps } from "@/lib/db/schema";
import { eq, and, count, avg, lt, isNotNull } from "drizzle-orm";
import { StatCards } from "@/components/home/stat-cards";
import { FunnelChart } from "@/components/home/funnel-chart";
import { NeedsAttention } from "@/components/home/needs-attention";

async function getStats(userId: string) {
  const [totalResult] = await db
    .select({ count: count() })
    .from(applications)
    .where(eq(applications.userId, userId));

  const statusCounts = await db
    .select({ status: applications.status, count: count() })
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

  return {
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
    },
  };
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const stats = await getStats(user.id);

  const greeting = getGreeting();
  const displayName = user.name || user.email.split("@")[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-800">
          {greeting}, {displayName}
        </h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <StatCards
        total={stats.total}
        interviews={stats.interviews}
        avgScore={stats.avgScore}
        pipeline={stats.pipeline}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FunnelChart funnel={stats.funnel} />
        <NeedsAttention
          overdueFollowUps={stats.overdueFollowUps}
          pipeline={stats.pipeline}
        />
      </div>
    </div>
  );
}
