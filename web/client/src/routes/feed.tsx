import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useJobs, useDismissJob, useSendToPipeline } from "@/lib/queries";
import { JobCard } from "@/components/feed/job-card";
import { FeedFilters } from "@/components/feed/feed-filters";

export const Route = createFileRoute("/feed")({ component: FeedPage });

function FeedPage() {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const params: Record<string, string> = { status: "new" };
  if (search) params.search = search;
  if (sourceFilter) params.sourceId = sourceFilter;
  const { data, isLoading } = useJobs(params);
  const dismiss = useDismissJob();
  const sendToPipeline = useSendToPipeline();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Job Feed</h1>
        <span className="text-sm text-muted-foreground">{data?.total || 0} new jobs</span>
      </div>
      <FeedFilters search={search} onSearchChange={setSearch} sourceFilter={sourceFilter} onSourceFilterChange={setSourceFilter} />
      {isLoading ? (
        <div className="text-muted-foreground py-8 text-center">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.data.map((job) => (
            <JobCard key={job.id} job={job} onSendToPipeline={(id) => sendToPipeline.mutate(id)} onDismiss={(id) => dismiss.mutate(id)} />
          ))}
          {data?.data.length === 0 && (
            <div className="col-span-full text-center py-8 text-muted-foreground">No new jobs. Run a scan to discover more.</div>
          )}
        </div>
      )}
    </div>
  );
}
