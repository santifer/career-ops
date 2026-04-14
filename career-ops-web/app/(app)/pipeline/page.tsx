import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listPipelineEntries } from "@/lib/db/queries/pipeline";
import { AddUrlForm } from "@/components/pipeline/add-url-form";
import { UrlList } from "@/components/pipeline/url-list";

export default async function PipelinePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const entries = await listPipelineEntries(user.id);
  const pending = entries.filter((e) => e.status === "pending").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-800">Pipeline</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          {entries.length} URL{entries.length !== 1 ? "s" : ""} total
          {pending > 0 && ` · ${pending} pending evaluation`}
        </p>
      </div>
      <AddUrlForm />
      <UrlList entries={entries} />
    </div>
  );
}
