import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getReport, listReports } from "@/lib/db/queries/reports";
import { ReportList } from "@/components/reports/report-list";
import { ReportReader } from "@/components/reports/report-reader";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const report = await getReport(id, user.id);
  if (!report) notFound();

  const { reports: allReports } = await listReports(user.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-800">Reports</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Viewing report #{report.number}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <div className="hidden lg:block card-surface max-h-[calc(100vh-12rem)] overflow-hidden">
          <ReportList reports={allReports} activeId={id} />
        </div>
        <div>
          <ReportReader report={report} />
        </div>
      </div>
    </div>
  );
}
