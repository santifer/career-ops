import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getApplicationStats,
  getAiUsageStats,
  getWeeklyTrend,
} from "@/lib/db/queries/analytics";
import { FunnelBars } from "@/components/analytics/funnel-bars";
import { ScoreDistribution } from "@/components/analytics/score-distribution";
import { AiUsageCard } from "@/components/analytics/ai-usage-card";
import { WeeklyActivity } from "@/components/analytics/weekly-activity";
import { ChartBarIcon } from "@heroicons/react/24/outline";

export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [appStats, aiUsage, weekly] = await Promise.all([
    getApplicationStats(user.id),
    getAiUsageStats(user.id),
    getWeeklyTrend(user.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-800 flex items-center gap-2">
          <ChartBarIcon className="h-5 w-5" />
          Analytics
        </h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Application patterns, score distribution, and AI usage.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FunnelBars
          byStatus={appStats.byStatus}
          total={appStats.total}
          avgScore={appStats.avgScore}
        />
        <ScoreDistribution buckets={appStats.scoreDistribution} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AiUsageCard usage={aiUsage} />
        <WeeklyActivity weeks={weekly} />
      </div>
    </div>
  );
}
