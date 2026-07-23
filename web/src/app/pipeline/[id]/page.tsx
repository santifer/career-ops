import { notFound } from "next/navigation";
import { readReport, findApplication, trackerCanDelete } from "@/lib/career-ops";
import { reportNumFromCell } from "@/lib/format";
import { ReportView } from "@/components/report-view";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = findApplication(id);
  const reportId = app ? (reportNumFromCell(app.report) ?? id) : id;
  const report = readReport(reportId);
  if (!app && !report) notFound();
  return <ReportView id={id} app={app} report={report?.content ?? null} file={report?.file ?? null} canDelete={trackerCanDelete()} />;
}
