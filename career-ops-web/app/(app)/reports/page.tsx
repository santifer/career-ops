import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listReports } from "@/lib/db/queries/reports";
import { ReportList } from "@/components/reports/report-list";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { reports } = await listReports(user.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-800">Reports</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          {reports.length} evaluation report{reports.length !== 1 ? "s" : ""}
        </p>
      </div>

      {reports.length === 0 ? (
        <div className="card-surface text-center py-12">
          <p className="text-sm text-neutral-500">
            No evaluation reports yet. Evaluate a job offer in Chat to create your first report.
          </p>
        </div>
      ) : (
        <div className="card-surface">
          <ReportList reports={reports} />
        </div>
      )}
    </div>
  );
}
