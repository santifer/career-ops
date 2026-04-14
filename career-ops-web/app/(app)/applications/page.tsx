import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listApplications } from "@/lib/db/queries/applications";
import { KanbanBoard } from "@/components/applications/kanban-board";

export default async function ApplicationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const applications = await listApplications(user.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-800">Applications</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {applications.length} application{applications.length !== 1 ? "s" : ""} tracked
          </p>
        </div>
      </div>
      <KanbanBoard applications={applications} />
    </div>
  );
}
